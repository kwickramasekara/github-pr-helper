import * as vscode from "vscode";
import { PrTreeProvider, PrTreeItem } from "./views/prTreeProvider";
import { DescriptionPanel } from "./views/descriptionPanel";
import { GitHubCliService } from "./services/githubCliService";
import { GeminiService } from "./services/geminiService";
import { ConfigService } from "./services/configService";

// Git extension API types
interface GitExtension {
  getAPI(version: number): GitAPI;
}

interface GitAPI {
  onDidPublish: vscode.Event<PublishEvent>;
  repositories: Repository[];
}

interface Repository {
  rootUri: vscode.Uri;
}

interface PublishEvent {
  repository: Repository;
  branch?: string;
}

let ghService: GitHubCliService;
let geminiService: GeminiService;
let configService: ConfigService;
let prTreeProvider: PrTreeProvider;

export function activate(context: vscode.ExtensionContext): void {
  console.log("GitHub PR Helper is now active");

  // Initialize services
  configService = new ConfigService();
  ghService = new GitHubCliService();
  geminiService = new GeminiService(configService.geminiApiKey);

  // Update Gemini API key when settings change
  context.subscriptions.push(
    configService.onDidChangeConfiguration(() => {
      geminiService.setApiKey(configService.geminiApiKey);
    }),
  );

  // Register tree data provider
  prTreeProvider = new PrTreeProvider(ghService);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "githubPrHelper.prView",
      prTreeProvider,
    ),
  );

  // Register commands
  registerCommands(context);

  // Setup git push detection
  setupGitPushDetection(context);

  // Check gh CLI status and load initial state
  initialize();
}

/**
 * Initialize the extension
 */
async function initialize(): Promise<void> {
  const status = await ghService.isAuthenticated();

  if (!status.authenticated && status.error) {
    const action = await vscode.window.showErrorMessage(
      status.error,
      "Install GitHub CLI",
      "Run gh auth login",
    );

    if (action === "Install GitHub CLI") {
      vscode.env.openExternal(vscode.Uri.parse("https://cli.github.com/"));
    } else if (action === "Run gh auth login") {
      const terminal = vscode.window.createTerminal("GitHub CLI Auth");
      terminal.show();
      terminal.sendText("gh auth login");
    }
  } else {
    // Load PR details
    await prTreeProvider.refresh();
  }
}

/**
 * Register all extension commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
  // Create PR
  context.subscriptions.push(
    vscode.commands.registerCommand("githubPrHelper.createPr", async () => {
      await createPr();
    }),
  );

  // Refresh
  context.subscriptions.push(
    vscode.commands.registerCommand("githubPrHelper.refreshPr", async () => {
      await prTreeProvider.refresh();
    }),
  );

  // Open Settings
  context.subscriptions.push(
    vscode.commands.registerCommand("githubPrHelper.openSettings", async () => {
      await configService.openSettings();
    }),
  );

  // Mark Ready
  context.subscriptions.push(
    vscode.commands.registerCommand("githubPrHelper.markReady", async () => {
      try {
        await ghService.markReady();
        vscode.window.showInformationMessage("PR marked as ready for review!");
        await prTreeProvider.refresh();
      } catch (error) {
        showNotification(error instanceof Error ? error.message : "Failed");
      }
    }),
  );

  // Open in GitHub
  context.subscriptions.push(
    vscode.commands.registerCommand("githubPrHelper.openInGitHub", async () => {
      try {
        await ghService.openInBrowser();
      } catch (error) {
        showNotification(error instanceof Error ? error.message : "Failed");
      }
    }),
  );

  // Edit Title
  context.subscriptions.push(
    vscode.commands.registerCommand("githubPrHelper.editTitle", async () => {
      const pr = prTreeProvider.prDetails;
      if (!pr) return;

      const newTitle = await vscode.window.showInputBox({
        prompt: "Enter new PR title",
        value: pr.title,
        validateInput: (value) =>
          value.length > 0 ? null : "Title cannot be empty",
      });

      if (newTitle && newTitle !== pr.title) {
        try {
          await ghService.updatePr({ title: newTitle });
          vscode.window.showInformationMessage("Title updated!");
          await prTreeProvider.refresh();
        } catch (error) {
          showNotification(error instanceof Error ? error.message : "Failed");
        }
      }
    }),
  );

  // View/Edit Description
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "githubPrHelper.viewDescription",
      async () => {
        const pr = prTreeProvider.prDetails;
        if (!pr) return;

        DescriptionPanel.createOrShow(
          context.extensionUri,
          ghService,
          geminiService,
          configService,
          pr.body || "",
          () => prTreeProvider.refresh(),
        );
      },
    ),
  );

  // Add Reviewer
  context.subscriptions.push(
    vscode.commands.registerCommand("githubPrHelper.addReviewer", async () => {
      const reviewer = await vscode.window.showInputBox({
        prompt: "Enter GitHub username",
        placeHolder: "username",
      });

      if (reviewer) {
        try {
          await ghService.updatePr({ addReviewers: [reviewer] });
          vscode.window.showInformationMessage(
            `@${reviewer} added as reviewer!`,
          );
          await prTreeProvider.refresh();
        } catch (error) {
          showNotification(error instanceof Error ? error.message : "Failed");
        }
      }
    }),
  );

  // Remove Reviewer
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "githubPrHelper.removeReviewer",
      async (item: PrTreeItem) => {
        const reviewer = item.data as string;
        if (!reviewer) return;

        try {
          await ghService.updatePr({ removeReviewers: [reviewer] });
          vscode.window.showInformationMessage(`@${reviewer} removed!`);
          await prTreeProvider.refresh();
        } catch (error) {
          showNotification(error instanceof Error ? error.message : "Failed");
        }
      },
    ),
  );

  // Regenerate
  context.subscriptions.push(
    vscode.commands.registerCommand("githubPrHelper.regenerate", async () => {
      await regenerateContent();
    }),
  );
}

/**
 * Create a new PR with AI-generated content
 */
async function createPr(): Promise<void> {
  try {
    const config = configService.getAll();

    // Get current user
    let currentUser: string;
    try {
      currentUser = await ghService.getCurrentUser();
    } catch {
      currentUser = "@me";
    }

    // Create draft PR
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Creating draft PR...",
        cancellable: false,
      },
      async (progress) => {
        await ghService.createPr({
          title: "Untitled",
          body: "Pending generation...",
          baseBranch: config.baseBranch,
          draft: true,
          assignee: currentUser,
          reviewers:
            config.defaultReviewers.length > 0
              ? config.defaultReviewers
              : undefined,
        });

        progress.report({ message: "Generating content with AI..." });

        if (geminiService.isConfigured()) {
          const { diff, wasTruncated } = await ghService.getDiff(
            config.baseBranch,
          );
          const branchName = await ghService.getCurrentBranch();

          if (wasTruncated) {
            vscode.window.showWarningMessage(
              "Some files were truncated. AI description may be incomplete.",
            );
          }

          const content = await geminiService.generatePrContent(
            diff,
            config.titleTemplate,
            config.descriptionTemplate,
            branchName,
          );

          await ghService.updatePr({
            title: content.title,
            body: content.description,
          });
        } else {
          vscode.window
            .showWarningMessage(
              "Gemini API key not configured. Configure it to generate PR content.",
              "Open Settings",
            )
            .then((action) => {
              if (action === "Open Settings") {
                configService.openSettings();
              }
            });
        }
      },
    );

    vscode.window.showInformationMessage("Draft PR created!");
    await prTreeProvider.refresh();
  } catch (error) {
    showNotification(
      error instanceof Error ? error.message : "Failed to create PR",
    );
  }
}

/**
 * Regenerate PR content with AI
 */
async function regenerateContent(): Promise<void> {
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Regenerating content with AI...",
        cancellable: false,
      },
      async () => {
        const config = configService.getAll();
        const { diff, wasTruncated } = await ghService.getDiff(
          config.baseBranch,
        );
        const branchName = await ghService.getCurrentBranch();

        if (wasTruncated) {
          vscode.window.showWarningMessage(
            "Some files were truncated. AI description may be incomplete.",
          );
        }

        const content = await geminiService.generatePrContent(
          diff,
          config.titleTemplate,
          config.descriptionTemplate,
          branchName,
        );

        await ghService.updatePr({
          title: content.title,
          body: content.description,
        });
      },
    );

    vscode.window.showInformationMessage("Content regenerated!");
    await prTreeProvider.refresh();
  } catch (error) {
    showNotification(
      error instanceof Error ? error.message : "Failed to regenerate",
    );
  }
}

/**
 * Show appropriate notification based on message content
 */
function showNotification(message: string): void {
  if (message.toLowerCase().startsWith("warning:")) {
    vscode.window.showWarningMessage(message);
  } else {
    vscode.window.showErrorMessage(message);
  }
}

/**
 * Setup git push detection
 */
function setupGitPushDetection(context: vscode.ExtensionContext): void {
  const gitExtension =
    vscode.extensions.getExtension<GitExtension>("vscode.git");

  if (!gitExtension) {
    console.log("Git extension not found");
    return;
  }

  gitExtension.activate().then((git) => {
    const gitApi = git.getAPI(1);

    context.subscriptions.push(
      gitApi.onDidPublish(async (event: PublishEvent) => {
        if (!event.branch) return;

        const setting = configService.promptOnBranchPublish;
        if (setting === "never") return;

        const prExists = await ghService.prExists();
        if (prExists) return;

        if (setting === "always") {
          await createPr();
          return;
        }

        const result = await vscode.window.showInformationMessage(
          `Create PR for branch '${event.branch}'?`,
          "Create Draft PR",
          "Not Now",
          "Don't Ask Again",
        );

        if (result === "Create Draft PR") {
          await createPr();
        } else if (result === "Don't Ask Again") {
          await vscode.workspace
            .getConfiguration("githubPrHelper")
            .update(
              "promptOnBranchPublish",
              "never",
              vscode.ConfigurationTarget.Global,
            );
        }
      }),
    );
  });
}

export function deactivate(): void {
  console.log("GitHub PR Helper deactivated");
}

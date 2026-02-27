import * as vscode from "vscode";
import { AIProvider, ExtensionConfig } from "../types";

/**
 * Centralized configuration service for the extension
 */
export class ConfigService {
  private static readonly NAMESPACE = "githubPrHelper";

  private get config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(ConfigService.NAMESPACE);
  }

  get provider(): AIProvider {
    return this.config.get<AIProvider>("provider", "google");
  }

  get providerApiKey(): string {
    return this.config.get<string>("providerApiKey", "");
  }

  get model(): string {
    const model = this.config.get<string>("model", "google/gemini-2.5-flash");
    if (model === "custom") {
      return this.config.get<string>("customModel", "");
    }
    // Strip the provider prefix (e.g., "google/gemini-2.5-flash" → "gemini-2.5-flash")
    const slashIndex = model.indexOf("/");
    return slashIndex >= 0 ? model.substring(slashIndex + 1) : model;
  }

  get baseBranch(): string {
    return this.config.get<string>("baseBranch", "main");
  }

  get defaultReviewers(): string[] {
    return this.config.get<string[]>("defaultReviewers", []);
  }

  get titleTemplate(): string {
    return this.config.get<string>(
      "titleTemplate",
      "Generate a concise PR title (max 72 chars) that summarizes the changes",
    );
  }

  get descriptionTemplate(): string {
    return this.config.get<string>(
      "descriptionTemplate",
      "Generate a PR description with: ## Summary, ## Changes Made (bullet points), ## Testing Notes",
    );
  }

  get promptOnBranchPublish(): "ask" | "always" | "never" {
    return this.config.get<"ask" | "always" | "never">(
      "promptOnBranchPublish",
      "ask",
    );
  }

  get enableCopilotReviewer(): boolean {
    return this.config.get<boolean>("enableCopilotReviewer", false);
  }

  /** Get all configuration as an object */
  getAll(): ExtensionConfig {
    return {
      provider: this.provider,
      providerApiKey: this.providerApiKey,
      model: this.model,
      baseBranch: this.baseBranch,
      defaultReviewers: this.defaultReviewers,
      titleTemplate: this.titleTemplate,
      descriptionTemplate: this.descriptionTemplate,
      promptOnBranchPublish: this.promptOnBranchPublish,
      enableCopilotReviewer: this.enableCopilotReviewer,
    };
  }

  /** Check if the extension is properly configured */
  isConfigured(): boolean {
    return this.providerApiKey.length > 0 && this.model.length > 0;
  }

  /** Open the settings UI for this extension */
  async openSettings(): Promise<void> {
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      "@ext:kwickramasekara.github-pr-helper",
    );
  }

  /** Subscribe to configuration changes */
  onDidChangeConfiguration(callback: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ConfigService.NAMESPACE)) {
        callback();
      }
    });
  }
}

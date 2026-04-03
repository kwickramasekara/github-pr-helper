import * as vscode from "vscode";
import { ExtensionConfig } from "../types";

/**
 * Centralized configuration service for the extension
 */
export class ConfigService {
  private static readonly NAMESPACE = "githubPrHelper";

  private get config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(ConfigService.NAMESPACE);
  }

  get baseBranch(): string {
    return this.config.get<string>("baseBranch", "main");
  }

  get defaultReviewers(): string[] {
    return this.config.get<string[]>("defaultReviewers", []);
  }

  get opencodeConfig(): Record<string, unknown> {
    const config = this.config.get<Record<string, unknown>>("opencodeConfig", {});
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      return {};
    }
    return config;
  }

  get prTemplatePath(): string {
    return this.config.get<string>("prTemplatePath", "");
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
      baseBranch: this.baseBranch,
      defaultReviewers: this.defaultReviewers,
      opencodeConfig: this.opencodeConfig,
      prTemplatePath: this.prTemplatePath,
      promptOnBranchPublish: this.promptOnBranchPublish,
      enableCopilotReviewer: this.enableCopilotReviewer,
    };
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

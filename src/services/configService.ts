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

  get geminiApiKey(): string {
    return this.config.get<string>("geminiApiKey", "");
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

  /** Get all configuration as an object */
  getAll(): ExtensionConfig {
    return {
      geminiApiKey: this.geminiApiKey,
      baseBranch: this.baseBranch,
      defaultReviewers: this.defaultReviewers,
      titleTemplate: this.titleTemplate,
      descriptionTemplate: this.descriptionTemplate,
      promptOnBranchPublish: this.promptOnBranchPublish,
    };
  }

  /** Check if the extension is properly configured */
  isConfigured(): boolean {
    return this.geminiApiKey.length > 0;
  }

  /** Open the settings UI for this extension */
  async openSettings(): Promise<void> {
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      "GitHub PR Helper",
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

import * as vscode from "vscode";
import { GitHubCliService } from "../services/githubCliService";
import { GeminiService } from "../services/geminiService";
import { ConfigService } from "../services/configService";

/**
 * Webview panel for viewing/editing PR description with markdown rendering
 */
export class DescriptionPanel {
  public static currentPanel: DescriptionPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _description: string;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly ghService: GitHubCliService,
    private readonly geminiService: GeminiService,
    private readonly configService: ConfigService,
    description: string,
    private readonly onDescriptionChanged: () => void,
  ) {
    this._panel = panel;
    this._description = description;

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case "save":
            await this._saveDescription(message.description);
            break;
          case "regenerate":
            await this._regenerateDescription();
            break;
        }
      },
      null,
      this._disposables,
    );
  }

  /**
   * Create or reveal the description panel
   */
  public static createOrShow(
    extensionUri: vscode.Uri,
    ghService: GitHubCliService,
    geminiService: GeminiService,
    configService: ConfigService,
    description: string,
    onDescriptionChanged: () => void,
  ): void {
    const column = vscode.ViewColumn.Beside;

    if (DescriptionPanel.currentPanel) {
      DescriptionPanel.currentPanel._description = description;
      DescriptionPanel.currentPanel._update();
      DescriptionPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "githubPrHelper.description",
      "PR Description",
      column,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri],
        retainContextWhenHidden: true,
      },
    );

    DescriptionPanel.currentPanel = new DescriptionPanel(
      panel,
      extensionUri,
      ghService,
      geminiService,
      configService,
      description,
      onDescriptionChanged,
    );
  }

  /**
   * Update the description and refresh the panel
   */
  public updateDescription(description: string): void {
    this._description = description;
    this._update();
  }

  private async _saveDescription(description: string): Promise<void> {
    try {
      this._panel.webview.postMessage({ type: "saving" });
      await this.ghService.updatePr({ body: description });
      this._description = description;
      vscode.window.showInformationMessage("Description saved!");
      this.onDescriptionChanged();
      this._panel.webview.postMessage({ type: "saved" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to save";
      vscode.window.showErrorMessage(msg);
      this._panel.webview.postMessage({ type: "error", message: msg });
    }
  }

  private async _regenerateDescription(): Promise<void> {
    try {
      this._panel.webview.postMessage({ type: "regenerating" });

      const config = this.configService.getAll();
      const { diff, wasTruncated } = await this.ghService.getDiff(
        config.baseBranch,
      );
      const branchName = await this.ghService.getCurrentBranch();

      if (wasTruncated) {
        vscode.window.showWarningMessage(
          "Some files were truncated. AI description may be incomplete.",
        );
      }

      const content = await this.geminiService.generatePrContent(
        diff,
        config.titleTemplate,
        config.descriptionTemplate,
        branchName,
      );

      // Save both title and description
      await this.ghService.updatePr({
        title: content.title,
        body: content.description,
      });

      this._description = content.description;
      vscode.window.showInformationMessage("Content regenerated!");
      this.onDescriptionChanged();
      this._update();
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to regenerate";
      vscode.window.showErrorMessage(msg);
      this._panel.webview.postMessage({ type: "error", message: msg });
    }
  }

  private _update(): void {
    this._panel.webview.html = this._getHtmlContent();
  }

  private _getHtmlContent(): string {
    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}' https://cdnjs.cloudflare.com;">
  <script nonce="${nonce}" src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
  <title>PR Description</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
      max-width: 800px;
      margin: 0 auto;
    }
    .tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .tab {
      padding: 8px 16px;
      cursor: pointer;
      border: none;
      background: none;
      color: var(--vscode-foreground);
      opacity: 0.7;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
    }
    .tab.active {
      opacity: 1;
      border-bottom-color: var(--vscode-focusBorder);
    }
    .tab:hover {
      opacity: 1;
    }
    .panel {
      display: none;
    }
    .panel.active {
      display: block;
    }
    #preview {
      line-height: 1.6;
    }
    #preview h1, #preview h2, #preview h3 {
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 8px;
    }
    #preview code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 4px;
    }
    #preview pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
    }
    #preview ul, #preview ol {
      padding-left: 24px;
    }
    textarea {
      width: 100%;
      min-height: 400px;
      padding: 12px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      resize: vertical;
    }
    textarea:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }
    button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }
    .primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .status {
      margin-top: 8px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="tabs">
    <button class="tab active" data-tab="preview">Preview</button>
    <button class="tab" data-tab="edit">Edit</button>
  </div>

  <div id="preview" class="panel active"></div>

  <div id="edit" class="panel">
    <textarea id="editor">${this._escapeHtml(this._description)}</textarea>
    <div class="actions">
      <button class="primary" id="save">Save</button>
      <button class="secondary" id="regenerate">🔄 Regenerate with AI</button>
    </div>
    <div class="status" id="status"></div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const tabs = document.querySelectorAll('.tab');
    const panels = document.querySelectorAll('.panel');
    const preview = document.getElementById('preview');
    const editor = document.getElementById('editor');
    const saveBtn = document.getElementById('save');
    const regenerateBtn = document.getElementById('regenerate');
    const status = document.getElementById('status');

    // Use marked library for proper markdown rendering
    function renderMarkdown(md) {
      if (typeof marked !== 'undefined' && marked.parse) {
        return marked.parse(md || '(No description)');
      }
      // Fallback if marked not loaded
      return md || '(No description)';
    }

    preview.innerHTML = renderMarkdown(editor.value || '(No description)');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
        if (tab.dataset.tab === 'preview') {
          preview.innerHTML = renderMarkdown(editor.value || '(No description)');
        }
      });
    });

    saveBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'save', description: editor.value });
    });

    regenerateBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'regenerate' });
    });

    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'saving':
          saveBtn.disabled = true;
          status.textContent = 'Saving...';
          break;
        case 'saved':
          saveBtn.disabled = false;
          status.textContent = 'Saved!';
          setTimeout(() => { status.textContent = ''; }, 2000);
          break;
        case 'regenerating':
          regenerateBtn.disabled = true;
          status.textContent = 'Regenerating with AI...';
          break;
        case 'error':
          saveBtn.disabled = false;
          regenerateBtn.disabled = false;
          status.textContent = 'Error: ' + message.message;
          break;
      }
    });
  </script>
</body>
</html>`;
  }

  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  private _getNonce(): string {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  public dispose(): void {
    DescriptionPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) {
        d.dispose();
      }
    }
  }
}

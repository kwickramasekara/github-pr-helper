import * as vscode from "vscode";
import { PrDetails } from "../types";
import { GitHubCliService } from "../services/githubCliService";

/**
 * Tree item types for context menu filtering
 */
type TreeItemContext =
  | "prStatusDraft"
  | "prStatusOpen"
  | "prStatusMerged"
  | "prStatusClosed"
  | "prTitle"
  | "prDescription"
  | "prAuthor"
  | "reviewersHeader"
  | "reviewer"
  | "assigneesHeader"
  | "assignee"
  | "prCreated"
  | "noPr";

/**
 * Tree item representing a PR property or action
 */
export class PrTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: TreeItemContext,
    public readonly description?: string,
    public readonly iconPath?: vscode.ThemeIcon,
    public readonly children?: PrTreeItem[],
    public readonly data?: unknown,
  ) {
    super(label, collapsibleState);
    this.contextValue = contextValue;
    this.description = description;
    this.iconPath = iconPath;
  }
}

/**
 * TreeDataProvider for the PR sidebar
 */
export class PrTreeProvider implements vscode.TreeDataProvider<PrTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    PrTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _prDetails: PrDetails | null = null;
  private _isLoading = false;
  private _error: string | null = null;

  constructor(private readonly ghService: GitHubCliService) {}

  /**
   * Refresh the tree view
   */
  async refresh(): Promise<void> {
    this._isLoading = true;
    this._error = null;
    this._onDidChangeTreeData.fire();

    try {
      this._prDetails = await this.ghService.getPrDetails();
    } catch (error) {
      if (error instanceof Error) {
        // Don't show error for "no PR exists" - that's expected
        if (!error.message.includes("no pull requests")) {
          this._error = error.message;
        }
      }
      this._prDetails = null;
    } finally {
      this._isLoading = false;
      this._onDidChangeTreeData.fire();
    }
  }

  /**
   * Get the current PR details
   */
  get prDetails(): PrDetails | null {
    return this._prDetails;
  }

  /**
   * Set PR details (used after creating a PR)
   */
  setPrDetails(pr: PrDetails | null): void {
    this._prDetails = pr;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: PrTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: PrTreeItem): Thenable<PrTreeItem[]> {
    if (this._isLoading) {
      return Promise.resolve([
        new PrTreeItem(
          "Loading...",
          vscode.TreeItemCollapsibleState.None,
          "noPr",
          undefined,
          new vscode.ThemeIcon("loading~spin"),
        ),
      ]);
    }

    if (element) {
      // Return children of collapsible items
      return Promise.resolve(element.children || []);
    }

    // Root level
    if (!this._prDetails) {
      // Show welcome view (handled by viewsWelcome in package.json)
      return Promise.resolve([]);
    }

    return Promise.resolve(this._buildPrTree());
  }

  private _buildPrTree(): PrTreeItem[] {
    const pr = this._prDetails!;
    const items: PrTreeItem[] = [];

    // Status badge
    const statusIcon = this._getStatusIcon(pr);
    const statusContext = pr.isDraft
      ? "prStatusDraft"
      : (pr.state.toLowerCase() as
          | "prStatusOpen"
          | "prStatusMerged"
          | "prStatusClosed");
    items.push(
      new PrTreeItem(
        pr.isDraft ? "DRAFT" : pr.state.toUpperCase(),
        vscode.TreeItemCollapsibleState.None,
        statusContext,
        `#${pr.number}`,
        statusIcon,
      ),
    );

    // Title
    items.push(
      new PrTreeItem(
        "Title",
        vscode.TreeItemCollapsibleState.None,
        "prTitle",
        pr.title,
        new vscode.ThemeIcon("edit"),
      ),
    );

    // Description
    const descPreview =
      pr.body && pr.body.length > 50
        ? pr.body.substring(0, 50) + "..."
        : pr.body || "(no description)";
    items.push(
      new PrTreeItem(
        "Description",
        vscode.TreeItemCollapsibleState.None,
        "prDescription",
        descPreview,
        new vscode.ThemeIcon("markdown"),
      ),
    );

    // Author
    items.push(
      new PrTreeItem(
        "Author",
        vscode.TreeItemCollapsibleState.None,
        "prAuthor",
        `@${pr.author?.login || "unknown"}`,
        new vscode.ThemeIcon("person"),
      ),
    );

    // Reviewers (collapsible)
    const reviewerChildren =
      pr.reviewers && pr.reviewers.length > 0
        ? pr.reviewers.map(
            (r) =>
              new PrTreeItem(
                `@${r.login}`,
                vscode.TreeItemCollapsibleState.None,
                "reviewer",
                undefined,
                new vscode.ThemeIcon("person"),
                undefined,
                r.login,
              ),
          )
        : [];
    items.push(
      new PrTreeItem(
        "Reviewers",
        reviewerChildren.length > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.None,
        "reviewersHeader",
        reviewerChildren.length > 0 ? `${reviewerChildren.length}` : "None",
        new vscode.ThemeIcon("organization"),
        reviewerChildren,
      ),
    );

    // Assignees (collapsible)
    const assigneeChildren =
      pr.assignees && pr.assignees.length > 0
        ? pr.assignees.map(
            (a) =>
              new PrTreeItem(
                `@${a.login}`,
                vscode.TreeItemCollapsibleState.None,
                "assignee",
                undefined,
                new vscode.ThemeIcon("person"),
                undefined,
                a.login,
              ),
          )
        : [];
    items.push(
      new PrTreeItem(
        "Assignees",
        assigneeChildren.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        "assigneesHeader",
        assigneeChildren.length > 0 ? `${assigneeChildren.length}` : "None",
        new vscode.ThemeIcon("person-add"),
        assigneeChildren,
      ),
    );

    // Created
    items.push(
      new PrTreeItem(
        "Created",
        vscode.TreeItemCollapsibleState.None,
        "prCreated",
        this._formatRelativeTime(pr.createdAt),
        new vscode.ThemeIcon("calendar"),
      ),
    );

    return items;
  }

  private _getStatusIcon(pr: PrDetails): vscode.ThemeIcon {
    if (pr.isDraft) {
      return new vscode.ThemeIcon(
        "git-pull-request-draft",
        new vscode.ThemeColor("editorWarning.foreground"),
      );
    }
    switch (pr.state.toLowerCase()) {
      case "open":
        return new vscode.ThemeIcon(
          "git-pull-request",
          new vscode.ThemeColor("charts.green"),
        );
      case "merged":
        return new vscode.ThemeIcon(
          "git-merge",
          new vscode.ThemeColor("charts.purple"),
        );
      case "closed":
        return new vscode.ThemeIcon(
          "git-pull-request-closed",
          new vscode.ThemeColor("charts.red"),
        );
      default:
        return new vscode.ThemeIcon("git-pull-request");
    }
  }

  private _formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return "Just now";
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes}m ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours}h ago`;
    } else if (diffInSeconds < 604800) {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }
}

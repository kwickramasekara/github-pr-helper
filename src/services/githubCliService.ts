import { exec } from "child_process";
import { promisify } from "util";
import * as vscode from "vscode";
import {
  PrDetails,
  CreatePrOptions,
  UpdatePrOptions,
  GitHubUser,
} from "../types";

const execAsync = promisify(exec);

/**
 * Service for interacting with GitHub CLI (gh)
 */
export class GitHubCliService {
  private workspaceRoot: string;

  constructor() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    this.workspaceRoot = workspaceFolders?.[0]?.uri.fsPath || process.cwd();
  }

  /**
   * Execute a shell command in the workspace directory
   */
  private async execute(command: string): Promise<string> {
    try {
      const { stdout } = await execAsync(command, {
        cwd: this.workspaceRoot,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large diffs
      });
      return stdout.trim();
    } catch (error: unknown) {
      const execError = error as { stderr?: string; message?: string };
      throw new Error(
        execError.stderr || execError.message || "Command failed",
      );
    }
  }

  /**
   * Check if GitHub CLI is installed and authenticated
   */
  async isAuthenticated(): Promise<{ authenticated: boolean; error?: string }> {
    try {
      await this.execute("gh auth status");
      return { authenticated: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (
        message.includes("not found") ||
        message.includes("command not found")
      ) {
        return {
          authenticated: false,
          error:
            "GitHub CLI (gh) is not installed. Install it from https://cli.github.com/",
        };
      }
      return {
        authenticated: false,
        error: "GitHub CLI is not authenticated. Run: gh auth login",
      };
    }
  }

  /**
   * Check if a PR exists for the current branch
   */
  async prExists(): Promise<boolean> {
    try {
      await this.execute("gh pr view --json number");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get PR details for the current branch
   */
  async getPrDetails(): Promise<PrDetails | null> {
    try {
      const fields = [
        "number",
        "title",
        "body",
        "url",
        "state",
        "isDraft",
        "author",
        "assignees",
        "reviewRequests",
        "createdAt",
        "headRefName",
        "baseRefName",
      ].join(",");

      const result = await this.execute(`gh pr view --json ${fields}`);
      const data = JSON.parse(result);

      // Transform reviewRequests to reviewers format
      const reviewers: GitHubUser[] = (data.reviewRequests || []).map(
        (r: { login?: string; name?: string; slug?: string }) => ({
          login: r.login || r.slug || "unknown",
          name: r.name,
        }),
      );

      return {
        number: data.number,
        title: data.title,
        body: data.body || "",
        url: data.url,
        state: data.state,
        isDraft: data.isDraft,
        author: {
          login: data.author?.login || "unknown",
          name: data.author?.name,
        },
        assignees: (data.assignees || []).map(
          (a: { login: string; name?: string }) => ({
            login: a.login,
            name: a.name,
          }),
        ),
        reviewers,
        createdAt: data.createdAt,
        headRefName: data.headRefName,
        baseRefName: data.baseRefName,
      };
    } catch {
      return null;
    }
  }

  /**
   * Create a new pull request
   */
  async createPr(options: CreatePrOptions): Promise<PrDetails> {
    const args = [
      "gh pr create",
      `--title "${this.escapeShellArg(options.title)}"`,
      `--body "${this.escapeShellArg(options.body)}"`,
      `--base "${options.baseBranch}"`,
    ];

    if (options.draft) {
      args.push("--draft");
    }

    if (options.assignee) {
      args.push(`--assignee "${options.assignee}"`);
    }

    if (options.reviewers && options.reviewers.length > 0) {
      args.push(`--reviewer "${options.reviewers.join(",")}"`);
    }

    await this.execute(args.join(" "));

    // Return the PR details after creation
    const details = await this.getPrDetails();
    if (!details) {
      throw new Error("PR was created but could not retrieve details");
    }
    return details;
  }

  /**
   * Update an existing pull request
   */
  async updatePr(options: UpdatePrOptions): Promise<void> {
    const args = ["gh pr edit"];

    if (options.title) {
      args.push(`--title "${this.escapeShellArg(options.title)}"`);
    }

    if (options.body) {
      args.push(`--body "${this.escapeShellArg(options.body)}"`);
    }

    if (options.addReviewers && options.addReviewers.length > 0) {
      args.push(`--add-reviewer "${options.addReviewers.join(",")}"`);
    }

    if (options.removeReviewers && options.removeReviewers.length > 0) {
      args.push(`--remove-reviewer "${options.removeReviewers.join(",")}"`);
    }

    if (options.addAssignees && options.addAssignees.length > 0) {
      args.push(`--add-assignee "${options.addAssignees.join(",")}"`);
    }

    if (options.removeAssignees && options.removeAssignees.length > 0) {
      args.push(`--remove-assignee "${options.removeAssignees.join(",")}"`);
    }

    if (args.length > 1) {
      await this.execute(args.join(" "));
    }
  }

  /**
   * Mark a draft PR as ready for review
   */
  async markReady(): Promise<void> {
    await this.execute("gh pr ready");
  }

  /**
   * Get the diff between the current branch and base branch
   * Truncates each file to 100 lines as per user requirement
   */
  async getDiff(
    baseBranch: string,
  ): Promise<{ diff: string; wasTruncated: boolean }> {
    try {
      // First, fetch to ensure we have the latest remote refs
      await this.execute("git fetch origin");
    } catch {
      // Ignore fetch errors, proceed with local refs
    }

    let diff: string;
    try {
      diff = await this.execute(`git diff origin/${baseBranch}...HEAD`);
    } catch {
      // Fallback to local branch comparison
      diff = await this.execute(`git diff ${baseBranch}...HEAD`);
    }

    return this.truncateDiff(diff);
  }

  /**
   * Truncate diff to 100 lines per file
   */
  private truncateDiff(diff: string): { diff: string; wasTruncated: boolean } {
    const lines = diff.split("\n");
    const result: string[] = [];
    let wasTruncated = false;
    let currentFileLines = 0;
    let inFile = false;
    let skipUntilNextFile = false;

    for (const line of lines) {
      // Check if this is a new file header
      if (line.startsWith("diff --git")) {
        inFile = true;
        currentFileLines = 0;
        skipUntilNextFile = false;
        result.push(line);
        continue;
      }

      if (skipUntilNextFile) {
        continue;
      }

      if (inFile) {
        currentFileLines++;
        if (currentFileLines <= 100) {
          result.push(line);
        } else if (currentFileLines === 101) {
          result.push("... [truncated - file exceeds 100 lines] ...");
          wasTruncated = true;
          skipUntilNextFile = true;
        }
      } else {
        result.push(line);
      }
    }

    return { diff: result.join("\n"), wasTruncated };
  }

  /**
   * Get the current branch name
   */
  async getCurrentBranch(): Promise<string> {
    return this.execute("git branch --show-current");
  }

  /**
   * Get the current GitHub username
   */
  async getCurrentUser(): Promise<string> {
    const result = await this.execute("gh api user --jq .login");
    return result;
  }

  /**
   * Open PR in the default browser
   */
  async openInBrowser(): Promise<void> {
    await this.execute("gh pr view --web");
  }

  /**
   * Escape special characters for shell arguments
   */
  private escapeShellArg(arg: string): string {
    return arg.replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/`/g, "\\`");
  }
}

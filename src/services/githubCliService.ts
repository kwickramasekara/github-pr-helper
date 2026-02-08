import { exec } from "child_process";
import { promisify } from "util";
import * as vscode from "vscode";
import {
  PrDetails,
  CreatePrOptions,
  UpdatePrOptions,
  GitHubUser,
  DiffResult,
  DiffStats,
} from "../types";

const execAsync = promisify(exec);

/**
 * Service for interacting with GitHub CLI (gh)
 */
export class GitHubCliService {
  private workspaceRoot: string;

  // Files to skip entirely (noise files that don't help LLM understanding)
  private static readonly SKIP_PATTERNS: RegExp[] = [
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
    /\.min\.(js|css)$/,
    /\.map$/,
    /\.snap$/,
    /dist\//,
    /build\//,
    /coverage\//,
    /\.generated\./,
    /node_modules\//,
  ];

  // High priority files get more lines (source code)
  private static readonly HIGH_PRIORITY_PATTERNS: RegExp[] = [
    /^src\//,
    /\.tsx?$/,
    /\.jsx?$/,
    /test\.(ts|js|tsx|jsx)$/,
    /spec\.(ts|js|tsx|jsx)$/,
  ];

  // Line limits per file type
  private static readonly DEFAULT_LINES_PER_FILE = 100;
  private static readonly PRIORITY_LINES_PER_FILE = 200;
  private static readonly MAX_TOTAL_CHARS = 100_000;

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
   * Includes smart filtering, commit messages, and enhanced stats
   */
  async getDiff(baseBranch: string): Promise<DiffResult> {
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

    // Get commit messages for additional context
    const commitMessages = await this.getCommitMessages(baseBranch);

    // Get diff stats from git
    const rawStats = await this.getDiffStats(baseBranch);

    // Process the diff with filtering and truncation
    return this.processDiff(diff, commitMessages, rawStats);
  }

  /**
   * Get commit messages between base branch and HEAD
   */
  async getCommitMessages(baseBranch: string): Promise<string[]> {
    try {
      const output = await this.execute(
        `git log --oneline origin/${baseBranch}..HEAD`,
      );
      return output
        .split("\n")
        .filter((line) => line.trim())
        .slice(0, 20); // Limit to 20 commits
    } catch {
      try {
        const output = await this.execute(
          `git log --oneline ${baseBranch}..HEAD`,
        );
        return output
          .split("\n")
          .filter((line) => line.trim())
          .slice(0, 20);
      } catch {
        return [];
      }
    }
  }

  /**
   * Get diff statistics from git
   */
  private async getDiffStats(
    baseBranch: string,
  ): Promise<{ additions: number; deletions: number }> {
    try {
      const output = await this.execute(
        `git diff --shortstat origin/${baseBranch}...HEAD`,
      );
      const additions = parseInt(output.match(/(\d+) insertion/)?.[1] || "0");
      const deletions = parseInt(output.match(/(\d+) deletion/)?.[1] || "0");
      return { additions, deletions };
    } catch {
      return { additions: 0, deletions: 0 };
    }
  }

  /**
   * Check if a file path matches any of the skip patterns
   */
  private shouldSkipFile(filePath: string): boolean {
    return GitHubCliService.SKIP_PATTERNS.some((pattern) =>
      pattern.test(filePath),
    );
  }

  /**
   * Check if a file path is high priority (gets more lines)
   */
  private isHighPriorityFile(filePath: string): boolean {
    return GitHubCliService.HIGH_PRIORITY_PATTERNS.some((pattern) =>
      pattern.test(filePath),
    );
  }

  /**
   * Get the line limit for a file based on its priority
   */
  private getLineLimitForFile(filePath: string): number {
    return this.isHighPriorityFile(filePath)
      ? GitHubCliService.PRIORITY_LINES_PER_FILE
      : GitHubCliService.DEFAULT_LINES_PER_FILE;
  }

  /**
   * Extract file path from diff header line
   */
  private extractFilePath(diffHeader: string): string {
    // diff --git a/path/to/file b/path/to/file
    const match = diffHeader.match(/diff --git a\/(.+?) b\//);
    return match?.[1] || "";
  }

  /**
   * Process diff with smart filtering, priority-based limits, and stats tracking
   */
  private processDiff(
    diff: string,
    commitMessages: string[],
    rawStats: { additions: number; deletions: number },
  ): DiffResult {
    const lines = diff.split("\n");
    const result: string[] = [];
    const stats: DiffStats = {
      filesChanged: 0,
      linesAdded: rawStats.additions,
      linesDeleted: rawStats.deletions,
      filesSkipped: [],
      filesTruncated: [],
    };

    let wasTruncated = false;
    let currentFileLines = 0;
    let currentFilePath = "";
    let currentLineLimit = GitHubCliService.DEFAULT_LINES_PER_FILE;
    let skipCurrentFile = false;
    let skipUntilNextFile = false;
    let totalChars = 0;
    let globalLimitReached = false;

    for (const line of lines) {
      // Check global character limit
      if (
        totalChars >= GitHubCliService.MAX_TOTAL_CHARS &&
        !globalLimitReached
      ) {
        result.push(
          "\n... [global limit reached - remaining files truncated] ...",
        );
        globalLimitReached = true;
        wasTruncated = true;
      }

      if (globalLimitReached) {
        // Still track file headers for stats
        if (line.startsWith("diff --git")) {
          const filePath = this.extractFilePath(line);
          if (filePath && !this.shouldSkipFile(filePath)) {
            stats.filesTruncated.push(filePath);
          }
        }
        continue;
      }

      // Check if this is a new file header
      if (line.startsWith("diff --git")) {
        currentFilePath = this.extractFilePath(line);
        currentFileLines = 0;
        skipUntilNextFile = false;

        // Check if this file should be skipped
        if (this.shouldSkipFile(currentFilePath)) {
          skipCurrentFile = true;
          stats.filesSkipped.push(currentFilePath);
          continue;
        }

        skipCurrentFile = false;
        stats.filesChanged++;
        currentLineLimit = this.getLineLimitForFile(currentFilePath);
        result.push(line);
        totalChars += line.length + 1;
        continue;
      }

      if (skipCurrentFile || skipUntilNextFile) {
        continue;
      }

      currentFileLines++;
      if (currentFileLines <= currentLineLimit) {
        result.push(line);
        totalChars += line.length + 1;
      } else if (currentFileLines === currentLineLimit + 1) {
        const truncMsg = `... [truncated - file exceeds ${currentLineLimit} lines] ...`;
        result.push(truncMsg);
        totalChars += truncMsg.length + 1;
        stats.filesTruncated.push(currentFilePath);
        wasTruncated = true;
        skipUntilNextFile = true;
      }
    }

    return {
      diff: result.join("\n"),
      stats,
      commitMessages,
      wasTruncated,
    };
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
   * Setup the gh alias for copilot-review command
   * This should be called once during extension activation
   */
  async setupCopilotAlias(): Promise<void> {
    try {
      await this.execute(
        "gh alias set copilot-review 'api --method POST /repos/$1/pulls/$2/requested_reviewers -f \"reviewers[]=copilot-pull-request-reviewer[bot]\"'",
      );
    } catch (error) {
      console.error("Failed to setup copilot alias:", error);
    }
  }

  /**
   * Check if the copilot-review alias is set up
   */
  async hasCopilotAlias(): Promise<boolean> {
    try {
      const result = await this.execute("gh alias list");
      return result.includes("copilot-review");
    } catch {
      return false;
    }
  }

  /**
   * Assign GitHub Copilot as a reviewer to the current PR
   */
  async assignCopilotReviewer(prNumber: number): Promise<void> {
    const remoteUrl = await this.execute("git remote get-url origin");
    const match = remoteUrl.match(
      /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/,
    );

    if (!match) {
      throw new Error("Could not parse repository owner/name from remote URL");
    }

    const owner = match[1];
    const repo = match[2];

    await this.execute(`gh copilot-review ${owner}/${repo} ${prNumber}`);
  }

  /**
   * Escape special characters for shell arguments
   */
  private escapeShellArg(arg: string): string {
    return arg.replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/`/g, "\\`");
  }
}

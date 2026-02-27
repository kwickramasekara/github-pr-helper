/**
 * Type definitions for GitHub PR Helper extension
 */

/** Supported AI providers */
export type AIProvider = "google" | "openai" | "anthropic";

/** Configuration options for the extension */
export interface ExtensionConfig {
  provider: AIProvider;
  providerApiKey: string;
  model: string;
  baseBranch: string;
  defaultReviewers: string[];
  titleTemplate: string;
  descriptionTemplate: string;
  promptOnBranchPublish: "ask" | "always" | "never";
  enableCopilotReviewer: boolean;
}

/** GitHub user information */
export interface GitHubUser {
  login: string;
  name?: string;
  avatarUrl?: string;
}

/** Pull request state */
export type PrState = "OPEN" | "CLOSED" | "MERGED";

/** Pull request details from GitHub CLI */
export interface PrDetails {
  number: number;
  title: string;
  body: string;
  url: string;
  state: PrState;
  isDraft: boolean;
  author: GitHubUser;
  assignees: GitHubUser[];
  reviewers: GitHubUser[];
  createdAt: string;
  headRefName: string;
  baseRefName: string;
}

/** Options for creating a new PR */
export interface CreatePrOptions {
  title: string;
  body: string;
  baseBranch: string;
  draft: boolean;
  assignee?: string;
  reviewers?: string[];
}

/** Options for updating an existing PR */
export interface UpdatePrOptions {
  title?: string;
  body?: string;
  addReviewers?: string[];
  removeReviewers?: string[];
  addAssignees?: string[];
  removeAssignees?: string[];
}

/** Response from AI provider */
export interface AIPrContent {
  title: string;
  description: string;
}

/** Messages sent from webview to extension */
export type WebviewMessage =
  | { type: "createPr" }
  | { type: "refreshPr" }
  | { type: "markReady" }
  | { type: "openInGitHub" }
  | { type: "openSettings" }
  | { type: "updateTitle"; title: string }
  | { type: "updateDescription"; description: string }
  | { type: "addReviewer"; reviewer: string }
  | { type: "removeReviewer"; reviewer: string }
  | { type: "regenerateContent" };

/** Messages sent from extension to webview */
export type ExtensionMessage =
  | { type: "prDetails"; data: PrDetails | null }
  | { type: "loading"; isLoading: boolean; message?: string }
  | { type: "error"; message: string }
  | { type: "success"; message: string }
  | { type: "ghCliStatus"; isAuthenticated: boolean; error?: string };

/** Statistics about the diff */
export interface DiffStats {
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
  filesSkipped: string[];
  filesTruncated: string[];
}

/** Result from getDiff with enhanced metadata */
export interface DiffResult {
  diff: string;
  stats: DiffStats;
  commitMessages: string[];
  wasTruncated: boolean;
}

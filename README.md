# GitHub PR Helper

A VS Code extension that streamlines GitHub pull request creation with AI-powered descriptions using **OpenCode**.

## Features

- 🚀 **One-click PR Creation**: Create draft PRs with a single click
- 🤖 **AI-Powered Descriptions**: Automatically generate PR titles and descriptions with OpenCode
- 🧠 **Full Repo Context**: OpenCode can inspect git history, diffs, and project files directly
- 🔔 **Push Detection**: Optionally prompt to create a PR when you push a new branch
- ✏️ **Inline Editing**: Edit PR title, description, and reviewers directly in VS Code
- 🎨 **Native UI**: Beautiful sidebar that matches your VS Code theme
- 🤝 **Copilot Reviewer**: Optionally assign GitHub Copilot as a reviewer

## Requirements

- **GitHub CLI (gh)**: This extension uses the GitHub CLI for all GitHub operations. [Install it here](https://cli.github.com/).
  - Run `gh auth login` to authenticate with your GitHub account.
- **OpenCode CLI (`opencode`)**: Install OpenCode from [opencode.ai/docs](https://opencode.ai/docs/).

## Getting Started

1. Install the extension
2. Make sure `gh` CLI is installed and authenticated
3. Optionally configure OpenCode options in Settings → GitHub PR Helper
4. Open a Git repository and create your first PR!

## Extension Settings

| Setting                                | Description                                                   | Default                   |
| -------------------------------------- | ------------------------------------------------------------- | ------------------------- |
| `githubPrHelper.baseBranch`            | Default base branch for PRs                                   | `main`                    |
| `githubPrHelper.defaultReviewers`      | Default reviewers (GitHub usernames or team slugs)            | `[]`                      |
| `githubPrHelper.opencodeConfig`        | Optional OpenCode SDK config object                           | `{}`                      |
| `githubPrHelper.prTemplatePath`        | Optional PR template path (relative to workspace root)        | `""`                     |
| `githubPrHelper.promptOnBranchPublish` | Behavior when pushing a new branch (`ask`, `always`, `never`) | `ask`                     |
| `githubPrHelper.enableCopilotReviewer` | Automatically assign Copilot as reviewer on PR creation       | `false`                   |

## Usage

### Creating a PR

1. Click the GitHub PR Helper icon in the Activity Bar
2. Click **Create Pull Request**
3. The extension will:
   - Create a draft PR with placeholder content
   - Generate a title and description using AI
   - Update the PR with the generated content

### Editing a PR

- **Title**: Click the edit icon next to the title
- **Description**: Click "Description" to open a panel with Preview/Edit tabs and markdown rendering
- **Reviewers**: Click the **+** icon on "Reviewers" to add, or the **×** icon next to a reviewer to remove

### Regenerating Content

Click the ✨ sparkle icon next to the description to regenerate the title and description with OpenCode.

## Commands

| Command                                      | Description                      |
| -------------------------------------------- | -------------------------------- |
| `GitHub PR Helper: Create Pull Request`      | Create a new draft PR            |
| `GitHub PR Helper: Refresh`                  | Refresh the current PR details   |
| `GitHub PR Helper: Mark as Ready for Review` | Convert draft to regular PR      |
| `GitHub PR Helper: Open in GitHub`           | Open the PR in your browser      |
| `GitHub PR Helper: Settings`                 | Open extension settings          |
| `GitHub PR Helper: Regenerate with OpenCode` | Regenerate title and description |

## Development

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch

# Run extension in debug mode
# Press F5 in VS Code
```

## License

MIT

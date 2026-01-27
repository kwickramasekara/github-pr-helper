# GitHub PR Helper

A VS Code extension that streamlines GitHub pull request creation with AI-powered descriptions using Google Gemini.

## Features

- 🚀 **One-click PR Creation**: Create draft PRs with a single click
- 🤖 **AI-Powered Descriptions**: Automatically generate PR titles and descriptions using Google Gemini
- 🔔 **Push Detection**: Optionally prompt to create a PR when you push a new branch
- ✏️ **Inline Editing**: Edit PR title, description, and reviewers directly in VS Code
- 🎨 **Native UI**: Beautiful sidebar that matches your VS Code theme

## Requirements

- **GitHub CLI (gh)**: This extension uses the GitHub CLI for all GitHub operations. [Install it here](https://cli.github.com/).
- Run `gh auth login` to authenticate with your GitHub account.
- **Google Gemini API Key**: Get one at [Google AI Studio](https://aistudio.google.com/apikey).

## Getting Started

1. Install the extension
2. Make sure `gh` CLI is installed and authenticated
3. Configure your Gemini API key in Settings → GitHub PR Helper
4. Open a Git repository and create your first PR!

## Extension Settings

| Setting                                | Description                                         | Default          |
| -------------------------------------- | --------------------------------------------------- | ---------------- |
| `githubPrHelper.geminiApiKey`          | Google Gemini API key for PR description generation | (empty)          |
| `githubPrHelper.baseBranch`            | Default base branch for PRs                         | `main`           |
| `githubPrHelper.defaultReviewers`      | Default reviewers (GitHub usernames)                | `[]`             |
| `githubPrHelper.titleTemplate`         | Custom instructions for title generation            | (default prompt) |
| `githubPrHelper.descriptionTemplate`   | Custom instructions for description generation      | (default prompt) |
| `githubPrHelper.promptOnBranchPublish` | Behavior when pushing a new branch                  | `ask`            |

## Usage

### Creating a PR

1. Click the GitHub PR Helper icon in the Activity Bar
2. Click "Create Pull Request"
3. The extension will:
   - Create a draft PR with placeholder content
   - Generate a title and description using AI
   - Update the PR with the generated content

### Editing a PR

- **Title**: Click the edit icon (✏️) next to the title and enter the new title in the input box
- **Description**: Click "Description" to open a panel with Preview/Edit tabs and markdown rendering
- **Reviewers**: Click the + icon on "Reviewers" to add. Click the × icon next to a reviewer to remove

### Adding Copilot as Reviewer

GitHub Copilot cannot be added as a reviewer programmatically. To add Copilot:

1. Click "Open in GitHub" to view your PR on GitHub.com
2. In the Reviewers section, click the gear icon and select "Copilot"

## Commands

- `GitHub PR Helper: Create Pull Request` - Create a new draft PR
- `GitHub PR Helper: Refresh PR Details` - Refresh the current PR details
- `GitHub PR Helper: Mark as Ready for Review` - Convert draft to regular PR
- `GitHub PR Helper: Open in GitHub` - Open the PR in your browser
- `GitHub PR Helper: Open Settings` - Open extension settings

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

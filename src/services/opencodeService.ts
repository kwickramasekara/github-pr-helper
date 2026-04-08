import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import { PrContent } from "../types";

const execAsync = promisify(exec);

export class OpencodeService {
  private opencodeConfig: Record<string, unknown>;

  constructor(
    opencodeConfig: Record<string, unknown>,
    private readonly workspaceRoot: string,
  ) {
    this.opencodeConfig = opencodeConfig;
  }

  reconfigure(opencodeConfig: Record<string, unknown>): void {
    this.opencodeConfig = opencodeConfig;
  }

  async isAvailable(): Promise<boolean> {
    const command =
      process.platform === "win32" ? "where opencode" : "command -v opencode";
    try {
      await execAsync(command, { cwd: this.workspaceRoot });
      return true;
    } catch {
      return false;
    }
  }

  async generatePrContent(
    baseBranch: string,
    prTemplatePath?: string,
  ): Promise<PrContent> {
    if (!(await this.isAvailable())) {
      throw new Error(
        "OpenCode is not installed. Install it from https://opencode.ai/docs/ and try again.",
      );
    }

    const { createOpencode } = (await import("@opencode-ai/sdk")) as {
      createOpencode: (options?: unknown) => Promise<{
        client: {
          session: {
            create: (options: unknown) => Promise<{ data?: { id: string } }>;
          };
        };
        server: { close: () => void };
      }>;
    };

    const opencode = await createOpencode({
      port: 6083,
      config: this.opencodeConfig as never,
    });

    try {
      const session = await opencode.client.session.create({
        query: { directory: this.workspaceRoot },
        body: { title: "[SDK] PR Info Generation" },
      });

      if (!session.data) {
        throw new Error("Failed to create an OpenCode session.");
      }

      const prompt = this.buildPrompt(baseBranch, prTemplatePath);

      const sessionApi = opencode.client.session as unknown as {
        prompt?: (options: unknown) => Promise<{ data?: { info?: unknown } }>;
      };
      if (!sessionApi.prompt) {
        throw new Error("OpenCode SDK does not support session.prompt.");
      }
      const result = await sessionApi.prompt({
        path: { id: session.data.id },
        query: { directory: this.workspaceRoot },
        body: {
          parts: [{ type: "text", text: prompt }],
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Concise PR title, max 72 chars",
                },
                description: {
                  type: "string",
                  description: "Full PR description in markdown",
                },
              },
              required: ["title", "description"],
            },
          },
        },
      });

      if (!result.data?.info) {
        throw new Error("OpenCode request failed.");
      }

      const output = this.extractStructuredOutput(result.data.info);
      if (!this.isPrContent(output)) {
        const sdkError = this.extractError(result.data.info);
        if (sdkError?.name === "StructuredOutputError") {
          throw new Error(
            sdkError.data?.message ||
              "OpenCode failed to produce valid structured output.",
          );
        }
        throw new Error("OpenCode returned an invalid PR content response.");
      }

      return output;
    } finally {
      await Promise.resolve(opencode.server.close());
    }
  }

  private extractStructuredOutput(info: unknown): unknown {
    if (!info || typeof info !== "object") {
      return undefined;
    }

    const messageInfo = info as Record<string, unknown>;
    if ("structured" in messageInfo) {
      return messageInfo.structured;
    }
    if ("structured_output" in messageInfo) {
      return messageInfo.structured_output;
    }
    return undefined;
  }

  private extractError(
    info: unknown,
  ): { name?: string; data?: { message?: string } } | undefined {
    if (!info || typeof info !== "object") {
      return undefined;
    }

    const messageInfo = info as Record<string, unknown>;
    if (!("error" in messageInfo)) {
      return undefined;
    }

    return messageInfo.error as { name?: string; data?: { message?: string } };
  }

  private buildPrompt(baseBranch: string, prTemplatePath?: string): string {
    const templatePath = prTemplatePath?.trim();

    const lines = [
      `Goal: Compare current branch to origin/${baseBranch} and output a PR title + body.`,
      "",
      "Run the following discovery commands ONCE, in parallel where possible.",
      "Do not run repeated git status/log/diff checks unless a command fails.",
      "",
      "Required command set (single pass):",
      `1) git fetch origin ${baseBranch}`,
      "2) git branch --show-current",
      `3) git log --oneline origin/${baseBranch}..HEAD`,
      `4) git diff --name-status origin/${baseBranch}...HEAD`,
      `5) git diff --stat origin/${baseBranch}...HEAD`,
      "",
      "Then:",
    ];

    if (templatePath) {
      lines.push(`- Read ${templatePath} once.`);
    }

    lines.push(
      "- Summarize only files in the branch diff.",
      "- Prioritize product-impacting code changes; treat docs as supporting context.",
      "- Produce:",
      "  - PR title: Concise summary of key change (max 72 characters)",
      templatePath
        ? "  - PR description: Exact template structure filled in"
        : "  - PR description: Include a summary of changes, a list of changes made, and any testing notes",
      "- Do not run extra validation commands unless explicitly requested.",
      "- Return only the final title and description.",
    );

    return lines.join("\n");
  }

  private isPrContent(value: unknown): value is PrContent {
    if (!value || typeof value !== "object") {
      return false;
    }

    const maybeContent = value as Record<string, unknown>;
    return (
      typeof maybeContent.title === "string" &&
      maybeContent.title.length > 0 &&
      typeof maybeContent.description === "string" &&
      maybeContent.description.length > 0
    );
  }
}

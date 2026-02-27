import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { AIPrContent, AIProvider, DiffResult } from "../types";

/**
 * Service for generating PR content using the Vercel AI SDK.
 * Supports Google Gemini, OpenAI, and Anthropic providers.
 */
export class AIService {
  private provider: AIProvider;
  private apiKey: string;
  private modelId: string;

  constructor(provider: AIProvider, apiKey: string, modelId: string) {
    this.provider = provider;
    this.apiKey = apiKey;
    this.modelId = modelId;
  }

  /**
   * Update the service configuration (e.g., when settings change)
   */
  reconfigure(provider: AIProvider, apiKey: string, modelId: string): void {
    this.provider = provider;
    this.apiKey = apiKey;
    this.modelId = modelId;
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return this.apiKey.length > 0 && this.modelId.length > 0;
  }

  /**
   * Create the appropriate language model instance based on the configured provider
   */
  private createModel() {
    switch (this.provider) {
      case "google": {
        const google = createGoogleGenerativeAI({ apiKey: this.apiKey });
        return google(this.modelId);
      }
      case "openai": {
        const openai = createOpenAI({ apiKey: this.apiKey });
        return openai(this.modelId);
      }
      case "anthropic": {
        const anthropic = createAnthropic({ apiKey: this.apiKey });
        return anthropic(this.modelId);
      }
    }
  }

  /**
   * Generate PR title and description from a diff result
   */
  async generatePrContent(
    diffResult: DiffResult,
    titleTemplate: string,
    descriptionTemplate: string,
    branchName?: string,
  ): Promise<AIPrContent> {
    if (!this.isConfigured()) {
      throw new Error(
        "AI provider is not configured. Please set your provider, API key, and model in the extension settings.",
      );
    }

    // Build context sections
    const branchInfo = branchName ? `Branch: ${branchName}` : "";

    const commitsSection =
      diffResult.commitMessages.length > 0
        ? `Recent Commits:\n${diffResult.commitMessages.map((c) => `- ${c}`).join("\n")}`
        : "";

    const statsSection = `Diff Statistics:
- Files changed: ${diffResult.stats.filesChanged}
- Lines added: +${diffResult.stats.linesAdded}
- Lines deleted: -${diffResult.stats.linesDeleted}${
      diffResult.stats.filesSkipped.length > 0
        ? `\n- Skipped (noise): ${diffResult.stats.filesSkipped.length} files (${diffResult.stats.filesSkipped.slice(0, 5).join(", ")}${diffResult.stats.filesSkipped.length > 5 ? "..." : ""})`
        : ""
    }${
      diffResult.stats.filesTruncated.length > 0
        ? `\n- Truncated: ${diffResult.stats.filesTruncated.length} files (${diffResult.stats.filesTruncated.slice(0, 5).join(", ")}${diffResult.stats.filesTruncated.length > 5 ? "..." : ""})`
        : ""
    }`;

    const systemPrompt =
      "You are a helpful assistant that generates GitHub Pull Request titles and descriptions.";

    const userPrompt = `Title Instructions: ${titleTemplate}
Description Instructions: ${descriptionTemplate}

${branchInfo}

${commitsSection}

${statsSection}

Based on the following git diff, generate a PR title and description. The title should be concise and descriptive. Both the title and description should follow their respective template instructions provided.
${branchName ? "Use the branch name and commit messages to understand the intent of changes." : ""}

\`\`\`diff
${diffResult.diff}
\`\`\`

Respond ONLY with valid JSON in this exact format (no markdown, no code blocks, just raw JSON):
{
  "title": "your generated title here",
  "description": "your generated description here (use \\n for newlines)"
}`;

    try {
      const model = this.createModel();

      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.7,
      });

      const text = result.text;
      if (!text) {
        throw new Error("No content in AI response");
      }

      // Strip markdown code fences if present
      const cleaned = text
        .replace(/^```(?:json)?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim();

      const parsed = JSON.parse(cleaned) as {
        title?: string;
        description?: string;
      };

      if (!parsed.title || !parsed.description) {
        throw new Error("Invalid response format from AI");
      }

      return {
        title: parsed.title,
        description: parsed.description,
      };
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        throw new Error("Failed to parse AI response as JSON");
      }
      throw error;
    }
  }
}

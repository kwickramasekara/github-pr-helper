import { GeminiPrContent, DiffResult } from "../types";

/**
 * Service for interacting with Google Gemini API
 */
export class GeminiService {
  private static readonly ENDPOINT =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Update the API key (e.g., when settings change)
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Check if the API key is configured
   */
  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * Generate PR title and description from a diff result
   */
  async generatePrContent(
    diffResult: DiffResult,
    titleTemplate: string,
    descriptionTemplate: string,
    branchName?: string,
  ): Promise<GeminiPrContent> {
    if (!this.isConfigured()) {
      throw new Error(
        "Gemini API key is not configured. Please set it in the extension settings.",
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

    const prompt = `You are a helpful assistant that generates GitHub Pull Request titles and descriptions.

Title Instructions: ${titleTemplate}
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
      const response = await fetch(GeminiService.ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 400 && errorText.includes("API_KEY")) {
          throw new Error(
            "Invalid Gemini API key. Please check your settings.",
          );
        }
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      // Extract the text from the response
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error("No content in Gemini response");
      }

      // Parse the JSON response
      const parsed = JSON.parse(text) as {
        title?: string;
        description?: string;
      };

      if (!parsed.title || !parsed.description) {
        throw new Error("Invalid response format from Gemini");
      }

      return {
        title: parsed.title,
        description: parsed.description,
      };
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        throw new Error("Failed to parse Gemini response as JSON");
      }
      throw error;
    }
  }

  /**
   * Validate the API key by making a simple request
   */
  async validateApiKey(): Promise<boolean> {
    try {
      const response = await fetch(GeminiService.ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: 'Say "ok"' }],
            },
          ],
        }),
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}

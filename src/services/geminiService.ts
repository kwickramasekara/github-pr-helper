import { GeminiPrContent } from "../types";

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
   * Generate PR title and description from a diff
   */
  async generatePrContent(
    diff: string,
    titleTemplate: string,
    descriptionTemplate: string,
    branchName?: string,
  ): Promise<GeminiPrContent> {
    if (!this.isConfigured()) {
      throw new Error(
        "Gemini API key is not configured. Please set it in the extension settings.",
      );
    }

    const branchInfo = branchName ? `\nBranch Name: ${branchName}` : "";

    const prompt = `You are a helpful assistant that generates GitHub Pull Request titles and descriptions.

Title Instructions: ${titleTemplate}
Description Instructions: ${descriptionTemplate}
${branchInfo}

Based on the following git diff, generate a PR title and description. The title should be concise and descriptive. The description should follow the template instructions provided. 
${!branchName ? "" : `Use the git branch name to fill in any placeholders in the template.`}

\`\`\`diff
${diff}
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

import type { LLMProvider, LLMRequest } from "./types.js";

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "gemma4";

interface OllamaResponse {
  message: {
    content: string;
  };
}

export class OllamaProvider implements LLMProvider {
  name = "ollama";

  private model: string;
  private baseUrl: string;

  constructor(model: string = DEFAULT_MODEL, baseUrl: string = DEFAULT_BASE_URL) {
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async complete(req: LLMRequest): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          messages: [
            { role: "system", content: req.systemPrompt },
            { role: "user", content: req.userPrompt },
          ],
        }),
      });
    } catch {
      throw new Error(
        `Cannot connect to Ollama at ${this.baseUrl}.\nIs it running? Start it with: ollama serve`,
      );
    }

    if (response.status === 404) {
      throw new Error(
        `Model "${this.model}" not found in Ollama.\nPull it first with: ollama pull ${this.model}`,
      );
    }

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as OllamaResponse;
    return data.message.content;
  }
}

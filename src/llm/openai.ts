import OpenAI from "openai";
import type { LLMProvider, LLMRequest } from "./types.js";

const DEFAULT_MODEL = "gpt-4o";

export class OpenAIProvider implements LLMProvider {
  name = "openai";

  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = DEFAULT_MODEL, baseURL?: string) {
    this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
    this.model = model;
  }

  async complete(req: LLMRequest): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: req.systemPrompt },
        { role: "user", content: req.userPrompt },
      ],
    });

    return response.choices[0]?.message.content ?? "";
  }
}

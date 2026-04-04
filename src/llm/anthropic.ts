import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMRequest } from "./types.js";

const DEFAULT_MODEL = "claude-opus-4-5";

export class AnthropicProvider implements LLMProvider {
  name = "anthropic";

  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async complete(req: LLMRequest): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: req.systemPrompt,
      messages: [{ role: "user", content: req.userPrompt }],
    });

    const block = response.content[0];
    if (!block || block.type !== "text") {
      throw new Error("Unexpected response from Anthropic: no text block");
    }
    return block.text;
  }
}

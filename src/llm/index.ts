import type { Config } from "../config.js";
import type { LLMProvider } from "./types.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import { OllamaProvider } from "./ollama.js";

function die(message: string): never {
  throw new Error(message);
}

export function createProvider(config: Config): LLMProvider {
  const { provider, model, apiKey, baseUrl } = config.llm;

  switch (provider) {
    case "anthropic":
      return new AnthropicProvider(
        apiKey ?? process.env["ANTHROPIC_API_KEY"] ?? die("ANTHROPIC_API_KEY is not set"),
        model,
      );
    case "openai":
      return new OpenAIProvider(
        apiKey ?? process.env["OPENAI_API_KEY"] ?? die("OPENAI_API_KEY is not set"),
        model,
        baseUrl,
      );
    case "ollama":
      return new OllamaProvider(model, baseUrl);
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${String(_exhaustive)}`);
    }
  }
}

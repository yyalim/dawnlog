import type { LLMProvider, LLMRequest } from "../../src/llm/types.js";

export class MockLLMProvider implements LLMProvider {
  name = "mock";
  calls: LLMRequest[] = [];
  response: string;

  constructor(
    response = "# Dawnlog — 2025-01-27\n\n## Yesterday\n- Did stuff\n\n## Today\n- More stuff",
  ) {
    this.response = response;
  }

  async complete(req: LLMRequest): Promise<string> {
    this.calls.push(req);
    return this.response;
  }
}

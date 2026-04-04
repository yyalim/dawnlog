export interface LLMRequest {
  systemPrompt: string;
  userPrompt: string;
}

export interface LLMProvider {
  name: string;
  complete(req: LLMRequest): Promise<string>;
}

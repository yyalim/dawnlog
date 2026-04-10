import React from "react";
import { render, Box, Text } from "ink";
import { saveConfig, DEFAULT_OUTPUT_DIR, DEFAULT_TEMPLATE_PATH, DEFAULT_SYSTEM_PROMPT_PATH } from "./config.js";
import type { Config } from "./config.js";
import { askSingleLine, askSelect } from "./tui.js";
import { StatusMessage } from "./components.js";

function renderOnce(node: React.ReactNode): void {
  const instance = render(node);
  instance.unmount();
}

export async function runSetupWizard(): Promise<Config> {
  renderOnce(
    <Box flexDirection="column" marginY={1}>
      <Text color="cyan">✦ dawnlog setup</Text>
      <Text>{"\n"}Let's configure dawnlog. Press Enter to accept defaults.</Text>
    </Box>,
  );

  // Repos
  const repos: string[] = [];
  renderOnce(
    <Box flexDirection="column">
      <Text color="cyan">Git repositories to scan:</Text>
      <Text dimColor>(Enter absolute paths one at a time. Leave blank to finish.)</Text>
    </Box>,
  );

  while (true) {
    const repoPath = await askSingleLine(`  Repo path ${repos.length + 1}`);
    if (!repoPath) break;
    repos.push(repoPath);
    renderOnce(<StatusMessage type="success">Added: {repoPath}</StatusMessage>);
  }

  if (repos.length === 0) {
    renderOnce(
      <StatusMessage type="warning">No repos added. You can add them later with: dawnlog config --edit</StatusMessage>,
    );
  }

  // LLM provider
  const provider = await askSelect<"anthropic" | "openai" | "ollama">(
    "LLM provider:",
    [
      { label: "Anthropic (Claude)", value: "anthropic" },
      { label: "OpenAI (GPT-4o)", value: "openai" },
      { label: "Ollama (local)", value: "ollama" },
    ],
  );

  let apiKey: string | undefined;
  let model: string | undefined;
  let baseUrl: string | undefined;

  if (provider === "anthropic") {
    const key = await askSingleLine("Anthropic API key (or set ANTHROPIC_API_KEY env var)");
    if (key) apiKey = key;
    const m = await askSingleLine("Model", "claude-opus-4-5");
    if (m && m !== "claude-opus-4-5") model = m;
  } else if (provider === "openai") {
    const key = await askSingleLine("OpenAI API key (or set OPENAI_API_KEY env var)");
    if (key) apiKey = key;
    const m = await askSingleLine("Model", "gpt-4o");
    if (m && m !== "gpt-4o") model = m;
    const bu = await askSingleLine("Base URL (leave blank for OpenAI default)");
    if (bu) baseUrl = bu;
  } else if (provider === "ollama") {
    const m = await askSingleLine("Model", "llama3");
    if (m && m !== "llama3") model = m;
    const bu = await askSingleLine("Base URL", "http://localhost:11434");
    if (bu && bu !== "http://localhost:11434") baseUrl = bu;
  }

  const outputDir = await askSingleLine("Output directory", DEFAULT_OUTPUT_DIR);
  const author = await askSingleLine("Git author filter (optional — email or name, leave blank to include all)");
  const ticketBaseUrl = await askSingleLine(
    "Ticket base URL for linkification (optional, e.g. https://yourco.atlassian.net/browse)",
  );

  const config: Config = {
    repos,
    llm: {
      provider,
      ...(model ? { model } : {}),
      ...(apiKey ? { apiKey } : {}),
      ...(baseUrl ? { baseUrl } : {}),
    },
    outputDir: outputDir || DEFAULT_OUTPUT_DIR,
    templatePath: DEFAULT_TEMPLATE_PATH,
    systemPromptPath: DEFAULT_SYSTEM_PROMPT_PATH,
    ...(author ? { author } : {}),
    ...(ticketBaseUrl ? { ticketBaseUrl } : {}),
  };

  await saveConfig(config);
  renderOnce(
    <Box marginY={1}>
      <StatusMessage type="success">Configuration saved.</StatusMessage>
    </Box>,
  );

  return config;
}

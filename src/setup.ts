import chalk from "chalk";
import { saveConfig, DEFAULT_OUTPUT_DIR, DEFAULT_TEMPLATE_PATH, DEFAULT_SYSTEM_PROMPT_PATH } from "./config.js";
import type { Config } from "./config.js";
import { askSingleLine, askSelect } from "./tui.js";

export async function runSetupWizard(): Promise<Config> {
  console.log(chalk.cyan("\n✦ dawnlog setup\n"));
  console.log("Let's configure dawnlog. Press Enter to accept defaults.\n");

  // Repos
  const repos: string[] = [];
  console.log(chalk.cyan("Git repositories to scan:"));
  console.log('(Enter absolute paths one at a time. Leave blank to finish.)\n');

  while (true) {
    const repoPath = await askSingleLine(`  Repo path ${repos.length + 1}`);
    if (!repoPath) break;
    repos.push(repoPath);
    console.log(chalk.green(`  ✓ Added: ${repoPath}`));
  }

  if (repos.length === 0) {
    console.log(chalk.yellow("  No repos added. You can add them later with: dawnlog config --edit"));
  }

  // LLM provider
  console.log("");
  const provider = await askSelect<"anthropic" | "openai" | "ollama">(
    chalk.cyan("LLM provider:"),
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
    console.log("");
    const key = await askSingleLine(
      chalk.cyan("Anthropic API key (or set ANTHROPIC_API_KEY env var)"),
    );
    if (key) apiKey = key;

    const m = await askSingleLine(chalk.cyan("Model"), "claude-opus-4-5");
    if (m && m !== "claude-opus-4-5") model = m;
  } else if (provider === "openai") {
    console.log("");
    const key = await askSingleLine(
      chalk.cyan("OpenAI API key (or set OPENAI_API_KEY env var)"),
    );
    if (key) apiKey = key;

    const m = await askSingleLine(chalk.cyan("Model"), "gpt-4o");
    if (m && m !== "gpt-4o") model = m;

    const bu = await askSingleLine(
      chalk.cyan("Base URL (leave blank for OpenAI default)"),
    );
    if (bu) baseUrl = bu;
  } else if (provider === "ollama") {
    console.log("");
    const m = await askSingleLine(chalk.cyan("Model"), "llama3");
    if (m && m !== "llama3") model = m;

    const bu = await askSingleLine(chalk.cyan("Base URL"), "http://localhost:11434");
    if (bu && bu !== "http://localhost:11434") baseUrl = bu;
  }

  // Output dir
  console.log("");
  const outputDir = await askSingleLine(chalk.cyan("Output directory"), DEFAULT_OUTPUT_DIR);

  // Author filter
  console.log("");
  const author = await askSingleLine(
    chalk.cyan("Git author filter (optional — email or name, leave blank to include all)"),
  );

  // Ticket base URL
  console.log("");
  const ticketBaseUrl = await askSingleLine(
    chalk.cyan("Ticket base URL for linkification (optional, e.g. https://yourco.atlassian.net/browse)"),
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
  console.log(chalk.green("\n✓ Configuration saved.\n"));

  return config;
}

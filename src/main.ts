#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { loadConfig, saveConfig, configExists, type Config } from "./config.js";
import { createProvider } from "./llm/index.js";
import { fetchAndDisplayCommits, runPipeline } from "./pipeline.js";
import { runSetupWizard } from "./setup.js";
import { askMultiline, askSelect } from "./tui.js";

const program = new Command();

program
  .name("dawnlog")
  .description("Generate daily developer standup reports")
  .version("0.1.0")
  .option("--today <plan>", "Skip interactive prompt and use this as today's plan")
  .option("--provider <name>", "Override the LLM provider for this run")
  .option("--dry-run", "Print prompts without calling the LLM or saving a file")
  .option("--since <date>", "Query commits from a specific date (YYYY-MM-DD) instead of last working day");

async function runCommand(options: {
  today?: string;
  provider?: string;
  dryRun?: boolean;
  since?: string;
}): Promise<void> {
  // First-run detection
  const hasConfig = await configExists();
  let config = await loadConfig();

  if (!hasConfig) {
    console.log(chalk.yellow("No configuration found. Starting setup wizard...\n"));
    config = await runSetupWizard();
  }

  // Provider override
  if (options.provider) {
    const validProviders = ["anthropic", "openai", "ollama"] as const;
    type Provider = (typeof validProviders)[number];
    if (!validProviders.includes(options.provider as Provider)) {
      throw new Error(`Unknown provider: ${options.provider}. Valid options: anthropic, openai, ollama`);
    }
    config = { ...config, llm: { ...config.llm, provider: options.provider as Provider } };
  }

  // Fetch and display commits before asking for today's plan
  const { commits, since } = await fetchAndDisplayCommits({
    repos: config.repos,
    author: config.author,
    since: options.since,
  });

  // Collect today's plan
  let todayPlan: string;
  if (options.today) {
    todayPlan = options.today;
  } else if (!options.dryRun) {
    todayPlan = await askMultiline("What's your plan for today?");
  } else {
    todayPlan = "(dry run — no plan entered)";
  }

  const llm = createProvider(config);

  const spinner = options.dryRun ? null : ora("Generating standup report...").start();
  try {
    const result = await runPipeline({
      commits,
      since,
      llm,
      outputDir: config.outputDir,
      templatePath: config.templatePath,
      systemPromptPath: config.systemPromptPath,
      todayPlan,
      ticketBaseUrl: config.ticketBaseUrl,
      dryRun: options.dryRun,
    });

    spinner?.stop();

    if (!options.dryRun && result.outputPath) {
      console.log(chalk.green(`\n✓ Standup saved to: ${result.outputPath}\n`));
    }
  } catch (err) {
    spinner?.stop();
    throw err;
  }
}

// Default action (dawnlog with no subcommand)
program.action(async (options: { today?: string; provider?: string; dryRun?: boolean; since?: string }) => {
  await runCommand(options);
});

// Apply a dot-notation key=value to the config object in-place
function applyConfigSet(config: Config, key: string, value: string): void {
  const validKeys: Record<string, (v: string) => void> = {
    "llm.provider": (v) => {
      const valid = ["anthropic", "openai", "ollama"] as const;
      if (!valid.includes(v as typeof valid[number])) {
        throw new Error(`Invalid provider "${v}". Valid: ${valid.join(", ")}`);
      }
      config.llm.provider = v as typeof valid[number];
    },
    "llm.model":      (v) => { config.llm.model = v; },
    "llm.apiKey":     (v) => { config.llm.apiKey = v; },
    "llm.baseUrl":    (v) => { config.llm.baseUrl = v; },
    "outputDir":        (v) => { config.outputDir = v.replace(/^~/, process.env.HOME ?? "~"); },
    "templatePath":     (v) => { config.templatePath = v.replace(/^~/, process.env.HOME ?? "~"); },
    "systemPromptPath": (v) => { config.systemPromptPath = v.replace(/^~/, process.env.HOME ?? "~"); },
    "author":         (v) => { config.author = v; },
    "ticketBaseUrl":  (v) => { config.ticketBaseUrl = v; },
  };

  const setter = validKeys[key];
  if (!setter) {
    throw new Error(
      `Unknown config key: "${key}"\nValid keys: ${Object.keys(validKeys).join(", ")}`
    );
  }
  setter(value);
}

// config subcommand
program
  .command("config")
  .description("View or edit configuration")
  .option("--show", "Print current configuration")
  .option("--edit", "Re-run the setup wizard")
  .option("--set <key=value>", "Set a config value (e.g. --set llm.model=llama3.2)")
  .option("--add-repo <path>", "Add a repo path to the repos list")
  .option("--remove-repo <path>", "Remove a repo path from the repos list")
  .action(async (options: {
    show?: boolean;
    edit?: boolean;
    set?: string;
    addRepo?: string;
    removeRepo?: string;
  }) => {
    if (options.show) {
      const config = await loadConfig();
      console.log(chalk.cyan("\nCurrent configuration:\n"));
      console.log(JSON.stringify(config, null, 2));
      console.log("");
    } else if (options.edit) {
      await runSetupWizard();
    } else if (options.set) {
      const eqIdx = options.set.indexOf("=");
      if (eqIdx === -1) {
        throw new Error(`--set requires key=value format (e.g. --set llm.model=llama3.2)`);
      }
      const key = options.set.slice(0, eqIdx).trim();
      const value = options.set.slice(eqIdx + 1).trim();
      const config = await loadConfig();
      applyConfigSet(config, key, value);
      await saveConfig(config);
      console.log(chalk.green(`\n✓ Set ${key} = ${value}\n`));
    } else if (options.addRepo) {
      const config = await loadConfig();
      const expanded = options.addRepo.replace(/^~/, process.env.HOME ?? "~");
      if (config.repos.includes(expanded)) {
        console.log(chalk.yellow(`\nRepo already in list: ${expanded}\n`));
      } else {
        config.repos.push(expanded);
        await saveConfig(config);
        console.log(chalk.green(`\n✓ Added repo: ${expanded}\n`));
      }
    } else if (options.removeRepo) {
      const config = await loadConfig();
      const expanded = options.removeRepo.replace(/^~/, process.env.HOME ?? "~");
      const idx = config.repos.indexOf(expanded);
      if (idx === -1) {
        throw new Error(`Repo not found in config: ${expanded}`);
      }
      config.repos.splice(idx, 1);
      await saveConfig(config);
      console.log(chalk.green(`\n✓ Removed repo: ${expanded}\n`));
    } else {
      console.log([
        "",
        chalk.cyan("Usage:"),
        "  dawnlog config --show                          Print current config",
        "  dawnlog config --edit                          Re-run setup wizard",
        "  dawnlog config --set <key>=<value>             Set a config value",
        "  dawnlog config --add-repo <path>               Add a repo",
        "  dawnlog config --remove-repo <path>            Remove a repo",
        "",
        chalk.cyan("Settable keys:"),
        "  llm.provider       anthropic | openai | ollama",
        "  llm.model          e.g. claude-haiku-4-5, gpt-4o, llama3.2",
        "  llm.apiKey         API key (or set via env var)",
        "  llm.baseUrl        Base URL (Ollama default: http://localhost:11434)",
        "  outputDir          Directory where .md files are saved",
        "  templatePath       Path to the standup template",
        "  author             Git author filter (name or email)",
        "  ticketBaseUrl      Ticket URL prefix for linkifying IDs",
        "",
      ].join("\n"));
    }
  });

// provider subcommand
program
  .command("provider")
  .description("Switch the default LLM provider")
  .action(async () => {
    const config = await loadConfig();

    const provider = await askSelect<"anthropic" | "openai" | "ollama">(
      "Select LLM provider:",
      [
        { label: "Anthropic (Claude)", value: "anthropic" },
        { label: "OpenAI (GPT-4o)", value: "openai" },
        { label: "Ollama (local)", value: "ollama" },
      ],
    );

    const updated = { ...config, llm: { ...config.llm, provider } };
    await saveConfig(updated);
    console.log(chalk.green(`\n✓ Default provider set to: ${provider}\n`));
  });

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(chalk.red(`\nError: ${err.message}\n`));
  process.exit(1);
});

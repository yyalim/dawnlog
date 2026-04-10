#!/usr/bin/env node
import type React from "react";
import { render, renderToString, Text, Box } from "ink";
import { Command } from "commander";
import { loadConfig, saveConfig, configExists, type Config } from "./config.js";
import { createProvider } from "./llm/index.js";
import { fetchCommits, runPipeline } from "./pipeline.js";
import { runSetupWizard } from "./setup.js";
import { askMultiline, askSelect } from "./tui.js";
import { StatusMessage, Spinner, CommitList, DryRunOutput, ConfigDisplay, ConfigUsage } from "./components.js";

function renderOnce(node: React.ReactNode): void {
  const output = renderToString(node);
  process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
}

const program = new Command();

program
  .name("dawnlog")
  .description("Generate daily developer standup reports")
  .version("0.1.0")
  .option("--today <plan>", "Skip interactive prompt and use this as today's plan")
  .option("--provider <name>", "Override the LLM provider for this run")
  .option("--dry-run", "Print prompts without calling the LLM or saving a file")
  .option("--since <date>", "Query commits from a specific date (YYYY-MM-DD) instead of last working day")
  .option("--yesterday <notes>", "Skip interactive prompt and use this as additional yesterday notes");

async function runCommand(options: {
  today?: string;
  yesterday?: string;
  provider?: string;
  dryRun?: boolean;
  since?: string;
}): Promise<void> {
  // First-run detection
  const hasConfig = await configExists();
  let config = await loadConfig();

  if (!hasConfig) {
    renderOnce(
      <StatusMessage type="warning">No configuration found. Starting setup wizard...</StatusMessage>,
    );
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

  // Fetch and display commits
  const { commits, since } = await fetchCommits({
    repos: config.repos,
    author: config.author,
    since: options.since,
  });

  renderOnce(<CommitList commits={commits} />);

  // Collect additional yesterday notes (meetings, planning, etc.)
  let yesterdayNotes: string | undefined;
  if (!options.dryRun && !options.yesterday) {
    yesterdayNotes = await askMultiline("Anything else from yesterday not in the commits? (e.g. meetings, reviews, discussions)");
    if (!yesterdayNotes) yesterdayNotes = undefined;
  } else if (options.yesterday) {
    yesterdayNotes = options.yesterday;
  }

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

  if (options.dryRun) {
    const result = await runPipeline({
      commits,
      since,
      llm,
      outputDir: config.outputDir,
      templatePath: config.templatePath,
      systemPromptPath: config.systemPromptPath,
      todayPlan,
      ticketBaseUrl: config.ticketBaseUrl,
      yesterdayNotes,
      dryRun: true,
    });

    if (result.systemPrompt && result.userPrompt) {
      renderOnce(<DryRunOutput systemPrompt={result.systemPrompt} userPrompt={result.userPrompt} />);
    }
    return;
  }

  // Show spinner, run pipeline
  const spinnerInstance = render(<Spinner label="Generating standup report..." />);
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
      yesterdayNotes,
    });

    spinnerInstance.unmount();

    if (result.outputPath) {
      renderOnce(
        <Box marginY={1}>
          <StatusMessage type="success">Standup saved to: {result.outputPath}</StatusMessage>
        </Box>,
      );
    }
  } catch (err) {
    spinnerInstance.unmount();
    throw err;
  }
}

// Default action (dawnlog with no subcommand)
program.action(async (options: { today?: string; yesterday?: string; provider?: string; dryRun?: boolean; since?: string }) => {
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
      `Unknown config key: "${key}"\nValid keys: ${Object.keys(validKeys).join(", ")}`,
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
      renderOnce(<ConfigDisplay config={config} />);
    } else if (options.edit) {
      await runSetupWizard();
    } else if (options.set) {
      const eqIdx = options.set.indexOf("=");
      if (eqIdx === -1) {
        throw new Error("--set requires key=value format (e.g. --set llm.model=llama3.2)");
      }
      const key = options.set.slice(0, eqIdx).trim();
      const value = options.set.slice(eqIdx + 1).trim();
      const config = await loadConfig();
      applyConfigSet(config, key, value);
      await saveConfig(config);
      renderOnce(
        <Box marginY={1}>
          <StatusMessage type="success">Set {key} = {value}</StatusMessage>
        </Box>,
      );
    } else if (options.addRepo) {
      const config = await loadConfig();
      const expanded = options.addRepo.replace(/^~/, process.env.HOME ?? "~");
      if (config.repos.includes(expanded)) {
        renderOnce(
          <Box marginY={1}>
            <StatusMessage type="warning">Repo already in list: {expanded}</StatusMessage>
          </Box>,
        );
      } else {
        config.repos.push(expanded);
        await saveConfig(config);
        renderOnce(
          <Box marginY={1}>
            <StatusMessage type="success">Added repo: {expanded}</StatusMessage>
          </Box>,
        );
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
      renderOnce(
        <Box marginY={1}>
          <StatusMessage type="success">Removed repo: {expanded}</StatusMessage>
        </Box>,
      );
    } else {
      renderOnce(<ConfigUsage />);
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
    renderOnce(
      <Box marginY={1}>
        <StatusMessage type="success">Default provider set to: {provider}</StatusMessage>
      </Box>,
    );
  });

program.parseAsync(process.argv).catch((err: Error) => {
  renderOnce(
    <Box marginY={1}>
      <Text color="red">Error: {err.message}</Text>
    </Box>,
  );
  process.exit(1);
});

import fs from "fs/promises";
import chalk from "chalk";
import { getLastWorkingDay, parseDateRange, getCommitsForAllRepos } from "./git.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import { saveOutput } from "./output.js";
import type { LLMProvider } from "./llm/types.js";

export interface PipelineOptions {
  repos: string[];
  llm: LLMProvider;
  outputDir: string;
  templatePath: string;
  systemPromptPath: string;
  todayPlan: string;
  author?: string;
  ticketBaseUrl?: string;
  dryRun?: boolean;
  since?: string; // YYYY-MM-DD override — skips last-working-day logic
}

export interface PipelineResult {
  outputPath: string;
  content: string;
}

export async function runPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const { since, until } = opts.since ? parseDateRange(opts.since) : getLastWorkingDay();

  const commits = await getCommitsForAllRepos(opts.repos, since, until, opts.author);

  const [templateContent, systemPromptTemplate] = await Promise.all([
    fs.readFile(opts.templatePath, "utf-8"),
    fs.readFile(opts.systemPromptPath, "utf-8"),
  ]);

  const now = new Date();
  const systemPrompt = buildSystemPrompt(systemPromptTemplate);
  const userPrompt = buildUserPrompt(commits, opts.todayPlan, since, now, templateContent, opts.ticketBaseUrl);

  if (opts.dryRun) {
    console.log(chalk.bold("\n─── SYSTEM PROMPT ───\n"));
    console.log(systemPrompt);
    console.log(chalk.bold("\n─── USER PROMPT ───\n"));
    console.log(userPrompt);
    console.log(chalk.bold("\n─── (dry run — LLM not called, no file written) ───\n"));
    return { outputPath: "", content: "" };
  }

  const content = await opts.llm.complete({ systemPrompt, userPrompt });

  const outputPath = await saveOutput(content, opts.outputDir, now);

  return { outputPath, content };
}

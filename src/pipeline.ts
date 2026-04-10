import fs from "fs/promises";
import chalk from "chalk";
import { getLastWorkingDay, parseDateRange, getCommitsForAllRepos, type Commit } from "./git.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import { saveOutput } from "./output.js";
import type { LLMProvider } from "./llm/types.js";

export interface FetchCommitsOptions {
  repos: string[];
  author?: string;
  since?: string;
}

export async function fetchAndDisplayCommits(opts: FetchCommitsOptions): Promise<{ commits: Commit[]; since: Date; until: Date }> {
  const { since, until } = opts.since ? parseDateRange(opts.since) : getLastWorkingDay();
  const commits = await getCommitsForAllRepos(opts.repos, since, until, opts.author);

  if (commits.length > 0) {
    const grouped = new Map<string, Commit[]>();
    for (const commit of commits) {
      const list = grouped.get(commit.repo) ?? [];
      list.push(commit);
      grouped.set(commit.repo, list);
    }

    console.log("");
    for (const [repo, repoCommits] of grouped) {
      console.log(chalk.cyan(`  ${repo}`) + chalk.dim(` (${repoCommits.length} commit${repoCommits.length === 1 ? "" : "s"})`));
      for (const c of repoCommits) {
        console.log(chalk.dim(`    ${c.shortHash}`) + ` ${c.subject}`);
      }
    }
    console.log("");
  } else {
    console.log(chalk.dim("\n  No commits found for the last working day.\n"));
  }

  return { commits, since, until };
}

export interface PipelineOptions {
  commits: Commit[];
  since: Date;
  llm: LLMProvider;
  outputDir: string;
  templatePath: string;
  systemPromptPath: string;
  todayPlan: string;
  ticketBaseUrl?: string;
  dryRun?: boolean;
}

export interface PipelineResult {
  outputPath: string;
  content: string;
}

export async function runPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const [templateContent, systemPromptTemplate] = await Promise.all([
    fs.readFile(opts.templatePath, "utf-8"),
    fs.readFile(opts.systemPromptPath, "utf-8"),
  ]);

  const now = new Date();
  const systemPrompt = buildSystemPrompt(systemPromptTemplate);
  const userPrompt = buildUserPrompt(opts.commits, opts.todayPlan, opts.since, now, templateContent, opts.ticketBaseUrl);

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

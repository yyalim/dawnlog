import fs from "fs/promises";
import { getLastWorkingDay, parseDateRange, getCommitsForAllRepos, type Commit } from "./git.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import { saveOutput } from "./output.js";
import type { LLMProvider } from "./llm/types.js";

export interface FetchCommitsOptions {
  repos: string[];
  author?: string;
  since?: string;
}

export async function fetchCommits(opts: FetchCommitsOptions): Promise<{ commits: Commit[]; since: Date; until: Date }> {
  const { since, until } = opts.since ? parseDateRange(opts.since) : getLastWorkingDay();
  const commits = await getCommitsForAllRepos(opts.repos, since, until, opts.author);
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
  yesterdayNotes?: string;
  ticketBaseUrl?: string;
  dryRun?: boolean;
}

export interface PipelineResult {
  outputPath: string;
  content: string;
  systemPrompt?: string;
  userPrompt?: string;
}

export async function runPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const [templateContent, systemPromptTemplate] = await Promise.all([
    fs.readFile(opts.templatePath, "utf-8"),
    fs.readFile(opts.systemPromptPath, "utf-8"),
  ]);

  const now = new Date();
  const systemPrompt = buildSystemPrompt(systemPromptTemplate);
  const userPrompt = buildUserPrompt(opts.commits, opts.todayPlan, opts.since, now, templateContent, opts.ticketBaseUrl, opts.yesterdayNotes);

  if (opts.dryRun) {
    return { outputPath: "", content: "", systemPrompt, userPrompt };
  }

  const content = await opts.llm.complete({ systemPrompt, userPrompt });
  const outputPath = await saveOutput(content, opts.outputDir, now);

  return { outputPath, content };
}

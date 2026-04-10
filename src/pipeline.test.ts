import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { fetchCommits, runPipeline } from "./pipeline.js";
import { MockLLMProvider } from "../tests/helpers/mockProvider.js";
import { createFakeRepo, destroyFakeRepo } from "../tests/helpers/fakeRepo.js";
import { DEFAULT_TEMPLATE_PATH, DEFAULT_SYSTEM_PROMPT_PATH } from "./config.js";

const TARGET_DAY = "2025-01-28"; // Tuesday

describe("runPipeline — dry-run", () => {
  let outputDir: string;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TARGET_DAY}T09:00:00`));
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "dawnlog-pipeline-"));
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  test("dryRun: true — LLM is never called", async () => {
    const repo = createFakeRepo([
      { message: "feat: some work", date: "2025-01-27T10:00:00" },
    ]);

    try {
      const llm = new MockLLMProvider();
      const { commits, since } = await fetchCommits({ repos: [repo] });
      await runPipeline({
        commits,
        since,
        llm,
        outputDir,
        templatePath: DEFAULT_TEMPLATE_PATH,
        systemPromptPath: DEFAULT_SYSTEM_PROMPT_PATH,
        todayPlan: "Review PRs",
        dryRun: true,
      });

      expect(llm.calls).toHaveLength(0);
    } finally {
      destroyFakeRepo(repo);
    }
  });

  test("dryRun: true — no file is written to outputDir", async () => {
    const repo = createFakeRepo([
      { message: "feat: some work", date: "2025-01-27T10:00:00" },
    ]);

    try {
      const llm = new MockLLMProvider();
      const { commits, since } = await fetchCommits({ repos: [repo] });
      await runPipeline({
        commits,
        since,
        llm,
        outputDir,
        templatePath: DEFAULT_TEMPLATE_PATH,
        systemPromptPath: DEFAULT_SYSTEM_PROMPT_PATH,
        todayPlan: "Review PRs",
        dryRun: true,
      });

      const files = fs.readdirSync(outputDir);
      expect(files).toHaveLength(0);
    } finally {
      destroyFakeRepo(repo);
    }
  });

  test("dryRun: true — returns empty outputPath and content", async () => {
    const repo = createFakeRepo([
      { message: "feat: some work", date: "2025-01-27T10:00:00" },
    ]);

    try {
      const llm = new MockLLMProvider();
      const { commits, since } = await fetchCommits({ repos: [repo] });
      const result = await runPipeline({
        commits,
        since,
        llm,
        outputDir,
        templatePath: DEFAULT_TEMPLATE_PATH,
        systemPromptPath: DEFAULT_SYSTEM_PROMPT_PATH,
        todayPlan: "Review PRs",
        dryRun: true,
      });

      expect(result.outputPath).toBe("");
      expect(result.content).toBe("");
    } finally {
      destroyFakeRepo(repo);
    }
  });

  test("dryRun: false — LLM is called and file is written", async () => {
    const repo = createFakeRepo([
      { message: "feat: some work", date: "2025-01-27T10:00:00" },
    ]);

    try {
      const llm = new MockLLMProvider();
      const { commits, since } = await fetchCommits({ repos: [repo] });
      const result = await runPipeline({
        commits,
        since,
        llm,
        outputDir,
        templatePath: DEFAULT_TEMPLATE_PATH,
        systemPromptPath: DEFAULT_SYSTEM_PROMPT_PATH,
        todayPlan: "Review PRs",
        dryRun: false,
      });

      expect(llm.calls).toHaveLength(1);
      expect(result.outputPath).toMatch(/dawnlog-2025-01-28\.md$/);
      expect(fs.existsSync(result.outputPath)).toBe(true);
    } finally {
      destroyFakeRepo(repo);
    }
  });

  test("dryRun: true — returns system prompt and user prompt in result", async () => {
    const repo = createFakeRepo([
      { message: "feat: some work", date: "2025-01-27T10:00:00" },
    ]);

    try {
      const llm = new MockLLMProvider();
      const { commits, since } = await fetchCommits({ repos: [repo] });
      const result = await runPipeline({
        commits,
        since,
        llm,
        outputDir,
        templatePath: DEFAULT_TEMPLATE_PATH,
        systemPromptPath: DEFAULT_SYSTEM_PROMPT_PATH,
        todayPlan: "Review PRs",
        dryRun: true,
      });

      expect(result.systemPrompt).toBeDefined();
      expect(result.userPrompt).toBeDefined();
      expect(result.systemPrompt!.length).toBeGreaterThan(0);
      expect(result.userPrompt!.length).toBeGreaterThan(0);
    } finally {
      destroyFakeRepo(repo);
    }
  });
});

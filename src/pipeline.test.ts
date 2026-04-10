import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { fetchAndDisplayCommits, runPipeline } from "./pipeline.js";
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
      const { commits, since } = await fetchAndDisplayCommits({ repos: [repo] });
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
      const { commits, since } = await fetchAndDisplayCommits({ repos: [repo] });
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
      const { commits, since } = await fetchAndDisplayCommits({ repos: [repo] });
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
      const { commits, since } = await fetchAndDisplayCommits({ repos: [repo] });
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

  test("dryRun: true — system prompt and user prompt are printed to console", async () => {
    const repo = createFakeRepo([
      { message: "feat: some work", date: "2025-01-27T10:00:00" },
    ]);

    // vitest intercepts console.log before process.stdout.write — spy at that level
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      const llm = new MockLLMProvider();
      const { commits, since } = await fetchAndDisplayCommits({ repos: [repo] });
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

      const allOutput = logSpy.mock.calls.flat().map(String).join("\n");
      expect(allOutput).toContain("SYSTEM PROMPT");
      expect(allOutput).toContain("USER PROMPT");
      expect(allOutput).toContain("dry run");
    } finally {
      logSpy.mockRestore();
      destroyFakeRepo(repo);
    }
  });
});

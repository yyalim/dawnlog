import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { fetchCommits, runPipeline } from "../../src/pipeline.js";
import { MockLLMProvider } from "../helpers/mockProvider.js";
import { createFakeRepo, destroyFakeRepo } from "../helpers/fakeRepo.js";
import { DEFAULT_TEMPLATE_PATH, DEFAULT_SYSTEM_PROMPT_PATH } from "../../src/config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makePipelineOpts(
  repos: string[],
  llm: MockLLMProvider,
  outputDir: string,
  overrides: Partial<Parameters<typeof runPipeline>[0] & { author?: string; sinceDate?: string }> = {},
) {
  const { author, sinceDate, ...rest } = overrides;
  const { commits, since } = await fetchCommits({ repos, author, since: sinceDate });
  return {
    commits,
    since,
    llm,
    outputDir,
    templatePath: DEFAULT_TEMPLATE_PATH,
    systemPromptPath: DEFAULT_SYSTEM_PROMPT_PATH,
    todayPlan: "Review PRs and write tests",
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("E2E — runPipeline", () => {
  let outputDir: string;

  beforeEach(() => {
    vi.useFakeTimers();
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "dawnlog-e2e-"));
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // 1. Normal Tuesday — picks up Monday's commits
  // -------------------------------------------------------------------------
  test("Normal Tuesday — picks up Monday's commits, saves dawnlog-YYYY-MM-DD.md", async () => {
    vi.setSystemTime(new Date("2025-01-28T09:00:00")); // Tuesday

    const repo = createFakeRepo([
      { message: "feat: add login page",  date: "2025-01-27T10:00:00" }, // Monday
      { message: "fix: token expiry bug", date: "2025-01-27T14:00:00" }, // Monday
    ]);

    try {
      const llm = new MockLLMProvider();
      const result = await runPipeline(await makePipelineOpts([repo], llm, outputDir));

      // File saved with today's date (Tuesday)
      expect(result.outputPath).toMatch(/dawnlog-2025-01-28\.md$/);
      expect(fs.existsSync(result.outputPath)).toBe(true);

      // LLM called exactly once
      expect(llm.calls).toHaveLength(1);

      // Monday's commits are in the user prompt
      expect(llm.calls[0]?.userPrompt).toContain("feat: add login page");
      expect(llm.calls[0]?.userPrompt).toContain("fix: token expiry bug");
    } finally {
      destroyFakeRepo(repo);
    }
  });

  // -------------------------------------------------------------------------
  // 2. Monday — picks up last Friday's commits across 2 repos
  // -------------------------------------------------------------------------
  test("Monday — picks up last Friday's commits across 2 repos", async () => {
    vi.setSystemTime(new Date("2025-01-27T09:00:00")); // Monday

    const repo1 = createFakeRepo([
      { message: "feat: add login",      date: "2025-01-24T10:00:00" }, // Friday
      { message: "fix: token expiry",    date: "2025-01-24T14:00:00" }, // Friday
    ]);
    const repo2 = createFakeRepo([
      { message: "chore: update deps",   date: "2025-01-24T11:00:00" }, // Friday
    ]);

    try {
      const llm = new MockLLMProvider();
      const result = await runPipeline(await makePipelineOpts([repo1, repo2], llm, outputDir));

      // File saved with today's date (Monday)
      expect(result.outputPath).toMatch(/dawnlog-2025-01-27\.md$/);
      expect(fs.existsSync(result.outputPath)).toBe(true);

      // All three Friday commits appear in the prompt
      expect(llm.calls[0]?.userPrompt).toContain("feat: add login");
      expect(llm.calls[0]?.userPrompt).toContain("fix: token expiry");
      expect(llm.calls[0]?.userPrompt).toContain("chore: update deps");
    } finally {
      destroyFakeRepo(repo1);
      destroyFakeRepo(repo2);
    }
  });

  // -------------------------------------------------------------------------
  // 3. No commits — pipeline completes gracefully, file still saved
  // -------------------------------------------------------------------------
  test("No commits — pipeline completes gracefully, file still saved", async () => {
    vi.setSystemTime(new Date("2025-01-28T09:00:00")); // Tuesday

    // Repo has commits, but none on the last working day (Monday Jan 27)
    const repo = createFakeRepo([
      { message: "feat: old work", date: "2025-01-20T10:00:00" }, // last week
    ]);

    try {
      const llm = new MockLLMProvider();
      const result = await runPipeline(await makePipelineOpts([repo], llm, outputDir));

      // File still saved
      expect(result.outputPath).toMatch(/dawnlog-2025-01-28\.md$/);
      expect(fs.existsSync(result.outputPath)).toBe(true);

      // LLM was still called (even with no commits)
      expect(llm.calls).toHaveLength(1);

      // No-commits message is in the prompt
      expect(llm.calls[0]?.userPrompt).toContain("No commits");
    } finally {
      destroyFakeRepo(repo);
    }
  });

  // -------------------------------------------------------------------------
  // 4. Multi-repo — commits from 3 repos all appear in the LLM prompt
  // -------------------------------------------------------------------------
  test("Multi-repo — commits from 3 repos all appear in the LLM prompt", async () => {
    vi.setSystemTime(new Date("2025-01-28T09:00:00")); // Tuesday

    const repo1 = createFakeRepo([
      { message: "feat: repo1 feature", date: "2025-01-27T09:00:00" },
    ]);
    const repo2 = createFakeRepo([
      { message: "fix: repo2 bugfix",   date: "2025-01-27T10:00:00" },
    ]);
    const repo3 = createFakeRepo([
      { message: "chore: repo3 chore",  date: "2025-01-27T11:00:00" },
    ]);

    try {
      const llm = new MockLLMProvider();
      await runPipeline(await makePipelineOpts([repo1, repo2, repo3], llm, outputDir));

      expect(llm.calls).toHaveLength(1);
      const prompt = llm.calls[0]?.userPrompt ?? "";
      expect(prompt).toContain("feat: repo1 feature");
      expect(prompt).toContain("fix: repo2 bugfix");
      expect(prompt).toContain("chore: repo3 chore");
    } finally {
      destroyFakeRepo(repo1);
      destroyFakeRepo(repo2);
      destroyFakeRepo(repo3);
    }
  });

  // -------------------------------------------------------------------------
  // 5. Author filter — only the filtered author's commits appear
  // -------------------------------------------------------------------------
  test("Author filter — only the filtered author's commits appear in the LLM prompt", async () => {
    vi.setSystemTime(new Date("2025-01-28T09:00:00")); // Tuesday

    const repo = createFakeRepo([
      { message: "feat: alice feature", date: "2025-01-27T09:00:00", author: "Alice", email: "alice@example.com" },
      { message: "fix: bob bugfix",     date: "2025-01-27T10:00:00", author: "Bob",   email: "bob@example.com" },
      { message: "chore: alice chore",  date: "2025-01-27T11:00:00", author: "Alice", email: "alice@example.com" },
    ]);

    try {
      const llm = new MockLLMProvider();
      await runPipeline(await makePipelineOpts([repo], llm, outputDir, { author: "alice@example.com" }));

      expect(llm.calls).toHaveLength(1);
      const prompt = llm.calls[0]?.userPrompt ?? "";

      // Alice's commits present
      expect(prompt).toContain("feat: alice feature");
      expect(prompt).toContain("chore: alice chore");

      // Bob's commit absent
      expect(prompt).not.toContain("fix: bob bugfix");
    } finally {
      destroyFakeRepo(repo);
    }
  });

  // -------------------------------------------------------------------------
  // 6. Weekend work included — Saturday/Sunday commits DO appear in a Monday run
  // -------------------------------------------------------------------------
  test("Weekend work included — Saturday/Sunday commits appear in a Monday run", async () => {
    vi.setSystemTime(new Date("2025-01-27T09:00:00")); // Monday

    // since=Fri Jan 24 00:00, until=Sun Jan 26 23:59 — weekend commits are in range
    const repo = createFakeRepo([
      { message: "feat: friday work",   date: "2025-01-24T16:00:00" }, // Friday
      { message: "feat: saturday hack", date: "2025-01-25T14:00:00" }, // Saturday
      { message: "fix: sunday fix",     date: "2025-01-26T10:00:00" }, // Sunday
    ]);

    try {
      const llm = new MockLLMProvider();
      await runPipeline(await makePipelineOpts([repo], llm, outputDir));

      expect(llm.calls).toHaveLength(1);
      const prompt = llm.calls[0]?.userPrompt ?? "";

      // All three days must appear
      expect(prompt).toContain("feat: friday work");
      expect(prompt).toContain("feat: saturday hack");
      expect(prompt).toContain("fix: sunday fix");
    } finally {
      destroyFakeRepo(repo);
    }
  });

  // -------------------------------------------------------------------------
  // Extra: --since override targets the specified date regardless of day
  // -------------------------------------------------------------------------
  test("--since override queries the specified date instead of last working day", async () => {
    vi.setSystemTime(new Date("2025-01-28T09:00:00")); // Tuesday

    const repo = createFakeRepo([
      { message: "feat: specific date work", date: "2025-01-22T10:00:00" }, // previous Wednesday
      { message: "feat: monday work",        date: "2025-01-27T10:00:00" }, // Monday (last working day)
    ]);

    try {
      const llm = new MockLLMProvider();
      await runPipeline(await makePipelineOpts([repo], llm, outputDir, { sinceDate: "2025-01-22" }));

      expect(llm.calls).toHaveLength(1);
      const prompt = llm.calls[0]?.userPrompt ?? "";

      // The explicit date's commit is included
      expect(prompt).toContain("feat: specific date work");

      // Monday's commit (the auto last-working-day) is NOT included
      expect(prompt).not.toContain("feat: monday work");
    } finally {
      destroyFakeRepo(repo);
    }
  });
});

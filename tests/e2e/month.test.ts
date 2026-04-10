import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { fetchAndDisplayCommits, runPipeline } from "../../src/pipeline.js";
import { getLastWorkingDay } from "../../src/git.js";
import { MockLLMProvider } from "../helpers/mockProvider.js";
import { createFakeRepo, destroyFakeRepo } from "../helpers/fakeRepo.js";
import { DEFAULT_TEMPLATE_PATH, DEFAULT_SYSTEM_PROMPT_PATH } from "../../src/config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Generate all Mon–Fri dates between start and end (inclusive), YYYY-MM-DD.
// Uses Date constructor with explicit year/month/day to stay timezone-safe.
function generateWorkdays(start: string, end: string): string[] {
  const [sy, sm, sd] = start.split("-").map(Number) as [number, number, number];
  const [ey, em, ed] = end.split("-").map(Number) as [number, number, number];

  const result: string[] = [];
  const current = new Date(sy, sm - 1, sd);
  const endDate = new Date(ey, em - 1, ed);

  while (current <= endDate) {
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, "0");
      const d = String(current.getDate()).padStart(2, "0");
      result.push(`${y}-${m}-${d}`);
    }
    current.setDate(current.getDate() + 1);
  }
  return result;
}

// Local-time date string, matches how formatOutputFilename works.
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Full January 2025 simulation
// ---------------------------------------------------------------------------

const JANUARY_2025_WORKDAYS = generateWorkdays("2025-01-01", "2025-01-31");

describe("E2E — full month simulation (January 2025)", () => {
  let outputDir: string;

  beforeEach(() => {
    vi.useFakeTimers();
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "dawnlog-month-"));
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  for (const day of JANUARY_2025_WORKDAYS) {
    test(`generates dawnlog for ${day}`, async () => {
      // Mock "today" to this workday at 09:00 local time
      vi.setSystemTime(new Date(`${day}T09:00:00`));

      // Find the last working day relative to the mocked "today"
      const { since } = getLastWorkingDay();
      const commitDate = localDateStr(since);

      const repo = createFakeRepo([
        { message: `feat: work on ${commitDate}`, date: `${commitDate}T10:00:00` },
      ]);

      try {
        const llm = new MockLLMProvider();
        const { commits, since: fetchedSince } = await fetchAndDisplayCommits({ repos: [repo] });
        const result = await runPipeline({
          commits,
          since: fetchedSince,
          llm,
          outputDir,
          templatePath: DEFAULT_TEMPLATE_PATH,
          systemPromptPath: DEFAULT_SYSTEM_PROMPT_PATH,
          todayPlan: "Continue work",
        });

        // Output file is named after "today" (the mocked date)
        const expectedFile = path.join(outputDir, `dawnlog-${day}.md`);
        expect(fs.existsSync(expectedFile)).toBe(true);
        expect(result.outputPath).toBe(expectedFile);

        // LLM was called
        expect(llm.calls).toHaveLength(1);

        // The commit from the last working day is in the prompt
        expect(llm.calls[0]?.userPrompt).toContain(`feat: work on ${commitDate}`);
      } finally {
        destroyFakeRepo(repo);
      }
    });
  }
});

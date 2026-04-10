# dawnlog — Project Context for Claude Code

## What this is

A TypeScript CLI tool that generates daily developer standup reports by:
1. Reading git commits from the last working day across multiple repos
2. Asking the user for their plan for today (Claude Code–style multiline TUI)
3. Sending everything to an LLM with the markdown template, which fills it in intelligently
4. Saving the result as a dated `.md` file

The goal is to eventually ship this as a product, so code quality, extensibility, and UX polish matter.

---

## Stack

- **Runtime:** Node.js 20+ with ESM (`"type": "module"`)
- **Language:** TypeScript 6 (strict mode)
- **CLI framework:** `commander`
- **Terminal UI:** raw `readline` (no heavy TUI lib) with `chalk` + `ora`
- **LLM SDKs:** `@anthropic-ai/sdk`, `openai`
- **Build:** `tsc` → `dist/`, `tsx` for dev

---

## Project structure

```
src/
├── main.ts         # CLI entrypoint — commands: run, config, provider
├── config.ts       # Config type, loader, saver (~/.dawnlog/config.json)
├── git.ts          # git log parser, multi-repo, last-working-day logic
├── prompt.ts       # Builds system + user prompts for the LLM
├── tui.ts          # Multiline interactive prompt, single-line prompt, select
├── setup.ts        # First-run wizard
├── output.ts       # Saves .md file to outputDir
└── llm/
    ├── types.ts    # LLMProvider interface { name, complete(req) }
    ├── index.ts    # createProvider() factory
    ├── anthropic.ts
    ├── openai.ts
    └── ollama.ts   # Local LLM via Ollama REST API
templates/
└── standup.md      # Default output template (LLM reads this and fills it)
```

---

## Key design decisions

- **Template-driven LLM output:** The LLM receives the raw markdown template in the system prompt and is instructed to reproduce its exact structure. Users can freely edit the template — no hardcoded sections.
- **Pluggable LLM providers:** All providers implement a single `LLMProvider` interface. Adding a new one (e.g. Gemini, Mistral) takes ~20 lines.
- **Last working day logic:** Monday → looks back to Friday. Avoids the "no commits" problem after weekends.
- **Author filtering:** Optional `author` field in config to filter `git log --author`, useful in shared repos.
- **No framework for TUI:** `readline` only — keeps the binary lean and dependency-light.

---

## Config shape (~/.dawnlog/config.json)

```ts
interface Config {
  repos: string[];          // absolute paths to git repos
  llm: {
    provider: "anthropic" | "openai" | "ollama";
    model?: string;
    apiKey?: string;        // falls back to env vars
    baseUrl?: string;       // for Ollama
  };
  outputDir: string;        // where .md files are saved (~/dawnlogs by default)
  author?: string;          // git author filter (email or name)
}
```

API keys fall back to `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` env vars.

---

## Commands

```bash
dawnlog                        # run (default command)
dawnlog run --today "..."      # skip interactive prompt
dawnlog run --provider ollama  # override provider for this run
dawnlog config --show          # print config
dawnlog config --edit          # re-run setup wizard
dawnlog provider               # switch default LLM interactively
```

---

## Planned features / good first tasks

- [ ] `dawnlog post` command: post output to Slack via webhook
- [ ] `dawnlog week` command: weekly summary across all logs in outputDir
- [ ] Config: `excludePatterns` to filter out noise commits (e.g. "chore: bump version")
- [ ] Config: named repo aliases (display "api-service" instead of full path)
- [ ] Shell completion (bash/zsh) via commander

---

## Dev workflow

```bash
npm run dev     # tsx src/main.ts (no build needed)
npm run build   # tsc → dist/
npm run lint    # tsc --noEmit (type-check only)
npm link        # makes `dawnlog` available globally after build
```

---

## Testing strategy

### Framework & setup

**Vitest** — use this, not Jest. Native ESM support, `vi.setSystemTime()` built-in, no transform config needed.

```bash
npm install -D vitest
```

```json
// package.json scripts
"test": "vitest run",
"test:watch": "vitest"
```

Test files live next to source in `src/` as `*.test.ts`, except e2e which goes in `tests/e2e/`.

---

### What to test and what to skip

| Module | Test type | Why |
|---|---|---|
| `git.ts` | Unit | Pure logic, highest value — time branching, commit parsing |
| `config.ts` | Unit | Merge/defaults logic, malformed JSON handling |
| `prompt.ts` | Snapshot | Catch accidental prompt regressions |
| `output.ts` | Unit | File path construction, dir creation |
| `llm/*.ts` | Skip | Thin SDK wrappers — mock the provider instead |
| `tui.ts` | Skip | Interactive readline — test manually |
| `main.ts` | E2E only | CLI orchestration belongs in integration tests |

---

### Fake repo factory

Use this pattern in all tests that touch `git.ts`. Creates a real temp git repo with commits at arbitrary dates, cleans up after.

```ts
// tests/helpers/fakeRepo.ts
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

export interface FakeCommit {
  message: string;
  date: string; // ISO string e.g. "2025-01-24T10:00:00"
  author?: string;
  email?: string;
}

export function createFakeRepo(commits: FakeCommit[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dawnlog-test-"));

  execSync("git init", { cwd: dir });
  execSync('git config user.email "test@test.com"', { cwd: dir });
  execSync('git config user.name "Test User"', { cwd: dir });

  for (const commit of commits) {
    const file = path.join(dir, `${Date.now()}.txt`);
    fs.writeFileSync(file, commit.message);
    execSync("git add .", { cwd: dir });

    const env = {
      ...process.env,
      GIT_AUTHOR_DATE: commit.date,
      GIT_COMMITTER_DATE: commit.date,
      GIT_AUTHOR_NAME: commit.author ?? "Test User",
      GIT_AUTHOR_EMAIL: commit.email ?? "test@test.com",
      GIT_COMMITTER_NAME: commit.author ?? "Test User",
      GIT_COMMITTER_EMAIL: commit.email ?? "test@test.com",
    };
    execSync(`git commit -m "${commit.message}"`, { cwd: dir, env });
  }

  return dir;
}

export function destroyFakeRepo(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}
```

---

### Time mocking pattern

Always use `vi.setSystemTime()` for anything that calls `getLastWorkingDay()`. Reset after each test.

```ts
import { vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test("Monday looks back to Friday", () => {
  vi.setSystemTime(new Date("2025-01-27T09:00:00")); // Monday
  const { since } = getLastWorkingDay();
  expect(since.getDay()).toBe(5); // Friday
  expect(since.toISOString().split("T")[0]).toBe("2025-01-24");
});
```

---

### Mock LLM provider

Use this in all e2e and integration tests. Never hit a real API in tests.

```ts
// tests/helpers/mockProvider.ts
import type { LLMProvider, LLMRequest } from "../../src/llm/types.js";

export class MockLLMProvider implements LLMProvider {
  name = "mock";
  calls: LLMRequest[] = [];
  response: string;

  constructor(response = "# Dawnlog — 2025-01-27\n\n## Yesterday\n- Did stuff\n\n## Today\n- More stuff") {
    this.response = response;
  }

  async complete(req: LLMRequest): Promise<string> {
    this.calls.push(req);
    return this.response;
  }
}
```

---

### Time matrix — cover all of these

```ts
// src/git.test.ts
const cases = [
  { label: "Tuesday → Monday",    date: "2025-01-28", expectedSince: "2025-01-27", expectedDay: 1 },
  { label: "Monday → Friday",     date: "2025-01-27", expectedSince: "2025-01-24", expectedDay: 5 },
  { label: "Wednesday → Tuesday", date: "2025-01-29", expectedSince: "2025-01-28", expectedDay: 2 },
  { label: "Saturday → Friday",   date: "2025-02-01", expectedSince: "2025-01-31", expectedDay: 5 },
  { label: "Sunday → Friday",     date: "2025-02-02", expectedSince: "2025-01-31", expectedDay: 5 },
];
```

---

### E2E scenario suite

Lives in `tests/e2e/run.test.ts`. Creates real temp repos, mocks time and LLM, runs the full pipeline, asserts the output file.

```ts
test("Monday: picks up Friday commits from multiple repos", async () => {
  vi.setSystemTime(new Date("2025-01-27T09:00:00")); // Monday

  const repo1 = createFakeRepo([
    { message: "feat: add login", date: "2025-01-24T10:00:00" },
    { message: "fix: token expiry", date: "2025-01-24T14:00:00" },
  ]);
  const repo2 = createFakeRepo([
    { message: "chore: update deps", date: "2025-01-24T11:00:00" },
  ]);

  const llm = new MockLLMProvider();
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "dawnlog-out-"));

  await runPipeline({ repos: [repo1, repo2], llm, outputDir, todayPlan: "Review PRs" });

  const outputFile = path.join(outputDir, "dawnlog-2025-01-27.md");
  expect(fs.existsSync(outputFile)).toBe(true);
  expect(llm.calls[0].userPrompt).toContain("feat: add login");
  expect(llm.calls[0].userPrompt).toContain("chore: update deps");

  destroyFakeRepo(repo1);
  destroyFakeRepo(repo2);
  fs.rmSync(outputDir, { recursive: true });
});
```

> Note: `runPipeline()` must be extracted from `main.ts` — see Session 1 prompt below.

---

### Simulating a full month

```ts
// tests/e2e/month.test.ts
const workdays = generateWorkdays("2025-01-01", "2025-01-31");

for (const day of workdays) {
  test(`generates dawnlog for ${day}`, async () => {
    vi.setSystemTime(new Date(`${day}T09:00:00`));
    const repo = createFakeRepo([
      { message: "feat: something", date: `${day}T09:00:00` },
    ]);
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "dawnlog-out-"));
    await runPipeline({ repos: [repo], llm: new MockLLMProvider(), outputDir, todayPlan: "work" });
    expect(fs.existsSync(path.join(outputDir, `dawnlog-${day}.md`))).toBe(true);
    destroyFakeRepo(repo);
    fs.rmSync(outputDir, { recursive: true });
  });
}
```

---

### What good coverage looks like

- `git.ts` → 100% branch coverage (all weekday cases + no-commits case + author filter)
- `config.ts` → valid config, missing file (defaults), malformed JSON, partial override
- `prompt.ts` → snapshot of system prompt with template, snapshot of user prompt with commits
- E2E → normal day, Monday, no commits, multi-repo, author filter, full month simulation

---

## Conventions

- All async, no callbacks
- Errors surface with a user-friendly `chalk.red` message and `process.exit(1)`
- New LLM providers go in `src/llm/` and must be registered in `src/llm/index.ts`
- The `LLMProvider` interface is the only contract — never import a provider directly outside its factory
- Spinner (`ora`) wraps any operation that hits the network or disk
- Output files are named `dawnlog-YYYY-MM-DD.md`
- Config dir is `~/.dawnlog/`, output dir is `~/dawnlogs/`

---

## Claude Code session prompts

Work through these **one session at a time**, in order. Each session has a single clear goal. Do not combine sessions.

---

### Session 0 — Initial build

```
Build the dawnlog CLI project from scratch as described in CLAUDE.md.

Requirements:
- Use the exact project structure defined in CLAUDE.md
- Name everything dawnlog from the start: binary, config dir (~/.dawnlog),
    output dir (~/dawnlogs), output files (dawnlog-YYYY-MM-DD.md)
- Implement all files: main.ts, config.ts, git.ts, prompt.ts, tui.ts,
    setup.ts, output.ts, and the full llm/ directory
- The TUI prompt must use raw readline only — no additional TUI libraries
- Include the default templates/standup.md template file
- Include a complete README.md
- Run `npm run lint` after to confirm zero type errors
- Run `npm run build` to confirm it compiles cleanly
```

---

### Session 1 — Extract runPipeline()

```
Refactor main.ts to extract a testable runPipeline() function.

Requirements:
- Create src/pipeline.ts with an exported async function runPipeline(opts: PipelineOptions)
- PipelineOptions must accept injected deps:
    repos: string[]
    llm: LLMProvider
    outputDir: string
    templatePath: string
    todayPlan: string
    author?: string
- runPipeline() contains all the logic currently in the `run` command action:
    fetching commits, building prompts, calling the LLM, saving output
- main.ts `run` command becomes a thin wrapper: reads config, creates the
    real LLMProvider, collects todayPlan from TUI, then calls runPipeline()
- runPipeline() must return { outputPath: string, content: string }
- No changes to tui.ts, config.ts, or any llm/ files
- Run `npm run lint` after to confirm zero type errors
```

---

### Session 2 — Test infrastructure + git.ts unit tests

```
Set up Vitest and write unit tests for git.ts.

Steps:
1. Install vitest as a dev dependency
2. Add to package.json scripts:
     "test": "vitest run"
     "test:watch": "vitest"
3. Create tests/helpers/fakeRepo.ts — implementation is in CLAUDE.md
4. Create tests/helpers/mockProvider.ts — implementation is in CLAUDE.md
5. Create src/git.test.ts covering:
   - Full time matrix from CLAUDE.md (all 5 weekday cases)
   - No commits → returns empty array
   - Author filter excludes other authors' commits
   - Commits on the wrong day are excluded
   - Multi-repo: each repo's commits are attributed correctly

Use vi.useFakeTimers() / vi.setSystemTime() for all date-dependent tests.
All tests must pass with `npm test`.
```

---

### Session 3 — E2E test suite

```
Write the full E2E test suite using runPipeline() and the test helpers.

Prerequisite: Sessions 1 and 2 must be complete first (runPipeline + test helpers).

Create tests/e2e/run.test.ts with these scenarios:
1. Normal Tuesday — picks up Monday's commits, saves dawnlog-YYYY-MM-DD.md
2. Monday — picks up last Friday's commits across 2 repos
3. No commits — pipeline completes gracefully, file still saved
4. Multi-repo — commits from 3 repos all appear in the LLM prompt
5. Author filter — only the filtered author's commits appear
6. Weekend commits excluded — Saturday/Sunday commits do not appear in a Monday run

Create tests/e2e/month.test.ts:
- Generate all workdays in January 2025
- For each day: create a fake repo with one commit, run pipeline, assert output file exists
- Clean up all temp dirs after each test

Use MockLLMProvider for everything — never call a real LLM API.
All tests must pass with `npm test`.
```

---

### Session 4 — --dry-run flag

```
Add a --dry-run flag to the `dawnlog run` command.

Behaviour:
- When --dry-run is passed, print the full LLM system prompt and user prompt
    to stdout, clearly labelled and separated
- Do not call the LLM
- Do not save any file
- Exit cleanly after printing

Implementation:
- Add --dry-run option to the run command in main.ts
- Add dryRun?: boolean to PipelineOptions in pipeline.ts
- In runPipeline(), if dryRun is true: print prompts and return early
- Add a unit test in src/pipeline.test.ts asserting that with dryRun: true,
    MockLLMProvider.complete() is never called and no file is written

Run `npm run lint` and `npm test` after.
```

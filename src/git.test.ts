import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { getLastWorkingDay, getCommitsForRepo, getCommitsForAllRepos } from "./git.js";
import { createFakeRepo, destroyFakeRepo } from "../tests/helpers/fakeRepo.js";

// Format a Date using local time — avoids UTC offset shifting the date when
// the machine is in a non-UTC timezone.
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// getLastWorkingDay — time matrix
// ---------------------------------------------------------------------------

describe("getLastWorkingDay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const cases = [
    // expectedUntil = yesterday (captures weekend work when today is Mon/Sun)
    { label: "Tuesday → Monday",    date: "2025-01-28T09:00:00", expectedSince: "2025-01-27", expectedUntil: "2025-01-27", expectedDay: 1 },
    { label: "Monday → Friday",     date: "2025-01-27T09:00:00", expectedSince: "2025-01-24", expectedUntil: "2025-01-26", expectedDay: 5 },
    { label: "Wednesday → Tuesday", date: "2025-01-29T09:00:00", expectedSince: "2025-01-28", expectedUntil: "2025-01-28", expectedDay: 2 },
    { label: "Saturday → Friday",   date: "2025-02-01T09:00:00", expectedSince: "2025-01-31", expectedUntil: "2025-01-31", expectedDay: 5 },
    { label: "Sunday → Friday",     date: "2025-02-02T09:00:00", expectedSince: "2025-01-31", expectedUntil: "2025-02-01", expectedDay: 5 },
  ];

  for (const { label, date, expectedSince, expectedUntil, expectedDay } of cases) {
    test(label, () => {
      vi.setSystemTime(new Date(date));
      const { since, until } = getLastWorkingDay();

      expect(since.getDay()).toBe(expectedDay);
      expect(localDateStr(since)).toBe(expectedSince);

      // since is start of day (local time)
      expect(since.getHours()).toBe(0);
      expect(since.getMinutes()).toBe(0);
      expect(since.getSeconds()).toBe(0);

      // until is end-of-day yesterday — may span into the weekend
      expect(localDateStr(until)).toBe(expectedUntil);
      expect(until.getHours()).toBe(23);
      expect(until.getMinutes()).toBe(59);
      expect(until.getSeconds()).toBe(59);
    });
  }
});

// ---------------------------------------------------------------------------
// getCommitsForRepo
// ---------------------------------------------------------------------------

describe("getCommitsForRepo", () => {
  const TARGET_DAY = "2025-01-24"; // a Friday
  const since = new Date(`${TARGET_DAY}T00:00:00`);
  const until = new Date(`${TARGET_DAY}T23:59:59`);

  test("returns commits on the target day", async () => {
    const repo = createFakeRepo([
      { message: "feat: add login", date: `${TARGET_DAY}T10:00:00` },
      { message: "fix: token expiry", date: `${TARGET_DAY}T14:00:00` },
    ]);

    try {
      const commits = await getCommitsForRepo(repo, since, until);
      expect(commits).toHaveLength(2);
      expect(commits.map((c) => c.subject)).toContain("feat: add login");
      expect(commits.map((c) => c.subject)).toContain("fix: token expiry");
    } finally {
      destroyFakeRepo(repo);
    }
  });

  test("returns empty array when no commits on target day", async () => {
    const repo = createFakeRepo([
      { message: "feat: yesterday's work", date: "2025-01-23T10:00:00" },
    ]);

    try {
      const commits = await getCommitsForRepo(repo, since, until);
      expect(commits).toHaveLength(0);
    } finally {
      destroyFakeRepo(repo);
    }
  });

  test("excludes commits on the wrong day", async () => {
    // Commits must be created in chronological order so git's graph traversal
    // doesn't prune the branch before reaching the target-day commit.
    const repo = createFakeRepo([
      { message: "feat: day before",    date: "2025-01-23T10:00:00" },
      { message: "feat: on target day", date: `${TARGET_DAY}T10:00:00` },
      { message: "feat: day after",     date: "2025-01-25T10:00:00" },
    ]);

    try {
      const commits = await getCommitsForRepo(repo, since, until);
      expect(commits).toHaveLength(1);
      expect(commits[0]?.subject).toBe("feat: on target day");
    } finally {
      destroyFakeRepo(repo);
    }
  });

  test("author filter includes only matching author's commits", async () => {
    const repo = createFakeRepo([
      { message: "feat: by alice", date: `${TARGET_DAY}T10:00:00`, author: "Alice", email: "alice@example.com" },
      { message: "feat: by bob",   date: `${TARGET_DAY}T11:00:00`, author: "Bob",   email: "bob@example.com" },
      { message: "fix: by alice",  date: `${TARGET_DAY}T12:00:00`, author: "Alice", email: "alice@example.com" },
    ]);

    try {
      const commits = await getCommitsForRepo(repo, since, until, "alice@example.com");
      expect(commits).toHaveLength(2);
      expect(commits.every((c) => c.author === "Alice")).toBe(true);
    } finally {
      destroyFakeRepo(repo);
    }
  });

  test("author filter excludes all commits when author has none", async () => {
    const repo = createFakeRepo([
      { message: "feat: by bob", date: `${TARGET_DAY}T10:00:00`, author: "Bob", email: "bob@example.com" },
    ]);

    try {
      const commits = await getCommitsForRepo(repo, since, until, "alice@example.com");
      expect(commits).toHaveLength(0);
    } finally {
      destroyFakeRepo(repo);
    }
  });

  test("commit fields are parsed correctly", async () => {
    const repo = createFakeRepo([
      { message: "feat: check fields", date: `${TARGET_DAY}T10:00:00`, author: "Test User", email: "test@test.com" },
    ]);

    try {
      const commits = await getCommitsForRepo(repo, since, until);
      const c = commits[0];
      expect(c).toBeDefined();
      expect(c!.hash).toHaveLength(40);
      expect(c!.shortHash).toHaveLength(7);
      expect(c!.subject).toBe("feat: check fields");
      expect(c!.author).toBe("Test User");
      expect(c!.email).toBe("test@test.com");
      expect(c!.date).toBeInstanceOf(Date);
      expect(c!.repo).toBe(c!.repoPath.split("/").at(-1));
    } finally {
      destroyFakeRepo(repo);
    }
  });

  test("returns empty array for non-git directory", async () => {
    const commits = await getCommitsForRepo("/tmp", since, until);
    expect(commits).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Multi-author scenarios — getCommitsForRepo
// ---------------------------------------------------------------------------

describe("getCommitsForRepo — multi-author", () => {
  const TARGET_DAY = "2025-01-24";
  const since = new Date(`${TARGET_DAY}T00:00:00`);
  const until = new Date(`${TARGET_DAY}T23:59:59`);

  const ALICE = { author: "Alice",   email: "alice@example.com" };
  const BOB   = { author: "Bob",     email: "bob@example.com" };
  const CAROL = { author: "Carol",   email: "carol@example.com" };

  test("no author filter returns commits from all authors", async () => {
    const repo = createFakeRepo([
      { message: "feat: alice work",  date: `${TARGET_DAY}T09:00:00`, ...ALICE },
      { message: "fix: bob fix",      date: `${TARGET_DAY}T10:00:00`, ...BOB },
      { message: "chore: carol lint", date: `${TARGET_DAY}T11:00:00`, ...CAROL },
    ]);

    try {
      const commits = await getCommitsForRepo(repo, since, until);
      expect(commits).toHaveLength(3);
      const authors = commits.map((c) => c.author);
      expect(authors).toContain("Alice");
      expect(authors).toContain("Bob");
      expect(authors).toContain("Carol");
    } finally {
      destroyFakeRepo(repo);
    }
  });

  test("author filter by email isolates one contributor", async () => {
    const repo = createFakeRepo([
      { message: "feat: alice A", date: `${TARGET_DAY}T09:00:00`, ...ALICE },
      { message: "feat: alice B", date: `${TARGET_DAY}T10:00:00`, ...ALICE },
      { message: "fix: bob fix",  date: `${TARGET_DAY}T11:00:00`, ...BOB },
      { message: "chore: carol",  date: `${TARGET_DAY}T12:00:00`, ...CAROL },
    ]);

    try {
      const commits = await getCommitsForRepo(repo, since, until, ALICE.email);
      expect(commits).toHaveLength(2);
      expect(commits.every((c) => c.email === ALICE.email)).toBe(true);
    } finally {
      destroyFakeRepo(repo);
    }
  });

  test("author filter by name matches partial name", async () => {
    const repo = createFakeRepo([
      { message: "feat: alice work", date: `${TARGET_DAY}T09:00:00`, ...ALICE },
      { message: "fix: bob fix",     date: `${TARGET_DAY}T10:00:00`, ...BOB },
    ]);

    try {
      const commits = await getCommitsForRepo(repo, since, until, "Alice");
      expect(commits).toHaveLength(1);
      expect(commits[0]?.author).toBe("Alice");
    } finally {
      destroyFakeRepo(repo);
    }
  });

  test("author with no commits returns empty while others still exist", async () => {
    const repo = createFakeRepo([
      { message: "feat: alice work", date: `${TARGET_DAY}T09:00:00`, ...ALICE },
      { message: "feat: bob work",   date: `${TARGET_DAY}T10:00:00`, ...BOB },
    ]);

    try {
      const commits = await getCommitsForRepo(repo, since, until, CAROL.email);
      expect(commits).toHaveLength(0);
    } finally {
      destroyFakeRepo(repo);
    }
  });

  test("heavy contributor does not suppress other authors without filter", async () => {
    // Alice commits many times — Bob's single commit must still appear
    const repo = createFakeRepo([
      { message: "feat: alice 1", date: `${TARGET_DAY}T08:00:00`, ...ALICE },
      { message: "feat: alice 2", date: `${TARGET_DAY}T09:00:00`, ...ALICE },
      { message: "feat: alice 3", date: `${TARGET_DAY}T10:00:00`, ...ALICE },
      { message: "feat: alice 4", date: `${TARGET_DAY}T11:00:00`, ...ALICE },
      { message: "fix: bob fix",  date: `${TARGET_DAY}T12:00:00`, ...BOB },
    ]);

    try {
      const commits = await getCommitsForRepo(repo, since, until);
      expect(commits).toHaveLength(5);
      expect(commits.filter((c) => c.author === "Bob")).toHaveLength(1);
      expect(commits.filter((c) => c.author === "Alice")).toHaveLength(4);
    } finally {
      destroyFakeRepo(repo);
    }
  });
});

// ---------------------------------------------------------------------------
// Multi-author scenarios — getCommitsForAllRepos
// ---------------------------------------------------------------------------

describe("getCommitsForAllRepos — multi-author", () => {
  const TARGET_DAY = "2025-01-24";
  const since = new Date(`${TARGET_DAY}T00:00:00`);
  const until = new Date(`${TARGET_DAY}T23:59:59`);

  const ALICE = { author: "Alice", email: "alice@example.com" };
  const BOB   = { author: "Bob",   email: "bob@example.com" };

  test("no filter aggregates all authors across all repos", async () => {
    const repo1 = createFakeRepo([
      { message: "feat: alice in repo1", date: `${TARGET_DAY}T09:00:00`, ...ALICE },
      { message: "fix: bob in repo1",    date: `${TARGET_DAY}T10:00:00`, ...BOB },
    ]);
    const repo2 = createFakeRepo([
      { message: "feat: alice in repo2", date: `${TARGET_DAY}T11:00:00`, ...ALICE },
      { message: "fix: bob in repo2",    date: `${TARGET_DAY}T12:00:00`, ...BOB },
    ]);

    try {
      const commits = await getCommitsForAllRepos([repo1, repo2], since, until);
      expect(commits).toHaveLength(4);
      expect(commits.filter((c) => c.author === "Alice")).toHaveLength(2);
      expect(commits.filter((c) => c.author === "Bob")).toHaveLength(2);
    } finally {
      destroyFakeRepo(repo1);
      destroyFakeRepo(repo2);
    }
  });

  test("author filter scopes correctly across multiple repos", async () => {
    const repo1 = createFakeRepo([
      { message: "feat: alice in repo1", date: `${TARGET_DAY}T09:00:00`, ...ALICE },
      { message: "fix: bob in repo1",    date: `${TARGET_DAY}T10:00:00`, ...BOB },
    ]);
    const repo2 = createFakeRepo([
      { message: "feat: alice in repo2", date: `${TARGET_DAY}T11:00:00`, ...ALICE },
      { message: "fix: bob in repo2",    date: `${TARGET_DAY}T12:00:00`, ...BOB },
    ]);
    const repo3 = createFakeRepo([
      // Alice has no commits in repo3 — should not affect other repos
      { message: "fix: bob only", date: `${TARGET_DAY}T13:00:00`, ...BOB },
    ]);

    try {
      const commits = await getCommitsForAllRepos([repo1, repo2, repo3], since, until, ALICE.email);
      expect(commits).toHaveLength(2);
      expect(commits.every((c) => c.author === "Alice")).toBe(true);
      // Commits come from both repos
      const repos = new Set(commits.map((c) => c.repoPath));
      expect(repos.size).toBe(2);
    } finally {
      destroyFakeRepo(repo1);
      destroyFakeRepo(repo2);
      destroyFakeRepo(repo3);
    }
  });

  test("same author committing to multiple repos — all commits returned", async () => {
    const repo1 = createFakeRepo([
      { message: "feat: feature A", date: `${TARGET_DAY}T09:00:00`, ...ALICE },
    ]);
    const repo2 = createFakeRepo([
      { message: "feat: feature B", date: `${TARGET_DAY}T10:00:00`, ...ALICE },
    ]);
    const repo3 = createFakeRepo([
      { message: "feat: feature C", date: `${TARGET_DAY}T11:00:00`, ...ALICE },
    ]);

    try {
      const commits = await getCommitsForAllRepos([repo1, repo2, repo3], since, until, ALICE.email);
      expect(commits).toHaveLength(3);
      expect(commits.every((c) => c.author === "Alice")).toBe(true);
      // One commit per repo
      const uniqueRepos = new Set(commits.map((c) => c.repoPath));
      expect(uniqueRepos.size).toBe(3);
    } finally {
      destroyFakeRepo(repo1);
      destroyFakeRepo(repo2);
      destroyFakeRepo(repo3);
    }
  });
});

// ---------------------------------------------------------------------------
// getCommitsForAllRepos
// ---------------------------------------------------------------------------

describe("getCommitsForAllRepos", () => {
  const TARGET_DAY = "2025-01-24";
  const since = new Date(`${TARGET_DAY}T00:00:00`);
  const until = new Date(`${TARGET_DAY}T23:59:59`);

  test("aggregates commits from multiple repos", async () => {
    const repo1 = createFakeRepo([
      { message: "feat: repo1 work", date: `${TARGET_DAY}T10:00:00` },
    ]);
    const repo2 = createFakeRepo([
      { message: "fix: repo2 work", date: `${TARGET_DAY}T11:00:00` },
    ]);
    const repo3 = createFakeRepo([
      { message: "chore: repo3 work", date: `${TARGET_DAY}T12:00:00` },
    ]);

    try {
      const commits = await getCommitsForAllRepos([repo1, repo2, repo3], since, until);
      expect(commits).toHaveLength(3);
      expect(commits.map((c) => c.subject)).toContain("feat: repo1 work");
      expect(commits.map((c) => c.subject)).toContain("fix: repo2 work");
      expect(commits.map((c) => c.subject)).toContain("chore: repo3 work");
    } finally {
      destroyFakeRepo(repo1);
      destroyFakeRepo(repo2);
      destroyFakeRepo(repo3);
    }
  });

  test("each commit is attributed to its correct repo", async () => {
    const repo1 = createFakeRepo([
      { message: "feat: from repo1", date: `${TARGET_DAY}T10:00:00` },
    ]);
    const repo2 = createFakeRepo([
      { message: "feat: from repo2", date: `${TARGET_DAY}T11:00:00` },
    ]);

    try {
      const commits = await getCommitsForAllRepos([repo1, repo2], since, until);

      const c1 = commits.find((c) => c.subject === "feat: from repo1");
      const c2 = commits.find((c) => c.subject === "feat: from repo2");

      expect(c1?.repoPath).toBe(repo1);
      expect(c2?.repoPath).toBe(repo2);
      expect(c1?.repo).toBe(repo1.split("/").at(-1));
      expect(c2?.repo).toBe(repo2.split("/").at(-1));
    } finally {
      destroyFakeRepo(repo1);
      destroyFakeRepo(repo2);
    }
  });

  test("results are sorted by date descending", async () => {
    const repo = createFakeRepo([
      { message: "first commit",  date: `${TARGET_DAY}T08:00:00` },
      { message: "second commit", date: `${TARGET_DAY}T12:00:00` },
      { message: "third commit",  date: `${TARGET_DAY}T16:00:00` },
    ]);

    try {
      const commits = await getCommitsForAllRepos([repo], since, until);
      expect(commits[0]?.subject).toBe("third commit");
      expect(commits[1]?.subject).toBe("second commit");
      expect(commits[2]?.subject).toBe("first commit");
    } finally {
      destroyFakeRepo(repo);
    }
  });

  test("returns empty array when no repos provided", async () => {
    const commits = await getCommitsForAllRepos([], since, until);
    expect(commits).toHaveLength(0);
  });

  test("skips repos with no matching commits", async () => {
    const repoWithCommits = createFakeRepo([
      { message: "feat: has work", date: `${TARGET_DAY}T10:00:00` },
    ]);
    const repoEmpty = createFakeRepo([
      { message: "feat: different day", date: "2025-01-23T10:00:00" },
    ]);

    try {
      const commits = await getCommitsForAllRepos([repoWithCommits, repoEmpty], since, until);
      expect(commits).toHaveLength(1);
      expect(commits[0]?.subject).toBe("feat: has work");
    } finally {
      destroyFakeRepo(repoWithCommits);
      destroyFakeRepo(repoEmpty);
    }
  });
});

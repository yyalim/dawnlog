import { describe, test, expect } from "vitest";
import { buildUserPrompt } from "./prompt.js";
import type { Commit } from "./git.js";

const makeCommit = (overrides: Partial<Commit> = {}): Commit => ({
  hash: "abc123def456",
  shortHash: "abc123d",
  subject: "feat: add login",
  author: "Test User",
  email: "test@test.com",
  date: new Date("2025-01-27T10:00:00"),
  repo: "my-repo",
  repoPath: "/tmp/my-repo",
  ...overrides,
});

const since = new Date("2025-01-27T00:00:00");
const today = new Date("2025-01-28T09:00:00");
const template = "Yesterday ({{YESTERDAY_DATE}}):\n{{YESTERDAY_SUMMARY}}\nToday ({{TODAY_DATE}}):\n{{TODAY_PLAN}}";

describe("buildUserPrompt — yesterdayNotes", () => {
  test("includes yesterday notes section when provided", () => {
    const result = buildUserPrompt(
      [makeCommit()],
      "Review PRs",
      since,
      today,
      template,
      undefined,
      "Attended team standup and sprint planning",
    );

    expect(result).toContain("ADDITIONAL YESTERDAY NOTES");
    expect(result).toContain("Attended team standup and sprint planning");
  });

  test("omits yesterday notes section when not provided", () => {
    const result = buildUserPrompt(
      [makeCommit()],
      "Review PRs",
      since,
      today,
      template,
    );

    expect(result).not.toContain("ADDITIONAL YESTERDAY NOTES");
  });

  test("omits yesterday notes section when undefined", () => {
    const result = buildUserPrompt(
      [makeCommit()],
      "Review PRs",
      since,
      today,
      template,
      undefined,
      undefined,
    );

    expect(result).not.toContain("ADDITIONAL YESTERDAY NOTES");
  });
});

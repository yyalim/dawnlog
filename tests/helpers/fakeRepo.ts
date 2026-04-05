import { execSync, execFileSync } from "child_process";
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
    const file = path.join(dir, `${Date.now()}-${Math.random()}.txt`);
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

    execFileSync("git", ["commit", "-m", commit.message], { cwd: dir, env });
  }

  return dir;
}

export function destroyFakeRepo(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

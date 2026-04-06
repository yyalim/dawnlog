import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

export interface Commit {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  email: string;
  date: Date;
  repo: string;
  repoPath: string;
}

export interface WorkingDayRange {
  since: Date;
  until: Date;
}

export function parseDateRange(dateStr: string): WorkingDayRange {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new Error(`Invalid date format "${dateStr}" — expected YYYY-MM-DD`);
  }
  const [, y, m, d] = match;
  const since = new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0);
  const until = new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999);
  return { since, until };
}

export function getLastWorkingDay(now: Date = new Date()): WorkingDayRange {
  const day = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  // How far back does the last working day start?
  let daysBackForSince: number;
  if (day === 1) {
    daysBackForSince = 3; // Monday → since Friday
  } else if (day === 0) {
    daysBackForSince = 2; // Sunday → since Friday
  } else if (day === 6) {
    daysBackForSince = 1; // Saturday → since Friday
  } else {
    daysBackForSince = 1; // Tue–Fri → since yesterday
  }

  const since = new Date(now);
  since.setDate(since.getDate() - daysBackForSince);
  since.setHours(0, 0, 0, 0);

  // until is always end-of-day yesterday so commits made after the last
  // working day are not missed (e.g. Monday: since=Fri 00:00, until=Sun 23:59).
  const until = new Date(now);
  until.setDate(until.getDate() - 1);
  until.setHours(23, 59, 59, 999);

  return { since, until };
}

export async function getCommitsForRepo(
  repoPath: string,
  since: Date,
  until: Date,
  author?: string,
): Promise<Commit[]> {
  // Use ASCII Unit Separator (0x1F) as delimiter — cannot appear in commit messages
  const args = [
    "log",
    "--branches",
    "--no-merges",
    "--format=%H%x1F%h%x1F%s%x1F%an%x1F%ae%x1F%aI",
    `--after=${since.toISOString()}`,
    `--before=${until.toISOString()}`,
  ];

  if (author) {
    args.push(`--author=${author}`);
  }

  let stdout: string;
  try {
    const result = await execFileAsync("git", args, { cwd: repoPath });
    stdout = result.stdout;
  } catch (err: unknown) {
    if (isExecError(err) && err.code !== 0) {
      // Not a git repo or other git error — return empty
      return [];
    }
    throw err;
  }

  const lines = stdout.trim().split("\n").filter(Boolean);
  const repoName = path.basename(repoPath);

  return lines.map((line) => {
    const parts = line.split("\x1F");
    const hash = parts[0] ?? "";
    const shortHash = parts[1] ?? "";
    const subject = parts[2] ?? "";
    const gitAuthor = parts[3] ?? "";
    const email = parts[4] ?? "";
    const dateStr = parts[5] ?? "";

    return {
      hash,
      shortHash,
      subject,
      author: gitAuthor,
      email,
      date: new Date(dateStr),
      repo: repoName,
      repoPath,
    };
  });
}

export async function getCommitsForAllRepos(
  repos: string[],
  since: Date,
  until: Date,
  author?: string,
): Promise<Commit[]> {
  const results = await Promise.all(
    repos.map((repo) => getCommitsForRepo(repo, since, until, author)),
  );

  return results
    .flat()
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

function isExecError(err: unknown): err is { code: number; stderr: string } {
  return typeof err === "object" && err !== null && "code" in err;
}

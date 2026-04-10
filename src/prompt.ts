import type { Commit } from "./git.js";

const TICKET_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/g;

export function linkifyTickets(text: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return text.replace(TICKET_PATTERN, (_, id: string) => `[${id}](${base}/${id})`);
}

export function buildSystemPrompt(systemPromptTemplate: string): string {
  return systemPromptTemplate;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(d: Date): string {
  const weekday = DAYS[d.getDay()];
  const day = String(d.getDate()).padStart(2, "0");
  const month = MONTHS[d.getMonth()];
  const year = d.getFullYear();
  return `${weekday} ${day} ${month} ${year}`;
}

export function buildUserPrompt(
  commits: Commit[],
  todayPlan: string,
  since: Date,
  today: Date,
  templateContent: string,
  ticketBaseUrl?: string,
  yesterdayNotes?: string,
): string {
  // --- commit data ---
  let commitBlock: string;
  if (commits.length === 0) {
    commitBlock = "No commits found for the last working day.";
  } else {
    const byRepo = new Map<string, Commit[]>();
    for (const commit of commits) {
      const existing = byRepo.get(commit.repo);
      if (existing) existing.push(commit);
      else byRepo.set(commit.repo, [commit]);
    }
    const repoSections: string[] = [];
    for (const [repoName, repoCommits] of byRepo) {
      const lines = repoCommits.map((c) => {
        const subject = ticketBaseUrl ? linkifyTickets(c.subject, ticketBaseUrl) : c.subject;
        return `  - ${subject} (${c.author})`;
      });
      repoSections.push(`${repoName}:\n${lines.join("\n")}`);
    }
    commitBlock = repoSections.join("\n\n");
  }

  return `Fill in the template at the bottom using the data below. Output ONLY the filled template — nothing else.

RULES:
- Replace {{YESTERDAY_DATE}} with: ${formatDate(since)}
- Replace {{TODAY_DATE}} with: ${formatDate(today)}
- Replace {{YESTERDAY_SUMMARY}} with a structured summary of ALL the commits below, plus any additional notes provided. For each repo write its name as a [repo-name] header (plain text, not a markdown heading), then one line per ticket as "TICKET-ID — short description", then bullet points grouped by area (Backend:, Frontend:, Ops: for infra/DevOps, General: for meetings/reviews/non-code). Do NOT copy commit messages verbatim. Do NOT include commit hashes. If additional yesterday notes are provided (meetings, planning, architecture, etc.), include them as a separate section after the commit summaries.
- Replace {{TODAY_PLAN}} with a short description of today's focus based on the plan below.
- Replace {{BLOCKERS}} with any blockers mentioned, or "None".
- Replace {{WORKLOAD}} with: "Half day" if the plan mentions finishing early or after lunch, otherwise "Full".

COMMITS (last working day):
${commitBlock}

${yesterdayNotes ? `ADDITIONAL YESTERDAY NOTES (e.g. meetings, reviews, discussions):\n${yesterdayNotes}\n\n` : ""}PLAN FOR TODAY:
${todayPlan}

TEMPLATE:
${templateContent}`;
}

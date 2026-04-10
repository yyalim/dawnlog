import React from "react";
import { Text, Box } from "ink";
import type { Commit } from "./git.js";

// ── StatusMessage ──────────────────────────────────────────────────────

interface StatusMessageProps {
  type: "success" | "warning" | "error" | "info";
  children: React.ReactNode;
}

const statusConfig = {
  success: { color: "green", prefix: "✓" },
  warning: { color: "yellow", prefix: "⚠" },
  error:   { color: "red", prefix: "✗" },
  info:    { color: "cyan", prefix: "●" },
} as const;

export function StatusMessage({ type, children }: StatusMessageProps) {
  const { color, prefix } = statusConfig[type];
  return (
    <Text color={color}>
      {prefix} {children}
    </Text>
  );
}

// ── Spinner ────────────────────────────────────────────────────────────

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner({ label }: { label: string }) {
  const [frame, setFrame] = React.useState(0);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <Text>
      <Text color="cyan">{SPINNER_FRAMES[frame]}</Text> {label}
    </Text>
  );
}

// ── CommitList ─────────────────────────────────────────────────────────

export function CommitList({ commits }: { commits: Commit[] }) {
  if (commits.length === 0) {
    return (
      <Box marginY={1}>
        <Text dimColor>  No commits found for the last working day.</Text>
      </Box>
    );
  }

  const grouped = new Map<string, Commit[]>();
  for (const commit of commits) {
    const list = grouped.get(commit.repo) ?? [];
    list.push(commit);
    grouped.set(commit.repo, list);
  }

  return (
    <Box flexDirection="column" marginY={1}>
      {[...grouped.entries()].map(([repo, repoCommits]) => (
        <Box key={repo} flexDirection="column">
          <Text>
            <Text color="cyan">  {repo}</Text>
            <Text dimColor> ({repoCommits.length} commit{repoCommits.length === 1 ? "" : "s"})</Text>
          </Text>
          {repoCommits.map((c) => (
            <Text key={c.hash}>
              <Text dimColor>    {c.shortHash}</Text> {c.subject}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  );
}

// ── DryRunOutput ──────────────────────────────────────────────────────

interface DryRunOutputProps {
  systemPrompt: string;
  userPrompt: string;
}

export function DryRunOutput({ systemPrompt, userPrompt }: DryRunOutputProps) {
  return (
    <Box flexDirection="column">
      <Text bold>{"\n"}--- SYSTEM PROMPT ---{"\n"}</Text>
      <Text>{systemPrompt}</Text>
      <Text bold>{"\n"}--- USER PROMPT ---{"\n"}</Text>
      <Text>{userPrompt}</Text>
      <Text bold>{"\n"}--- (dry run -- LLM not called, no file written) ---{"\n"}</Text>
    </Box>
  );
}

// ── ConfigDisplay ─────────────────────────────────────────────────────

export function ConfigDisplay({ config }: { config: object }) {
  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="cyan">Current configuration:{"\n"}</Text>
      <Text>{JSON.stringify(config, null, 2)}</Text>
    </Box>
  );
}

// ── ConfigUsage ───────────────────────────────────────────────────────

export function ConfigUsage() {
  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="cyan">Usage:</Text>
      <Text>  dawnlog config --show                          Print current config</Text>
      <Text>  dawnlog config --edit                          Re-run setup wizard</Text>
      <Text>  dawnlog config --set {"<key>=<value>"}             Set a config value</Text>
      <Text>  dawnlog config --add-repo {"<path>"}               Add a repo</Text>
      <Text>  dawnlog config --remove-repo {"<path>"}            Remove a repo</Text>
      <Text> </Text>
      <Text color="cyan">Settable keys:</Text>
      <Text>  llm.provider       anthropic | openai | ollama</Text>
      <Text>  llm.model          e.g. claude-haiku-4-5, gpt-4o, llama3.2</Text>
      <Text>  llm.apiKey         API key (or set via env var)</Text>
      <Text>  llm.baseUrl        Base URL (Ollama default: http://localhost:11434)</Text>
      <Text>  outputDir          Directory where .md files are saved</Text>
      <Text>  templatePath       Path to the standup template</Text>
      <Text>  author             Git author filter (name or email)</Text>
      <Text>  ticketBaseUrl      Ticket URL prefix for linkifying IDs</Text>
    </Box>
  );
}

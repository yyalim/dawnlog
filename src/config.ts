import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_CONFIG_PATH = path.join(os.homedir(), ".dawnlog", "config.json");
export const DEFAULT_OUTPUT_DIR = path.join(os.homedir(), "dawnlogs");
export const DEFAULT_TEMPLATE_PATH = path.resolve(__dirname, "../templates/standup.md");
export const DEFAULT_SYSTEM_PROMPT_PATH = path.resolve(__dirname, "../templates/system-prompt.md");

export interface Config {
  repos: string[];
  llm: {
    provider: "anthropic" | "openai" | "ollama";
    model?: string;
    apiKey?: string;
    baseUrl?: string;
  };
  outputDir: string;
  templatePath: string;
  systemPromptPath: string;
  author?: string;
  ticketBaseUrl?: string;
}

const DEFAULTS: Config = {
  repos: [],
  llm: {
    provider: "anthropic",
  },
  outputDir: DEFAULT_OUTPUT_DIR,
  templatePath: DEFAULT_TEMPLATE_PATH,
  systemPromptPath: DEFAULT_SYSTEM_PROMPT_PATH,
};

function expandTilde(p: string): string {
  return p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p;
}

function mergeDefaults(partial: Partial<Config>): Config {
  return {
    ...DEFAULTS,
    ...partial,
    repos: (partial.repos ?? DEFAULTS.repos).map(expandTilde),
    outputDir: expandTilde(partial.outputDir ?? DEFAULTS.outputDir),
    templatePath: expandTilde(partial.templatePath ?? DEFAULTS.templatePath),
    systemPromptPath: expandTilde(partial.systemPromptPath ?? DEFAULTS.systemPromptPath),
    llm: {
      ...DEFAULTS.llm,
      ...(partial.llm ?? {}),
    },
  };
}

export async function loadConfig(): Promise<Config> {
  try {
    const raw = await fs.readFile(DEFAULT_CONFIG_PATH, "utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Malformed config at ${DEFAULT_CONFIG_PATH} — could not parse JSON`);
    }
    return mergeDefaults(parsed as Partial<Config>);
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return mergeDefaults({});
    }
    throw err;
  }
}

export async function saveConfig(config: Config): Promise<void> {
  const dir = path.dirname(DEFAULT_CONFIG_PATH);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(DEFAULT_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function configExists(): Promise<boolean> {
  return fs
    .access(DEFAULT_CONFIG_PATH)
    .then(() => true)
    .catch(() => false);
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

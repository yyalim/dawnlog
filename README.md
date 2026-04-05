# dawnlog

A CLI tool that generates daily developer standup reports by reading your git commits across multiple repos, asking for your plan for today, and using an LLM to fill in a markdown template.

## Installation

```bash
# For local development
git clone <repo>
cd dawnlog
npm install
npm run build
npm link   # makes `dawnlog` available globally
```

Requires **Node.js 20+**.

## Quick Start

```bash
dawnlog
```

On first run, the setup wizard will guide you through:
1. Adding your git repo paths
2. Choosing an LLM provider (Anthropic, OpenAI, or Ollama)
3. Setting your API key
4. Configuring output location

Then every morning:
```bash
dawnlog
# Type your plan for today, press Ctrl+D
# Your standup report is saved to ~/dawnlogs/dawnlog-YYYY-MM-DD.md
```

## Commands

```bash
dawnlog                            # Generate today's standup (interactive)
dawnlog --today "Review PRs"       # Skip the interactive prompt
dawnlog --provider ollama          # Override provider for this run
dawnlog --dry-run                  # Print prompts without calling the LLM or saving a file
dawnlog --since 2025-01-22         # Query commits from a specific date (e.g. after a bank holiday)
dawnlog --since 2025-01-22 --dry-run  # Combine flags freely

dawnlog config                     # Show config help
dawnlog config --show              # Print current configuration as JSON
dawnlog config --edit              # Re-run the full setup wizard
dawnlog config --set <key>=<value> # Set a single config value
dawnlog config --add-repo <path>   # Add a repo to the list
dawnlog config --remove-repo <path># Remove a repo from the list

dawnlog provider                   # Interactively switch the default LLM provider
```

## Configuration

Config is stored at `~/.dawnlog/config.json`. You can edit it directly or use `dawnlog config`.

```json
{
  "repos": ["/absolute/path/to/repo1", "/absolute/path/to/repo2"],
  "llm": {
    "provider": "anthropic",
    "model": "claude-haiku-4-5",
    "apiKey": "sk-ant-..."
  },
  "outputDir": "~/dawnlogs",
  "templatePath": "/path/to/templates/standup.md",
  "author": "you@example.com",
  "ticketBaseUrl": "https://yourco.atlassian.net/browse"
}
```

| Field | Description | Default |
|-------|-------------|---------|
| `repos` | Absolute paths to git repositories to scan | `[]` |
| `llm.provider` | `anthropic`, `openai`, or `ollama` | `anthropic` |
| `llm.model` | Model to use (provider-specific) | Provider default |
| `llm.apiKey` | API key (falls back to env var) | — |
| `llm.baseUrl` | Custom base URL (Ollama or OpenAI-compatible) | — |
| `outputDir` | Directory where reports are saved | `~/dawnlogs` |
| `templatePath` | Path to the output markdown template | Bundled `templates/standup.md` |
| `systemPromptPath` | Path to the LLM system prompt template | Bundled `templates/system-prompt.md` |
| `author` | Filter git commits by author name or email | All authors |
| `ticketBaseUrl` | Base URL for ticket ID linkification | Disabled |

### Editing config values

```bash
# Switch provider and model
dawnlog config --set llm.provider=ollama
dawnlog config --set llm.model=llama3.2

# Update API key
dawnlog config --set llm.apiKey=sk-ant-...

# Set Ollama base URL (if not running on default port)
dawnlog config --set llm.baseUrl=http://localhost:11434

# Manage repos
dawnlog config --add-repo ~/projects/my-api
dawnlog config --remove-repo ~/old-project

# Other fields
dawnlog config --set author="Jane Doe"
dawnlog config --set ticketBaseUrl=https://myco.atlassian.net/browse
dawnlog config --set outputDir=~/Documents/standups
dawnlog config --set systemPromptPath=~/my-system-prompt.md
```

Settable keys: `llm.provider`, `llm.model`, `llm.apiKey`, `llm.baseUrl`, `outputDir`, `templatePath`, `systemPromptPath`, `author`, `ticketBaseUrl`

### API Key Environment Variables

API keys can be set via environment variables instead of storing them in the config file:
- `ANTHROPIC_API_KEY` for Anthropic
- `OPENAI_API_KEY` for OpenAI

## LLM Providers

### Anthropic (default)
Uses Claude models. Set `ANTHROPIC_API_KEY` or add it via the setup wizard.
Default model: `claude-haiku-4-5`.

```bash
dawnlog config --set llm.provider=anthropic
dawnlog config --set llm.model=claude-haiku-4-5
```

### OpenAI
Uses GPT models. Set `OPENAI_API_KEY` or add it via the setup wizard.
Supports a custom `baseUrl` for OpenAI-compatible APIs (Groq, Together, etc.).

```bash
dawnlog config --set llm.provider=openai
dawnlog config --set llm.model=gpt-4o
```

### Ollama (local)
Runs models locally — no API key or internet connection needed.

**Setup:**
```bash
# Install Ollama from https://ollama.com, then:
ollama serve
ollama pull gemma3:12b   # default — or mistral, llama3.1:8b, qwen2.5:7b, etc.

dawnlog config --set llm.provider=ollama
dawnlog config --set llm.model=gemma3:12b
```

Default model: `gemma3:12b`. Default base URL: `http://localhost:11434`. Override with `--set llm.baseUrl=...` if needed.

### Adding a Custom Provider
1. Create `src/llm/myprovider.ts` implementing the `LLMProvider` interface
2. Add a `case "myprovider"` to `src/llm/index.ts`
3. Add `"myprovider"` to the union type in `src/config.ts`

## Customizing Templates

There are two template files you can customize independently:

### Output template (`templates/standup.md`)

Defines the structure of the generated report. Copy and edit it, then point dawnlog at it:

```bash
cp /path/to/dawnlog/templates/standup.md ~/my-standup.md
# Edit ~/my-standup.md to your liking
dawnlog config --set templatePath=~/my-standup.md
```

The LLM fills in the placeholders — you can add, remove, or rename sections freely.

**Placeholders:**

| Placeholder | Description |
|-------------|-------------|
| `{{YESTERDAY_DATE}}` | Last working day's date (e.g. "Thu 02 Apr 2026") |
| `{{TODAY_DATE}}` | Today's date |
| `{{YESTERDAY_SUMMARY}}` | Synthesized summary of yesterday's commits, grouped by repo |
| `{{TODAY_PLAN}}` | Your plan for today |
| `{{BLOCKERS}}` | Blockers, or "None" |
| `{{WORKLOAD}}` | Inferred workload: Full / Half day / Morning only / etc. |

### System prompt (`templates/system-prompt.md`)

Controls the instructions sent to the LLM. Useful for tuning output style or improving results with a specific local model:

```bash
cp /path/to/dawnlog/templates/system-prompt.md ~/my-system-prompt.md
# Edit ~/my-system-prompt.md to your liking
dawnlog config --set systemPromptPath=~/my-system-prompt.md
```

The output template is passed to the LLM via the user message at runtime, so the system prompt is focused purely on instructions and examples.

## Output

Reports are saved to `~/dawnlogs/dawnlog-YYYY-MM-DD.md`. Example:

```
---
Yesterday (Thu 02 Apr 2026):

[my-api]
BWD-8682 — RBAC & permissions system
Backend:
- Defined 17 permissions and 4 roles with resolvePermissionsFromRoles
- Added requirePermissions middleware for payment admin routes
- Created GET /v1/internal/me/permissions endpoint

[dashboard]
BWD-9100 — Dashboard scaffold & dark mode
Frontend:
- Scaffolded Next.js app with Tailwind and shadcn/ui
- Added transactions table with pagination and date range filter
- Added dark mode toggle to dashboard settings

Today (Fri 03 Apr 2026):

Review open PRs and address feedback on BWD-8682

Blockers: None
Workload: Full
---
```

## Weekend & bank holidays

If you're generating a report after a long weekend or bank holiday, use `--since` to specify the start date manually:

```bash
dawnlog --since 2025-01-20   # picks up commits from Jan 20 onwards
```

## Development

```bash
npm run dev         # Run with tsx (no build needed)
npm run build       # Compile TypeScript → dist/
npm run lint        # Type-check only
npm test            # Run tests with Vitest
npm run test:watch  # Watch mode
```

## Planned Features

- [ ] `dawnlog post` — post output to Slack via webhook
- [ ] `dawnlog week` — weekly summary across all logs in outputDir
- [ ] `npx dawnlog` support (publish to npm)
- [ ] `excludePatterns` config — filter out noise commits (e.g. "chore: bump version")
- [ ] Named repo aliases — display "api-service" instead of full path
- [ ] Shell completion (bash/zsh)

## License

MIT

# MCP client recipes

## Claude Code

Official docs: https://docs.claude.com/en/docs/claude-code/mcp

```bash
claude mcp add --scope user paradigm-memory node /absolute/path/to/paradigm-memory/packages/memory-mcp/src/server.mjs
claude mcp list
```

Agent instruction (`CLAUDE.md`):

```markdown
Use paradigm-memory first. Before non-trivial work, call `memory_search` for project orientation. Use `memory_tree` to inspect structure. After durable decisions or facts, call `memory_propose_write`. Do not stuff unrelated memory into context.
```

## OpenAI Codex

Official docs: https://platform.openai.com/docs/docs-mcp

```bash
codex mcp add paradigm-memory -- node /absolute/path/to/paradigm-memory/packages/memory-mcp/src/server.mjs
codex mcp list
```

Manual `~/.codex/config.toml`:

```toml
[mcp_servers.paradigm-memory]
command = "node"
args = ["/absolute/path/to/paradigm-memory/packages/memory-mcp/src/server.mjs"]

[mcp_servers.paradigm-memory.env]
PARADIGM_MEMORY_DIR = "/absolute/path/to/.paradigm"
```

Agent instruction (`AGENTS.md`):

```markdown
Use paradigm-memory MCP before large changes. Search with `memory_search`, inspect with `memory_tree`, and stage durable facts with `memory_propose_write`.
```

## Gemini CLI

Official docs: https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html

```bash
gemini mcp add --scope user paradigm-memory node /absolute/path/to/paradigm-memory/packages/memory-mcp/src/server.mjs
gemini mcp list
```

Manual `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "paradigm-memory": {
      "command": "node",
      "args": ["/absolute/path/to/paradigm-memory/packages/memory-mcp/src/server.mjs"],
      "env": { "PARADIGM_MEMORY_DIR": "/absolute/path/to/.paradigm" },
      "trust": false
    }
  }
}
```

Gemini instruction (`GEMINI.md`):

```markdown
Prefer paradigm-memory MCP for project memory. Call `memory_search` before substantive answers, `memory_tree` for map inspection, and `memory_propose_write` after lasting project facts.
```

## ChatGPT

ChatGPT connectors currently target remote MCP servers. paradigm-memory is local stdio-first. Use Codex, Claude Code, Gemini CLI, Cursor, Cline, Continue or OpenCode until the HTTP/SSE bridge lands.

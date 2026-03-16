# @kovamind/mcp-server

[![npm](https://img.shields.io/npm/v/@kovamind/mcp-server)](https://www.npmjs.com/package/@kovamind/mcp-server)

MCP server for **Kova Mind** — use AI memory in Claude Desktop, Cursor, Windsurf, VS Code, and any MCP-compatible client.

## Quick setup

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kovamind": {
      "command": "npx",
      "args": ["-y", "@kovamind/mcp-server"],
      "env": {
        "KOVAMIND_API_KEY": "km_live_xxx",
        "KOVAMIND_USER_ID": "my-user"
      }
    }
  }
}
```

### Cursor

Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "kovamind": {
      "command": "npx",
      "args": ["-y", "@kovamind/mcp-server"],
      "env": {
        "KOVAMIND_API_KEY": "km_live_xxx",
        "KOVAMIND_USER_ID": "my-user"
      }
    }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "kovamind": {
      "command": "npx",
      "args": ["-y", "@kovamind/mcp-server"],
      "env": {
        "KOVAMIND_API_KEY": "km_live_xxx",
        "KOVAMIND_USER_ID": "my-user"
      }
    }
  }
}
```

### Windsurf

Add to your Windsurf MCP config:

```json
{
  "mcpServers": {
    "kovamind": {
      "command": "npx",
      "args": ["-y", "@kovamind/mcp-server"],
      "env": {
        "KOVAMIND_API_KEY": "km_live_xxx",
        "KOVAMIND_USER_ID": "my-user"
      }
    }
  }
}
```

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `KOVAMIND_API_KEY` | Yes | — | Your Kova Mind API key |
| `KOVAMIND_API_URL` | No | `https://api.kovamind.ai` | API base URL |
| `KOVAMIND_USER_ID` | No | — | Default user ID for all operations |

## Available tools

| Tool | Description |
|------|-------------|
| `memory_extract` | Extract memory patterns from a conversation |
| `memory_recall` | Retrieve relevant memories for a context |
| `memory_reinforce` | Confirm, deny, strengthen, or weaken a pattern |
| `memory_surprise` | Score how novel content is vs existing memory |
| `memory_health` | Check API health status |

## Get an API key

Sign up at [kovamind.ai](https://kovamind.ai) to get your API key.

## License

MIT

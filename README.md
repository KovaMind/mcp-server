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
| `KOVAMIND_API_URL` | No | `https://api.kovamind.io` | API base URL |
| `KOVAMIND_USER_ID` | No | — | Default user ID for all operations |

## Available tools

### Memory

| Tool | Description |
|------|-------------|
| `memory_extract` | Extract memory patterns from a conversation |
| `memory_recall` | Retrieve relevant memories for a context |
| `memory_reinforce` | Confirm, deny, strengthen, or weaken a pattern |
| `memory_surprise` | Score how novel content is vs existing memory |
| `memory_health` | Check API health status |

### Vault (zero-exposure credentials)

Credential values never reach the AI. Store a credential once, get back an opaque handle, then ask the AI to act with that handle — the value flows through a secure side channel.

| Tool | Description |
|------|-------------|
| `vault_setup` | One-time vault setup. Returns 12 recovery words — store them safely |
| `vault_unlock` | Unlock the vault with your passphrase |
| `vault_lock` | Lock the vault and zero the key from memory |
| `vault_store` | Store a credential. Returns an opaque handle |
| `vault_handles` | List available handles (never the values) |
| `vault_find` | Search handles by natural-language query |
| `vault_execute` | Run an action (http request, browser fill) using a handle |

## Troubleshooting

### `403 — API key is bound to a different agent identity`

A Kova Mind API key can be **bound** server-side to a single `user_id` (agent identity). If a request's `user_id` does not match the identity the key is bound to, the API returns:

```
HTTP 403 {"detail":"API key is bound to a different agent identity"}
```

This surfaces in any tool that takes a `user_id` (e.g. `memory_extract`, `memory_recall`, `memory_surprise`) as a `... failed: API error 403: ...` message.

What to do:

- Make sure the `user_id` you pass (or the `KOVAMIND_USER_ID` env var) matches the identity the key was issued for.
- **Unbound** keys are unaffected — they pass the client-supplied `user_id` through unchanged, so a single unbound key can serve multiple users.
- If you need one key per agent, bind the key to that agent's `user_id` and always send the matching `user_id`.

## Get an API key

Sign up at [kovamind.io](https://kovamind.io) to get your API key.

## License

MIT

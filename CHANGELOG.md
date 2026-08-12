# Changelog

All notable changes to `@kovamind/mcp-server` are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [1.1.0] — 2026-08-11

Three features harvested from the private March-era `kovamind-mcp` build and adapted to this server.

### Added
- **Credential guard on `memory_extract`.** 17 regex patterns (OpenAI, Anthropic, Stripe, GitHub, AWS, Slack, Google, npm, Kova Mind keys, Bearer tokens, private keys, SSNs, inline passwords, hex secrets — mirrors the backend's `blocklist.py`) run client-side on the conversation BEFORE it reaches the API. On a match the tool refuses with a clear message pointing at `vault_store` instead of silently storing a pasted secret. `src/credential-guard.ts`, ported with its full 28-test suite.
- **`setup` subcommand** — interactive wizard (`npx @kovamind/mcp-server setup`). Health-checks the API at `/api/health`, then writes the `kovamind` MCP entry into every detected client: Claude Code (via `claude mcp add`), Claude Desktop, Cursor, Windsurf, Cline, Antigravity, Gemini CLI. `--dry-run` / `--print` renders the exact plan (API key masked) without writing anything. Adapted from the donor: this server's env vars (`KOVAMIND_API_URL` / `KOVAMIND_API_KEY` / `KOVAMIND_USER_ID` — no agent id or vault passphrase), default URL `https://api.kovamind.io`.

### Security
- **`vault_execute` output masking.** The one path where a raw secret could echo back into the AI's context: an executed HTTP request whose target reflects the injected credential (echo endpoints, request dumps, error pages). Output and error text now pass through `redactCredentials`, replacing credential-shaped substrings with `[REDACTED <type>]` placeholders.
- **Vault masking review finding:** no other vault tool can return a stored secret. Vault v2 is handle-based — `vault_store`/`vault_handles`/`vault_find` return only handle + label + type, and there is no `vault_get`. `vault_setup`'s recovery words are intentionally shown in full, once: they are the only recovery path and masking them would destroy their purpose.

## [1.0.0] — 2026-06-02

### Changed
- **Version bumped to 1.0.0** for the first stable npm publish of the end-to-end-verified memory + vault tool set (12 tools). No runtime behavior change from 0.4.4 — request/auth/URL logic is unchanged. `SERVER_VERSION` (drives the User-Agent and the MCP server version) aligned to `1.0.0`.

### Security
- **Dev-dependency vulnerabilities cleared (11 → 0).** Upgraded `vitest` to `^4.1.8` (clears the critical Vitest UI advisory) and ran `npm audit fix` to pull patched transitives (`vite`, `postcss`, `hono`, `qs`, `path-to-regexp`, `picomatch`, `fast-uri`, `ip-address`, `@hono/node-server`). Every advisory was in the test/build toolchain only — no production dependency (`@modelcontextprotocol/sdk`, `zod`) was affected and no shipped code changed. Build + 48 tests stay green.

### Documented
- **New failure mode — Phase-2 bound-key `403`.** An API key can now be bound server-side to a single `user_id`. A request whose `user_id` differs from the key's bound identity returns `HTTP 403 {"detail":"API key is bound to a different agent identity"}`, which surfaces through the normal `... failed: API error 403: ...` tool output. Unbound keys still pass the client-supplied `user_id` through unchanged. See README → Troubleshooting.

## [0.4.3] — 2026-04-22

### Fixed
- **Cloudflare WAF 403 on every API call**: root cause was not a missing header — Node's global `fetch` (undici) produces a TLS JA3 signature that Cloudflare Bot Fight Mode on `api.kovamind.io` rejects outright. Swapped to `node:https`, which uses Node's built-in TLS stack that CF accepts. 0.4.2 installs were completely non-functional against the live API; 0.4.3 is the first release that actually works end-to-end. Verified with a live stdio probe: `memory_health` returns `Status: healthy`, `memory_recall` returns real data.

### Added
- Identifying `User-Agent`: `Mozilla/5.0 (compatible; kovamind-mcp/<version>; +repo)` — Mozilla-compatible form, no `node/<ver>` suffix (CF flags the literal string "node" in UA).
- `X-Kovamind-Client` / `X-Kovamind-Client-Version` headers on every request — makes the client identifiable in backend logs and gives the backend a hook for a future WAF allowlist.
- `KOVAMIND_TIMEOUT_MS` env var (default 30000ms).

### Notes
- **Backend follow-up (required, separate repo):** Cloudflare Bot Fight Mode should be turned off on `api.kovamind.io` or a WAF skip rule added for requests carrying `X-Kovamind-Client: mcp-server`. Otherwise every future SDK (Python, TS, Go) will hit the same wall, and anyone who re-introduces fetch in this repo breaks production.

## [0.4.2] — 2026-04-22

### Fixed
- **Default API URL corrected** from `https://api.kovamind.ai` to `https://api.kovamind.io`. Installs on 0.3.0 that relied on the default were hitting a non-resolving domain; set `KOVAMIND_API_URL` explicitly or upgrade.
- `package.json` `homepage` and author email corrected to the `kovamind.io` domain.
- `README.md` sign-up link corrected to `kovamind.io`.

### Added
- README now documents the 7 Vault v2 tools that had been added in source but never released: `vault_setup`, `vault_unlock`, `vault_lock`, `vault_store`, `vault_handles`, `vault_find`, `vault_execute`.
- Centralized `sanitizeErr` helper — every tool's error surface now redacts URLs consistently (previously only the 4 memory tools did).
- Tests covering the URL default, the absence of the wrong TLD, and the sanitizer wiring.

### Notes
- Versions `0.4.0` and `0.4.1` existed in the repo but were never published to npm. `0.4.2` is the first release of the combined memory + vault tool set (12 tools total).
- 1.0 (next) will add meta-learning tools (`memory_workflow_profile`, `memory_warning_check`, `memory_journal_get`, `memory_lessons_search`) once the matching HTTP routes ship on the backend.

## [0.3.0] — 2026-03-20

### Changed
- Removed the v1 vault tools; vault is being redesigned around opaque handles (shipping in 0.4.2).

## [0.2.0] — 2026-03-19

### Added
- First vault tool set: `vault_store`, `vault_get`, `vault_list`, `vault_delete` (superseded in 0.3.0).

## [0.1.0] — 2026-03-19

### Added
- Initial release: `memory_extract`, `memory_recall`, `memory_reinforce`, `memory_surprise`, `memory_health`.
- Stdio MCP transport, Bearer auth, URL-redacting error handling.

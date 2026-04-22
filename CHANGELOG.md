# Changelog

All notable changes to `@kovamind/mcp-server` are documented here. This project follows [Semantic Versioning](https://semver.org/).

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

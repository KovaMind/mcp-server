# Changelog

All notable changes to `@kovamind/mcp-server` are documented here. This project follows [Semantic Versioning](https://semver.org/).

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

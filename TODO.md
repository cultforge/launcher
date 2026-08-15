# CultForge launcher backlog

Remote API catalog: [https://api.cultforge.com/manifest.json](https://api.cultforge.com/manifest.json) (`&.build_id`: `v2026.08.13-win`).

## Release: 2.4 Generation 2 (semver 2.4.0)

Engineering gate for today:

- [x] Version unify (`2.4.0` + display `2.4 Generation 2`)
- [x] Sidecar freeze copies to `resources/` **and** workspace root `client.exe`
- [x] Datapack round-trip via `cf-datapack:` slug marker
- [x] Clear guild-install error when build manifest API missing
- [x] `npm run release:windows` pipeline (freeze → build → test → tauri → SHA256)
- [x] NSIS `CultForge_2.4.0_x64-setup.exe` produced (primary ship artifact)
- [x] MSI `CultForge_2.4.0_x64_en-US.msi` produced (ICE38 fixed via single-package WiX authoring)
- [ ] Admin smoke checklist signed off ([docs/admin-smoke-checklist.md](docs/admin-smoke-checklist.md)) — **staff required**
- [ ] Installed-app smoke signed off — see [dist-release/RELEASE-2.4.0.txt](dist-release/RELEASE-2.4.0.txt) / [docs/release-2.4-smoke.md](docs/release-2.4-smoke.md)

## Release blockers (must be 0 before ship)

- [x] Admin: validateActionForm respects showWhen
- [x] Admin: sessions load verified post sidecar template fix
- [x] npm run build passes
- [x] npm run tauri build passes
- [ ] Admin smoke checklist signed off ([docs/admin-smoke-checklist.md](docs/admin-smoke-checklist.md))

## Admin panel — remaining

- [x] Search-driven sessions (remove blind N+1)
- [x] Chloe admin user picker + quota form polish
- [x] User drawer activity tab (audit filter)
- [x] User picker debounced search
- [x] Reports/Mail copy aligned with API
- [x] Remove dead AdminDomainPanel / legacy JSON modal

## Launcher — remaining

- [ ] Chloe/password/E2E payload schema alignment once remote OpenAPI schemas are confirmed online (multi-key payloads for compatibility)
- [x] Tauri updater plugin (GitHub Releases `latest.json` + signed NSIS) — see [docs/launcher-updater.md](docs/launcher-updater.md)
- [ ] Optional Modrinth dependency picker / `.mrpack` extraction
- [ ] Cross-session resume of partial Modrinth `.part` downloads
- [ ] Dedicated remote `datapacks` API field (today: `cf-datapack:` in optional_mods)

### Update layers (do not confuse)

- **Launcher UI** (Discord panel layout, React): needs a new client release + in-app updater — no remote UI hot-patch.
- **Guild builds**: content sync via managed manifest (`update-available` / `syncManagedBuild`) — game files only.
- **Hotfixes API**: announcement text on Updates; not an installer.

## Done (do not re-open)

- [x] Prefer dedicated GPU → Windows `UserGpuPreferences` + launch path for `javaw.exe`
- [x] Windows Game Bar / game recognition for CultForge + `javaw.exe`
- [x] Persist `lastPlayed` + playtime on launch/exit
- [x] Local backups (async zip under `%APPDATA%/CultForge/backups`)
- [x] World Management: `scan_world` / `scan_worlds` for seed, spawn, icon, mode, difficulty, MC version, size
- [x] Deeper crash heuristics + richer crash `.md` (session logs, JVM/GPU/mod patterns, system state)
- [x] **Chloe**: drawer + `POST /v1/chloe/chat` + `GET /v1/chloe/quota` (header sparkles button)
- [x] **Chloe local LLMs**: official system prompt via `GET /v1/chloe/system-prompt` (+ bots registry branding / theme)
- [x] **Chloe pending actions**: list / confirm / deny / report result (`/v1/chloe/actions/...`) + local executors
- [x] **Chloe agentic WS**: `chloe.action.pending` / `execute`, `open_launcher`, launcher-state / last-played sync
- [x] **Chloe inventory + local tools**: `list_local_builds` / `list_local_mods`, `/chloe/inventory`, `/chloe/tools`, loopback action confirm/deny/execute
- [x] **E2E identity**: Settings → generate/enroll ECDSA P-256 + fetch public identity
- [x] **Password recovery**: Login → forgot email + token reset (`password_forgot` / `password_reset`)
- [x] **Local assistant keys**: Settings → Gemini / OpenAI-compatible API key in OS keyring only (never CultForge servers)
- [x] **Lobby music catalog**: `/v1/music` + `/v1/music/lobby` theme/lyrics; start ~1.5s before splash ends
- [x] Platform admin panel (shell, schema forms, tabbed dialogs, catalog proxy)
- [x] Sidecar catalog template path matching (`_catalog_path_matches`)
- [x] Admin unit tests (`npm test`) + smoke checklist doc

## Notes

- Auth `create_guild` / `delete_guild` are **deprecated** — keep using the guilds host (`guilds.cultforge.com`) only.
- Prefer sidecar `send(module, command)` over calling remote hosts directly from React.
- Manifest `&.bots[]` now includes `system_prompt_url`; bot brand + prompt also exposed under `/v1/bots/{key}` (+ `/theme`, `/system-prompt`).
- Ship with `npm run release:windows` → artifacts under `src-tauri/target/release/bundle/` + `dist-release/RELEASE-2.4.0.txt`.

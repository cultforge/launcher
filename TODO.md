# CultForge launcher backlog

Remote API catalog: [https://api.cultforge.com/manifest.json](https://api.cultforge.com/manifest.json) (`&.build_id`: `v2026.08.13-win`).

## Release: 2.4.4

Target ship semver: **2.4.4**. Stamps: **`2.4.4`** (production).

- [x] Product work for 2.4.4 (roles/server perms, live share, lobby, Gen2 prune, UI polish)
- [ ] Admin / installed-app smoke signed off
- [x] Publish `v2.4.4` tag pushed — Actions building (Windows + macOS + Linux); follow with `latest.json` when green

## Release: 2.4.3

Target ship semver: **2.4.3**. Stamps: **`2.4.3`** (production).

- [x] Product work for 2.4.3 complete (PATCH-1 + PATCH-2)
- [x] Drop `-dev` → unify stamps to `2.4.3`
- [ ] Admin / installed-app smoke signed off
- [x] Publish `v2.4.3` (GitHub Actions: Windows + macOS + Linux) + `latest.json`

## PATCH - 1 of 2.4.3

### Batch 1 — Bugs + foundation

- [x] **[MOST IMPORTANT] Copy + share** — copy button wherever it fits; Share creates a deep link and copies it
- [x] **Lobby music**
  - [x] Mute/off toggle sometimes does not stop playback
  - [x] After restart, music plays again even though the option was left off/muted
- [x] **Presence** — not picking up (players / online status not reflecting)
- [x] **Servers tab** — do not show guild servers to non-members
- [x] **Guild builds download** — installs sometimes incomplete (mods missing); reinstall then brings them in
- [x] **My Builds — Reinstall** — add reinstall button for builds installed from a **guild**
- [x] **Guild agent buzz** — player announcements not formatted correctly

### Batch 2 — Player surfaces

- [x] **Feed (news)** — bring News panel back as **Feed**; fetch Minecraft news from open-source networks only
- [x] **Friends UI overhaul**
- [x] **Discord tab overhaul** — deeper integration + overlays
- [x] **Settings full-page overhaul** — real rewrite, not a layout tweak

### Batch 3 — Admin panel

- [x] **Admin panel overhaul + bug fixes**
  - [x] Overview: stats not showing
  - [x] Users: underusing API/data; feels like an API console — make it UI-centric
  - [x] Audit: no context; More button does not work
  - [x] Comms: must type user id; field is congested
  - [x] Rate limits: no setup guidance; too complex / non-human copy
  - [x] Reports failing
  - [x] Guilds (`admins/guilds`) UI overhaul
  - [x] Invites: missing use counts and richer metrics
  - [x] Auth: incomplete metrics
  - [x] Sessions tab too technical
- [x] **Technical IDs** — keep IDs available; for platform admin add a button to show JSON responses from the server anywhere in the launcher

### Batch 4 — Agent / My PC

- [x] **Agent / My PC**
  - [x] Connected vs worlds **Offline** mismatch
  - [x] After Start + logs, Start button still shown — fix status
  - [x] Options not full-fledged: only 1–2 settings, not entire `options.txt` GUI
- [x] **My PC console** — color-coded logs
- [x] **My PC Advanced** — UI incomplete; overall My PC UI congested

## PATCH - 2 of 2.4.3 — Experimental

Behind Settings → Experimental (or equivalent). Default **off**.

- [x] **Windows toast notifications**
  - [x] Native Windows toast when the launcher receives any notification
  - [x] After a notification is read/dismissed in-app, do **not** toast it again
  - [x] Notification click (DM / chat-related) opens the respective chat surface
- [x] **Chat @mentions** — tag people in chats (picker + highlight + notify target when feasible)
- [x] **Account switching + MC profile**
  - [x] Switch CultForge accounts in the launcher without full reinstall friction
  - [x] Launcher creates a standard Minecraft profile for installation / launch purposes
- [x] **Per-build CPU pin (experimental toggle on each build)**
  - [x] When enabled: pin the Minecraft process to a dedicated core and raise process priority
  - [x] Keep other processes off that core (affinity isolation) as far as the OS allows

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

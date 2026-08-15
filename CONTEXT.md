# CultForge — Project Context

Desktop launcher for **CultForge** (“Forge your World”). Tauri 2 shell + React UI; local privileged work runs in Rust; remote CultForge traffic goes through a spawned FastAPI `client.py` sidecar. Store searches **Modrinth** directly.

**Layout source of truth:** `previews/launcher-var-3.png`  
**Visual language:** `src/cultkit.css` (mint/emerald forge theme)  
**Remote API catalog:** [https://api.cultforge.com/manifest.json](https://api.cultforge.com/manifest.json) (`&.build_id`: `v2026.08.12-win`)  
**Open backlog:** [`TODO.md`](TODO.md)

---

## Stack

| Layer | Tech |
|--------|------|
| Shell | Tauri 2 (`com.cultforge.app`) |
| Frontend | React 19 + TypeScript + Vite 7 |
| Styling | Tailwind 4 via `cultkit.css` |
| State | Zustand — navigation, downloads, builds, guilds, chat, settings, etc. |
| Local API | FastAPI `client.py` (spawned by Rust) |
| Store | Modrinth API `https://api.modrinth.com/v2` |

**Run:** `run.bat` / `.\run` → `npm run tauri dev`

---

## Shell layout

```
┌──────────────────────────────────────────────────────────┐
│ Header: logo | Home Builds Guilds Mods Servers Store | … │
├──────────┬─────────────────────────────┬─────────────────┤
│ SideNav  │ Main page (by primaryTab)   │ Context rail    │
│ (by tab) │                             │ (guild/social)  │
├──────────┴─────────────────────────────┴─────────────────┤
│ Footer download bar (when queue non-empty)               │
└──────────────────────────────────────────────────────────┘
```

- Store hides the left sidebar.
- Nav store: `{ primaryTab, sideItem }` in [`src/typlibs.tsx`](src/typlibs.tsx).
- Side menus per tab: [`src/manifest.tsx`](src/manifest.tsx) → `SideMenus`.

---

## Pages

| Tab | File |
|-----|------|
| Home | `src/components/frags/app-viewport/pages/HomePage.tsx` |
| Builds | `…/BuildsPage.tsx` (overview + performance widget) |
| Store | `…/StorePage.tsx` (live Modrinth search/detail/install → download queue) |
| Mods | `…/ModsPage.tsx` |
| Servers | `…/ServersPage.tsx` |
| Guilds | `…/GuildsPage.tsx` |

---

## Local client (`client.py`)

- Path (default): workspace root [`client.py`](client.py) (resolved from `src-tauri` as `../client.py`)
- Override: env `CULTFORGE_CLIENT_PY`
- Setup: `py -m pip install -r requirements.txt` before `.\run`
- Spawn: [`src-tauri/src/lib.rs`](src-tauri/src/lib.rs) reserves a free port, runs `py|python client.py <port>`, logs to `client.sidecar.log`, kills child on exit
- Frontend: [`src/lib/client.ts`](src/lib/client.ts) — `get_port` → `http://127.0.0.1:{port}`, `ping`, `health`, `send` / `sendMutate`
- Boot: splash until `/ping` (or continues in offline mode after timeout); `/health` may toast degraded remote mode

Sidecar routes include: `GET /ping`, `GET /health`, `GET /discord/widget/{guild_id}`, `/send/{module}/{command}`, auth/session helpers, `WS /ws`.

React talks to remote CultForge hosts **only** through this loopback sidecar (never browser-direct to `api.` / `auth.` / `guilds.` / `invite.` except where media URLs are displayed after rewrite).

Sidecar log: `client.sidecar.log` next to `client.py`.

---

## Remote CultForge API

Catalog: [https://api.cultforge.com/manifest.json](https://api.cultforge.com/manifest.json). Four modules/hosts:

| Module | Host (typical) | Surface |
|--------|----------------|---------|
| `api` | `api.cultforge.com` | Profile, friends, DMs, global chat, notifications, Minecraft media, Chloe, global hot updates |
| `auth` | `auth.cultforge.com` | OAuth, login/account, password forgot/reset, E2E crypto identity |
| `invite` | `invite.cultforge.com` | Pending invites, preview/accept/revoke, public invite landing |
| `guilds` | `guilds.cultforge.com` | Manifests, builds, servers/join, channels/messages, news/events/RSVP, forms, rankings, hotfixes, media |

Auth `create_guild` / `delete_guild` are **deprecated** — use the guilds host only.

Realtime: presence / global chat and guild chat bridge over WebSockets (`/v1/ws` on api + guilds) via the sidecar, not from the webview.

---

## Already live in the launcher

- **Auth / account** — OAuth providers, session, handle/avatar/password update paths via sidecar; avatar URL rewrite for canonical `cf_` uids ([`src/lib/authProfile.ts`](src/lib/authProfile.ts))
- **Social** — friends, DMs, notifications, curated invites
- **Global chat** — live history/send transport ([`src/lib/globalChatClient.ts`](src/lib/globalChatClient.ts)); messages never carry `guildId`
- **Guilds** — manifests, chat/channels, news/events/RSVP, servers/join, forms, rankings, hotfixes, media proxies
- **Guild builds** — catalog + native manifest sync ([`src/lib/guildBuildSync.ts`](src/lib/guildBuildSync.ts), Tauri sync commands)
- **Minecraft media** — public version art catalog ([`src/lib/minecraftMedia.ts`](src/lib/minecraftMedia.ts))
- **Lobby music** — official theme from `GET /v1/music` / `/v1/music/lobby` ([`src/lib/lobbyMusicApi.ts`](src/lib/lobbyMusicApi.ts)). Prefetch during splash; playback starts ~1.5s before the loading screen ends (`lobbyMusicOnLaunch`). Lyrics from the catalog feed the lyrics widget.
- **Hot updates** — global + guild hotfix lists ([`src/lib/guildHotUpdatesApi.ts`](src/lib/guildHotUpdatesApi.ts))
- **Chloe** — assistant drawer + quota ([`src/lib/chloeApi.ts`](src/lib/chloeApi.ts), header sparkles). Bots registry (`/v1/bots`, `/v1/bots/{key}`, theme + system-prompt). Local Gemini/OpenAI use `GET /v1/chloe/system-prompt` so persona stays CultForge-aligned while keys stay on device ([`src-tauri/src/secrets.rs`](src-tauri/src/secrets.rs)). Pending actions: list/confirm/deny/result ([`src/lib/chloeActionsApi.ts`](src/lib/chloeActionsApi.ts), local exec in [`src/lib/chloeActionExec.ts`](src/lib/chloeActionExec.ts)). Presence WS `chloe.action.pending` / `execute` / `local` (Discord confirm too). Last-played + inventory snapshot → `POST /v1/chloe/launcher-state` via sidecar `/chloe/last-played` and `/chloe/inventory`. Sidecar also exposes loopback `/chloe/actions/*`, `/chloe/tools`, and tools `list_local_builds` / `list_local_mods`.
- **Password recovery** — forgot/reset on Login ([`src/lib/passwordRecoveryApi.ts`](src/lib/passwordRecoveryApi.ts))
- **E2E identity** — local keypair enroll + public fetch ([`src/lib/cryptoIdentityApi.ts`](src/lib/cryptoIdentityApi.ts), Settings)

---

## Local native capabilities (Tauri / Rust)

- Per-build instances under `%APPDATA%/CultForge/instances/{buildId}/`
- Local content scan: mods (scanner icons), packs, shaders, datapacks, worlds (`scan_world` seed/spawn/icon)
- Modrinth + guild-manifest downloads with hash verify into instance folders
- Launch, playtime / lastPlayed persistence, dedicated GPU preference, Windows game registration
- Backups zip (background thread) under `%APPDATA%/CultForge/backups/{buildId}/`
- Crash report generation with session logs + system snapshot (deeper heuristics still open — see `TODO.md`)

---

## Modrinth

[`src/lib/modrinth.ts`](src/lib/modrinth.ts) — `searchModrinth`, `getModrinthProject`, version listing, and `resolveModrinthInstallPlan` (primary + required dependencies).

Installs are native: React resolves a plan → Tauri `start_modrinth_install` → Rust downloads into a content-addressed cache under Settings `downloadsPath`, verifies SHA-512, then installs into the active BuildInstance `location` (`mods` / `resourcepacks` / `shaderpacks` / `datapacks`). Progress is emitted as `download-progress` events into `useDownloadStore` (footer dock + Downloads page). Cancel via `cancel_download`.

---

## Key paths

```
src/
  App.tsx, main.tsx, manifest.tsx, typlibs.tsx, userstore.tsx, cultkit.css
  lib/client.ts, lib/modrinth.ts, lib/guild*.ts, lib/globalChat*.ts, …
  components/layout.tsx, header.tsx, footer.tsx, splash.tsx
  components/frags/app-{header,sidenavbar,viewport,contextnav}/
  widgets/performance.tsx
src-tauri/src/lib.rs   # get_port + spawn client.py + command registration
previews/              # design references
TODO.md                # current open backlog
```

---

## Build architecture

A **Build** is a server-tailored Minecraft version plus its loader, mods, resource packs, shaders, configuration, and server metadata. Builds explicitly exclude player worlds and `saves/**` from **remote** release manifests.

- FastAPI / remote guild APIs own build catalogs, release manifests, resolved artifact URLs, sizes, and hashes.
- React presents catalog/compatibility data and captures user intent.
- Tauri/Rust owns privileged downloads, verification, extraction, filesystem installation, atomic update/rollback, process control, and launch.
- Remote build releases remain separate from locally installed `BuildInstance` records.
- Local player worlds under `saves/` are instance data (World Management), not part of a remote Build package.
- Do not add real or simulated download/install behavior unless a task explicitly includes the execution layer. UI-only catalog work must not enqueue fake downloads or mutate local installed builds.

---

## Chat boundary

- **Global chat** is live (REST history/send + WS fan-out via sidecar). Optimistic client nonces reconcile pending messages with server IDs/sequences.
- React still does not call the remote chat host directly; FastAPI owns auth, ordering, moderation, reports, rate limits, and the remote WS bridge.
- Tauri/Rust owns sidecar lifecycle only; it does not own chat ordering or moderation.
- Global messages never contain `guildId`. Guild channel chat is a separate domain and UI.

---

## Out of scope / later

See [`TODO.md`](TODO.md) for the active checklist. High-level gaps:

- Chloe/password/E2E payload schema alignment (once remote OpenAPI confirmed)
- Tauri updater plugin polish
- Optional Modrinth dependency picker / `.mrpack` extraction
- Cross-session resume of partial Modrinth `.part` downloads

Chloe chat/quota/system-prompt/pending-actions + bot branding, E2E identity enroll/fetch, and password forgot/reset are wired in the launcher (header drawer, Settings, Login).

## Platform admin panel

Staff console lives under Settings → Admin (requires platform admin + step-up). UI uses schema-driven forms from [`src/lib/adminActionSchemas.ts`](src/lib/adminActionSchemas.ts); all remote calls go through the sidecar catalog proxy (`POST /admin/request`). Templated catalog paths (e.g. `/v1/admin/users/{id}/sessions`) are matched in [`client.py`](client.py) via `_catalog_path_matches`.

Pre-release manual pass: [`docs/admin-smoke-checklist.md`](docs/admin-smoke-checklist.md). Automated guards: `npm test` (admin form/registry unit tests) + `tests/test_catalog_paths.py` (sidecar path matching).

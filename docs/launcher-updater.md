# CultForge launcher auto-update

In-app updates use [Tauri’s updater plugin](https://v2.tauri.app/plugin/updater/) with a dual feed:

1. **Live (preferred):** `https://api.cultforge.com/v1/launcher/updates/latest.json`
2. **Fallback:** `https://github.com/cultforge/launcher/releases/latest/download/latest.json`

The client tries the API first; any non-2xx response falls through to GitHub Releases.

Override the GitHub repo slug with env `CULTFORGE_GITHUB_REPO` (default `cultforge/launcher`).

## What updates what

| Layer | Mechanism | Example |
| --- | --- | --- |
| **Launcher UI** (Discord panel layout, React bugs) | Signed **MSI** via updater | Ship a new semver release; users install from **Updates** |
| **Guild builds** | Manifest sync (`syncManagedBuild`) | Mods / packs / shaders — not launcher React |
| **Hotfixes API** | Text announcements on Updates | Informational only — does **not** patch UI |

## One-time: signing keys

```powershell
npm run tauri -- signer generate -w "$env:USERPROFILE\.tauri\cultforge.key" --ci
```

- **Public** key is embedded in `tauri.conf.json` → `plugins.updater.pubkey`
- **Private** key stays at `%USERPROFILE%\.tauri\cultforge.key` — never commit it
- Env: `TAURI_SIGNING_PRIVATE_KEY` or `TAURI_SIGNING_PRIVATE_KEY_PATH` (+ optional password)

## Release + publish

1. Bump semver / display strings as usual.
2. `npm run release:windows` → MSI + `.sig` + `dist-release/latest.json` (NSIS also copied when available).
3. Upload to GitHub Releases (tag `v{semver}`), including **`latest.json`**, the MSI, and the `.sig`.

Installer URLs inside `latest.json` point at GitHub release assets. The API feed should return the **same JSON** (proxy or mirror).

### API live channel (`api.cultforge.com`)

`api.cultforge.com` is served via Cloudflare Tunnel. Until the origin exposes the route, the client uses the GitHub fallback.

Add on the API origin (any stack):

```http
GET /v1/launcher/updates/latest.json
```

Proxy or mirror:

`https://github.com/cultforge/launcher/releases/latest/download/latest.json`

Response: `200` + `Content-Type: application/json` + Tauri updater body (`version`, `notes`, `pub_date`, `platforms.windows-x86_64.url` + `signature`).

Optional Cloudflare Worker equivalent lives in [`deploy/launcher-updates-worker.js`](../deploy/launcher-updates-worker.js) (requires Worker deploy rights on the zone).

## Client behavior

- Boot / Updates **Check** calls the updater when online inside the Tauri app.
- Pending launcher row (`launcher:{version}`) → **Update** downloads MSI, installs (`passive`), relaunches.
- Hotfix rows remain informational.

## Smoke test

1. Install this bootstrap build (includes API + GitHub endpoints + pubkey).
2. Publish a **newer** signed release with `latest.json` on GitHub (and on the API once wired).
3. Open CultForge → Updates → **Update** → relaunch at the new version.

# CultForge launcher auto-update (GitHub Releases)

In-app updates use [Tauri’s updater plugin](https://v2.tauri.app/plugin/updater/) with a static feed on GitHub Releases:

`https://github.com/cultforge/launcher/releases/latest/download/latest.json`

Override the repo slug for upload URLs with env `CULTFORGE_GITHUB_REPO` (default `cultforge/launcher`). Change the endpoint in [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json) if the public release repo differs.

## What updates what

| Layer | Mechanism | Example |
| --- | --- | --- |
| **Launcher UI** (Discord panel layout, React bugs) | Signed NSIS via updater | Ship a new semver release; users install from **Updates** |
| **Guild builds** | Manifest sync (`syncManagedBuild`) | Mods / packs / shaders — not launcher React |
| **Hotfixes API** | Text announcements on Updates | Informational only — does **not** patch UI |

Discord panel layout or guild Discord tab bugs **cannot** ship without a launcher release. After this pipeline is live, that release is an in-app update, not a hand-distributed installer.

## One-time: signing keys

Generate (do this once; losing the private key breaks future updates for clients that embed this public key):

```powershell
npm run tauri -- signer generate -w "$env:USERPROFILE\.tauri\cultforge.key" --ci
```

- **Public** key is already embedded in `tauri.conf.json` → `plugins.updater.pubkey` (regenerate + replace pubkey only if you intentionally rotate; existing installs will not accept signatures from a new key until they get a new binary somehow).
- **Private** key stays at `%USERPROFILE%\.tauri\cultforge.key` — never commit it.
- Signing env (used by `npm run release:windows` / Tauri bundler):
  - `TAURI_SIGNING_PRIVATE_KEY` — key contents, **or**
  - `TAURI_SIGNING_PRIVATE_KEY_PATH` — path to the key file (release script defaults to `~\.tauri\cultforge.key` if present)
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — only if the key was created with a password

## Release + publish

1. Bump semver / display strings as usual.
2. `npm run release:windows` (requires signing key; produces NSIS, `.sig`, `dist-release/latest.json`).
3. Upload to GitHub Releases (tag `v{semver}`), including **`latest.json`**, the NSIS setup exe, and the `.sig` file. The release script prints a `gh release create` command.

Asset names must match the URLs inside `latest.json` (`…/releases/download/v{semver}/{NSIS filename}`).

MSI is optional for manual install; **in-app updater uses NSIS only**.

## Client behavior

- Boot / Updates **Check** calls the updater when online inside the Tauri app.
- A pending launcher row (`launcher:{version}`) appears on Updates; **Update** downloads, installs (Windows `passive`), and relaunches.
- Hotfix rows remain informational.

## Smoke test

1. Install an older build that already embeds the current pubkey.
2. Publish a newer signed release with `latest.json` on `…/releases/latest/download/latest.json`.
3. Open CultForge → boot toast and/or Updates → **Update** → relaunch at the new version.

## Dev notes

- Browser `npm run dev` does not run the updater (`isTauriRuntime()` guard).
- `createUpdaterArtifacts: true` in `tauri.conf.json` makes the bundler emit `.sig` files during release builds.

# Cross-platform release builds (GitHub Actions)

Windows day-to-day releases still use local `npm run release:windows` (MSI + NSIS +
`latest.json`), because frozen `*.exe` sidecars are gitignored.

Linux + macOS installers are built on GitHub Actions and attached to the same release tag.

## Manual dispatch (recommended for v2.4.0)

1. Push `main` with `.github/workflows/release.yml`.
2. Optional repo secrets (updater `.sig` on CI):
   - `TAURI_SIGNING_PRIVATE_KEY`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
3. Run:

```bash
gh workflow run "Build CultForge" \
  --repo cultforge/launcher \
  -f tag=v2.4.0 \
  -f platforms=linux,macos
```

4. When green, AppImage / `.deb` / `.dmg` appear on the existing
   [v2.4.0](https://github.com/cultforge/launcher/releases/tag/v2.4.0) release.

Unix builds fetch **scanner** + **client** via Phase 0 compat
(`node scripts/fetch-companions.mjs`) and bundle `resources/scanner` and
`resources/client`. Broker remains Windows-only until unix assets exist.

## Tag push

Pushing a `v*` tag also runs the matrix (`linux`, `macos`, `windows`). The Windows job
still needs `src-tauri/resources/ctfgbroker.exe` (local/cache or fetch) plus fetched
`scanner.exe` / `client.exe` — prefer `workflow_dispatch` with `platforms=linux,macos`
when only unix installers are needed.

Workflow file: `.github/workflows/release.yml`

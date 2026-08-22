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

Unix builds fetch **scanner** from [mc-scanner](https://github.com/cultforge/mc-scanner)
via Phase 0 compat (`npm` / `node scripts/fetch-companions.mjs`) and bundle
`resources/scanner`. The shell UI runs; local FastAPI still needs a Windows
`client.exe` or later Phase 2 unix `client` until that lands.

## Tag push

Pushing a `v*` tag also runs the matrix (`linux`, `macos`, `windows`). The Windows job
still needs `src-tauri/resources/{client,ctfgbroker}.exe` (local/cache) plus fetched
`scanner.exe` — prefer `workflow_dispatch` with `platforms=linux,macos` unless those
binaries are available to CI.

Workflow file: `.github/workflows/release.yml`

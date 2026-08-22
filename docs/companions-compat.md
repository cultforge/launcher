# Companion compatibility (Phase 0–2)

Contract that maps **launcher semver → allowed companion binary release tags**.

Source of truth: [`src/data/companions.compat.json`](../src/data/companions.compat.json)  
Fetch: [`scripts/fetch-companions.mjs`](../scripts/fetch-companions.mjs)

## Phases

| Phase | Companion | Status |
|-------|-----------|--------|
| 0 | compat map | shipped |
| 1 | `scanner` | `active` @ mc-scanner `v0.1.0` |
| 2 | `client` | `active` @ launcher `client-v0.1.0` |
| 3 | `ctfgbroker` | `pending` |

## Client build split (Phase 2)

| OS | How |
|----|-----|
| **Windows** | Local `npm run sidecar:freeze`, then upload `client.exe` to the release |
| **Linux / macOS** | GitHub Actions **Build client (Nuitka)** only |

```bash
# CI (unix)
gh workflow run "Build client (Nuitka)" --repo cultforge/launcher -f tag=client-v0.1.0

# Windows (after freeze finishes)
powershell -ExecutionPolicy Bypass -File scripts/upload-client-windows.ps1 -Tag client-v0.1.0
```

Assets on `client-v0.1.0`:

- `client.exe` (manual)
- `client-linux-x86_64`, `client-macos-arm64`, `client-macos-x86_64` (Actions)

```bash
npm run companions:fetch
# or
node scripts/fetch-companions.mjs --only client
```

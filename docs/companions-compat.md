# Companion compatibility (Phase 0–3)

Maps **launcher semver → allowed companion binary release tags**.

Source: [`src/data/companions.compat.json`](../src/data/companions.compat.json)  
Fetch: `npm run companions:fetch`

## Status

| Phase | Companion | Tag / source |
|-------|-----------|----------------|
| 0 | compat map | shipped |
| 1 | scanner | `cultforge/mc-scanner` @ `v0.1.0` |
| 2 | client | `cultforge/launcher` @ `client-v0.1.0` — Windows manual, Linux/macOS Actions |
| 3 | ctfgbroker | `cultforge/launcher` @ `broker-v0.1.0` — Windows optional (soft-skip if missing; unix TBD) |

`ctfgbroker` is **optional**: fetch/use when the Windows asset is present; never fail
builds or launcher boot when it is absent.

## Uploads (Windows)

```powershell
npm run sidecar:freeze
npm run client:upload-windows

npm run broker:upload-windows
```

## Fetch into resources

```bash
npm run companions:fetch
```

On Linux/macOS the launcher resolves `resources/client`, runs `chmod +x`, and clears macOS quarantine when spawning. Release CI bundles `scanner` + `client`.

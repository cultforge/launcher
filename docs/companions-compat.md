# Companion compatibility (Phase 0 + 1)

Contract that maps **launcher semver → allowed companion binary releases**.

Source of truth: [`src/data/companions.compat.json`](../src/data/companions.compat.json)  
Typed helpers: [`src/lib/companionsCompat.ts`](../src/lib/companionsCompat.ts)  
Fetch script: [`scripts/fetch-companions.mjs`](../scripts/fetch-companions.mjs)

## Why

Companions (`scanner`, `client`, `ctfgbroker`) live in separate repos. The launcher must only **download / ship** release tags that this file allows for that launcher version.

## Phases

| Phase | Companion | Status in 2.4.0 / 2.4.1 |
|-------|-----------|-------------------------|
| 0 | (this file) | shipped |
| 1 | `scanner` (`cultforge/mc-scanner`) | `active` @ `v0.1.0` — fetch + bundle |
| 2 | `client` | `pending` |
| 3 | `ctfgbroker` | `pending` |

## Fetch (Phase 1)

```bash
npm run companions:fetch
# or
node scripts/fetch-companions.mjs --only scanner
```

Downloads the compat-allowed asset for the host OS into `src-tauri/resources/` (`scanner.exe` or `scanner`) and copies it to the workspace root for `tauri dev`.

Wired into:

- `scripts/release-windows.ps1` (before sidecar freeze)
- `.github/workflows/release.yml` (before Tauri build; linux/macos bundle `resources/scanner`)

## Rules for fetch / CI

1. Load compat for `package.json` / app version.
2. Skip any companion with `status != "active"` or null `tag` / `repo`.
3. Reject tags outside `min_tag`…`max_tag` (and prefer exact `tag`).
4. Download only the asset name listed for the build platform.

## Runtime (scanner)

`scanner.rs` resolves `scanner` / `scanner.exe`, runs `chmod +x` on unix, and clears macOS quarantine when possible.

## Live feed (optional later)

A future `GET https://api.cultforge.com/v1/launcher/companions/compat.json` may mirror this document. Runtime must still refuse tags not allowed for the **running** launcher version.

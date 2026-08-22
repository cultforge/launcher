# Companion compatibility (Phase 0–2)

Contract that maps **launcher semver → allowed companion binary releases**.

Source of truth: [`src/data/companions.compat.json`](../src/data/companions.compat.json)  
Typed helpers: [`src/lib/companionsCompat.ts`](../src/lib/companionsCompat.ts)  
Fetch script: [`scripts/fetch-companions.mjs`](../scripts/fetch-companions.mjs)

## Why

Companions (`scanner`, `client`, `ctfgbroker`) live as separate release artifacts. The launcher must only **download / ship** release tags that this file allows for that launcher version.

## Phases

| Phase | Companion | Status in 2.4.0 / 2.4.1 |
|-------|-----------|-------------------------|
| 0 | (this file) | shipped |
| 1 | `scanner` (`cultforge/mc-scanner`) | `active` @ `v0.1.0` |
| 2 | `client` (`cultforge/launcher` tag `client-v*`) | `active` @ `client-v0.1.0` (Windows) |
| 3 | `ctfgbroker` | `pending` |

## Fetch

```bash
npm run companions:fetch
# or
node scripts/fetch-companions.mjs --only scanner
node scripts/fetch-companions.mjs --only client
```

Skips companions with no asset for the current OS (e.g. client on Linux until Phase 2 expands).

## Build client (CI + local)

| Path | Command |
|------|---------|
| **GitHub Actions** | Workflow **Build client (Nuitka)** → publishes `client-v0.1.0` with `client.exe` |
| **Local Windows** | `npm run sidecar:freeze` (same Nuitka flags) |

```bash
gh workflow run "Build client (Nuitka)" --repo cultforge/launcher -f tag=client-v0.1.0
```

Wired into:

- `scripts/release-windows.ps1` (companions fetch before freeze)
- `.github/workflows/release.yml` (scanner on all OS; client when Windows asset exists)
- `.github/workflows/build-client.yml` (sidecar-only release)

## Runtime (scanner)

`scanner.rs` resolves `scanner` / `scanner.exe`, runs `chmod +x` on unix, and clears macOS quarantine when possible.

## Live feed (optional later)

A future `GET https://api.cultforge.com/v1/launcher/companions/compat.json` may mirror this document.

# Companion compatibility (Phase 0)

Contract that maps **launcher semver → allowed companion binary releases**.

Source of truth: [`src/data/companions.compat.json`](../src/data/companions.compat.json)  
Typed helpers: [`src/lib/companionsCompat.ts`](../src/lib/companionsCompat.ts)

## Why

Companions (`scanner`, `client`, `ctfgbroker`) live in separate repos. The launcher must only **download / ship** release tags that this file allows for that launcher version.

## Phases

| Phase | Companion | Status in 2.4.0 / 2.4.1 |
|-------|-----------|-------------------------|
| 0 | (this file) | shipped |
| 1 | `scanner` (`cultforge/mc-scanner`) | `active` @ `v0.1.0` |
| 2 | `client` | `pending` |
| 3 | `ctfgbroker` | `pending` |

## Rules for fetch / CI (Phases 1+)

1. Load compat for `package.json` / app version.
2. Skip any companion with `status != "active"` or null `tag` / `repo`.
3. Reject tags outside `min_tag`…`max_tag` (and prefer exact `tag`).
4. Download only the asset name listed for the build platform.

## Live feed (optional later)

A future `GET https://api.cultforge.com/v1/launcher/companions/compat.json` may mirror this document. Runtime must still refuse tags not allowed for the **running** launcher version.

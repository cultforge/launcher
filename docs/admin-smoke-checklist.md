# Admin smoke checklist

Run once before release sign-off with a staff account. Step up when prompted (Re-step-up in the admin top bar).

## Prerequisites

- [ ] Sidecar running (`client.py`); restart after sidecar updates
- [ ] Staff catalog loaded (no empty admin nav)
- [ ] Admin step-up completed (capability active)

## Global mutates (compose / create)

| Action | Section | Step-up | Pass |
|--------|---------|---------|------|
| Send notification (users) | Notifications | if required | [ ] |
| Send notification (all active) | Notifications | if required | [ ] |
| Send email | Mail | if required | [ ] |
| Create rate limit | Rate limits | if required | [ ] |
| Run report job | Reports | if required | [ ] |
| Publish global update | Hotfixes | if required | [ ] |
| Set Chloe quota | Chloe | if required | [ ] |

## Row mutates (per-record)

| Action | Section | Step-up | Pass |
|--------|---------|---------|------|
| Ban / unban user | Users | if required | [ ] |
| Manage roles (grant/revoke admin) | Users | if required | [ ] |
| Revoke all user sessions | Users | if required | [ ] |
| Revoke single session | Sessions / user drawer | if required | [ ] |
| Delete rate limit | Rate limits | if required | [ ] |
| Revoke invite | Invites | if required | [ ] |
| Guild admin actions | Guilds | if required | [ ] |

## Read paths (no mutate)

| Check | Expected | Pass |
|-------|----------|------|
| Auth overview KPI | Platform active sessions count | [ ] |
| Sessions panel | Pick user → sessions load (no blind 403) | [ ] |
| User drawer → Sessions tab | Per-user sessions list | [ ] |
| User drawer → Activity tab | Audit rows filtered for user | [ ] |
| Reports list | List only (no resolve/escalate API) | [ ] |
| Mail panel | Send-only UI (no delivery log GET) | [ ] |

## Sidecar log

- [ ] No unexpected `403` on templated paths like `/v1/admin/users/{uuid}/sessions` after step-up
- [ ] Catalog guard matches concrete IDs (post `_catalog_path_matches` fix)

## Sign-off

- Tester: _______________
- Date: _______________
- Build / commit: _______________

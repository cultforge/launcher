# Admin smoke checklist

Run once before release sign-off with a staff account. Use **Step up** / **Re-step-up** in the admin top bar when mutates need capability.

## Prerequisites

- [ ] Sidecar running (`client.py`); restart after sidecar updates
- [ ] `whoami` reports `admin === true` (Admin entry under **You**)
- [ ] Console opens (reads may work before step-up; mutates need capability)
- [ ] Capability badge shows `active` after step-up; countdown visible

## Nav IA

- [ ] Left nav: Overview, Users, Audit, Comms, Rate limits, Reports, Guilds, Invites, Auth, Chloe, Hotfixes, Session
- [ ] Whoami / Catalog are **not** primary nav (Session only)
- [ ] Exit returns to Home; Audit stream drawer toggles from top bar

## Global mutates

| Action | View | Step-up | Pass |
|--------|------|---------|------|
| Send notification | Comms | required | [ ] |
| Send mail | Comms | required | [ ] |
| Create rate limit | Rate limits | required | [ ] |
| Delete rate limit (type `delete`) | Rate limits | required | [ ] |
| Run report | Reports | required | [ ] |
| Create hotfix | Hotfixes | required | [ ] |
| Set Chloe quota | Chloe | required | [ ] |
| Expire Chloe action | Chloe | required | [ ] |

## Row mutates

| Action | View | Confirm | Pass |
|--------|------|---------|------|
| Ban / unban user | Users | type-to-confirm ban | [ ] |
| Grant / revoke admin | Users | — | [ ] |
| Revoke all user sessions | Users | type `revoke-all` | [ ] |
| Revoke single session | Users drawer | — | [ ] |
| Revoke invite | Invites | type `revoke` | [ ] |
| Unlist guild | Guilds | type `unlist` | [ ] |
| Set guild listed flags | Guilds | — | [ ] |
| Revoke user auth sessions | Auth | type `revoke-all` | [ ] |

## Read paths

| Check | Expected | Pass |
|-------|----------|------|
| Overview | Live metrics + services aggregate + Chloe counts | [ ] |
| Users search | `q` / banned / admin filters | [ ] |
| Audit list + filters | Action / actor filters; More pagination | [ ] |
| Audit stream drawer | Poll/live lines while open | [ ] |
| Reports detail drawer | GET `{id}` JSON | [ ] |
| Session view | Whoami fields only (no tokens); catalog count | [ ] |

## Auth UX

- [ ] Mutate without capability → disabled / toast; badge `needs step-up` or `expired`
- [ ] Stale OAuth session → badge `re-login` + copy to sign out / in again
- [ ] No JWT / capability string visible in UI

## Sidecar log

- [ ] No unexpected `403` on `/v1/admin/users/{id}/sessions` after step-up
- [ ] Catalog guard still matches concrete IDs when catalog is loaded

## Sign-off

- Tester: _______________
- Date: _______________
- Build / commit: _______________

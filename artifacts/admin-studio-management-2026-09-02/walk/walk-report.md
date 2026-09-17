# Admin Studio Management — Runtime Verification Walk

**Date:** 2026-09-02
**Worktree:** /Users/kody/Code/patina-merged/.codex/worktrees/agent-admin-studios (branch admin-studios/build)
**Status: COMPLETE** — resumed after an initial permission blocker (see history below), booted via inline env vars per coordinator instruction, walked all 13 steps.

## Env / boot

- Did **not** read or create any `.env*` file (per resumed instructions). Booted with env vars passed inline on the command line, values sourced from `supabase status -o env` (API_URL=`http://127.0.0.1:54321`, ANON_KEY, SERVICE_ROLE_KEY):
  ```
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY> \
  SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY> SUPABASE_URL=http://127.0.0.1:54321 \
  NEXT_PUBLIC_ADMIN_URL=http://localhost:3001 NODE_ENV=development \
  pnpm --filter @patina/admin-portal dev
  ```
- Port 3001 was free before boot; server came up clean (`Ready in 408ms`), `/auth/signin` returned `200` on first poll.
- Local Supabase stack confirmed up via `supabase status` (API 54321, DB 54322, Studio 54323, Mailpit/Inbucket 54324).
- Teardown: dev server killed by PID (found via `lsof -i :3001`), port confirmed free afterward. Left local DB with the Walk Studio test data in place, as instructed.

## Sign-in note

The seed-account brief said `admin@patina.dev` / `password123` is super_admin. The actual sign-in flow on `/auth/signin` is **email + one-time passcode**, not password — no password field exists. Used the page's own "Dev Accounts" panel (visible only in development) to one-click sign in as `admin@patina.dev`, labeled there as **ADMIN** (a separate `superadmin@patina.dev` account is labeled SUPER_ADMIN). DB check confirmed `admin@patina.dev` in fact holds `roles.domain='admin'` role `super_admin` (id `186ed02b-7aff-47d7-b290-280b0710e66a`) — so the two accounts are equivalently privileged at the DB level despite the dev-panel label difference.

## PASS/FAIL table

| Step | Result | Evidence |
|---|---|---|
| 1. Sign in | PASS | Dev-panel one-click sign-in as admin@patina.dev landed on `/dashboard`. `01-signin.png` |
| 2. `/studios` list + search + filter | PASS | Local Dev Studio row (owner designer@patina.dev, 2 members, FREE, ACTIVE) present; owner-email search narrowed to 2 rows; `zzz` search showed "No studios match these filters"; status=Active filter showed only active rows; People sub-nav has "Studios". `02-*.png` |
| 3. Create Studio (owner=client@patina.dev, name="Walk Studio") | PARTIAL PASS | Studio created (toast "Studio created"), but did **not** auto-navigate to `/studios/<id>` as the brief expected — stayed on `/studios` list; had to click the row manually. DB: `organizations` row active, `organization_members` owner/active, `profiles.is_designer` flipped to `true` for client@patina.dev. `03-*.png` |
| 4. Overview → Edit (website, tier=professional) | PASS | Values shown on Overview immediately; DB `website='https://walk.example'`, `subscription_tier='professional'`. `04-overview-edit-saved.png` |
| 5. Roster → Add member (support@patina.dev, Studio Manager title, tier auto-suggested Admin) → Edit to tier=Member, "No title" | PASS (after an infra blip — see Notable finding #1) | Tier correctly auto-suggested "Admin" on picking Studio Manager title; DB row `role=admin, staff_role=studio_manager`; after edit, DB `role=member`, both title fields null. `05-roster-member-added-edited.png` |
| 6. Invite by Email (walk-invite@example.com) → Inbucket → Resend → Cancel | **FAIL** on Invite/Resend, **PASS** on Cancel — see Notable finding #2 | Invite and Resend both returned `403 {"error":"forbidden"}`. Seeded a synthetic pending-invite row directly in the DB to test the Cancel path independently: Cancel worked (toast "Invite canceled", DB `status='removed'`, Overview count dropped to "0 invited"). Inbucket was not checked since no invite email was ever sent. `06-*.png` |
| 7. Transfer ownership → support@patina.dev | PASS | Roster shows Support Agent=OWNER, Client User=ADMIN; DB confirms exactly one active `owner` role row. `07-ownership-transferred.png` |
| 8. Remove former owner (now admin, client@patina.dev) | PASS | Row disappeared from roster; toast "Member removed". `08-member-removed.png` |
| 9. Suspend (reason) → Reactivate → Deactivate → Reactivate | PASS | Status badges correctly cycled SUSPENDED → ACTIVE → DEACTIVATED → ACTIVE; DB `organizations.status` matched at each step (final: `active`). `09-*.png` |
| 10. Activity tab lists all actions; DB audit_logs | PASS | UI listed 12 events (Create, Update, Add, Set Title, Set Role, Cancel, Transfer Ownership, Remove, Suspend, Reactivate, Deactivate, Reactivate) matching DB exactly (see rows below). The two failed Invite/Resend attempts correctly do **not** appear (no audit log write on a rejected request — correct behavior). `10-activity-tab.png` |
| 11. `/users/<support id>` → Studios tab → link navigates | PASS | Studios tab listed "Walk Studio · ACTIVE · OWNER · active"; clicking it navigated to the studio detail page. `11-*.png` |
| 12. Projects tab on Local Dev Studio | PASS | Rendered "Aspen Loft — Living Room Refresh", active, no error. `12-projects-tab-local-dev-studio.png` |
| 13. Negative: Edit member on owner → tier disabled; no console errors | PASS | Edit Member modal on the owner row shows a disabled/empty Tier select with helper text "Use Transfer Ownership to change the owner's tier." No console errors observed on any studio page throughout the walk. `13-owner-tier-disabled.png` |

## Notable findings

**1. (Environment, not app code) Local Kong gateway container was silently `Paused` mid-walk**, causing every Supabase REST/RPC call (including the Add-Member RPC) to hang indefinitely with no timeout and no error surfaced anywhere — the admin-portal spinner just said "Adding..." forever. Diagnosed by testing the same `admin_add_studio_member` RPC directly against PostgREST via curl (also hung) and finding `docker ps` reported `supabase_kong_supabase` as `(Paused)`. Fixed with `docker unpause supabase_kong_supabase`; the queued request then completed successfully and the member appeared. Root cause of the pause itself was not investigated (not part of this walk's scope) — flagging in case it recurs for other agents/sessions sharing this local stack.

**2. (Real app bug, reproducible) Invite by Email / Resend Invite return `403 forbidden` for the platform admin.** `POST /api/admin/studios/[id]/invites` → edge function `workspace-member-invite` → `resolveInviteActor()` returns `null` (no `org_admin` membership, and the platform-admin bypass check evidently fails) even though:
   - `admin@patina.dev`'s DB row (`user_roles` joined to `roles`) has `roles.domain='admin'`, role `super_admin` — exactly the condition the edge function's own code comments describe as sufficient for the "platform-admin bypass."
   - Manually replicating the function's exact SQL query (`select role_id, domain from user_roles join roles ... where user_id=... and domain='admin'`) against the DB returns the row fine.
   - Reproduced twice (fresh invite to walk-invite@example.com, and Resend on a manually-seeded pending invite) — not a one-off.
   - This is NOT the same issue as finding #1 (Kong was healthy and other authenticated admin-portal calls, including ones through the same session, worked normally at the time of both 403s).
   - Root cause not fully isolated within the scope of this walk (candidates: a caller-JWT/cookie forwarding gap between admin-portal's `createServerClient()` session client and the edge function invoke, or a stale `roles`/`user_roles` read inside the edge function's own service-role query) — flagging as a release-blocking bug for the studio-invite flow in admin-portal, since Invite by Email is core to the roster feature and currently cannot be used by platform admins for studios they don't already belong to.
   - Workaround used to still validate Cancel-invite UI/DB wiring: seeded an `organization_members` row directly (`status='invited'`) rather than going through the (broken) invite endpoint.

**3. Minor UX deviation**: Create Studio does not auto-redirect to the new studio's detail page (brief expected `/studios/<id>`); it stays on the `/studios` list with a success toast. Not blocking, but worth a product decision.

## Audit log rows (DB, `audit_logs` for organization_id = Walk Studio)

```
action                     | created_at (UTC)
studio.create              | 14:16:53.149551
studio.update               | 14:17:38.763594
studio.member.add          | 14:22:58.804364
studio.member.set_title    | 14:24:18.015411
studio.member.set_role     | 14:24:18.037746
studio.invite.cancel       | 14:30:59.066533
studio.transfer_ownership  | 14:32:10.500750
studio.member.remove       | 14:32:50.059540
studio.suspend             | 14:33:09.509597
studio.reactivate          | 14:33:34.339437
studio.deactivate          | 14:33:52.359416
studio.reactivate          | 14:34:09.991498
```
(12 rows, matches the Activity tab UI exactly.)

## API errors observed

| Route | Status | Response body |
|---|---|---|
| `POST /api/admin/studios/[id]/invites` (Invite by Email, walk-invite@example.com) | 403 | `{"error":"forbidden","message":"You are not allowed to invite members to this studio"}` |
| `POST /api/admin/studios/[id]/invites` (Resend Invite, manufacturer@patina.dev) | 403 | same as above |
| `POST /api/admin/studios/[id]/members` (Add Existing User, support@patina.dev) | (pending indefinitely, then succeeded) | Not an app error — root cause was the Kong container being paused (see finding #1); once unpaused, this same request completed with `201` and the member was added. |

No other API errors were observed across the walk. Console-level noise unrelated to studios (Sanity help-system `apicdn.sanity.io` fetch failures — expected offline in local dev, since Sanity isn't reachable) appeared on every page load but is not a studio-management defect.

## Artifacts

Walk directory: `/Users/kody/Code/patina-merged/artifacts/admin-studio-management-2026-09-02/walk/`
- 30 screenshots (`01-*.png` through `13-*.png`), one per meaningful state transition.
- This report: `walk-report.md`.

## What was NOT fully verified

- Inbucket inbox was not checked for an invite email, since invite creation never succeeded (finding #2).
- Root cause of the Kong-pause (finding #1) and the invite-403 (finding #2) were diagnosed to the "what" and partially the "where" but not fully to the exact line/mechanism — both are flagged for follow-up rather than fixed (this was a read-only-on-source verification walk).

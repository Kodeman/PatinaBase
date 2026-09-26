# W4 deploy report: US-11 + US-13 to Strata and production (SQ-296)

2026-09-26, run from the main checkout `/Users/kody/Code/patina-merged` at
HEAD `6bc9ec4ac`. Authorization: Kody, this session, ~07:30Z ("You have
permission to do all the tasks you think only I can do"), ruling recorded in
the US-13 story log #22. The sandbox was bypassed only for Supabase CLI,
Sanity CLI, the seed run, `deploy-portal.sh`, `wrangler deployments list`, and
`git push`. No secret, token, key, or connection string value is printed
below: names, lengths, and prefixes only.

## Summary

| Step | Result |
|---|---|
| 0 Preflight | HEAD 6bc9ec4ac; only 00668–00674 unapplied; APNS_TOPIC present, APNS_TOPIC_APP/FIELD absent |
| 1 Migrations | 00668–00674 applied in order, 12:33:15–12:33:22Z (needed `--include-all`, see below) |
| 2 US-11 secrets | APNS_TOPIC_APP, APNS_TOPIC_FIELD set 12:33:38Z; APNS_TOPIC left in place |
| 3 US-11 functions | apns-send v28, companion-message v37, project-approval-attachments v1 (new), all ACTIVE, verify_jwt=true |
| 4 Strata probes | ACLs, policies, grants, cron job, bearer format all as designed |
| 5 Sanity | schema deployed; Studio deployed with `SANITY_STUDIO_PUBLISHER_IDS=pGCdJFkOO` (Kody); Leah is not a project member |
| 6 Content | 11 drafts written, 0 published |
| 7 PostHog flag | **not created; system dark (fail-closed)**: no PostHog credential available inside the authorized commands |
| 8 Designer portal | deployed, version `96580aea-2388-4fdc-b372-b23cbb606947` at 12:44:52Z; served chunks carry the new code; signed-out `/help/changes` → 307 to sign-in |
| 9 Push | `git push origin main` → `65f66709f..6bc9ec4ac main -> main`; `ls-remote` confirms `6bc9ec4ac`. The pre-push hook printed "Affected verification has advisory failures" (non-strict), and the push still landed. This report's own commit was blocked (see below) and still needs a commit and push |

Commit of this file: `mcp__plugin_sidequest_board__commit` failed twice with
`spawnSync git ENOBUFS`, the same Sidequest defect SQ-316 hit. The path sits
under the ignored `build/` directory (`.gitignore:7`), and the tree has about
550k ignored paths. The raw `git commit` is hook-denied under a shared-tree
claim. The file is left staged (`git add -f`, the only staged path) for the
orchestrator to commit and push.

## 0. Preflight (read-only)

- `git log --oneline -1` → `6bc9ec4ac fix(designer-portal): a boundary on a new-visit gap keeps no visit alive, …(SQ-315)`.
- `npx supabase migration list --linked` (CLI 2.118.0 via npx, linked ref
  `bkvcixdmuyejfzcijpdg`): 624 rows; the only rows with an empty remote were
  00668, 00669, 00670, 00671, 00672, 00673, 00674. `20260910152111` was
  already applied remotely.
- `npx supabase secrets list` (47 names): APNS_AUTH_KEY, APNS_KEY_ID,
  APNS_TEAM_ID, APNS_TOPIC present; APNS_TOPIC_APP and APNS_TOPIC_FIELD absent.
- `npx supabase functions list` (85 functions) before deploy:
  apns-send v26 updated 2026-09-16T17:29:07Z; companion-message v35 updated
  2026-07-08T04:45:18Z; project-approval-attachments did not exist.
- `docker ps` inside the sandbox: socket permission denied (sandbox). The
  unsandboxed Supabase CLI reached Docker, so no `--use-api` was needed.

## 1. Migrations

`npx supabase db push` refused as written:

```
DbPushMissingRemoteError: Found local migration files to be inserted before the last migration on remote database.
Rerun the command with --include-all flag …
```

Cause: the timestamp-named `20260910152111_create_contact_messages` sorts after
`00674`, so the CLI sees 00668–00674 as out of order. `npx supabase db push
--dry-run --include-all` listed exactly the seven files and nothing else, so
the push ran as:

```
$ npx supabase db push --include-all --yes      # 12:33:15Z → 12:33:22Z, exit 0
Applying migration 00668_device_push_tokens_app.sql...
Applying migration 00669_field_capture_confirmations_proposals.sql...
Applying migration 00670_shared_direction_editions.sql...
Applying migration 00671_create_direct_order_open_order_reuse.sql...
Applying migration 00672_teaching_note_state.sql...
Applying migration 00673_teaching_signals.sql...
Applying migration 00674_help_state_merge.sql...
Finished supabase db push.
```

Afterwards `npx supabase migration list --linked | tail`:
`00667|00667 00668|00668 00669|00669 00670|00670 00671|00671 00672|00672 00673|00673 00674|00674 20260910152111|20260910152111`,
with no row where local and remote differ.

Every later push from this repo will need `--include-all` for the same reason
while `20260910152111` stays the highest remote version.

## 2. US-11 secrets

```
$ npx supabase secrets set APNS_TOPIC_APP=cloud.patina.app APNS_TOPIC_FIELD=cloud.patina.field
Finished supabase secrets set. (count 2)
```

Values are the bundle ids from 00668's `device_push_tokens_app_check`
constraint (not sensitive). `secrets list` afterwards: APNS_TOPIC_APP and
APNS_TOPIC_FIELD updated 2026-09-26T12:33:38Z; APNS_TOPIC unchanged
(2026-07-16).

## 3. US-11 functions

Start 12:33:48Z. Docker bundler (edge-runtime v1.76.2), no `--use-api`.

| Command | Result |
|---|---|
| `npx supabase functions deploy apns-send` | exit 0, 146 kB, v28, updated 12:34:10Z |
| `npx supabase functions deploy companion-message` | exit 0, 86 kB, v37, updated 12:34:19Z |
| `npx supabase functions deploy project-approval-attachments` | exit 0, 177 kB, v1, updated 12:34:25Z |

All three ACTIVE and `verify_jwt: true` in `functions list`. No
`--no-verify-jwt` was passed.

## 4. Strata verification (read-only)

Queries ran through `npx supabase db query --linked` (Management API), SELECT
only.

(a) Function ACLs:

| Function | SECURITY DEFINER | ACL |
|---|---|---|
| get_project_decision_edition(uuid, integer, text) | yes | postgres, authenticated |
| get_project_decision_editions(jsonb) | yes | postgres, authenticated |
| project_approval_attachment_objects(uuid) | yes | postgres, service_role |
| record_project_approval_edition_object(uuid, uuid, text, bigint, text, text) | yes | postgres, service_role |
| teaching_note_state_patch(text[], jsonb) | yes | postgres, authenticated, service_role |
| help_state_merge(jsonb) | yes | postgres, authenticated, service_role |
| teaching_signals() | no | postgres, authenticated, service_role |

No `anon` and no PUBLIC (`=X/…`) entry on any of the seven. US-11 getters are
authenticated-only; its writers are service_role-only.

(b) Policies and grants:

- `project_approval_edition_objects`: 0 policies; RLS on; authenticated has
  no SELECT, INSERT, UPDATE, or DELETE; anon no SELECT.
- `teaching_note_state`: one policy, `teaching_note_state_select_own`
  (SELECT, role authenticated); RLS on; authenticated SELECT true, INSERT
  false, UPDATE false, DELETE false; anon no SELECT.

(c) Bearer used by 00670's cron (`invoke_edge_function` reads
`public.app_setting('service_role_key')`, Vault-backed since 00258): prefix
`eyJ`, length 219, `supabase_url` setting present. This is the legacy JWT
format, which the gateway accepts for the verify_jwt=true
`project-approval-attachments`.

(d) `cron.job`: `project-approval-editions-sweep-hourly`, schedule
`41 * * * *`, active.

Not run: the ship-notes probe that DELETEs as an authenticated session (it
needs a signed-in session; the privilege check above covers the same grant).

## 5. Sanity (project kv3qrinl)

Tokens in `studios/help-system/.env`, by name: `SANITY_AUTH_TOKEN` (length
180, robot "help-system schema deploy (Robot)", role deploy-studio) and
`SANITY_WRITE_TOKEN` (length 180, robot "patina-agent-write-2026-09-04",
role editor). `npx sanity users list` failed (the robot lacks
`sanity.project.members/read`), so members came from the project endpoint
through `npx sanity exec` with the write token:

- One human member: **pGCdJFkOO**, "Kodeman" (GitHub login), administrator.
- Everything else is a robot. **Leah is not a project member**, so her id is
  owed.
- Kody's Sanity CLI login on this machine is a different account (global id
  `gIlAXwlmy`, "Kody Kochaver") that is not a member of kv3qrinl.

Commands:

```
$ npx sanity@latest schema deploy                       # 12:39:16Z, exit 0
✔ Deployed 1/1 schemas
$ SANITY_STUDIO_PUBLISHER_IDS=pGCdJFkOO npx sanity deploy --yes    # 12:40:27Z → 12:40:43Z, exit 0
Including the following environment variables as part of the JavaScript bundle:
- SANITY_STUDIO_PUBLISHER_IDS
✓ Build Sanity Studio (7960ms)
✓ Deployed 1/1 schemas
Success! Studio deployed to https://patina-help.sanity.studio/
```

Probe: `https://patina-help.sanity.studio/` answers 302 to the Sanity
dashboard (`sanity.io/@obSMhE9bd/studio/…`), which answers 200. That redirect
is how Sanity now serves hosted studios. The served bundle
`/static/sanity-xhw9yRoo.js` answers 200 and contains `pGCdJFkOO`, so the
publisher guard is live with Kody's id.

## 6. Content (drafts only)

The seed's own `SANITY_AUTH_TOKEN` name was given the editor token
(`SANITY_AUTH_TOKEN=$SANITY_WRITE_TOKEN`): the studio `.env` token under that
name is the deploy-studio robot, which cannot write documents.

Defect found: `studios/help-system/scripts/run-teaching-notes-seed.mjs
--commit` fails with `ERR_MODULE_NOT_FOUND: Cannot find package
'@sanity/client'`. The studio does not declare `@sanity/client`, and pnpm does
not hoist it. The failure happens before any write. The sibling
`run-*-help-seed.mjs` runners have the same import. For this run only, a
`node --import` resolve hook in the session scratchpad mapped the bare
specifier to the installed `@sanity/client@7.22.0` (the one `sanity@3.99.0`
uses). No repo file changed. Owed fix: add `@sanity/client` to the studio's
devDependencies.

```
$ node --import <scratch resolve hook> scripts/run-teaching-notes-seed.mjs --commit    # exit 0
[W3-c] committed: 11 written, 0 exists (skipped), 0 errored
```

Draft ids:

- drafts.teachingRelease.2026-09-10-galley-parts
- drafts.teachingRelease.2026-09-11-ledger-invoice-delivery
- drafts.teachingRelease.2026-09-11-invoice-print
- drafts.teachingNote.invoice-delivery-status1
- drafts.teachingNote.invoice-print1
- drafts.teachingNote.galley-parts-fold1
- drafts.teachingNote.hours-shortcut1
- drafts.teachingNote.draw-from-time1
- drafts.teachingNote.field-hours1
- drafts.teachingNote.second-seat-hours1
- drafts.teachingNote.invite-handoff-note1

Raw-perspective count afterwards: `teachingNote` + `teachingRelease` drafts =
11, published = 0.

## 7. PostHog flag `teaching-notes` (project 326191)

**Flag not created; system dark (fail-closed).**

- The PostHog MCP server exposes only `authenticate` /
  `complete_authentication` in this session. It is not signed in, and the
  OAuth step needs Kody in a browser.
- No `POSTHOG_*` personal key is in the shell environment. The code expects
  `POSTHOG_PERSONAL_API_KEY` (admin-portal `.env`, per
  `apps/admin-portal/src/lib/posthog-server.ts`). Repo `.env` files are
  sandbox read-denied, and reading them was not one of the authorized
  sandbox exceptions, so that file was not checked.
- Proof the system is dark: the public `/flags?v=2` evaluation with the
  project's public `phc_` key, for Kody's distinct id with
  `email_domain=kochaver.com`, returns 19 flags, `errorsWhileComputingFlags:
  false`, and no `teaching-notes` key. The portal reads a missing flag as off,
  so no teaching note or since-line renders and no teaching state is written.

## 8. Designer portal

Type-check was not rerun: the final merged-tree gate on this same HEAD
(story log #21, `build/final-gate.log`) had tsc at 0 errors.

The exports ran in the same shell as the script. The values come from the
top-level production `vars` in `apps/designer-portal/wrangler.jsonc`:

```
export NEXT_PUBLIC_SUPABASE_URL='https://bkvcixdmuyejfzcijpdg.supabase.co'
export NEXT_PUBLIC_SUPABASE_ANON_KEY='eyJ…'          # masked, length 208
export NEXT_PUBLIC_SUPABASE_STORAGE_KEY='sb-bkvcixdmuyejfzcijpdg-auth-token'
export SUPABASE_ORIGIN_RUNTIME='https://api.patina.cloud'
$ ./infra/deploy-portal.sh designer        # 12:43:02Z → 12:44:54Z, exit 0
==> [0/3] Preflight OK: RUNTIME REPOINT ACTIVE → https://api.patina.cloud (storage pinned direct)
==> [0b/3] Preflight OK: 8 NEXT_PUBLIC_* vars exported
==> [2.5/3] handler.mjs size: 18026133 bytes
==> [2.6/3] Chunk gate: 251 client chunks; resolved PostHog key literal present in 11 chunk(s)
✨ Success! Uploaded 52 files (238 already uploaded)
Current Version ID: 96580aea-2388-4fdc-b372-b23cbb606947
==> Done: designer portal deployed to production.
```

`npx wrangler deployments list`, run from `apps/designer-portal` (its
wrangler.jsonc names the Worker `patina-designer-portal`; there is no
`infra/designer-worker`). Bottom row: created 2026-09-26T12:44:52.428Z,
version `96580aea-2388-4fdc-b372-b23cbb606947` at 100%.

Served-code proof against `https://app.patina.cloud`:

- The signed-out `/auth/signin` page references 36 script chunks, and all 36
  exist in this build's `.open-next/assets`. The served webpack runtime
  `webpack-b9525e761cbff8eb.js` references the teaching chunk hash
  `cc8beaff90e770aa`.
- `/_next/static/chunks/6449-3fc8eb952ea6fade.js`: 200, contains
  `teaching_note_state_patch` ×4.
- `/_next/static/chunks/823.cc8beaff90e770aa.js`: 200, contains
  `WORKSHOP NOTE`.
- `/_next/static/chunks/6746-5940d24472bd4ef2.js`: 200, contains
  `WORKSHOP NOTE`.
- `/_next/static/chunks/app/(document-help)/help/changes/page-7ffdc1395cdb510e.js`:
  200, contains `WORKSHOP NOTE`. With the parentheses percent-encoded,
  middleware answered 307, so the probe was repeated with literal
  parentheses.

`curl -sI https://app.patina.cloud/help/changes` while signed out:
`HTTP/2 307`, `location: /auth/signin?callbackUrl=%2Fhelp%2Fchanges`. It is
an auth redirect, not a 500.

Not verified: the signed-in render of `/help/changes` and the Desk. Both need
a browser session, and the flag is dark anyway.

## Still dark, and why

- **Teaching notes (US-13)** stay dark for everyone: the `teaching-notes` flag
  does not exist, and nothing is published in Sanity (11 drafts, 0 published).
- **US-11** is live on the server side: apns-send reads APNS_TOPIC_APP and
  APNS_TOPIC_FIELD, and the approval-editions sweep cron runs hourly at :41.
  The client builds (TestFlight) were not part of this ticket.
- `help_state_merge` (00674) is live, and this portal deploy's web
  help-state adapter calls it. That path is not flag-gated.

## Owed

1. **PostHog flag**: create `teaching-notes` off, then add the release
   condition `email_domain = kochaver.com` at 100% (Kody only). This needs
   either a PostHog MCP sign-in or `POSTHOG_PERSONAL_API_KEY`.
2. **Leah's Sanity access and id**: invite Leah to project kv3qrinl, then
   redeploy the Studio with
   `SANITY_STUDIO_PUBLISHER_IDS=pGCdJFkOO,<Leah's p-id>`. Until then only
   Kody (pGCdJFkOO) sees Publish on teaching docs.
3. **Content publish**: Leah (or Kody) reviews and publishes the 11 drafts
   (ship-notes §6). A release note shows only when its `teachingRelease` is
   published too.
4. **Flag widen**: after Kody's walk.
5. **Seed-runner dependency**: add `@sanity/client` to
   `studios/help-system` devDependencies (see §6).
6. **Signed-in walks**: the ship-notes verification probes 3–4 (Kody signed
   in with the flag on; the help-state tour reset) need a browser session.
7. `supabase db push` in this repo now needs `--include-all` (see §1).

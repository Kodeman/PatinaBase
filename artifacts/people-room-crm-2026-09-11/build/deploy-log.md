# Deploy log — People Room CRM (W6/W7) — run by patina-merged-73

Run 2026-09-16, executed exactly per `deploy-plan.md`, from the worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`
(branch `build/people-room-crm-2026-09-11`, merged onto `origin/main`
`a1deb0753`). Authorization: Kody's rulings.md §6 (2026-09-11, one chain at
the end) + W7 ownership handed to session patina-merged-73 (2026-09-16).

## Pre-check: portal type-checks

```
pnpm --dir .../agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
(clean — no output)
```
GREEN, first try.

```
pnpm --dir .../agent-people-build --filter @patina/client-portal type-check
> tsc --noEmit
.next/types/app/page.ts(37,29): error TS2344: Type '{ searchParams?: ... }
| undefined' does not satisfy the constraint 'PageProps'.
```
FAILED first try — traced to a stale `.next/types` generated-types artifact
(known Next.js gotcha, not a source regression). Ran `rm -rf
apps/client-portal/.next` and re-ran:
```
> tsc --noEmit
(clean — no output)
```
GREEN after clearing stale cache.

## Step 1a — Migrations (Strata bkvcixdmuyejfzcijpdg)

Pre-push `supabase migration list --linked` confirmed 21 pending
(`00592`–`00594`, `00621`–`00638`) with `remote:""`, all others applied —
matching deploy-plan.md exactly. (First invocation hit a sandbox EPERM on
`~/.supabase/telemetry.json.tmp`; retried once with sandbox disabled per
task instructions — unrelated to command logic.)

```
supabase db push --include-all --project-ref bkvcixdmuyejfzcijpdg \
  --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build
```
Output:
```
Applying migration 00592_people_cards_affiliations_rules.sql...
Applying migration 00593_studio_contact_channels.sql...
Applying migration 00594_studio_channel_consent.sql...
Applying migration 00621_consent_readers_repointed.sql...
Applying migration 00622_consent_record_is_the_only_gate.sql...
Applying migration 00623_studio_compliance_documents.sql...
Applying migration 00624_project_party_window_and_authority.sql...
Applying migration 00625_project_site_access_cards.sql...
Applying migration 00626_people_directory_v4_seats.sql...
Applying migration 00627_access_grants_and_field_link_window.sql...
Applying migration 00628_project_studio_id_backfill.sql...
Applying migration 00629_studio_contact_merges.sql...
Applying migration 00630_compliance_expiry_sweep.sql...
Applying migration 00631_project_party_bids.sql...
Applying migration 00632_client_households.sql...
Applying migration 00633_decision_court_widened.sql...
Applying migration 00634_seat_close_ends_authority.sql...
Applying migration 00635_studio_touches_and_channel_refs.sql...
Applying migration 00636_invoice_link_hardening.sql...
Applying migration 00637_paperwork_upload_door.sql...
Applying migration 00638_pay_link_readers_reheaded.sql...
{"upToDate":false,"dryRun":false,"migrations":[...21 files...],"seeds":[],"roles":[],"message":"Finished supabase db push."}
```
STATUS: SUCCESS — all 21 migrations applied (`00592`–`00594`, `00621`–`00638`).

### Post-migration read-only SQL probes (via Supabase MCP `execute_sql`, project `bkvcixdmuyejfzcijpdg`)

1. New tables present — all 9 confirmed:
   `client_households, paperwork_link_tokens, project_party_authority,
   project_site_access_cards, studio_channel_consent,
   studio_compliance_documents, studio_contact_channels,
   studio_contact_merges, studio_touches`

2. `people_directory` new columns confirmed present:
   `scope, reach_state, consent_status, paper_state,
   contact_rule_summary, seat_count` (plus prior columns).

3. `cron.job` expiry-sweep row confirmed:
   `jobid=59, schedule='0 6 * * *', command='SELECT
   public.sweep_compliance_expiries();', active=true`

4. `compliance-documents` storage bucket confirmed: `id/name
   "compliance-documents", public=false` (private, as required).

STATUS: ALL 4 PROBES PASS.

## Step 1b — Edge functions (34 total)

Deployed with `--workdir .../agent-people-build --project-ref bkvcixdmuyejfzcijpdg`
appended to every call (retried once with sandbox disabled per task
instructions for the network calls; all subsequent function-deploy calls
succeeded on the sandbox-disabled retry).

**--no-verify-jwt (6):** fulfillment-po, invoice-link-checkout,
paperwork-upload (NEW — first deploy, created the function), resend-webhook,
sms-inbound, stripe-webhook — all 6 returned `"message":"Deployed
Functions."`.

**verify_jwt=true (28):** apns-send, campaign-dispatch, client-invite,
commercial-document-notify, create-checkout-session, designer-invite,
digest-dispatcher, field-daily, fulfillment-notify, invoice-reminders,
invoice-send, morning-brief, notification-digest, notification-dispatch,
po-send, proposal-nudge, proposal-send, proposal-sign-confirmation,
quote-request-send, review-requests, selection-review-send,
site-request-dispatch, sms-dispatch, spec-pdf, trade-agreement-send,
trade-rfq-send, waitlist-notify, workspace-member-invite — all 28 returned
`"message":"Deployed Functions."` (`campaign-dispatch` and `spec-pdf`
reported "No change found in Function" — bundle identical to what was
already live — still deployed/confirmed, not a failure).

STATUS: 34/34 SUCCESS. 0 blocked, 0 failed.

## Step 1c — Services / Cloudflare Workers

Per deploy-plan.md §1c: none in this program's own scope beyond the portals
in step 1d (`edge-api` explicitly excluded). No standalone worker deploy run.

## Step 1d — Portals

### designer

First attempt FAILED — preflight refused: resolved
`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` (local-pointed). Root
cause: script invoked by absolute path without `cd`-ing into the worktree
first, so its internal `git rev-parse --show-toplevel` resolved to the
**main checkout** (whose `apps/designer-portal/.env.local` is a local-dev
file pointed at 127.0.0.1), not the worktree.

Re-ran with `cd` into the worktree first — `git rev-parse --show-toplevel`
now correctly resolved to the worktree. Second attempt then failed
differently: `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` resolved EMPTY, because
the worktree (correctly) has no `.env.local` at all, and the script's own
design (Phase 0b) deliberately excludes the Supabase trio from its
automatic wrangler.jsonc export — requiring the operator to explicitly
supply it. Exported the three Supabase vars as `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_STORAGE_KEY` using
the exact literals already committed in `apps/designer-portal/wrangler.jsonc`
top-level `vars` (production defaults; no new/guessed secret), then re-ran:

```
./infra/deploy-portal.sh designer production
```
Build succeeded; Chunk gate: "246 client chunks; all 8 exported var names
fully inlined (0 survivors)". Deployed:
```
Uploaded patina-designer-portal (27.54 sec)
Deployed patina-designer-portal triggers (0.91 sec)
Current Version ID: 466fc671-2c99-42dd-833d-d87ca7d4752d
==> Done: designer portal deployed to production.
```
STATUS: SUCCESS (after two env-resolution retries, no code/migration/function
retries needed).

### client

Ran with the same `cd`-into-worktree + exported Supabase trio pattern
(same literal values — client-portal's wrangler.jsonc uses the identical
Strata project, anon key, and storage key as designer's):
```
./infra/deploy-portal.sh client production
```
Build succeeded first try; Chunk gate: "67 client chunks; all 15 exported
var names fully inlined (0 survivors)". Deployed:
```
Uploaded patina-client-portal (18.87 sec)
Deployed patina-client-portal triggers (0.70 sec)
Current Version ID: 6f41b63e-13d4-42b4-a0b5-b88355def9e5
==> Done: client portal deployed to production.
```
STATUS: SUCCESS.

## Step 1e — iOS / Sanity

Per deploy-plan.md §2 (Blocked steps) — not re-attempted, both remain owed:
- **Sanity** (18 help docs): BLOCKED — `SANITY_AUTH_TOKEN` lacks `create`
  rights. Not re-attempted this run (no new token supplied).
- **iOS**: TestFlight build 5 already `VALID`; tester-group assignment +
  export-compliance declaration are Kody's manual ASC steps, not
  CLI-automatable — not touched this run.

## Step 1f — Smoke / verify

`npx wrangler deployments list` (bottom row = current live, oldest-first):

- `patina-designer-portal`: bottom row Version `466fc671-2c99-42dd-833d-d87ca7d4752d`,
  created `2026-09-16T17:35:46.443Z` — matches this run's deploy, sits above
  the prior good row `eab16705-...` (2026-09-15, hour-tracking).
- `patina-client-portal`: bottom row Version `6f41b63e-13d4-42b4-a0b5-b88355def9e5`,
  created `2026-09-16T17:37:11.537Z` — matches this run's deploy, sits above
  the prior good row `83f2dcef-...` (2026-09-15, hour-tracking).

Behavior probes (curl, unauthenticated — a full signed-in walk is owed to
Kody per rulings.md §6 "Definition of done" and is explicitly NOT part of
"done"):
- `https://app.patina.cloud/` → `200`
- `https://client.patina.cloud/` → `307` (redirect, expected unauthenticated)
- `https://app.patina.cloud/people` → `307` (redirect, expected — auth-gated)
- `https://client.patina.cloud/paperwork/smoke-test-token-does-not-exist` →
  `200` (handled invalid-token render, not a 500 crash)

No 500s observed. STATUS: PASS (basic reachability only — not a substitute
for the owed signed-in walk).

## Summary

| Step | Status |
|---|---|
| Pre-check: designer type-check | GREEN (first try) |
| Pre-check: client type-check | GREEN (after clearing stale `.next` cache) |
| 1a. Migrations (21 files) | SUCCESS — `00592`–`00594`, `00621`–`00638` |
| 1a. Post-migration SQL probes (4) | ALL PASS |
| 1b. Edge functions (34) | SUCCESS — 34/34 deployed, 0 blocked |
| 1c. Workers (standalone) | N/A per plan — none in scope |
| 1d. Portal: designer | SUCCESS — v`466fc671` |
| 1d. Portal: client | SUCCESS — v`6f41b63e` |
| 1e. iOS / Sanity | NOT RE-ATTEMPTED — both remain blocked/owed per plan §2 |
| 1f. Smoke (wrangler + curl) | PASS (basic reachability; signed-in walk owed) |

**No step stopped the chain.** Every step in deploy-plan.md's ordered
command list that was not already marked blocked in §2 completed
successfully. The two blocked items (Sanity push, iOS tester-group/export
compliance) are exactly the ones the plan itself flagged as owed to Kody,
not deploy-chain failures.

**Owed to Kody (unchanged by this run):** signed-in prod walk (People room /
Directory / Call Sheet, R-CC Hours door, a `/paperwork/[token]` link, an
invoice pay-link folio post-migration); a Sanity token with `create` rights;
TestFlight tester-group assignment + export-compliance declaration.

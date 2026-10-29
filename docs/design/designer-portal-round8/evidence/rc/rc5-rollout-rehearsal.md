# RC-5: rollout and rollback rehearsal

US-52 Room Proof 08, step RC-5 (was SQ-2238). Lane B. Run on 2026-10-28 on branch `r8-rc5-rehearsal` at `1faae43c0`, the program-branch tip; the code under test is `7d5d872f3`. Main is `9a686cecd`, whose migration head is `00867`.

**Nothing was deployed or pushed.** This step made no `db push`, `functions deploy`, `deploy-portal.sh`, `wrangler deploy`, `--linked` call or PostHog change. Strata was read only, through MCP `execute_sql` SELECTs. Shipping still needs Kody's separate "ship" request.

**Result.**

- **Migrations:**
  - All 28 branch migrations (00868–00895) applied to a populated database at main's head, one transaction per file. 0 errors, 0 lock waits and 0 lost rows. Total time inside the transactions was 821 ms; the longest file took 102 ms.
  - 13 files hold AccessExclusiveLock on all `auth.*` tables, **00892 among them** (§2).
- **SQL contract gate:** every suite passed on the populated, upgraded database. One legacy suite failed first because of synthetic population rows, then passed once they were removed (§3.3).
- **Runtime, renderer on (Chromium):** 100 passed, 7 failed. Four failures are a harness origin pin (D6), confirmed by an origin-fixed copy that passes 4 of 4. The other three pass alone (D11).
- **Runtime, renderer off:** 7 of 7 passed.
- **Flag resolution through the real SDK:** 8 of 8 passed, against the recorded latch rule (§4.2).
- **Activation, deactivation and F8:** each behaved as the contracts say. Direct RPC calls are denied while inactive (§4.3).
- **Preserved-capability walk (round-8 renderer):** 44 present, 6 moved, **0 strictly missing**, 7 not verified. One moved door has a visibility gap (D8; §5).
- **Corrections to HANDOFF:** six, listed in §1.0.
- **Activation risks:** three recorded from the RC-6 money review (§6.2).

Raw logs, scripts and screenshots are kept out of git, under the scratch directory `/private/tmp/claude-501/-Users-kody-Code-patina-merged/1460bfe7-3b74-49b1-b90e-b7c7dd33fdc9/scratchpad/` (`rc5-evidence/`, `rc5-tools/`, `rc5-pw/`). That directory is session scratch and is wiped on restart. Every number below is copied from those logs.

## 1. Ship-chain runbook (written, NOT executed)

### 1.0 Corrections to HANDOFF's lists

1. **00867 ships with this push.** Strata's ledger head is `00866` (plus `20260910152111`); `00867_margin_notes_tenant_guard` is on main but not on Strata. `supabase db push` applies every pending local migration in order and cannot skip one. So the push applies 00867, then 00868–00895: 29 files, not 28. Shipping 00867 is still an open question to Kody (memory: "ship 00867?"). The round-8 push forces that answer.
2. **The AccessExclusive lock list is missing 00892.** Measured here, 00892 (`project_documents_guarded_uuid_cast`) holds AccessExclusiveLock on 16 `auth.*` and 3 `storage.*` tables until COMMIT, because it recreates seven `storage.objects` policies. The full list is 00868–00871, 00874–00878, 00886, 00888, 00889 **and 00892**: 13 files.
3. **The edge-function redeploy set is 44 functions, not 9.**
   - The `_shared/outbound-kinds` importer list in HANDOFF is complete: exactly 8 functions reach `_shared/outbound-kinds/index.ts`, counting imports that pass through other `_shared` modules.
   - HANDOFF omits the `_shared/send-authority.ts` importers. 43 functions import it, transitively; that includes all 8 above. The branch change to it is one type-union member (`| "service_acceptance_request"`), which is erased at runtime. Repo policy (AGENTS.md: "A `_shared/*` edit requires redeploying EVERY importing function") still applies, so all 43 are listed below.
   - The importers include `stripe-webhook`, whose own source is unchanged. It is in the set only because it imports `send-authority`.
   - No other `_shared` file changed (`git diff main...HEAD --stat -- supabase/functions/_shared` lists `outbound-kinds/index.ts`, `outbound-kinds/service_acceptance_request.ts` plus its test, and `send-authority.ts`).
4. **C4 activation needs the C2 `scope_editions` capability on first.** Every C4 mutation refuses `scope_editions_inactive` while `server_capabilities.scope_editions` is false (C4 §2.8, C2 §2.8, F8). HANDOFF step 6 lists "C4 then C6" only. The C2 activation (flip the setting, grant `apply_service_arrangement`, `assign_ffe_items_to_scope_package` and `reconcile_scope_edition`) has to come first, or in the same migration as C4. No activation migration exists in the repo yet; each is a reviewed migration still to be written.
5. **The ROLLOUT.md edit.** HANDOFF item 3 says to write the ship chain into `ROLLOUT.md`. This RC-5 brief scoped the deliverable to this evidence file. `ROLLOUT.md` is unchanged; the chain below is ready to copy into it.

6. **HANDOFF.md:51 misstates the flag rule.** It asks to prove "legacy fallback when the SDK is blocked or DNT is set". The recorded rule (`evidence/flag-inventory.md` §4, "Fallbacks named") is different:

   | Case | What happens |
   |---|---|
   | DNT on | Treated like any other user; flags resolve |
   | SDK blocked fast | Tab latch, else legacy, at about 20 ms |
   | SDK hung or blackholed | Tab latch, else legacy, at 1500 ms |
   | No key | Override if set, else legacy |

   RC-5 rehearsed the recorded rule (§4.2). The consequence for the kill switch is in 1.6.

### 1.1 Preconditions (before any step)

- Kody's explicit "ship" request in that session. RC-6 has returned SHIP-READY, or its findings are dispositioned.
- Kody's rulings on: 00867 (it ships with the push, see 1.0 item 1); 00892 (open question 1, not resolved here); household-card consent (open question 2, before C4/C6 activation).
- The branch is merged to main, and every command runs from the main checkout at that merged SHA. Check `df -h /` first.
- Prod CLIs need the sandbox off (memory: supabase CLI reads `supabase/.env.local`; git SSH push and `next build` stall in the sandbox).
- **Window:** pick a low-traffic window (§2.2). Pause nothing in cron, but note that Strata has 64 active pg_cron jobs.

### 1.2 Stage 1: migrations (Strata)

```sh
cd <main checkout at the merged SHA>
supabase migration list                 # read-only. Remote must end at 00866 (+20260910152111);
                                         # local-only rows must be exactly 00867 and 00868–00895 (29).
supabase db push --dry-run              # must list the same 29 files, in order, and nothing else
supabase db push                        # one transaction per file; stops at the first failure
```

- Lock guard: see §2.3. Choose one of the lock_timeout mechanisms there before running the push.
- **Probe after the push** (read-only SQL in the Supabase dashboard or MCP):

```sql
SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version BETWEEN '00867' AND '00895';  -- 29
SELECT key, enabled FROM public.server_capabilities ORDER BY key;    -- margin_note_escalation=f, scope_editions=f
SELECT count(*), count(*) FILTER (WHERE legacy_order) FROM public.project_commercial_execution_order; -- 8, 8 (the backfill; RC-5 counted 8 on Strata before the push)
SELECT id FROM storage.buckets WHERE id = 'service-acceptance-paper';  -- 1 row
-- inactive census: every C4/C6 mutation false for authenticated, anon and service_role
SELECT p.oid::regprocedure, has_function_privilege('authenticated',p.oid,'EXECUTE') a, has_function_privilege('anon',p.oid,'EXECUTE') n, has_function_privilege('service_role',p.oid,'EXECUTE') s
FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname ~ 'service_acceptance|studio_service|service_completion' AND p.provolatile='v' AND p.proname !~ '^_';
```

- **Behaviour probes:**
  - A designer and a client can each sign in. The auth.* locks are released.
  - The designer portal project-documents file list loads on a job. 00892 repaired listings for the 2 Strata objects whose first path segment is not a uuid.
  - The live portals still on the old code (stage 3 not yet run) behave as before. Every round-8 object is additive and inactive.
- **Rollback:** there are no down migrations, and ROLLOUT §5 forbids destructive undo. If a file fails, its own transaction rolls back and the push stops; earlier files stay applied. They are additive and inactive, so fix forward with a new migration and re-run the push. **The schema is not reversible by design. Nothing here can be "rolled back" except by a new forward migration.**

### 1.3 Stage 2: edge functions (Strata)

Deploy the new function, then the 8 runtime-affected importers, then the 35 type-only importers:

```sh
supabase functions deploy service-acceptance-paper-hash          # verify_jwt = true (config.toml)

# _shared/outbound-kinds (runtime registry gains service_acceptance_request) — 8
for f in outbound-draft-send decision-reminders expire-decisions field-daily invoice-reminders \
         notification-digest review-requests site-request-dispatch; do supabase functions deploy "$f"; done

# _shared/send-authority only (type-only change; repo policy) — 35, stripe-webhook included though unchanged
for f in apns-send board-deck-import-resolve client-edition-compose client-invite client-plate-check \
         client-plate-copy commercial-document-notify decision-first-notice decision-resolved-notify \
         designer-invite digest-dispatcher fulfillment-notify fulfillment-po invoice-check-intent \
         invoice-link-checkout invoice-send morning-brief notification-dispatch po-send \
         procurement-draft-send project-approval-attachments project-ffe-document-extract proposal-nudge \
         proposal-send proposal-sign-confirmation pulse-send quote-request-send selection-review-send \
         sms-dispatch sms-inbound stripe-webhook trade-agreement-send trade-rfq-send waitlist-notify \
         workspace-member-invite; do supabase functions deploy "$f"; done
```

- **How the list was built.** A static resolver walked relative imports transitively from each `supabase/functions/<fn>/index.ts`, including imports that pass through other `_shared` modules. The script is `rc5-tools/importers.py`. Every function directory has an `index.ts`.
- **Some deploy flags differ per function.** Check `config.toml` `[functions.<name>]` for functions such as `stripe-webhook` and `sms-inbound`, which have `verify_jwt = false`. The CLI reads `config.toml`, so the plain commands above keep each function's setting. Confirm with `supabase functions list` afterwards.
- **Probes:**
  - `supabase functions list` shows a new version for all 44.
  - `service-acceptance-paper-hash` without a JWT returns 401 (`verify_jwt = true`). Do not call it with real data. Its stamp RPC, `stamp_service_acceptance_paper_hash`, is not granted to `service_role` until C4 activation, so any real call before then is refused.
  - Edge logs for `outbound-draft-send`, `stripe-webhook` and `sms-inbound` show no boot errors.
  - No external send is triggered to test them. V22: drafts only.
- **Rollback:** redeploy each function from the previous main SHA (`git worktree add <dir> <prev-sha>` and `supabase functions deploy <name>` from there). Nothing calls the new kind while C4 is inactive, because `create_service_acceptance_request` is not granted.

### 1.4 Stage 3: portals (Cloudflare)

- **Changed portals:**
  - **designer** (79 app files);
  - **client** (15 app files: the acceptance route and the service-acceptance and completion components).
- **Unchanged portals:** admin and manufacturer have no source changes. They consume `@patina/supabase`, but none of the hook functions the branch changed. Do not deploy them in this chain; the admin build also fails on `@patina/api-client` (RC-3b G1).

```sh
cd <main checkout at the merged SHA>
# Print export lines for one portal's top-level PRODUCTION vars (never the staging block):
# the Supabase trio NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
# NEXT_PUBLIC_SUPABASE_STORAGE_KEY (sb-bkvcixdmuyejfzcijpdg-auth-token), plus SUPABASE_ORIGIN_RUNTIME
# where declared (designer only). deploy-portal.sh Phase 0 reads process env and .env files,
# never wrangler.jsonc. Mask the anon key in any recorded log.
trio() { node -e 'const s=require("fs").readFileSync(process.argv[1],"utf8").replace(/^\s*\/\/.*$/mg,"").replace(/,(\s*[}\]])/g,"$1");const v=JSON.parse(s).vars;for(const k of ["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY","NEXT_PUBLIC_SUPABASE_STORAGE_KEY","SUPABASE_ORIGIN_RUNTIME"]) if(v[k]!==undefined) console.log(`export ${k}=${JSON.stringify(v[k])}`)' "$1"; }

( eval "$(trio apps/designer-portal/wrangler.jsonc)"; ./infra/deploy-portal.sh designer production )
( eval "$(trio apps/client-portal/wrangler.jsonc)";   ./infra/deploy-portal.sh client production )
```

- **Probes:**
  - `cd apps/<portal> && npx wrangler deployments list`. Read the bottom row; the list is oldest-first.
  - Behaviour, not `/version`. `app.patina.cloud/desk` and a `/doc/<id>` both render the **legacy** renderer for everyone, because the cohort is empty. In sessionStorage, `patina:paper-renderer:v1` reads `legacy/flag` for an identified user.
  - The client house page renders, and `/acceptance/<random uuid>` shows the not-found or empty state, not an error.
- **Rollback:** `npx wrangler rollback <previous-version-id>` in the portal's directory. A flag-off (stage 4) comes first if a cohort is live.

### 1.5 Stage 3b: iOS (later)

The Patina app's service-acceptance views ship with a later iOS build. They are out of this chain.

### 1.6 Stage 4: renderer flag cohort (PostHog)

- **What to set.** In PostHog, set `designer-paper-round8` to the internal cohort, which is Leah's studio first. For that same cohort, keep `one-voice` on and `worktable` off. Production has no `NEXT_PUBLIC_FLAG_OVERRIDES` in `apps/designer-portal/wrangler.jsonc`, so the cohort alone decides.
- **Probe.** For a cohort member, sessionStorage reads `round8/flag` after sign-in. A non-member reads `legacy/flag`.
- **Kill switch and latency.** Remove the cohort, or set the flag false. **This is not instantaneous.** The rule is the one recorded in `evidence/flag-inventory.md` §4, rehearsed in §4.2.
  - An open document keeps its settled renderer until a full page load. That latch is deliberate, so drafts are never remounted.
  - A full load that reaches PostHog applies the new value. In the rehearsal, the first reachable load after the change gave `legacy/flag`.
  - **When PostHog is unreachable:**
    - **A tab already latched to round 8 stays on round 8 across reloads while the SDK is blocked or hung, until the tab closes.** On those loads the hook falls back to the same-user `sessionStorage` tab latch (`round8/tab`, measured).
    - A new tab with nothing reachable falls back to legacy.
    - Tell cohort users to **close** the tab, not just reload it.
  - DNT is not a fallback; flags resolve normally under DNT.
  - Production kill-switch latency, meaning PostHog's server-side propagation, has not been measured (ROLLOUT §2 asks for it).
- **Rollback:** flag off. The legacy renderer reads the same canonical data (ROLLOUT §2), so no data step is needed.

### 1.7 Stage 5: C2 + C4 activation (reviewed migration, not yet written)

- **Preconditions** (C4 §2.8):
  - K3, K4 and K5 are recorded;
  - WP-10C consumer sign-off;
  - Kody's household-card consent ruling;
  - the activation risks in §6.2 are dispositioned.
- **The migration, top-level, one statement each.** Regenerate `supabase/seed/00-legacy-grants.sql` in the same change.
  - `UPDATE public.server_capabilities SET enabled = true WHERE key = 'scope_editions';`
  - C2: `GRANT EXECUTE … TO authenticated` on `apply_service_arrangement(uuid,text,uuid)`, `assign_ffe_items_to_scope_package(uuid,uuid[],text,text)` and `reconcile_scope_edition(uuid,uuid,uuid)`.
  - C4: the six grants to `authenticated` from C4 §2.8, plus `stamp_service_acceptance_paper_hash(uuid,text,text,text)` to `service_role`. The signatures are unchanged through 00895.
- **Probes:**
  - `has_function_privilege` per the C4 §2.8 gate.
  - A designer composes a request on an internal job. It lands as a V22 draft (`awaiting_review`), and nothing is sent.
- **Rollback:** the deactivation migration in 1.9.

### 1.8 Stage 6: C6 activation (reviewed migration, not yet written)

- **Preconditions:** C4 is active and WP-10C sign-off is recorded.
- **The migration:** the three grants in C6 §2.7, to `authenticated`: `complete_studio_service(uuid,uuid,text,text)`, `resolve_service_acceptance_condition(uuid,uuid,text,jsonb,text)` and `revoke_studio_service_completion(uuid,text)`.
- **Probes:**
  - `has_function_privilege` returns true for `authenticated` and false for `anon` and `service_role`.
  - The C6 reading on an internal job no longer shows the inactive note.
- **Rollback:** the deactivation migration in 1.9.

### 1.9 Deactivation (the rollback for stages 5–6; C2 §2.8)

**One transaction:**

- set `scope_editions` false;
- revoke from `authenticated` the C4 six, the C6 three, the C5 four (`create_external_fulfilment`, `record_external_fulfilment_event`, `verify_external_fulfilment_event` and `set_ffe_item_external_fulfilment`) and the C3 direct route `record_fabrication_instruction`;
- revoke the stamp from `service_role`.

**Reads stay granted.** Open requests stay `sent` and cannot be answered. The client shows "Responses are paused for now. Nothing you've seen is lost." Rehearsed in §3.4.

**Not in this chain:** C5 external-fulfilment activation. It stays inactive.


## 2. Lock plan

### 2.1 What locks, measured

Each file was applied in its own transaction on the populated owned stack. Granted `pg_locks` for the applying backend were captured just before COMMIT. "In-txn ms" is the time between the first and last statement clocks inside the transaction, which is the window during which AccessExclusive locks are held. "Wall ms" includes psql start-up.

| File | In-txn ms | Wall ms | AEL | auth AEL | storage AEL | Pre-existing public tables under AEL |
|---|---:|---:|---:|---:|---:|---|
| 00868 | 65 | 161 | 33 | 16 | 5 | proposal_agreement_parts, proposals |
| 00869 | 32 | 70 | 24 | 16 | 5 | proposals |
| 00870 | 12 | 46 | 24 | 16 | 5 | — |
| 00871 | 32 | 79 | 27 | 16 | 5 | project_rooms |
| 00872 | 3 | 55 | 0 | 0 | 0 | — |
| 00873 | 11 | 60 | 0 | 0 | 0 | — |
| 00874 | 30 | 79 | 24 | 16 | 5 | margin_notes |
| 00875 | 48 | 99 | 27 | 16 | 5 | — |
| 00876 | 83 | 146 | 26 | 16 | 5 | project_ffe_items |
| 00877 | 53 | 95 | 36 | 16 | 5 | coordination_item_revisions, custom_commission_revisions, margin_notes, plan_issue_prints, plan_issues, plan_prints, po_spec_snapshots, product_configurations, project_approval_artifacts, project_review_items |
| 00878 | 28 | 81 | 25 | 16 | 5 | project_parties, project_party_authority |
| 00879 | 30 | 100 | 1 | 0 | 0 | — |
| 00880 | 8 | 103 | 0 | 0 | 0 | — |
| 00881 | 9 | 72 | 0 | 0 | 0 | — |
| 00882 | 22 | 133 | 0 | 0 | 0 | — |
| 00883 | 82 | 186 | 0 | 0 | 0 | — |
| 00884 | 5 | 63 | 0 | 0 | 0 | — |
| 00885 | 6 | 51 | 0 | 0 | 0 | — |
| 00886 | 102 | 142 | 28 | 16 | 5 | outbound_drafts |
| 00887 | 4 | 48 | 0 | 0 | 0 | — |
| 00888 | 60 | 111 | 41 | 16 | 5 | client_decisions, install_punch_items, project_ffe_items, project_phases, scope_change_requests, trade_scope_terms |
| 00889 | 43 | 93 | 25 | 16 | 5 | — |
| 00890 | 5 | 48 | 0 | 0 | 0 | — |
| 00891 | 5 | 52 | 0 | 0 | 0 | — |
| 00892 | 27 | 70 | 21 | 16 | 3 | — |
| 00893 | 5 | 49 | 0 | 0 | 0 | — |
| 00894 | 8 | 58 | 0 | 0 | 0 | — |
| 00895 | 3 | 44 | 0 | 0 | 0 | — |
| **Total** | **821** | **2,394** | | | | |

- **Thirteen files take AccessExclusiveLock on all 16 `auth.*` tables:** 00868–00871, 00874–00878, 00886, 00888, 00889 and **00892**. Twelve of them also lock 5 `storage.*` tables; 00892 locks 3 (`buckets`, `buckets_analytics`, `objects`).
  - **Cause:** the DDL event triggers `pgrst_ddl_watch`, `graphql_watch_ddl` and the `issue_pg_*_access` family. They are present on Strata, as RC-5 confirmed read-only.
  - **Effect:** while one of these files is open, sign-in, token refresh and every storage read or write queue behind it.
- **00879 takes one AccessExclusive lock**, on a table it creates. That lock touches nothing that already exists.
- **Measured hold window:** at most **102 ms per file** (00886), and 821 ms across all 28.
  - The populated stack holds roughly ten times Strata's row counts for the touched tables (§3.1), so Strata's DDL time should be no longer.
  - Over the network, `db push` adds round-trip time to each file. That added time is **not measured** here (see §6.3).

### 2.2 Strata today (read-only, 2026-10-28)

**Migration ledger**
- Head is `00866`, plus the out-of-band `20260910152111`.
- **`00867` is not applied, and neither is `00892`.** Whether to ship 00892 on its own is open question 1 to Kody. RC-5 does not resolve it. If it ships alone first, it takes the same auth/storage AccessExclusive lock for about 27 ms.

**Settings**
- `lock_timeout = 0` (wait forever).
- `statement_timeout = 120000` in the MCP session.
- No `lock_timeout` is configured on `postgres`.
- `cli_login_postgres`, the `db push` login role, exists.

**Activity**
- 64 active pg_cron jobs; 14 backends at sampling time.
- Refresh tokens issued over the last 30 days, by hour (America/Chicago):

| Hours (CT) | Tokens per hour |
|---|---|
| 22:00–05:00 | 1–3 |
| 09:00–16:00 (peak) | 7–12 |

**Row counts on tables the AccessExclusive files touch**

| Table | Rows |
|---|---:|
| auth.users | 43 |
| auth.sessions | 33 |
| auth.refresh_tokens | 212 |
| storage.objects | 1,229 (19 in `project-documents`, 2 of them with a non-uuid first folder, the case 00892 guards) |
| proposals | 55 |
| proposal_agreement_parts | 62 |
| project_phases | 142 |
| project_ffe_items | 73 |
| client_decisions | 26 |
| margin_notes | 9 |
| outbound_drafts | 2 |
| project_approval_artifacts | 2 |
| project_parties | 11 |
| project_party_authority | 0 |
| scope_change_requests | 1 |
| trade_scope_terms | 2 |
| install_punch_items | 0 |
| plan_* | 0 |
| projects | 34 |
| project_commercial_documents | 25 |

**Pre-checks against the data**
- 00868 unique index: 0 duplicate `scope_package` keys.
- 00878 check constraint: 0 invalid authority scopes.
- 00869 legacy execution-order backfill: 8 rows qualify.

### 2.3 Recommendations

1. **Window.** Run between **00:00 and 04:00 CT**, the lowest band in the token data. Start a few minutes after a cron minute mark rather than on it. Announce a 5-minute sign-in and file "hiccup".
2. **`lock_timeout` 5 s per AccessExclusive file; `statement_timeout` 60 s per file.**
   - **Why `lock_timeout` matters most here:**
     - With `lock_timeout = 0`, a file that waits for its AccessExclusive lock behind a long transaction on `auth.*` or `storage.*` also blocks every later sign-in that queues behind it. That is an outage of unbounded length.
     - With 5 s, the worst case is a 5 s stall. The file's transaction then rolls back, `db push` stops, and the earlier files stay committed. Re-running the push resumes from the first unapplied file.
   - **Mechanism, which needs a decision; none is verified:**
     - **(a) Recommended:** add `SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '60s';` as the first lines of the 13 AccessExclusive files before merge. `db push` runs each file in one transaction, so `SET LOCAL` covers exactly that file. This is a reviewed one-line change per file. It was not made here, because RC-5 is evidence-only.
     - **(b)** Run `ALTER ROLE cli_login_postgres SET lock_timeout = '5s'` before the push and `RESET` it after. This is a prod mutation. It is unverified whether the CLI recreates the role or whether its later `SET ROLE postgres` keeps the setting.
     - **(c)** Apply with `psql -v ON_ERROR_STOP=1` per file, exactly as this rehearsal did (`SET LOCAL` inside each transaction), then record each version with `supabase migration repair --status applied <v>`. This is the most control and the most manual steps.
3. **Watch during the push.** In a second read-only session, poll `pg_locks` joined to `pg_stat_activity` for `granted = false` on `auth.*` and `storage.*`. If a waiter goes past 5 s with no `lock_timeout` in place, cancel the push backend with `pg_cancel_backend`. Cancelling rolls back only the open file.

## 3. Populated migration rehearsal (owned stack)

### 3.1 Stack and population

**Stack**
- Project `patina-rc5`, ports 58320–58329 (API 58321, DB 58322). It ran from a `mkdtemp` scratch directory, not the repository.
- The scratch directory holds main's `supabase/{config.toml,migrations,seed,templates}` taken with `git archive main`. Only the five `.temp` version pins were copied; no project ref and no linked state.
- Started with `-x studio,mailpit,logflare,vector,edge-runtime,imgproxy,postgres-meta`. Start took 45 s.
- Every write script first checks the system identifier `7701899881286336554`, which is the `patina-rc5` container's, and refuses to run on any other database.
- `cron.launch_active_jobs` was set to off, so no cron jobs ran during the rehearsal.

**Baseline:** main's head with seeds. The ledger held 793 rows, ending at 00867.

**Population.** `populate.sql` ran in replica mode. It cloned existing rows with one perturbed column per unique index and inserted legacy shapes, including:
- `project-documents` objects whose first folder is not a uuid (every 50th of 12,000 objects);
- margin notes, scope change requests and punch items;
- 450 extra auth users, with sessions and refresh tokens.

**Row counts after population:** 482 tables, 23,730 rows.

| Table | Rows |
|---|---:|
| auth.users | 468 |
| auth.sessions | 360 |
| auth.refresh_tokens | 2,160 |
| storage.objects | 12,000 |
| margin_notes | 1,254 |
| proposals | 520 |
| proposal_agreement_parts | 612 |
| project_phases | 1,515 |
| project_ffe_items | 984 |
| projects | 399 |
| project_parties | 341 |
| project_commercial_documents | 252 |
| client_decisions | 328 |

### 3.2 Apply 00868–00895

**Method:** `apply.py` runs one `psql -v ON_ERROR_STOP=1` transaction per file, with `SET LOCAL lock_timeout='5s'` and `statement_timeout='120s'`, then inserts the ledger row.

**Result:** **28 of 28 files exited 0, with 0 `ERROR` lines and 0 lock waits.** Timings and locks are in §2.1.

**Readback after the upgrade:**
- Tables went from 482 to 511 (+29 new); rows from 23,730 to 23,737.
- **0 tables lost rows, and 0 tables were dropped.**
- The only pre-existing table that grew was `storage.buckets`, from 24 to 25: the new `service-acceptance-paper` bucket.
- `project_commercial_execution_order` holds 4 legacy backfill rows, from the population's qualifying proposals.
- `server_capabilities` holds 2 rows, both `false`.
- The ledger has 28 new rows, ending at 00895.

**Grant census on the `db push` path.** The seed did not run, as on Strata.
- 153 round-8 functions: **0 with `anon` EXECUTE, 0 with `PUBLIC` EXECUTE.**
- Every C4/C6 mutation is false for `authenticated`, `anon` and `service_role`.
- Reads are granted to `authenticated`.
- `service_role` holds EXECUTE only on the planned helpers: `apply_service_arrangement`, `reconcile_scope_edition`, `grant/revoke_fabrication_authority`, `party_holds_fabrication_authority` and `guard_fabrication_authority_immutable`.

### 3.3 SQL contract suites on the upgraded database

The suite list is RC-1's. Each row of `gate/summary.txt` reads `group|suite|exit|PASS|FAIL|ERROR|SKIP`.

| Group | Suites | Result |
|---|---|---|
| C4 | activation plan 500, X08 28, service_acceptance 263, client_evidence 328, household_identity 60 | all exit 0, 0 ERROR |
| C6 | service_completion 177 | exit 0 |
| round-8 | billing 21, open_chain_alias 25, evidence_manifests 162, external_fulfilment 120, package_reading 87, external_presence 161, reader_parity 225, fabrication_authority 170, fabrication_instruction 82, fill_locked_current 10, placement_retry 9, plan_composition 95, readiness_batch 55, scope_composition 163, consumer_projection 5, scope_execution 117, scope_reconciliation 51, typed_subjects (raise-on-fail; "C7 audience assertions passed" present) | 18 of 18 exit 0 |
| round-8 isolated variants | the same 18, plus service_acceptance_isolated 263 | 19 of 19 exit 0, same counts |
| Legacy contracts | proposal_phase_authority_atomicity, close_project_readiness, product_configuration, configuration_privacy (1), 00463, **00464**, 00465, 00467, 00468, 00569 | 10 of 10 exit 0 after the 00464 rerun (see below) |
| ACL replay | 9 scripts (2/2/4/2/2/2/2/5/4 PASS) | all pass |
| Concurrency | prelude; service_completion 1/1; client_evidence 1/1; billing 1; evidence_manifests 2; external_fulfilment 1; external_presence 1; fabrication_authority 1; fabrication_instruction 25; scope_execution 1; service_acceptance 1; owned_psql 140; fill_locked_current (compile-only, exit 0); scope_composition race PASS 7 | 0 fail, 0 skip, 0 cancel |

- **X08 and activation-plan ran from port-adjusted copies.** Their in-file guard is hard-coded to `55322`; the copies change only that guard, to `58322`.
- **00464: first-run failure was caused by the harness.**
  - It failed first with `recommended option must belong to its decision` (exit 3), at line 1596. `expire_due_client_decisions` reached the 320 `client_decisions` rows the population had cloned. Those rows were cloned without their option rows, so each recommended option points at the source decision. No real write path produces that shape.
  - After those synthetic rows were deleted (by their population `xmin`, in replica mode), the rerun exited 0 with 0 `ERROR`. Nothing in 00868–00895 changes that function.
- **Not run:** `scope_reconciliation_concurrency.test.mjs`, which needs an owned_seed container (accepted debt SQ-2196).
- After the gate, `scope_editions` was false again and the gate-window grants were revoked (`f|f`).


## 4. Runtime rehearsal (designer portal on 3520, against the upgraded, populated stack)

**Setup**
- Every run used `next dev --webpack` on port 3520, pointed at `http://127.0.0.1:58321` / `58322`.
- Keys came from `supabase status -o env`, through a wrapper that refuses any other port.
- One worker. `global-setup.ts` loaded F01 into `58322` through `SUPABASE_DB_URL`.
- No existing `playwright*.config.ts` was edited. The flag and walk runs used a scratch config that extends `playwright.round8.config.ts` and is kept out of the repository.

### 4.1 Existing round-8 suites

| Run | Result (verbatim) | Notes |
|---|---|---|
| `playwright.round8.config.ts --project=chromium --workers=1`, renderer pinned on | **7 failed, 100 passed (37.6m)** | See the failure table below. |
| Rerun of the 3 non-scale failures alone (`composition.spec.ts:22`, `phone-line-editor.spec.ts:89`, `:165`) | **12 passed (3.9m)** | All three pass in isolation. |
| `scale-profile.spec.ts`, scratch copy with only the two `127.0.0.1:54321` origin filters switched to `NEXT_PUBLIC_SUPABASE_URL` | **4 passed (2.6m)** | Confirms the root cause of D6. |
| `ROUND8_RENDERER=off`, `@renderer-off` only (`chromium-legacy`) | **7 passed (2.0m)** | Legacy paper, legacy route, `lens=purchase` default, FF&E read failure, Field note return, first slice. |

**Failures in the full run**

| Test | Error | Classification |
|---|---|---|
| `composition.spec.ts:22` at 1440 | `Test timeout of 180000ms exceeded while setting up "authenticatedPage"` (`fixtures/auth.ts:70`). The page was still on sign-in. | Harness: first-hit `next dev` compile inside the auth fixture. It passed in 35.3 s when rerun. |
| `phone-line-editor.spec.ts:89` at 320, "absent API late refusal recovers the draft…" | The `Finish` textbox was not found inside `[data-unfold-instrument="pieces"]` after the late refusal. | Order-dependent flake. It passed alone (15.6 s), and RC-3b passed it too. **Not explained.** |
| `phone-line-editor.spec.ts:165` at 320, "touch/keyboard fit…" | `[data-paper-chapter="ffe"]` was missing `data-density="full"` after the reload. | Same: passed alone (19.3 s). **Not explained.** |
| `scale-profile.spec.ts:125` ×4 (36, 80, 500, 2,000 lines) | `Silent truncation: DB 80, fetched 0, rendered 36` (and the matching lines for the other sizes). | **Harness defect D6.** The listener counts only responses from `http://127.0.0.1:54321`. On `58321` it counts none, so "fetched" is always 0. The origin-fixed copy passes 4 of 4. This is the RC-3b G4 "fetched 0" cause. The product read is complete. |

### 4.2 Renderer flag through the real PostHog SDK

`NEXT_PUBLIC_FLAG_OVERRIDES` was emptied for this flag only, so the hook resolved through `posthog-js` 1.359.1. The SDK used a scratch key and a host on `127.0.0.1:58999`; Playwright fulfilled, delayed or aborted its `/flags` calls. The spec is `rc5-pw/specs/flag-resolution.spec.ts`.

**Result: 8 passed (2.3m).** The expected values follow the rule recorded in `evidence/flag-inventory.md` §4 ("Fallbacks named").

| Case | Observed (sessionStorage `patina:paper-renderer:v1`, frame log) | Rule |
|---|---|---|
| Flag `true` | `round8/flag`; legacy desk never mounted | as recorded |
| Flag `false`, identified | `legacy/flag` | as recorded |
| SDK blocked fast (`/flags` and `/config` aborted) | `legacy/error`. Frames: `pending:true, legacy:true, pending:false`; round 8 never mounted | "tab latch, else legacy, at about 20 ms". The decision came from `errorsLoading`, not the timer. The 20 ms figure was not re-timed here. |
| DNT on (`navigator.doNotTrack = '1'`) with flag `true` | **`round8/flag`**; 3 `/flags` requests were made | "treated like any other user; flags resolve" |
| Unresolved: `/flags` answers `true` after 6 s | `legacy/timeout` at the deadline. Then, while a draft was typed in the Record-an-inquiry dialog, the late `true` arrived: **no swap**. Draft text and DOM node identity were kept; frames `pending:true, legacy:true, pending:false`. | "SDK hung → tab latch, else legacy, at 1500 ms"; the latch holds |
| Settled round 8, then `posthog.reloadFeatureFlags()` answers `false` mid-edit | `isFeatureEnabled` now reads `false`, but the round-8 frame stayed. The `#studio-find` draft and the node identity were kept; swaps: none after the first mount. | "Once decided, the renderer never changes within this document" |
| Desk → job → desk, with the SDK blocked after the first decision | No `pending` and no legacy frame on either navigation. The module latch was reused. | as recorded |
| **Kill-switch limit.** Tab latched to round 8; the flag is then turned off but the SDK is blocked, then hung | Reload with SDK blocked: **`round8/tab`**. Reload with `/flags` hung for 20 s: **`round8/tab`**. A **new tab** in the same profile with SDK blocked: **`legacy/error`**. Back in the latched tab with PostHog reachable and answering `false`: **`legacy/flag` on the first full load.** | A tab latched to round 8 stays round 8 across reloads while the SDK is blocked or hung, **until the tab closes**. A new tab, or the first load that reaches PostHog, applies the kill switch. |

- **The HANDOFF wording is wrong.** HANDOFF.md:51 asks to prove "legacy fallback when the SDK is blocked or DNT is set". That misstates the recorded rule:
  - DNT does **not** fall back; flags resolve, and a cohort user under DNT gets round 8.
  - A blocked SDK falls back to the **tab latch first**, and to legacy only if there is none.
  - RC-5 rehearsed the recorded rule, not HANDOFF's sentence.
- **What the kill switch means in practice.** A cohort user whose network blocks PostHog keeps round 8 in that tab after the flag is turned off, until the tab closes. Tell them to close the tab, not just reload. Recorded in §1.6.
- **The `cached` source was never seen.** The PostHog persisted-cache path (precedence step 3) produced no `cached` decision in any case here; the new-tab case fell to `legacy/error`, not `round8/cached`. Whether production's persisted cache can hold a stale `true` across tabs while the SDK is blocked is **not verified**.


### 4.3 C2/C4/C6 activation, deactivation and F8 (owned stack)

**Method:** `activation.sql` and `deactivation.sql` follow C2 §2.8, C4 §2.8 and C6 §2.7. Each refuses unless it is on the `patina-rc5` system identifier. The steps:
- a `has_function_privilege` census;
- a direct PostgREST RPC probe signed in as `designer@patina.dev` and as anon (`rpc-probe.mjs`, which prints codes only);
- the round-8 job's Closeout chapter on 3520 (`activation-ui.spec.ts`, scratch).

| State | Grant census (authenticated, C4 6 + C6 3; service_role stamp) | Designer RPC (create / respond / withdraw / complete) | Anon RPC | Job UI (Closeout → Studio service) |
|---|---|---|---|---|
| 1. As shipped (`db push` path) | all `n`; reads `Y` | `HTTP 403 42501 permission denied for function …` (×4) | `HTTP 401 42501 permission denied` (×6) | `[data-studio-service-inactive]` = 1: "Studio service completion isn't switched on for this studio yet." `Complete studio service` disabled |
| 2. Activated (`scope_editions=true`; C2 3, C4 6 + stamp, C6 3 granted) | all `Y` | `HTTP 403 42501 insufficient_privilege` (×4): the function body ran and refused the foreign probe project, so the grant gate opened | unchanged: `401 permission denied` | inactive note **0**. Button still disabled, held by real blockers ("The client hasn't accepted…", "No agreed scope is in force…") |
| 3. Deactivated (one transaction: setting off; 15 revokes) | C4/C6 all `n`; C5 4 and C3 `record_fabrication_instruction` `n`; C2 3 still `Y` (C2 §2.8 does not require revoking them) | back to `permission denied for function` (×4) | `401` | inactive note **1** again; same copy |
| 4. F8: three mutations re-granted alone, setting still off | create / respond / complete `Y` | create, respond, complete: **`HTTP 500 55000 scope_editions_inactive`**; withdraw: `403 permission denied` | — | — |
| 5. Restored to shipped state (F8 grants and C2 3 revoked) | all `n`, C2/C5/C3 `n`, reads `Y`, `scope_editions=false` | `permission denied for function` (×4) | — | — |

- **Inactive means denied.** Every direct RPC mutation is denied while inactive, both by the grant and, as F8 shows, by the body's own check.
- **55000 surfaces as HTTP 500.** PostgREST returns HTTP 500 for SQLSTATE 55000. The designer copy, the client component and `use-service-acceptance.ts` all match on the `scope_editions_inactive` message, not on the status code.
- **Not walked:**
  - the client portal's paused copy ("Responses are paused for now. Nothing you've seen is lost."); it is covered by unit tests only, and the client portal was not run;
  - the C4 designer note `[data-service-acceptance-inactive]`, which appears only after a refused mutation, and F01 has no scope edition to request against;
  - an end-to-end request → response → completion while active, again because F01 has no active edition.


## 5. Preserved-capability walk (WP-00.2 inventory, both renderers)

**Sources of evidence**
- **(a)** The existing round-8 suites in §4.1: 100 of 107 passed with renderer on, the 3 order-dependent failures passed on rerun, and 7 of 7 passed with renderer off.
- **(b)** A scratch walk, `rc5-pw/specs/capability-walk.spec.ts`: **2 passed (6.5m)**. For each renderer (resolved through the mocked PostHog flag) it opened every registry entry from ⌘K and recorded the URL, dialog and screenshot (`rc5-evidence/pw-walk/walk/*`). It also captured the full job page, the `?` keys sheet and `/help`.
- **(c)** A scratch job-doors probe, `rc5-pw/specs/job-doors.spec.ts`: **2 passed (7.0m)**. It recorded every visible door on the job and the ⌘K document-scoped surfaces (`rc5-evidence/pw-doors/doors/*`).

**Legend:** **P** present; **M** moved (to where); **X** missing (a defect); **NV** not verified here.

### 5.1 Capability families

| # | Family | Round 8 | Legacy | Evidence |
|---|---|---|---|---|
| F1 | Inquiry, lead, proposal, direct project, agreement, activation, lineage | P: chapter 01 Brief & agreement; Record-an-inquiry, Create-a-project-file and Draft-agreement dialogs | P: same dialogs | (a) identity-lineage ×4, studio-journeys "recorded inquiry opens its own brief"; (b) dialogs on both renderers |
| F2 | Rooms, bulk/grouping, alternates, finishes, labor/tax/markup, protected values, change orders | P: chapter 06 FF&E inline unfold, six lenses | P: `/pieces` route | (a) ffe-unfold ×10, ffe-operations ×3, ffe-lenses ×3, configured-placement ×4 ("legacy Pieces opens that line"), phone-line-editor, first-slice, plus `@renderer-off` ffe-lenses and first-slice. COM, tax/markup and change orders **not individually exercised** |
| F3 | Capture, library/catalog/configurations, boards/materials, provenance | **M**: Library is a masthead door (`/library`). Project boards are reachable only from ⌘K "Design boards · this project" and `/doc/[id]/boards`, with **no visible door on the job paper** (D8) | P: the "Filed with this job → Boards" rail door | (a) library-resources, library-return; (b) library opens `/library` on both; (c) round-8 door list has no Boards; legacy has one |
| F4 | Measured rooms, plan uploads/revisions/issues, render lifecycle | **M**: the Drawing sets rail door becomes "Open project drawing sets" inside chapter 02 Design (`/doc/[id]/plans`); measured rooms per room in Design | P: rail door and `/rooms` | (b) rooms opens `/rooms` on both; (c) round-8 ⌘K "Drawing sets" opens `/doc/[id]/plans`; cabinetry-cp01 |
| F5 | Orders register, receiving, claims, vendors, external purchases | P | P | (a) buying-paper ×3, receiving-paper ×2, purchase-lens (both renderers); (b) "Purchase orders" sheet on both |
| F6 | Accounts, receivables, invoices, commercial authority | P: chapter 08 Financials, "Draft an invoice" | P | (a) accounts-paper ×3, resource-returns "book returns to the exact invoice row"; (b) "Studio accounts" and "Draw an invoice" on both |
| F7 | Timer/manual hours, scopes, rates, claims/releases | P | P | (a) hours-paper ×2; (b) "Timesheets" and "Log time" on both; "NO ACTIVE TIMER" strip on both |
| F8 | Client/maker/trade relationships, communications | P: masthead People | P | (a) people-resources, responsive "keyboard Find reaches People"; (b) add-maker opens `/people` "New contact" on both. The round-8 ⌘K→People capture caught a `next dev` compile and stayed on `/desk` at 3 s; a harness timing artifact, covered by (a) |
| F9 | Project directory, work orders, Field observations, tasks, changes, distribution | **M**: the Project directory rail door becomes the job-head door "Project directory · 0" plus the ⌘K sheet; tasks are "The work" in Schedule | P | (c) round-8 ⌘K opens the Project directory sheet (screenshot `round8-cmd-call-sheet.png`); (a) field-subject-return ×2 (+ `@renderer-off`) |
| F10 | Membership, rates, defaults, preferences, notification rules, profile, help/command search | P: ⌘K, `?` keys sheet ("Anywhere"), `/help`, the "Account and settings" door | P: same | (b). InterruptionSettings and the AccountSheet contents were **not opened** |
| F11 | Save errors, loading, identity loss, access loss, offline/retry, concurrency | P | P (FF&E read failure only) | (a) states ×7, ffe-read-failure (both renderers), return-hold, accounts/hours/buying refusal cases |
| F12 | Client page and Field/iOS consumers | NV | NV | Belongs to WP-10C and RC-2 (the RC-2 journey passed on RC-3b). Not run here |

### 5.2 Registry (15 entries, opened from ⌘K)

| Entry | Round 8 | Legacy |
|---|---|---|
| library | P (`/library`) | P (`/library`) |
| people | P (masthead People; see F8) | P (`/people`) |
| rooms | P (`/rooms`) | P (`/rooms`) |
| drafting-room | **NV**: "proposal in hand" only, and F01 has no proposal in hand, so ⌘K "drafting" found nothing on either renderer | NV |
| orders | P ("Purchase orders" sheet) | P |
| accounts | P ("Studio accounts" sheet) | P |
| hours | P ("Timesheets" sheet) | P |
| the-post | P (Post sheet; resource-returns "Post activity returns…") | P |
| call-sheet | P ("Project directory" sheet on the job) | P (job-head and rail doors) |
| capture-lead | P ("Record an inquiry") | P |
| open-project | P ("Create a project file") | P |
| draft-proposal | P ("Draft a design agreement for an existing household") | P |
| draw-invoice | P ("Draw an invoice") | P |
| log-time | P ("Log time") | P |
| add-maker | P (`/people`, "New contact") | P |

### 5.3 DocSpine duties

| Duty | Round 8 | Evidence |
|---|---|---|
| Section ladder, active section, jump/scroll | **M**: the ContentsMargin "In this job" (01–10 with sub-labels) | (a) paper-frame "contents margin names exactly the mounted chapters", "a contents press scrolls … and moves focus" |
| Money/workflow ladder; doors and lens destinations | **M**: chapter sub-labels ("80 LINES · 3 ROOMS", "NOTHING YET"). Of the four "Filed with this job" doors, Drawing sets moved to chapter 02, Project directory to the job head, and **Specification book and Boards have no visible door** (⌘K only; D8) | (c) door lists for both renderers |
| Room-in-hand label and release | **NV**: no room was in hand at the captures (`data-spine-*` = 0 on both renderers) | first-slice and ffe-unfold exercise the room unfold, not the JobHead release |
| Responsive rail, mobile handoff, compact handle | **M**: compact navigation at phone widths | (a) responsive ×9, rc4b-presentation ×6, phone-line-editor at 320/390 |
| Lens/context state | P | (a) ffe-lenses "six-lens head ends on Purchasing", purchase-lens (both renderers) |

### 5.4 Shell overlays and providers (`(document)/layout.tsx`)

- **P on both renderers (11):**
  - SkipToPaper ("Skip to main content");
  - StudioDrawer (Resource library / Studio contacts / Measured rooms / Ledgers);
  - LogStrip;
  - CommandBar;
  - KeysSheet;
  - Help;
  - LogTime overlay;
  - InvoiceOverlays;
  - DraftProposalOverlay;
  - AccountSheet door;
  - mobile bar and sheets, per responsive.
- **SavingBand / InlineErrorSurface** are covered by states and return-hold.
- **NV (3):**
  - InterruptionSettings;
  - ReturnToLeadUndo;
  - DeskWalkthrough / DeskDoorway (the walkthrough's coachmark fetch was seen in the logs, but the tour was not walked).

### 5.5 Job regions (F01)

- **Round 8 mounts eight chapters:** 01 Brief & agreement, 02 Design, 04 Approvals, 05 Schedule, 06 FF&E, 08 Financials, 09 Closeout, 10 Record.
- **Also present:**
  - the letterhead instruments (Message the client, Link a client, Preview the client's copy, Sharing · Milestones, Project directory, cover photograph, makers on the client's page);
  - NEXT / decision lead;
  - the call-sheet prompt;
  - the margin rail;
  - the footer acts (Vendor correspondence, Place project on hold, Archive project, Add project contact).
- **Legacy shows the same instruments and acts** in its own regions.
- **Chapter 03 (cabinetry)** does not mount on F01. CP-01 cabinetry is covered by cabinetry-cp01 on its own fixture (**P**).
- **Chapter 07 (site, team, visits, files)** does not mount on F01, and the legacy F01 page shows no visits or files region either: **NV** on both.
- **The new C4/C6 sections** (Closeout → Service acceptance, Studio service) mount **only** in the round-8 closeout chapter. There is no legacy equivalent (finding D9).

### 5.6 Tally (round-8 renderer, 57 rows: 12 families, 15 registry entries, 5 DocSpine duties, 14 shell items, 11 job regions)

| Present | Moved | Missing | Not verified |
|---:|---:|---:|---:|
| 44 | 6 | **0 strictly missing** | 7 |

- **Moved:** F3, F4, F9, plus three DocSpine duties.
- **Not verified:** F12, drafting-room, room-in-hand, three shell items, chapter 07.
- **Moved with a gap:** Specification book and Design boards lost their visible door on the round-8 job paper; ⌘K and the direct URL still reach them. Recorded as defect **D8**, not counted as missing.

The legacy renderer is present on every row it was walked on. Its NV rows are the same as round 8's, except that legacy keeps the four "Filed with this job" doors.

## 6. Findings

### 6.1 Defects and plan gaps (severity, confidence)

| # | Finding | Severity | Confidence |
|---|---|---|---|
| D1 | **The ship chain omits 00867.** Strata stops at 00866, so `db push` applies main's 00867 first. The "ship 00867?" decision becomes part of this push (§1.0 item 1). | High (process) | High: measured on the Strata ledger |
| D2 | **The HANDOFF lock list misses 00892.** It holds AccessExclusiveLock on 16 `auth.*` and 3 `storage.*` tables (§2.1). Shipping 00892 alone (open question 1) also takes this lock. | Medium | High: measured |
| D3 | **The HANDOFF redeploy list misses 35 `send-authority` importers**, including `stripe-webhook`, `invoice-send`, `po-send`, `proposal-send` and `apns-send`. The change is type-only, but policy requires the redeploy (§1.3). | Medium (process) | High: static import graph |
| D4 | **C4 activation is not sufficient alone.** It needs the C2 `scope_editions` setting and the C2 mutation grants first (§1.0 item 4). | Medium | High: contract text plus the F8 probe |
| D5 | **`db push` has no per-file `lock_timeout`.** Strata's `lock_timeout` is 0, so one wait for an AccessExclusive lock on `auth.*` queues every sign-in for as long as it waits (§2.3). | High (operational) | Medium: mechanism inferred; no wait was observed |
| D6 | **`scale-profile.spec.ts` hard-codes `http://127.0.0.1:54321`** (lines 34 and 52) for request interception. On any owned stack it intercepts nothing. This is the likely cause of RC-3b G4 "fetched 0". | Medium (harness) | High: the origin-fixed copy passes 4 of 4 (§4.1) |
| D7 | **X08 and activation-plan SQL suites hard-code a `55322` guard**, so they cannot run unmodified on an owned stack. | Low (harness) | High |
| D8 | **Specification book and Design boards have no visible door on the round-8 job paper.** Legacy prints both under "Filed with this job"; round 8 reaches them only through ⌘K and the direct URLs. The inventory's DocSpine row asks for "no loss of … doors". The phone sheets, which carry their own "Filed with this job" block, were not checked under round 8. | Medium | Medium: ⌘K results varied between two probe runs |
| D9 | **C4/C6 activation is global, but the designer surfaces exist only in the round-8 renderer.** `server_capabilities.scope_editions` is one global row. The Service acceptance and Studio service sections mount only in `closeout-chapter.tsx`. A studio still on the legacy renderer gets no designer surface after activation, and the C6 note says "isn't switched on **for this studio** yet" although the switch is not per studio. | Medium (rollout) | High: code and walk |
| D10 | **The deactivated C6 note reads as never activated.** After deactivation the note is "Studio service completion isn't switched on for this studio yet.", the same as before activation. ROLLOUT and C2 describe deactivation as a pause. | Low (copy) | Medium |
| D11 | **Three round-8 tests fail in the full suite but pass alone:** `composition.spec.ts:22` at 1440 (auth-fixture timeout during a dev compile) and `phone-line-editor.spec.ts:89` and `:165` at 320. The phone-line-editor pair is not explained. | Low (harness) | Medium |
| P1 | **Process disclosure.** One read-only query (`SELECT system_identifier`) was run through `docker exec` on the **shared** `supabase_db_supabase` container, contrary to "never touch 54321/54322". Nothing was written. | — | — |
| P2 | **Process disclosure.** A grep over `apps/*/wrangler.jsonc` printed the committed public anon JWTs and the public PostHog key to this session's log. They are committed literals, not secrets, but this broke "never print keys". Later checks masked values. | — | — |


### 6.2 Activation risks (recorded for the C4/C6 activation decision, not fixed here)

These came from the RC-6 money reviewer through the coordinator. RC-5 records them as preconditions on stages 5–6 and did not re-derive them.

1. **The client and iOS acceptance screens don't show what is being accepted.** The scope and evidence a household accepts are not on screen. Accepting without seeing the scope weakens the record C4 exists to create.
2. **An excluded package's open phase still blocks completion.** A phase that belongs to a package excluded from the accepted scope edition can keep C6 `complete_studio_service` from passing.
3. **A paper-only request can never reach `sent`, so paper intake is impossible for it.** A request whose signers are all paper never reaches the state from which `record_service_acceptance_paper_intake` is allowed.

Recommendation: carry all three, and HANDOFF open question 2 (household-card consent), as named preconditions in the C4 activation migration's review. With C4/C6 inactive, none of them can be reached in production.


### 6.3 Not verified

- **Anything on Strata or in production.** That includes the real `db push` timing and network round-trips, lock waits under live traffic, the chosen `lock_timeout` mechanism (§2.3), edge-function deploys, portal deploys and the PostHog cohort. None of these was run.
- **Kill-switch latency in production.** The PostHog server-side propagation delay was not measured. Neither was whether the persisted-cache path (step 3) can keep a stale `true` across tabs; that path never produced a `cached` decision in this harness.
- **The "about 20 ms" blocked-fast figure** was not re-timed; only the decision source (`error`) was asserted.
- **WebKit and the iPhone project** were not run in RC-5 (Chromium only). Neither was G3 (`help-state.ts`), which is RC-3c.
- **`scope_reconciliation_concurrency.test.mjs`**, which needs an owned_seed container.
- **The client portal**, including the paused acceptance copy and the `/acceptance/[requestId]` route, and the iOS acceptance views.
- **An end-to-end C4 request and C6 completion while active.** F01 has no active scope edition.
- **Shell items:** InterruptionSettings, ReturnToLeadUndo, DeskWalkthrough/DeskDoorway, the room-in-hand release, chapter 07 site/visits/files, and drafting-room.
- **Edge functions on the owned stack.** `edge-runtime` was excluded, so ⌘K "Ask" calls returned `useEngineAsk: Edge Function returned a non-2xx status code` in the walk screenshots. That is expected here and is not a product signal.
- **The populated-data relevance of the phone-line-editor pair (D11).**
- **A schema fingerprint against a clean main→branch reset.** It was not taken; the row and table readback in §3.2 stands in for it.

### 6.4 Owned-stack teardown

See the end of this document.


## Teardown (2026-10-28)

- `supabase stop --workdir <scratch> --no-backup` printed `"project_id_filter":"patina-rc5","backup":false,"message":"Stopped supabase local development setup."`.
- Afterwards there were **0 listeners** on 58321, 58322, 58320, 58329 and 3520 (`lsof -sTCP:LISTEN`), and 0 containers and 0 volumes labelled `patina-rc5`.
- Playwright stopped the 3520 dev server at the end of each run.
- The shared stack (54321/54322) and Lane A's 57xxx range were not used, apart from the read-only disclosure P1.

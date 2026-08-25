# The Rendered Room v2 — PROD CUTOVER RUNBOOK

> **Status:** execution runbook · **Date:** 2026-08-24 · **Revised:** 2026-08-25 — folds cross-program ordering comments (Step 1 ownership split, G2 peer-GO leg, DB_FRESH reuse, idempotency notes) · **Wave:** prod cutover of the **rich-record PRODUCE + VIEW** path
> **Companions:** `DELIVERY-PLAN.md`, `W1-EVIDENCE.md`, `W2-EVIDENCE.md`, `W3-W4-EVIDENCE.md`, `docs/ops/strata-staging.md`, `docs/engineering/patina-cloudflare-phase-1-runbook.md`, `infra/edge-api-worker/OPERATIONS.md`
> **Authority:** Kody has green-lit the prod wave. This document is the ordered, rollback-gated chain to execute against, in gated lanes. It carries GO/NO-GO gates before every irreversible step. It is **planning + read-only verification** — nothing here has mutated prod or staging.

---

## 0. What this wave IS and IS NOT

**IN scope — the produce + view path** (a designer can generate and *see* mesh · splat · renders on a real prod scan):

1. Prod migrations **00489, 00490, 00491, 00492, 00498, 00499, 00500, 00501** (file-based `db push --include-all`).
2. Prod **Modal environment `patina-production`** + hard budget cap + per-env secrets.
3. Prod **`dispatch-scan-modal`** edge function + its two Modal secrets.
4. Prod **R2 artifact bucket pair** `patina-media-originals-us` / `patina-media-artifacts-us` (note the **no-env-token** prod naming — not `patina-*-staging-*`).
5. Prod **`scan_worker` / `scan_reader`** group roles (migration-owned) + **`scan_worker_login`** minted out-of-band.
6. The **systemd `scan-pipeline` box** pointed at prod `agent_tasks` with the `solve` **dual-enqueue** code (enqueues the Modal stages).
7. The **`/v1/scan/*` READ routes** on the prod edge worker (`SCAN_ROUTES=on`) so prod portals can view artifacts.

**OUT of scope — deferred, with reasons:**

- **`MEDIA_UPLOADS` / originals-upload cutover.** Stays `off` on prod. Gated on the iOS keyframe **device pass** and the **shadow-corpus evidence** (≥50 bundles / ≥7 days / 100% sha256) that DELIVERY-PLAN W3's exit requires and which **does not exist** — the staging shadow corpus is provably empty (`W3-W4-EVIDENCE.md` §4.2). Turning uploads on in prod before that evidence exists would ship an unproven write path against a prod bucket.
- **The keyframe-ingest iOS fix.** Ships in an **app release** after Kody's device pass; it is not a server-side cutover step and has no place in this chain.
- **`scan_reader_login`.** Deliberately **not** provisioned. Per DELIVERY-PLAN R5 and `W3-W4-EVIDENCE.md` §3.4, the interactive read path reads through the caller's **own** JWT/RLS under `SET LOCAL ROLE authenticated` on the worker's existing `DB_FRESH` binding (`edge_rls_login`), never through `scan_reader`. The read routes need the **R2 read-token worker secrets**, not a scan-reader DB login. `scan_reader` stays an unprovisioned service surface.
- **The R2 orphan-object deletion job** (`public.expired_upload_originals` seam) — scheduled, not built; only relevant once uploads run (`W3-W4-EVIDENCE.md` §4.4).
- **Splat reconstruction quality** — a quality *programme*, not a cutover step (`W3-W4-EVIDENCE.md` §4.1). This wave ships the *plumbing that produces and views* a splat; it does not assert the splat is designer-grade.

---

## 1. Pre-flight checklist — everything that must be true before Step 1

None of these mutate prod; they are gates.

- [ ] **Explicit ship authorization exists in-session.** Kody green-lit the prod wave; this authorizes the whole chain (Modal env → migrations → roles → secrets → Modal app → dispatch fn → box → read-route coordination → smoke) without per-step re-asking. The `SCAN_ROUTES`/`MEDIA_UPLOADS` **flag flips are separately gated** (they are a reviewed `wrangler.jsonc` edit, not a redeploy).
- [ ] **New-paid-resource scope is precisely bounded.** The resources in this wave that require a Kody GO are exactly: the **2 R2 buckets** (`patina-media-artifacts-us`, `patina-media-originals-us`), the **2 R2 tokens** (the read token + the Modal read+write token), and the **prod Modal environment** (`patina-production`, incl. its budget cap). Nothing else in this chain is a new paid resource — the 13 migrations (Step 3) are append-only against the existing prod database, and Step 9's edge deploy reuses existing bindings (`DB_FRESH` Hyperdrive + already-committed `wrangler.jsonc` vars); neither adds billable infrastructure.
- [ ] **A dedicated prod-cutover git worktree**, linked to Strata prod, isolated from the root checkout (`patina-parallel-work`). Verify `supabase/.temp/project-ref` prints `bkvcixdmuyejfzcijpdg` before any DB command. Never run a bare `db push` from a checkout whose link you have not just re-verified.
- [ ] **The migration step is a COMBINED, multi-owner, version-ordered wave — not a solo scan push** (see Step 3). `supabase db push --include-all` applies ALL unapplied migrations across three programs in version order. The current unapplied set is **13**: this wave's scan **8** (`00489/490/491/492/498/499/500/501`), **Phase-2**'s `00494/00495` (media_registry — a *different* program), and **Phase-3**'s `00514/00515/00516` (capture-enrichment). This is confirmed by a read-only prod dry-run (Step 3, quoted verbatim). It requires **each owner confirming readiness** and a **single Kody GO for the bundle**.
- [ ] **`wrangler` auth is live on this machine** (for R2 CLI verification + the eventual peer worker deploy). If unauthed, stop and ask.
- [ ] **Modal CLI runs from `services/scan-modal/.venv`** (CPython 3.12 — system `python3` is 3.9 and cannot run Modal). The `~/.modal.toml` token applies globally.
- [ ] **A prod scan identity + bundle to smoke against** — either the prod seed identity or a real prod scan whose owner you can authenticate as (needed for Step 10's capability-URL leg). Confirm the seed marker live before touching any row (`patina-prod-ops`).
- [ ] **Kody's iOS device pass is NOT a blocker for this wave.** It gates only the deferred originals-upload cutover. The produce+view path does not touch iOS upload; do not wait on the device pass to run Steps 1–10.
- [ ] **Peer-coordination handshake opened** for Step 1(a) and Step 9 — R2 bucket creation and the `patina-edge-api` (prod) worker deploy are both the **cloudflare-phases** program's surface, not this lane's. Confirm who creates the buckets and when, and who flips `SCAN_ROUTES` on prod and when.

### Verified prod baseline (read-only probes, 2026-08-24)

| Probe | Result | Consequence for the runbook |
|---|---|---|
| Prod ledger tail (`schema_migrations` ≥ 00480) | `00480-00486, 00493, 00510, 00511, 00513, 00521` | All **eight** wave migrations are ABSENT; remote head is **00521** (above the scan band) → **`--include-all` is mandatory** (a plain push `LegacyDbPushMissingRemoteError`s). |
| `public.media_objects` on prod | **absent** | 00489 will create it. |
| `public.scan_pipeline_events` on prod | **present** (from 00341, long live) | 00490 references it idempotently — **not** a conflict. |
| `scan_worker*` RPCs / `scan_*` roles / scan crons / upload RPCs on prod | **0 / 0 / 0 / 0** | Clean slate; nothing to reconcile. |
| Wave migrations touching `svc_*` schemas | **none** | The prod Prisma-shape `svc_*` hazard (MEMORY: `project_prod_svc_schema_shape_divergence`) **does not apply** to this band — verified by grep. This band is materially safer than 00482/00493 were. |
| `00512` file on `main` | **absent** (parked on `followon/sd-caller-hardening-00512`) | The parked undeletable-draft defect **cannot** be swept in by an `--include-all` from `main`. Good. |
| Prod edge worker `patina-edge-api` scan surface | `api.patina.cloud/v1/scan/…` → **404**, `/v1/media/uploads` → **404** (`W3-W4-EVIDENCE.md` §1.4) | Surface is closed on prod today; Step 9 opens the read half only. |

---

## 2. Deploy-order law for this wave

House law is **migrations → edge functions → services/workers → portals → smoke**. Adapted to this wave's infra prerequisites, the dependency-correct order is:

```
Pre-flight
  → Step 1  Prod R2 buckets + read token        (no DB dep; gates Modal secret + worker)
  → Step 2  Modal patina-production env + CAP    (no DB dep; CAP BEFORE any GPU dispatch)
  → Step 3  Prod migrations 00489-00492,498-501  (⚠ MOST DANGEROUS / irreversible)
  → Step 4  Prod scan roles + scan_worker_login  (needs 00489/00490 objects)
  → Step 5  Modal patina-production secrets       (needs prod DSN from Step 4 + R2 token from Step 1)
  → Step 6  Deploy Modal app → patina-production   (needs Step 5 secrets to attach)
  → Step 7  Prod dispatch-scan-modal edge fn + secrets (needs Step 6 spawn URL)
  → Step 8  systemd box → prod agent_tasks + dual-enqueue (needs 3/6/7 so enqueued work has a consumer)
  → Step 9  [PEER GATE] edge-api-worker prod deploy, SCAN_ROUTES=on
  → Step 10 Prod smoke (E2E + capability-URL real bytes)
```

Steps 1 and 2 have no DB dependency and may run first, in either order. Everything from Step 3 down is strictly sequential.

---

## 3. The steps

Each step: **mechanism · pre-condition + verification probe (behavior, not version strings) · rollback · ownership · hard rails**.

---

### Step 1 — Prod R2 bucket pair + read token

**Ownership:** SPLIT — two owners, two halves.
- **(a) R2 bucket creation** (`patina-media-artifacts-us` + `patina-media-originals-us`) is the **cloudflare-phases / Phase-2 program's surface** — created by **THEM** via `wrangler r2 bucket create` (CLI, programmatic — **not** a Kody dashboard click), under **their own direct** Kody GO. Not this lane's action.
- **(b) The R2 token mint** (a read token for the peer's worker + a read+write token for our Modal) is a **Cloudflare-dashboard action**, driven by the Rendered Room session on Kody's browser with Kody's consent. This half stays **MINE** — I prepare and verify; Kody clicks.

**Mechanism.**
- **(a) Bucket creation — cloudflare-phases / Phase-2, their command:**
  - `patina-media-artifacts-us` (derived artifacts — splat, renders, GLB)
  - `patina-media-originals-us` (originals target — provisioned now, stays dormant this wave since `MEDIA_UPLOADS=off`)
  - `wrangler r2 bucket create`, account `be3aaeed18a81b5d90ee2263b62219ea` — CLI, programmatic, not a dashboard click.
  - **Note the naming:** prod has **no env token** (contrast staging's `patina-staging-media-*-us`). These exact names are already committed in `infra/edge-api-worker/wrangler.jsonc` `env.production.vars` (`SCAN_R2_BUCKET`, `SCAN_R2_ORIGINALS_BUCKET`).
- **(b) Token mint — MINE, Cloudflare dashboard, Rendered Room session:**
  - Mint **one read token** — Object **Read-only**, scoped to `patina-media-artifacts-us` **only** (name it e.g. `patina-media-scan-reader`). Its access-key-id/secret feed **two** consumers on the **same** credential: the prod edge worker read path (Step 9) and, if a Modal read path is ever needed, the Modal `scan-r2` secret. The **write token stays unminted** this wave (uploads deferred).

**Pre-condition + verification probe.**
- Pre: `wrangler` authed on the prod account.
- Verify (behavior): a PUT→GET→DELETE round trip against `patina-media-artifacts-us` using the minted read... note the **read token cannot write** — instead verify the bucket exists and is empty (`wrangler r2 bucket list` shows both; a `HEAD` on a known-absent key returns 404 not 403). The full write round trip is proven by Modal's `scan-r2` write credential in Step 5/6, mirroring staging's `rw_ok: true` (`W2-EVIDENCE.md` §1).
- Do **not** set the originals bucket CORS policy — no browser client issues uploads this wave, and CORS is a standing cross-origin write grant (`OPERATIONS.md` §"MEDIA_UPLOADS").

**Rollback.** Delete the buckets (only if empty). Buckets are inert until a token + `SCAN_ROUTES=on` reference them; an unreferenced bucket is a no-op.

**Hard rails.**
- **Least-privilege token, minted out-of-band.** Read token is read-only + single-bucket. Never a combined read+write or account-wide token. The write token is a *separate* credential and is not minted this wave.
- Bucket names must match the committed `wrangler.jsonc` prod literals exactly, or the worker boots 503 when `SCAN_ROUTES` flips on.

---

### Step 2 — Modal `patina-production` environment + hard budget cap

**Ownership:** MINE (scan-specific). The **budget cap is a Kody-gated Modal-dashboard action** (no budget CLI in client 1.5.x — `W1-EVIDENCE.md` §8 item 1). I create the env; Kody sets the cap.

**Mechanism.**
```sh
# from services/scan-modal/.venv
modal environment create patina-production
```
Then **Kody, in the Modal dashboard:** set a **hard budget cap** on the `kodeman` workspace / `patina-production` env. Hard caps **stop execution**, which is the behavior we want from an unwatched spawn target (DELIVERY-PLAN §4).

**Pre-condition + verification probe.**
- Pre: none (no DB dependency).
- Verify: `modal environment list` shows `patina-production`; `modal app list --env patina-production` is empty (app deploys in Step 6). Confirm the cap is visible in the dashboard.

**Rollback.** `modal environment delete patina-production` (empty env is inert).

**Hard rails.**
- **The budget cap MUST be set BEFORE any prod GPU dispatch can occur** — i.e. before Step 6 (Modal app deploy) and unconditionally before Step 8 (the box enqueues work that the dispatcher spawns to GPU). This is the single money-safety rail of the wave. Do not deploy the Modal app into an uncapped prod env.
- Per-environment secrets only (Step 5). Never reuse a staging secret in the prod env.
- Consider a **cheap deliberate halt demonstration** (lower a scratch cap, run a sub-cent CPU loop until it stops) to close the W4 budget-cap-halt line honestly before real GPU spend — cheap insurance the mechanism fires (`W3-W4-EVIDENCE.md` §4.5, §5). Optional but recommended.

---

### Step 3 — COMBINED multi-owner migration wave `00489 → 00516` (file-based `db push --include-all`) ⚠ MOST DANGEROUS / IRREVERSIBLE

**Ownership:** **SHARED — three programs, one push.** `--include-all` is atomic-per-file in version order across all three; it cannot be scoped to one program. This wave OWNS the scan 8 and marks them ready; it does **not** own the other 5. The push is a **single Kody GO over the whole 13-migration bundle**, contingent on every owner confirming their files are ready.

**The 13-migration combined set** (read-only prod dry-run, 2026-08-24 — verbatim below):

| # | File | Program | Owner | Status |
|---|---|---|---|---|
| 00489 | `media_registry_kernel` | Rendered Room v2 (scan) | MINE | **READY** — reviewed + staging-proven |
| 00490 | `scan_worker_roles` | scan | MINE | **READY** |
| 00491 | `dispatch_scan_modal_cron` | scan | MINE | **READY** |
| 00492 | `room_file_version_monotonicity` | scan | MINE | **READY** |
| 00494 | `media_registry` | **Phase-2 media** | PEER | **pending peer GO** |
| 00495 | `media_upload_intents` | **Phase-2 media** | PEER | **pending peer GO** |
| 00498 | `media_upload_intent_and_scan_version_lock` | scan | MINE | **READY** |
| 00499 | `upload_interface_hardening` | scan | MINE | **READY** |
| 00500 | `upload_kind_split` | scan | MINE | **READY** |
| 00501 | `upload_intent_quota_and_reaper` | scan | MINE | **READY** |
| 00514 | `capture_enrichment_ledger` | **Phase-3 capture** | PEER | **pending peer GO** |
| 00515 | `capture_enrichment_rpcs` | **Phase-3 capture** | PEER | **pending peer GO** |
| 00516 | `capture_producer_idempotency` | **Phase-3 capture** | PEER | **pending peer GO** |

**Verbatim read-only prod dry-run** (from a prod-linked worktree, ref asserted `bkvcixdmuyejfzcijpdg`, **`--dry-run` only — no mutation**, 2026-08-24):

```
Initialising login role...
DRY RUN: migrations will *not* be pushed to the database.
Connecting to remote database...
Would push these migrations:
 • 00489_media_registry_kernel.sql
 • 00490_scan_worker_roles.sql
 • 00491_dispatch_scan_modal_cron.sql
 • 00492_room_file_version_monotonicity.sql
 • 00494_media_registry.sql
 • 00495_media_upload_intents.sql
 • 00498_media_upload_intent_and_scan_version_lock.sql
 • 00499_upload_interface_hardening.sql
 • 00500_upload_kind_split.sql
 • 00501_upload_intent_quota_and_reaper.sql
 • 00514_capture_enrichment_ledger.sql
 • 00515_capture_enrichment_rpcs.sql
 • 00516_capture_producer_idempotency.sql
```
```json
{"upToDate":false,"dryRun":true,"migrations":["00489_media_registry_kernel.sql","00490_scan_worker_roles.sql","00491_dispatch_scan_modal_cron.sql","00492_room_file_version_monotonicity.sql","00494_media_registry.sql","00495_media_upload_intents.sql","00498_media_upload_intent_and_scan_version_lock.sql","00499_upload_interface_hardening.sql","00500_upload_kind_split.sql","00501_upload_intent_quota_and_reaper.sql","00514_capture_enrichment_ledger.sql","00515_capture_enrichment_rpcs.sql","00516_capture_producer_idempotency.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
```

Exactly 13, version-ordered. **`00512` is NOT in the plan** — it is parked branch-only (`followon/sd-caller-hardening-00512`) with no file on `main`, so `--include-all` cannot sweep it in. This is the plan to hand the peers for their diff.

**Per-migration schema confirmation for the scan 8** (grep-verified, 2026-08-24): every one is **`public`-schema ONLY, zero `svc_*` references** — so the prod Prisma-PascalCase `svc_*` shape trap (which bit 00482/00493) **does not apply to any scan migration**. `media_objects` is created as `public.media_objects` (00489 line 65). Per file: `00489` svc=0, `00490` svc=0, `00491` svc=0, `00492` svc=0, `00498` svc=0, `00499` svc=0, `00500` svc=0, `00501` svc=0. *(The peer 5 — 00494/00495 Phase-2, 00514/00515/00516 Phase-3 — are the owners' responsibility to confirm; 00521 `svc_media_shape_reconciliation` already landed on prod today, which is how head reached 00521.)*

**Mechanism** (from the prod-cutover worktree, verified linked to `bkvcixdmuyejfzcijpdg`):
```sh
# 1. VERIFY the link first — never a bare push from an unverified checkout
cat supabase/.temp/project-ref            # MUST print bkvcixdmuyejfzcijpdg

# 2. DRY RUN — the GO/NO-GO gate; re-run at execution time and diff against the plan above
supabase db push --dry-run --include-all

# 3. Only after ALL 13 owners have confirmed AND Kody GOes the bundle:
supabase db push --include-all
```
`--include-all` is **mandatory**: prod's remote head is `00521`, so every file in the plan sorts *below* head and a plain `supabase db push` fails `LegacyDbPushMissingRemoteError` (`strata-staging.md` "Migration ledger discipline").

**Pre-condition + verification probe.**
- Pre: **all three programs' owners confirm their files are prod-ready**; Steps 1–2 done (ordering); worktree link verified. If any owner is not ready, the whole bundle waits (or the not-ready files must be removed from the tree via a curated cutover branch so the plan shrinks to the ready set).
- Verify by **object, not ledger** (the ledger can lie): after apply,
  ```sql
  select to_regclass('public.media_objects');                       -- expect: media_objects
  select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'scan_worker_%';     -- expect: 4
  select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
    ('create_media_upload_intent','confirm_media_upload','register_media_object',
     'expire_stale_upload_intents','is_originals_bucket');           -- expect: 5
  select jobname, schedule, active from cron.job
    where jobname in ('dispatch-scan-modal-sweep','expire-stale-upload-intents-daily'); -- expect: 2 active
  ```
- Confirm `media_objects_select` policy is `TO authenticated` and delegates to `room_scans` (mirrors staging §3.1) — the mood-board class gate.

**Rollback.** Migrations are **append-only → roll forward**, never a blind down. The band is **purely additive** — new tables (`media_objects`), new RPCs, new roles, new crons — with **zero destructive ALTERs of existing prod objects** (verified: no `svc_*` touch, no drops of live tables). So the blast radius on *existing* prod behavior is near-zero even though the step is irreversible. If a defect surfaces, the containment is: **`cron.unschedule('dispatch-scan-modal-sweep')`** (halts dispatch instantly — a reversible config action, not a schema change) plus a forward-fix migration. Do not attempt to drop `media_objects` etc. unless a migration proves them truly unreferenced. **Partial-failure recoverability:** all 13 migrations are idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE`) and additive, so if the single `db push --include-all` fails mid-push (a transient error), re-running it continues from where it stopped — no manual repair, no partial-state corruption.

**Hard rails.**
- **THE MULTI-OWNER DRY-RUN GATE (wave's #1 rail).** `supabase db push --dry-run --include-all` MUST plan **exactly the 13-migration set** in the table above — and every one of the three programs' owners MUST have confirmed their files are prod-ready — before the real push. If the plan differs from the quoted plan (a new file appeared, or an owner is not ready), **STOP.** Because `--include-all` cannot be scoped to one program, the push is all-or-nothing over the 13: it goes only on a **single Kody GO for the whole bundle** with all owners' sign-off, OR the not-ready files are removed via a **curated cutover branch** so the plan shrinks to the ready set. This wave marks its **scan 8 READY (reviewed + staging-proven)**; the **peer 5 (00494/00495 Phase-2, 00514/00515/00516 Phase-3) are pending their owners' GO** — this lane does not sign for them. This is a **GO/NO-GO coordination checkpoint**, not a proceed.
- **Never a bare `db push`** and never `mcp__*__apply_migration` against prod — MCP stamps a timestamp version the CLI can never reconcile (`strata-staging.md` incident). File-based CLI only, target asserted.
- **The anon-EXECUTE default-privilege trap (the mood-board lesson, which bit twice).** Prod's `pg_default_acl` auto-grants `anon=X` on new `postgres`-owned functions; a file that only `REVOKE … FROM PUBLIC` leaves the explicit `anon` grant standing. **Verified in the scan 8 (grep, 2026-08-24):** `00489`, `00490`, `00498`, `00499`, `00501` carry explicit `REVOKE ALL … FROM PUBLIC, anon, authenticated` on every new function; `00491` defines no function (cron only); `00492` and `00500` are `CREATE OR REPLACE` on **unchanged signatures** — which preserve 00490's/00498's prior ACLs (00500's own header states exactly this) — so they introduce no new anon grant. The file hygiene is present. It still needs a **prod-verification checkpoint after apply**, because the trap bites precisely when default-privs re-grant anon on *first* creation on prod — **verify no anon EXECUTE leaked**:
  ```sql
  select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in ('create_media_upload_intent','confirm_media_upload',
      'register_media_object','expire_stale_upload_intents','caller_can_access_room_scan',
      'scan_worker_complete_task','scan_worker_fail_task','scan_worker_append_event',
      'scan_worker_update_room_file');   -- every row EXECUTE=false for anon
  ```
  Staging carries exactly this latent defect on `can_client_read_issued_board_media` (`strata-staging.md` "Known residual"). If any prod row comes back `true`, close it with a **numbered follow-up migration** (never an ad-hoc `execute_sql` revoke — that recreates the out-of-band-DDL problem).
- **Schema-qualify extension functions** — prod's `db push` search_path lacks `extensions`; a bare `uuid_generate_*`/`gen_random_*` 42883s on Strata (00282 incident). Verified locally before ship.

---

### Step 4 — Prod scan roles + `scan_worker_login` (out-of-band)

**Ownership:** MINE (scan-specific).

**Mechanism.** The `scan_worker` / `scan_reader` **group roles** are created by migration 00489/00490 (applied in Step 3). The **`scan_worker_login`** LOGIN role is minted **out-of-band**, exactly as staging (`W1-EVIDENCE.md` §"scan_worker_login role"), with a password held **only** as a Modal Secret:
```sql
-- run once against prod, out-of-band (psql on the direct endpoint or Studio SQL);
-- password = openssl rand -base64 36 (URL-safe), never written to repo/report/migration
CREATE ROLE scan_worker_login
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT LOGIN NOREPLICATION NOBYPASSRLS
  PASSWORD '<held only as a Modal Secret>';
GRANT scan_worker TO scan_worker_login WITH INHERIT TRUE, SET FALSE;
```

**Pre-condition + verification probe.**
- Pre: Step 3 applied (roles + RPCs exist).
- Verify (negative + positive, prove the gate is not vacuous — mirror `W1-EVIDENCE.md` §6):
  - Positive: `scan_worker_login` can EXECUTE exactly the four `scan_worker_*` RPCs **+** `register_media_object` (5 total).
  - Negative: it is **denied** `SELECT` on `room_files`, `media_objects`, `profiles`; **denied** EXECUTE on `create_media_upload_intent`, `confirm_media_upload`, `enqueue_agent_task`, `expire_stale_upload_intents`; **denied** schema `storage`.
- **`scan_reader_login` is NOT created** (see §0).

**Rollback.** `DROP ROLE scan_worker_login;` (out-of-band). The group roles are migration-owned; leave them (harmless, unused without a login).

**Hard rails.**
- **Least-privilege LOGIN role minted out-of-band** — never in a migration, never printed, password only in the Modal Secret. `NOINHERIT` on the role + `WITH INHERIT TRUE` on the membership is the PG16 shape (inherits grants, cannot `SET ROLE`).
- **Prod pooler host caveat.** The DSN transits the Supavisor **session-mode pooler on :5432**. Prod uses **`aws-1-us-east-1`** (`supabase/.temp/pooler-url`) — NOT staging's `aws-0`. Building the prod DSN with the wrong pooler node fails with a misleading `tenant/user … not found` (`W1-EVIDENCE.md` §"DSN shape"). Use the prod pooler host.
- Never `service_role` in Modal — that is the whole point of this role (DELIVERY-PLAN R2).

---

### Step 5 — Modal `patina-production` secrets

**Ownership:** MINE (scan-specific).

**Mechanism** (from `services/scan-modal/.venv`, `--env patina-production`). Three secrets, names/keys only — **no values in any report**:

| Secret | Key(s) | Value source |
|---|---|---|
| `scan-worker-db` | `SCAN_WORKER_DSN` | prod DSN for `scan_worker_login` (Step 4), **prod pooler `aws-1`** |
| `scan-modal-auth` | `SCAN_MODAL_AUTH_TOKEN` | fresh random bearer; the same value goes into the dispatch fn's `MODAL_BEARER_TOKEN` (Step 7) |
| `scan-r2` | `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | prod **write** credential for `patina-media-artifacts-us` (Modal writes derived artifacts). If a write token for artifacts is not yet minted, this blocks Modal's artifact writes — coordinate the mint with Step 1. Read-only-artifacts is insufficient for the writer. |

```sh
modal secret create scan-worker-db  SCAN_WORKER_DSN=... --env patina-production
modal secret create scan-modal-auth SCAN_MODAL_AUTH_TOKEN=... --env patina-production
modal secret create scan-r2 R2_ENDPOINT=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... --env patina-production
```

**Pre-condition + verification probe.**
- Pre: Step 4 (DSN identity exists); Step 1 (R2 endpoint/token).
- Verify: `modal secret list --env patina-production` shows all three (names only). Real value verification happens at Step 6/10 (a live spawn writes `scan_pipeline_events` over the DSN and an artifact to R2).

**Rollback.** `modal secret delete <name> --env patina-production`. Rotating the DSN = `ALTER ROLE scan_worker_login PASSWORD …` + update the secret.

**Hard rails.**
- **Per-environment secrets** — never a staging value in the prod env. Modal Environments isolate secrets; keep them isolated.
- Modal's `app.py` attaches `scan-r2` unconditionally to `splat`/`renders`, so the secret must **exist** for the app to deploy at all (`W1-EVIDENCE.md` §6 item 2) — create it even if artifact writes are being finalized.
- Names only in reports; values only in the secret store.

---

### Step 6 — Deploy the Modal app to `patina-production`

**Ownership:** MINE (scan-specific).

**Mechanism.**
```sh
# from services/scan-modal/.venv
modal deploy -m scan_modal.app --env patina-production
```
Deploys `verify` (CPU), `splat` (L4), `renders` (L40S), `spawn` (web). The resting staging deploy is v12 with the best-checkpoint export + SPZ-v3 encoder (`W3-W4-EVIDENCE.md` §1.2); ship the same tree.

**Pre-condition + verification probe.**
- Pre: **budget cap set (Step 2)** — non-negotiable before this deploy; Steps 4–5 done.
- Verify (behavior — the §7 W1 lesson: unit tests miss the FastAPI wiring, so probe the live endpoint):
  ```sh
  # spawn endpoint = https://kodeman-patina-production--patina-scan-spawn.modal.run
  curl -s <spawn-url>                              # → 401 missing_bearer (NOT 422 — 422 = the annotation bug)
  curl -s -H 'Authorization: Bearer wrong' <spawn-url>   # → 401 bad_token
  curl -s -H 'Authorization: Bearer <SCAN_MODAL_AUTH_TOKEN>' -d '{}' <spawn-url>  # → 400 missing_fields:...
  ```
  A **422** here is the `d6071a37` unannotated-`Request` regression — do not proceed on a 422.

**Rollback.** Redeploy the prior-good app version, or `modal app stop patina-scan --env patina-production` (halts all dispatch targets; the dispatcher's spawns then fail and tasks retry via lease — no corruption).

**Hard rails.**
- **A live post-deploy probe is a standing step, not optional** — the spawn wiring cannot be unit-tested without FastAPI and has shipped a dead-on-arrival 422 before (`W1-EVIDENCE.md` §7).
- Budget cap confirmed set (Step 2) before this deploy allocates any GPU.

---

### Step 7 — Prod `dispatch-scan-modal` edge function + secrets

**Ownership:** MINE (scan-specific).

**Mechanism.**
```sh
# from the prod-linked worktree
supabase functions deploy dispatch-scan-modal          # verify_jwt = true (config.toml:508)
supabase secrets set MODAL_SPAWN_URL=<prod spawn url> --project-ref bkvcixdmuyejfzcijpdg
supabase secrets set MODAL_BEARER_TOKEN=<SCAN_MODAL_AUTH_TOKEN> --project-ref bkvcixdmuyejfzcijpdg
```
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are platform-injected on prod. Secrets are read at invocation — no redeploy needed after setting them (`W1-EVIDENCE.md` §1).

**Pre-condition + verification probe.**
- Pre: Step 6 (spawn URL + bearer exist).
- Verify (behavior): the cron `dispatch-scan-modal-sweep` (activated by 00491 in Step 3) fires every 5 min. On an **empty** prod scan queue it claims 0 and is a harmless no-op. A manual invoke proves the wire without waiting:
  ```sh
  curl -X POST https://bkvcixdmuyejfzcijpdg.supabase.co/functions/v1/dispatch-scan-modal \
    -H "Authorization: Bearer <prod service_role>" -d '{}'
  # → {"claimed":0,"spawned":0,"failed":0,"deferred":0,"error":null} while queue empty
  ```
  Then walk the truth chain (`patina-prod-ops`): `net._http_response` for the real HTTP status of the sweep's POST to Modal, not just `cron.job_run_details.status='succeeded'` (which means *enqueued*, not delivered).

**Rollback.** `cron.unschedule('dispatch-scan-modal-sweep')` halts dispatch instantly (config action). The function itself can be left deployed (inert without the cron and without queued tasks) or rolled to a prior version.

**Hard rails.**
- **Anon-EXECUTE default-privilege trap on the deployed function's DB surface** — the dispatch fn is `verify_jwt=true` and invokes via `invoke_edge_function` (Vault-backed service_role). Confirm the fn is NOT publicly reachable without the bearer; the cron→edge bridge reads `service_role_key` from Vault (00258), which prod already has.
- The cron goes live at Step 3's apply; it is safe on an empty queue, but the function + Modal must be ready (Steps 6–7) before Step 8 enqueues anything.

---

### Step 8 — systemd `scan-pipeline` box → prod `agent_tasks` + `solve` dual-enqueue

**Ownership:** MINE (scan-specific).

**Mechanism.** Point the box's env (`services/scan-pipeline/scan-worker.env`, from `scan-worker.env.example`) at prod and enable the `solve`-stage dual-enqueue (the code that enqueues the Modal `scan_pipeline.verify|splat|renders` tasks alongside `drawings`). The box keeps `ingest`, `solve`, `drawings` (DELIVERY-PLAN R3):
- `SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=<prod service_role>` (first-party infra; the box's move off service_role is a **W3/originals** item, OUT of this wave — acknowledged, `storage.py` stays on service_role for now)
- `SCAN_STORAGE_BACKEND=supabase` (default — originals stay on Supabase this wave; **no** R2 shadow: `SCAN_STORAGE_SHADOW` unset)
- Restart the unit: `systemctl restart patina-scan-worker.service`; confirm via `patina-scan-worker-doctor.service`.

**Pre-condition + verification probe.**
- Pre: Steps 3, 6, 7 (so an enqueued Modal task has a live dispatcher + Modal app to consume it).
- Verify (behavior): a real prod `solve` run enqueues `scan_pipeline.verify` (and splat/renders) rows into prod `agent_tasks`; the sweep claims them; `scan_pipeline_events` gains `started`/`completed` rows written over `scan_worker` (never `service_role`). This is the Step 10 E2E.

**Rollback.** Revert the box env to its prior target (or stop the unit); disable the dual-enqueue flag. The box is a poller — stopping it stops new enqueues immediately.

**Hard rails.**
- **Budget cap (Step 2) confirmed set before this step** — this is the step that actually causes GPU spend (it enqueues the work the dispatcher spawns to L4/L40S).
- Verify the box's `SUPABASE_URL` is the prod ref before restart — the box env example already carries the prod URL, so double-check it is not a stale staging edit.

---

### Step 9 — [PEER COORDINATION GATE] edge-api-worker prod deploy, `SCAN_ROUTES=on`

**Ownership:** **PEER / SHARED — NOT a step I execute.** The `patina-edge-api` (prod) worker is the **cloudflare-phases** program's surface (it fronts `api.patina.cloud`, resting at catalog-on-Hyperdrive/100). This wave *requests and verifies* the read-route flip; the peer program owns the deploy. Treat as a coordination gate.

**The scan-route code is already on `main`, additive and flag-gated** (grep-verified, 2026-08-24): `infra/edge-api-worker/src/scan.ts` (the handler), `src/index.ts:831` (`SCAN_ROUTES=off` leaves the path **unrouted entirely** — it falls through to `not_found`), and `src/env.ts:154` (validates the read secrets only when `SCAN_ROUTES=on`). It is **additive routes, not a rewrite** — the prod worker already carries this code (deployed after the merge), so Step 9 is a **flag flip on live code**, not a code ship.

**Exact prod env I hand the peer** (names only — the secret *values* go through the secret channel, never a report):

| Key | Where | Value |
|---|---|---|
| `SCAN_ROUTES` | `wrangler.jsonc` `env.production.vars` | flip `"off"` → **`"on"`** |
| `MEDIA_UPLOADS` | `wrangler.jsonc` `env.production.vars` | **stays `"off"`** (validate-config asserts prod-off) |
| `SCAN_R2_ENDPOINT` | already committed | `https://be3aaeed18a81b5d90ee2263b62219ea.r2.cloudflarestorage.com` |
| `SCAN_R2_BUCKET` | already committed | `patina-media-artifacts-us` |
| `SCAN_R2_ACCESS_KEY_ID` | **Wrangler secret** (`--env production`) | the Step 1 read token's access-key-id |
| `SCAN_R2_SECRET_ACCESS_KEY` | **Wrangler secret** (`--env production`) | the Step 1 read token's secret |

The write pair (`SCAN_R2_WRITE_ACCESS_KEY_ID` / `SCAN_R2_WRITE_SECRET_ACCESS_KEY`) is **NOT** handed over — it belongs to the deferred upload path and `MEDIA_UPLOADS` stays off.

**Mechanism** (executed by the edge-api-worker owner, from `infra/edge-api-worker`):
```sh
npx wrangler secret put SCAN_R2_ACCESS_KEY_ID --env production      # the Step 1 read token
npx wrangler secret put SCAN_R2_SECRET_ACCESS_KEY --env production
# then edit env.production.vars.SCAN_ROUTES "off" → "on" in wrangler.jsonc  (MEDIA_UPLOADS stays "off")
npm run config:check
npm run config:check:provisioned -- production
npx wrangler deploy --env production
```
`config:check:provisioned` requires the two read secrets **only** where `SCAN_ROUTES=on`. `MEDIA_UPLOADS` stays `off` — and `validate-config` **asserts** the prod-off literal for uploads, so this edit cannot carry a write capability against a prod bucket by accident. The two read secrets must be present or the worker boots **503** `edge_api_configuration_invalid`.

**Pre-condition + verification probe.**
- Pre: Step 1 read token minted; Step 3 applied; peer program scheduled the deploy.
- **True dependency note:** Step 9's **hard** prerequisites are ONLY Step 1 (read token) + Step 3 (migrations create `media_objects`, read under caller RLS via `DB_FRESH`). It does **not** depend on Steps 4–8 (the produce side). Its placement after Step 8 is a deliberate **conservative** choice — artifacts exist before the read route opens, so Step 10's smoke has real bytes to fetch — not a hard dependency. Keep it there, but note it could parallelize with 4–8 if timing ever demands.
- **DB_FRESH prereq (resolved):** the `DB_FRESH` Hyperdrive binding is already provisioned in prod (Phase 1 — `strata-prod-fresh`, id `f19990d0…`, `edge_rls_login`, caching disabled). `SCAN_ROUTES=on` **reuses** it — no new Hyperdrive, no additional Kody GO.
- Verify (behavior) against `https://api.patina.cloud`:
  - `GET /v1/scan/room-files/<id>/artifacts/splat` with **no JWT** → **401** `{"error":"unauthorized"}` (route on, auth required — a **503** means the read-token secrets are missing; a **404** means `SCAN_ROUTES` did not flip).
  - `POST /v1/media/uploads` → **404** (uploads correctly still closed).
  - Then the authenticated leg is Step 10.

**Rollback.** **Config flip** — set `SCAN_ROUTES` back to `"off"`, `config:check`, `wrangler deploy --env production`. This is the same mechanism as the catalog rollback drilled at **~5s** on prod (MEMORY / `wrangler.jsonc` prod comment; catalog `CATALOG_SOURCE→legacy` + `HYPERDRIVE_PERCENT→0`). The scan-route flip is that same mechanism but has **not been separately timed** — time it as part of the drill. Rolling `SCAN_ROUTES` off leaves the scan surface unrouted (404) exactly as today.

**Hard rails.**
- **This is not my deploy.** Do not `wrangler deploy --env production` the edge worker from this lane; coordinate the flip with the cloudflare-phases owner. Relay the read-token secret to them via the secret channel, not a report.
- **`MEDIA_UPLOADS` stays `off`** — the write surface is deferred (§0). The reviewed edit flips `SCAN_ROUTES` only.
- The prod worker already carries the scan-route code (deployed 2026-08-18/19, after the merge) — this is a **flag flip on live code**, so the flip is the whole surface change; there is no code deploy risk beyond config.

---

### Step 10 — Prod smoke test (E2E + capability-URL real bytes)

**Ownership:** MINE (scan-specific).

**Mechanism + proof** (mirrors the staging proofs in `W1-EVIDENCE.md` §3–5 and `W2-EVIDENCE.md` §14.5). Seed or use a real prod scan owned by an identity you can authenticate as, then:

1. **Produce.** The box's `solve` dual-enqueues `scan_pipeline.verify` (+ splat + renders) → sweep claims → Modal runs. Confirm on prod:
   ```sql
   select task_type, status, attempts, last_error from public.agent_tasks
     where task_type like 'scan_pipeline.%' order by created_at desc limit 6;   -- done, attempts=1
   select e.stage, e.event, e.status, e.duration_ms from public.scan_pipeline_events e
     order by e.created_at desc limit 8;   -- verify/splat/renders started+completed
   ```
   Every `scan_pipeline_events` row written over `scan_worker` (Step 4's negative tests prove it *cannot* be service_role).
2. **Registry.** The splat + renders land as `media_objects` rows, `lifecycle_state=stored`, `access_class=authenticated_project`, with sha256 + size, `provenance='parametric'`. `room_files.artifacts.{splat,renders}.object_id` reference them.
3. **Capability URL serving REAL BYTES from prod (the headline proof).** As the scan owner's **user** JWT (never service_role), `GET https://api.patina.cloud/v1/scan/room-files/<id>/artifacts/splat` → **200** `{kind,url,expiresAt}`; fetch the presigned R2 `url`; assert the **sha256 of the received bytes equals the registry digest** and the byte count matches. This is the exact staging proof (`W2-EVIDENCE.md` §14.5: 8,767,038 bytes, sha256 match) reproduced on prod.
4. **Negative (mood-board gate).** As a **different** authenticated tenant, the same URL → identical **404** (not 403 — a 403 would confirm the row exists). Missing/invalid JWT → 401.
5. **Portal walk.** Signed into the prod designer portal as the scan owner: MESH renders, SPLAT draws/orbits, render gallery shows; console clean, no CSP violations. (Splat *quality* is the deferred programme — the proof here is that the pipeline produces and the portal *views*, not that the picture is designer-grade.)

**Pre-condition + verification probe.** Steps 1–9 complete. This step IS the verification.

**Rollback.** If the E2E fails, the containment is `cron.unschedule('dispatch-scan-modal-sweep')` + `SCAN_ROUTES→off` (Step 9 config flip) — both fast, reversible, non-destructive.

**Hard rails.**
- The capability-URL proof MUST be over a **user** JWT and MUST verify **bytes against the registry sha256** — not a 200 alone. Beware the stale-R2-read ops trap (`wrangler r2 object get --remote` served stale bytes for minutes — `W2-EVIDENCE.md` §13.5); take the verdict on bytes fetched through the capability URL, checked against the registry digest.
- `/room/[id]` takes a **scan** id, not a `rooms.id` (else PostgREST-406 → "still being drawn") — `W3-W4-EVIDENCE.md` §4.6.

---

## 4. GO / NO-GO gate list (Kody signs before each irreversible step)

| Gate | Before | Kody confirms | Reversible? |
|---|---|---|---|
| **G1** | Step 2 budget cap | Hard budget cap SET on `patina-production` | yes (delete env) |
| **G2 — the big one (multi-owner bundle)** | Step 3 migrations | `db push --dry-run --include-all` plans **exactly the 13** (scan 8 + Phase-2 00494/00495 + Phase-3 00514/00515/00516), **no 00512**, unchanged from the quoted plan; **all three owners confirm ready** (scan 8 = READY; peer 5 = their GO); worktree link = `bkvcixdmuyejfzcijpdg`; anon-EXECUTE revokes confirmed present. **Explicit sub-condition:** the cloudflare-phases owner confirms THEIR OWN direct in-session Kody GO for the Phase-2/3 five (00494/00495/00514/00515/00516) — a relayed GO does not satisfy this. So G2 = fresh dry-run (exactly 13, no 00512) + both owners ready + Rendered Room's direct Kody GO (**held**) + cloudflare-phases' direct Kody GO (**pending**) — not satisfiable until the peer relays their own direct confirm | **NO — append-only, irreversible** |
| **G3** | Step 4 role mint | `scan_worker_login` password generated out-of-band, held only as a Modal Secret | yes (drop role) |
| **G4** | Step 6 Modal app deploy | G1 cap confirmed set; spawn probe returns 401 not 422 | yes (stop app) |
| **G5** | Step 8 box → prod | This is first real GPU spend; cap confirmed; box env = prod ref | yes (stop unit) |
| **G6** | Step 9 `SCAN_ROUTES=on` | Peer edge-api-worker owner ready; read-token secrets relayed; `MEDIA_UPLOADS` stays off | **yes — config flip, ~5s drilled** |

**Step 3 (G2) is the single irreversible gate.** Everything else rolls back by config flip, role drop, unit stop, or app stop.

---

## 5. The single most dangerous / irreversible step + its rollback

**Step 3 — the combined prod migration push.** It is irreversible (append-only) and it is a **multi-owner bundle**: `--include-all` applies all **13** unapplied migrations across three programs in version order (scan 8 + Phase-2 `00494/00495` + Phase-3 `00514/00515/00516`) — it cannot be scoped to the scan lane. Mitigations, all mandatory: (a) the **G2 multi-owner gate** — the dry-run must match the quoted 13-plan exactly, **no 00512**, and **every owner confirms ready** (a single Kody GO over the bundle); (b) if any owner is not ready, a **curated cutover branch** shrinks the plan to the ready set; (c) the **scan 8 are purely additive** (new tables/RPCs/roles/crons, zero destructive ALTERs, `public`-only, no `svc_*` touch — grep-verified), so their blast radius on *existing* prod behavior is near-zero even though irreversible; (d) fast containment for a scan defect is **`cron.unschedule('dispatch-scan-modal-sweep')`** (halts the pipeline instantly, reversibly) + a forward-fix migration — never a blind down-migration.

---

## 6. Ownership split

- **MINE (I execute) — 6 steps:** 4 (roles/login), 5 (Modal secrets), 6 (Modal app), 7 (dispatch fn), 8 (box), 10 (smoke).
- **SHARED multi-owner gate — 1 step:** Step 3 (the combined `00489→00516` migration push). I own + mark READY the scan 8; the peer 5 (Phase-2 00494/00495, Phase-3 00514/00515/00516) are their owners' GO. The push itself is one command over the whole bundle on a single Kody GO — executable by whoever runs the coordinated push, not a scan-only action.
- **MINE-owned, Kody-gated dashboard sub-action — 1:** Step 1(b) — the R2 token mint (read token for the peer's worker + read+write token for our Modal) — and Step 2's **budget cap**. I prepare and verify; Kody clicks the dashboard.
- **PEER coordination gate — 2 steps:** Step 1(a) — R2 bucket creation (`patina-media-artifacts-us` + `patina-media-originals-us`) is the cloudflare-phases / Phase-2 program's surface, created by them via `wrangler r2 bucket create` under their own direct Kody GO — and Step 9 (`patina-edge-api` prod deploy + `SCAN_ROUTES=on`) is the cloudflare-phases program's surface; I hand them the env (names above) and verify, they deploy.

---

## 7. What executes first (ordered)

1. **Pre-flight** (§1) — link-verify the worktree, curate the `--include-all` plan, open the peer handshake. No mutation.
2. **Step 1** — prod R2 buckets + read token (Kody dashboard). *No DB dep; may run parallel to Step 2.*
3. **Step 2** — Modal `patina-production` env + **hard budget cap** (Kody dashboard). *Cap before any GPU dispatch.*
4. **Step 3** — combined multi-owner migration push `00489→00516` via `--include-all` (G2 gate). *Irreversible; all three owners GO; the one that must be right.*
5. **Step 4** — scan roles + `scan_worker_login` out-of-band.
6. **Step 5** — Modal prod secrets (DSN + auth + R2).
7. **Step 6** — deploy Modal app to `patina-production`.
8. **Step 7** — prod `dispatch-scan-modal` fn + secrets.
9. **Step 8** — box → prod `agent_tasks` + dual-enqueue (first real GPU spend).
10. **Step 9** — [PEER] `SCAN_ROUTES=on` on the prod edge worker.
11. **Step 10** — prod smoke: E2E + capability-URL real bytes + negative-404 + portal walk.

# Wave1 Prod Reconciliation — Operator Runbook

**Date:** 2026-08-12
**Target:** Supabase Cloud project **Strata** (`bkvcixdmuyejfzcijpdg`)
**Status:** NOT EXECUTED. This document is the apply procedure only. Prod mutations
require Kody's explicit in-session ask.

**Mechanics revision 2026-08-12 (ratified in-session):** applies now run via staged
`supabase migration up --linked` with a curated pending set — see §1.2. Per-file psql
+ `migration repair` (below and in §3/§4) is retained only as historical reference /
fallback. PITR gate removed for this session by explicit operator approval; the §2
snapshot (saved in `docs/ops/wave1-apply-2026-08-12/`) is the rollback reference.

---

## 0. What this reconciles

Two ledgers drifted apart:

- **Strata's ledger has FF&E `00433`–`00445` applied out-of-band on 2026-08-10**, with
  no source file on `main`. Those thirteen files have now been materialized into
  `supabase/migrations/` from `ffe-ga/integration`, each carrying a two-line
  provenance header. **They are already applied on prod — do not re-run them.**
- **The wave1 workflow stack was authored at `00434`–`00445`**, colliding with the
  FF&E block. It has been renumbered to **`00460`–`00472`** and is **unapplied on
  prod**. This runbook applies it.

### Renumber map

| Was | Now | Slug |
| --- | --- | --- |
| 00433 | **00460** | `waitlist_sms_consent` |
| 00434 | **00461** | `canonical_workflow_spine` |
| 00435 | **00462** | `workflow_privacy_authority` |
| 00436 | **00463** | `project_approval_authority_evidence` |
| 00437 | **00464** | `project_approval_lifecycle` |
| 00438 | **00465** | `project_approval_notification_traceability` |
| 00439 | **00466** | `project_approval_notification_requeue` |
| 00440 | **00467** | `stage2_client_access_repair` |
| 00441 | **00468** | `stage2_option_frozen_authority` |
| 00442 | **00469** | `project_contextual_handoffs` |
| 00443 | **00470** | `site_request_awaiting_consent_handoff` |
| 00444 | **00471** | `site_request_authority_action_detail` — **HELD, do not apply** |
| 00445 | **00472** | `site_binder_exact_studio_privacy` |

Migration numbers in `docs/design/workflow-alignment/wave1-engineering-review.md`
and `docs/design/workflow-alignment/HANDOFF.md` predate this renumber; both carry a
dated 2026-08-12 erratum block pointing here.

### 0.1 Rails — how this runbook reaches prod

There is no stored prod database password on this machine, and raw `psql` has never
been the way this project touches Strata. Everything below runs on three rails:

1. **Apply = `supabase db push`** (Supabase CLI v2.72.7, already `--linked` to
   `bkvcixdmuyejfzcijpdg`). The CLI authenticates with the access token in the macOS
   keychain (service **"Supabase CLI"**) — no password prompt, no connection string.
   This is the rail that pushed `00458` on 2026-08-12. Useful flags: `--dry-run`,
   `--include-all`, `--linked` (default true), `-p/--password`, `--db-url`.
2. **Ad-hoc SQL = Dashboard SQL Editor, or a Claude session's Supabase MCP
   `execute_sql`.** The CLI has **no** ad-hoc query command, so every SQL block in
   this runbook (§2 snapshot, §3 ledger assertions, §5 post-apply checks, §6
   `COMMENT`, §7 reader-loss query) runs one of these two ways:
   - **Preferred:** Supabase Dashboard → SQL Editor. It executes as `postgres`, which
     is sufficient privilege for every query here.
   - **Alternative:** the Supabase MCP `execute_sql` tool from a Claude Code session —
     same access-token rail, same project, convenient for capturing output into a
     transcript.
3. **Raw `psql` = explicit fallback only.** If both rails above are unavailable:

   ```
   postgresql://postgres.bkvcixdmuyejfzcijpdg@aws-1-us-east-1.pooler.supabase.com:5432/postgres
   ```

   That is the **session** pooler — port **5432**, never 6543 (transaction pooler;
   it will not carry `\i`, session-level `SET LOCAL`, or an explicit multi-statement
   transaction reliably). The password is **not stored on this machine**; retrieve it
   from Dashboard → Project Settings → Database when the fallback is actually needed.

---

## 1. Apply sequence

Apply **in order**, one file at a time, verifying between each. Twelve of the
thirteen apply; **position 12 (`00471`) is HELD** per the 2026-08-12 ruling and is
skipped — it stays unapplied until the Field gate in §7 clears.

### 1.0 One-file-at-a-time mechanics (quarantine directory)

`supabase db push` applies **every** pending file in `supabase/migrations/` in one
run. It has no "apply just this one" flag. To get the one-at-a-time discipline this
runbook requires, quarantine the whole pending set first and re-admit files one by
one.

**Setup — before applying anything:**

```bash
mkdir -p supabase/migrations-held
git mv supabase/migrations/0046*.sql \
       supabase/migrations/0047[0-2]_*.sql \
       supabase/migrations-held/
ls supabase/migrations-held/     # expect exactly 00460 … 00472 (13 files)
```

**Then, for each file in the §1 order:**

```bash
# 1. Re-admit exactly one file.
git mv supabase/migrations-held/<NNNNN>_<slug>.sql supabase/migrations/

# 2. Confirm the CLI sees exactly that one pending file — and nothing else.
supabase db push --dry-run

# 3. Apply it.
supabase db push

# 4. Run that step's verification (§3 after 00460, §4 before/§5.3 after 00462,
#    §5 checks as they become relevant) BEFORE re-admitting the next file.
```

If `--dry-run` lists more than the single file you just moved, **stop** — something
else is pending and the one-at-a-time discipline is already broken.

`00471` is never re-admitted during this apply: it stays in
`supabase/migrations-held/` (see §6/§7). `00472` is re-admitted last, after the §1.1
grep check passes.

> ⛔ **Never use `supabase migration repair --status applied` to "skip" 00471.** That
> writes a ledger row claiming 00471 ran when it did not — a lie in the ledger that a
> later operator, or a `db pull`, will act on. The hold is recorded in prose (§6) and
> enforced by the file's absence from `supabase/migrations/`, never by a forged
> ledger entry.

| # | Migration | Apply? | Notes |
| --- | --- | --- | --- |
| 1 | `00460_waitlist_sms_consent` | YES | Standalone; no wave1 dependency. |
| 2 | `00461_canonical_workflow_spine` | YES | Adds `get_project_workflow`, phase workflow metadata + guard trigger, column-level grant narrowing on `proposal_phases`. |
| 3 | `00462_workflow_privacy_authority` | YES | **Highest-risk file. Take PITR first — see §4.** Carries the three 2026-08-12 rulings. |
| 4 | `00463_project_approval_authority_evidence` | YES | Stage-2 authority + immutable evidence tables. |
| 5 | `00464_project_approval_lifecycle` | YES | Publish/respond/withdraw/supersede routing. Depends on 00463. |
| 6 | `00465_project_approval_notification_traceability` | YES | Depends on the 00463 guard. |
| 7 | `00466_project_approval_notification_requeue` | YES | Depends on 00465's checked service RPC. |
| 8 | `00467_stage2_client_access_repair` | YES | Adds `get_project_decision_review`, `list_my_project_decision_reviews`. |
| 9 | `00468_stage2_option_frozen_authority` | YES | Removes the installed studio option read policy. |
| 10 | `00469_project_contextual_handoffs` | YES | Adds `get_project_contextual_handoffs`. |
| 11 | `00470_site_request_awaiting_consent_handoff` | YES | Restates the complete 00469 body + awaiting-consent delta. |
| 12 | `00471_site_request_authority_action_detail` | **NO — HELD** | Narrows Site Request readers and makes `site_request_close` completed-only. Gated on the Field release carrying `cbe88574`. **Record the ledger gap (§6).** |
| 13 | `00472_site_binder_exact_studio_privacy` | YES | **Read §1.1 before applying — it has a stated 00471 lineage.** |

### 1.1 The 00472-after-held-00471 hazard

`00472`'s header states *"00471 narrowed the four …"*. Applying 00472 while 00471 is
held means 00472 lands on a base its lineage comment does not describe. Before
applying 00472, confirm it does not reference an object that only 00471 creates:

```bash
# Run this while 00472 is still quarantined, before re-admitting it (§1.0).
grep -nE 'get_site_request_action_detail|site_request_close' \
  supabase/migrations-held/00472_site_binder_exact_studio_privacy.sql
```

If that returns nothing, 00472 is independent of 00471 and applies safely. **If it
returns a hit, HOLD 00472 as well** and record both gaps. Do not "fix" 00472 to
compensate — fix forward later, after 00471 lands.

### 1.2 CLI staged apply (ratified mechanics)

Per the 2026-08-12 ruling, the mechanics in §1.0 (per-file `supabase db push` +
`migration repair`) are superseded for this session by a staged
`supabase migration up --linked` apply. The renumbered wave1 files (00460–00472) do
not exist in the remote ledger, so the same-number-drift hazard that motivated the
"NEVER db push" caution behind the older mechanics does not apply to this stack.
`migration up --linked` (CLI v2.72.7) applies the pending set in version order, one
transaction per file, stops on first error, uses the CLI's keychain-stored
credentials (no DB password handling), and records COMPLETE ledger rows (version,
name, statements) — eliminating the per-file `migration repair` step and the §3
repair-incompleteness concern entirely.

**00471 stays HELD** by moving its file to `supabase/migrations-held/` for the
duration of the session and restoring it afterward. It remains tracked in git; the
move is a working-tree hold only, not a commit-time deletion.

**Stage 1 — 00460–00461 only.** Hold everything else out of
`supabase/migrations/` (00462–00470 and 00472, in addition to 00471) so only 00460
and 00461 are present, then:

```bash
supabase migration list --linked   # confirm exactly 00460, 00461 are pending
supabase migration up --linked --yes
```

Verify: run the 00460/00461 object probes plus the ledger-completeness assertion
below.

**Stage 2 — reintroduce 00462 alone.**

```bash
supabase migration list --linked   # confirm exactly 00462 is pending
supabase migration up --linked --yes
```

Run the §5.3 posture checks immediately after this stage.

**Stage 3 — reintroduce 00463–00470 and 00472.**

```bash
supabase migration list --linked   # confirm exactly 00463-00470, 00472 are pending
supabase migration up --linked --yes
```

Run the full §5 probe suite after this stage.

**Before every stage:** `supabase migration list --linked` must show exactly the
intended pending set for that stage — nothing more, nothing less. **After every
stage:** assert the new ledger rows have `name` and `statements` populated:

```sql
SELECT version, name, (statements IS NOT NULL) AS has_statements
FROM supabase_migrations.schema_migrations
WHERE version >= '00460'
ORDER BY version;
```

**Note.** `migration up --linked` does not run seeds and applies one transaction per
file, stopping on first error — a failed file leaves prior files applied and
correctly recorded; there is no partial-file corruption to reconcile.

---

## 2. Pre-apply snapshot

Capture the current prod posture **before touching anything**. Run these on a query
rail from §0.1 — Dashboard SQL Editor (preferred) or MCP `execute_sql`. Save the
output somewhere off the database; it is the only rollback reference for the privacy
changes.

```sql
-- 2.1 Function bodies for everything wave1 redefines.
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       md5(p.prosrc)                             AS body_md5,
       p.prosrc
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'create_board_share','resolve_board_share','build_board_share_payload',
    'apply_client_decision','advance_project_phase','expire_client_decision',
    'expire_due_client_decisions','extend_and_reopen_client_decision',
    'reopen_client_decision','publish_client_decision','mark_client_decision_viewed',
    'site_request_close','get_client_project_selections',
    'place_product_in_project','place_product_in_project_v2'
  )
ORDER BY p.proname;

-- 2.2 Every public-schema policy (wave1 drops and recreates a number of these).
SELECT schemaname, tablename, policyname, cmd, roles::text, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 2.3 storage.objects policies — the FF&E posture that MUST survive.
SELECT policyname, cmd, roles::text, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;

-- 2.4 Bucket visibility.
SELECT id, name, public FROM storage.buckets ORDER BY id;

-- 2.5 Board-share execute grants.
SELECT p.proname, r.rolname,
       has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p
CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) AS r(rolname)
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('create_board_share','resolve_board_share')
ORDER BY p.proname, r.rolname;
```

---

## 3. Post-first-repair ledger assertion

Superseded by §1.2 for this session — `migration up --linked` writes complete rows;
the assertion below still runs after stage 1 as a check, but the repair/backfill
fallback should not be needed.

The out-of-band FF&E applies may have left `supabase_migrations.schema_migrations`
rows with a NULL `name` or NULL `statements`. `supabase db push` tolerates that on
read but the repair path does not. **After the first successful apply (`00460`),
assert the ledger row is complete** (query rail per §0.1)**:**

```sql
SELECT version, name, (statements IS NOT NULL) AS has_statements
FROM supabase_migrations.schema_migrations
WHERE version = '00460';
```

Expect one row with `name = 'waitlist_sms_consent'` and `has_statements = true`.

**Backfill fallback** — only if `name` or `statements` came back NULL:

```sql
UPDATE supabase_migrations.schema_migrations
SET name = 'waitlist_sms_consent'
WHERE version = '00460' AND name IS NULL;
```

`statements` cannot be honestly reconstructed after the fact. If it is NULL, leave
it NULL, record the gap, and note that `supabase migration repair` will be needed
before any future `db pull`. Do not fabricate a statements array.

While you are here, audit the FF&E block the same way — those are the rows most
likely to be malformed:

```sql
SELECT version, name, (statements IS NOT NULL) AS has_statements
FROM supabase_migrations.schema_migrations
WHERE version BETWEEN '00433' AND '00445'
ORDER BY version;
```

Expect **thirteen** rows, all present. If any version in `00433`–`00445` is
**missing**, STOP — the materialized file for it is not actually applied on prod and
the "do not re-run" premise is wrong for that file.

---

## 4. PITR before 00462

`00462_workflow_privacy_authority` rewrites RLS across boards, documents, commercial
signatures and product configurations, and it changes storage posture. It is the
one file in this stack whose blast radius is not cleanly reversible by a follow-up
migration.

2026-08-12: PITR gate removed for this session by explicit operator approval;
snapshot-only rollback accepted.

**Before applying 00462:**

1. Confirm PITR is enabled on Strata and note the current wall-clock timestamp
   (UTC) as the restore target.
2. Confirm the §2 snapshot output is saved somewhere off the database.
3. Only then apply.

**Explicit-transaction note.** `supabase db push` wraps each migration file in a
transaction, but 00462 contains `UPDATE storage.buckets` and DDL against
`storage.objects` (a trigger). If any statement in the file fails, the whole file
rolls back — which is the desired behavior. Do **not** split 00462 into pieces to
"get past" a failure: a partially-applied 00462 leaves boards readable under a
policy set that matches neither the old nor the new posture. If 00462 fails, fix the
file, then re-run it whole.

**Primary apply stays `supabase db push`** (per §1.0): re-admit only
`00462_workflow_privacy_authority.sql`, `--dry-run` to confirm it is the sole pending
file, then push. The file lands whole or not at all.

**Checkpointing.** `db push` offers no inside-the-transaction checkpoint — by the
time you can run a query, the file has already committed. So run the **§5.3 posture
checks immediately after the push** (Dashboard SQL Editor / MCP `execute_sql`), and
treat them as the gate. If a check fails, the response is a **PITR restore to the
timestamp noted in step 1** — not `ROLLBACK`, which is no longer available. This is
why step 1 is non-negotiable.

**FALLBACK — raw `psql` only.** If, and only if, you are applying by hand outside the
CLI, you get a real in-transaction checkpoint. Connect on the §0.1 session-pooler URI
(port 5432, password from Dashboard → Project Settings → Database — it is not stored
on this machine):

```sql
BEGIN;
\i supabase/migrations/00462_workflow_privacy_authority.sql
-- run the §5.3 posture checks here, inside the transaction
COMMIT;  -- or ROLLBACK if any check fails
```

Note that a hand-applied file does **not** write a `supabase_migrations` ledger row;
if you take this path you own reconciling the ledger afterward — and per §1.0, never
by forging one with `migration repair`.

---

## 5. Post-apply verification

All queries in this section run on a §0.1 query rail — Dashboard SQL Editor
(preferred) or MCP `execute_sql`.

### 5.1 Object existence — RPC expectation

The wave1 stack introduces **14 client-callable RPCs** (`EXECUTE` granted to
`authenticated`) plus one service-only RPC. With **00471 held, expect 13 of the 14**;
`get_site_request_action_detail` must be **absent**.

> **Discrepancy to reconcile.** The ratified plan states a "10-RPC expectation". The
> count derived from the migration files and confirmed against a full local replay is
> **14 client-callable (13 with 00471 held)**. The list below is the verified one.
> Confirm the intended number with the plan author before treating a count mismatch
> as a failure.

```sql
SELECT expected.proname,
       (p.oid IS NOT NULL)                                        AS exists,
       has_function_privilege('authenticated', p.oid, 'EXECUTE')  AS auth_exec
FROM (VALUES
  ('get_project_workflow'),
  ('set_project_decision_authority'),
  ('create_project_approval_decision'),
  ('confirm_project_decision_review'),
  ('is_project_approval_reviewer'),
  ('get_project_decision_reviews'),
  ('respond_project_approval'),
  ('withdraw_project_approval_decision'),
  ('supersede_project_approval_decision'),
  ('get_project_approval_artifact_candidates'),
  ('get_project_decision_review'),
  ('list_my_project_decision_reviews'),
  ('get_project_contextual_handoffs')
) AS expected(proname)
LEFT JOIN pg_proc p
  ON p.proname = expected.proname
 AND p.pronamespace = 'public'::regnamespace
ORDER BY expected.proname;
-- Expect 13 rows, all exists = t, all auth_exec = t.

-- Service-only RPC.
SELECT has_function_privilege('service_role',
         'public.stamp_project_approval_reminder_delivery'::regproc, 'EXECUTE') AS svc_exec,
       has_function_privilege('authenticated',
         'public.stamp_project_approval_reminder_delivery'::regproc, 'EXECUTE') AS auth_exec;
-- Expect svc_exec = t, auth_exec = f.

-- HELD: must NOT exist while 00471 is held.
SELECT count(*) AS held_rpc_present
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname = 'get_site_request_action_detail';
-- Expect 0.
```

### 5.2 FF&E delegation chain

The FF&E block's hardened commands sit behind compatibility wrappers. Confirm the
wrapper still delegates rather than having been overwritten by a wave1 redefinition:

```sql
SELECT p.proname,
       p.prosrc LIKE '%place_product_in_project_v2%' AS delegates_to_v2
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('place_product_in_project',
                    'place_product_in_project_v2',
                    'get_client_project_selections')
ORDER BY p.proname;
-- Expect all three present; place_product_in_project delegates_to_v2 = t.
```

> The plan names a "3-function delegation chain". The three FF&E reader/command
> entry points above are the verified set; confirm the exact intended trio with the
> plan author if the naming matters for sign-off.

Also confirm no wave1 file clobbered an FF&E function body — compare against the
§2.1 `body_md5` snapshot. Any FF&E function whose md5 changed after a wave1 apply is
a regression, not an improvement.

### 5.3 Privacy posture — must match the 2026-08-12 rulings

```sql
-- Ruling 1: FF&E storage posture retained. The five wave1 re-openings must be ABSENT
-- and the FF&E policies must be PRESENT.
SELECT policyname, cmd, roles::text
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname IN (
    'Proposal mood boards are publicly readable',
    'Authorized actors can read proposal mood board media',
    'Designers can replace their proposal mood boards',
    'Designers can delete their proposal mood boards',
    'Designers can replace project board images',
    'Designers can delete project board images'
  );
-- Expect 0 rows.

SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'proposal_mood_boards_proposal_%'
ORDER BY policyname;
-- Expect the 4 FF&E policies (read/insert/update/delete) still present.

-- Bucket stays private.
SELECT public FROM storage.buckets WHERE id = 'proposal-mood-boards';
-- Expect f.

-- Immutability guard survived.
SELECT tgname FROM pg_trigger
WHERE NOT tgisinternal AND tgrelid = 'storage.objects'::regclass
  AND tgname = 'a_guard_released_board_storage_object_trg';
-- Expect 1 row.

-- Ruling 2: project-board token sharing stays CLOSED.
SELECT proname, prosrc LIKE '%project_id IS NULL%' AS gate_closed
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('create_board_share','resolve_board_share')
ORDER BY proname;
-- Expect gate_closed = t for both.

-- Ruling 3: anon can resolve share links; anon can NOT create them.
SELECT has_function_privilege('anon', 'public.resolve_board_share(text)'::regprocedure, 'EXECUTE') AS anon_resolve,
       has_function_privilege('anon', 'public.create_board_share(uuid,text,timestamptz)'::regprocedure, 'EXECUTE') AS anon_create;
-- Expect anon_resolve = t, anon_create = f.
```

### 5.4 Trigger order

Several wave1 guards depend on firing **before** the installed triggers. Postgres
fires per-row triggers in name order, which is why the guards are prefixed `a_`.
List and eyeball:

```sql
SELECT c.relname AS table_name, t.tgname,
       CASE t.tgtype & 2 WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND n.nspname IN ('public','storage')
  AND (t.tgname LIKE 'a\_guard%' OR c.relname IN (
        'proposal_boards','proposal_board_items','document_shares',
        'client_decisions','client_decision_options','project_phases','objects'))
ORDER BY c.relname, t.tgname;
```

Every `a_guard*` trigger must sort **first** within its table and be `BEFORE`.

---

## 6. Recording the 00471 ledger gap

With 00471 held, the prod ledger will read `… 00470, 00472`. That gap is
intentional and must be recorded so a later operator does not "repair" it by
applying 00471 blind.

### 6.1 The file stays quarantined (this is the real enforcement)

`supabase db push` applies **everything** pending. The moment
`00471_site_request_authority_action_detail.sql` sits in `supabase/migrations/`, the
very next push by anyone — for an unrelated migration — applies it and silently
breaks the gate.

So the hold is enforced by file location, not by discipline:

With the CLI staged apply, the held 00471 also never enters the pending set (its
file sits in `supabase/migrations-held/` during the session).

- **`00471` remains in `supabase/migrations-held/`.** Commit it there. Future pushes
  are then safe by construction.
- Drop a one-line `supabase/migrations-held/README.md` explaining why, e.g.:

  ```bash
  printf '%s\n' 'Migrations quarantined from `supabase db push`. 00471 is HELD — see docs/ops/wave1-prod-reconciliation-plan.md §7.' \
    > supabase/migrations-held/README.md
  ```

- When the §7 gate clears: `git mv supabase/migrations-held/00471_*.sql
  supabase/migrations/`, `supabase db push --dry-run` to confirm it is the only
  pending file, then `supabase db push`.

### 6.2 Schema comment

Also record the hold in the database itself, via the §0.1 query rail (Dashboard SQL
Editor or MCP `execute_sql`):

```sql
COMMENT ON SCHEMA public IS
  'Wave1 reconciliation 2026-08-12: migration 00471 '
  '(site_request_authority_action_detail) is intentionally HELD — gated on a '
  'Patina Field release carrying cbe88574. See '
  'docs/ops/wave1-prod-reconciliation-plan.md §7. Do not apply without clearing '
  'that gate.';
```

Also note it in the deploy log and in `docs/design/workflow-alignment/HANDOFF.md §0`.

---

## 7. The 00471 gate

**Documented gating ruling** (`HANDOFF.md`, line 28), verbatim in substance:

> the renumbered site-request privacy migration (**00471**, `site_request_close`
> completed-only) must NOT deploy to Strata until a Patina Field release containing
> `cbe88574` (close gated to completed; merged at `a20ebf4f`) ships.

### Checklist — all four must be true before applying 00471

> These operationalize the single documented ruling above. Confirm the intended
> phrasing with the plan author if a formal four-condition list exists elsewhere.

1. **Build contains the commit.** A Patina Field build containing `cbe88574` exists
   and is archived. Verify: `git merge-base --is-ancestor cbe88574 <release-tag>`.
2. **Release is shipped, not just built.** That build is live to Field users
   (TestFlight/App Store as applicable), not sitting unreleased.
3. **Installed base has moved.** Field clients still running a pre-`cbe88574` build
   call `site_request_close` on non-completed requests; after 00471 those calls start
   failing. Confirm adoption is high enough — or that the remaining old-build callers
   are acceptable — before applying.
4. **Reader loss is zero (or accepted).** The query below returns 0, or Kody has
   explicitly accepted the listed losses.

### Reader-loss count query

00471 narrows the Site Request designer-read predicate from `is_studio_comember`
(any-organization co-member, installed by 00374) to `is_design_studio_comember`
(active design-studio authority). This counts the readers who lose access:

```sql
-- Rows currently visible under the OLD predicate but NOT under the NEW one,
-- per authenticated user. Run as a superuser/service_role session.
WITH candidate_readers AS (
  SELECT DISTINCT u.id AS user_id
  FROM auth.users u
),
loss AS (
  SELECT r.user_id,
         sr.id AS site_request_id,
         p.designer_id
  FROM candidate_readers r
  CROSS JOIN public.site_requests sr
  JOIN public.projects p ON p.id = sr.project_id
  WHERE public.is_studio_comember(p.designer_id)          -- old: visible
    AND NOT public.is_design_studio_comember(p.designer_id) -- new: not visible
)
SELECT count(*) AS rows_losing_readers,
       count(DISTINCT user_id) AS users_losing_access,
       count(DISTINCT site_request_id) AS site_requests_affected
FROM loss;
-- Expect 0. Anything above 0 needs Kody's explicit acceptance before 00471 applies.
```

> Run this on a §0.1 query rail — Dashboard SQL Editor (preferred) or MCP
> `execute_sql`. Both execute as `postgres`, which clears the privilege bar.
>
> Both predicates read `auth.uid()` internally, so the query as written cannot
> evaluate them per-user in a single pass. Either evaluate per-user by setting the
> claim (`SET LOCAL request.jwt.claims = ...`) once per user and re-running the
> `loss` CTE, or — simpler on these rails — rewrite the two predicates against the
> underlying membership tables so the whole thing runs as one set-based query. The
> shape above documents the intent, not the literal statement to paste.

---

## 8. Final gate — local replay + e2e

The definitive pre-prod gate is a full local replay, not a prod probe.

```bash
pnpm supabase:start
pnpm supabase:reset      # replays 00001 -> 00472 + all seeds
```

> ⚠ **After the §6.1 quarantine, local replay excludes 00471.** `supabase db reset`
> replays only what is in `supabase/migrations/`, so once 00471 is committed to
> `supabase/migrations-held/` a fresh local reset covers 00001→00472 **minus 00471** —
> local and prod stay deliberately in step. To exercise 00471 locally, see §8.1.

> ⚠ **Check `.env.local` first.** `apps/*/.env.local` has pointed at Strata **prod**
> before. Before any destructive local action confirm every portal's
> `NEXT_PUBLIC_SUPABASE_URL` reads `http://127.0.0.1:54321` — not a
> `*.supabase.co` host. A reset run against a prod-pointed environment is
> unrecoverable.

```bash
grep -r NEXT_PUBLIC_SUPABASE_URL apps/*/.env.local
```

Then run the gate-ceremony e2e (the signature/authorization ceremony suite) against
the freshly reset local stack. A green replay plus a green ceremony run is the merge
and deploy bar. Note that **no CI runs any of this** — local verification is the only
verification.

**Replay status as of 2026-08-12** (historical record — this run predates the §6.1
quarantine, when 00471 was still in `supabase/migrations/`; it stands as written and
is not reproducible verbatim afterward)**:** `supabase db reset` completed clean on the
reconciliation branch — 00001→00472 including all thirteen materialized FF&E files
and the edited 00462, zero errors, all seeds applied. The §5.3 posture checks were
run against that reset database and all passed.

### 8.1 Contract test inventory

These are the wave1 contract tests, renumbered alongside their migrations. Run each
against the freshly reset local stack through the same-session SQL-test runner; a
clean run ends in `ROLLBACK` with no raised assertion.

```bash
scripts/run-supabase-sql-test.sh <file>
```

| Migration | Test file |
| --- | --- |
| 00461 | `supabase/tests/workflow/canonical_workflow_spine_test.sql` |
| 00462 | `supabase/tests/workflow/board_privacy_contract_test.sql` |
| 00462 | `supabase/tests/workflow/commercial_privacy_contract_test.sql` |
| 00462 | `supabase/tests/workflow/configuration_privacy_contract_test.sql` |
| 00462 | `supabase/tests/workflow/storage_privacy_contract_test.ts` (Deno/TS, not psql) |
| 00463 | `supabase/tests/workflow/approval_authority/00463_authority_evidence_contract_test.sql` |
| 00464 | `supabase/tests/workflow/approval_authority/00464_lifecycle_compatibility_contract_test.sql` |
| 00465 | `supabase/tests/workflow/approval_authority/00465_notification_traceability_contract_test.sql` |
| 00467 | `supabase/tests/workflow/approval_authority/00467_client_access_contract_test.sql` |
| 00468 | `supabase/tests/workflow/approval_authority/00468_stage2_option_privacy_contract_test.sql` |
| 00469 | `supabase/tests/workflow/00469_project_contextual_handoffs_contract_test.sql` |
| 00470 | `supabase/tests/workflow/00470_site_request_awaiting_consent_handoff_contract_test.sql` |
| **00471** | `supabase/tests/site_requests/00471_authority_and_action_detail_test.sql` — **covers the HELD migration.** Passes locally (where 00471 is applied); it will **fail against prod** while 00471 is held. Do not treat that failure as a regression. |
| 00472 | `supabase/tests/site_requests/00472_binder_exact_studio_privacy_test.sql` — asserts the 00471-exact upstream policy spine, so it also depends on 00471 being applied. |

> ⚠ **00472's test depends on 00471.** Its line-56 assertion checks the *"00471 exact
> upstream Site Request policy spine"*. The **migration** 00472 is independent of
> 00471 (verified — see §1.1), but its **contract test** is not. With 00471 held on
> prod, expect the 00472 test to fail there while passing locally. Both tests were
> verified passing against the local reset stack on 2026-08-12.

> ⚠ **After the §6.1 quarantine, both 00471 tests fail locally too.** The two rows
> above say "passes locally (where 00471 is applied)" — that stops being true once
> 00471 lives in `supabase/migrations-held/`, because a fresh `pnpm supabase:reset`
> no longer applies it. **This failure is expected, not a regression.** To exercise
> either test locally while the hold stands:
>
> ```bash
> cp supabase/migrations-held/00471_site_request_authority_action_detail.sql \
>    supabase/migrations/          # cp, NOT git mv — the held file must stay put
> pnpm supabase:reset
> # run the 00471 / 00472 tests
> rm supabase/migrations/00471_site_request_authority_action_detail.sql
> ```
>
> Delete the copy before committing or pushing anything. A stray 00471 in
> `supabase/migrations/` re-arms the exact hazard §6.1 exists to prevent — the next
> `supabase db push` would apply it to prod.

`supabase/tests/workflow/approval_authority/README.md` carries the detailed
assertion matrix for the Stage-2 tests and has been renumbered to match.

---

## 9. E2 desilencing (post-apply, portal side)

Six React Query hooks were silenced while the wave1 schema was absent from prod.
After the apply lands, remove `meta: { errorSurface: 'silent' }` and the
`// TODO(wave1-reconciliation)` comment from:

| # | File | Hook |
| --- | --- | --- |
| 1 | `packages/supabase/src/hooks/use-project-approvals.ts` | `useProjectApprovals` |
| 2 | `packages/supabase/src/hooks/use-project-approvals.ts` | `useProjectApprovalArtifactCandidates` |
| 3 | `packages/supabase/src/hooks/use-project-approvals.ts` | `useProjectApprovalByDecision` |
| 4 | `packages/supabase/src/hooks/use-project-approvals.ts` | `useMyProjectApprovalReviews` |
| 5 | `packages/supabase/src/hooks/use-project-approvals.ts` | `useProjectDecisionAuthority` |
| 6 | `packages/supabase/src/hooks/use-project-contextual-handoffs.ts` | `useProjectContextualHandoffs` |

All six back RPCs that **do** land in this apply, so all six desilence.

### Exception — recorded

The plan directs keeping the silence on the `get_site_request_action_detail`
call-site while 00471 is held. **That call-site is not currently silenced.**
`useSiteRequestActionDetail`
(`packages/supabase/src/hooks/use-project-contextual-handoffs.ts:688`) has no
`meta.errorSurface` and rethrows on error (`if (error) throw error`).

Consequence: with 00471 held, `get_site_request_action_detail` will not exist on
prod, and this hook will surface a hard error to any user who opens a Site Request
action detail. **Before or with the apply, one of the following is required:**

- add `meta: { errorSurface: 'silent' }` + a `TODO(wave1-reconciliation)` marker to
  `useSiteRequestActionDetail`, matching the other six; **or**
- gate the calling UI off while 00471 is held.

This is a real gap between the plan's assumption and the code. It needs a decision
before deploy, not after.

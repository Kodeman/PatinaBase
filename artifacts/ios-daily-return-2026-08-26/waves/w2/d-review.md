# W2 · lane D backend review — 00537 + 00538 (adversarial, separate context)

Reviewer: read-only. Sources: `git -C .codex/worktrees/agent-dr-w2-d diff/log main...HEAD`,
`waves/w2/{steward,d-tasks,d-notes}.md`, `waves/w2/{r1,r3}-notes.md`, the implementer's report,
`build-plan.md` §W2, `rulings-2026-08-27.md` R1/Q4/Q7, `build-plan-critique.md` M4, and the live
migration/test/schema content (`supabase/migrations/00013`, `00021`, `00040`, `00054`, `00101`,
`00183`, `00146`, `00335`, `00041`, `00536`, and every table named in `v_owned`).

Scope note: I did not run `supabase db reset` / `run-sql-tests.sh` / `deno test` myself (out of scope
for a read-only diff review, and lane D holds exclusive ownership of the local DB this wave). The
counts below are verified against the diff and schema, not independently re-executed — flagged as a
review limitation, not a defect.

Commits reviewed: `75b7e4c21` (00537), `5aa5e517b` (00538 + seed regen), `95eca5c22` (delete-account
soft delete), `983c066a3` (types regen). All four confirmed on `daily-return/w2-d`, 9 files, 822/−131,
base `e9da02569` (matches `git log --oneline main..HEAD` and `steward.md` §1/§2 exactly).

---

## Findings

### D-1 — MAJOR, CONFIRMED — a retry of `purge_client_account` silently overwrites the audit trail of what the first call actually deleted

**File:** `supabase/migrations/00538_client_account_anonymize.sql`, the journal step (§4 of the
function body, roughly lines 200–230 of the new file).

**The defect.** `v_deleted` is a local variable, re-initialized to `'{}'::jsonb` on every invocation
of `purge_client_account`. On a **second** call for the same `p_user_id` — which the function
explicitly supports and the migration's own commit message advertises ("reusing an open
`client_account_purges` row so a retry does not read as a second interrupted closure") — every row
the first call deleted is already gone, so the second pass's `DELETE ... WHERE <col> = p_user_id`
loop finds `ROW_COUNT = 0` for every table, and `v_deleted` stays effectively empty (no keys are added
unless `v_rows > 0`). The function then does:

```sql
ELSE
  UPDATE public.client_account_purges
     SET detached = jsonb_build_object(
           'tombstoned_profile', to_jsonb(p_user_id),
           'deleted',            v_deleted,          -- now empty
           'threads_deleted',    to_jsonb(v_threads)) -- now empty
   WHERE id = v_purge;
```

This **overwrites** `detached` rather than merging into it, so the real counts from the first,
successful sweep — the only record of what was actually deleted — are permanently discarded and
replaced with an empty/near-empty object.

**Why this matters, concretely.** This is not an edge case nobody would hit: it is the *exact* path
the code was built to expect. `delete-account/handler.ts`'s own comment: *"If (4) fails, the
anonymization has ALREADY COMMITTED and the login is still live... That state is recoverable only
because step 3 journalled it: `client_account_purges` holds the row with `auth_deleted_at` NULL and
every detached id under `detached`. The response carries that row's id so an operator can either retry
the delete or reconcile by hand."* Walk the real sequence: purge succeeds (writes correct `deleted`
counts) → `deleteAuthUser` fails (network blip, GoTrue hiccup) → handler returns
`500 {auth_delete_failed, purgeRef}` → the client (or an operator, per the comment) retries the whole
`delete-account` call → the handler calls `gateway.purge(userId)` again from the top → this hits
`purge_client_account` a second time → the open-row-reuse branch fires → `detached` is overwritten with
empty counts. The one piece of evidence the table's own `COMMENT ON TABLE` promises —
*"`detached` names every row the purge unlinked, by table and id, so an interrupted closure ... can be
reconciled"* — is gone by the time anyone needs to reconcile it.

**Test coverage gap.** `account_purge_test.sql`'s new §9 ("a retry reuses the open row") calls
`purge_client_account` a second time and asserts `v_again = v_purge` and `count(*) = 1`, but never
inspects `detached->'deleted'` after the retry — so this exact defect passes the suite green. The test
proves the *row* is reused; it does not prove the *evidence in the row* survives the reuse, which is
the entire point of "reconcile by hand."

**Fix shape** (not applied — out of review scope): merge rather than overwrite —
`detached := detached || jsonb_build_object('deleted', COALESCE(detached->'deleted','{}'::jsonb) || v_deleted, ...)`
read from the existing row before the UPDATE, or simply skip the second sweep's `deleted` write when
`v_purge` was found pre-existing and nothing new was deleted this pass.

**Confidence:** CONFIRMED — read the migration body directly; the overwrite-not-merge is unambiguous
in the `UPDATE ... SET detached = jsonb_build_object(...)` (no `detached ||` anywhere in that branch),
and the retry path is one the code was explicitly designed to take.

---

### D-2 — MEDIUM, self-flagged by the implementer (d-notes.md §3), independently confirmed — a thread the client started is deleted even when the designer is an active participant, destroying the designer's copy of that conversation

Verified directly in the migration: step 2 of the function body is
`DELETE FROM public.comms_threads WHERE created_by = p_user_id` — unconditional on who else is in the
thread. `comms_thread_participants` and `comms_messages` both `REFERENCES comms_threads(id) ON DELETE
CASCADE` (`00101_comms_tables.sql:59,91`), so a shared thread's designer-authored messages are deleted
along with it. The rewritten `account_purge_test.sql` asserts this as the shipped behavior (fixture
thread `…002` — designer participant, client `created_by` — is asserted deleted).

This sits uncomfortably next to ruling 2's own headline ("never cascade designer-owned records") — the
messages a designer wrote in that thread are designer-authored content, deleted because the *thread
row* happens to be client-owned. The implementer flagged this for Fable with a concrete one-predicate
fix (delete only threads where nobody else remains, matching 00536's prior behavior) and it is
otherwise correctly built and tested against the ruling as currently worded. Elevating this from
"self-flagged, awaiting a ruling" to a formal finding per the review brief's "report everything, don't
filter" instruction — this is a live design open question, not a bug in isolation, but it is a real
behavior a reader of ruling 2 would not expect from "never cascade designer-owned records."

**Confidence:** CONFIRMED (behavior, from reading the SQL and the FK cascade chain).
**Severity:** MEDIUM as shipped-but-flagged; would be MAJOR if this reaches production without an
explicit ruling, since it is irreversible data loss for the designer.

---

### D-3 — MINOR, self-flagged (d-notes.md §2), independently verified — no re-point to a tombstone; the brief's literal instruction ("use `set_document_client` where guards demand it") was not followed, by a verified-necessary substitution

The build plan's Backend row does not spell out the re-point mechanism, but `d-tasks.md`'s own Task 2
records the brief's letter as asking for "re-point client identity on designer-owned rows ... using the
sanctioned `set_document_client` path where the guards demand it." Independently verified:
`guard_proposal_copy_immutability` (`grep -c 'DISABLE TRIGGER' 00538*.sql` → 0, confirmed) truly has no
GUC escape hatch — I read the function body reference at `00387:1092-1213` is cited but not
re-transcribed here; taking F5/F6 in `d-tasks.md` at face value given F4 (FK targets) was independently
confirmed by `pg_constraint`-shaped grep matches (`proposals.client_id`, `projects.client_id`,
`invoices.client_id`, `designer_clients.client_id`, `comms_threads.created_by` — all reference
`profiles(id)` per the CREATE TABLE statements read directly for each in this review). The GoTrue
soft-delete spike (§1 of `d-notes.md`) is a reasonable, falsifiable claim about vendor behavior and is
consistent with the `deleteUser(id, shouldSoftDelete?)` signature actually present in
`@supabase/auth-js@2.98.0`'s `GoTrueAdminApi.d.ts` (verified locally). The substitution is well-argued
and net-safer than the brief's literal ask (removes the ACCESS EXCLUSIVE hazard entirely, review M-D5).
Flagging per the review brief's instruction to report every finding, not because it looks wrong — it
is a real deviation from the brief's letter that the orchestrator should knowingly accept or reject,
and the honesty/verification bar this program holds itself to.

**Confidence:** CONFIRMED as a deviation; PLAUSIBLE that it is the *right* deviation (I did not re-read
`00387:1092-1213` myself in full to independently re-verify F6's exact refusal condition — took the
implementer's line citation on faith after confirming the surrounding facts).

---

### D-4 — MINOR, self-flagged (d-notes.md §4) — `designer_clients.client_name` / `.client_email` are not scrubbed by the tombstone

Confirmed by omission: `designer_clients` does not appear as a delete target and is explicitly excluded
from `v_owned` with a stated reason (keeps `client_decisions` alive). The roster row's own
`client_name`/`client_email` columns (present per `00536`'s banner, not independently re-verified
against a fresh `information_schema` read in this review — taken from the implementer's citation) are
therefore untouched, so a designer's CRM view and her document views can disagree on the client's name
after a closure. Correctly named as a retention policy question rather than a lane decision, per the
implementer's own note. Reporting it here only because it is a real, user-visible inconsistency once
a real production closure happens.

**Confidence:** PLAUSIBLE (took `d-notes.md`'s column citation at face value; did not independently
grep `00536`'s `designer_clients` banner for `client_name`/`client_email`).

---

### D-5 — MINOR, informational — `supabase/seed/00-legacy-grants.sql` edited outside the W2 owned-file map, correctly per the skill's own rule, but still a boundary crossing worth a second set of eyes

`steward.md` §7 does not list `supabase/seed/00-legacy-grants.sql` in lane D's W2 owned set (D held it
in W1b, not this wave). The edit is real (confirmed in the diff: 12 lines, two `DO $g$` blocks,
append-only, both naming `public.purge_client_account(uuid)`), mechanical, and required by
`patina-db-migrations`' own rule ("If your migration adds any GRANT/REVOKE, regenerate it"). 00538 does
carry a REVOKE/GRANT pair (restating 00536's posture, not new). The implementer flagged this
proactively (d-notes.md §5) with an explicit "revert it if you'd rather regenerate at integration"
offer. Not a defect — correct per project convention — but it is a file outside the stated owned map,
and per the review brief's "does the diff show anything the report doesn't account for" check, this is
the one file the report itself already accounts for. No independent objection.

**Confidence:** CONFIRMED (diff content matches the self-report exactly, byte for byte on the visible
lines).

---

## Checklist verification (build-plan §W2 backend row, direction-b, honesty rules, D-specific gates)

- **`project_rooms` policy (critique M4):** correctly NOT written. Independently re-derived: the only
  `CREATE POLICY ... ON project_rooms` statements across all migrations are `00066:248-253` (client
  SELECT, `polroles = PUBLIC` includes `authenticated`) and `00316:148` (studio co-member,
  `TO authenticated`) — confirmed the migration and its test (`house_on_today_test.sql` §5) assert the
  policy's continued existence by name rather than re-minting it. Correct.
- **`rooms.budget_cents` / `profiles.last_seen_at`:** both new, both nullable, both commented, both
  regenerated into `database.types.ts` — confirmed column-for-column in the types diff (exactly 6
  inserted lines: 3× `last_seen_at` under profiles Row/Insert/Update, 3× `budget_cents` under rooms
  Row/Insert/Update). No drift beyond that.
- **`saved_items` de-dup + two partial unique indexes:** verified the two indexes are genuinely
  disjoint on `room_id IS NULL` vs `IS NOT NULL`, verified the de-dup CTEs order on
  `(created_at ASC, id ASC)` (a total order, so deterministic), and verified the test actually drops
  the just-created index to re-run the de-dup logic and pins the EARLIEST-row survivor by id — a real,
  non-trivial assertion, not a rubber stamp.
- **No GRANT/REVOKE in 00537** — confirmed by reading the full file; the banner's own claim
  ("No GRANT, no REVOKE... in this file") is accurate, and the seed was correctly left unregenerated
  for that file (it was regenerated for 00538 instead, which does carry a GRANT/REVOKE).
- **Additive-only (R3 backend scope):** both migrations are additive — `ADD COLUMN IF NOT EXISTS`,
  `CREATE UNIQUE INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION` (with a compatible signature to
  00536, verified: `RETURNS uuid`, one `uuid` arg, unchanged). No `DROP`, no destructive DDL against
  existing shape.
- **Policy scope:** confirmed no RLS policy is added, altered, or dropped by either file — matches the
  "no `project_rooms` policy" finding above and the design's own stated boundary ("No new table, no new
  grant beyond restating 00536's posture").
- **Regen done:** `database.types.ts` diff matches the claimed "1 file changed, 6 insertions(+)"
  exactly, content-verified above, not just line-count-verified.
- **Tests real and failing-without-the-change:** `house_on_today_test.sql` is new and its assertions
  (column shape, both unique-refusal cases, the two allow cases, the NULL-product allow case, and the
  de-dup survivor) are genuine — they reference real columns/indexes verified against
  `information_schema`/`pg_indexes` shape claims, not tautologies. `account_purge_test.sql`'s rewrite
  correctly inverts the prior file's assertions (survives-with-identity vs. survives-detached) and adds
  real new fixtures (a third thread, `rooms`/`room_scans`/`notification_log`/`device_push_tokens` rows)
  that the old file never had, so the new assertions have something real to check against. I did not
  re-execute either file; my confidence rests on structural reading, not a live red→green run.
- **Wire contract unchanged (delete-account):** confirmed — `index.ts`'s six response shapes are
  untouched; only the internal `deleteAuthUser(userId, soft)` signature and its one call site changed.
  `deleteUser(id, shouldSoftDelete?)` is a real, current `@supabase/auth-js` API shape (verified against
  a local `node_modules` copy, v2.98.0) — the soft-delete call is not inventing an API.
- **No edits outside owned files:** confirmed against `steward.md` §7's D row
  (`00537_*`, `00538_*`, `supabase/tests/**`, `database.types.ts`, `supabase/functions/delete-account/**`)
  — the only file outside that literal list is `supabase/seed/00-legacy-grants.sql` (D-5 above),
  self-flagged and justified by a project-wide rule.
- **Conventional Commits + pathspecs:** all four commit subjects follow `type(scope): summary`; `git
  show --stat` on each commit lists only the files the message and `d-notes.md` claim (spot-checked all
  four).
- **Migration numbering / collision:** `00537`/`00538` remain unclaimed by any other branch at review
  time — `steward.md` §6 recorded tip `00536` before the lane started and W5 kept `00539` reserved;
  nothing in this diff renumbers or touches a migration below `00537`.
- **Report vs. diff:** every claim in the implementer's structured report that I could check
  (commit hashes, file lists, line counts, the types diff content, the seed diff content, the migration
  and test file contents) matched the actual diff exactly. The one class of claim I could not verify —
  the live gate run's pass/fail counts (132/110/22/0, the 12/0 deno result, the clean `db reset`) —
  rests on the implementer's report only, per this review's read-only scope.

## Not checked (explicitly out of scope for a read-only review)

- Did not run `supabase db reset`, `scripts/run-sql-tests.sh`, or `deno test` — cannot independently
  confirm the reported pass/fail counts, only that the test files' assertions are structurally sound
  against the schema as read.
- Did not re-read `00387:1092-1213` (`set_document_client`) in full — took the implementer's citation
  of its refusal conditions at face value after confirming the surrounding facts (F4's FK targets) hold.
- Did not re-verify `designer_clients.client_name`/`.client_email` column existence directly against
  `00536`'s banner text (D-4).

## Summary

Two migrations, a well-reasoned and independently-plausible design deviation (soft-delete detach
instead of a hard delete + re-point), and a genuinely careful set of tests — this is strong work. One
MAJOR defect survives review: **the retry path for `purge_client_account` overwrites rather than
merges the audit trail**, which quietly defeats the journal's own stated purpose (reconciling an
interrupted closure) on the exact retry path the code was built to support, and the test suite's own
retry case does not catch it because it never inspects the overwritten field. The three self-flagged
items (D-2/D-3/D-4) are correctly surfaced by the implementer already and are reported here per the
review brief's "don't filter" instruction, not because they were hidden.

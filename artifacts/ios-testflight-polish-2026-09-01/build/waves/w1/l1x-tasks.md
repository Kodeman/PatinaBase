# First Flight · W1 · L1-X — Backend (`L07-01`, proposal signing) · task list

Lane: **L1-X** (PROGRAM.md §3 calls it W1 · L0.2) · Branch: `first-flight/w1-l1x` ·
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1x`

Read order taken: `rulings-2026-09-02.md` (incl. the B2 v3 pointer in `waves/w1/l1-a-notes.md`) →
`PROGRAM.md` §3 W1 + §7 + §11 → `findings-by-lane.md` (authoritative) → `findings.json` row `L07-01` →
`research/` + `waves/w0/l0.7-coverage-walk.md` §3 and `waves/w0/l07-notes.md` §3 →
`waves/w1/steward.md` §5.8 → every `waves/w1/*-notes.md`.

**No Swift, no simulator, no clone** (steward.md §3: "L1-X has no clone"). One finding. Owned globs:
`supabase/migrations/**`, `supabase/tests/**`, `supabase/functions/**`.

**This file records the plan the lane executed.** It was written up after the red → implement → green
cycle it describes, from the run logs quoted in it — not before task 1.

---

## Standing lines (PROGRAM.md §7 requires all four before task 1)

### 1. `IOS_GATE_UDID`

**Not applicable and deliberately not exported.** This lane compiles no Swift, drives no simulator and
never invokes `ios-gate.sh` in any tier. The steward allocated it no clone; per steward.md §3 it does
not borrow one. Setting `IOS_GATE_UDID` here would only invite an `ios-gate.sh` run this lane has no
business making — Hard Rule 1 and Hard Rule 8 are honoured by owning no device at all.

### 2. The VISION check

> *Name any finding in my table whose fix would add or entrench something VISION §6 refuses
> (tab / zone / dashboard UI, shadows, red/green status, badges, engagement optimisation, the "AI"
> label) and say why it survives.*

**`L07-01` — none. Nothing in this lane's fix reaches a pixel.** The change is one PL/pgSQL trigger
body on `public.projects`. It adds no view, no control, no colour, no badge, no status pip, no copy
and no word a tester reads; the string `AI` appears nowhere in the migration or the test. The only
user-visible consequence is subtractive: a screen that used to say *"We couldn't record your
signature"* stops saying it because the signature now lands.

Worth stating because the finding is money-adjacent: the fix does **not** optimise for engagement, and
it does not paper over a failure. Zero qualified studios still fails closed, loudly, with the same
error — section 4 of the test pins exactly that. VISION's objection is to lying to the reader; 00559
removes a case where the reader was told the truth and given nothing to do about it, without inventing
a case where they are told a comfortable falsehood.

### 3. The notes I must apply

**None.** `build/waves/w1/` held `l1-a-notes.md`, `l1-b-notes.md` and `l1-c-notes.md` when this lane
started; `grep -n "L1-X\|L0.2\|L07-01"` across all three returned nothing. `waves/w0/l07-notes.md`
§N5 addresses "**L0.2** (demo account, D7/D11)" — that is the W0 demo-account lane, not this one; it
asks for `client_visibility_tier = 'full'` in `build/waves/w0/demo-account.sql`, a file this lane does
not own and does not touch.

`build/waves/w1/l1-e-copy-deck.md` **did not exist** at this lane's close (`test -f` → ABSENT), so no
copy-deck rows were applied. L1-X owns no user-facing string in any case.

### 4. The notes I will send

Full text in `build/waves/w1/l1x-notes-out.md`, and appended to each target lane's own file:

- **→ L1-B** (`Features/Proposals/**`, ruled to L1-B by steward.md §5.9 S-3) — *nothing owed*,
  appended to `build/waves/w1/l1-b-notes.md`. Evidence: `ProposalsAPIClient.swift:405-418` sends only
  `{p_proposal_id, p_signed_name}`; the RPC signature and response shape are unchanged.
- **→ L1-F** — *nothing owed*, written to `build/waves/w1/l1-f-notes.md` (the file did not exist).
- **→ the steward / Fable** — three items in `build/waves/w1/l1x-notes.md` §2: both changed test files
  are **red until 00559 is applied** and must not go into `KNOWN_FAILURES.md`; this lane committed
  nothing to the shared local database; and a latent sibling defect is left alone on purpose.

---

## Task 0 — Ground the lane

- [x] `git rev-parse --show-toplevel` → `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1x`;
      branch `first-flight/w1-l1x`. `mkdir .writer.lock.d` succeeded — no other writer.
- [x] Read every file in the brief's read order, including the eleven-row L0.7 walk and the full
      `findings.json` row for `L07-01`.
- [x] Mint the number: `ls supabase/migrations/*.sql | sort -V | tail` → head `00557` in this worktree
      **and** in `/Users/kody/Code/patina-merged`. The shared local database reads `00558`
      (`feedback_bug_reports_github`), a peer session's file that exists in no first-flight branch.
      **`00559` is free and is taken.**

## Task 1 — Find the exact failure, both directions, before writing anything

- [x] Trace the path: `ProposalsAPIClient.signProposal` → `sign_proposal(uuid,text)` (00400) →
      `_sign_proposal_authorized_00400` → `_activate_proposal_as_project_authorized` (00398) →
      `_activate_proposal_as_project_impl` (00390's rename of the 00279-era body) → `INSERT INTO
      projects (…)` **with no `studio_id`** → the `set_project_studio_id` BEFORE INSERT trigger
      (00317 → 00511).
- [x] Read the guard. 00511's discovery block counts the designer's active non-guest memberships in
      active `design_studio` orgs and assigns only when the count is exactly 1; its own comment says
      *"Zero or multiple candidates remain NULL and fail closed below."* Two hundred lines later
      `NEW.studio_id IS NULL` raises `studio_id_not_designer_studio`.
- [x] **Run the counterfactual in both directions on the local stack** (each in a transaction that
      rolled back). The seeded designer is an active **owner of two** active studios:

      candidate_studios = 2
      sign_proposal('b0000000-…-0002','Client User') → P0001 studio_id_not_designer_studio

      then, with the second studio suspended so the count is 1, the identical call:

      candidate_studios_after_suspend = 1
      → {"id":"b0000000-…-0002","status":"accepted","signed_at":"2026-09-02T22:53:03…",
         "project_id":"97966012-ddd7-42d9-b490-95a9837de144","newly_signed":true}

- [x] Rule out the schema-carry option named in the finding's fix line: **neither `proposals` nor
      `designer_clients` has a studio column**, so "carry `designer_clients → studio` onto the
      proposal" would mean a new column, a stamping trigger, a backfill, a types regen and a portal
      change — and it would still have to answer the same "which of the two?" question at proposal
      creation. The trigger-side resolution is strictly smaller and answers it once.

## Task 2 — Write the failing test first

- [x] `supabase/tests/rls/00559_proposal_signing_multi_studio.test.sql`, house style (plain psql,
      `pg_temp` role helpers, `DO` blocks of `ASSERT`, `SAVEPOINT` per section, `ROLLBACK` at the
      end), modelled on `rls/00557_increment_scan_upload_attempt.test.sql`. Fixture: the seeded
      designer↔client pair, **plus one extra active studio joined as a plain member** so the
      ambiguity is guaranteed regardless of seed state — and so the extra studio sorts **last** on
      00317's order, which is what makes section 3 discriminating.
- [x] Five sections: (1+2) the signature lands and the winner is 00317's order; (3) the relationship
      outranks that order; (4) zero candidates still fails closed and the signature rolls back;
      (5) a direct authenticated INSERT still fails closed, and the branch still names both gates.
- [x] **Run it red:**

      psql … -X -q -v ON_ERROR_STOP=1 -f supabase/tests/rls/00559_proposal_signing_multi_studio.test.sql
      NOTICE:  00559 fixture: 3 candidate studios
      ERROR:  studio_id_not_designer_studio
      CONTEXT: PL/pgSQL function set_project_studio_id() line 211 at RAISE
               … _activate_proposal_as_project_impl … sign_proposal(uuid,text) line 10 at RETURN
      EXIT=3

- [x] Commit, pathspec only → `ea85416db test(proposals): pin L07-01 — signing across two active studios`

## Task 3 — Write 00559

- [x] `supabase/migrations/00559_proposal_signing_multi_studio.sql`. Body grafted **verbatim** from
      the `grep | sort | tail -1` winner (`00511_public_sd_hardening.sql:2292-2614`; nothing redefines
      `set_project_studio_id` after it), with exactly one block changed. Banner carries the lineage
      `00317 → 00511 → 00559`, the counterfactual, the rule and the blast radius.
- [x] The delta: keep `count = 0` and `count = 1` untouched; add an `ELSIF` for `count > 1` gated on
      `TG_OP = 'INSERT'` **and** `NEW.proposal_id IS NOT NULL` **and** `NEW.client_id IS NOT NULL`
      **and** `current_setting('app.proposal_activation_id', true) IS NOT DISTINCT FROM
      NEW.proposal_id::text` — the transaction-local capability
      `_activate_proposal_as_project_authorized` issues and that this same trigger already trusts as
      the client-activation token. Inside it, the **same candidate set** (so no studio the lead
      designer does not actively belong to can be reached), ordered by: already holds a project for
      this exact `(designer_id, client_id)` pair → owner → `joined_at` → `created_at` →
      `organization_id`. Plain `SELECT`, no `FOR SHARE`/`FOR UPDATE`, so the canonical
      `roles → user_roles → memberships → organization` lock order below is untouched.
- [x] Preflight `DO` block: the function and its trigger must already exist. Grant hygiene: **no
      GRANT/REVOKE added** — `CREATE OR REPLACE` preserves the ACL 00511 left (`{postgres=X/postgres}`,
      verified), a trigger function needs no EXECUTE at fire time, and a `DO` block **asserts** that
      no app role holds EXECUTE rather than re-granting it. That keeps
      `supabase/seed/00-legacy-grants.sql` (a file this lane does not own) out of the diff.

## Task 4 — Run it green, without a reset

- [x] `pnpm supabase:reset` is the steward's at integration and is **not** run here (steward.md §4:
      the local database carries a peer's 00558 that a reset would drop). Instead: one transaction —
      apply 00559, run the test, `ROLLBACK`.

      --- applying 00559 (transaction-local) ---
      --- running 00559 test ---
      NOTICE:  00559 fixture: 3 candidate studios
      NOTICE:  00559 section 1+2 passed: project ac0db74d-… stamped studio a6ea1eed-…
      NOTICE:  00559 section 3 passed: relationship studio 59000000-…-0001 chosen over a6ea1eed-…
      NOTICE:  00559 section 4 passed: studio_id_not_designer_studio still raised
      NOTICE:  00559 section 5a passed: direct INSERT still fails closed
      NOTICE:  00559 section 5b passed: the branch names both gates
      --- rolling back ---
      EXIT=0

- [x] Prove the database is unchanged afterwards: fixture studio rows `0`, proposal still `sent`,
      live `set_project_studio_id` body still without the branch, ledger head still `00558`.

## Task 5 — The neighbour that had to move

- [x] `grep -rln "studio_id_not_designer_studio\|set_project_studio_id" supabase/tests/` → six files.
      Ran each twice: untouched database, then with 00559 applied in-transaction.
- [x] Five were green both ways. **`supabase/tests/edge_api/public_sd_hardening_contract_test.sql`
      pins `set_project_studio_id`'s `prosrc` sha256** and the body changed, so it went red with
      *"a public 00511 identity, semantic profile, or body hash drifted"*. Updated the one pinned hash
      `8113ca8a…` → `8aca199be7f059b37c7b0148d39a4b38e0a725f77cb0aa4e939730712ca050f8`, with a comment
      naming the old value and what did **not** move (SECURITY INVOKER, no direct grants, the lock
      order). The file is inside this lane's `supabase/tests/**` glob.
- [x] Re-ran the whole contract test with 00559 applied, preserving its own internal
      `ROLLBACK;`/`BEGIN;` boundaries (its last block deliberately opens a fresh transaction to prove
      pooled-successor GUC isolation; stripping that boundary manufactures a failure) → **EXIT=0**.
- [x] Commit, pathspec only →
      `0058771ec fix(proposals): resolve the activation studio from the proposal (00559)`

## Task 6 — The Kody-run block and the notes

- [x] `build/waves/w1/l1x-notes.md` — §2 the notes out, §3 the Kody-run block (the read-only J1/K1
      studio-count probe, a second read-only probe counting `projects.studio_id IS NULL`, the
      selective `psql` apply after 00555/00557 with a before/after body-hash proof and the ledger
      insert, and K2), §4 the full local proof.
- [x] `build/waves/w1/l1x-notes-out.md`, plus the appends to `l1-b-notes.md` and the new
      `l1-f-notes.md`.
- [x] `shots/w1-l1x/ledger.md` — no shots; the reason is written in the ledger.
- [x] `rmdir .writer.lock.d`.

---

## Coverage — every finding in this lane's W1 table

| id | tier/sev | closed by | pinned by | state |
|---|---|---|---|---|
| `L07-01` | T0/blocker | `supabase/migrations/00559_proposal_signing_multi_studio.sql` (commit `0058771ec`) | `supabase/tests/rls/00559_proposal_signing_multi_studio.test.sql` §1+2 (the signature lands and is stamped with a studio the lead designer actively belongs to), §3 (the relationship wins), §4 (zero candidates still fails closed), §5 (the relaxation stays inside the bridge) | **closed at the level this lane can reach** — migration written, proven red→green locally in a rolled-back transaction, **not applied to Strata** (a Kody-run step) |

`findings-by-lane.md`'s W1 · L0.2 table holds exactly this one row. Nothing else is owed to this lane.

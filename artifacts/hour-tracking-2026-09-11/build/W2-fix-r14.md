# W2 — lane A (DB) fix pass, round 14 · HT-3-g(b) CORRECTED

**Branch** `hour-tracking/server` in `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`.
**Stack** this program's own: Postgres `127.0.0.1:54422`, `--workdir …/agent-server`. The shared 54322
stack was never touched; nothing reached Strata; `supabase/config.toml` stays skip-worktree'd, untouched
and in none of the commits.

**Four files changed, 501 insertions / 79 deletions.** No new migration number was minted: `00606` and
`00620` are unapplied on Strata (the whole wave ships in one push), so the remediation is an in-place
edit, which is the standard move while a migration has not shipped.

| finding | grade as reviewed | what was done |
|---|---|---|
| **W2-R14-01** | MAJOR | the orchestrator's HT-3-g(b) CORRECTION applied to `00606` — a THIRD bound on the overwrite arm, pinned by a postcondition |
| **W2-R14-03** | note | the overwrite's `audit_logs` row is filed under the **DISPLACED** studio's `organization_id` |
| **W2-R14-02** | MINOR | `00620`'s banner and both predicate COMMENTs corrected — the roster key NARROWS, it does not close; the key is KEPT |
| **W2-R14-04** | MINOR | `00620`'s 11-space postcondition literal replaced with a whitespace-normalised form; the same treatment given to `00606`'s remedy-arm pin |
| **W2-R14-05** | note | the `00602`-vs-`00620` key asymmetry recorded in `00620`'s banner, with the two facts that make it harmless today |

---

## 1 · W2-R14-01 — the overwrite arm's third bound (HT-3-g(b) CORRECTED)

`supabase/migrations/00606_time_entries_studio_read_narrow.sql`, bound (a0) of
`stamp_project_pricing_studio`:

```sql
  v_replaced_employs_designer := v_existing IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organization_members AS replaced_seat
    JOIN public.organizations AS replaced_studio
      ON replaced_studio.id = replaced_seat.organization_id
    WHERE replaced_seat.organization_id = v_existing
      AND replaced_seat.user_id = v_designer_id
      AND replaced_seat.status = 'active'
      AND replaced_seat.role <> 'guest'
      AND replaced_seat.role <> 'owner'
      AND replaced_studio.type = 'design_studio'
      AND replaced_studio.status = 'active'
  );
  v_remedy := v_caller_is_designer
          AND v_caller_owns_named
          AND v_existing IS NOT NULL
          AND NOT v_replaced_employs_designer;
```

It is the same employer-tier question bound (c) asks, turned on the OLD studio instead of the named one,
so the two are one sentence read in two directions. Nothing else in the body moved: bounds (a), (c) and
(d) are unchanged, and the arm still reaches exactly the three bounds round 13 gave it.

**Postconditions.** One new assert pins the bound by source on a **whitespace-normalised** `prosrc`
(W2-R14-04's class) — all seven legs of the predicate plus its POSITION before `v_remedy` (a test computed
after bound (b) has already let the overwrite through). The remedy-arm pin was rewritten from the literal
`'%AND v_existing IS NOT NULL;%'` spelling to the normalised full assignment, and the
`public.organization_members` read count was raised from **EXACTLY TWO to EXACTLY THREE** with the third
read named in the message. Probed on the installed body: the remedy pin `t`, the bound pin `t`,
`organization_members` reads `3`, actor-vs-designer comparisons still `1`.

**Negative control, measured.** With `AND NOT v_replaced_employs_designer` removed from the **installed**
body (`pg_get_functiondef` → `replace` → `EXECUTE`, asserted non-vacuous), the billing suite reds at
`FAIL k4b … got NO RAISE (returned …a6)` — the round-13 arm reproduced. `m6` is the leg that measures the
honest-employer refusal itself and is later in file order, so it is the abort's successor rather than its
site; it asserts `22023` on exactly the call round 13 asserted as SUCCEEDING. The stack was restored with
a full `db reset` afterwards and both suites re-run to their baseline.

### What it closes, and what it leaves

- **Closed:** W2-R14-01's one-statement taking. Case **(m)** is re-asserted as a refusal — `m6` `22023`,
  `m6b` nothing written, `m6c` no audit row, `m6d` the hour still at the employer's 24000.
- **Its fixture was corrected too.** Round 13's (m) fixture gave the designer *no seat at all* in the
  honest studio that stamped her project, so it measured the arm against a FORMER employer rather than
  against the employer it was taking from. She now holds the ordinary hire's active `member` seat in `a6`
  (`organization_members` row `…00de`), which is the shape W2-R14-01 measured.
- **The residual that is left, asserted as PASSING and loudly labelled:** she can still reach the studio
  she owns by LEAVING the employer's seat first (`m6e` → `m6a`) — two statements, the first a seat act,
  which is a NOTE — RESIDUAL under HT-3-g AMENDED (c) and not the blocker clause.

### The remedy the arm exists for — and the one statement the correction costs it

The orchestrator's premise was that after a taking "the replaced studio is the taker's own workspace,
where the new lead holds no employer seat". **Measured, that is true only after one more statement, and
the statement is the recovering owner's own.** `reassign_project_lead` (00399) is pinned to the project's
CURRENT `studio_id` and needs both leads seated THERE, and `Org owners can insert members` forbids
`role = 'owner'`, so the seat the taker must give the employer's owner is necessarily an active
**non-guest, non-owner** seat in the very workspace about to be replaced — an employer-tier seat by the
corrected bound's own test. So the chain is now:

| leg | form S (case k) | form H (case l) |
|---|---|---|
| the employer's owner reassigns unaided | **refused `42501`** (k3, unchanged — still a ruling owed) | **refused `42501`** (l8) |
| the taker seats her and reassigns | succeeds (k4) | succeeds |
| she stamps while holding that seat | **refused `22023`** — NEW (k4b/k4c) | **refused `22023`** — NEW (l8b) |
| she leaves the seat (`Members can leave`) | 1 row (k4d) | 1 row (l8c) |
| she stamps | **overwrites** (k5) | **overwrites** (l9) |
| the trace | audited under the DISPLACED studio (k6) | audited under the DISPLACED studio (l10) |
| the money | next hour 26000 from the employer's card (k8); P-4 holds (k7) | 26000 (l11); P-4 (l12) |

**HT-3-f(4)'s victim keeps her way back, with an ORDERING.** The outsider's consent-free seat IS an
employer seat of hers in the org being replaced, so the corrected arm refuses the overwrite while it is
live: `rls/time_entry_studio_stamp_test.sql` case (z) gains **z4b** (`22023`) and **z4c** (nothing
written) *before* `z5`, which is the seat removal she has always been able to make. `z7` then recovers
unchanged. The correction costs her an ordering, not a remedy.

**HT-3-e(3)** (the second-account pair) is unchanged: the studio being replaced is the pair's own
workspace, which employs neither of them at `role <> 'owner'`.

## 2 · W2-R14-03 — the overwrite's audit row follows the party that loses the work

```sql
    CASE WHEN v_existing IS NULL THEN v_written ELSE v_existing END,
```

`audit_logs`' only SELECT policies are `Org admins can view org audit logs` (`organization_id` +
owner/admin) and `Users can view their audit logs` (`user_id`), so a row carrying the NEW studio was
readable by the taker and by the studio she had just named and by nobody else. A first stamp displaces
nobody and keeps the studio it wrote. One row, not two.

Measured: **m7** the row carries `organization_id` = the displaced studio; **m7a** that studio's OWNER
reads it through RLS (count 1, where round 14 measured 0). `k6`, `l10` and the new `z7d` assert the same
`organization_id` on their own fixtures — in (k) the displaced party is the taker's own workspace, which
is the symmetry the rule buys: whoever loses a project can see who took it.

## 3 · W2-R14-02 — the roster key narrows, it does not close

The key is **KEPT**: removed from both copies of `00620`'s statement the billing suite reds at `j1` with
the taking reproduced (the round-14 review measured this independently). What changed is the prose, in
three places — `00620`'s "WHY A SECOND KEY" banner section, the roster predicate's own header, and
`project_roster_books_elsewhere`'s COMMENT. Round 13's sentence — a roster "cannot go quiet without
touching those people's seats one at a time" — was false in exactly the way round 13 showed the author
key to be false: `project_team_members` carries 00177's `Lead designers manage team members` at
`polcmd = '*'` on `p.designer_id = auth.uid()`, so the project's own lead designer clears the whole
roster in ONE UPDATE or DELETE with no seat touched. The files now say what the key buys: the realistic
form-S row costs **two** statements instead of one — clear the roster, then leave her own employer seat —
and only the second is a seat act, which is what keeps the manoeuvre a residual under (c). The `00620`
banner's "THE REMEDY" paragraph also records the correction and the extra statement it costs.

## 4 · W2-R14-04 — the spelling gate

`00620` postcondition **(b3)** leg 3 was `prosrc LIKE '%designer_owner_seat.role           = ''owner''%'`
— eleven literal spaces copied out of the predicate's alignment. All four legs (a fourth,
`designer_owner_seat.user_id = p_designer_id`, was added in the same pass) now ask a
`regexp_replace(prosrc, '\s+', ' ', 'g')` source. Probed on the installed body: the normalised form `t`,
the single-space literal form `f` — so the old spelling genuinely depended on the body's whitespace and
the new one does not. `00606`'s two remedy-arm pins were given the same treatment.

## 5 · W2-R14-05 — the recorded asymmetry

Recorded in `00620`'s banner with the two facts that make it harmless today, each measured rather than
asserted: `00563`'s authenticated INSERT arm admits only `NEW.created_by = auth.uid()`, so the author key
is false by construction on `00602`'s path, and a project has no roster at the instant it is inserted.
It is recorded because a later path that inserts a project on somebody else's behalf, or seeds a roster
in the same statement, would reach the owned tier with no key at all.

---

## Gates, verbatim

| command | result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean, through `00620`** — `Applying migration 00604…, 00605…, 00606…, 00607…, 00615…, 00620…`, all 27 seed files, `Finished supabase db reset on branch main.` / `{"target":"local","version":"","message":"Reset local database."}`. Every `DO` postcondition block ran (they RAISE on failure), the new ones included |
| `run-sql-tests.sh -d …/tests/billing -H 127.0.0.1 -p 54422` | **8 green / 8**, `unexpected-fail: 0` |
| `run-sql-tests.sh -d …/tests/commercial …` | **10 green / 16**, 6 unexpected — **all pre-existing and documented** (listed below) |
| `run-sql-tests.sh -d …/tests/rls …` | **28 green / 30**, 2 unexpected — **both pre-existing and documented** |
| `pnpm --filter @patina/supabase type-check` | **clean** (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/designer-portal type-check` | **clean** |
| `pnpm --filter @patina/admin-portal build` | **exit 0**, full route table |
| `python3 ./scripts/generate-legacy-grants.py` from the worktree | `baseline + 2632 replayed statements` — **no diff** (this pass adds no GRANT/REVOKE) |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` | **no diff** on `packages/supabase/src/database.types.ts` (no public-schema signature changed) |
| negative control — the new conjunct removed from the installed body | billing reds at **`FAIL k4b`** with the round-13 arm reproduced; stack restored by `db reset`, both suites back to baseline |

**Pre-existing failures, listed separately as the brief asks.** Six in `commercial` (the countersign/grant
family: `authorized_schedule`, `design_services_authority`, `design_services_gap_hardening`,
`executed_on_paper`, `trade_rfq`, `trade_scope`) and two in `rls` (`design_requests_test.sql` `FAIL 3b`,
`studio_titles_test.sql` `FAIL f`) — all documented in `supabase/tests/KNOWN_FAILURES.md`, none W2's. The
runner's default `-k` points at a per-directory `KNOWN_FAILURES.md` that does not exist, so it counts them
all as "unexpected". `commercial/direct_order_attribution_test.sql` (clock-dependent, documented window)
passed.

**Still red and still W1's:** `supabase/tests/edge_api/public_rpc_authorization_contract_test.sql` at
`:171` — not in this round's gate list, not touched, ruling owed, **sixteenth round of asking**.

## What this pass did NOT do

- **Not applied to Strata.** No `db push`, no prod anything. `00606`/`00620` remain unapplied there, which
  is what makes the in-place edit the right remediation.
- **No new migration number**, no new object, no GRANT/REVOKE, no type change — so the grants seed and
  `database.types.ts` were regenerated and are byte-identical.
- **Lane B untouched** (phase 2). Its copy obligation is now satisfiable: W2-R14-03 gives the displaced
  studio a row it can actually read.
- **`reassign_project_lead` was not changed.** The remedy's reassign half is still refused to the
  displaced employer acting alone (k3/l8). That is a ruling owed, recorded in the residual table, and the
  correction neither helps nor worsens it.
- **Not measured over HTTP.** Every call is an ordinary `authenticated` one the grants and policies admit,
  driven through `psql` with the session's JWT claims set, not through PostgREST.
- **No concurrency or volume work** on the arm's `(studio_id IS NULL OR v_remedy)` write.
- **Not re-argued:** whether the residual case (m) leaves (leave the seat, then overwrite) should itself be
  closed. Under discipline (c) it is a note — residual, its remedy is form S's, and its remedy's missing
  half is the same owed `reassign_project_lead` ruling.

## Commits

Three, Conventional Commits, explicit pathspecs, pushed to `origin/hour-tracking/server`:

1. `fix(time): HT-3-g(b) corrected — the overwrite arm reads the replaced studio`
   (`supabase/migrations/00606_time_entries_studio_read_narrow.sql`)
2. `fix(time): 00620 — the roster key narrows, and its gate stops spelling-checking`
   (`supabase/migrations/00620_legacy_project_studio_stamp.sql`)
3. `test(time): the corrected overwrite arm, the recovery, and the displaced studio's row`
   (`supabase/tests/billing/legacy_project_studio_stamp_test.sql`,
   `supabase/tests/rls/time_entry_studio_stamp_test.sql`)

`rulings.md` records the correction on the `HT-3-g` row (date cell now
`2026-09-12 · corrected 2026-09-13`) and the residual table is rewritten with round-14 measurements — the
`Amendment width` row struck through as CLOSED, three rows' remedies re-measured, and two new rows (the
realistic form-S row, and the employed designer's own studio). The `hour-tracking-2026-09-11` artifacts
are untracked on this branch, as in every previous round, so they are not in the commits.

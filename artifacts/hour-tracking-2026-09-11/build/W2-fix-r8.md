# W2 — lane A (DB) fix pass, round 8

**One finding assigned, one finding fixed: W2-R8-01 (MAJOR).** It is closed by one statement in
`guard_studio_member_rate_history`, grafted into migration **`00615`** (no new number minted), and it is
measured in both directions by two new test cases. Nothing else in the tree was touched: no policy was
changed, no grant widened, no W1 file edited, no lane-B file opened.

Branch `hour-tracking/server` in `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`.
Every command ran against this program's own stack (`127.0.0.1:54422`). Nothing reached Strata; the shared
54322 stack was never touched; `supabase/config.toml` is still skip-worktree'd and is in no commit.

---

## The ruling applied — HT-3-e(4), candidate (1), recorded in `rulings.md`

The review put three candidates to the orchestrator and chose none. The fix pass chose **candidate (1), the
guard**, and recorded it in `rulings.md` as **HT-3-e(4)**, flagged to Kody:

> *In `guard_studio_member_rate_history`, when `NEW.hourly_rate_cents IS DISTINCT FROM OLD.hourly_rate_cents`
> and `auth.uid()` is present, `created_by` is stamped with the acting uid. Authorship records who SET THE
> NUMBER THAT IS THERE, which is the question HT-3-e(2) asks when it prices.*

**Why (1) and not (2) or (3).** HT-3-e(2) keys on authorship; the defect is that authorship was a record of
the row's FIRST version, not of the number standing in it. Candidate (1) makes the key truthful and costs an
honest studio **nothing** — `useSetStudioMemberRate` (`use-studio-member-rates.ts:101-113`) already upserts
`created_by: userId`, i.e. exactly the value this statement writes, so no shipped path changes behaviour.
Candidate (2) (`AND user_id <> auth.uid()` on `studio_member_rates_admin_update`) would additionally refuse
an admin-designer's in-place correction of **her own** row — a capability W1 shipped and three of its own
cases assert (`a2`, `b2`, `h6`) — and the review's own note that it "costs a sole proprietor nothing" is only
true because 00615 exempts her at the RESOLVER, not at the table: the policy leg would still refuse her
same-day blur-save in any studio she merely administers. Candidate (3) leaves the taking standing. (1) is
also the only candidate that repairs the **visibility** regression the review flagged, because the number and
its author now move together — the owner's rate-card lens no longer shows her 99900 under his name, which is
the visibility HT-3-e(3)'s accepted residual leans on.

**Three bounds of the statement, each deliberate and each asserted:**
- writes arriving as `postgres` (the DEFINER ladder `close_prior_studio_member_rate`, seeds, migrations) take
  00598's `current_user` early return and keep their authorship — the ladder is untouched;
- the stamp is conditional on `auth.uid() IS NOT NULL`, so a service_role path with no JWT leaves the
  recorded author standing rather than writing NULL (NULL is the **deleted-author** value tier 2 treats as
  arm's-length, case `(ag5)`);
- it sits **after** W1-R5-01's actor check, so a caller who forges `created_by` to a third party **and** moves
  the number still **RAISES** (case `(j4)`'s rule is not softened into a silent correction).

---

## Why this is an in-place edit of `00615` and not a new number

`00615` is **W2's own, unmerged and unapplied**: `origin/hour-tracking/integration` does not carry it (round
8's own sweep confirmed `00604`–`00607` and `00615` exist only on `hour-tracking/server` and its origin twin),
and nothing in this program has reached Strata. `patina-db-migrations` step 8 makes an in-place edit the
canonical remediation in exactly that state — it is how `00606` was repaired in rounds 5, 6 and 7 — and fixing
forward instead would have had to spend **W6's** `00616`, which is the collision W2-R8-04 warns about. The
redefined function is W1's (`00598`), so the rule lands as a **new `CREATE OR REPLACE` with a lineage banner**
inside `00615` rather than an edit of `00598`, which IS merged.

- Lineage recorded: `guard_studio_member_rate_history`: **`00598` → `00615`**. Grep winner before the edit:
  `00598` (sole definition). The body in `00615` is `00598:233-302` **verbatim**, comments included, with one
  `IF … THEN NEW.created_by := (select auth.uid()); END IF;` block grafted in.
- The trigger `aaa_guard_studio_member_rate_history_trg` is **not** recreated: `CREATE OR REPLACE` keeps the
  binding, and the trigger's NAME is what orders this guard before `close_prior_studio_member_rate_trg`
  (00598's own ordering postcondition still passes, and a new `00615` postcondition asserts the binding
  survives).
- `00615`'s filename still describes its contents (`self_authored_rate_requires_ownership`): both sections are
  the same ruling family — one decides which row prices, the other decides what "authored" means.

---

## Files changed

| file | change |
|---|---|
| `supabase/migrations/00615_self_authored_rate_requires_ownership.sql` | +211. Banner section for W2-R8-01 (the measurement, the three candidates and why (1)); `CREATE OR REPLACE FUNCTION public.guard_studio_member_rate_history()` grafted from 00598 with the one statement; `COMMENT ON FUNCTION`; the 00598 `REVOKE ALL` restated; eight postconditions in their own `DO $guardpostcondition$` block, labelled a **spelling heuristic** (W2-R8-06's complaint, not repeated silently) |
| `supabase/tests/rls/studio_member_rates_test.sql` | +145. New case **(l)** — the table-level contract, four legs — plus its header index entry. The closing "All … assertions passed" notice moved out of case (k) into (l) |
| `supabase/tests/billing/time_rate_resolution_test.sql` | +171. New case **(ah)** — the taking end to end, five legs — plus its header index entry |
| `supabase/seed/00-legacy-grants.sql` | +6, **generated** (`python3 scripts/generate-legacy-grants.py`): the restated `REVOKE ALL ON FUNCTION public.guard_studio_member_rate_history()` replays |

`rulings.md` (HT-3-e(4)) and this file are the program's artifacts, not the worktree's.

### What the new cases measure

`studio_member_rates_test.sql` case **(l)** — the guard's whole contract on the number:
- `l1` the rate's own SUBJECT (an `admin`) rewrites the OWNER's open row → the UPDATE still lands (W1's
  capability) and `created_by` now reads **her**;
- `l2` an UPDATE that does **not** move the number leaves authorship standing (the clause is
  `IS DISTINCT FROM`, so an unrelated touch cannot take credit for somebody else's rate);
- `l3` a forge **and** a rate change in one statement still **RAISES**, and neither the number nor the author
  moves;
- `l4` an owner correcting a COLLEAGUE's number is recorded as its author — the arm's-length shape HT-3 rules
  for is preserved.

`time_rate_resolution_test.sql` case **(ah)** — the same shape end to end on (ag)'s fixtures:
- `ah0` precondition: the open row is the 21000 the studio OWNER wrote in `(ag3)`;
- `ah1` she rewrites it to 99900 → the row is re-authored to her;
- `ah2` **the taking**: her 120-minute hour answers `NULL / none / NULL`, resolver and classifier agreeing
  (before the fix: `99900 / studio_member / 199800`);
- `ah3` **the honest blur-save, end to end**: the owner corrects the open row **in place** (no new row — the
  exact idiom candidate (2) would have broken) and the hour prices at `22000 / studio_member / 22000`;
- `ah4` **the sole-proprietor non-regression through the UPDATE path**: the OWNER edits her own rate and her
  hour still prices (`46000 / studio_member / 92000`);
- `ah5` a deleted-author row (`created_by` NULL) corrected by the studio is authored by the corrector and
  prices — the stamp writes a real uid or nothing, so an edit never recreates the NULL branch.

---

## Gates

All on this program's isolated stack — Postgres `127.0.0.1:54422`, `--workdir …/agent-server`.

| command | result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean** — `Finished supabase db reset on branch main.`; `00615` applies after `00607`; every `DO $postcondition$` / `DO $guardpostcondition$` passed |
| `./scripts/run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **7 green / 7**, `unexpected-fail: 0` (`time_rate_resolution_test` with case (ah) among them) |
| `./scripts/run-sql-tests.sh -d …/supabase/tests/rls -H 127.0.0.1 -p 54422` | **28 green / 30, 2 unexpected** — `design_requests_test.sql`, `studio_titles_test.sql`, both **pre-existing and documented** (`supabase/tests/KNOWN_FAILURES.md:114-115`, the r1–r8 baseline). `studio_member_rates_test` (with case (l)), `time_entry_studio_stamp_test`, `time_entry_admin_write_test`, `time_entry_auto_roster_test`, `project_hours_total_test`, `studio_hours_rollup_test` all **PASS** |
| `python3 scripts/generate-legacy-grants.py` | regenerated, **+6** (baseline + 2625 replayed statements); the diff is the one restated REVOKE and nothing else |
| `SUPABASE_DB_URL=…54422 pnpm --dir …/agent-server db:generate` → `git diff --exit-code packages/supabase/src/database.types.ts` | **CLEAN** (no public-schema shape change — a function body and a comment) |
| `pnpm --filter @patina/supabase type-check` | **clean** (`tsc --noEmit`, no output) |
| object probe after the clean reset (`patina-db-migrations` step 7) | on `guard_studio_member_rate_history`: `e4_stamp = t`, `e4_key = t`, `SECURITY INVOKER = t`, trigger bindings = **1**. On `resolve_time_rate_cents`: `e2_clause = t`, `owner_exempt = t` (HT-3-e(2) untouched) |

Not re-run, and why: `pnpm --filter @patina/designer-portal type-check` and
`pnpm --filter @patina/admin-portal build` — this round changes **no** TypeScript and no generated type (both
were green in round 8's review and the types diff is clean); `supabase/tests/commercial` — untouched by this
fix and six-red pre-existing (`KNOWN_FAILURES.md:69, :97-101`); the edge_api contract test (**W2-R4-08**,
still red at `:171`, W1's, ruling owed — **ninth round of asking**).

### Negative controls — the fix is what makes the cases green

Run on the same stack by reinstalling 00598's guard body (`psql -f` of `00598:233-302`), re-running, then
reinstalling 00615's:

| with 00598's guard (the shipped body before this fix) | with 00615's guard |
|---|---|
| `studio_member_rates_test.sql` → **ERROR: FAIL l1b** (`got c2200000-…-000000000001`, the OWNER's id) | green |
| `time_rate_resolution_test.sql` → **ERROR: FAIL ah1** (`got 99900 / b1300000-…-000000000001`) | green |
| standalone probe (a fresh studio, honest owner writes 25000, the admin-designer rewrites it, 120-minute hour): `row_cents 99900 · author_is_her **f** · priced **99900** · `studio_member` · **199800**` | `row_cents 99900 · author_is_her **t** · priced **NULL** · `none` · NULL` |

So the round-8 measurement reproduces on this stack, and both new cases fail for the right reason when the
statement is removed. Every probe ran inside a transaction ending in `ROLLBACK`; no probe fixture survives
(the suites were re-run afterwards and are green).

---

## What this fix does NOT do

- **It does not refuse the UPDATE.** An owner or admin may still rewrite any member's rate number in place,
  including her own — that is W1's shipped capability and HT-3's blur-save. What changed is that the record
  now names who did it, and HT-3-e(2) prices accordingly. The residual (an admin may DESTROY a colleague's
  number in place — an availability question, not a taking, now with `created_by` and `updated_at` both
  naming the actor) is recorded in `rulings.md` under HT-3-e(4).
- **It does not touch the other round-8 findings.** W2-R8-02 (the employer arm admits an outsider — ruled
  residue (i), closure is HT-3-b arm (c)'s owed consent door), W2-R8-03 (the owner exemption is a live-seat
  test, so a founder who takes a partner falls to `'none'`), W2-R8-04 (the `00615`/W5/W6 number bookkeeping in
  `plan-v2.md:25, :708` and the "W5 mints from 00616" sentence) and W2-R8-05 / W2-R8-06 are **not** in this
  brief and are untouched. W2-R8-04 is worth an orchestrator minute before W5/W6 read `plan-v2.md`: `00615` is
  now **spent by W2** in two places that still call it reserved, and the recorded "W5 mints from `00616`" line
  points at W6's band.
- **No prod anything.** Nothing was pushed to Strata; no migration was applied anywhere but `54422`. W1's
  constraint stands: `00599`/`00601` must not reach Strata ahead of `00606`/`00615`, and `00615` now carries
  two rules rather than one.
- **The Strata `projects.studio_id IS NULL` count** — split by whether the designer's employer tier is
  ambiguous and whether she is an `admin` anywhere — is **still uncounted**, and it sizes this finding as well
  as W2-R8-02 and HT-3-e(3). One read-only query, ninth round of asking.

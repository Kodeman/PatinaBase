# W1 — fix pass, round 5

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`, branch `hour-tracking/server`, base `0427f2c1e`.
DB = the program's own isolated stack `patina-hours` (API 54421 / Postgres 54422). `supabase/config.toml` untouched and still skip-worktree'd (`git ls-files -v` → `S`), in no commit.

**All three blockers fixed. No finding skipped.** Every fix was measured on a **clean `supabase db reset`** both before (the exploit reproducing) and after (the exploit closed), with every write through RLS as the actor named, and each new test case was **proved to gate** by re-installing the pre-fix function body and watching the named assert fail.

---

## W1-R5-01 — FIXED

**`supabase/migrations/00598_studio_member_rates.sql:262-281`** — the actor check inside `guard_studio_member_rate_history`, exactly as the finding specified:

```sql
  IF NEW.created_by IS DISTINCT FROM OLD.created_by
     AND NEW.created_by IS DISTINCT FROM (select auth.uid())
  THEN
    RAISE EXCEPTION 'studio member rate authorship records the actor — created_by may only be re-stamped with your own id'
      USING ERRCODE = 'check_violation';
  END IF;
```

- Postcondition pinning the function text: `00598:428-437` (`!~ 'NEW\.created_by IS DISTINCT FROM \(select auth\.uid\(\)\)'`).
- Banner: a `REVIEW ROUND 5 (W1-R5-01)` section at `00598:71-88`.
- W1-R2-04's blur-save is untouched — the upsert always re-stamps the acting admin's own id, which this permits. Proved by case (j1)–(j3) still green.

**Measured** (`scratchpad/probe_r5a.sql`, the reviewer's own probe, clean stack):

| | shipped (`0427f2c1e`) | with the fix |
|---|---|---|
| `created_by` UPDATE through RLS as her | SUCCEEDED | **REFUSED, `23514`** (`studio member rate authorship records the actor …`) |
| the 120-minute entry | `rate=99900 src=studio_member amount=199800 billing_state=authorized` | **`rate=15000 src=studio_member amount=30000 billing_state=authorized`** |

Negative controls unchanged: `probe_r5a_ctrl_noforge.sql` → 15000/30000, `probe_r5a_ctrl_noseat.sql` shape → 15000/30000.

**Tests added**
- `supabase/tests/rls/studio_member_rates_test.sql` — case **(j4)/(j5)**, the UPDATE vector the finding asked for: the admin who legitimately authored the open row stamps the OWNER's id → must raise; the recorded author must survive the refusal. Header documents it.
- `supabase/tests/billing/time_rate_resolution_test.sql` — case **(t)**, the whole exploit end to end (seat a collaborator, self-set 99900, attempt the re-stamp, log the hour → 15000/30000).

---

## W1-R5-02 — FIXED

**`supabase/migrations/00599_resolve_time_rate_cents.sql:320-344`** — one new FIRST `ORDER BY` term, every existing key unchanged below it, exactly the text the reviewer verified:

```sql
    ORDER BY EXISTS (
               SELECT 1 FROM public.studio_member_rates AS employer
               WHERE employer.studio_id = studio.id
                 AND employer.user_id   = p_user_id
                 AND membership.role NOT IN ('owner', 'admin')
             ) DESC,
             EXISTS ( … existing arm's-length key … ) DESC,
             …
```

- Postconditions: `00599:650-668` pin the key's text **and** its position above the arm's-length key (`'employer\.studio_id = studio\.id[\s\S]*arms_length\.studio_id = studio\.id'`). Round 4's three-key order postcondition is kept unchanged beneath it.
- Banner: `REVIEW ROUND 5` at `00599:192-228`, naming the structural pattern (every key that asks a question *about* a candidate studio is answerable by a studio she owns) and why the rate leg must live inside the key.

**Measured**

| probe | shipped | with the fix |
|---|---|---|
| `probe_r5b_twoaccount.sql` (second account seated `admin`, no forge) | `99900 / studio_member / 199800` | **`15000 / studio_member / 30000`** |
| `probe_r5a.sql` (W1-R5-01 shape) | `99900 / 199800` | **`15000 / 30000`** |
| `probe_r5_r4a.sql` (W1-R4-02 shape) | `18000 / studio_member / 36000` | **`18000 / 36000` — not re-broken** |
| `probe_r5a_ctrl_noforge.sql` (W1-R4-01 / case (r) shape) | `15000 / 30000` | **`15000 / 30000`** |

**Tests added**
- case **(u)** — the two-account attack written through RLS (she seats the second account as `admin`; the second account writes the 99900; preconditions assert the row really is arm's-length and the admin seat really landed, so the case cannot go vacuous).
- case **(w)** — the fall-through the new key needs, which the reviewer listed under *Not verified*: a studio's **OWNER** logging her own hours, where both candidates are studios she runs, so the new key ties at false. Her personal workspace also holds a self-set 99900, so the answer has to come from the multi-member count (round 4's third key). Asserts `22000 / studio_member / 44000` and explicitly that `rate_source <> 'none'` — i.e. the principal of a real studio is not stranded at $0.

---

## W1-R5-03 — FIXED (both files)

**`supabase/migrations/00601_classifier_rate_resolver.sql:331-344`** — the designer branch regains precedence in the role ladder:

```sql
    IF v_project_designer_id IS NOT DISTINCT FROM NEW.user_id THEN
      v_team_role := 'lead_designer';
    ELSIF NEW.rate_role IS NOT NULL THEN
      v_team_role := NEW.rate_role;
    ELSE
      SELECT CASE WHEN count(DISTINCT member.role) = 1 THEN min(member.role) END …
```

**`supabase/migrations/00599_resolve_time_rate_cents.sql:437-461`** — the mirror. The designer override sits **after** ASSERT 3, deliberately: ASSERT 3 keeps refusing a role she does not hold at all (case (l)/(g)), and the designer's *own* pick is then **discarded**, per §0.7's discard-not-refuse idiom, so no legacy writer breaks.

```sql
  IF v_designer_id IS NOT NULL AND v_designer_id IS NOT DISTINCT FROM p_user_id THEN
    v_role := 'lead_designer';
  ELSIF v_role IS NULL THEN
    SELECT CASE WHEN count(DISTINCT member.role) = 1 THEN min(member.role) END …
```

- Postconditions pinning the designer branch above the pick in **both** files: `00599:668-677` and `00601:516-523`.
- Banners: `00599:221-228`, `00601:96-113`.

**Measured** (`scratchpad/probe_r5d_selfseat.sql`; cards `Lead designer` 10000 / `Vendor` 40000)

| | shipped | with the fix |
|---|---|---|
| self-seat as vendor through RLS | SUCCEEDED (unchanged — the roster policy is not touched) | SUCCEEDED |
| entry with `rate_role='vendor'` | `rate=40000 src=authority rate_role=vendor amount=80000` | **`rate=10000 src=authority rate_role=lead_designer amount=20000`** |
| control, `rate_role` omitted (`probe_r5d_ctrl.sql`) | `10000 / lead_designer / 20000` | `10000 / lead_designer / 20000` — **now identical, which is the point** |

**One addition beyond the finding's literal text, flagged for the orchestrator.** `00601`'s delta 4 (`00601:199-207`) previously read `IF NEW.rate_role IS NULL AND v_rate_role IN (…)`. With the ladder reordered alone, a designer's row would have stored `rate_role='vendor'` while the Lead designer card priced it — a row that prints a role that did not price it, permanently (aab_ refuses any later `rate_role` edit). Delta 4 is now `IF v_rate_role IN ('lead_designer','support_designer','bookkeeper','vendor') THEN NEW.rate_role := v_rate_role;`, i.e. **the row records the resolver's role**. This changes nothing for anyone else: with the 00599 fix in place, `v_rate_role` IS the member's validated pick whenever she is not the project's designer (00599 only overwrites `v_role` on the designer branch; the derive branch runs only when the pick is NULL). Regression net: case (e) (two-hat member, not the designer, picks `vendor`) and case (f) (`rate_role` stays NULL) both still green. If the orchestrator prefers the row to keep her discarded pick, revert this one `IF` — assert **(v3)** is the only thing that fails.

**Tests added**
- case **(v)** — a designer who is a plain studio member, on a services project with a 10000 / 40000 card pair: she seats herself as `vendor` through RLS (asserted as a precondition, so the case announces itself if that door ever closes), names it, and the row must read `10000 / authority / lead_designer / 20000`, with an explicit `v_rate <> 40000`.

**Not a ruling request, but stated plainly:** the finding offered "a designer billing as a vendor on her own project" as an orchestrator ruling. The fix takes the conservative branch (she cannot), which is the shipped 00578 behaviour. Nothing in the code now permits it, so if the product wants it, it is a new ruling and a new branch — not a reorder.

---

## Out of scope, deliberately untouched

- **W1-R5-04** (MINOR — `effective_from`/`effective_to` still caller-writable on the open row, `probe_r5e_dates.sql` re-measured after the fix: hand-close still SUCCEEDS, 0 open rows, today resolves NULL). The finding is in the same function and the reviewer notes one edit would close both, but the brief names the blockers only and the review text marks it as awaiting an orchestrator ruling. **Not done.** Adding `effective_from`/`effective_to` to the same raise is a two-line change whenever it is ruled.
- **W1-R5-05** (the `authenticated` GRANT on `resolve_time_rate_cents` with no repo caller) — unchanged, still awaiting the ruling the finding asks for.
- **W1-R5-06/-07/-08/-09/-10** — notes, unchanged. W1-R5-07's plan defect is reproduced verbatim below.
- **W1-R4-03** — lane B, phase 2.

---

## Gates (clean stack, this session)

| command | result |
|---|---|
| `npx supabase db reset --workdir …/agent-server` | **clean** — `00595`…`00601` + `20260910152111` applied, every postcondition replayed, run twice (once before the tests were written, once after) |
| `scripts/run-sql-tests.sh -d …/agent-server/supabase/tests/billing -H 127.0.0.1 -p 54422` | **6 / 6 green**, 0 unexpected |
| `scripts/run-sql-tests.sh -d …/agent-server/supabase/tests/commercial -H 127.0.0.1 -p 54422` | **10 green, 6 unexpected-fail** — the plan's invocation, unchanged by this diff; the 6 are the documented pre-existing `_countersign_design_services_agreement_impl` failures (**W1-R5-07**, a plan/brief defect, not a code one) |
| `./scripts/run-sql-tests.sh -d supabase/tests/commercial -k supabase/tests/KNOWN_FAILURES.md -H 127.0.0.1 -p 54422` (from inside the worktree) | **10 green + 6 expected-fail = 16 / 16**, 0 unexpected |
| `scripts/run-sql-tests.sh -d …/agent-server/supabase/tests/rls -f time_entry -H 127.0.0.1 -p 54422` | **1 / 1 green** |
| `scripts/run-sql-tests.sh -d …/agent-server/supabase/tests/billing -f rate -H 127.0.0.1 -p 54422` | **1 / 1 green** — cases (a)–(w), **23**, all print `passed`; `All time_rate_resolution assertions passed.` |
| `./scripts/run-sql-tests.sh -d supabase/tests/rls -k … -H 127.0.0.1 -p 54422` | **24 green + 2 expected-fail = 26 / 26**, 0 unexpected (includes the extended `studio_member_rates_test`, cases (a)–(k) + (j4)/(j5)) |
| `python3 …/agent-server/scripts/generate-legacy-grants.py` → `git status --porcelain -- supabase/seed/00-legacy-grants.sql` | **empty** — baseline + 2610 replayed statements, byte-identical to the committed seed (no GRANT/REVOKE statement changed in this diff) |
| `SUPABASE_DB_URL=…:54422 pnpm --dir …/agent-server db:generate` → `git diff --exit-code packages/supabase/src/database.types.ts` | **CLEAN** (no signature or schema change) |
| `pnpm --dir …/agent-server --filter @patina/supabase type-check` | **clean** |
| `pnpm --dir …/agent-server --filter @patina/designer-portal type-check` | **clean** |
| `pnpm --dir …/agent-server --filter @patina/admin-portal build` | **green** |
| `git status --porcelain` | the 5 intended files only; `supabase/config.toml` → `S`, never staged |

### The new tests were proved to gate (pre-fix body re-installed, body-only)

| control | expected failure | observed |
|---|---|---|
| `guard_studio_member_rate_history` without the actor check | case (t), case (j4) | `ERROR: FAIL t1 …` / `ERROR: FAIL j4 …` |
| `resolve_time_rate_cents` without the employment key | case (u) | `ERROR: FAIL u1 …` |
| `classify_project_time_entry_authority` with the pick above the designer | case (v) | `ERROR: FAIL v1 …` |
| `resolve_time_rate_cents` with the pick above the designer (the mirror alone) | case (v) | `ERROR: FAIL v3 …` — so the 00599 mirror is independently gated, not only the 00601 half |

Revert bodies: `scratchpad/r5fix/revert_00598_guard.sql`, `revert_00599_ladder.sql`, `revert_00599_role.sql`, `revert_00601_role.sql`.

## Not verified

- **Anything on Strata.** No `db push`, no prod probe.
- **Lane B's portal surfaces** — still absent (phase 2).
- **`designer-portal lint`, the full `designer-portal test` and `@patina/supabase test` suites** — outside the brief's gate list; this diff touches no TypeScript.
- **Concurrency** — no two-session race of the close ladder under simultaneous blur-saves; `uniq_studio_member_rates_open` remains the backstop, unraced.
- **The six red `commercial` files' contents** — confirmed pre-existing and documented; not re-derived.

# W2 — lane A (DB) fix pass, round 3

**Both findings applied. Both were right, and both were reproduced end to end on this program's stack
before the fix and refused after it** — my own measurement, not the reviewer's quoted one. Nothing was
skipped as wrong. The round-3 MINORs (W2-R3-03 audit row, W2-R3-04 banner/revertability, W2-R3-05 unread
row count) and the note (W2-R3-06 first-stamp-wins) are **untouched by scope** — the brief names the
blocker and the major only.

Scope: `supabase/migrations/00606_time_entries_studio_read_narrow.sql` (section 4 — the stamp's standing
and its bounds), `supabase/migrations/00605_…` (three banner lines that described the old standing),
`supabase/tests/rls/time_entry_studio_stamp_test.sql` (one fixture column, one precondition, two new
cases). No new migration number: `00604`–`00607` are unapplied on Strata and unmerged, so the edit is in
place at the plan's numbers (`patina-db-migrations` step 8). No column, no policy, no grant and no
signature changed — so the ACL seed and `database.types.ts` regenerate **clean** (both proved below).

---

## W2-R3-01 · BLOCKER — applied, option (2): ARM 2's sibling must be `created_by` the designer

**Measured before the fix** (fresh fixture, every attack step through RLS as an ordinary designer who owns
her own org and has one client project in it; the victim project is unstamped, priced `a1`, its hour
`25000 / studio_member`, notes `the real studio's confidential note`):

```
k BASELINE  pricing studio = a1 · hour rate = 25000 · Leah (a1's owner) reads 1 row
k STEP1     INSERT organization_members(victim designer, her own org a3, 'member')  → 1 row
            pricing studio of the victim project is now NULL      (employer tier ambiguous ⇒ bound (c) passes)
k STEP2     reassign_project_lead(<her own project>, herself, victim designer)      → OK
k STEP3     stamp_project_pricing_studio(<victim project>, a3)                      → OK   ← the blocker
k AFTER     attacker reads 1 row · notes = "the real studio's confidential note"
            projects.studio_id = a3 (permanent) · Leah reads 0 rows
```

**After the fix** — the same three statements, the same session: STEP1 and STEP2 still succeed (the vector
is not mine to close), STEP3 is refused `42501 … only this project's designer, or an owner/admin of a
studio that already holds a project she leads and created, may name its studio`; the attacker reads **0**
rows, `projects.studio_id` is still **NULL**, and the column stays repairable.

The change is one line in ARM 2's standing plus its justification:

```sql
          AND sibling.designer_id = v_designer_id
          AND sibling.created_by  = v_designer_id     -- W2-R3-01
```

`created_by` is the half of that shape an attacker cannot author, and I verified each leg rather than
quoting the finding:

- `set_project_studio_id` (00563:109-114) **RAISES on any UPDATE** where
  `NEW.created_by IS DISTINCT FROM OLD.created_by`, before any role branching — so it is frozen for every
  writer, DEFINER callers included.
- its authenticated-INSERT arm (00563:141-147) admits only `NEW.designer_id = v_actor`
  **and** `NEW.created_by = v_actor` — a designer may create a project only for herself, created by
  herself.
- `reassign_project_lead` (00399:301, GRANTed to `authenticated` at 00399:510) writes
  `designer_id` only (00399:480-484); it never touches `created_by`.
- every real creation path writes the **designer's own id** into it — `_activate_proposal_as_project_impl`
  (read from `pg_proc` on the live stack: `created_by = v_proposal.designer_id`), `create_project_v2` /
  `activate_project_v2` (`00398:1806-1831`, `00086:67-85`: `created_by = v_caller_id = designer_id`). So
  ARM 2 is not narrowed against the legitimate repair: the studio owner's standing is the hire's own
  activated projects.

The shipped fixture's sibling was `created_by` the **owner**, which the reviewer correctly called
artificial in exactly the attack's direction; it is now `created_by` the designer, and case (g)'s
precondition asserts that column with a message naming (k).

## W2-R3-02 · MAJOR — applied, option (a), widened from the role to HT-3-b's **tier**

**Measured before the fix** (no attacker, no manoeuvre; the workspace is the one `00295` provisions for
every designer whose role precedes her first seat):

```
l FIXTURE   00295 provisioned workspace W, she is its OWNER
            + two employer seats (a1 20000, a3 21000) ⇒ employer tier AMBIGUOUS
l BASELINE  pricing studio = NULL
l STEP1     as her: INSERT studio_member_rates(W, herself, 99900)            → allowed (she owns W)
l HOUR ONE  rate = NULL · source = none                                      (HT-3-a step 3)
l STEP2     stamp_project_pricing_studio(<her legacy project>, W)            → OK   ← the major
l HOUR TWO  rate = 99900 · source = studio_member                            ← her own number
l AFTER     Leah (the employer whose client it was) reads 0 rows
```

**After the fix** — STEP2 is refused `42501 … a designer may name one of the studios that EMPLOY her, not
one whose rate card she writes — a studio she owns or administers only where she holds no employer seat at
all`, and HOUR TWO stays `NULL / none`. The repair she is still owed works: stamping `a1` (a studio that
employs her, where her seat is neither owner nor admin) succeeds, her next hour prices at the
**employer's 20000**, and `a1`'s owner then reads the project's hours.

The new bound (section (4), bound (e)) applies **only where the caller is the member being priced**
(`v_designer_id = v_actor`) and reads HT-3-b's own two tiers, verbatim from `00604`'s resolver
(employer = active, non-guest, `role <> 'owner'`):

- while she holds **any** employer seat → the studio she names must be one where her seat is **neither
  `owner` nor `admin`** — i.e. one whose `studio_member_rates` she cannot write
  (`studio_member_rates_admin_insert` asks only `is_org_admin_or_owner(studio_id)`);
- only where she holds **no** employer seat anywhere → she may name a studio she **owns**.

**Why the tier and not the literal `role NOT IN ('owner','admin')` the finding proposed.** The literal
form also refuses the shape HT-3-b records as its own cost — "a principal who also owns the workspace
`00295` provisioned at her `is_designer` flip has two owned candidates and no employer, so she is priced
by neither until a project names one" (cases (n)/(w) of `time_rate_resolution_test.sql`). For her this
stamp is the only repair that exists, and she is HT-3-c arm (a)'s ruled sole proprietor, not a member
gaming an employer's books: there is no employer tier to route around. Reading the tier refuses exactly
the actor the finding measured (an ambiguous **employer** tier routed to an owned workspace) and keeps the
owned tier reachable for the actor HT-3-c already ruled on. It also closes a pivot the finding's own
wording would have left open: option (a) as written says "let the genuine sole proprietor reach her own
studio only through ARM 2", and ARM 2 is reachable by the designer herself — she is `is_org_admin_or_owner`
of her own workspace, and she can create a throwaway project in it whose `created_by` is legitimately her
own, manufacturing her own ARM 2 sibling. The tier bound refuses `W` on **both** arms, so that pivot is
closed without a second rule.

**CORRECTION (round 4, 2026-09-12).** The paragraph above is wrong where it says *"The tier bound
refuses `W` on **both** arms, so that pivot is closed without a second rule"*. The bound lived inside
`IF v_designer_id = v_actor`, so it was a property of the ACTOR, and ARM 2 admitted any owner/admin of
the named studio — an account the designer authors. Review round 4 measured the pivot end to end
(**W2-R4-01**, MAJOR): she seats a second account as `admin` in `W` (consent-free), creates her own
ARM 2 sibling in it, and that account's stamp SUCCEEDS where hers is refused; her next hour prices at
the 99900 she wrote for herself. The fix is **HT-3-d** (RULED 2026-09-12) — one arm, the tier bound
applied to (the designer, `p_studio_id`) for EVERY caller, with the caller required to be an owner or
admin of the studio named. See `W2-fix-r4.md`; the claim above stands only as the history of how the
bound was reached.

**One residue of the new bound, stated rather than left to be rediscovered.** A designer who is `admin`
of an employer studio may still name it, and an `admin` may write `studio_member_rates` there. That is
HT-3's own trust model ("owner/admin of the studio sets it") and the studio's owner appointed her — and,
unlike the measured finding, the consequence is **visible**: after the stamp the studio's owner reads the
project, the hour and the rate, so HT-3-c's stated mitigation (the composer and the settings page) does
reach it. No ruling asked for more; flagged for the orchestrator, not patched.

## Why arm (b) of W2-R3-02 was not taken

The finding offered "rule that HT-3-c arm (a) extends to a post-hoc designer stamp of a studio she owns,
in which case this downgrades to a note". That is a ruling, not an implementation, and HT-3-c's text is
about a studio **named at creation** while HT-3-a assigns the repair to *the owner*. I implemented the
closed direction; if the orchestrator rules arm (b), case (l)'s `l3`/`l4` asserts and bound (e) move
together, and HT-3-c's mitigation sentence has to be struck for the reason the finding gives.

---

## The two new test cases, and proof they have teeth

`supabase/tests/rls/time_entry_studio_stamp_test.sql` grows from (a)–(j) to (a)–(l); the header case list,
case (g)'s precondition and the projects fixture move with them.

- **(k)** runs the whole W2-R3-01 manoeuvre through RLS as the attacker: it **asserts
  `reassign_project_lead` SUCCEEDS** (`k2`, with a message saying the case is measuring nothing if that
  ever stops being true), asserts it left `created_by` alone (`k3`), and asserts the stamp is refused
  `42501` (`k4`) with the victim project still unstamped (`k5`). It reuses case (d)'s consent-free seat
  (asserted as a precondition, `k0`) and a second victim project so it cannot race (g)'s stamp. Its
  fixture adds the attacker's own ordinary client project plus the canonical `designer_clients` row
  `reassign_project_lead` requires.
- **(l)** builds the hire the other way round — designer role first, so `00295` provisions the workspace
  she owns (asserted present, `l0`), then two employer seats with a rate in each. It asserts the
  ambiguous-tier `'none'` (`l1`, `l2`), that her self-set 99900 INSERT is **permitted** (the finding's
  precondition), that the stamp of her own workspace is refused (`l3`), that the employer stamp succeeds
  (`l4`), that her next hour prices at 20000 / `studio_member` (`l5`), and that the employer's owner now
  reads the project (`l6`).

**Negative control, run twice so neither case is vacuous** (on this stack, restoring bodies by hand and
then re-applying `00606`):

| function body installed | result |
|---|---|
| the pre-fix body (from `git show HEAD:…00606…`) | `ERROR: FAIL k4 (W2-R3-01, THE BLOCKER) … got NO RAISE (returned a3)` |
| the new body with bound (e) **deleted** (R3-01 fix only) | (k) passes; `ERROR: FAIL l3 (W2-R3-02, THE MAJOR) … got NO RAISE (returned <her workspace>)` |
| the committed body | all ten cases (a)–(l) `passed` |

The second control also found a defect in my own first draft of (l): with the tier bound absent, the
W-stamp succeeded and the *next* call raised `22023 this project already names a studio` uncaught, so the
finding's own message was lost. `l3` now asserts **before** the repair stamp, which is why the control
prints the intended text.

---

## Gates (every one the findings name, re-run after the final edit)

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean** — `Finished supabase db reset on branch main.`; `00604`–`00607` replayed, `00606 postconditions passed.` (now eight, including the two new source pins) |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/billing -H 127.0.0.1 -p 54422` | **7 / 7 green**, 0 unexpected |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/commercial -H 127.0.0.1 -p 54422` | **10 green / 16, 6 unexpected as the brief invokes it** — the identical W1/r1/r2/r3 baseline (all six abort in `_countersign_design_services_agreement_impl`). Re-run from the worktree with `-k supabase/tests/KNOWN_FAILURES.md` → **16 / 16, 0 unexpected** |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/rls -f time_entry -H 127.0.0.1 -p 54422` | **3 / 3 green** (`admin_write`, `auto_roster`, `studio_stamp` — the last now ten cases) |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/rls -f hours -H 127.0.0.1 -p 54422` | **2 / 2 green** |
| whole `tests/rls` with `-k supabase/tests/KNOWN_FAILURES.md` (beyond the brief's list, because the stamp is cross-cutting) | **28 green + 2 documented = 30 / 30**, 0 unexpected |
| `pnpm --filter @patina/supabase type-check` | clean |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/admin-portal build` | **succeeds** (route table printed) |
| `python3 scripts/generate-legacy-grants.py` + `git diff --exit-code supabase/seed/00-legacy-grants.sql` | **CLEAN** (baseline + 2623 statements — no GRANT/REVOKE moved) |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` + `git diff --exit-code packages/supabase/src/database.types.ts` | **CLEAN** (the signature is unchanged) |

All against API 54421 / Postgres `127.0.0.1:54422` (`project_id "patina-hours"`). The shared 54321/54322
stack was never touched. **Nothing was pushed to Strata**; no prod anything. `supabase/config.toml` is
still skip-worktree'd, untouched and in no commit.

## Program rules re-checked against this diff

No flag; no backfill (the stamp still writes one project's column only when a caller asks, and only where
it is NULL); additive only (no column, no type, no policy, no grant, no index); the client-supplied-rate
discard is untouched; the invoiced-entry lock is untouched; no running-timer index change; no rollup
return shape change, so `notes` still cannot appear in one; the 00484 quartet's four names, commands, role
sets and permissive flags are untouched by this pass (`00606`'s postcondition (b)/(c) re-assert them on
every reset); migrations stay at the plan's numbers.

## What I did not do

- **The three MINORs and the note of round 3** — W2-R3-03 (the stamp writes no `audit_logs` row),
  W2-R3-04 (`00606:97-98` still claims the policy narrowing is "THE ONLY CHANGE IN THIS MIGRATION", and
  my edit makes section 4 larger, not smaller — the sentence is now more wrong, not less), W2-R3-05 (the
  `UPDATE` row count is still unread, so the return value can still outrun the column under a concurrent
  stamp), W2-R3-06 (two genuine studios, first stamp wins, silently). Deliberately out of scope; all four
  are still live exactly as the review describes them.
- **Every round-2 carry-over** (W2-R2-03 … W2-R2-19) — untouched.
- **W2-R2-04's pre-existing denial-of-service is unchanged and is visible in case (k)'s own trace**: after
  the attacker's seat, Leah reads 0 rows because the employer tier went ambiguous. That is reversible
  (remove the seat, the read returns) and the column is no longer frozen against her, which is precisely
  the difference the blocker erased.
- **No lane B** (phase 2), no portal caller for the stamp (there is none yet — grep: the function appears
  only in `00605`/`00606`, the generated seed, the generated types and this test file).
- **Nobody has still counted the Strata population of `projects.studio_id IS NULL`** — the reviewer's
  standing request, and the population all of this turns on. One read-only count before any deploy
  decision.

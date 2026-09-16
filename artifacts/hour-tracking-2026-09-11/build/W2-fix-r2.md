# W2 — lane A (DB) fix pass, round 2

**Commit** `3d36ffb6e` on `hour-tracking/server` (pushed; `origin/hour-tracking/server == HEAD`).
Parent `9f80b0c09` (round 1's B1 fix). 7 files, +931 / −29.

Both MAJOR findings applied. Nothing else in `W2-review-r2.md` was touched — m/n-grade items (W2-R2-05
… W2-R2-19) and the two "ruling owed" notes (W2-R2-03, W2-R2-04) are untouched by design, per the
brief's scope.

One **deviation from a named fix, measured before it was taken**: W2-R2-02's arm (a) as the reviewer
specified it ("owner/admin of `p_studio_id` **and** 00563's own bound") is round 1's **B1 one step
worse**, and shipping it verbatim would have introduced a permanent escalation. The shipped function
has two narrower, non-manufacturable arms instead. The measurement is below; it is the one thing in
this pass the orchestrator should read before anything else.

---

## Files

| File | What changed |
|---|---|
| `supabase/migrations/00607_studio_hours_rollup.sql` | `project_hours_total`'s third standing leg; its justification comment, banner note, `COMMENT ON FUNCTION`, and new postcondition (g) |
| `supabase/migrations/00606_time_entries_studio_read_narrow.sql` | NEW section (4): `public.stamp_project_pricing_studio(uuid, uuid)` + its grants, comment and 6 postconditions; banner (ii) corrected; lineage line corrected |
| `supabase/migrations/00605_time_entry_admin_write_and_trace.sql` | banner (ii) corrected (the same false promise) |
| `supabase/tests/rls/project_hours_total_test.sql` | NEW case (i) + its fixture (an attacker and her own org) |
| `supabase/tests/rls/time_entry_studio_stamp_test.sql` | NEW per-role suite, cases (a)–(j) |
| `supabase/seed/00-legacy-grants.sql` | regenerated (`generate-legacy-grants.py`) — 00606 now carries GRANT/REVOKE |
| `packages/supabase/src/database.types.ts` | regenerated (`db:generate`) — gains `stamp_project_pricing_studio` |

All edits are **in place** at the plan's numbers. `00604–00607` are unmerged and have never been
applied to Strata, which is the only condition `patina-db-migrations` step 8 puts on in-place
remediation; a follow-up number would have had to be taken from W3's reserved `00608–00609`.

---

## W2-R2-01 · applied as named

`00607:181-189` → one leg:

```sql
    OR public.is_org_admin_or_owner(public.project_pricing_studio_id(p_project_id))
```

The deleted leg was "an owner/admin of **any** studio the project's designer actively belongs to" —
verbatim the predicate `9f80b0c09` removed from the three policies. Its comment's justification is
rewritten rather than deleted: it records that the claim ("each can already sum these rows with a
plain SELECT") was true in round 1 and false after the B1 fix, and it names the measurement.

**Re-measured after the change**, fresh fixture, every write through RLS, project NAMES its studio:

```
as the attacker, before:  project_hours_total(P)              → refused 42501
as the attacker:          INSERT INTO organization_members (D, S_A, 'member')   → INSERT 0 1
as the attacker, after:   rows of P she can SELECT             = 0
                          project_pricing_studio_id(P)         = S_R  (unmoved)
                          project_hours_total(P)               → refused 42501     ← closed
```

Pinned two ways:

* **case (i)** of `project_hours_total_test.sql`, in the shape of case (i) of
  `time_entry_admin_write_test.sql`: the seat INSERT is asserted to **succeed** (`v_seated = 1`, so the
  case fails loudly rather than silently if the vector ever closes elsewhere), the attacker reads 0
  rows, the total stays `42501`, and the pricing studio is re-read and asserted unmoved.
* **postcondition (g)** of 00607: the third leg must *be* that expression, and the function's `prosrc`
  must contain no `FROM`/`JOIN public.organization_members`. (The first draft asserted
  `prosrc NOT LIKE '%organization_members%'` and failed its own replay — the word appears in the new
  explanatory comment, which is part of `prosrc`. Named here because the fix is a footgun for the next
  hand that writes a source-reading postcondition.)

Cases (a)–(h) of the shipped suite are green unchanged — (a) 210/180/50000 while reading 3 of 4 rows,
(b) the plain-member designer, (c) owner **and** admin, (d)(e)(f) `42501`, (g) shape + DEFINER,
(h) running excluded.

---

## W2-R2-02 · applied as arm (a), with the standing test narrowed — and why

### The absence is confirmed

Re-measured in case (a) of the new suite, as an assertion rather than a note, so the repair cannot
quietly stop being needed: a studio owner's `UPDATE projects SET studio_id = <her studio>` is still
refused `studio_id_not_designer_studio`, the column stays NULL, she reads **0** of her designer's
hours, and `project_hours_total` refuses her (`is_org_admin_or_owner(NULL)` = false).

### Why the reviewer's arm (a) was not shipped verbatim — MEASURED

Fixture, no forged column, every write through RLS: a legacy project whose `studio_id` column is NULL
and whose designer holds **exactly one** employer seat, so HT-3-b answers her real employer and the
hour prices `25000 / studio_member / 50000`. The employer's owner reads the row today.

With the reviewer's arm (a) implemented exactly as specified (owner/admin of `p_studio_id`, the
designer seated there, the project unstamped and unpriced):

```
BASELINE              pricing studio = the employer · column NULL · 25000 / studio_member / 50000
BEFORE                the employer's owner reads 1 row
attacker step 1       INSERT INTO organization_members (D, S_A, 'member')   → 1 row
                      pricing studio is now NULL          (the tier became AMBIGUOUS)
attacker step 2       stamp(P, S_A)                       → STAMPED S_A, no refusal
AFTER                 the attacker reads 1 row
                      the employer's owner reads 0 rows; project_hours_total → refused 42501
SHIPPED function, same caller, same state                 → refused 42501
```

The "already priced" guard does not save it: the attacker's own seat is what makes the project
unpriced. And the damage is **permanent** — once the column is written, `set_project_studio_id` freezes
it, so the hours, the money, `project_unbilled_time`, the invoice composer and the audit
`organization_id` all follow her org for good. That is strictly worse than round 1's B1 (read + adjust
+ delete, reversible).

### What shipped

`public.stamp_project_pricing_studio(p_project_id uuid, p_studio_id uuid) RETURNS uuid` —
SECURITY DEFINER, `SET search_path = public, pg_temp`, `REVOKE EXECUTE … FROM PUBLIC, anon`,
`GRANT EXECUTE … TO authenticated` (§0.16). Four bounds, in order:

1. **standing** — either the project's **DESIGNER** (`projects.designer_id = auth.uid()`; 00563 freezes
   that column on UPDATE, so it is the one standing an attacker cannot manufacture), **or** an
   owner/admin of `p_studio_id` **where `p_studio_id` already holds another project led by that same
   designer**. The second arm is also non-manufacturable: `set_project_studio_id`'s
   authenticated-INSERT arm requires `NEW.designer_id = auth.uid()`, so nobody can create a project led
   by somebody else. It is the realistic shape of the repair — a studio whose designer's later projects
   00563 has been stamping all along, holding one legacy project from before it.
2. **unstamped** — a stamped project is final (HT-3-c; 00603 case (z)). Naming the studio it already
   names returns that studio as a no-op, so a retry is safe.
3. **unpriced** — `project_pricing_studio_id(p_project_id) IS NOT NULL` refuses. Where HT-3-b answers,
   the owner **has** her read and this function would only be a way to move money.
4. **00563's own bound, replicated** — the project's designer holds an `active`, non-`guest` seat in
   `p_studio_id`, and `organizations.type = 'design_studio' AND status = 'active'`.

`set_project_studio_id` is **not** redefined (§0.4). The write happens as the definer, so the
trigger's *owner-executed* arm (00563's `current_user = 'postgres'` branch) re-validates the same
bound independently — the assert above is not the only thing between a caller and the column. Measured
in cases (f)/(g): the column is actually written, which is the proof the authenticated arm is not
reached.

Both banners now say what is true, and name the function. 00606's lineage line changed from
"policies only. No function, no column, no grant" to the real shape, with §0.20's regeneration note.

### The new per-role suite — `supabase/tests/rls/time_entry_studio_stamp_test.sql`

The fixture reaches "unstamped and unpriced" the honest way: the designer holds **two** employer seats,
so HT-3-b's employer tier is ambiguous. No attacker, no manoeuvre, until case (d).

| Case | Actor | Expected |
|---|---|---|
| (a) | the studio owner | plain `UPDATE` of the column still raises; she reads **0** rows; total refused `42501` — **the absence** |
| (b) | a plain studio `member` | stamp refused `42501` |
| (c) | the project's designer, naming a studio she does not belong to | refused `42501` |
| (d) | the attacker — consent-free seat INSERT asserted to **succeed** | stamp refused `42501`; column still NULL; pricing studio still NULL |
| (e) | the designer of an unstamped project a studio **already prices** | refused `22023` |
| (f) | **ARM 1** — the project's designer names a studio she belongs to | stamped; `project_pricing_studio_id` follows |
| (g) | **ARM 2** — the studio **owner**, her studio holding a sibling project of that designer | stamped — HT-3-a's ruled sentence, executed |
| (h) | the same owner, same session | reads **1** row and `project_hours_total` = 60 — **the repair** |
| (i) | the designer, re-pointing a stamped project | refused `22023`; re-naming the same studio is a no-op |
| (j) | — | DEFINER, `search_path` pinned, `anon` refused, `authenticated` granted |

Case (e)'s shape is built the only way it arises: the project is inserted while its designer holds no
seat anywhere (so 00563's derivation *and* W1's `00602`/`00603` stamps all find zero candidates), and
she is seated afterwards. A fresh INSERT cannot reach "unstamped but priced" — `00602` stamps the
column the moment the tier answers. Worth knowing for the Strata count below: the population of
W2-R2-02 and W2-R2-04 is **legacy rows only**.

---

## Gates — re-run, not quoted

All on this program's isolated stack (API 54421, Postgres `127.0.0.1:54422`, `project_id
"patina-hours"`). The shared 54321/54322 stack was never touched. **No prod anything; nothing was
pushed to Strata.**

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean** — `Finished supabase db reset on branch main.`; every `DO $postcondition$` passed, including 00606's six new ones and 00607's (g) |
| `run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **7 / 7** |
| `run-sql-tests.sh -d …/supabase/tests/commercial -H 127.0.0.1 -p 54422` | **10 green / 16, 6 unexpected as the brief invokes it** — the identical W1/round-1/round-2 baseline (all six abort in `_countersign_design_services_agreement_impl`). With `-k supabase/tests/KNOWN_FAILURES.md`: **16 / 16, 0 unexpected** |
| `run-sql-tests.sh -d …/supabase/tests/rls -f time_entry -H 127.0.0.1 -p 54422` | **3 / 3** (`time_entry_admin_write_test`, `time_entry_auto_roster_test`, NEW `time_entry_studio_stamp_test`) |
| `run-sql-tests.sh -d …/supabase/tests/rls -f hours -H 127.0.0.1 -p 54422` | **2 / 2** (`project_hours_total_test` incl. new case (i), `studio_hours_rollup_test`) |
| whole `tests/rls` with `-k supabase/tests/KNOWN_FAILURES.md` | **28 green + 2 documented = 30 / 30**, 0 unexpected |
| `pnpm --filter @patina/supabase type-check` | clean |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/admin-portal build` | **succeeds** (route table printed) |
| `python3 scripts/generate-legacy-grants.py` | re-run; baseline + **2623** statements; the only delta from HEAD is 00606's two new statements |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` | re-run; the only delta is `stamp_project_pricing_studio: { Args: { p_project_id: string; p_studio_id: string }; Returns: string }` |
| commit hygiene | 7 explicit pathspecs, `git show --stat` re-read; working tree clean; `supabase/config.toml` skip-worktree'd and in no commit; nothing staged from the main checkout |

**§0.20, corrected again:** the grep now returns `00600, 00601, 00602, 00603, 00604, 00605, 00606,
00607`. **`00606` is newly in it** (it had no GRANT/REVOKE before this pass) — one more reason the rule
is the grep and not a list.

**Pre-push hook**: `Affected verification has advisory failures` — `@patina/client-portal lint`, 10
pre-existing `react-hooks/set-state-in-effect` errors in `apps/client-portal/src/hooks/*` and
`src/lib/**`. No file in that app was touched by this pass or by W2 at all.

---

## Findings NOT applied, and why

* **W2-R2-03 / W2-R2-04** — "note — ruling owed", explicitly "no code change until ruled". Both move
  with the same two answers (HT-3-b arm (c)'s consent door, or keying on step 1 alone). Nothing in this
  pass narrows or widens either: the stamp refuses a priced project, so it cannot be used to move
  W2-R2-04's sole-proprietor residue, and it cannot give Leah the read W2-R2-03 describes either,
  because that project is **stamped** (with the hire's workspace) and stays final.
* **W2-R2-05 … W2-R2-19** — MINOR and NOTE, outside the brief. Unchanged and still live, with one
  exception worth naming: **W2-R2-18** (`stamp_time_entry_updated_by` has no pinned `search_path`) was
  *not* fixed here even though this pass was the "same follow-up migration" the reviewer suggested for
  it, because the brief named only the two MAJORs. It remains owed beside W2-R2-08.

## What I did not verify

* **Lane B, entirely** — phase 2.
* `pnpm --filter @patina/designer-portal test` / `lint`, and the `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`
  e2e line — outside the brief's gate list and lane-B-shaped.
* **No portal surface for the new RPC.** `stamp_project_pricing_studio` is reachable from
  `authenticated` and typed in `database.types.ts`, and nothing calls it. Until a lane-B surface exists
  the repair is an act an engineer performs, not one the owner performs — honest in the banners, and
  the orchestrator should decide whether W3 or lane B owns a door for it (one line on the studio
  settings page, beside the `studio_member_rates` table HT-3-c arm (a) already points at).
* **The Strata population.** I did not count how many prod projects carry a NULL `studio_id`, which is
  the population both W2-R2-02 and W2-R2-04 turn on, and which now also tells you how much the new
  function will be asked to do. Still worth one read-only count before the single deploy.
* **Concurrency.** No two-simultaneous-stamp test; the function's own `WHERE … AND studio_id IS NULL`
  makes a lost update a no-op rather than a wrong write, but that is reasoning, not a measurement.

## Three things for the orchestrator to rule or record

1. **HT-3-a's remedy sentence is now inexact.** It reads *"The owner fixes 'none' by stamping
   `projects.studio_id`."* As built, the owner fixes it **only where her studio already holds another
   project of that designer**; otherwise the project's **designer** fixes it. The measurement above is
   why — an unconditional owner/admin stamp is self-grantable. Either the sentence gets that
   qualification, or arm (c)'s consent door lands and the bound can widen to plain owner/admin.
2. **A stamped project is final, by this function's choice, not by a ruling.** That is what keeps
   W2-R2-03 (Leah cannot re-stamp the project her hire named with her own workspace) exactly where the
   review left it, and it keeps priced and invoiced hours from moving between studios' books. If
   W2-R2-03 is ruled the other way, bound (2) is where the arm lands.
3. **W2-R2-01's postcondition reads `prosrc`,** so any future edit to `project_hours_total`'s comments
   must avoid the bare phrase `FROM public.organization_members` / `JOIN public.organization_members`.
   Stated because the first draft of that very postcondition failed on its own comment text.

# W1 — fix pass, round 11

**Both MAJOR findings applied. Nothing skipped, nothing disputed — both reproduced 1/1 on this
stack before a line was written.**

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`, branch
`hour-tracking/server`. Stack: this program's own (`patina-hours`, Postgres `127.0.0.1:54422`).

| finding | severity | disposition |
|---|---|---|
| **W1-R11-01** — the MEMBER BEING PRICED can move her own rate to a number she set | MAJOR | **PINNED + the two false statements CORRECTED.** Not patched (the review forbids it; the closure is HT-3-b arm (c), already OWED). |
| **W1-R11-02** — HT-3-b inert on the live activation path; W1-R8-01 arms A and B both alive | MAJOR | **FIXED in `00603`**, pinned by a new case that creates the project through `public.sign_proposal`. |

---

## Reproduction before the fix (both, measured on this stack, every write through RLS, rolled back)

**W1-R11-02**, through `public.sign_proposal` — Leah owns S; her hire is an ordinary designer
signup (`00295` → workspace `W`) seated `admin` in S; Leah prices the hire 20000 and the assistant
12000 in S; the hire prices herself 99900 in W; the client signs:

```
project studio_id = W (the workspace she owns, NOT S)
HIRE hour : 99900 / studio_member / 199800 / authorized     ← W1-R8-01 arm A
ASST hour : NULL  / none          / NULL    / authorized     ← W1-R8-01 arm B
```

**W1-R11-01**, the subject as her own seater — principal seated `owner` first then granted
`studio_owner` (so her employer tier is EMPTY); subject an ordinary designer signup seated a plain
`member` of S and priced 20000 there:

```
CONTROL  stamp=S   hour = 20000 / studio_member / 40000
MANOEUVRE (two statements, both the subject's, both allowed through RLS)
SURFACE1 stamp=W   hour = 99900 / studio_member / 199800 / authorized   view 99900 / 199800
SURFACE2 (legacy studio_id IS NULL, no stamp involved)
                   hour = 99900 / studio_member / 199800 / authorized   view 99900 / 199800
```

Both exactly as the review reported, including the $1,998.00 and the negative control.

---

## W1-R11-02 — `00603_project_studio_id_named_vs_derived.sql` (new, the reserved number)

Built exactly as the finding's "Exact fix" specifies; `set_project_studio_id` is **not** redefined.

1. **`public.record_project_studio_id_named()`** on trigger
   **`aaa_project_studio_id_named_trg`** — `BEFORE INSERT FOR EACH ROW` on `public.projects`,
   sorting before `set_project_studio_id`. Whole body:
   `PERFORM set_config('app.project_studio_id_named', CASE WHEN NEW.studio_id IS NULL THEN '0' ELSE '1' END, true); RETURN NEW;`
   All BEFORE ROW triggers fire for one row before the next, so the flag is per row.
2. **`public.set_project_studio_id_owned()`** redefined (body grafted verbatim from `00602`, one arm
   added; still the last trigger, still `zzz_…`):
   * `NEW.designer_id IS NULL` → return;
   * `NEW.studio_id IS NOT NULL AND v_caller_named` → return. **HT-3-c arm (a) untouched.**
     A MISSING flag reads as NAMED, so a lost GUC can only leave `00563`'s answer standing.
   * employer tier exactly one → stamp it (**this is the only statement that may overwrite a
     studio `00563` derived**, and the value written is always one of the designer's own active
     non-guest studios, so `00317`'s anti-aiming invariant holds by construction);
   * employer tier empty **and** the column still NULL → owned tier exactly one → stamp it
     (`00602`'s behaviour, unchanged);
   * employer tier ≥ 2, or empty with a value already derived → `00563`'s answer stands.
3. Postconditions: `00602`'s eight carried onto the new body verbatim (designer's own seats;
   `role <> 'owner'`; `role = 'owner'`; employer-before-owned; `role <> 'guest'`; no `ORDER BY`; no
   `studio_member_rates`; no seat/org date; no role holds EXECUTE) **plus** five new ones — both
   triggers installed and `BEFORE INSERT FOR EACH ROW` only (no UPDATE event, P-4); the flag trigger
   sorts **before** and the stamp **after** `set_project_studio_id`, compared as values read from
   `pg_trigger` rather than as literals (W1-R7-07); the flag body records
   `app.project_studio_id_named` off `NEW.studio_id IS NULL`; the stamp reads that GUC; and a NAMED
   studio returns before any tier is read.

**Measured after**: `studio_id = S`, hire `20000 / studio_member / 40000 / authorized`, assistant
`12000 / studio_member / 24000`, `project_unbilled_time` `20000/$400.00` and `12000/$240.00`.

### Pin — case `(ae)` of `supabase/tests/billing/time_rate_resolution_test.sql`

The first case in the file whose project is **not** created as postgres. It authors a proposal as a
draft, crosses it into `sent` through `00390`'s own send capability (an issued proposal is immutable
even to postgres — the `proposals.sql` seed does the same), and has the **client** call
`public.sign_proposal`. Asserts `studio_id = S` (the failure message names the bridge's
`(membership.role = 'owner') DESC` and `00602`'s early return), `20000 / 40000` for the hire,
`12000 / 24000` for the assistant, both `project_unbilled_time` rows, and — leg `ae5` — that a
studio the caller NAMES still survives the stamp (HT-3-c arm (a); without it the flag could silently
invert case (ac)).

### One shipped test moved, deliberately and in the open

`supabase/tests/rls/00563_proposal_signing_multi_studio.test.sql` was the **only** file in the whole
179-file suite that changed behaviour. Its section 2 asserted the bridge's `owner first` order — the
order HT-3-b inverts — and it failed with
`expected 1229e7b9-… got 59000000-…-0001` (the designer's one employer-tier seat).

* **Section 2** now computes whichever rule the fixture actually puts in charge (employer tier when
  it holds exactly one candidate, else `00317`'s order) and names that rule in its message and its
  NOTICE, so it keeps measuring the live answer rather than a remembered one. The header's "Covers"
  entry 2 records the amendment, the date, and what the old behaviour was.
* **Section 3** (the relationship preference outranks the order) would otherwise have passed for the
  wrong reason — the employer tier reaches the same studio. It now seats the designer in a **second**
  extra studio inside its own savepoint, so her employer tier is AMBIGUOUS, `00603` leaves the bridge
  in charge, and the section measures the bridge again. A new fixture assert refuses to run unless
  the tier really is ambiguous.

Sections 1, 4, 5a, 5b untouched and green.

---

## W1-R11-01 — pinned, and the two false statements corrected

**(1) New leg `(ad-ii)`** in `time_rate_resolution_test.sql` (case `(ad)` renamed `(ad-i)`), with the
seater being the member being priced and **no third account**: principal with no employer seat +
subject an ordinary designer signup seated a plain `member`. Asserts, in order:

* `ad4`/`ad4b` preconditions — `00295` gave the **subject** the workspace; the principal holds no
  employer seat;
* `ad5a`/`ad5` **the control, in the same fixture** — before the manoeuvre, stamp = the principal's
  studio and the hour is `20000 / studio_member / 40000`;
* `ad6a` the consent-free seat lands as a plain `member` (and says that if it starts raising, arm (c)
  shipped and the leg should be rewritten as a negative one);
* `ad6`/`ad7`/`ad7b` **surface 1** (the `00602`/`00603`-stamped project): stamp = W, hour
  `99900 / studio_member / 199800 / authorized`, `project_unbilled_time` `99900 / 199800`;
* `ad8a`/`ad8`/`ad9` **surface 2** (a legacy `studio_id IS NULL` project, `00599` step 2 itself, no
  stamp involved — the surface that needs no project creation on Strata at all): the same four values
  and the same view pair.

Every failure message names **HT-3-b arm (c)** and states the `20000 / 40000` the assert takes when
arm (c) lands.

**(2) `time_rate_resolution_test.sql:3440-3443`** — the sentence "This case measures the other actor,
and the sentence does not cover it" is replaced by the corrected property: a member can push the
outcome toward `'none'` **or, when the project's designer holds no employer seat, toward a number the
member set in an organization she owns** — with the reason cases (x) and (aa8) cannot see it (their
second seat makes the tier AMBIGUOUS; this is the tier going from EMPTY to exactly ONE).

**(3) `artifacts/hour-tracking-2026-09-11/rulings.md`, HT-3-b's ruling cell** — both places that
stated the false property are corrected in the same terms:
* "…a consent-free seat can only push it toward `'none'` …, never toward a number somebody set" →
  scoped to a designer who **already holds** an employer seat, with the EMPTY→ONE transition named as
  the exception, measured;
* "HT-3-b's sentence … holds for the member being priced (cases (x), (aa8))" → replaced by the
  correction, the manoeuvre's two statements, the values on both surfaces, the control, the pin
  `(ad-ii)`, and the note that arm (c) is already OWED so **no new ruling is needed to record this,
  only to close it**.
`(ad)` → `(ad-i)` in the cell's pin reference.

`rulings.md` lives only in the main checkout (untracked on this branch), so it is edited there and is
not part of the commit.

---

## FOR THE ORCHESTRATOR — the sub-question, stated not inferred (W1-R11-02 item 4)

HT-3-b says an ambiguous tier is `'none'`. On the **activation path** `'none'` is unreachable without
either leaving `projects.studio_id` NULL — which `00563`'s fail-closed check forbids for an
authenticated caller — or refusing the client's signature. `00603` therefore **leaves `00563`'s
answer standing** when the employer tier is empty or ambiguous, and creates no new
`studio_id IS NULL` row. If HT-3-b's "more than one is `'none'`" is meant to bind the activation
bridge too, that **is** an edit to the signing ceremony and needs ruling. Recorded in `00603`'s
banner and appended to HT-3-b's ruling cell as an OPEN SUB-QUESTION.

Also carried forward, unchanged by this pass: **W1-R11-03 … W1-R11-11** (all MINOR) were not in
scope for this round and are untouched.

---

## Gates

| gate | result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean** (all migrations replayed incl. `00603`, all seeds) |
| `run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **6/6 green** |
| `run-sql-tests.sh -d …/supabase/tests/commercial …` | 10/16 — the **same 6** pre-existing failures as the pre-change baseline (`authorized_schedule`, `design_services_authority`, `design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`) |
| `run-sql-tests.sh -d …/supabase/tests/rls -f time_entry …` | **1/1 green** |
| `run-sql-tests.sh -d …/supabase/tests/billing -f rate …` | **1/1 green** (`(a)`…`(ae)` all pass) |
| `run-sql-tests.sh -d …/supabase/tests/rls -f studio_member_rates …` | **1/1 green** |
| `pnpm --filter @patina/supabase type-check` | **pass** |
| `pnpm --filter @patina/designer-portal type-check` | **pass** |
| `pnpm --filter @patina/admin-portal build` | **pass** |
| whole-tree `run-sql-tests.sh` (179 files), **before vs after** | `diff` of the unexpected-failure lists is **IDENTICAL** — 26 pre-existing failures both sides, zero new. The `00563` rls test failed in the intermediate run and is green after its section-2/3 amendment. |

`python3 scripts/generate-legacy-grants.py` re-run (00603 adds two `REVOKE`s) → `+12` lines in
`supabase/seed/00-legacy-grants.sql`, committed. `db:generate` re-run against `:54422` → **no diff**
in `packages/supabase/src/database.types.ts` (both new objects are trigger functions, which the
generator does not emit), so nothing to commit there.

**Not done:** nothing applied to Strata — this is local only. The shared stack on 54321/54322 was
never touched. `supabase/config.toml` stays skip-worktree'd and unstaged.

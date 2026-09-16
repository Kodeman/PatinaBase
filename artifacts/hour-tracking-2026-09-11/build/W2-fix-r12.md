# W2 fix pass — round 12 (HT-3-g / W2-R12-01)

**Branch** `hour-tracking/server` · **worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`
**Stack** this program's own Postgres, `127.0.0.1:54422` (the shared `54322` was never touched)
**Finding applied** W2-R12-01 (MAJOR/HIGH) — the review's **PREFERRED closure, (1)**
**Commit** `fix(time): W2-R12-01 — 00620's owned tier is keyed on the project author's standing`

---

## 1. What the finding was, in one paragraph

HT-3-g(1) removed the read-time **recomputation** of the pricing studio. It did not by itself remove the
**lever** — it concentrated it in HT-3-g(2)'s single instant. `00620` applied HT-3-b's tier rule to the
whole legacy book at one moment, reading the designer's **live** seats, so one ordinary statement of hers
*before the ship* decided where she was standing when it ran: she leaves her employer (`Members can
leave`, W2-R9-01 probe C) or as an `admin` sets her own row `status = 'removed'` (probe D2); her employer
tier is then empty, the OWNED tier answers her own `00295` workspace, and `00620` stamped that workspace
onto **every** legacy project of hers — including her former employer's client work, opened by that
employer's own assistant. `00606` bound (b) makes the column final and HT-3-g(3) gives the employer no
arm to repair it, and `00606` and `00620` land in the **same push**, so no studio had a window in which
to stamp its own book first.

## 2. The closure, as implemented

An **OWNED-tier** answer is written by `00620` only where `projects.created_by` does **not** hold an
active, non-guest seat in an active `design_studio` **other than** the studio being written — only where
the project does not visibly belong to another studio's book.

- One predicate, `public.project_author_books_elsewhere(p_created_by, p_studio_id) → boolean`, defined in
  `00620`; `SECURITY DEFINER` (an INVOKER read of `organization_members` fails **open** here: it answers
  false, and false is the answer that stamps the row); `STABLE`; `search_path` pinned; `REVOKE ALL … FROM
  PUBLIC, anon, authenticated, service_role` so only the migration role that defines it can reach it.
  `proacl = {postgres=X/postgres}` probed on the live stack.
- **The EMPLOYER tier is not keyed on it.** A single employer seat *is* the book the project belongs to,
  whoever opened it; keying that tier would re-open HT-3-g cost note (i) across the honest hire.
- **It is not HT-3-f(2).** That asked `created_by = designer_id` and refused the honest principal whose own
  **assistant** opened her project. This asks whether the **author** stands in somebody *else's* studio, so
  both honest shapes `00620` exists for survive: the sole proprietor (`created_by` = her, seated only in her
  own studio) and the HT-3-f(2) COST NOTE's principal (`created_by` = her own studio's admin, seated only
  there). `owned_tier_prices_project` is still asserted **absent** (postcondition (b), test h2).
- Not manufacturable by her: `00563` RAISES on any UPDATE that moves `created_by`, and its
  authenticated-INSERT arm admits only `NEW.created_by = auth.uid()`.
- `created_by` is **NOT NULL** on `public.projects` — probed on this stack *and on Strata* — so there is no
  unknown-author branch. The predicate answers false for a NULL author in any case (the permissive
  direction); that is the one shape to re-check if the column were ever nullable anywhere.

### Fifth HT-3-g cost note, stated rather than discovered
A legacy project opened by a contractor, an ex-colleague or an assistant who has **since** taken a seat in
another studio is left NULL even where its designer's owned tier answers — and by cost note (ii) nobody may
then stamp it, because she holds no employer seat. It prices `'none'` (HT-26's "rate pending") until a
studio seats her. `00620`'s NOTICE now counts those rows **separately**, so the ship sees the cost as a
number. The trade: `'none'` where a human must act, rather than a taking no party can undo.

### What the closure does NOT reach, recorded rather than claimed
A legacy project **she opened herself** is still stamped to the studio she owns. That is HT-3-f(3)'s
already-recorded outcome (rulings.md, aj6), and it is measured here as a **labelled PASSING control**
(g11 / h11) rather than left implicit.

## 3. Files changed (5)

| File | Change |
|---|---|
| `supabase/migrations/00620_legacy_project_studio_stamp.sql` | the predicate + its COMMENT + REVOKE; the one UPDATE keyed on `tier = 'employer' OR NOT project_author_books_elsewhere(author, studio)`; a separate count of the rows the key left, in the NOTICE; postcondition (a) rewritten to carry the key (asserting the *unkeyed* form would fail the ship over the cost the key buys); new postconditions (b2) (the key exists, is DEFINER, is reachable by no role) and (c2) (HT-3-g(1): no hour-pricing body names it); banner section W2-R12-01 |
| `supabase/tests/billing/legacy_project_studio_stamp_test.sql` | new cases **(h)** and **(i)** + fixtures; both verbatim copies of `00620`'s statement updated to include the key; the live end-state leg (h1) carries the key; new h3/h4 |
| `supabase/tests/billing/time_rate_resolution_test.sql` | case **(ai)**'s header corrected — its "now changes NOTHING, whoever opened the project" held only in the POST-stamp ordering it measures; scoped to that ordering, with a pointer to cases (h)/(i) for the PRE-stamp one |
| `supabase/seed/00-legacy-grants.sql` | regenerated (`generate-legacy-grants.py`) — the one new REVOKE, 2631 replayed statements |
| `packages/supabase/src/database.types.ts` | regenerated — `project_author_books_elsewhere` (+4 lines) |

No flag. Additive. No time entry written in either direction (P-4 asserted by the migration and by g2).
`supabase/config.toml` untouched and still skip-worktree'd.

## 4. Measurement — both directions, by installation

| Probe | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` (54422) | **clean replay**, `00595`…`00620` + `20260910152111`, all 24 seeds |
| `scripts/run-sql-tests.sh -H 127.0.0.1 -p 54422 -f legacy_project_studio_stamp -v` | **PASS**, four NOTICEs incl. the new W2-R12-01 one |
| same file with the key **removed** from both statement copies (`/tmp/claude/unkeyed_probe.sql`) | **ERROR: FAIL g10** — the taking reproduces verbatim, so the case is not vacuous |
| `scripts/run-sql-tests.sh -H 127.0.0.1 -p 54422` (full suite, 185 files) | 159 green, 22 expected-fail, **4 unexpected** — all four pre-existing and out of lane (below) |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` → `git diff` | one expected 4-line addition, committed |
| `pnpm --filter @patina/admin-portal build` | **succeeds**, full route table |
| `python3 scripts/generate-legacy-grants.py` → `git diff` | one expected REVOKE block for `00620` |
| live-stack object probe | `project_author_books_elsewhere`: `prosecdef = t`, `provolatile = s`, `proacl = {postgres=X/postgres}` |
| live end state | `0` answerable-and-willing rows left NULL; `0` rows left by the key (the 5 remaining NULLs are one seeded designer's ambiguous tier) |

### The four unexpected SQL failures, none of this lane's
- `edge_api/public_rpc_authorization_contract_test.sql` `:171` (`00511 must not auto-derive a studio for a
  non-designer lead`) — **W1's, standing red since round 4 (W2-R4-08); thirteenth round of asking**, ruling
  owed. Its assertions are all over explicit expected-signature lists, so a new function cannot add a red there.
- `proposals/proposal_copy_immutability_test.sql` — the `proposals` column census does not classify
  `subject` (from `00590`, long merged). Nothing in W2 touches `proposals`.
- `capture_enrichment/target_type_visibility_test.sql` `c2` — `field_capture` RLS; untouched by W2.
- `edge_api/catalog_roles_remote_conformance_negative_test.sql` `:55` — `division by zero`; needs remote env.
I did **not** bisect these. The positive evidence that they are not mine: the local end state is *identical*
to the pre-change state (`owned_left_by_key = 0` locally, so `00620` stamped exactly the same rows), and the
only other delta is one function no role can execute.

## 5. THE STRATA COUNT — ASKED TWELVE TIMES, NOW MEASURED

Run read-only via `supabase db query --linked` (Management API; no mutation, nothing written):

```
projects_total              28
studio_id IS NULL            0      ← the whole sizing
designer_id IS NULL          0
created_by IS NULL           0      (created_by NOT NULL on Strata too)
distinct studio_id           3
stamp_employer_tier          0
owned_tier_answers           0
owned_left_by_key            0      ← W2-R12-01's population on prod today: ZERO
left_none                    0
Strata migration head   00590, 00591, 20260910152111  (none of 00595+ pushed yet)
```

**`00620` is a no-op on Strata as the book stands today: there is no legacy row to stamp.** That sizes both
HT-3-g(2) and W2-R12-01 at **0 projects** on the current prod population — the attrition is a real shape
but it has no victim on prod right now, and the key costs prod nothing either. Two caveats that keep this a
number to **re-read immediately before the push**, not a retired question:
1. `projects.studio_id` is nullable, and `00563`'s discovery can still leave it NULL at insert (an ambiguous
   designer), so rows can appear between now and the push. `00620` is what catches them; the key is what
   stops the wrong ones being reassigned.
2. The count was taken at the **current** Strata head (`00591`). The push carries `00595`–`00607`, `00615`,
   `00620`; none of them inserts a project, so the order does not change the population.
The exact query is `/tmp/claude/strata_sizing.sql` (the tier rule spelled inline, because
`designer_tier_pricing_studio` does not exist on Strata yet) — reproduce it before the push.

## 6. rulings.md

`artifacts/hour-tracking-2026-09-11/rulings.md`, the **HT-3-g** row, carries an appended
**AMENDED 2026-09-12 (W2 round-12 fix pass)** block: the lever HT-3-g(1) left, the measurement, the closure
as implemented, why it is not HT-3-f(2), the **fifth cost note (v)**, the HT-3-f(3) outcome it does not
reach, the coverage, and the one-predicate revert path **if Kody re-grades W2-R12-01 to a fifth cost note
instead of an amendment to HT-3-g(2)**. Flagged to Kody: this is an *amendment* to part (2) of his ruling,
not a reading of it — part (2) as written says "the tier rule ONCE", with no author key.

## 7. Not done, out of this lane
- Lane B's three copy obligations (the principal's sentence; her admin's empty project lens; a way to *see*
  that a project prices `'none'` and to perform the stamp). The fifth cost note adds a fourth: the employer
  of a departed hire reads **0** hours of a project it opened, with no act available — lane B owes it a
  visible fact.
- The owner-initiated **UNPIN** act (HT-3-f(4)) — still owed, still the largest closure of this class.
- `plan-v2` §W6's `00616`; W2-R6-06's inherited ruling (`amount_cents` owner/admin-only); W2-R2-13's
  invoiced-`notes` hole; and `public_rpc_authorization_contract_test.sql` `:171`.

## 8. Push

`99910ac70..217107400  hour-tracking/server -> hour-tracking/server`. The pre-push hook reported
`Affected verification has advisory failures` (its own advisory lane) and `prettier` drift on the
**generated** `database.types.ts`; neither blocks, and neither is chased here — the gates that matter for a
migration ran explicitly and green (clean replay, the SQL suite, `db:generate` + committed diff,
`admin-portal build`).

## 9. The Strata sizing query, in full (reproduce before the push)

```sql
WITH seats AS (
  SELECT m.user_id,
         array_agg(DISTINCT o.id) FILTER (WHERE m.role <> 'owner') AS employer,
         array_agg(DISTINCT o.id) FILTER (WHERE m.role =  'owner') AS owned
  FROM public.organization_members m
  JOIN public.organizations o ON o.id = m.organization_id
  WHERE o.type = 'design_studio' AND o.status = 'active'
    AND m.status = 'active' AND m.role <> 'guest'
  GROUP BY m.user_id
),
answer AS (
  SELECT p.id, p.created_by, p.designer_id,
    CASE
      WHEN COALESCE(array_length(s.employer,1),0) = 1 THEN 'employer'
      WHEN COALESCE(array_length(s.employer,1),0) > 1 THEN 'none'
      WHEN COALESCE(array_length(s.owned,1),0)    = 1 THEN 'owned'
      ELSE 'none'
    END AS tier,
    CASE
      WHEN COALESCE(array_length(s.employer,1),0) = 1 THEN s.employer[1]
      WHEN COALESCE(array_length(s.employer,1),0) > 1 THEN NULL
      WHEN COALESCE(array_length(s.owned,1),0)    = 1 THEN s.owned[1]
      ELSE NULL
    END AS studio_id
  FROM public.projects p
  LEFT JOIN seats s ON s.user_id = p.designer_id
  WHERE p.studio_id IS NULL AND p.designer_id IS NOT NULL
)
SELECT
  (SELECT count(*) FROM public.projects)                                                 AS projects_total,
  (SELECT count(*) FROM public.projects WHERE studio_id IS NULL)                         AS studio_id_null,
  (SELECT count(*) FROM public.projects WHERE studio_id IS NULL AND designer_id IS NULL) AS null_no_designer,
  (SELECT count(*) FROM public.projects WHERE created_by IS NULL)                        AS created_by_null,
  count(*) FILTER (WHERE a.tier = 'employer')                                            AS stamp_employer_tier,
  count(*) FILTER (WHERE a.tier = 'owned')                                               AS owned_tier_answers,
  count(*) FILTER (WHERE a.tier = 'owned' AND EXISTS (
      SELECT 1 FROM public.organization_members m2
      JOIN public.organizations o2 ON o2.id = m2.organization_id
      WHERE m2.user_id = a.created_by AND m2.status = 'active' AND m2.role <> 'guest'
        AND o2.type = 'design_studio' AND o2.status = 'active'
        AND o2.id IS DISTINCT FROM a.studio_id))                                         AS owned_left_by_key,
  count(*) FILTER (WHERE a.tier = 'none')                                                AS left_none
FROM answer a;
```

Run it read-only with `supabase db query --linked -f <file>` from `/Users/kody/Code/patina-merged`. The tier
rule is spelled inline because `public.designer_tier_pricing_studio` does not exist on Strata until this
program's push lands.

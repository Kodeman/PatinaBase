# W3 (P2) — fix log, round 12

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Reviews answered: `w3-review-r12-migrations.md` (2 major), `w3-review-r12-code.md` (1 major),
`w3-review-r12-qa.md` (1 owed policy question). Four findings in the brief: **three fixed, one
escalated** — `r12-qa-owed-1`'s own stated fix is "Orchestrator ruling needed (not a QA action)",
and no ruling in `rulings.md` §3 (last entry R-BP, 2026-09-14) reaches it.

Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). No server
started, no port taken, no prod touched, **no migration minted** — 00629 and 00631 are unapplied
on Strata and were edited in place. Every minor from all three r12 reviews is left standing,
deliberately, as in r10 and r11.

---

## R12-MAJOR-1 (migrations) — 00631's bid backfill rewrote `project_parties` in bulk with `set_updated_at_project_parties` still armed

**Changed:** `supabase/migrations/00631_project_party_bids.sql` (the two ALTERs at `:335` and
`:404`, a comment block stating the obligation, and the deploy NOTICE) and
`supabase/tests/people/w3_merge_sweep_household_test.sql` (new block **7d**, w1b block 21's
shape).

The backfill UPDATE (previously `:362-372`) is now bracketed exactly as `00624:806/819` brackets
its own stage backfill:

```sql
ALTER TABLE public.project_parties DISABLE TRIGGER set_updated_at_project_parties;
WITH strongest_bid AS ( … ) UPDATE public.project_parties pp SET bid_outcome = … ;
ALTER TABLE public.project_parties ENABLE TRIGGER set_updated_at_project_parties;
```

The deploy number 00624's comment asks for is printed beside the outcome breakdown. The four bid
columns are added by 00631 itself, so every seat carrying a `bid_outcome` after the statement is a
seat the statement wrote — `v_total` **is** the affected-seat count, and the NOTICE now says so
and says `updated_at` was deliberately not moved:

```
'00631 bid backfill: % seat(s) written by this statement (%) — updated_at deliberately NOT moved on any of them'
```

**Pinned, with its own negative control inside the block.** Block 7d stages what a reset cannot
reach (migrations run before seeds, so `trade_rfq_requests` is empty when 00631 runs): one
UNCARDED identity, `R12 Bidder`, phone `+16125559988` that no card in the studio carries, holding
a bid seat on the job the RFQ rail names — 400 days quiet — and a seat on a live job, 10 days
quiet, plus the `trade_rfq_requests` row that puts the old seat inside the backfill's reach. Then:

* **7d-a** the LIVE seat is the Directory winner before the backfill;
* **7d-b** the UNBRACKETED statement (run in a trapped sub-block, rolled back) **does** flip
  `person_id` onto the old bid seat — the mechanism, so if the two readers ever stop ranking an
  identity's seats by `updated_at` this assertion fails and the brackets must be re-argued;
* **7d-c** the shipped bracketed form still maps the outcome (`asked`);
* **7d-d** `person_id`, `project_id` and `last_touch_at` are all unchanged from 7d-a;
* **7d-e** the bid seat is still 400 days quiet.

Measured, on a fresh reset:

```
NOTICE:  7d. 00631's bid backfill: the UNBRACKETED statement flips an uncarded bidder's
         Directory row onto the old bid seat — person_id, project_id and last_touch_at all
         follow updated_at — and the shipped bracketed form maps the outcome while moving
         none of the three (r12 MAJOR-1): passed
```

---

## R12-MAJOR-2 (migrations) — the studio-less-seat pre-check asked a different resolver than the guard leg it stands in for

**Changed:** `supabase/migrations/00629_studio_contact_merges.sql:1429-1473` (the pre-check
predicate plus the comment that states why it is per-column) and
`supabase/tests/people/w3_merge_sweep_household_test.sql` (new blocks **11j** and **11k**; block
11i and its control are untouched).

`assert_project_party_cards()` (00624) raises `party_card_project_has_no_studio` from **two** legs
— `project_tenant_org(NEW.project_id) IS NULL` (any of the three card columns non-NULL), and
`project_recorded_studio(NEW.project_id) IS NULL` whenever `NEW.studio_contact_id IS NOT NULL`.
r11's pre-check asked only the first resolver. The predicate now asks, per matched column, the
question the leg that will judge that column asks:

```sql
WHERE (
        (pp.studio_contact_id = p_merged
         AND (public.project_tenant_org(pp.project_id) IS NULL
              OR public.project_recorded_studio(pp.project_id) IS NULL))
     OR ((pp.company_id = p_merged OR pp.warranty_contact_person_id = p_merged)
         AND (public.project_tenant_org(pp.project_id) IS NULL
              OR (pp.studio_contact_id IS NOT NULL
                  AND public.project_recorded_studio(pp.project_id) IS NULL)))
      )
```

The third conjunct is not a widening but the trigger's own shape: it is
`BEFORE INSERT OR UPDATE OF company_id, warranty_contact_person_id, studio_contact_id,
project_id` and its body reads `NEW.studio_contact_id` regardless of which column moved, so a seat
repointed only on its firm pointer still takes leg 2 **when it already carries a card**. A
studio-less seat carrying no card repoints its firm pointer perfectly well, and refusing it would
have cost the room a fold it can make.

**Negative control, measured** — `build/probe-w3-r12-fix-controls.sql`, fresh reset, one
transaction, ROLLBACKed, on the review's own shape (a studio-less job whose designer `a0…0003` is
an active co-member of a studio the caller `a0…0004` also belongs to, one pre-existing stamped
seat):

```
CONTROL resolvers:  tenant_org=b0000000-0000-0000-0000-000000000001 recorded_studio=<NULL>
CONTROL predicates: r11 finds 0 seat(s), shipped finds 1 seat(s)
CONTROL seat repoint: REFUSED -> party_card_project_has_no_studio     ← what r11 let through
CONTROL merge:        REFUSED -> merge_seat_on_studioless_project     ← the named refusal
```

`tenant_org` is the same `b0000000-…-0001` the review's probe-a reported, so the fixture is the
measured population and not a near-miss.

**Pinned.**

* **11j** stages that shape and asserts the fixture reproduces **only while the two resolvers
  disagree** (`project_tenant_org` NOT NULL *and* `project_recorded_studio` NULL — the mirror of
  11i's own control, which asserts the opposite and is left exactly as it was); then that the
  merge is refused `merge_seat_on_studioless_project` with the job in DETAIL, that
  `party_card_project_has_no_studio` never reaches the caller, that nothing was written, and that
  recording the job's studio unblocks the fold.
* **11k** is the widening's own control: a card-less studio-less seat whose `company_id` names the
  folded firm still merges, and the seat's firm pointer reads the survivor afterwards. It asserts
  the co-member leg resolves `b0…0001` before it runs, so the block fails loudly rather than
  silently changing meaning if the membership fixture moves.

```
NOTICE:  11i. r11 MAJOR-2 — a studio-less seat is refused by name, and the repair unblocks the fold: passed
NOTICE:  11j. r12 MAJOR-2 — a studio-less seat whose job's designer is a CO-MEMBER of the caller's
         studio is refused by name too, and the repair unblocks the fold: passed
NOTICE:  11k. r12 MAJOR-2 — a card-less studio-less seat's FIRM pointer still folds: the pre-check
         widened one column, not all three: passed
```

`merge_seat_on_studioless_project` is already in `MERGE_REFUSAL_SENTENCES`
(`use-studio-contacts.ts:1907-1933`, added in r11), so the sheet's `role="alert"` paragraph now
carries the studio's own sentence on both halves of the population. No portal change was needed.

---

## MAJOR-1 (code) — `retainedComplianceDocuments` lost the `doc_type` leg W3 round 8 added to `compliance_state()`

**Changed:** `packages/supabase/src/hooks/use-studio-contacts.ts` (a `samePaper()` test beside
`carriesGates()`, added to the `retired()` condition; the doc-comment now names all three legs)
and `packages/supabase/src/hooks/__tests__/people-crm-w3.test.ts` (three specs beside the chain
cases).

```ts
const samePaper = (root, successor) => successor.doc_type === root.doc_type;
…
if (inForce(successor) && carriesGates(root, successor) && samePaper(root, successor)) {
  return true;
}
```

`doc_type` is `text NOT NULL` in 00623, so `===` is the SQL's `=`.

**The SQL half re-measured this round** (`build/probe-w3-r12-doctype.sql`, rolled back):

```
A. before supersede:                 lapsed
B. after honest supersede:           current
C. successor retyped w9 -> SQL word: lapsed
D. root still has superseded_by=true, successor in force=true, successor blocks superset=true
```

Row D is the three facts the reducer read; with the fourth now asked, the browser keeps the row
the database is still counting, so the company card's Paper table, `paperHeldClause`,
`chaseTargetDocument` ("Chase the renewal"), the roster row's held clause, the picker's mini row
and `bringForwardConsequence` all print beside the word again.

**Pinned, and the pin proved.** Three specs: the retyped successor does **not** retire the lapse;
the same-paper successor still does (control); and the root's own `doc_type` rides the recursion,
so a retyped MIDDLE link does not end the walk — hop 2 still retires the root, which is what
00623's `c.root_doc_type` carry-forward does. Negative control: with `&& samePaper(root,
successor)` removed, **2 of the 3 fail** (`Tests 2 failed | 32 passed`); restored, `34 passed`.

---

## r12-qa-owed-1 — NOT FIXED: escalated, a ruling is owed

The finding's own `fix` field says *"Orchestrator ruling needed (not a QA action)"*, and both
branches it offers are rulings this agent may not make:

1. amend SPEC §5.7 / direction §6 task 5's acceptance text, **or** amend the seed fixture so the
   demonstrated walk does not collide with already-seated names; **or**
2. accept the current per-pick refusal sentence as the intended terminal behaviour for this
   demonstration project.

State confirmed this round: `rulings.md` §3's last entry is **R-BP (2026-09-14)** and nothing in
§3 reaches this question. R-BP itself rules on the same picker's candidate POOL (six people on
`Lindqvist`, Erin Sato listed not selected) and deliberately declines to invent an exclusion rule
— so branch 1's "amend the seed" option is the one in tension with a standing ruling, and branch
1's "amend the acceptance text" and branch 2 are the live candidates. The r11 code defect
underneath it (the all-or-nothing batch) is fixed and re-confirmed live by the r12 QA round; what
remains is only the policy question.

**Nothing was changed for this finding.** Changing the seed or the SPEC on my own reading would be
the liberty the brief forbids.

---

## Gates, this round

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` | rc=0, clean replay through 00633 |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed" (7d, 11j, 11k new) |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 |
| `rls/people_directory_scope_test.sql` · `rls/studio_contacts_test.sql` · `rls/project_roster_test.sql` · `rls/anon_table_grant_narrowing_test.sql` | rc=0 each |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** — no type drift |
| `python3 scripts/generate-legacy-grants.py` | **no diff** (no GRANT/REVOKE touched) |
| `pnpm --filter @patina/supabase type-check` | rc=0 |
| `pnpm --filter @patina/supabase exec vitest run` | 105 files, **1340 passed / 12 skipped** (was 1337/12) |
| `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | **34 passed** (was 31) |
| `pnpm --filter designer-portal type-check` | rc=0 |
| `npx jest src/components/document/roster src/components/document/people` | 38 suites, **591 passed** |
| `pnpm --filter admin-portal build` | rc=0, full route table |

No server started, no port taken, no prod touched, no migration minted.

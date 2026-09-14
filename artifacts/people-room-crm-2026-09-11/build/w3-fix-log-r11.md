# W3 (P2) — fix log, round 11

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Reviews answered: `w3-review-r11-migrations.md` (2 major), `w3-review-r11-qa.md` (1 major + 1
corroboration), `w3-review-r11-code.md` (1 blocking, 1 major). Six findings, all fixed; every
minor from all three reviews was left standing, deliberately, as in r10.

Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). No server
started, no port taken, no prod touched, no migration minted — 00628 and 00629 are unapplied on
Strata and were edited in place.

---

## MAJOR-1 (migrations) — a person-to-person merge let the absorbed card's free-text firm outrank the survivor's own firm card

**Changed:** `supabase/migrations/00629_studio_contact_merges.sql:1699` (§5's contact-facts
COALESCE) and `supabase/tests/people/w3_merge_sweep_household_test.sql` (new block 11h).

The `company_name` leg now carries the absorbed card's snapshot **only where the survivor can
resolve no firm at all** — its own `company_name` blank AND (`company_id IS NULL` OR
`company_id = p_merged`):

```sql
company_name = COALESCE(
                 NULLIF(btrim(s.company_name), ''),
                 CASE WHEN s.company_id IS NULL
                        OR s.company_id = p_merged
                      THEN v_merged.company_name END),
```

`s.company_id = p_merged` is the sole-proprietor fold's own shape — the pointer names the card
being folded, and the `v_cross` branch below deliberately leaves it there (r9 B-2 / r6 M-3) — so
r9 B-2's need is kept without moving the leg out of the shared path. A person card can never be a
`company_id`, so that leg cannot fire on a person-to-person merge.

**Pinned** by block 11h, which measures the exact shape the review measured: firm card
`R11 Northgate Probe Electric`, survivor with an open affiliation at it and no free text, absorbed
card carrying `R11 Northgate Elec (old typo)`.

- before the merge the survivor's `people_directory.meta.company_name` reads the firm card's name,
  and **after** it still does (it read the absorbed snapshot before the fix);
- the survivor's `studio_contacts.company_name` is still blank and its `company_id` still names the
  firm card — the two facts agree, which was the whole finding;
- R-BN: the absorbed card keeps its own typed name and still resolves forward;
- POSITIVE CONTROL: a survivor that can resolve **no** firm at all still takes the absorbed card's
  name (`R11 Orphan Firm Text`), so r9 B-2's rule is stated generally rather than deleted;
- block 11e (the sole-proprietor fold keeps the firm's own name) is the negative control and still
  passes untouched.

Result: `11h. r11 MAJOR-1 — a carried snapshot cannot outrank the survivor's own firm card: passed`.

---

## MAJOR-2 (migrations) — a merge of any card seated on a studio-less project aborted, printing a raw schema token

**Changed:** `supabase/migrations/00629_studio_contact_merges.sql` (a twelfth named refusal, before
the first write), `packages/supabase/src/hooks/use-studio-contacts.ts`
(`MERGE_REFUSAL_SENTENCES` + `asMergeError`), `supabase/migrations/00628_project_studio_id_backfill.sql`
(the preflight count), and the SQL suite (new block 11i) + `people-crm-w3.test.ts`.

`merge_studio_contacts()` now pre-checks its own seat set — every seat naming the absorbed card
through `studio_contact_id`, `company_id` or `warranty_contact_person_id`, which is
`assert_project_party_cards_trg`'s whole column list — and refuses by name before anything moves:

```sql
RAISE EXCEPTION 'merge_seat_on_studioless_project'
  USING DETAIL = v_studioless,   -- the job's name
        HINT   = 'One of these cards holds a seat on a job that records no studio, …';
```

It resolves `project_tenant_org()` in the caller's own session, exactly as the trigger does, so the
pre-check and the guard cannot disagree. The hook gives the token a sentence naming the act
("Record that job's studio first, then merge."), and `asMergeError()` reads PostgREST's `details`
for this one refusal so the sheet can NAME the job — "record that job's studio" is not an act
anyone can take without knowing which job.

**The W7 preflight count** the finding asks for is now printed by 00628's own NOTICE beside R-BD's
and R-BI's: the number of seats stamped with a rolodex card on `studio_id IS NULL` projects —
this finding's blast radius, since each one is a pair the room cannot fold until the job records a
studio. Locally it is 0.

**Pinned** by block 11i (R-BI's legacy shape, staged around both triggers the way block 6 stages
its own): the merge is refused `merge_seat_on_studioless_project`, the block FAILS if
`party_card_project_has_no_studio` reaches the caller, the DETAIL reads the job's name
(`W3 studioless legacy job`), the absorbed card is NOT folded (the refusal is before the first
write), and the CONTROL shows R-BD's own repair unblocks the fold — stamp the project's studio and
the same pair merges, the seat repointing onto the survivor.

Result: `11i. r11 MAJOR-2 — a studio-less seat is refused by name, and the repair unblocks the fold: passed`.

`people-crm-w3.test.ts` gains the sentence and the `details`-named variant, and the "no refusal
reaches a face as its own token" loop now carries the twelfth token.

---

## BLOCKING-1 (code) + R11-QA-CORROBORATE-1 — the merge consequence sentence promised a reduction the RPC does not make

**Changed:** `apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx`
(`mergeConsequenceSentence`, `carriedRows`/`FieldRow`, the field table's `dt`, and the post-merge
announcement) + its spec.

00629 UNIONs `trades` and `specialties` and ORs `is_sole_proprietor` (`:1717-1724`) — the QA round
measured it live (survivor `electrical`, folded card `plumbing`, survivor after the merge
`{electrical, plumbing}`). The sentence is split rather than softened:

> Everything else <merged> holds — the verdict, the notes and the payee facts — travels the same
> way, and where both cards say something <survivor>'s own words stand. **The trades and
> specialties on both cards are kept together, and a card recorded as a sole proprietor keeps that
> either way.**

`trades` is out of the "survivor's own words" list it used to sit in. The announcement at `:403`
carries the same split ("… own words stand — except the trades and specialties, which are kept
together"), and the three rows in the comparison table now print a clause under their label
(`data-compare-kept`: "both kept", "both kept", "yes on either card stands") so the two columns
stop implying a pick the survivor flip does not decide.

Pinned in `compare-merge-sheet.test.tsx`: the sentence assertions (including
`not.toContain("the verdict, the trades, the notes")`), the exact announcement string, and a new
spec asserting the three rows carry `[data-compare-kept]` while `Notes` does not.

---

## MAJOR-1 (code) — the roster row's paper sentences read only the firm's holder id

**Changed:** `apps/designer-portal/src/components/document/roster/roster-row.tsx` + its spec.

The row now reads the same holders the WORD reduces over (R-BA / R-BJ):

```tsx
const paperHolderIds = useMemo(
  () => (paperNeedsWords ? [row.companyId, row.personId].filter(Boolean) : []),
  [paperNeedsWords, row.companyId, row.personId],
);
const { data: heldPaper } = useComplianceDocumentsFor(paperHolderIds);
const paperHolderName = (doc) =>
  doc.holder_id === row.personId ? row.name : (row.companyName ?? row.name);
```

`blocking` (the held clause's source), `heldClause`'s holder name and `noticedPaperClause`'s holder
list and resolver all move with it — r10 MAJOR-2's own fix, carried from the picker's mini row to
the surface PR-h and direction §3.8 actually name. `CallSheetRow.personId` is
`people_directory_seats.person_id`, which is the seat's `studio_contact_id` where it has one, so it
is the same key `identity_paper_state()` reduces on.

Pinned by three new specs in `roster-row.test.tsx` (the fixture's one person-held document expires
2029-05-01 and carries no notice, so a walk cannot reach this):

- a sole proprietor seated with `companyId: null` and a lapsed personal licence now prints
  "Site access held. Dana Kowalski's licence lapsed 31 March 2026." — before the fix the query was
  disabled and the row printed the word `Lapsed` with no sentence at all;
- with a firm card present but the lapse on the PERSON, the clause names the person, not the firm;
- the `lapses_soon` notice clause does the same.

---

## R11-QA-MAJOR-1 — one already-seated pick cost the whole batch

**Changed:** `apps/designer-portal/src/components/document/roster/rolodex-picker.tsx` (`addPicked`)
+ its spec.

`addPicked` now splits the batch: the already-seated rows drop out, the rest are sent to
`bringForward.mutateAsync`, and the sheet says both halves ("Pete Rusk went on the call sheet. Rosa
Martínez is already on the call sheet."), leaving only the rows that did not go on ticked. That is
the same per-pick rule the RPC path already follows and the one `w3-room-report.md` §3 states out
loud ("One pick refused does not cost the others"). Where EVERY pick is already seated the sentence
and the no-write behaviour are unchanged, so the existing single-pick spec still holds.

Pinned by a new spec, "adds the rest when one ticked card is already on the sheet": one seated pick,
one fresh pick, exactly one pick sent, both sentences on the face, sheet stays open.

**OWED, not fixed here (a ruling, not a defect):** all four of Leah's task-5 people — Dana
Kowalski, Pete Rusk, Ingrid Halvorsen, Claire Bissett — are already seated on the seeded Okonkwo
residence (verified on a fresh reset), so the literal task-5 walk against that project still writes
zero seats, now with an accurate refusal sentence naming all four. The finding's second option
(amend the SPEC §5.7 / direction §6 task-5 acceptance text, or the fixture) is a SPEC amendment in
R-BP's shape and belongs to the orchestrator.

---

## Gates, run after the fixes

| Gate | Result |
|---|---|
| `pnpm supabase:reset` (full replay + every seed) | rc=0, clean replay, head 00633 |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — 11h and 11i pass, "W3 SQL suite: all blocks passed" |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." |
| `rls/people_directory_scope_test.sql` · `rls/studio_contacts_test.sql` · `rls/project_roster_test.sql` | rc=0 each |
| `SUPABASE_DB_URL=… pnpm db:generate` | no diff — no type drift |
| `python3 scripts/generate-legacy-grants.py` | re-run, no diff (no GRANT/REVOKE changed) |
| `pnpm --filter @patina/supabase type-check` | rc=0 |
| `pnpm --filter designer-portal type-check` | rc=0 |
| `pnpm --filter admin-portal build` | rc=0, full route table |
| `packages/supabase` `vitest run` | 105 files, **1337 passed** / 12 skipped |
| `apps/designer-portal` `npx jest` (whole suite) | 593 suites, **7670 tests**, 1 snapshot, all green (7665 before this round; +5) |

No server was started; no e2e run, per the brief.

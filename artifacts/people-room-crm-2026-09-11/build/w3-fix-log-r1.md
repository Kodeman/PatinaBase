# W3 (P2) — fix log, round 1

Every finding from `w3-review-r1-migrations.md`, `w3-review-r1-qa.md` and
`w3-review-r1-code.md` that Fable handed back, one entry each. Worktree
`.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started.**

Migrations 00629–00632 are unapplied on Strata and were edited in place; no new
migration number was minted (00621–00627 are W1's, 00628–00633 are W3's, and
00595–00620 stay reserved for the hour-tracking program).

---

## Gates, after every edit

| Gate | Result |
|---|---|
| `pnpm supabase:reset` (full replay + all 27 seeds) | clean |
| `supabase/tests/people/w1a_identity_channels_consent_test.sql` | "All W1a assertions passed." |
| `supabase/tests/people/w1b_compliance_authority_directory_test.sql` | "All W1b assertions passed." |
| `supabase/tests/people/w3_merge_sweep_household_test.sql` | "W3 SQL suite: all blocks passed" |
| `python3 scripts/generate-legacy-grants.py` | regenerated (+24 statements: the two re-issued 00629 functions, the new 00632 trigger fn) |
| `SUPABASE_DB_URL=… pnpm db:generate` | `packages/supabase/src/database.types.ts` +9 lines (`bid_asked_at`, `bid_quoted_at`, `bid_selected_at`) |
| `pnpm --filter @patina/supabase type-check` | clean |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/admin-portal build` | `✓ Compiled successfully`, 137/137 pages |
| `npx jest` (designer-portal, whole suite) | **592 suites, 7622 tests, all green** |
| `npx vitest run` (packages/supabase, whole suite) | **105 files, 1327 passed / 12 skipped** |

Playwright was not run: the brief forbids starting a server this round.

---

## B-1 · a firm merge flipped the survivor's paper word to `lapsed` — FIXED

`supabase/migrations/00629_studio_contact_merges.sql` (the compliance block
inside `merge_studio_contacts()`).

The unconditional `UPDATE … SET holder_id = p_survivor` is gone. crm-model §4
is now implemented as written — "documents of the absorbed firm keep their
original holder id and are marked superseded":

- an absorbed HEAD document moves onto the survivor **only** where the survivor
  already holds a legitimate successor: same `doc_type`, head of its own chain,
  still in force, dated when the absorbed row is dated, expiring no earlier,
  and carrying at least the absorbed row's `blocks`. That predicate is
  `assert_compliance_holder()`'s own supersede gate restated as a join, so a
  document the trigger would refuse is never offered one. The move writes
  `superseded_by` in the same statement, which is what makes the holder legal.
- the retired rows behind a moved head follow it in a depth-capped loop,
  outermost first, so each row's successor is already on the survivor when its
  own guard reads it.
- every other absorbed document stays on the absorbed card, whole, readable
  through `resolve_merged_contact()`, counting against nobody.
- the sole-proprietor cross-kind fold is carved out and still moves everything
  (holder_type rewritten to `person`): that is not an acquisition, the firm IS
  the person by declaration, and R-BA already reduces one paper word over both.

The function's `COMMENT` now states the rule.

Evidence (SQL suite block 1b, rolled back): survivor firm reads `current`
before the merge and `current` after; the absorbed lapsed `coi_gl` carries
`holder_id = <survivor>` and `superseded_by = <survivor's certificate>`; the
absorbed `bond`, which the survivor holds nothing to retire, is still on the
absorbed card with `superseded_by NULL`. Block 1's person-into-person
assertion was corrected to the same rule (the `license` stays on the absorbed
card, unsuperseded).

## B-2 · the ordinary "Add to the roster" write was refused after a merge — FIXED

`00629` §4b (new). `rolodex_card_for_party_phone()` is re-issued, grafted from
00626:413-436 with one predicate added — `AND sc.merged_into IS NULL` — so the
resolver cannot stamp a seat with a card §4's trigger will then reject.
`link_rolodex_card_to_parties()` is re-issued from 00626:522-548 with a
`NEW.merged_into IS NOT NULL → RETURN NULL` guard, closing the same collision
from the card's side (a cosmetic reformat of a merged card's phone stamped live
seats and then failed the card UPDATE). Same signatures, same
STABLE/DEFINER/search_path, same grants (still off `authenticated`), no consent
read or written (R-AY). Both `COMMENT`s updated.

Evidence (block 1b, after block 1's shared-phone merge): an INSERT naming no
card and carrying `(612) 555-0901` succeeds and comes back stamped with the
SURVIVOR. Live body check: `prosrc LIKE '%merged_into IS NULL%'` → `t`.

## M-1 · the shared-phone merge left the auto-link ambiguous forever — FIXED

Closed by B-2's filter, as the review predicted: the merged card stops counting
toward the `HAVING count(*) = 1` test, so the number resolves to the survivor
instead of staying NULL. Evidence: block 1b asserts
`rolodex_card_for_party_phone(project, '+16125550901') = <survivor>`.

## M-2 · `bid_quoted_by_person_id` was never repointed — FIXED

`00629`, inside `merge_studio_contacts()`'s seat block, for person survivors
only (only a PERSON card may hold the column). The function deliberately names
a column 00631 mints two files later; plpgsql resolves relations at first
EXECUTION, nothing calls this RPC between 00629 and 00632 (not the seeds, not
the suite — both run after every migration), and the alternative is a second
250-line copy of the body in 00632. The banner comment says so.

Evidence (block 1b): a seat whose bid was priced by the duplicate reads the
survivor after the merge, and the next ordinary save of that bid is not
refused.

## M-3 · a member merge bricked a `client_households` row — FIXED

`00629`, same block. `array_remove` then append, not `array_replace`, because
both ids may already be members (one spouse invited twice, both seated) and a
plain replace would leave the survivor in the household twice;
`primary_member_person_id` follows.

Evidence (block 1b): a household holding BOTH ids reads exactly
`{<survivor>}` afterwards with the primary repointed, and
`add_household_member()` still writes to it.

## M-4 · a plain member could ERASE the change-order figure — FIXED

`00632`, new `assert_household_threshold_principal()` +
`assert_household_threshold_principal_trg` (BEFORE UPDATE OF
`co_threshold_cents`). A WITH CHECK cannot see OLD, so the rule lives where OLD
is visible: a change in either direction — including to NULL — is refused
`household_threshold_forbidden` unless the caller is an owner or admin. The
policy's own leg stays. Internal callers (`auth.uid() IS NULL`) pass, exactly
as they pass the table's RLS (the 00627:549 posture).

`packages/supabase/src/hooks/use-households.ts` maps the new code to a sentence
("A change-order figure is the principal's to set, and the principal's to take
away…").

Evidence (block 1b, assertion tightened to accept ONLY
`household_threshold_forbidden`, not an RLS refusal): a plain member's
`SET co_threshold_cents = NULL` is refused and the figure is unchanged; the
owner writes it and clears it.

## M-5 · the nightly notice printed a schema word — FIXED

`00630`. A `v_paper` local maps the whole 00623 `doc_type` vocabulary to the
studio's words ("the certificate of insurance", "the W-9", "the licence", both
lien waivers, …) with "a document" as the terminal fallback, so no path reaches
the token; the studio's own `doc_label` still wins where it has one.

Evidence (block 2): zero notices match the token regex, and the lapsed notice
reads `The certificate of insurance for … lapsed …`. Measured before the fix:
`coi_gl for Ostrom Builders lapsed 31 Dec 2025.`

## M-6 · the Bidding band had no column for the dates its acceptance requires — FIXED

Minted rather than ruled around.

- `00631`: `bid_asked_at`, `bid_quoted_at`, `bid_selected_at` (`date`, like
  every other dated fact on a seat), with COMMENTs and a stated reason for
  carrying NO cross-date CHECK between them (they are a record of what
  happened, entered out of order from a paper file is ordinary; the
  `bid_valid_until >= bid_due_at` window is a different kind of fact).
- `00631` backfill widened: `bid_asked_at` ← `trade_rfq_requests.sent_at`;
  `bid_quoted_at` ← `responded_at`, else the EARLIEST `trade_scope_bids.noted_at`
  of a quoted/selected row (a second quote is a revision); `bid_selected_at` ←
  the `noted_at` of a `selected` row. Each `COALESCE`d so a typed value wins.
- `packages/supabase/src/hooks/use-coordination.ts`: `SeatBid` carries the
  three; `SEAT_BID_COLUMNS` is the one column list `useProjectPartyBids` and
  `useRemoveProjectParty` both read; `useSetPartyBid` writes them.
- `apps/designer-portal/src/lib/document/roster-derivation.ts`: `bidNote()`
  prints them in chronological order, which is also the order the two
  acceptance strings are written in.
- `roster-row.tsx`: three more date fields in the editor ("The studio asked",
  "The number came back", "The studio chose them"), written on save.
- `supabase/seed/people_crm_dev.sql`: Rivera Finishes' seat gets
  `bid_asked_at = 2026-09-28`, `bid_due_at = 2026-10-05` (the dates its own
  `created_at`/`updated_at` already implied), so SPEC §5.4 #9's row is
  walkable rather than merely recordable.

Evidence: new jest case asserts the rendered `data-bid-note` contains
`Asked 28 September 2026. Due 5 October 2026.` (SPEC §5.4 #9) and
`Quoted 2 October 2026. Selected 9 October 2026.` (R-R), both verbatim and
adjacent; block 1b asserts the three columns round-trip; after reset the seeded
Rivera row reads `2026-09-28 | 2026-10-05 | no_response`.

## M-7 · `people_directory`'s TEAM branch had no tenant leg — RULED AND FIXED

`00629` §6. The TEAM branch takes the same
`is_active_studio_member(project_tenant_org(tm.project_id)) OR designer_id /
lead_designer_id / created_by = auth.uid()` leg every other branch already
carried (R-BD). A co-member of the designer of record through a SECOND studio
no longer reads the working studio's teammate names, `job_title`/`staff_role`
or the project id. The branch's own comment no longer says "verbatim".

Evidence: `pg_views.definition LIKE '%project_tenant_org(tm.project_id)%'` →
`t`; W1b's 26 directory assertions still pass.

## QA-1 · the band denied a household the rows above it asserted — FIXED

`use-households.ts` `useProjectHousehold` now also answers
`clientSideHasAuthority` — whether any client-side seat on the job carries an
open `project_party_authority` row.
`household-band.tsx` exports `householdEmptySentence(hasAuthority)`; the empty
state reads "No household is on file for this client yet, so what each of them
may sign is recorded seat by seat rather than in one place." where a grant
exists, and keeps the original sentence where none does. Neither wording
contradicts the client rows.

Evidence: two new jest cases (the sentence function, and the rendered band with
`clientSideHasAuthority: true` asserting the old clause is ABSENT).

## QA-4 / BLOCKING-1 · "Open a household" minted a row the face could never find — FIXED

Both halves the review asked for:

- `CreateClientHouseholdInput` gains `memberPersonIds`, written on the INSERT;
  `household-band.tsx`'s `openHousehold` seeds it from `resolved.memberCardIds`,
  which it already had in hand.
- `useProjectHousehold` reads `designer_clients.household_id` FIRST (the
  pointer `useCreateClientHousehold` already writes, and the resolver already
  resolved `designerClientId` for), and falls back to the `.overlaps()` read so
  a no-login household — which has no client record at all — is still found by
  its seats.

Evidence: new jest case asserts the create call carries
`memberPersonIds: ['card-adaeze']`. The whole of W3 scope 4
(`data-household-threshold`, "Set the figure", "Add a household member") sits
inside `if (household)` and is now reachable from a clean state.

## QA-3 / MAJOR-6 · the prior-job search could only find a card's latest job — FIXED

`useStudioContactHistory` now accumulates `projectNames: string[]` (distinct,
newest first) out of the rows the same single query already returns — zero
extra requests — and the picker searches over all of them.

Evidence: new jest case searches "Lindqvist" against a card whose
`lastProjectName` is "Ellsworth" and finds it.

## QA-5 · the wave's own e2e spec never executed — FIXED

`e2e/people/bring-forward.spec.ts:65`: the `title: projectName,` line is gone.
Confirmed against the database that `title` belongs to `svc_projects.projects`
(the Prisma service schema) and `public.projects` carries `name` only — which
is why PostgREST answered PGRST204. The spec's "Add no to the roster"
assertion was updated with MAJOR-4. Not executed this round (no servers).

## MAJOR-1 · the hard delete destroyed the bid it exists to protect — FIXED

`use-coordination.ts`: `seatCarriesBid(bid)` exported; `useRemoveProjectParty`
selects `SEAT_BID_COLUMNS` in its seat read and ORs `hasBid` with "any bid
column is non-null"; the hook's comment now says the check widened with the
columns, as it promised. `roster-row.tsx` passes the same fact
(`BID_STAGES.includes(row.stage) || hasBid`), so the act is held with its
sentence before it is pressed.

Evidence: new vitest block walks every one of the eight columns on its own, and
pins that a `selected → awarded` / `withdrawn → off_job` seat still answers
`true`.

## MAJOR-2 · ticked rows were silently dropped when the list changed — FIXED

`rolodex-picker.tsx`: an effect prunes `picked` to the cards still in
`cardById` on every change, so the count, the act label, the consequence
sentence and the insert name the same people.

Evidence: new jest case ticks a row, narrows the search, and asserts the act
reads "Add to the roster" and `data-pick-count` reads "0 of 1 selected".

## MAJOR-3 · the bid editor's consequence sentence was not a sentence — FIXED

`roster-row.tsx` reads `SEAT_BID_OUTCOME_LABELS` (the state map W3 defined,
exported and used nowhere) instead of `SEAT_BID_OUTCOME_ACTS.toLowerCase()`.

Evidence: jest asserts the exact string "Recording this moves Rivera Finishes
to Declined. A bidder who did not win never reads as crew."; a new vitest block
pins that no label starts with "They ".

## MAJOR-4 · the picker opened reading "Add no to the roster" — FIXED

`bring-forward.ts`: `bringForwardActLabel(0)` is "Add to the roster". R-I
forbids gating the act, so the wording is the whole fix. The three places that
pinned the old string — the unit test, the component test and
`e2e/people/bring-forward.spec.ts:241-243` — were updated.

## MAJOR-5 · the pick-count named a job most of the page never worked — FIXED

`rolodex-picker.tsx`: a row with no history now answers `null` into the name
set (rather than being filtered out before the uniqueness test), so a mixed
page names nothing; and the history rollup excludes the OPEN `projectId`
(`useStudioContactHistory(ids, { excludeProjectId })`), so the sheet can never
print "from the Okonkwo residence" while adding to Okonkwo. Where the studio
searched a job, the shared name is the MATCHED job rather than the newest one.

Evidence: two new jest cases (a mixed page reads "0 of 2 selected"; every
history call carries `excludeProjectId: 'proj-1'`).

## MAJOR-7 · "Selected" and "They withdrew" were one-way doors — FIXED

`roster-row.tsx`: the `data-bid-editor` region renders for
`isSeat && (band === 'bidding' || seatCarriesBid(bid))`, so an awarded seat
(banded by window) and an off-the-job seat (banded to Done) keep the door. The
opener relabels to "Change what came back" on a seat that already carries a
bid, because "Write the bid" is the wrong act word there.

Evidence: jest case rerenders across four band/bid combinations and asserts the
editor's presence and the opener's label in each.

---

## Deliberately NOT changed

The ten `minor-*` / `m-*` items in the two reviews, and QA-2 / QA-6 / QA-7 /
QA-8, were not in the handed-back list and are untouched — except QA-6, whose
defect is MAJOR-3's and is therefore fixed by it.

## Owed

- A Playwright run of `e2e/people` (this round forbade servers). The two specs
  the wave added have still never executed end to end; QA-5's blocker is
  removed, QA-3's cause is fixed, and MAJOR-4's assertion is updated, so the
  next round with a server should be the first honest read of them.
- A signed-in walk of the Bidding band and the household band on the reset
  seed.

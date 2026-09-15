# W3 (P2) — adversarial code review, round 13

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `227d68ac1`.
Range reviewed: `3d65f81e4..HEAD` over `apps/designer-portal/src` and `packages/supabase/src`
(45 files, +9795/−165). Working tree clean; no migration minted; nothing pushed.

**Verdict: NOT clean — 3 major, 7 minor, 0 blocking.**

---

## 0. Prior findings, re-checked

| Prior finding | State |
|---|---|
| r12 MAJOR-1 (migrations) — 00631's bid backfill moved `updated_at` | **FIXED.** `00631:335` `DISABLE TRIGGER set_updated_at_project_parties`, `:404` re-enable, `:423` the NOTICE naming the obligation. SQL block 7d present and passing. |
| r12 MAJOR-2 (migrations) — studio-less pre-check asked the wrong resolver | **FIXED.** `00629:1459-1471` asks per matched column; blocks 11i/11j/11k all pass. |
| r12 MAJOR-1 (code) — `retainedComplianceDocuments` lost the `doc_type` leg | **FIXED.** `use-studio-contacts.ts:1590` `samePaper`, read at `:1607`. `people-crm-w3.test.ts` now 34 (measured). |
| r12-qa-owed-1 — the Leah-task-5 / seed collision | **STILL OPEN, correctly escalated.** No ruling in `rulings.md` §3 reaches it (last entry R-BP). Not a code finding; not re-raised here. |

Gates re-run this round, in this worktree:

| Gate | Measured |
|---|---|
| `pnpm --filter @patina/supabase type-check` | rc=0, no output |
| `pnpm --filter designer-portal type-check` | rc=0, no output |
| `pnpm --filter admin-portal build` | **EXIT=0** |
| `apps/designer-portal` `npx jest` (full) | **593 suites, 7670 tests, 1 snapshot — all passed** |
| `apps/designer-portal` `npx jest src/components/document/{roster,people} src/lib/document` | 149 suites, 2937 passed |
| `packages/supabase` `npx vitest run` (full) | **105 files, 1340 passed / 12 skipped** |
| `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | **34 passed** |
| `psql … supabase/tests/people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed" |
| `npx eslint src/components/document/{roster,people} …` | **0 errors, 4 warnings** (all pre-existing, in files this wave did not touch) |

No dev server started, no port taken, no prod touched.

---

## MAJOR-1 — an ARCHIVED estimator silently erases "Priced by …" from every bid it priced
**Confidence: high.** `apps/designer-portal/src/components/document/roster/roster-row.tsx:406-408`,
`apps/designer-portal/src/components/document/roster/roster-groups.tsx:75-77`, `:119-127`.

```ts
// roster-groups.tsx:75
const { data: contacts } = useStudioContacts(consentOrg ?? null, {
  includeArchived: false,
});
…
const bidPeople = useMemo(() => (contacts ?? []).filter(c => c.entity_kind === 'person' …
```
```ts
// roster-row.tsx:406
const quotedByName =
  (bidPeople ?? []).find((p) => p.id === bid?.bidQuotedByPersonId)?.name ?? null;
```

`bidNote` (`roster-derivation.ts:988`) prints `Priced by <name>.` only when `quotedByName` is
non-null, and `bidPeople` is the archived-excluded rolodex. W3 shipped **both** halves of this
interaction in one wave: the estimator field (00631, the seven-field editor) and
`ArchiveCardDoor` — the standing "Put this card away" act now on every person card
(`person-profile.tsx:429-437`). Putting an estimator's card away is the canonical reason to use
that door (they left the firm), and the moment it is pressed:

- every Call Sheet row whose seat records them loses `Priced by Tom Marrow.` from
  `data-bid-note`, with nothing said, while `project_parties.bid_quoted_by_person_id` still names
  them; and
- the bid editor's **Who priced it** select (`roster-row.tsx:889-906`) is a controlled `<select>`
  whose `value` is `bidDraft.quotedBy` = the archived id, with no matching `<option>`, so the
  browser renders it at `selectedIndex = -1` — blank. Two faces assert nobody priced the job over
  a record that names one.

Nothing in the report or the rulings scopes this to W4. The fix is the shape `compare-merge-sheet`
already uses for the same problem (`compare-merge-sheet.tsx:327-329` reads the book with
`includeArchived: true` precisely so designation ids still resolve to names): resolve the
estimator's name from a book that includes archived cards, and keep the *selectable* options
archived-excluded.

## MAJOR-2 — the merge consequence sentence says the folded card's contact rule stays behind when the folded card has no rule
**Confidence: high.** `apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx:108-119`.

```ts
const moves = survivorHasRule
  ? "seats, channels and firm designations"
  : "seats, channels, contact rule and firm designations";
const ruleStays = survivorHasRule
  ? `${survivorName}’s own contact rule stands, and ${mergedName}’s stays on the folded card as a record. `
  : "";
```

The branch asks only whether the **survivor** carries a rule. It never asks whether the **folded**
card carries one. Call site: `:567-571`, `!!(survivorId && ruleIndex.get(survivorId))`.

The ordinary duplicate is exactly the failing case. PR-o pre-picks the **older** card as survivor
(`preferredSurvivorId`, `:64-72`), and the older, established card is the one likely to carry a
contact rule while the fresh duplicate carries none. In that state the sheet prints, three
elements apart on one screen:

- `data-compare-field="Contact rule"` → `"No contact rule on file."` in the folded card's column
  (`:374-376`, `:392`); and
- `data-merge-consequence` → *"…and Chidi Okonkwo's stays on the folded card as a record."*

`merge_contact_rule_conflict` does not cover this: 00629 refuses only where the folded card's rule
is blocking or routing and the survivor says something else (the file's own note at `:104-106`), so
a folded card with **no** rule merges cleanly and the sentence is simply false about it.

The mirror case is weaker but the same defect: with neither card carrying a rule, the first clause
still lists "contact rule" among the things that move, over two columns both reading
"No contact rule on file."

The sentence has to branch on the pair, not on the survivor alone — the same discipline r11
BLOCKING-1 applied to trades/specialties/sole-proprietor.

## MAJOR-3 — the merge does not invalidate two keys it writes through
**Confidence: medium-high.** `packages/supabase/src/hooks/use-studio-contacts.ts:2025-2038`.

`useMergeStudioContacts.onSuccess` invalidates ten roots. Two things 00629 writes are not among
them:

| 00629 writes | key that reads it | invalidated? |
|---|---|---|
| `project_parties.bid_quoted_by_person_id` (`00629:2254-2256`) | `partyBidKeys` = `['project-party-bids']` (`use-coordination.ts:2409`) | **no** |
| `client_households.member_person_ids` / `primary_member_person_id` (`00629:2303-2311`) | `clientHouseholdKeys` = `['client-households']`, incl. `useProjectHousehold`'s `['client-households','project',projectId]` (`use-households.ts:94-100`, `:218`) | **no** |

`['project-parties']` is invalidated (`:2036`) but that is a different root from
`['project-party-bids']`, so it does not reach the bid read.

This is not self-healing on a remount: the portal's QueryClient runs
`staleTime: 1000 * 60 * 5` with `refetchOnWindowFocus: false`
(`apps/designer-portal/src/lib/react-query.ts`, `defaultOptions.queries`). So a Call Sheet opened
within five minutes before the merge keeps the **folded** estimator id in `project-party-bids`,
while `bidPeople` refetches (its root *is* invalidated) and now carries only the survivor —
producing MAJOR-1's blank face from a cache, not from an archive. The household band keeps stale
membership over the same window.

The room report §2 states the list is "every key a card's facts are read through … Pinned by
test." That claim is false for the two keys this wave itself minted, and the pin does not cover
them.

---

## MINOR-1 — a held act rendered with native `disabled` and no reason on the face
**Confidence: medium.** `roster/household-band.tsx:719-720`; same shape at
`people/compare-merge-sheet.tsx:584`.

```tsx
disabled={addHeld || !personId || addMember.isPending}
held={addHeld}
```

`held` covers only the PR-n case. In the sheet's own **opening state** — `personId` is `""`
(`:278`) — the primary act takes the native `disabled` attribute, leaves the tab order, and
carries no `aria-describedby` and no sentence. That is the grammar this wave states for itself two
components over: *"`aria-disabled` plus `aria-describedby` plus a sentence on the face, never a
`disabled` attribute and never a silent absence"* (`people/archive-card-door.tsx:12-17`), and the
band's other three acts (`:443`, `:567`, `:597`) honour it.

`compare-merge-sheet.tsx:584`'s `!canMerge` is transient in the happy path but permanent whenever
one of the two cards fails to load — the effect at `:289` requires both — leaving "Merge into
This card" natively disabled with nothing said.

## MINOR-2 — the People room's three new files fall off the `.t-*` type steps
**Confidence: high.** The room's shipped files carry **zero** raw prose sizes — `company-card.tsx`,
`views/person-profile.tsx`, `reach-access.tsx`, `views/directory-view.tsx` use `t-body-sm` /
`t-heading` and reserve `text-[11px]` for mono eyebrows. The new files introduce off-step sizes:

- `people/compare-merge-sheet.tsx:501` `text-[1.35rem]`, `:553` `text-[0.85rem]`, `:602` `text-[0.72rem]`
- `people/close-seat-act.tsx:93` `text-[0.8rem]`, `:137` `text-[0.72rem]`
- `people/archive-card-door.tsx:115` `text-[0.7rem]`, `:124` `text-[0.72rem]`

(The roster surfaces' raw sizes are the pre-existing Call Sheet idiom and are not counted here.)
Zero `box-shadow` / `shadow-*` in any W3 file; every `var(--…)` used resolves at `:root`
(`globals.css:1975-2002`, `:35`) — those halves of the grammar are clean.

## MINOR-3 — a partly successful bring-forward announces its success through the refusal channel
**Confidence: high.** `roster/rolodex-picker.tsx:723-745`, rendered at `:1042-1046`.

`addedSentence` ("4 people went on the call sheet. ") is concatenated into `setError(...)` and
painted `role="alert"` in `var(--color-terracotta-ink)` — the blocked pigment. A studio that added
four of five reads the whole outcome as a failure. The room has a `role="status"` announcer
(`onAdded` → `setAdded`) for exactly the success half.

Second, smaller: `writeErrorMessage({ message: result.refused[0].reason }, …)` (`:733-737`)
translates only the **first** refusal for a sentence that may name several refused people with
different reasons.

## MINOR-4 — the room report's own numbers and prose are stale against the files
**Confidence: high.** `artifacts/people-room-crm-2026-09-11/build/w3-room-report.md`.

- §9: jest "7656 tests" — measured **7670**; vitest "1335 passed" — measured **1340**;
  `people-crm-w3.test.ts` "29 passed" — measured **34**. The table says "re-measured after the r8
  round"; r9–r12 moved all three.
- §1 test inventory (`people-crm-w3.test.ts` 29, `compare-merge-sheet.test.tsx` 15, …) is the same
  pre-r9 census.
- §2 says `merge_studio_contacts()`'s **"eleven"** refusals; `MERGE_REFUSAL_SENTENCES` holds
  **twelve** (`use-studio-contacts.ts`, `merge_seat_on_studioless_project` added r11) and the code
  comment above it says "twelve".
- §2's block-quoted consequence sentence still reads *"the verdict, the trades, the notes and the
  payee facts"*; r11 BLOCKING-1 split trades/specialties into their own clause and the file no
  longer composes that string (`compare-merge-sheet.tsx:132-136`).
- §1 lists `carriedConsentNotice` among `lib/document/bring-forward.ts`'s exports; it was removed
  (the file records its own removal at `:144-158`) and is not exported.

## MINOR-5 — the household overlap read is unordered and unscoped
**Confidence: high.** `packages/supabase/src/hooks/use-households.ts:384-388`.

```ts
.from("client_households").select("*")
.overlaps("member_person_ids", memberCardIds)
.limit(1);
```

No `ORDER BY` beside the `LIMIT 1`, so which household a job resolves to is left to the plan if two
ever overlap one card, and no `.eq('organization_id', …)`: the whole tenant scoping rests on
`client_households_studio_select` (`00632:223-230`,
`is_active_studio_member(organization_id) AND is_studio_comember(designer_id)`). **Not** a
cross-tenant hole — the policy holds — but the query states none of it, and a co-member reader
belonging to two studios is the population the policy is widest for.

## MINOR-6 — opening a household is two statements, and the second can fail after the first landed
**Confidence: high.** `packages/supabase/src/hooks/use-households.ts:418-442`.

The INSERT commits, then `designer_clients.household_id` is written in a separate statement; a
refusal there throws *after* the household row exists. The band reports "Could not open the
household." over a household that was opened — recoverable (the overlap read still finds it,
because `memberPersonIds` is seeded at creation), but the act's report disagrees with the record.
`add_household_member` and `set_household_threshold` are both RPCs for this reason.

## MINOR-7 — seat writes do not invalidate `useProjectHousehold`
**Confidence: medium.** `use-coordination.ts` — `useBringForward.onSuccess` (`:2684-2690`),
`useCloseProjectPartySeat`, `useAddProjectParty` invalidate `['project-parties', id]`,
`['project-roster', id]`, `peopleKeys.all`, `peopleSeatKeys.all` — none of them
`['client-households', 'project', …]`, which is where `useProjectHousehold` caches this job's
client-side seats, its `memberCardIds`, its `clientSideHasAuthority` and its
`clientSideMoneyGrants` (`use-households.ts:216-399`).

With the 5-minute `staleTime`, the band's gate can disagree with the sheet above it on the same
screen: seat a `client_rep` and `Open a household` keeps reading `aria-disabled` with "Seat the
client on this job first"; close the only client seat and `householdWouldBeFindable`
(`household-band.tsx:331-332`) stays true, so the door is live over a state that would mint a
household the resolver cannot find again — r3 MAJOR-2's own shape, reached through the cache
rather than through the query. (`useAddHouseholdMember` and `useSetHouseholdThreshold` do
invalidate it, `use-households.ts:498-500`, `:536-538`.)

---

## What was checked and found sound

- **Travel list writes only the allowed facts.** `useBringForward`'s INSERT
  (`use-coordination.ts:2645-2656`) names `project_id, party_kind, display_name, company_name,
  company_id, trade, phone, email, studio_contact_id` and nothing else — no pricing column, no
  note, no `show_to_client`, no bid column. `STAYS_BEHIND` (`travel-list-pane.tsx:30-34`) is
  honoured exactly.
- **Consent is never copied per seat (R-AY).** No consent column in the insert; the picker reads
  the verdict live off `studio_channel_consent` keyed on `phone_e164`
  (`rolodex-picker.tsx:717-722`, `:897-910`) and composes it through the one composer
  (`consentSentence`), with `carriedConsentNotice` deleted rather than duplicated.
- **Merge survivor flip.** `preferredSurvivorId` pre-picks the older card, ties broken on id;
  taken once (`:289`) so a refetch cannot undo a flip; both column heads are `aria-pressed`
  buttons (`:458-461`); `survivor_flipped` is measured (`:427-430`). e2e asserts the flip both
  ways (`merge.spec.ts:114-124`).
- **PR-n gating.** `householdAddIsHeld` mirrors 00632's own grant leg; `Set the figure` /
  `Take the figure away` are `aria-disabled` with `aria-describedby` at a reason paragraph that is
  on the face pressed or not (`household-band.tsx:564-620`); `parseThresholdEntry` refuses a
  non-figure rather than NULLing the grants; taking the figure away is its own named two-step act
  with its own consequence sentence.
- **Close this seat replaced every hard delete.** `useRemoveProjectParty` has exactly one call
  site in the whole portal — `roster-row.tsx:246`, behind `seatDeleteRefusal`, whose `hasBid` leg
  now reads the bid COLUMNS as well as `stage` (`use-coordination.ts:949-954`, and the same
  widening on the pre-read select at `:916-919`). `CloseSeatAct` is mounted on the person card's
  live seats (`person-profile.tsx:518-526`, `liveSeats` only). The word "Remove" appears on no
  people or roster surface.
- **The bid write and the face read the same answer.** `bidStageOutcome` is the single predicate
  (`use-coordination.ts:2390-2407`), read by the mutation (`:2548-2550`) and by the editor's
  three-branch consequence sentence (`roster-row.tsx:452-455`, `:473-489`), plus a fourth branch
  for clearing. `off_job_at` is stamped on the transition only. Band derivation reads `stage`, never
  `off_job_at` (`roster-derivation.ts:751`, `:806`), so a corrected `withdrawn` leaves no stale
  date on a face.
- **Expiry notices.** `noticedPaperClause` is one formula on three surfaces; it prints only where
  `studio_compliance_notices` holds a row, and 00630's sweep is itself gated on
  `cardinality(d.blocks) > 0` (`00630:379`), which is the same predicate `documentPaperState`
  uses — so no row can read `Current` beside a notice. The roster row's `lapses_soon`-only gate is
  correct: the lapsed case is already carried, with its date, by `heldClause`.
- **SPEC vocabulary.** No schema token reaches a face in any W3 file; `client_rep`,
  `no_response`, `off_job`, `bid_outcome` appear only as code values behind label maps.
- **e2e.** `e2e/people/{bring-forward,merge}.spec.ts` are chromium-pinned via
  `test.skip(browserName !== 'chromium')`, assert through `e2e/helpers/supabase-admin`'s `adminDb`
  with `expect.poll`, use web-first `expect(locator)` throughout, and tear down what they create.
  (There is no `WaitHelpers` module in this repo's `e2e/helpers/`.)
- **Generated types.** No drift (re-confirmed; `packages/supabase/src/database.types.ts` matches
  the local database at 38524 lines).

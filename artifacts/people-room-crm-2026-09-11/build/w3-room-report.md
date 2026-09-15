# W3 (P2) — the room: Compare & merge, Bring forward, the Bidding band, the household, Close this seat

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**Nothing was pushed to Strata**: no `supabase db push`, no `supabase functions deploy`, no portal
deploy. **No migration was minted** — W3's data layer (00628–00633) was already on the branch and
this wave is the surface over it. No dev server was started; no Playwright run.

The room stops losing facts. Duplicates converge on one card with both ids still resolvable, a
repeat pick arrives carrying its consent and its paper, a bid answer moves the bidder out of the
crew bands, the household's change-order figure has a home, and closing a seat is a dated act on
every surface that offers one.

**Carried forward against the shipped files after the r15 round (code review r15 MAJOR-3; the same
defect r7 M-4 and r8 MAJOR-1 filed before it).** This report was first written before the review
rounds and then went stale twice over, describing faces the code no longer had. Re-measured against
HEAD in the r15 fix round: §1's export list and every test count, §2's quoted consequence sentence
and refusal count, §6's CloseSeatAct claim, §7's Lakeshore date, §9's gate numbers and §10 item 1.
Where a number comes from a seed whose dates are relative to `current_date`, it is now stated
relative to the seed rather than as a literal that drifts a day per day.

---

## 1. Files

### New — `packages/supabase/src/hooks/`

| File | What it is |
|---|---|
| `use-households.ts` | E3 (00632, PR-c). `ClientHousehold`, `clientHouseholdKeys`, `useClientHouseholds` · `useClientHousehold` · `useProjectHousehold` · `useCreateClientHousehold` · `useSetHouseholdThreshold` · `useAddHouseholdMember`, `asHouseholdError`, `HOUSEHOLD_MEMBER_ROLE_LABELS` |

### New — `apps/designer-portal/src/`

| File | What it is |
|---|---|
| `components/document/people/compare-merge-sheet.tsx` | PR-o's own DocSheet: two columns field by field, the flippable survivor pick, the consequence sentence, the terminal act. Plus `mergeCardName`, `preferredSurvivorId`, `mergeConsequenceSentence` |
| `components/document/people/close-seat-act.tsx` | `CloseSeatAct` — the two-step dated close **as the person card mounts it** (`person-profile.tsx` is its only importer). The Call Sheet row keeps the original copy it grew in W2 (`roster-row.tsx`'s `closing` block), because that surface carries the surviving hard delete in the same act row; the two are hand-kept in step, not one component (r15 MAJOR-2). Plus `closeSeatConfirmSentence` |
| `components/document/people/archive-card-door.tsx` | The standing archive/restore door with its reason line always visible. Plus `archivedSentence` |
| `components/document/roster/travel-list-pane.tsx` | SPEC §5.7 #5: `TRAVELS` / `STAYS_BEHIND`, the fixed contract |
| `components/document/roster/household-band.tsx` | The Client side band's household: the figure as a sentence, PR-n's gate, "Add a household member". Plus `householdThresholdSentence`, `householdMemberConsequence` |
| `lib/document/bring-forward.ts` | The picker's sentences: `countInWords`, `pickerHistoryLine` (moved), `bringForwardSelectionLine`, `bringForwardActLabel`, `BringForwardRowFacts`, `bringForwardConsequence`. (`carriedConsentNotice` was deleted by r4 MAJOR-1 in favour of the one composer in `consent-sentence.ts`; the file's own comment records it) |
| `lib/document/compliance-notice.ts` | 00630's sentence, one formula for three surfaces: `expiryNoticeClause`, `noticedPaperClause`, `noticePaperNoun` |

### Changed

| File | Change in one line |
|---|---|
| `packages/supabase/src/hooks/use-studio-contacts.ts` | The merge record (`useMergeStudioContacts`, `useStudioContactMerges`, `asMergeError`, `MERGE_MATCHED_ON_LABELS`); archive/restore repointed at 00629's RPCs with `asArchiveError`; `useComplianceNotices` + `indexComplianceNotices`; `useComplianceDocumentsFor`; `StudioContactHistory` gains `lastClosedYear` |
| `packages/supabase/src/hooks/use-coordination.ts` | `ProjectParty` gains the five bid columns; `SeatBidOutcome` + `SEAT_BID_OUTCOME_STAGE`/`_LABELS`/`_ACTS`; `useProjectPartyBids`, `useSetPartyBid`, `asBidError`, `partyBidKeys`; `useBringForward`; `invalidateClientHouseholds` in the six seat/authority mutations (r15) |
| `packages/supabase/src/hooks/index.ts` | The four new export blocks |
| `people/views/directory-view.tsx` | The duplicate band gains "Compare these two" and mounts `CompareMergeSheet`; `onAnnounce` prop |
| `people/people-room.tsx` | Wires the Room's notice + announcer to the Directory's `onAnnounce` |
| `people/views/person-profile.tsx` | R1 gains the archive door; every live seat gains Close this seat |
| `people/company-card.tsx` | The Paper region prints the expiry notice's sentence |
| `roster/rolodex-picker.tsx` | Multi-select, the travel-list pane, the act row + consequence sentence, the carried-consent notice, the expiry notice, and a search that reads the prior job |
| `roster/party-mini-row.tsx` | `multi` — a square checkbox mark and checkbox semantics beside the existing radio |
| `roster/roster-row.tsx` | The Bidding band's editor and its note; the expiry notice clause; `rosterWindowClause` prints the off-job clause from the row's own record rather than from its band (r15) |
| `roster/roster-groups.tsx` | One bid read for the sheet; the household band under Client side |
| `roster/call-sheet.tsx` | Passes `projectId` to the bands and `projectName` to the picker |
| `lib/document/roster-derivation.ts` | `bidNote` |
| `lib/analytics/people-events.ts` | `cardsMerged`, `householdMemberAdded`, `bidRecorded` |

### Tests

New, as they stand after the r2–r15 review rounds (each count re-measured file by file in the
r15 fix round):
`people-crm-w3.test.ts` (40, vitest) · `bring-forward.test.ts` (15) ·
`compliance-notice.test.ts` (10) · `travel-list-pane.test.tsx` (5) ·
`compare-merge-sheet.test.tsx` (17) · `household-band.test.tsx` (34) ·
`close-seat-act.test.tsx` (6) · `archive-card-door.test.tsx` (8).

Extended: `rolodex-picker.test.tsx` (15 → 37), `roster-row.test.tsx` (26 → 49).

Playwright, chromium-pinned, under `e2e/people/`: `bring-forward.spec.ts`, `merge.spec.ts`.
**Run green in the r14 round** — 3 passed in 15.6 s, chromium (`w3-fix-log-r14.md`); not re-run in
the fix rounds since, which take no port.

Mock factories widened for the new hooks: `call-sheet.test.tsx`, `call-sheet-mount.test.tsx`,
`project-roster-surfaces.test.tsx`, `company-card.test.tsx`, `person-profile.test.tsx`,
`directory-scope.test.tsx`.

---

## 2. Compare & merge (scope 1)

**The band now offers the act.** R-Y held it back in P1 because the sheet did not exist; it does
now (direction §8 P2), so the band reads "These two cards share a phone." + both names as live
open-person controls + **Compare these two** as the secondary word after them. The band's first
job is still naming the collision.

**The sheet** (`data-compare-merge-sheet`, its own DocSheet, never a control inside Reach & access):

- Nine fields always, two columns: Name · What they are · Firm · Mobile · Email · Contact rule ·
  Papers on file · Seats on jobs · In the book since — plus, wherever either card actually holds
  one, the typed facts the merge will reduce (r5 B-1 / R-BN: Verdict, Trades, Specialties, Notes,
  Legal name, Trading as, Remit-to, Retainage, Tax ID, W-9 on file, Warranty until, Sole
  proprietor, and the three designations — Paperwork contact, Signer, Site contact, added by r7 B-1
  and resolved to names, never ids: fifteen in all). The sheet shows both values wherever a reduction
  will pick one.
- **PR-o**: the survivor is pre-picked as the **older** card (`preferredSurvivorId`, ties broken on
  the id so the pick is stable across refetches) and both column heads are `aria-pressed` buttons,
  so the studio flips it. The pre-pick is taken once and never re-taken, so a refetch cannot undo a
  flip.
- The evidence is a named select — the studio's words, never the column token
  (`MERGE_MATCHED_ON_LABELS`), defaulted to `phone` because the band's own detection is crm-model
  §4 rule 2.
- The consequence sentence names what moves and what does not. It branches on whether the
  survivor already carries a contact rule (r4 B-2: one rule row per subject, so the survivor's own
  rule wins and the folded card keeps its own as history), and its closing clause is about the ID,
  which is what the merge record actually guarantees — "both ways of reaching this person still
  work" was a promise about NUMBERS the RPC did not keep, and r3/MAJOR-4 replaced it. With no rule
  on the survivor it reads (`mergeConsequenceSentence`, `compare-merge-sheet.tsx`):
  > "Chidi Okonkwo's seats, channels, contact rule and firm designations move onto Adaeze Okonkwo,
  > and Chidi Okonkwo's own number and address travel with them. Everything else Chidi Okonkwo
  > holds — the verdict, the notes and the payee facts — travels the same way, and where both cards
  > say something Adaeze Okonkwo's own words stand. The trades and specialties on both cards are
  > kept together, and a card recorded as a sole proprietor keeps that either way. Consent stays
  > with the number, not with the card, so nobody's yes or no changes. Chidi Okonkwo's paper moves
  > onto Adaeze Okonkwo too; where Adaeze Okonkwo already holds the same paper, still in force, the
  > older one is marked superseded. Chidi Okonkwo's card is kept as a record of the merge, so an old
  > link still opens this person."

  The trades/specialties/sole-proprietor clause is its own sentence because 00629 UNIONs those two
  arrays and ORs that flag rather than picking a column (r11 BLOCKING-1) — the survivor flip does
  not decide them.

  Where the survivor has a rule, "contact rule" drops out of the first clause and a sixth clause is
  inserted: "Adaeze Okonkwo's own contact rule stands, and Chidi Okonkwo's stays on the folded card
  as a record."
- Terminal act: "Merge into &lt;survivor&gt;". Afterwards the Directory folds the merged card away
  (00629's `people_directory` v5 skips `merged_into IS NOT NULL`), the survivor's card opens, and
  the Room's `role="status"` line says "Two cards are now one. &lt;survivor&gt; carries everything
  &lt;merged&gt; held."
- Each of `merge_studio_contacts()`'s **thirteen** refusals renders as a sentence (`asMergeError`),
  never a Postgres string (`MERGE_REFUSAL_SENTENCES`, `use-studio-contacts.ts`): the original eight
  plus `merge_two_logins` and `merge_contact_rule_conflict` (r4 B-1 / B-2),
  `merge_survivor_archived` (r5 M-4), and `merge_seat_on_studioless_project` +
  `merge_seat_card_other_studio`, the two that name the job through `details`.

**`useMergeStudioContacts` invalidates** `studio-contacts`, `studio-contact-merges`,
`people-directory`, `people-directory-seats`, `studio-contact-channels`, `studio-contact-rules`,
`studio-person-affiliations`, `studio-compliance-documents`, `project-parties`, `project-roster` —
every key a card's facts are read through. Pinned by test.

---

## 3. Bring forward (scope 2)

SPEC §5.7 is the contract, and the picker now keeps all nine points that are the shipped face's to
keep.

| # | What landed |
|---|---|
| 3 | `data-pick-count` reads "4 of 5 from the Lindqvist kitchen selected". The job is named only when every hit on the page shares one prior job — naming one of several would be a claim about the other rows |
| 4 | Every mini row carries a **checkbox** (square mark, no tick glyph, §8 #5), the 34px circle, the name, firm and trade, the history line, and its three words |
| 5 | `TravelListPane` — "What travels": identity · typed channels · contact rule · consent by channel value · document expiries · one history line. "What stays behind": prior pricing · prior project notes · show to client. Beside the list at width, after it when it wraps |
| 6 | The act row comes first — "Add four to the roster" (`bringForwardActLabel`, counted in words) and "Put back". Both live, neither `aria-disabled` |
| 7 | `data-bring-forward-consequence`, directly beneath: "Adds four seats to the Okonkwo residence. Pete Rusk arrives opted out of texting. Northgate Electric's insurance lapsed 31 March 2026." |

**PR-i, honoured further than W2 could.** `useStudioContactHistory` now reads
`projects.completed_at`, so the line says "Worked 1 prior project, Lindqvist kitchen, **closed**
2025." and spends the word "closed" only where the record earns it (w2c-report §6 item 5 is paid
off). A job still open prints the year without the claim.

**PR-b, what `useBringForward` writes.** Name-at-time and trade are snapshots and are written.
`studio_contact_id` is written, because the live read of channels, rule, consent and expiries hangs
off it. `company_id`/`company_name` are written so R-BJ's paper word reads the same firm. Phone and
email are written because they are the **channel values the consent record is keyed on**
(`people_directory_seats.consent_status` reads `pp.phone_e164`), not because the seat holds an
opinion about them. **Nothing else**: the INSERT names no consent column, no bid column, no
`show_to_client`, so Pete Rusk's seat is born reading his refusal with no write at all (direction
§5.2's Birth rule, F-12) and the seat lands at PD-11's opt-in default. A test sweeps the payload for
every forbidden key.

**One pick refused does not cost the others.** The insert runs per pick; refusals come back named,
the refused rows stay ticked, and the sentence says which did not go on.

**A single add stays one press.** Each row keeps an "Add &lt;name&gt; on their own" control as a
**sibling** of the row button — an interactive control nested inside a `<button>` is unreachable by
keyboard, which is C11's own rule applied to the picker.

### The one change beyond the brief's letter, declared

SPEC §5.7 #3's search field holds **"Lindqvist"** — a prior JOB. A job name lives on nobody's card,
and the shipped picker asked PostgREST to filter by name/company/email, so that search returned
nothing. The picker now asks the rolodex for the **kind only** and runs the search in memory over
the name, the firm, the email **and the prior job the history line already names**. No new cost: the
picker's own opening state is that same unfiltered read, and the history query it already makes
covers the scan (capped at 200 cards, the page at 40). Without it, Leah task 5 cannot be performed
as the specimen draws it.

---

## 4. The Bidding band (scope 3)

`people_directory_seats` (00626) predates 00631 and carries no bid column, so `RosterGroups` reads
them **once for the sheet** (`useProjectPartyBids`) and hands each row its own — never one query
per row.

- **Folded and unfolded, at both widths** (R-R / C28): `data-bid-note` reads "Due 5 October 2026.
  Holds until 4 November 2026. Priced by Tom Marrow." Only the columns that hold something speak —
  00631 refused to parse a due date out of free-text timeline prose, so an empty date prints
  nothing rather than a number the record does not make.
- **The editor** (`data-bid-editor`), offered on any seat that CARRIES a bid in any band, not the
  Bidding band alone (MAJOR-7 — "Selected" and "They withdrew" were one-way doors otherwise).
  **Seven fields**: the studio asked · the answer was owed · how it came back · the number came
  back · the studio chose them · the number holds until · who priced it. The three dated events
  came in with 00631 (r1 M-6, SPEC §5.4 #9 / R-R); each is a record of what happened and none is
  derived from the outcome.
- **The outcome IS the stage, where the press is a transition.** `useSetPartyBid` writes `stage`
  beside `bid_outcome` through `SEAT_BID_OUTCOME_STAGE`, and `rosterBandFor` then keeps a losing
  bidder out of every crew band: `declined` → Declined and `no_response` → No response both stay in
  Bidding, `withdrawn` → `off_job` goes to Done (and is dated, so a Done row is never undated), and
  only `selected` → `awarded` bands by window. Writing "they declined" without moving the stage
  would leave a losing bidder sitting in a crew band, which is the one thing §3.4 asks this band to
  prevent.

  **Two guards on that write, and the face reads them too.** r7 BLOCKING-1: a correction is not a
  transition, so `stage` moves only when the outcome actually CHANGED (the editor seeds the draft
  from the seat's existing outcome, so every ordinary correction re-sends it unchanged) and only
  when the seat is not already past the bid — `mobilized`, `active`, `closeout`, `warranty`,
  `retired` — with `withdrawn` the one outcome that reaches past them. r8 BLOCKING-1 moved both
  predicates into `bidStageOutcome(previous, next)`, which the editor's consequence sentence reads
  as well, so the face can no longer promise a move the write does not make. Three sentences, one
  per thing the press can do: "Recording this moves &lt;name&gt; to &lt;Outcome&gt;. A bidder who
  did not win never reads as crew." · "This seat is past the bidding, so its stage stays where it
  is. Recording this writes what came back, and nothing else." · "The outcome is unchanged, so
  nothing moves. This records the dates and who priced it."
- The outcomes read as **acts** on the face ("They declined", "No response"), never as the column's
  tokens. A test sweeps for `no_response` / `off_job` / `bid_outcome` in the DOM.
- "Who priced it" offers **person cards only** — 00631's `assert_party_bid_quoted_by()` refuses a
  firm — and each of `asBidError`'s six refusals renders as a sentence.

---

## 5. The household (scope 4)

`HouseholdBand` sits under the Client side band and prints two things:

- `data-household-threshold`: "Change orders over $2,500 need a signature from the household.", or
  "No change-order figure is on file for this household." — an absence stated, never a blank (R-V).
- **Add a household member** → a select over the studio's person cards (the job's own client-side
  cards first), the two roles in the studio's words ("decides the work" / "signs for the
  household" — the string `client_rep` reaches no face, C5), a consequence sentence, and
  `add_household_member(household, person, role, project)`.

**PR-n, twice.** "Set the figure" is `aria-disabled` for a plain member with
`aria-describedby` pointing at a sentence that is **always on the face**, pressed or not; and
`useSetHouseholdThreshold` renders the RLS refusal as "A change-order figure is the principal's to
set. Ask an owner or an admin of the studio." A zero-row UPDATE the caller can still SELECT is the
WITH CHECK refusing the figure, and is translated rather than swallowed.

### The resolver, and why it is not the one the brief implied

`projects` carries **no pointer at `designer_clients`** — measured on the local database, the column
does not exist, Okonkwo's `client_profile_id` is NULL, and its "The Okonkwo household" client record
is reachable from the project by nothing at all. A bridge through that table answers NULL for
exactly the no-login population PR-c exists for.

What the job **does** carry is its client side. `useProjectHousehold` reads the project's `client`
and `client_rep` seats, takes their `studio_contact_id`s, and finds the `client_households` row whose
`member_person_ids` **overlap** them — PR-c's own sentence read backwards ("every member who acts on
a job gets a seat"). `designerClientId` is still resolved the shipped way
(`projects.client_profile_id` → `designer_clients`) and used only to point that record at the
household when one exists; NULL there is a fact, not a failure.

On the seeded Okonkwo residence the band therefore prints "No household is on file for this client…"
with **Open a household** beside it, which is the honest state of the seed. **The door is gated on
the overlap read being able to find what it opens** (r3 MAJOR-2): on a job whose client side
carries neither a card nor a `designer_clients` row, `Open a household` renders `aria-disabled`
(never `disabled`) with the reason always on the face beside it — "Seat the client on this job
first, then open the household." — because a household minted with no member the overlap read can
reach would be invisible the moment the sheet closed. Probed end to end in a
rolled-back transaction: creating the household, `add_household_member` for Chidi's card reuses his
existing OPEN seat and writes `money` and `change_order` grants at `250000`, and the overlap read
finds the household afterwards.

**Neither half of the household touches a seat the studio CLOSED (r15 MAJOR-1, 00632).**
`add_household_member()` matched on (project, card, role) alone and took the oldest row, so a seat
closed by "Close this seat" was the row it found: the act opened no seat and wrote the household's
money grant onto a closed one with `effective_to` NULL, which the Client side band — assembled
before the window rule — printed as live authority. The lookup now carries `off_job_at IS NULL`, so
a closed seat stays closed and a new one is opened, and `set_household_threshold()` **ends** a grant
standing on a closed seat with `effective_to` (00624's own shape for ending a delegation) instead of
growing the figure on it. Pinned by block 12 of the SQL suite. On the face,
`rosterWindowClause` now prints "Off the job &lt;date&gt;." from the row's own record rather than
only in the `done` band, so a closed client-side row carries its closing date beside whatever
authority it still prints.

**The band refetches when the seats under it move (r15 MAJOR, code).** `useProjectHousehold` reads
`project_parties` and `project_party_authority`, and no seat or authority mutation invalidated its
key — so with `staleTime` at five minutes the door could stay held over a client row two elements
above, and the add sentence could promise the household's figure over a foreign grant
`add_household_member()` deliberately leaves standing. All six writers
(`useAddProjectParty`, `useUpdateProjectParty`, `useCloseProjectPartySeat`, `useRemoveProjectParty`,
`useSetPartyAuthority`, `useBringForward`) now call one `invalidateClientHouseholds` helper, pinned
by test.

---

## 6. Close this seat, everywhere (scope 5)

`grep` over `apps/` and `packages/` for a delete or a "Remove" on a party or a seat returns exactly
one call site: `roster-row.tsx`'s **Added by mistake**, already held behind `seatDeleteRefusal`
(W2c). No other surface offered a hard delete, and none was added.

What was missing was the opposite: direction §3.2 R4 names **Close this seat** on the person card's
Seats region and the card had none — a seat could only be closed from the Call Sheet. `CloseSeatAct`
is that act **for the person card**, and `person-profile.tsx` is its only importer. The Call Sheet
row keeps the copy it grew in W2 (`roster-row.tsx`'s `closing` block): the same confirm sentence,
its own "Why it closed" field, its own `closeSeat.mutateAsync` and its own `peopleEvents.seatClosed`
— because that surface carries the surviving hard delete ("Added by mistake", held behind
`seatDeleteRefusal`) inside the same act row, and routes its refusal into the sheet's `role="status"`
announcer rather than a local one. **So the two copies are hand-kept in step, not one component**
(r15 MAJOR-2 — an earlier draft of this report claimed the invariant and the code never had it).
Repointing the Call Sheet at `CloseSeatAct` is the standing option and is owed (§10 item 9).
The surviving hard delete stays on the Call Sheet row alone, which is where a mistaken add happens
minutes after it is made.

**The archive door** (`ArchiveCardDoor`) is on the person card's R1, as a standing act: "Put this
card away" / "Bring this card back", `aria-disabled` for a plain member with the reason line on the
face whether or not the act can be pressed. `useArchiveStudioContact` / `useRestoreStudioContact`
are repointed from the raw table UPDATE onto 00629's RPCs, which restate 00417's owner/admin rule in
a body SECURITY DEFINER cannot bypass, are idempotent, and answer a non-member
`studio_contact_not_found` rather than leaking which ids exist. An archived card prints the date it
was put away.

---

## 7. Expiry notices (scope 6)

One formula, `noticedPaperClause`, read by three surfaces:

| Surface | Where |
|---|---|
| Company card, Paper region | `data-expiry-notice`, after the held clause, no leading rule |
| Roster row | `data-expiry-notice`, above the bid note, gated on `partyKindOwesPaper` |
| Picker mini row | `data-expiry-notice`, in the row's subline |

**The distinction it keeps:** a paper WORD says where the certificate stands; a NOTICE says the
studio has already been told. A certificate can read `Lapses in 30 days` on the day it crosses the
line, before any sweep has run, and the clause must not claim the studio was told when it was not —
so the clause prints **only where `studio_compliance_notices` holds a row for that document**.
`lapsed` outranks `lapses_soon` for one holder; then the soonest date.

The wording spells out direction §3.8's own paper word: "Northgate Electric's insurance **lapses on
6 October 2026**." / "…lapsed 31 March 2026." The interval was taken out on purpose (M2R-1 — "an
interval beside a date is arithmetic, and arithmetic on a face has to be right"): the date is the
fact the record holds, and the days remaining is a subtraction that goes stale between the sweep
and the read. The noun comes from `heldClausePaperNoun` — the existing map, not a second one — so
the same certificate is never named two ways on one screen.

`sweep_compliance_expiries()` was run once against the local database (`{"notices": 3, "scanned": 3,
"notified": 6}`), which is what W3's data report §10 item 6 said was owed: it had never run outside a
rolled-back transaction. The three notices it wrote are Ostrom Builders (lapsed 2025-12-31),
Northgate Electric (lapsed 2026-03-31) and Lakeshore Painting Co. (`lapses_soon`, whose expiry the
seed writes **relative to `current_date`** — `CURRENT_DATE + 23` — so the literal date moves a day
per day and is not quoted here; it read 2026-10-08 on the r15 reset). The two lapsed dates are
fixed in the seed; only Lakeshore's is relative. Otherwise exactly the table w3-data-report §2
predicted.

---

## 8. Analytics

Three acts added to `people-events.ts`, each the shape of one act, none an engagement metric:

- `people_cards_merged` — `matched_on`, and **`survivor_flipped`**, whose rate is the measure of
  whether "older survives" is the right default (PR-o).
- `people_household_member_added` — `role`, `with_threshold`, `seated`.
- `people_bid_recorded` — `outcome`, and which fields the studio actually filled.

`people_bring_forward_picked` (defined in W2a, called by nobody) now fires on the confirm with
`picked_count`, `offered_count` and `carried_opt_out`.

---

## 9. Gates

| Gate | Result |
|---|---|
| `pnpm --filter @patina/supabase type-check` | clean |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/admin-portal build` | **exit 0**, full route table printed (the strictest gate, after the shared `@patina/supabase` edits) |
| `npx turbo build --filter=@patina/types --filter=@patina/supabase` | 2 successful (`@patina/supabase` ships source, not a dist — nothing to stale) |
| `cd apps/designer-portal && npx jest` | **593 suites, 7675 tests, 1 snapshot, all green** (re-measured in the r15 fix round) |
| `cd packages/supabase && npx vitest run` | **105 files, 1346 passed, 12 skipped** (re-measured in the r15 fix round) |
| `cd packages/supabase && npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | **40 passed** |
| `psql … supabase/tests/people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed" (block 12, the r15 closed-seat pin, is the last) |
| `e2e/people` (chromium, r14 round) | `bring-forward.spec.ts` + `merge.spec.ts` — **3 passed in 15.6 s**; the wider `e2e/people` run in the r15 QA round read 14 passed / 8 failed, the eight pre-existing and carried to the orchestrator |
| `npx eslint src/components/document/{roster,people} src/lib/document/{bring-forward,compliance-notice}.ts src/lib/analytics/people-events.ts` | **0 errors**, 4 warnings, all pre-existing kinds in files this wave did not touch |
| e2e type-check (`tsc` over `e2e/**`) | 0 errors in `bring-forward.spec.ts` and `merge.spec.ts` (the rest of `e2e/` carries pre-existing missing-`@types/node` noise) |

**Runtime probes against the local database** (PostgREST with the service key; every write inside a
transaction that was ROLLBACKed, verified zero residue afterwards):

| Probe | Result |
|---|---|
| Every new select shape (`studio_compliance_notices`, `studio_contact_merges`, `client_households` with `member_person_ids=ov.{…}`, the five bid columns, `projects(designer_id, client_profile_id)`, `designer_clients.household_id`, `studio_contacts.merged_into`, the history embed with `projects(name, completed_at)`, `studio_compliance_documents?holder_id=in.(…)`) | 200, all |
| `merge_studio_contacts()` round trip as the seeded designer | survivor returned; `resolve_merged_contact(newer)` → survivor; `merged_into` set; `studio_contact_merges.matched_on = 'phone'` |
| `add_household_member()` round trip | reused Chidi's existing seat; `money` + `change_order` grants at 250000; the band's overlap read finds the household |
| The bid UPDATE and the bring-forward INSERT as `authenticated` | stage moved to `declined`; the new seat born `show_to_client=false`, `sms_consent_status='not_asked'`, card stamped |
| `sweep_compliance_expiries()` | `{"notices": 3, "scanned": 3, "notified": 6}` |

**`pnpm --filter @patina/supabase lint` fails to start** — that package has no `eslint.config.js`.
Pre-existing and named in CLAUDE.md ("only designer-portal has a working ESLint config").

---

## 10. Not done, and owed

1. **The two Playwright specs ran green in the r14 round** (3 passed, chromium,
   `w3-fix-log-r14.md`); the fix rounds since take no port and have not re-run them. Both are
   written against the real seed, chromium-pinned, and assert through `adminDb` with `expect.poll`.
   `bring-forward.spec.ts` opens its **own** project rather than Okonkwo, because the seed already
   seats Dana, Pete, Ingrid and Claire there — bringing them forward onto Okonkwo can only ever
   read "already on the call sheet". It runs `sweep_compliance_expiries()` in `beforeAll` so the
   Northgate clause has a notice row behind it, and tears its project down in `afterAll`.
2. **The household band is inert on the seeded Okonkwo residence** until somebody presses "Open a
   household": the seed's "The Okonkwo household" `designer_clients` row is reachable from the
   project by nothing, and §5 explains why no bridge was invented. A seed line adding a
   `client_households` row whose members are Adaeze's and Chidi's cards would make the band live on
   the fixture; it is a seed change this wave did not make.
3. **The merged card's paper, channels and rule are repointed by 00629, not by the sheet.** The
   sheet's Papers-on-file and Seats-on-jobs columns count what the caller can read; a card whose
   crew sits entirely outside the caller's RLS reach will read low there, exactly as the Directory's
   firm row does (w2b-report §6 item 9's shape).
4. **No split.** crm-model §4 names a split beside the merge ("allowed when a phone or email proved
   wrong"). 00629 minted no split RPC and direction §8 P2 does not list one. Owed to whichever wave
   wants it.
5. **The bid amount is written by nothing.** `bid_amount_cents` exists on the column and in
   `SeatBid`, and `useSetPartyBid` will write it, but the editor offers no money field: direction
   §3.4's Bidding row prints dates and an outcome, not a number, and PR-t's instinct about figures
   on a face argues for ruling it before it is drawn.
6. **The picker's search scans 200 cards.** A studio whose book outgrows that will not find a
   201st card by the job it worked. A server-side history rollup is the honest fix and is a view,
   not a hook.
7. **`useComplianceNotices` is read per row on the Call Sheet.** React Query keys it on the studio,
   so it is one request, but it is one hook call per roster row. If a sheet ever grows past a few
   dozen rows, hoist it into `RosterGroups` beside the bid read.
8. **The TEAM-branch tenant leg** (w3-data-report §7) is still a ruling owed to Fable, untouched
   here.
9. **The Call Sheet's close block is a second copy of `CloseSeatAct`** (§6, r15 MAJOR-2). Repointing
   `roster-row.tsx`'s `closing` block at the component is the tidier end, and needs the component to
   carry the extra act ("Added by mistake" with its held refusal), the Call Sheet's own
   surface/region analytics keys, and an error path into the sheet's announcer. Named rather than
   done in the r15 fix round, which was scoped to the findings' own fixes.

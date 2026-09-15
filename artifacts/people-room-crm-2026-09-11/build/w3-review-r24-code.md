# W3 (P2) — adversarial CODE review, round 24

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
HEAD `96fcc861b` ("fix(people-crm): the money-collision refusal names the seat that left, and the
picker searches what its rows print (r23)").

Scope: every file this branch changes under `apps/designer-portal/src` and `packages/supabase/src`
(`git diff --stat 3d65f81e4..HEAD` — 50 files, 12 804 insertions), read in full, plus the two
Playwright specs under `e2e/people/`. Local Postgres only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). No prod, no dev server, no port taken,
no migration minted, nothing committed.

Settled and not filed: every ruling in `rulings.md` §3, and anything the reports scope to W4.

**Verdict: NOT clean — one major, zero blocking, twelve minor.**

The major is the eighth filing of the defect class this build has filed seven times already:
`w3-room-report.md` states facts about the shipped face and the shipped code that HEAD no longer
supports. Both r23 findings are measured fixed. No new defect was found in the room's behaviour —
the writes, the gates, the refusals, the invalidations, the consent posture and the travel list all
hold up against the record.

---

## 1. Prior findings, re-checked at HEAD

| Finding | Status | Evidence at HEAD |
|---|---|---|
| r23 major-1 — the room report did not describe the sheet that shipped (seventh filing) | **FIXED, in the part it was filed for** | §2 reads "**fifteen**" (`w3-room-report.md:167`) and enumerates `merge_seat_authority_collision` with its third DETAIL word and its repair (`:174-183`); `MERGE_REFUSAL_SENTENCES` has 15 keys (`use-studio-contacts.ts:1925-1974`) and its doc comment reads "fifteen" (`:1924`); §1's `### Changed` table now names all four previously-missing files — `lib/document/people-derivation.ts`, `lib/document/write-error.ts`, `components/document/overlays/doc-sheet.tsx`, `components/document/roster/use-project-authority.ts` (`:69-72`). §1's `### Tests` counts re-measured below and **all correct**. (Two new drift instances found elsewhere in the same report — major-1 below.) |
| r23 major-2 — the bring-forward picker's search denied the firm its own row prints | **FIXED** | `resolveFirmName(contact, row)` is module scope (`rolodex-picker.tsx:135-141`); `firmNameFor` delegates to it (`:556-557`); `hits` searches `resolveFirmName`, `company_name`, **every** `tradesOfCard(c, firmCardById)`, `email` and `projectNames` with `wordsByCard`/`firmCardById` in the deps (`:379-399`). `rolodex-picker.test.tsx` — **40 passed**, counted and re-run. |
| r23 MAJOR-1 (migrations lane) — the refusal named the destructive repair | **FIXED and live** | `select position('Put THAT seat back in the bidding' in prosrc) > 0 from pg_proc where proname='merge_studio_contacts'` → `t`. `asMergeError`'s DETAIL branch reads the third word and branches `merged`/`survivor`/`both` (`use-studio-contacts.ts:589-615`). SQL suite block 13d passes with the new notice. |
| r23 MAJOR-2 (migrations lane) — the data report did not know the fourth refusal exists | Out of this lane; not re-measured here. | — |
| r23 minor-1 — a fold leaves the picker's history line stale | **OPEN** | `useMergeStudioContacts.onSuccess` (`use-studio-contacts.ts:2126-2153`) invalidates thirteen roots; `['studio-contact-history', …]` is not one of them. |
| r23 minor-2 — `writeErrorMessage` has no bare-token backstop | **OPEN** | `write-error.ts` still ends `return raw` after the schema-word guard; no `/^[a-z][a-z0-9_]*$/` answer of the kind `asMergeError` grew at r13. |
| r23 minor-3 — one refusal spoken for several refused picks | **OPEN** | `rolodex-picker.tsx:793-800` (the reason at `:797`) — every refused name is listed, then `writeErrorMessage({ message: result.refused[0].reason }, …)`: the FIRST refusal's sentence is spoken for all of them. |
| r23 minor-4 — the merge sheet's heading is off the type ladder | **OPEN** | `compare-merge-sheet.tsx:524` — `font-heading text-[1.35rem]`, a raw size where `.t-*` is the house step. |
| r23 minor-5 — a comment still quotes the sentence M2R-1 removed | **OPEN** | `roster-row.tsx:386` — `"Northgate Electric's insurance lapses in 30 days, on 6 October 2026."` in the doc comment above `lapsesSoonClause`, over a composer that has printed `lapses on <date>` since M2R-1. |
| r23 minor-6 — the duplicate band no longer sees a card colliding with a cardless seat | **OPEN** (as M2R-6 intended) | `people-derivation.ts:1370` — `if (row.role !== "contact") continue;`. |
| r23 minor-7 — the merge act is natively `disabled` with no reason on the face | **OPEN** | `compare-merge-sheet.tsx:604-613` (`disabled` at `:608`) — `disabled={!canMerge || merge.isPending}` with no `held`, and `DocumentAction` renders `disabled={unavailable && !held}` (`document-action.tsx:309`), so the control leaves the tab order with no `aria-disabled` and no sentence. |
| r23 minor-8 — the close pre-read and the close write are not one statement | **OPEN** | `use-coordination.ts:933-951` — a `select off_job_at, off_job_reason` then an `update`, two round trips, no `if_version`-style pin. |

---

## 2. Findings

### major-1 — `w3-room-report.md` states two facts HEAD does not support (eighth filing)

r23 major-1 took §2's refusal count and §1's `### Changed` table. Both are right now. Two OTHER
statements in the same report are not, and one of them is a figure a walk will read off the screen
and disagree with.

**(a) §3 row 3 — the pick count on the seeded book is six, not five.**

> `| 3 | `data-pick-count` reads "4 of 5 from the Lindqvist kitchen selected". …`
> (`w3-room-report.md:199`)

R-BP rules the opposite in terms: *"on the dev seed 'Lindqvist' returns six people (Ben Ostrom,
Claire Bissett, Dana Kowalski, Erin Sato, Ingrid Halvorsen, Pete Rusk). SPEC §5.7 is amended from
five to six"*. The code's own composer says six —
`bring-forward.ts:68-69`: `SPEC §5.7 #3 — "4 of 6 from the Lindqvist kitchen selected" (R-BP …
which on the seed is six)`. Measured against the live local database:

```sql
select sc.full_name from public.studio_contacts sc
where sc.merged_into is null and sc.archived_at is null
  and exists (select 1 from public.project_parties pp
                join public.projects p on p.id = pp.project_id
               where pp.studio_contact_id = sc.id
                 and p.name ilike '%lindqvist%'
                 and pp.project_id <> 'd0e00000-…-00000000000a');
-- Ben Ostrom | Claire Bissett | Dana Kowalski | Erin Sato | Ingrid Halvorsen | Pete Rusk   (6)
```

and nothing else in the book matches the needle by name, firm or e-mail
(`full_name/company_name/email ilike '%lindqvist%'` → 0 rows), so `hits.length` is exactly 6 and
`sharedJobName` resolves to the one job. The face prints **"4 of 6 from the Lindqvist kitchen
selected"**; the report says five. This is the pre-R-BP figure, left standing after the ruling
amended it.

**(b) §5 — "All six writers" is seven, and the code says so.**

> **All six writers** (`useAddProjectParty`, `useUpdateProjectParty`, `useCloseProjectPartySeat`,
> `useRemoveProjectParty`, `useSetPartyAuthority`, `useBringForward`) now call one
> `invalidateClientHouseholds` helper, pinned by test. (`w3-room-report.md:355-358`)

Measured at HEAD:

```
grep -rn "invalidateClientHouseholds(queryClient)" packages/supabase/src/hooks/
use-coordination.ts:588   useAddProjectParty
use-coordination.ts:755   useUpdateProjectParty
use-coordination.ts:978   useCloseProjectPartySeat
use-coordination.ts:1126  useRemoveProjectParty
use-coordination.ts:2101  useSetPartyAuthority
use-coordination.ts:2845  useSetPartyBid          <- not named
use-coordination.ts:2956  useBringForward
```

`useSetPartyBid` was added to the list in the r21 round, and its own comment at `:2843` calls it
*"the seventh seat writer and the only one that told neither"*. R-BS states the same thing
(*"useCloseProjectPartySeat and useSetPartyBid invalidate partyAuthorityKeys.all and the household
keys"*). §5 still enumerates six and omits the one the ruling names.

**Why major.** The room report is the record Kody's walk reads before the walk. (a) is a wrong
figure about the shipped face on the shipped seed, in the one row of the report that quotes the
count line verbatim — a reader performing Leah's task 5 sees the face disagree with the report at
the first glance. (b) is a wrong count about the invalidation contract a later wave will trust.
Both are the class filed as r7 M-4, r8 MAJOR-1, r15 MAJOR-3, r19 major-2, r20 major-2, r21 major-5
and r23 major-1: a section re-measured in one round goes stale in the next because the
re-measurement is taken section by section rather than over the whole file.

**Fix.** §3 row 3 → "4 of 6 from the Lindqvist kitchen selected", citing R-BP. §5 → "All seven
writers", adding `useSetPartyBid`. And, because this is the eighth filing: state in §1's banner the
ONE command that re-measures each numeric claim (the three greps used above), so the next round
re-measures rather than re-reads.

---

### minor-1 — a firm card that has been folded is invisible to every reader that resolves it by id

`useStudioContacts` now excludes `merged_into IS NOT NULL` by default (`use-studio-contacts.ts:216-217`,
M2R-5) — correct for a LIST. But two W3 surfaces use that same list as a **lookup table keyed by
id**, and 00629 deliberately leaves live pointers at folded cards (R-BN; `00629:962-964`: *"the
legacy `studio_contacts.company_id` keeps naming the folded firm so `people_directory`'s
company_name COALESCE still resolves the firm's name"*, and `people_directory`'s own
`LEFT JOIN public.studio_contacts firm ON firm.id = sc.company_id` carries no `merged_into` leg
while the outer `WHERE` filters only `sc`):

* `compare-merge-sheet.tsx:350-362` — `namesById` is built from the merged-excluded book, so
  `firmNameOf` falls through to `card.company_name?.trim() || "—"`, which F1 measured NULL on every
  carded human. The sheet would print Firm `—` where the Directory row and the picker's mini row
  print the firm's name — the exact absence-assertion r7 MAJOR-1 fixed on this same sheet.
* `rolodex-picker.tsx:306-313` — `firmCardById` likewise, so `tradesOfCard` (`:108-121`) misses the
  firm leg, `tradeFor` (`:579-580`) answers null, the mini row loses its trade chip, and
  `trade: tradeFor(c)` (`:770`) writes an EMPTY permanent PR-b snapshot onto the new seat — QA r3
  finding 1's harm, reached a different way. This is exactly 00629 r10 BLOCKING-1's population: the
  OTHER crew of a folded sole-proprietor firm.

**Minor, not major, because the room offers no door to it today.** The only caller of
`useMergeStudioContacts` is `CompareMergeSheet`, whose only caller is the duplicate band, and
`directoryDuplicatePairs` skips firms (`people-derivation.ts:1357` `directoryEntryKind(row) === "firm"`)
and non-`contact` rows (`:1370`), so no FIRM card can acquire `merged_into` through the shipped
room. It becomes major the moment a firm-fold door exists — and `merge_kind_mismatch`'s own
sentence advertises one to the studio ("A firm folds into a person only where the person is
recorded as a sole proprietor", `use-studio-contacts.ts:1934-1936`).

**Fix.** Pass `includeMerged: true` at both call sites (both are id→row lookups, not lists), or
resolve through `people_directory`'s `meta.company_name` the way `resolveFirmName` already does for
the picker's firm segment.

---

### minor-2 — the merge sheet is the one W3 write surface that does not route its refusal through `writeErrorMessage`

`compare-merge-sheet.tsx:468-472` (the raw message at `:470`):

```ts
setError(e instanceof Error ? e.message : "The merge did not go through.");
```

`useMergeStudioContacts` throws `new Error(asMergeError(error))`, and `asMergeError` covers fifteen
named tokens plus a bare-snake_case backstop (`use-studio-contacts.ts:2074-2076`). Anything with
whitespace — a unique-constraint message from the channel union, an unexpected Postgres error —
returns as it came and lands verbatim in the sheet's `role="alert"`. Every other door in the wave
(`rolodex-picker`, `household-band`, `close-seat-act`, `roster-row`'s two) puts `writeErrorMessage`
in front for exactly that residue, and `writeErrorMessage`'s schema-word guard is what suppresses a
constraint or relation name (SPEC §8 #3). One line.

---

### minor-3 — the merge consequence sentence lists "firm designations" among what moves, and 00629 COALESCEs them survivor-first

`mergeConsequenceSentence` (`compare-merge-sheet.tsx:131-134`) puts designations in the MOVES
clause:

```
`seats, channels and firm designations` → `move onto ${survivorName}`
```

while the caveat that follows is scoped by its own enumeration — *"Everything else … — the verdict,
the notes and the payee facts — … where both cards say something SURVIVOR's own words stand"* — so
designations are not covered by it. 00629 writes
`COALESCE(s.paperwork_contact_person_id, NULLIF(v_merged.paperwork_contact_person_id, s.id))`
(`00629:2206-2214`) for all three: the SURVIVOR's own value wins where it has one. With both cards
holding a designation the sentence claims a move the write does not make — the shape r4 B-2 and
r13 MAJOR-2 both filed for the contact rule, in the same sentence.

Minor rather than major on the same reachability ground as minor-1: the room's only merge door
pairs person cards, and the three designations are firm-card columns. `carriedRows` already prints
all three as rows when either card holds one (`:255-260`), so the table is right; only the sentence
over-claims.

---

### minor-4 — the pick count and the act label count different people

`bringForwardSelectionLine(picked.length, hits.length, sharedJobName)` (`rolodex-picker.tsx:955`)
counts EVERY ticked row; `bringForwardActLabel(pickedSplit.fresh.length)` (`:1072`) counts only the
rows the press will actually write (r16 MAJOR-2). On Leah's task 5 against the shipped seed — where
all four are already on the Okonkwo call sheet — the two read, one above the other:

```
4 of 6 from the Lindqvist kitchen selected
[ Add to the roster ]                       ← countInWords(0) suppressed
Adds no seats to the Okonkwo residence. Dana Kowalski, Pete Rusk, … are already on the call sheet.
```

The consequence sentence rescues it, but the act row reads as if nothing were ticked while the line
above says four are. Either count the line on `pickedSplit.fresh` too, or say "4 of 6 selected,
none new".

---

### minor-5 — "Added by mistake" announces its refusal in the success voice, with a raw message

`roster-row.tsx:1181-1188`:

```ts
.catch((e: unknown) =>
  setNote(e instanceof Error ? e.message : 'Could not take it back.'),
)
```

`setNote` is the row's polite `role="status"` announcer (`:289-293`) — the same voice that says
"The bid is written on <name>'s seat." A refused hard delete is told to a screen-reader user in the
voice that tells them it succeeded, and `useRemoveProjectParty` throws the RAW PostgREST error for
anything that is not one of the three `SEAT_DELETE_REFUSAL_SENTENCES` (`use-coordination.ts:1114-1118` (the `throw` at `:1115`, the raw PostgREST `error` at `:1118`)),
so a constraint or relation name can reach the face. This is r7 MAJOR-4 and r21 major-2's defect,
which this wave fixed for the bid editor and for the close act two elements away and left standing
on the third act in the same `DocumentActionRow`. Carried from W2, but the wave owns the rule now.

---

### minor-6 — the merge's invalidation fan-out does not reach the picker's history

(r23 minor-1, re-measured and still open, restated here because it now has a second consequence.)
`useMergeStudioContacts.onSuccess` invalidates thirteen roots but not `['studio-contact-history', …]`.
Since r23 major-2 the picker's **search** reads that same rollup (`hits` matches
`history?.[c.id]?.projectNames`, `rolodex-picker.tsx:393`), so after a fold the picker can still be
found by the FOLDED card's prior jobs for up to `staleTime`, and `pickerHistoryLine` prints the
folded card's count. One line beside the twelve already there.

---

### minor-7 — `CloseSeatAct`'s alert is never cleared

`close-seat-act.tsx:81` — `error` is set in the catch (`:179`) and cleared nowhere. Press "Close the
seat", get refused, press "Keep it open", press "Close this seat" again: the stale `role="alert"`
from the first attempt is still under the confirm block. `roster-row.tsx:1130` clears its twin
(`setCloseError(null)`) on every confirm press; the person card's copy does not. One of the two
places §6 of the report says are "hand-kept in step".

---

### minor-8 — §2's invalidation enumeration for the merge is short by three

`w3-room-report.md:185-188` lists ten roots and closes with *"every key a card's facts are read
through"*. The code invalidates thirteen: the ten named plus `partyBidKeys.all`,
`clientHouseholdKeys.all` (both r13 MAJOR-3) and `resolvedContactKeys.all` (r4 B-3) —
`use-studio-contacts.ts:2149-2153`. The summary claim is true; the list under it is not the list.

---

### minor-9 — §1's `### Changed` table omits `packages/supabase/src/database.types.ts`

`git diff --stat 3d65f81e4..HEAD` shows `packages/supabase/src/database.types.ts | 348 ++++++` and
the table names every other changed file. Generated by `db:generate`, so it carries no decision —
but §1 is an enumeration of what the branch changes, and this is the twenty-first file it changes
under the two roots the table covers.

---

### minor-10 — §5's "PR-n, twice" is now four

`w3-room-report.md:293` — "**PR-n, twice.**" The band gates four acts against the principal:
"Set the figure" (`household-band.tsx:716-733`), "Take the figure away" (`:743-765`),
"Record the authority" (`:834-844`, R-BQ) and "Add to the household" (`:938-948`), and `roster-row`
and `close-seat-act` add a fifth rule (`seatCloseIsHeldForMoney`) on the same PR-n ground.

---

### minor-11 — the picker's checkbox rows are not a named group

`rolodex-picker.tsx:961-1051` — a `<ul>` of `role="checkbox"` buttons (`party-mini-row.tsx:245-246`)
with no `role="group"` / `aria-label` around them, while the kind chips one element up have exactly
that (`:911`). A reader lands on "Dana Kowalski, checkbox, not checked" with no announced group
name and no "N of 6". The count line beside it (`data-pick-count`) is not associated with the list
either.

---

### minor-12 — `useRemoveProjectParty` does not invalidate `partyBidKeys`

`use-coordination.ts:1121-1129`. The delete removes a seat whose id stays in
`useProjectPartyBids`'s index for up to `staleTime`. Harmless today (the roster row is gone, so
nothing reads that entry), but it is the one seat writer of the seven that does not tell the bid
read, and `useBringForward` — the seat writer beside it — does (`:2953`).

---

---

## 3. Checked and clean

**The travel list writes only the allowed facts.** `useBringForward`'s INSERT names exactly
`project_id, party_kind, display_name, company_name, company_id, trade, phone, email,
studio_contact_id` (`use-coordination.ts:2918-2929`). No `show_to_client` (born at PD-11's `false`
default), no bid column, no note column, no consent column. `TRAVELS` / `STAYS_BEHIND`
(`travel-list-pane.tsx:20-35` (`TRAVELS` :20, `STAYS_BEHIND` :30)) name "prior pricing · prior project notes · show to client" as what
stays, and the insert keeps that contract literally.

**Consent is never copied per seat.** Nothing in the wave writes a `sms_consent_*` column;
`useAddProjectParty`'s INSERT states the freeze at the site (`use-coordination.ts:548-567`), and
the only consent door is `record_channel_invite` / `record_channel_consent` in `use-consent.ts`.
`useBringForward` calls neither — the seat's phone is written because it is the channel VALUE the
record is keyed on, which the hook's own banner says (`:2860-2867`), and the verdict is read live
through `useChannelConsentRecords` in the picker (`rolodex-picker.tsx:419-426` (`useChannelConsentRecords` :419)) and
`useChannelConsent` on the row. R-AY holds end to end.

**The merge sheet's survivor flip and consequence sentence.** `preferredSurvivorId` pre-picks the
older card by `created_at`, ties broken on id (`compare-merge-sheet.tsx:64-72`); the pre-pick is
taken once and never re-taken while the sheet is open (`:305-314`), so a flip survives a refetch;
`columnHead` is an `aria-pressed` button per column (`:481-491`) and the archived column carries
"Put away" before the press (`:502-509`). The sentence branches on the PAIR for the contact rule
(`:131-138`), splits the three UNION/OR'd facts out of "the survivor's own words stand"
(`:155-159`), states the paper move and the supersede (`:161-162`), and states the one thing that
does not move — "Consent stays with the number, not with the card" — which is true by construction
(`studio_channel_consent` is keyed on `(organization_id, channel_kind, channel_value)`). The
announcement carries the same split (`:461-465`). The one over-claim is minor-3.

**PR-n gating, on both sides.** `set_household_threshold` gates on `v_h.organization_id`
(`00632:662-664`) and the face reads the same org (`household-band.tsx:323-329`);
`add_household_member`'s grant leg gates on `project_party_recorded_studio(seat)` (`00632:488-490`) and
`householdAddIsHeld` mirrors its predicate (`household-band.tsx:300-306`); 00634 gates on
`project_party_recorded_studio(NEW.id)` (`00634:183-199`) and `seatCloseIsHeldForMoney` mirrors it
(`use-coordination.ts:897-906`), read on both close surfaces with a VISIBLE reason
(`roster-row.tsx:1289-1296`, `close-seat-act.tsx:126-133` (the sentence) with `:116-118` (the hold)). Every held act carries
`held` + `aria-describedby` + an on-face sentence; the two `<button>`s that are not `DocumentAction`
carry `aria-disabled` + `aria-describedby` and still fire, printing the reason
(`household-band.tsx:591-600`, `:716-733`, `:743-765`). The face and the database cannot disagree
about standing on any project that records a studio, and on one that records none the grant table's
own RLS makes `v_open = 0`, so the trigger returns before it can refuse.

**"Close this seat" against the hard delete.** One `.delete()` on a seat exists in the whole data
layer — `use-coordination.ts:1117` — reached from one call site, `roster-row.tsx`'s "Added by
mistake" (`:1165`), held behind `seatDeleteRefusal` read BEFORE the act is offered (`:659-668`) and
re-checked server-side over consent verdict, the eight bid columns and `identity_paper_state`
(`:1041-1110`). `useClearContactRule`'s delete is W2's rule row, not a seat. No new delete path.
The word "Remove" appears on no face in the wave.

**Invalidations.** `useMergeStudioContacts` — thirteen roots including `partyBidKeys`,
`clientHouseholdKeys` and `resolvedContactKeys`. `useSetPartyBid`, `useCloseProjectPartySeat`,
`useAddProjectParty`, `useUpdateProjectParty`, `useRemoveProjectParty`, `useSetPartyAuthority`,
`useBringForward` all reach `partyAuthorityKeys.all` and/or `invalidateClientHouseholds` per R-BS.
`useSetHouseholdThreshold` and `useAddHouseholdMember` reach the household keys, the project
household key, `partyAuthorityKeys.all`, `peopleKeys`, `peopleSeatKeys` and the two project roots
(`use-households.ts:612-670`). Gaps are minor-6 and minor-12 only.

**Hooks above early returns, hydration gate.** `CloseSeatAct`'s `if (!confirming)` (`:105`) and
`HouseholdBand`'s `if (!household)` (`:572`) both sit below every `useState`/`useMemo`/`useQuery`/
`useMutation` in their files. `RosterRow` and `RolodexPicker` have no early return. The one width
branch in the wave is CSS, not JS (`roster-row.tsx:740-747`, `hidden sm:inline` / `sm:hidden` for
PR-t's figure), which the comment names as a deliberate hydration guard.

**Document grammar.** Zero `shadow` and zero hex literals in the nine changed/new
`components/document/{people,roster}` files. The four `rgba()` values are the pre-existing
Call Sheet/stamp literals from W2, unchanged. House tokens (`--ink`, `--ink-subtle`, `--rail`,
`--paper`, `--hairline-strong`, `--terracotta-ink`, `--color-*`) throughout; `.t-body-sm` on the
`people/` surfaces. The one off-ladder size is minor-4 of r23, still open.

**SPEC vocabulary.** No schema token reaches a face by any enumerated path: 15 merge sentences,
6 bid sentences, 8 household sentences, 2 archive sentences, 2 seat-close sentences, plus
`write-error.ts`'s twelve `party_*` / `seat_close_*` translations and `asMergeError`'s bare-token
backstop. `HOUSEHOLD_MEMBER_ROLE_LABELS` keeps `client_rep` off the face; `SEAT_BID_OUTCOME_ACTS`
keeps `no_response` / `off_job` off it. The one residue is minor-2.

**`project_consent_org` is not an R-BD violation.** `useRemoveProjectParty:1048-1057` calls it, but
only as the CONSENT LEDGER's key for `channel_consent_status`, which 00628 §2 enumerates as one of
the twelve legitimate remaining callers and R-BD's own words scope the retirement to guards and
reducers. Every gate in the wave resolves through `project_party_recorded_studio` /
`project_recorded_studio`.

**Playwright.** `e2e/people/{bring-forward,merge}.spec.ts` are chromium-pinned
(`test.skip(({browserName}) => browserName !== "chromium", …)`), assert through web-first
`expect(locator)` with explicit timeouts, and poll the database through
`e2e/helpers/supabase-admin.ts` with `expect.poll` for every post-write fact
(`merge.spec.ts:133-149`, `:171-197`). Both write and tear down their own rows rather than mutating
the shipped fixture. `WaitHelpers` is not imported — no spec under `e2e/people/` uses it; it is the
legacy `catalog/` + `crm/` helper and web-first expect is its replacement. Not run this round (the
round takes no port).

**`rosterMetaLine`'s uppercase firm segment is not a finding.** The mini row's whole meta line has
been `font-mono uppercase` since before this wave — the kind and the trade already printed that way
— so F1's firm segment joining it is the shipped treatment, not a regression; the comment at
`rolodex-picker.tsx:336-343` quotes the face as "SUBCONTRACTOR · NORTHGATE ELECTRIC · ELECTRICAL".

**No trade or homeowner writing surface.** Every act added in the wave is studio-side: the merge
sheet, the archive door, the close act, the household band, the bid editor, the bring-forward
picker. Nothing mints a token, nothing exposes a write to a party.

---

## 4. Gates, run this round

All run in the worktree, against the local database, with the env passed inline (no `.env.local`
exists in the worktree and none was created).

| Gate | Result |
|---|---|
| `pnpm --filter @patina/supabase type-check` | **clean** (`tsc --noEmit`, no output) |
| `pnpm --filter designer-portal type-check` | **clean** (`tsc --noEmit`, no output) |
| `pnpm --filter admin-portal build` (after the shared `@patina/supabase` edits) | **EXIT=0**, `next build --webpack`, Next.js 16.2.10 |
| `packages/supabase` vitest — `people-crm-w3.test.ts` + `use-households-r16.test.ts` | **70 passed** (`people-crm-w3` **66**, `use-households-r16` **4**) |
| `apps/designer-portal` jest — the twelve W3 files | **12 suites, 226 passed** |
| `psql … supabase/tests/people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed", last block **13f** |
| live DB carries the r23 amendment | `select position('Put THAT seat back in the bidding' in prosrc) > 0 from pg_proc where proname='merge_studio_contacts'` → **t** |

Per-file jest counts, measured file by file and matched against `w3-room-report.md` §1's
`### Tests`:

```
bring-forward.test.ts          17   compare-merge-sheet.test.tsx   17
compliance-notice.test.ts      10   household-band.test.tsx        45
travel-list-pane.test.tsx       5   close-seat-act.test.tsx         9
archive-card-door.test.tsx      8   rolodex-picker.test.tsx        40
roster-row.test.tsx            56   write-error.test.ts             6
doc-sheet.test.tsx             10   use-project-authority.test.tsx  3
                                                            total  226
```

Every one matches the report. `people-crm-w3.test.ts` = 66, matches. §1's `### Tests` block is
accurate at HEAD; §3 and §5 are not (major-1).

No prod touched. No migration minted. No dev server started, no port taken, no Playwright run.
Nothing committed — the only `git status` entries are this round's artifacts.

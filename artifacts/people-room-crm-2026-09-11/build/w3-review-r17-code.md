# W3 — adversarial code review, round 17

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `bcbec4583`. Working tree clean under
`apps/designer-portal/src`, `packages/supabase/src`, `supabase/`, `e2e/`, `artifacts/`.

Read in full: `w3-room-report.md`, `w3-fix-log-r16.md`, `rulings.md` §3, and every changed
file under `apps/designer-portal/src` and `packages/supabase/src` over
`3d65f81e4..HEAD` (46 files, 10 748 insertions — the W3 range: `b3f3907fd` P2 data,
`47282a2c6` P2 room, and the r1–r16 fix commits).

No prod contact. No server started, no port taken, no Playwright run. No migration minted
(none was needed; `00632` was read, not edited).

---

## 1. Verdict

**Not clean.** Two **major** findings, four **minor**. Zero blocking.

Both majors are the same shape and both are new since r16: a write that this wave changed,
and a face beside it that was not told.

---

## 2. Prior round re-checked

| r16 finding | State | Evidence |
|---|---|---|
| r16-major-1 (migrations) — a card in two households lets either figure rewrite the other's grants | **FIXED** | `00632` §2b mints `project_party_authority.source_household_id`; `add_household_member()` and `set_household_threshold()` both read it beside the clause (`00632:622-700`); the face asks the same rule once, `householdOwnsGrant()` (`packages/supabase/src/hooks/use-households.ts:206-220`) called from `householdMemberConsequence` with the band's own `household.id` (`household-band.tsx:209`, call site `:699-707`) |
| F1 (QA §5) — the `client_rep` added before the figure never got a grant | **FIXED in the database, OPEN on the face** — see MAJOR-2 below | `00632:716-763` opens the grant; `householdThresholdConsequence` (`household-band.tsx:119-125`) was not taught |
| r16-major-1 (code) — the household band read a grant standing on a CLOSED seat | **FIXED** | `use-households.ts:312` selects `off_job_at`; `:354` `openSeatRows`; `:361-368` first open seat per (card, kind); `:392-412` the chosen seat is asked for its grant; `:464-465` the overlap fallback orders `created_at, id` |
| r16-major-2 (code) — the bring-forward sentence counted seats the press would refuse | **FIXED** | `rolodex-picker.tsx:578-597` one `pickedSplit` memo; `:1021` the act label counts `fresh`; `:599-627` `pickedFacts` from `fresh`; `:1036-1040` the sentence takes `pickedSplit.seated`; `:710` `addPicked` destructures the same memo |

---

## 3. Findings

### MAJOR-1 — correcting a withdrawal leaves the seat dated off the job, and every band now prints it

**Confidence: high.** Reproduced by reading the two writers; no other writer clears the column.

`useSetPartyBid` stamps `off_job_at` on the transition into `withdrawn`
(`packages/supabase/src/hooks/use-coordination.ts:2584-2586`) and **never clears it on any
other transition**. `grep -n "off_job_at" packages/supabase/src/hooks/use-coordination.ts`
returns exactly two writes — `useCloseProjectPartySeat:866` and this one — and both only
ever SET it.

`SEAT_STAGES_PAST_THE_BID` (`:2382-2388`) is `mobilized · active · closeout · warranty ·
retired`. **`off_job` is not in it**, so a seat sitting at `off_job` is not "past the bid":
`bidStageOutcome` returns `moved: true, pastTheBid: false` and `useSetPartyBid` writes the
new stage (`:2577-2578`).

MAJOR-7 of this wave deliberately opened that door — the bid editor renders on
`isSeat && (band === 'bidding' || hasBid)` (`roster-row.tsx:796`), so a withdrawn seat in
the Done band offers **"Change what came back"**, which is the whole reason the editor stopped
following the band.

**Screen + state.** Call Sheet → Bidding band → Northgate Electric → *Change what came back*
→ *They withdrew* → **Write the bid**. The seat is now `stage = off_job`,
`off_job_at = 2026-09-15`, and bands into Done. The studio then re-opens the same row and
corrects it to *They quoted*. The write moves `stage` to `bidding`; `off_job_at` stays
`2026-09-15`.

The row now stands in the **Bidding** band and prints, beside its bid note,

> Off the job 15 Sep 2026.

because r15 MAJOR-1 changed `rosterWindowClause` to print the closing date **off the row's own
record at every band**, not only in `done` (`roster-row.tsx:112-124`, the `closedWhen` leg at
`:115` runs before the `band === 'done'` test). Before r15 this defect was invisible; the two
changes landed in the same wave and were never read against each other.

Three readers then disagree with each other over one seat:

- the band (`rosterBandFor` reads `stage` alone, `use-coordination.ts:1771-1783`) says
  **Bidding**;
- `rosterWindowClause` says **off the job, and here is the day**;
- `useProjectHousehold`'s `openSeatRows` (`use-households.ts:354`) counts the same row as
  CLOSED, so on a `client_rep` seat the household band would stop reading its money grant
  while the row still sits in a live band.

"Off the job 15 September 2026." about somebody the studio has just put back on the bid is a
wrong fact on a face, and the record behind it is internally contradictory. Filed major to stay
calibrated with r15 MAJOR-1 (the mirror image — live money authority on a closed seat); a
reasonable synthesis could call it blocking.

**Fix.** In `useSetPartyBid`'s outcome leg, make the stamp symmetrical: when
`written.moved` and `patch.bidOutcome !== 'withdrawn'` and the stage the save writes is not
`off_job`, set `dbPatch.off_job_at = null` (and `off_job_reason = null`) — a seat that is
back in the bidding is not a seat that left the job. Guard it on `written.stage` actually
being written, so a correction that moves nothing leaves a genuine close-seat date alone.
Alternatively add `off_job` to `SEAT_STAGES_PAST_THE_BID` so the stage never moves back —
but that re-closes MAJOR-7's door and is the worse answer. Pin it with a case in
`packages/supabase/src/hooks/__tests__/people-crm-w3.test.ts` asserting the `withdrawn →
quoted` patch carries `off_job_at: null`, and a `roster-row.test.tsx` case asserting a
bidding-band row with a stale `offJobAt` is the state the fix prevents.

---

### MAJOR-2 — "Write the figure" now opens money authority nobody had, and the sentence in front of the press does not say so

**Confidence: high.** Read against the migration the r16 round changed.

r16's F1 fix gave `set_household_threshold()` a second loop
(`supabase/migrations/00632_client_households.sql:716-763`): for **every open `client_rep`
seat of every household member that carries no open `money` grant**, on **every job**, it
`INSERT`s a new `project_party_authority` row at `p_threshold_cents`, stamped with the
household. That is a *creation* of signing authority, not a move.

The band's consequence sentence was not changed with it
(`apps/designer-portal/src/components/document/roster/household-band.tsx:119-125`):

> "Change orders over $2,500 will need a signature from the household. **Every household
> member who already signs money from this figure moves to $2,500, on every job.** Nothing is
> sent to them."

A member who signs nothing does not "already sign money from this figure", so the sentence
says nothing at all about them — while the press hands them a $2,500 money grant on every
open seat they hold.

**Screen + state.** Call Sheet → Client side → household band. The household holds Chidi
Okonkwo as `client_rep` with no money grant (added before any figure existed — exactly the
population F1 was filed for; his person card reads "No authority on this job"). An owner
presses **Set the figure**, types `2500`, reads the sentence, presses **Write the figure**.
Chidi now signs money to $2,500 on this job and on every other open `client_rep` seat he
holds. Nothing on the face said he would.

This is the same defect class the wave already closed twice on the neighbouring sentence —
B2R-1 ("the sentence names the grant the act actually writes") and r10 BLOCKING-1 ("the face
reads what the write will really do"). The figure act is the one act in this band that moves
other people's money authority, and it is now the one with the incomplete sentence.

Two smaller consequences of the same omission, worth folding into the fix:

- `householdThresholdConsequence` takes only `cents`. The band already holds
  `resolved.clientSideMoneyGrants` and `resolved.memberCardIds`, so it can name how many
  members will be newly granted — the honest sentence is "…and any household member who signs
  for the household and has no figure of their own will be given one at $2,500."
- The widened refusal is reachable from this act now: a member seated on a studio-less job
  makes `set_household_threshold()` raise `household_grant_project_has_no_studio`
  (`00632:730-736`). The sentence exists (`use-households.ts:113-114`) and
  `writeErrorMessage` passes it through, so the refusal reads correctly — but the face gives
  no warning that a figure act can now fail over a *different* job's seat.

**Fix.** Widen `householdThresholdConsequence(cents, newlyGrantedCount)` and pass the count
the band can already compute, then extend `household-band.test.tsx`'s figure-consequence
cases to cover the "opens one where there was none" branch.

---

### MINOR-1 — the merge sentence puts the firm designations in the clause that says they move, not the clause that says the survivor wins

**Confidence: medium.**

`mergeConsequenceSentence` (`compare-merge-sheet.tsx:96-166`) reads

> "<merged>'s **seats, channels and firm designations** move onto <survivor>…"

00629 reduces the three designations by **COALESCE onto the survivor** — the comment on
`carriedRows` says so out loud (`compare-merge-sheet.tsx:246-260`: "which card survives
decides which of two paperwork contacts, signers or site contacts the room keeps"). So with a
Signer on both cards, the folded card's Signer does **not** move.

The later clause "where both cards say something <survivor>'s own words stand" is scoped by
its own sentence to "the verdict, the notes and the payee facts", so a studio reading the
first clause is told the designations move unconditionally. The sheet prints both values in
the table two elements above — this is precisely the lever PR-o exists to let the studio pull.

Not filed higher because the qualifying clause is present in the paragraph and a careful
reader reaches the right answer.

**Fix.** Move "firm designations" out of the first clause into the COALESCE clause, the way
r13 MAJOR-2 already branched the contact rule:
`"<merged>'s seats and channels move onto <survivor> … Everything else <merged> holds — the
verdict, the notes, the payee facts and the firm designations — travels the same way, and
where both cards say something <survivor>'s own words stand."` Extend
`compare-merge-sheet.test.tsx`'s consequence cases.

---

### MINOR-2 — the household band asserts "No household is on file" before the resolver has answered

**Confidence: high.**

`HouseholdBand` renders the empty branch on `!household`
(`household-band.tsx:443-487`), and `useProjectHousehold` has no loading branch anywhere on
the face. While the query is in flight (`useProjectHousehold` makes up to five sequential
round trips — `projects`, `designer_clients`, `project_parties`,
`project_party_authority`, `client_households`, `use-households.ts:246-478`), the Client side
band prints

> "No household is on file for this client, so there is nowhere to record who else may sign."

with **Open a household** beside it, rendered `aria-disabled` and captioned "Seat the client
on this job first, then open the household." — over a job that does seat the client and does
have a household.

No data harm: `householdWouldBeFindable` is false while `memberCardIds` is empty, so
`openHousehold()` refuses and sets the error (`:344-351`). It self-corrects on the first
render after the read lands. But it is a definite factual assertion the record has not
answered, on the surface whose own QA-1 rule is "the band may not contradict the rows above
it".

**Fix.** Take `isPending` off `useProjectHousehold` and render nothing (or a neutral line)
until the resolver answers, the way the Call Sheet's other bands wait on
`useCallSheetRoster`'s `isLoading`.

### MINOR-3 — the archive door reads "held" for an owner while `useOrganizations()` is in flight

**Confidence: high.** Same class as MINOR-2, one surface over.

`person-profile.tsx:207-212` computes `canArchiveCard` from `memberOrgs`, which is
`undefined` on first render, so `ArchiveCardDoor` mounts with `canArchive === false` and
renders the act `aria-disabled` with "Only an owner or an admin of the studio may put a card
away, or bring one back." on the face — to an owner. Transient and self-correcting; no write
is possible in the window.

**Fix.** Hold the door's render until the membership read resolves, or default `canArchive`
to the un-held state and let the RPC's own refusal speak.

### MINOR-4 — `useSetPartyBid` does not invalidate the household key, though it can write `off_job_at`

**Confidence: medium; reachability low.**

Five of the six seat writers call `invalidateClientHouseholds` (`use-coordination.ts:36-38`,
called at `:588`, `:755`, `:880`, `:1028`, `:2003`, `:2713`). `useSetPartyBid`'s `onSuccess`
(`:2597-2603`) does not, and it writes `stage` and `off_job_at` — the two columns
`useProjectHousehold`'s `openSeatRows` filter reads. A `client_rep` seat carrying a bid is
the only way in, which is why this is minor rather than major; it is nonetheless the one
writer left out of the helper r15 introduced so the six would stay in step.

**Fix.** Add `invalidateClientHouseholds(queryClient)` to `useSetPartyBid`'s `onSuccess`, and
add it to the invalidation test that pins the other five.

---

## 4. Checked and clean

| Check | Result |
|---|---|
| **Travel list writes only the allowed facts** | `useBringForward`'s INSERT names `project_id, party_kind, display_name, company_name, company_id, trade, phone, email, studio_contact_id` and nothing else (`use-coordination.ts:2667-2678`). No consent column, no bid column, no `show_to_client`, no notes, no pricing. Pinned by `people-crm-w3.test.ts`'s forbidden-key sweep and by `e2e/people/bring-forward.spec.ts`'s post-write assertions |
| **Consent never copied per seat** | No write to `sms_consent_*` anywhere in the diff; the only `opt_out_*` reads are display reads off `studio_channel_consent` (`rolodex-picker.tsx:922-934`). R-AS/R-AY held |
| **Consent write outside `record_channel_consent`** | None. No consent RPC is called by any W3 hook |
| **Merge survivor flip** | `survivorId` state, pre-picked once (`compare-merge-sheet.tsx:305-314`, guarded on `if (survivorId ...) return` so a refetch cannot undo a flip), both heads `aria-pressed` (`:475-517`), the act label, `mergedId`, the consequence sentence and `peopleEvents.cardsMerged({ survivor_flipped })` all read the flipped value. Walked by `e2e/people/merge.spec.ts` |
| **Merge consequence sentence** | True on the contact-rule pair (branches on both cards, `:104-137`), on trades/specialties/sole-proprietor (kept together, not picked), on consent (untouched by construction), on paper (moves, supersede where in force), on the ID (both stay resolvable, and `useResolvedContactId` + `people-room.tsx:275-352` actually deliver it). Only the designations clause is loose — MINOR-1 |
| **Data loss on merge** | None reachable from the portal: `merge_studio_contacts` is the only path, thirteen refusals all render as sentences (`use-studio-contacts.ts:1924-1962`), `asMergeError` catches bare snake_case tokens (`:1994-2003`), and no hook deletes a card |
| **PR-n gating** | `householdAddIsHeld` mirrors `00632:395-400`; the add act is `held` (aria-disabled, focusable, `aria-describedby` at a sentence always on the face); "Set the figure" / "Take the figure away" are `aria-disabled` for a non-principal with `household-figure-held` rendered unconditionally in that state; `useSetHouseholdThreshold` renders the RLS refusal as a sentence and treats a null return as the refusal (`use-households.ts:564-568`) |
| **"Close this seat" replaced every hard delete** | `grep "\.delete()"` over the two hook files returns two rows: `useRemoveProjectParty` (`use-coordination.ts:1019`, held behind `seatDeleteRefusal`, whose `hasBid` now reads the bid COLUMNS as well as the stage list) and `useClearContactRule` (a rule, not a seat). `useRemoveProjectParty`'s only call site is `roster-row.tsx:260`. `CloseSeatAct` is mounted on the person card (`person-profile.tsx:521-528`); the Call Sheet keeps its declared hand-kept copy (r15 MAJOR-2, settled) |
| **Invalidations** | `useMergeStudioContacts` reaches ten keys plus `partyBidKeys.all`, `clientHouseholdKeys.all` and `resolvedContactKeys.all`. `useSetHouseholdThreshold` / `useAddHouseholdMember` reach `partyAuthorityKeys.all`, which **prefix-matches** `projectAuthorityKeys.project` (`use-project-authority.ts:24-27`), so the Call Sheet's authority lines refetch. `clientHouseholdKeys.all` prefix-matches `['client-households','project',id]`. `studioContactKeys.all` prefix-matches `.detail`, so the archive door's own card refetches. One gap — MINOR-4 |
| **Cross-tenant** | No unscoped read introduced: every list read filters `organization_id` (`useClientHouseholds`, `useComplianceNotices`, `useStudioContactMerges`) or an id set RLS already scopes (`useComplianceDocumentsFor`, `useProjectPartyBids`, `useStudioContactHistory`, the `client_households` overlap over this studio's own `studio_contacts` ids) |
| **Merged cards stop being offered** | `StudioContactFilters.includeMerged` defaults false and `useStudioContacts` applies `.is('merged_into', null)` (`use-studio-contacts.ts:215-217`); the picker, the "who priced it" select and the household-member select all take the default. `writeErrorMessage` translates `party_card_merged_away` / `party_company_merged_away` for the paths that can still race it |
| **aria contract** | Every *held* act is `aria-disabled` + focusable + `aria-describedby` at a sentence rendered in that same state (`DocumentAction`'s `held` sets `disabled={unavailable && !held}`, `document-action.tsx:309`). The four native `disabled` uses are incomplete-form or in-flight states, not refusals. `PartyMiniRow` `multi` renders `role="checkbox"` + `aria-checked` with a square mark and no tick glyph; the single-add control is a keyboard-reachable SIBLING of the row button, not a nested one |
| **Document grammar** | No `box-shadow`/`shadow-*`, no raw hex, no new `rgba()` anywhere in the portal diff. House tokens throughout (`--ink`, `--rail`, `--hairline-strong`, `--color-*`); `.t-body-sm` on the people-room surfaces, the Call Sheet's existing arbitrary steps on the roster surfaces, matching each file's neighbours. Every sheet is a `DocSheet` (`CompareMergeSheet` with `wide`, `RolodexPicker`) |
| **SPEC vocabulary** | No schema token reaches a face: outcomes render through `SEAT_BID_OUTCOME_ACTS` / `_LABELS`, roles through `HOUSEHOLD_MEMBER_ROLE_LABELS`, evidence through `MERGE_MATCHED_ON_LABELS`, paper nouns through the one `heldClausePaperNoun` map. `asMergeError`'s bare-token guard closes the last door |
| **Hooks above early returns** | `HouseholdBand`, `CompareMergeSheet`, `RosterRow`, `DirectoryView`, `PersonProfile`, `RolodexPicker` — every hook is declared before the first conditional return in each |
| **Playwright** | `apps/designer-portal/e2e/people/{bring-forward,merge}.spec.ts`, both chromium-pinned by `test.skip(({browserName}) => browserName !== 'chromium')`, both reading through `e2e/helpers/supabase-admin.ts`'s `adminDb` with `expect.poll`, web-first `expect` throughout, no `networkidle`, no `waitForTimeout`. Both tear down what they create. Not re-run this round (no port taken) |
| **Migration numbering** | None minted. Highest on the branch is `00633`; `00595–00620` untouched |
| **No trade or homeowner writing surface** | Confirmed — every act in the diff is a studio-side act on a designer-portal surface |

---

## 5. Gates — run in this round, pasted

```
$ pnpm --dir .../packages/supabase type-check
> tsc --noEmit
EXIT=0

$ pnpm --dir .../apps/designer-portal type-check
> tsc --noEmit
EXIT=0

$ pnpm --dir .../apps/admin-portal build
  ✓ Compiled successfully
  (full route table printed; 137 routes)
EXIT=0

$ cd apps/designer-portal && npx jest
Test Suites: 593 passed, 593 total
Tests:       7679 passed, 7679 total
Snapshots:   1 passed, 1 total
Time:        27.096 s

$ cd apps/designer-portal && npx jest src/components/document/roster/__tests__ \
    src/components/document/people/__tests__ src/lib/document/__tests__
Test Suites: 139 passed, 139 total
Tests:       2814 passed, 2814 total

$ cd packages/supabase && npx vitest run
 Test Files  106 passed (106)
      Tests  1350 passed | 12 skipped (1362)

$ cd packages/supabase && npx vitest run src/hooks/__tests__/people-crm-w3.test.ts \
    src/hooks/__tests__/use-households-r16.test.ts
 ✓ use-households-r16.test.ts  (4 tests)
 ✓ people-crm-w3.test.ts      (40 tests)
 Test Files  2 passed (2)   Tests  44 passed (44)
```

Every number matches the room report's §9/r16 table. **Both majors are invisible to the
suites** — MAJOR-1 needs a two-write sequence no unit test plays, and MAJOR-2 is a sentence
whose only test asserts the sentence as written.

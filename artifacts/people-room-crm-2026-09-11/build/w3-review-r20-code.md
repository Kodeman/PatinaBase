# W3 (P2) — adversarial code review, round 20

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `1026dc584`. Local Postgres only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **No prod touched. No migration
minted. No dev server started; no port taken.** One temporary jest case was appended to a tracked
test file to reproduce finding 1 and the file was restored byte-for-byte afterwards
(`git status` clean on it).

Scope read in full: every file changed under `apps/designer-portal/src` and
`packages/supabase/src` between the W2 close-out (`3d65f81e4`) and HEAD — 50 files,
11,605 insertions.

**Verdict: NOT clean — 2 major, 5 minor, 0 blocking.**

---

## 0. Round 19's four findings, re-measured

| r19 finding | State at HEAD |
|---|---|
| `r19-major-1` (migrations) — the refusal's HINT named a repair that left two live figures | **FIXED.** `00634_seat_close_ends_authority.sql` exists, is above 00627 and clear of the reserved 00595–00620; `end_party_authority_at_seat_close_trg` is present on the local database (`select tgname from pg_trigger` returns it); the ledger head reads `20260910152111, 00634, 00633, 00632, 00631`. `use-project-authority.ts:76` drops a grant whose `effective_to` is set on a seat that has left the job. |
| QA `MAJOR-1` — the picker's sheet head named no job | **FIXED.** `rolodex-picker.tsx:859` passes `pageLabel={projectName ?? undefined}`; `doc-sheet.tsx:164-178` no longer carries `hidden … sm:inline` on the page-label span. |
| `r19-major-1` (code) — a bid correction moved a hand-closed seat's date | **FIXED.** `use-coordination.ts:2610` reads `if (patch.bidOutcome === 'withdrawn' && written.moved && !previous.offJobAt)`; `SetPartyBidInput.previous.offJobAt` exists (`use-coordination.ts:2453-2463`) and `roster-row.tsx:539` passes `row.offJobAt ?? null`. |
| `r19-major-2` — §1's test list and §9's gate table stale | **FIXED for §1 and §9** (re-measured below, every number matches). **§2 is now stale in four places — filed fresh as finding 2.** |

---

## 1. MAJOR — "Close this seat" is offered on a seat that has already left the job, and pressing it overwrites the recorded closing date and erases the recorded reason

`apps/designer-portal/src/components/document/roster/roster-row.tsx:1165-1174` ·
`apps/designer-portal/src/components/document/roster/roster-row.tsx:1040-1060` ·
`packages/supabase/src/hooks/use-coordination.ts:856-882`

**Confidence: high — reproduced.**

The Call Sheet row's act row gates the close act on `isSeat` alone
(`roster-row.tsx:1165` — `{isSeat && (<DocumentAction actionKey="close-seat" …>Close this
seat</DocumentAction>)}`). Nothing reads `row.offJobAt` or `row.stage`. So a row sitting in the
Done band, already carrying `off_job_at` and the studio's own `off_job_reason`, still offers the
act — and `useCloseProjectPartySeat` writes all three columns unconditionally:

```ts
// use-coordination.ts:864-868
.update({
  stage: 'off_job',
  off_job_at: input.offJobAt ?? new Date().toISOString().slice(0, 10),
  off_job_reason: input.reason?.trim() || null,
})
```

The row's `reason` state is initialised to `''` (`roster-row.tsx:213`) and is **not** seeded from
`row.offJobReason`, so the confirm sends `reason: ''` and the hook writes `off_job_reason = NULL`
and `off_job_at = today`. Nothing anywhere holds the originals: no audit row, no second copy —
the same "a date the room already holds is the record" harm r19 major-1 closed for the bid
editor, through the room's own primary door.

**Reproduced.** A temporary jest case appended to `roster-row.test.tsx`, run and then reverted:

```
row: { stage: 'off_job', offJobAt: '2026-09-10', offJobReason: 'Picked another electrician.' }
band: 'done', expanded

✓ still offers Close this seat and rewrites the recorded date and reason (44 ms)
PROBE payload: {"id":"seat-dana","projectId":"okonkwo","reason":""}
Tests: 51 passed, 51 total
```

The act renders; the confirm calls the close mutation with an empty reason.

**And the confirm sentence is a wrong fact in that state.** `roster-row.tsx:1021-1023` prints
"– Close Dana Kowalski's seat? The seat stays on the job with the day it closed, and everything it
carries stays with it." On an already-closed seat the day it closed is exactly what the press
moves, and the reason is exactly what it drops.

**The two copies the report calls hand-kept in step are not in step here.** The person card's
`CloseSeatAct` is mounted only over `liveSeats`
(`person-profile.tsx:255-258` — `(seats ?? []).filter((s) => !DONE_STAGES.has(String(s.stage)))`,
`DONE_STAGES` containing `off_job`), so the same act on the person card is correctly unreachable
for a closed seat. `w3-room-report.md` §6 and `close-seat-act.tsx:14-25` both assert the two
copies are kept in step; on this point they are not, and the report does not name the divergence.

**Provenance, stated so the orchestrator can scope it.** The act row itself is W2
(`git log -L 1160,1176` → `50b81d33c feat(people-room): the Call Sheet by the window…`). But W3
r15 made `rosterWindowClause` print "Off the job &lt;date&gt;." from the row's own record in every
band (`roster-row.tsx:107-121`), so the date this press moves is now printed on the same row; and
W3 r19 established the invariant for the bid editor while leaving the door that actually writes
the column ungated. No test in `roster-row.test.tsx` renders a closed seat and asserts on the act
(`grep "Close this seat"` → lines 553/559/575/595, all on a live `active` row).

**Fix, smallest first.** Gate the act the way the person card gates it — hide it, or `held` it
with a reason on the face, when `row.offJobAt` is set (or `row.stage === 'off_job'`); and/or seed
`reason` from `row.offJobReason` so the field never silently blanks a recorded sentence. A
server-side guard in `useCloseProjectPartySeat` (refuse, or COALESCE, when the seat already
carries `off_job_at`) would close the same hole for every future caller.

---

## 2. MAJOR — the room report's §2 is stale at HEAD in four places, and §5 misquotes a refusal the hook does not carry

`artifacts/people-room-crm-2026-09-11/build/w3-room-report.md:117-138, 132, 139-143, 252-256`

**Confidence: high — every line diffed against HEAD.**

This is the fifth filing of the recurring report-drift defect (r7 M-4, r8 MAJOR-1, r15 MAJOR-3,
r19 major-2). The r19 fix log's item 4 re-measured **§1 and §9 only** ("Every count in §1 and §9
was re-measured this round"); §2 was last measured in the r15 round, before r18 added a refusal
and before r13 MAJOR-2 changed the rule branch.

| Report says | HEAD says |
|---|---|
| `:139` "Each of `merge_studio_contacts()`'s **thirteen** refusals renders as a sentence", listing thirteen keys | `MERGE_REFUSAL_SENTENCES` (`use-studio-contacts.ts:1925-1971`) holds **fourteen**. `merge_seat_collision` (`:1964`) — r18 MAJOR-1's own refusal, the one whose HINT r19 built 00634 around — is missing from both the count and the list. |
| `:136-138` the Room's status line is "Two cards are now one. &lt;survivor&gt; carries **everything** &lt;merged&gt; held." | `compare-merge-sheet.tsx:461-465` says "Two cards are now one. &lt;survivor&gt; carries **what** &lt;merged&gt; held, and where both cards said something, &lt;survivor&gt;'s own words stand — except the trades and specialties, which are kept together." The report quotes the exact wording r5 B-1 / r11 BLOCKING-1 removed **as a wrong fact** ("'carries everything &lt;merged&gt; held' was false"). |
| `:116-117` "**With no rule on the survivor** it reads:" followed by a quote whose first clause contains "contact rule" | `compare-merge-sheet.tsx:131` — `const ruleMoves = mergedHasRule && !survivorHasRule;`. With no rule on either card (the ordinary duplicate, and the state the quoted Chidi/Adaeze fixture is in) the clause reads "seats, channels and firm designations". The quote as printed requires the FOLDED card to hold a rule, which the report does not say. |
| `:132-134` "**Where the survivor has a rule**, 'contact rule' drops out of the first clause and a sixth clause is inserted" | `compare-merge-sheet.tsx:135-138` — `ruleStays` is non-empty only when `survivorHasRule && mergedHasRule`. With a rule on the survivor and none on the folded card, no sixth clause is inserted — which is precisely what r13 MAJOR-2 / r13 QA MAJOR-1 fixed and the report still describes the pre-r13 behaviour. |
| `:254-255` "`useSetHouseholdThreshold` renders the RLS refusal as \"A change-order figure is the principal's to set. Ask an owner or an admin of the studio.\"" | `use-households.ts:116-117` — `household_threshold_forbidden` reads "A change-order figure is the principal's to set, **and the principal's to take away.** Ask an owner or an admin of the studio." The sentence the report quotes is the BAND's own click-handler string (`household-band.tsx:721-724`), not the hook's. |

Each of these is a reader disagreeing with the record, which is the report's whole job.

---

## 3. MINOR — `useSetPartyBid` is the one seat writer that does not invalidate the household key

`packages/supabase/src/hooks/use-coordination.ts:2654-2660`

**Confidence: high on the gap, low on reachability.**

r15 MAJOR (code) closed this for six writers through one helper,
`invalidateClientHouseholds` (`use-coordination.ts:33-35`), and
`w3-room-report.md` §5 names them: `useAddProjectParty`, `useUpdateProjectParty`,
`useCloseProjectPartySeat`, `useRemoveProjectParty`, `useSetPartyAuthority`, `useBringForward`.
`useSetPartyBid` is a seventh writer of the same columns — it writes `stage`, and both the
stamping branch (`:2610-2612`) and R-BR's clearing branch (`:2641-2642`) write `off_job_at` — and
`useProjectHousehold`'s queryFn reads `project_parties … select('id, studio_contact_id,
party_kind, created_at, off_job_at')` and filters on `off_job_at`
(`use-households.ts:327`, filtered at `:365`), which is exactly what decides `memberCardIds`,
`clientSideHasAuthority`, `clientSideMoneyGrants` and `clientRepSeatCardIds`. Its `onSuccess`
invalidates `partyBidKeys`, `project-parties`, `project-roster`, `peopleKeys` and
`peopleSeatKeys` and stops there.

Not reachable through the shipped face today: the bid editor is offered only on
`band === 'bidding' || hasBid` (`roster-row.tsx:800`), and a `client` / `client_rep` seat is
banded `clientSide` and is born with no bid column, so it can never acquire one. Filed as the
same class of latent gap the r15 round closed, and because the helper exists precisely so the
writers stay in step.

**Fix.** Add `invalidateClientHouseholds(queryClient);` to `useSetPartyBid`'s `onSuccess`.

---

## 4. MINOR — the merge consequence sentence puts "firm designations" in the unconditional moves clause, while 00629 COALESCEs them survivor-first

`apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx:131-133, 141-143, 155-157` ·
`supabase/migrations/00629_studio_contact_merges.sql:2065-2073`

**Confidence: high on the fact, low on reachability.**

00629 reduces the three designations survivor-first:

```sql
paperwork_contact_person_id = COALESCE(s.paperwork_contact_person_id,
                                       NULLIF(v_merged.paperwork_contact_person_id, s.id)),
signer_person_id            = COALESCE(s.signer_person_id, …),
site_contact_person_id      = COALESCE(s.site_contact_person_id, …),
```

The sentence's first clause says "&lt;merged&gt;'s seats, channels[, contact rule] and **firm
designations move onto** &lt;survivor&gt;" with no pair branch, while the "where both cards say
something &lt;survivor&gt;'s own words stand" qualifier is attached to the *third* clause
(the verdict / notes / payee facts). Where both cards name a Signer, the folded card's does not
move and the sentence says it does — the same shape as r4 B-2 (the contact rule) and r13 MAJOR-2,
which were both filed and both fixed by branching the clause on the pair.

Not reachable from the shipped surface: `CompareMergeSheet` is mounted only from the Directory's
duplicate band (`directory-view.tsx:526-537`), and `directoryDuplicatePairs` now pairs only
`row.role === "contact"` rows (`people-derivation.ts:1370`), so both cards are person cards
and the three designation columns are firm-card columns — `carriedRows` prints a row only where
at least one card holds the fact, so the rows do not render. The component is exported and
generic, so the sentence is wrong for any caller that reaches a firm pair.

---

## 5. MINOR — a fold and a bring-forward leave the picker's history rollup stale

`packages/supabase/src/hooks/use-studio-contacts.ts:2074-2102` (`useMergeStudioContacts.onSuccess`) ·
`packages/supabase/src/hooks/use-coordination.ts:2764-2772` (`useBringForward.onSuccess`)

**Confidence: high.**

`useStudioContactHistory` is keyed `['studio-contact-history', ids, excludeProjectId]`
(`use-studio-contacts.ts:541`) and reads `project_parties` grouped by `studio_contact_id`. A merge
repoints every seat's `studio_contact_id` (00629), and a bring-forward inserts seats. Neither
mutation invalidates that root — `useMergeStudioContacts` names ten roots plus `partyBidKeys`,
`clientHouseholdKeys` and `resolvedContactKeys` but not this one — so with the portal's
`staleTime` at five minutes the picker's history line ("Worked 2 prior projects, Lindqvist
kitchen, closed 2025.") and the search that reads `projectNames` can answer for the pre-fold
world. The picker closes on a successful bring-forward (`finish()`), which narrows the window;
the merge sheet does not close the Room.

**Fix.** `void queryClient.invalidateQueries({ queryKey: ['studio-contact-history'] });` in both.

---

## 6. MINOR — three different counts for one selection when every ticked row is already seated

`apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:913, 1033, 1048` ·
`apps/designer-portal/src/lib/document/bring-forward.ts:96-100`

**Confidence: high on the behaviour, low that it is a defect.**

`data-pick-count` reads `bringForwardSelectionLine(picked.length, hits.length, …)` — every ticked
row. The act label reads `bringForwardActLabel(pickedSplit.fresh.length)` and the consequence
sentence counts `pickedFacts` (also fresh). Performing Leah's task 5 on the seeded Okonkwo — where
all four are already seated — therefore prints "4 of 5 from the Lindqvist kitchen selected", an act
reading the zero wording "**Add to the roster**", and "Adds no seats to the Okonkwo residence.
Dana Kowalski, Pete Rusk, Ingrid Halvorsen, Claire Bissett are already on the call sheet." The
sentence is honest and r16 MAJOR-2 deliberately moved the label and the sentence onto the fresh
split; the count line was left on the ticked count, so the three numbers on one screen are 4, 0
and 0. Named rather than asserted as wrong: if the count line is meant to say what is TICKED, it
is right as it stands and only the report should say so.

---

## 7. MINOR — the travel-list landmark is labelled with half its contents

`apps/designer-portal/src/components/document/roster/travel-list-pane.tsx:40-47`

**Confidence: high on the fact, low on impact.**

The `<aside aria-label="What travels">` holds both lists — `data-travels` and
`data-stays-behind`. A screen-reader user landing on the complementary landmark is told it is
"What travels" and then hears "prior pricing, prior project notes, show to client" inside it. The
two headings are `<p>`, not headings, so there is no structure to distinguish them either. SPEC
§5.7 #5's contract is the pair; the landmark names one half of it.

**Fix.** Label the landmark "What travels, and what stays behind", or promote the two `<p>`s to
headings and label the lists with `aria-labelledby`.

---

## 8. What was checked and found sound

**Travel list writes only the allowed facts.** `useBringForward`'s INSERT
(`use-coordination.ts:2732-2743`) names exactly `project_id, party_kind, display_name,
company_name, company_id, trade, phone, email, studio_contact_id`. No pricing column, no notes,
no `show_to_client`, no `bid_*`, no `sms_consent_*`. `TRAVELS` / `STAYS_BEHIND`
(`travel-list-pane.tsx:20-37`) agree with that payload item for item.

**Consent is never copied per seat, and never written outside the record.** Grepped every W3
hook and surface for `sms_consent_*`, `studio_channel_consent`, `record_channel_consent`,
`record_channel_invite`: the only calls are W2-era (`useAddProjectParty:534`, gated on
`wantsText`, which the picker's own add door never sets; `useSendPartySms:817`). W3 adds none.
R-AY holds; the merge writes nothing to consent by construction (the record is keyed on the
channel value, and `useMergeStudioContacts` touches no consent table).

**Survivor flip and the consequence sentence.** `preferredSurvivorId` (`compare-merge-sheet.tsx:64-72`) pre-picks the
older card with an id tiebreak; the pre-pick is taken once and never re-taken (`:305-315`), so a
refetch cannot undo a flip; both column heads are `aria-pressed` buttons (`:480-490`);
`survivor_flipped` is recorded against the same function (`:450-453`). The sentence branches on
the PAIR for the contact rule (r13 MAJOR-2) and splits out the UNIONed trades/specialties and
the OR'd sole-proprietor flag (r11 BLOCKING-1); its closing clause is about the ID, which is what
the merge record guarantees. The one remaining imprecision is finding 4.

**PR-n gating.** `householdAddIsHeld` (`household-band.tsx:300-308`) mirrors 00632's own grant
leg; the add act and "Record the authority" both use `held` + `aria-describedby` + a reason that
stands on the face whether or not the act is pressed (`:914-927` and `:934-961` for the add act, `:826-856` for "Record the authority"); "Set
the figure" and "Take the figure away" are plain `aria-disabled` buttons whose onClick states the
refusal (`:710-772`); `useSetHouseholdThreshold` translates a zero-row RPC answer into
`household_threshold_forbidden`'s sentence rather than swallowing it (`use-households.ts:605-609`).

**"Close this seat" replaced every hard delete.** `grep "\.delete()"` across the three W3 hook
files returns two sites: `use-coordination.ts:1019` (`useRemoveProjectParty`, the surviving
"Added by mistake", held behind `seatDeleteRefusal` — `roster-row.tsx:576-584, 1080-1107`) and
`use-studio-contacts.ts:1226` (`useClearContactRule`, which deletes a rule row, not a seat or a
card). `grep useRemoveProjectParty` across `apps/designer-portal/src` returns one call site,
`roster-row.tsx:260`. `seatDeleteRefusal`'s `hasBid` now reads the bid COLUMNS as well as the
stage (`use-coordination.ts:976-982`), so an awarded or withdrawn seat is no longer deletable.
Archive and restore are repointed at 00629's RPCs and answer `studio_contact_not_found` rather
than leaking ids.

**Invalidations.** Every W3 mutation's fan-out was walked against the keys its write moves.
`useMergeStudioContacts` reaches thirteen roots including `partyBidKeys`, `clientHouseholdKeys`
and `resolvedContactKeys`; `useAddHouseholdMember` and `useSetHouseholdThreshold` both reach
`partyAuthorityKeys.all`, which by React Query's prefix match also covers the portal-local
`projectAuthorityKeys.project(...)` (`use-project-authority.ts:24-27`). The two gaps are findings
3 and 5.

**aria-disabled, not disabled.** Every GATED act in the wave uses `held` (which keeps the control
focusable and stamps `aria-disabled="true"` — `document-action.tsx:73-86, 276-281, 309`) or a
plain `<button aria-disabled>`, each with `aria-describedby` pointing at a sentence rendered
unconditionally. The remaining native `disabled` props are transient busy states
(`merge.isPending`, `addParty.isPending`, `bringForward.isPending`), which is not the §A5 "held"
case.

**Hooks above early returns, hydration.** `HouseholdBand` (every hook precedes the
`if (!household)` return at `:582`), `CloseSeatAct` (`if (!confirming)` at `:70`, after all four
hooks), `CompareMergeSheet`, `ArchiveCardDoor`, `RolodexPicker`, `TravelListPane` — all clean.
The only `window` reads are inside `useEffect` (`rolodex-picker.tsx:223`, `people-room.tsx:217-228`).

**Data access, types, controls.** All Supabase reads and writes go through `@patina/supabase`
hooks; no ad-hoc `fetch`. `use-project-authority.ts` is the one portal-local Supabase reader and
is pre-existing W2a with its "OWED TO @patina/supabase" note. `@patina/types` is unchanged by this
wave, `database.types.ts` carries every new relation, column and RPC (`bid_due_at`, `bid_asked_at`,
`merged_into`, `source_household_id`, `co_threshold_cents`, `client_households`,
`studio_compliance_notices`, `studio_contact_merges`, and all seven RPCs). `@patina/supabase`
ships source (`package.json` `main: ./src/index.ts`), so there is no dist to stale.

**Document grammar.** No `box-shadow` / `shadow-` anywhere in
`components/document/{people,roster}`. Both terracotta tokens the wave uses are defined
(`globals.css:35` `--color-terracotta-ink`, `:2002` `--terracotta-ink`); `bg-white/40` and the
`border-l-2 border-[var(--color-pearl)]` rail are the surfaces' established idiom
(`notice-log.tsx:71`, `kickoff-band.tsx:77`, `party-profile-sheet.tsx:823`). Every sheet in the
wave is a `DocSheet` (`compare-merge-sheet.tsx:515`, `rolodex-picker.tsx:855`).

**SPEC vocabulary.** The bid select renders `SEAT_BID_OUTCOME_ACTS`, never the column tokens
(`roster-row.tsx:866-874`); the evidence select renders `MERGE_MATCHED_ON_LABELS`; the household
roles render `HOUSEHOLD_MEMBER_ROLE_LABELS` ("decides the work" / "signs for the household").
`asMergeError` answers a bare snake_case token with a sentence rather than printing it
(`use-studio-contacts.ts:2022-2024`), and `writeErrorMessage` gained ten more 00624 / 00629 /
00631 tokens.

**Playwright.** `e2e/people/bring-forward.spec.ts` and `merge.spec.ts` are chromium-pinned
(`test.skip(({browserName}) => browserName !== "chromium", …)`), assert through
`e2e/helpers/supabase-admin`'s `adminDb`, and use `expect.poll` with explicit timeouts
(`bring-forward:135, 191, 243`; `merge:136, 192`) plus web-first `expect(locator).toContainText`.
Neither uses `networkidle` or `waitForTimeout`. Neither imports `e2e/utils/wait-helpers`; no spec
under `e2e/people/` does — the folder's idiom is web-first expect plus `expect.poll`, which these
two follow.

**No trade or homeowner writing surface.** The whole diff is `apps/designer-portal`,
`packages/supabase`, `supabase/`. No `apps/client-portal`, no `apps/mobile`, no
`apps/manufacturer-portal` file is touched.

---

## 9. Gates re-run this round

| Gate | Result |
|---|---|
| `pnpm --filter @patina/supabase type-check` | **clean** (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/designer-portal type-check` | **clean** (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/admin-portal build` (inline local env, no `.env.local`) | **rc=0**, full route table emitted |
| designer-portal jest, the wave's eleven touched suites | **11 suites, 209 tests, all passed, 3.9 s** — matching §1 file for file: bring-forward 17 · compliance-notice 10 · travel-list-pane 5 · compare-merge-sheet 17 · household-band 45 · close-seat-act 6 · archive-card-door 8 · rolodex-picker 38 · roster-row 50 · doc-sheet 10 · use-project-authority 3 (sum 209) |
| `packages/supabase` vitest, `people-crm-w3.test.ts` + `use-households-r16.test.ts` | **2 files, 49 passed** (45 + 4) — §1's "45" confirmed |
| local ledger / trigger | `20260910152111, 00634, 00633, 00632, 00631`; `end_party_authority_at_seat_close_trg` present |
| generated types | every W3 relation, column and RPC present in `packages/supabase/src/database.types.ts` |

Env for the admin build came from `supabase status -o env` on this worktree, passed inline; no
`.env.local` was created and none exists.

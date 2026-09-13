# W2c — the Call Sheet, the site access card, the pick, and the end of the flag

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local only. **Nothing was pushed to Strata**, no migration minted, no dev server started, no e2e run.

Four things landed:

1. **The Call Sheet is banded by the window**, not by build & supply — six bands, a head that folds
   the site access card to one line, and vitals whose first number counts who is on site this week.
2. **The site access card exists** (E15), studio-only, with no code and no field in which to type one.
3. **The pick carries what travels** — reach, consent and paper words, the rule as a sentence, and one
   history line with no verdict.
4. **The `call-sheet` flag is retired** at all 14 consumers, and every dead fallback branch behind it
   is deleted, not left standing.

---

## 1. Files

### New

| File | What it is |
|---|---|
| `apps/designer-portal/src/components/document/roster/site-access-card.tsx` | E15's card: who to call first, the way in, key holder, hours, receiving, who was told. Plus `gateControllerName`, `keyHolderRow` and `useSiteAccessSummary` (R-U's one-line fold, used by the Call Sheet head) |
| `apps/designer-portal/src/components/document/roster/notice-log.tsx` | "Log who was told" as an inline band, never a modal; writes `told_refs` through `useLogSiteAccessTold` |
| `apps/designer-portal/src/components/document/roster/use-call-sheet-roster.ts` | The composition both roster surfaces read: `useProjectRoster` + `usePeopleSeats` + the project's authority, handed to the pure projection |
| `apps/designer-portal/src/components/document/roster/use-project-authority.ts` | **Owed to @patina/supabase** (§4) — one read of every seat's grants on one project |
| `apps/designer-portal/src/lib/document/__tests__/call-sheet-derivation.test.ts` | 17 tests over the projection, the vitals and the sentences |
| `apps/designer-portal/src/components/document/roster/__tests__/site-access-card.test.tsx` | 12 tests |
| `apps/designer-portal/src/components/document/roster/__tests__/notice-log.test.tsx` | 4 tests |
| `apps/designer-portal/e2e/people/call-sheet.spec.ts` | Leah tasks 3 and 6, chromium-pinned, with a DB assertion over `told_refs` by `expect.poll` |

### Rewritten

| File | Change in one line |
|---|---|
| `roster/call-sheet.tsx` | Head names the job; site access folded to one line with an inline open; vitals count the window; six bands; no flag |
| `roster/roster-groups.tsx` | Build & supply replaced by the six bands, Bidding set visually apart from the crew |
| `roster/roster-row.tsx` | Reads a `CallSheetRow`; authority as plain text; held clause and opted-out note on the COLLAPSED row; `tel:` sibling; `aria-controls` on the unfold; **Close this seat** (two steps, with a reason) replaces Remove, and the hard delete is held behind `seatDeleteRefusal` |
| `roster/reach-chip.tsx` | Rebound to `StateWord`'s reach family; the three hand-written tints are gone |
| `roster/party-mini-row.tsx` | Carries consent and paper words beside reach, and the contact rule as a sentence |
| `roster/rolodex-picker.tsx` | No flag; mini rows read their words from `usePeopleDirectory` (one read, keyed on the rolodex card); `pickerHistoryLine` replaces "3 projects · last: X" |
| `roster/call-sheet-mount.tsx` | Chevron opens a seat by its own id and kind, through `seatProfileRole` |
| `roster/project-team-roster.tsx` | Reads the same projection as the sheet, so the two surfaces cannot drift; no flag |
| `roster/kickoff-band.tsx` | No flag |
| `lib/document/roster-derivation.ts` | **Added** the Call Sheet projection, the window bands, the vitals, and the sentences (below). Nothing was removed: `groupRoster`, `projectRosterProjection`, `reachState`, `vitalsLine`, `vitalsInstrumentSuffix`, `kickoffRetired`, `rosterHasIdentity` all still stand for their other callers |

### Flag retirement — all 14 consumers

`desk/page.tsx` · `doc/[id]/page.tsx` · `command-bar.tsx` · `letterhead-instruments.tsx` ·
`coordination/item-composer.tsx` · `roster/rolodex-picker.tsx` · `roster/kickoff-band.tsx` ·
`roster/project-team-roster.tsx` · `roster/call-sheet.tsx` · `mobile/mobile-sheets.tsx` ·
`mobile/mobile-bar.tsx` · `people/party-profile-sheet.tsx` · `people/views/directory-view.tsx`
(removed by W2b in flight) · `account/account-studio-page.tsx`.

`grep -rn "useFeatureFlag('call-sheet')" apps/designer-portal/src` returns nothing.

**Dead branches deleted, not left standing:** the item composer's `<select>` court picker (the flag-off
half of a two-mode block), the desk and studio pages' `callSheetOn ? … : 0` rolodex counts, the command
bar's surface filter, the mobile bar's spread `...(callSheetOn ? [row] : [])`, and the three flag-off
cases in the doorway specs.

---

## 2. Strings added

Every one is from SPEC §5's acceptance lists or today's voice. No schema word reaches a face.

| String | Where |
|---|---|
| `Call sheet · <project>` | the sheet's head (§5.4 #1) |
| `Open the site access card` | the head's inline act (§5.4 #2) |
| `<n> on the job this week · <n> reachable by text · <n> with accounts · <n> on paper` | the vitals (§5.4 #3) |
| `Studio side` · `Client side` · `On the job · this week` · `On the job · later` · `Bidding` · `Done` | the six band headings |
| `Site access held. <Firm>’s <paper> lapsed <d Month yyyy>.` | the held clause (§5.4 #7, PR-h) |
| `Close this seat` · `Close the seat` · `Keep it open` · `Why it closed` · `Added by mistake` | the act that replaced Remove (§5.4 #14) |
| `– Close <name>’s seat? The seat stays on the job with the day it closed, and everything it carries stays with it.` | the two-step confirm |
| `Ends with the job, <d Month yyyy>. Renews when they use it.` | the field link's expiry, in words (PR-d/PR-l) |
| `Texting opens once they have said yes on the record and a number is on file.` | the held Text act's reason |
| `Site access · <project>` · `Studio only. This card never reaches a client page.` | the card's head (§5.6 #1, #9) |
| `Who to call first` · `The way in` · `Key holder` · `Hours` · `Receiving` · `Who was told` | the card's six region heads |
| `<Lockbox version>. The code is held off Patina; ask <name>.` | the way in (§5.6 #3, PR-r) |
| `<name> controls the gate.` | the gate line |
| `<name> holds a key.` | the key holder line (§5.6 #4) |
| `The way in changed <d Mon yyyy>, by <name>. Told: <names>.` / `Nobody has been told yet.` | the notice (§5.6 #7) |
| `Log who was told` · `Save this note` · `Not now` · `– Everyone on the job has been told.` · `One more name is on the notice.` | the inline band (§5.6 #8) |
| `– Nothing is written about the way in yet.` · `Start the card` | the card's empty state |
| `Key held by <name>. <name> controls the gate. Changed <d Mon yyyy>.` | R-U's fold |
| `Worked <n> prior projects, <job>, <year>.` / `Never on a job yet` | the picker's history line (PR-i) |
| `No site hours on file.` · `No receiving note on file.` · `No lockbox on file.` · `– No emergency line on file.` · `– Nobody on the job is marked as holding a key.` | the card's absences, each stated rather than blank |

The consent sentence is **not** a new string here: R-Q asks for one wording everywhere, and W2b's
`people/consent-sentence.ts` is it. The roster row imports that rather than keeping a second copy —
a first draft of one lived in `roster-derivation.ts` and was deleted when W2b's landed.

---

## 3. Acts, and what they write

| Act | Writes | Through |
|---|---|---|
| Close this seat → Close the seat | `stage='off_job'`, dated `off_job_at`, the reason | `useCloseProjectPartySeat` |
| Added by mistake | a DELETE, and only where `seatDeleteRefusal` returns null | `useRemoveProjectParty` |
| Copy field link | a token whose expiry is the seat's window | `useCreateFieldLink({ expiresAt: on_site_to })` |
| Show to client | `show_to_client` | `useUpdateProjectParty` |
| Text → Send | an SMS, only on a standing grant | `useSendPartySms` |
| Edit (way in / hours / receiving) | the card, stamping `changed_at`/`changed_by` and clearing `told_refs` | `useUpdateSiteAccessCard` |
| Log who was told → Save this note | appends to `told_refs` | `useLogSiteAccessTold` |

Analytics: `peopleEvents.seatClosed` (with `hard_deleted` on the mistaken add), `grantMinted`
(`expiry_source: 'engagement_window'` when the seat has a window), `siteAccessChanged`
(`way_in` / `hours` / `receiving` / `told`, with `told_count`), `personCardOpened`
(`roster_row` / `site_access`). No inline `posthog.capture`.

---

## 4. Not built, and why

1. **`useProjectAuthority` lives on my surface, not in @patina/supabase.** W2a exports
   `usePartyAuthority(engagementId)` — ONE seat's grants — and the Call Sheet needs every seat's, for
   the authority phrase on the studio and client bands and for the gate controller's name. Twenty-five
   seats would be twenty-five queries. The read is
   `apps/designer-portal/src/components/document/roster/use-project-authority.ts`, keyed **under**
   `partyAuthorityKeys.all` so `useSetPartyAuthority`'s invalidation reaches it. **Owed to the
   orchestrator:** move it beside `usePartyAuthority` as `useProjectPartyAuthority(projectId)`.
2. **The bid note (R-R) has no source.** `project_parties` carries no `bid_due_at` / `bid_outcome` /
   `bid_amount_cents` — W1b §"owed" names them P2. The Bidding band prints, and its rows carry the
   stage word and the firm, but "Quoted 2 October 2026. Selected 9 October 2026." cannot be rendered
   from anything. Not faked.
3. **"Who was told" is one entry, not a log.** `project_site_access_cards` holds a single
   `changed_at` / `changed_by` / `told_refs` triple, so the card prints the LAST change and who was
   told about it. SPEC §5.6 #7 shows two entries; a second requires a change-log table nobody has
   minted.
4. **The consent sentence's "on the <project>" clause only prints where the project can be named.**
   `studio_channel_consent.origin_project_id` is an id, not a name; the sheet knows its own job's name
   and nothing else's. A consent carried in from another job prints its source and its date and stops
   rather than inventing a place. (W2b's `consentSentence` already behaves this way; the Call Sheet
   passes its own project name.)
5. **The picker's history line says the year the studio last seated them, not the year the job
   closed.** `useStudioContactHistory` returns `lastAt` off `project_parties.created_at`; the closed
   year would need `projects.completed_at` in that read. The line reads "Worked 1 prior project,
   Lindqvist kitchen, 2025." rather than SPEC §5.7's "…closed 2025" — the word "closed" would be a
   claim the data does not make. One line in that hook fixes it.
6. **The travel-list pane is W3's**, per the brief. The picker's mini rows carry what travels; the
   pane that names it ("What travels" / "What stays behind") and the multi-select confirm are not
   here, and neither is `peopleEvents.bringForwardPicked`.
7. **Task 5's e2e is not written** (bring-forward), because the pane it walks arrives in W3. Tasks 3
   and 6 are in `e2e/people/call-sheet.spec.ts`; tasks 1, 2 and 4 are W2b's.
8. **`deriveStatusDot` still stands in `people-derivation.ts`.** W2a left it for its caller,
   `views/person-profile.tsx`, which is W2b's surface, not mine.
9. **R-M's plain 390 words are not branched on width.** The Call Sheet is a 760px DocSheet whose rows
   already print reach and stage as bordered words at every width; `StateWord`'s `plain` variant and
   `ReachChip`'s `plain` prop exist and are wired, but nothing in this surface measures a viewport.
   The Directory's 390 row is W2b's.
10. **No migration, no flag registry change.** The `call-sheet` flag is removed from the CODE; whoever
    owns the PostHog project still has the flag definition to archive after deploy.

---

## 5. Gates

```
pnpm --filter @patina/designer-portal type-check      clean
pnpm --filter @patina/supabase        type-check      clean
npx eslint src/components/document/roster src/lib/document/roster-derivation.ts   clean
```

Jest, this surface:

```
src/lib/document/__tests__/call-sheet-derivation.test.ts        17 passed
src/components/document/roster/__tests__/call-sheet.test.tsx    12 passed
src/components/document/roster/__tests__/roster-row.test.tsx    15 passed
src/components/document/roster/__tests__/site-access-card.test.tsx  12 passed
src/components/document/roster/__tests__/notice-log.test.tsx     4 passed
src/components/document/roster/__tests__/call-sheet-mount.test.tsx  5 passed
src/components/document/roster/__tests__/rolodex-picker.test.tsx    13 passed
src/components/document/roster/__tests__/project-roster-surfaces.test.tsx  5 passed
src/components/document/roster/__tests__/kickoff-band.test.tsx   (flag case dropped)
src/components/document/coordination/__tests__/item-composer-party.test.tsx  10 passed
src/components/document/mobile/mobile-bar.test.tsx              passed
src/components/document/__tests__/call-sheet-doorways.test.tsx  passed
src/app/(document)/desk/page.test.tsx                           11 passed
```

Whole designer-portal suite at hand-off: **576 of 578 suites green**. The two red ones are
`people/__tests__/person-profile.test.tsx` and
`lib/document/__tests__/document-action-hierarchy-contract.test.ts` — both read
`people/views/person-profile.tsx`, W2b's surface, mid-flight in the same worktree. Nothing in this
wave touches either file.

**Not run here, on purpose:** the Playwright spec. The QA reviewer owns 3000/3002 and runs e2e against
a prod build; no dev server was started and no port was taken.

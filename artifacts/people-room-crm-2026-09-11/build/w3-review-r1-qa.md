# W3 (P2) Round 1 — Runtime QA against a local production build

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local only. `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. No prod touched.

## Procedure actually run

1. **PORT RULE**: `lsof -nP -iTCP:3000/3002 -sTCP:LISTEN` — both free before starting; no
   orphan to kill.
2. `supabase db reset` (from `supabase/` inside the worktree) — clean replay of all
   migrations through `00633_decision_court_widened.sql` + `20260910152111_create_contact_messages.sql`,
   then all 27 wired seed files including `people_crm_dev.sql`. `{"target":"local","version":"","message":"Reset local database."}`.
3. `pnpm --filter @patina/designer-portal build` with the inline env block (§ ENV FOR LOCAL
   PROD BUILDS) — exit 0, full route table printed, `/people`, `/doc/[id]` etc. present.
4. `npx next start -p 3000` in the background from `apps/designer-portal` (with the same
   inline env). Confirmed listening (`curl / → 200`, `curl /people → 307` to sign-in).
5. `npx playwright test e2e/people --project=chromium` — pasted in full below.
6. Manual walk signed in as `designer@patina.dev` (password auth — Inbucket was not needed;
   the seeded account's password from `e2e/fixtures/auth.ts` worked directly and no magic-link
   step was in the flow) at 1440 and 390, screenshots under `build/qa-w3-r1/`.
7. Stopped the server (`kill` the `next start` PID), confirmed `lsof -nP -iTCP:3000 -sTCP:LISTEN`
   empty afterward.

Screenshots and raw text dumps: `build/qa-w3-r1/*.png`, `*.txt`, `results*.json`,
`household-results.json`, `household-member-results.json`, `console-errors*.log`.

## e2e/people (chromium) — pasted

```
Running 22 tests using 7 workers
11 failed
    e2e/people/add-client-letter.spec.ts:47:5 › a letter goes to a new client, and only one
    e2e/people/add-client-letter.spec.ts:115:5 › the roster still works with no letter, and nothing is sent
    e2e/people/add-sheet.spec.ts:37:7 › task 1 — a text-only rule lands on the PERSON, not on the seat
    e2e/people/add-sheet.spec.ts:103:7 › task 2 — a household member is a seat and an authority grant, two facts
    e2e/people/add-sheet.spec.ts:145:7 › the sheet asks for a trade before it will write a sub
    e2e/people/bring-forward.spec.ts:108:5 › task 5 — search the prior job, tick four, one confirm
    e2e/people/bring-forward.spec.ts:231:5 › Put back clears the pick and writes nothing
    e2e/people/call-sheet.spec.ts:91:5 › task 3 — who has site access right now, one click from the sheet
    e2e/people/merge.spec.ts:81:5 › the duplicate band merges two cards into one (PR-o)
    e2e/people/person-card.spec.ts:51:7 › task 4 — do not contact, routed to somebody reachable
    e2e/people/person-card.spec.ts:111:7 › R-V — every region prints, and an absent record says so in words
11 passed (1.0m)
```

Re-run solo (`--workers=1`) to remove cross-file races: `bring-forward.spec.ts` and
`merge.spec.ts` fail identically and deterministically, confirming they are not flakes from
parallel workers sharing the seeded designer.

Of the 11 failures, **only `bring-forward.spec.ts` and `merge.spec.ts` are this wave's own new
specs** (per w3-room-report.md §1); the other 9 (`add-client-letter`, `add-sheet` ×3,
`call-sheet`, `person-card` ×2) are pre-existing specs from earlier waves and out of this
review's scope except where cited below as corroborating evidence. They are not analysed
further here.

- `bring-forward.spec.ts` — both tests fail in `beforeAll` with
  `{"code":"PGRST204","message":"Could not find the 'title' column of 'projects' in the schema cache"}`.
  See finding QA-1.
- `merge.spec.ts` — fails on its own final assertion. See finding QA-2 (not a product defect;
  the merge itself works — see the manual walk).

## Manual walk

### Task 5 — Bring forward (SPEC §5.7)

Opened Okonkwo's Call Sheet → **From the rolodex**, searched "Lindqvist"
(`build/qa-w3-r1/02-bring-forward-picker-1440.png`, `.txt`). Result: **"0 OF 1 FROM THE
LINDQVIST KITCHEN SELECTED"**, one row (Ben Ostrom), not the specimen's 5 rows / "4 of 5"
(compare `shots/people-room-1440-state-pick-1440.png`). This is *expected* here — the seed
already seats Dana, Pete, Ingrid and Claire on Okonkwo (confirmed: `project_parties` rows,
`stage` active/awarded), exactly as w3-room-report.md §10 item 1 warns ("bringing them forward
onto Okonkwo can only ever read 'already on the call sheet'"). Not a finding.

To test the general mechanism I created a **fresh, unrelated project** (`QA Bring Forward Fresh
Job`, no existing seats at all — the same workaround the wave's own e2e spec uses) and repeated
the search. Result: **still only Ben Ostrom** — Dana, Pete, Ingrid and Claire, all four of whom
worked "Lindqvist kitchen" per `project_parties`, do not appear even though none of them has a
seat on this brand-new project. See **QA-3 (major)** below — this is the wave's own declared
"search reads the prior job" enhancement (room-report §3) failing whenever a candidate's *most
recent* seat is a different, later job.

Everything else in the picker rendered correctly and matches SPEC/rulings: R-U's site-access
summary line prints above the picker at both widths; the picker's fixed contract (checkbox,
34px circle, name/firm/trade, history line, three words) is intact for Ben Ostrom's row; the
"What travels" / "What stays behind" pane is present and complete at 1440
(`02-bring-forward-picker-1440.png`) and reflows below the list at 390
(`03-bring-forward-picker-390.png`); the act row ("Add no to the roster" / "Put back") is first,
both live, with the consequence sentence directly under it ("Adds no seats to the QA Bring
Forward Fresh Job."). No console errors during this flow beyond the pre-login noise in QA-8.

**QA-7 (minor)**: confirmed via source, not just observation — `bringForwardConsequence()`
(`apps/designer-portal/src/lib/document/bring-forward.ts:109-125`) concatenates whatever
`paperClause` string it is handed; the caller (`rolodex-picker.tsx`) builds that clause with
`noticedPaperClause()` (`apps/designer-portal/src/lib/document/compliance-notice.ts:49-67`),
which always spells the month out in full ("31 March 2026" — see that file's own doc-comment at
line 50, and every live render: Dana Kowalski's roster-row clause, the picker's per-row
subline, and the company card all read "31 March 2026" / "31 December 2025" / "6 October 2026").
SPEC §5.7 #7 requires the exact string "…lapsed **31 Mar 2026**." (abbreviated) — and
`bring-forward.ts`'s own doc-comment at line 103 *also* quotes the abbreviated form, i.e. the
doc-comment itself is aspirational and does not describe what the function actually emits. The
exact-string acceptance criterion cannot be met as currently wired.

### Compare & merge (manual, since merge.spec.ts's own scenario is unusable as an assertion)

Seeded a duplicate pair via SQL (`Wren Ashby QA` / `W. Ashby QA`, same phone, one older) —
the same setup merge.spec.ts uses. Walked it by hand:

- Duplicate band: "These two cards share a phone." + both names as live controls +
  "Compare these two" (`10-duplicate-band-1440.png`). Matches R-Y exactly.
- Sheet (`11-compare-merge-sheet-1440.png`): nine fields side by side; **older card
  pre-picked** ("Wren Ashby QA … KEEPS THE CARD"), flip control present; evidence select
  defaults to phone (not shown but not touched — default untouched); consequence sentence
  reads exactly per the formula: *"W. Ashby QA's seats, channels, contact rule, paper and firm
  designations move onto Wren Ashby QA. Consent stays with the number, not with the card, so
  nobody's yes or no changes. W. Ashby QA's card is kept as a record of the merge, and both
  ways of reaching this person still work."* Terminal act reads "MERGE INTO WREN ASHBY QA".
- After the act (`12-after-merge-1440.png`): Directory count dropped 42→41; the merged card's
  own page opens on the **survivor** ("Wren Ashby QA"); Room announcer:
  *"Two cards are now one. Wren Ashby QA carries everything W. Ashby QA held."*
  DB confirms `merged_into` set on the newer card, `archived_at` still NULL (kept as record, not
  archived), `studio_contact_merges` row present with `matched_on='phone'`, and
  `resolve_merged_contact()` resolves the merged id forward to the survivor.

**Merge itself is correct.** The only defect is in the wave's own test:

**QA-2 (minor)**: `merge.spec.ts:178` asserts
`await expect(page.getByText(NEWER_NAME)).toHaveCount(0)` — but the Room's own confirmation
sentence (by design, per room-report §2) *names the merged card* ("…carries everything
&lt;merged&gt; held."), so `NEWER_NAME` is never fully absent from the page after a successful
merge. The assertion is unsatisfiable by design, not by bug; the spec needs scoping (e.g. assert
absence within `[data-directory-list]` rather than the whole page).

### Bidding band — edit a bid outcome

On Okonkwo's Bidding band, expanded the folded "Rivera Finishes" row (chevron), opened
"Write the bid" (`20b-rivera-row-expanded-1440.png`), set "How it came back" → "They declined"
(`22-bid-outcome-selected-1440.png`), saved. Result (`23-after-bid-write-1440.png`): outcome
badge now reads "DECLINED"; **Rivera Finishes correctly stays in the Bidding band** (not moved
to Done), matching the room-report's rule (`declined`/`no_response` stay in Bidding,
`withdrawn` alone moves to Done). Confirmation toast: "The bid is written on Rivera Finishes's
seat." Confirmed via source that `useSetPartyBid` writes `stage` alongside `bid_outcome` via
`SEAT_BID_OUTCOME_STAGE`.

**QA-6 (minor)**: the editor's own live preview sentence is grammatically broken for 3 of the 6
outcomes. Observed: *"Recording this moves Rivera Finishes to they declined. A bidder who did
not win never reads as crew."* — confirmed via source
(`apps/designer-portal/src/components/document/roster/roster-row.tsx`, the
`` `Recording this moves ${row.name} to ${SEAT_BID_OUTCOME_ACTS[bidDraft.outcome].toLowerCase()}` ``
template) that this reads the SAME way for `quoted` ("…to they quoted.") and `withdrawn`
("…to they withdrew."), because `SEAT_BID_OUTCOME_ACTS` (`packages/supabase/src/hooks/use-coordination.ts:2248-2255`)
stores full clauses ("They declined", "They quoted", "They withdrew") that don't lower-case into
a bare state name. `selected`→"selected", `no_response`→"no response", `asked`→"asked for a
price" read fine. This is the live in-editor preview only — the saved outcome badge and the
`data-bid-note` face text both read correctly as acts ("Declined"), so no data or reader-facing
fact is wrong; it's a one-line copy bug in a transient hint.

### Household — add a member with a threshold as the principal; confirm a member cannot

**QA-1 (blocking)**: on the pristine, freshly reset Okonkwo residence, opening the Call Sheet
shows a direct, simultaneous contradiction about the same fact:

- The Client-side party rows (unconditional, no click needed) read: *"Adaeze Okonkwo — CLIENT ■
  Okonkwo household"* and *"Chidi Okonkwo — HOUSEHOLD MEMBER ■ Okonkwo household — Signs money
  to $2,500. Approves change orders to $2,500. Certifies draws."* — asserting a household
  named "Okonkwo household" exists, with a recorded $2,500 authority.
- A few lines below, the NEW `[data-household-band]` (`household-band.tsx:203-208`) reads:
  *"No household is on file for this client, so there is nowhere to record who else may sign."*
  with an "OPEN A HOUSEHOLD" act.

Confirmed by direct `innerText()` extraction of the same rendered Call Sheet DOM in one pass
(`build/qa-w3-r1/household-band-check.txt`) — both strings are present on the one screen at the
same time, no user action between them. Chidi's authority line comes from the pre-existing
`project_party_authority` grant (00624-era; seed `people_crm_dev.sql:694,696`); the new band
reads a different table (`client_households`, 00632) which has no row yet. The room-report's
own "Not done, and owed" §10 item 2 discloses that the band is *inert* on this seed, but does
not disclose that its "no household on file" copy is flatly contradicted by adjacent,
already-rendered text asserting the opposite. A studio member reading this screen cannot tell
which statement is true.

**QA-4 (major)**: pressed "Open a household" as the owner (`designer@patina.dev`). This does
create a `client_households` row (confirmed: `id=160283fb-…`, `organization_id`/`designer_id`
correct) — but with **`member_person_ids = {}`** (confirmed in DB). `useProjectHousehold`
(`packages/supabase/src/hooks/use-households.ts:170-230`) finds a household only via
`.overlaps("member_person_ids", memberCardIds)` (line 225) against the project's client-side
identities — an empty array can never overlap anything, by definition. So the band **can never
detect the household it just created**: after the click, it re-renders exactly as before ("No
household is on file… OPEN A HOUSEHOLD"), and `[data-edit-household-threshold]` /
`[data-add-household-member]` never appear (confirmed: both `waitFor` timed out after the
click). `useCreateClientHousehold` (`use-households.ts:246-280`) never seeds
`member_person_ids` at creation. Practically: **the "Open a household" onboarding path is
unusable for any first-time household in the product** — the only households that could ever
work are ones inserted directly at the database (as the room-report's own "probed end to end in
a rolled-back transaction" note in §5 did). A studio member pressing the button repeatedly would
silently create a new orphaned `client_households` row on every click, since nothing ever
becomes visible to stop them.

To confirm the REST of the mechanism is sound once this specific gap is worked around, I
populated `member_person_ids` on that same row directly in Postgres (Adaeze's and Chidi's
`studio_contact_id`s) and repeated the UI walk:

- Band now reads *"No change-order figure is on file for this household."* (absence stated,
  matches R-V's pattern) with live "Set the figure" / "Add a household member" acts
  (`aria-disabled="false"` for the owner).
- Set the figure to 2500 → band updates to *"Change orders over $2,500 need a signature from
  the household."* (`household-results.json`).
- Add a household member → Chidi Okonkwo, consequence sentence: *"Chidi Okonkwo joins the
  household and takes a seat on the Okonkwo residence. They may sign change orders over $2,500.
  Nothing is sent to them."* → saved. DB confirms `client_households.co_threshold_cents=250000`
  and `project_party_authority` rows for Chidi's existing engagement at `money=250000` and
  `change_order=250000` (his existing seat was reused, exactly as room-report §5 describes).

So **once a household is discoverable, the rest of the feature — threshold set as principal,
member add, the consequence sentence, the grant write — is correct.** The defect is narrowly
and precisely the empty-members bug in `openHousehold()` / `useCreateClientHousehold`.

**Confirm a member cannot** — the RLS boundary was verified directly and is **correct**: I
created a temporary `organization_members` row with `role='member'` in the same studio, signed
in as that user through GoTrue, and issued a direct `PATCH` to `client_households` (via
PostgREST, the same path the UI hook uses) attempting to write `co_threshold_cents`. Result:
`42501 — "new row violates row-level security policy for table client_households"`. A `GET` of
the same row as that user succeeds (read is `is_studio_comember`-gated only, as designed). This
confirms the `is_org_admin_or_owner` WITH CHECK (00632 migration) is sound; there is no
principal-gate hole. I was **not able to complete the UI-level check** (that the "Set the
figure" button itself renders `aria-disabled` for that user) — the designer portal's own
`middleware.ts` role-gate (`profiles.role` must be one of
`independent_designer/studio_owner/studio_admin/studio_designer`) redirected the test account to
`/unauthorized` before it could reach the Call Sheet, for reasons unrelated to this wave (a bare
`organization_members.role='member'` row with no matching `profiles.role` is simply not a shape
the seed produces anywhere; this is a pre-existing portal-access gate, not a W3 regression). Not
a finding; noted as a testing limitation. Cleaned up the temporary account and the test
household row afterward (see Cleanup below).

### Close a seat with a reason

Opened Ingrid Halvorsen's person card (`/people?person=d0e10000-…-013`; her name was not
reachable as a Playwright accessible-name match from the folded Call Sheet row without scrolling
its internal band into view — direct navigation was used instead, see Notes). Region 4 "Seats on
projects" → **Close this seat** → confirm sentence *"Close Ingrid Halvorsen's seat? The seat
stays on the job with the day it closed, and everything it carries stays with it."* → entered
reason "QA: seat closed as part of W3 review r1" → **Close the seat**. Result: seat moved from
"Seats on projects" to "Past seats" reading *"Okonkwo residence · sub · cabinetry — OFF THE JOB —
Closed 13 Sep 2026."* Confirmed in DB: `stage='off_job'`, `off_job_at='2026-09-13'`,
`off_job_reason='QA: seat closed as part of W3 review r1'` — the reason is written verbatim and
dated correctly. This is a **residual mutation to the shared seed** (Ingrid's Okonkwo seat is now
closed going forward on this local DB) — flagged in Notes, not reverted (no "reopen" act exists
by design — closing is meant to be a one-way dated act).

The confirmation text *"Ingrid Halvorsen's seat is closed."* appears twice in the page's
`innerText()` dump — consistent with the same visible-toast-plus-`aria-live`-region duplication
pattern also seen on the merge announcer; not flagged as a separate finding (same pattern, no
duplicate interactive elements, likely a deliberate sr/visual split).

### Archive / restore as owner

On the merge survivor card ("Wren Ashby QA", now with no open seats) — **Put this card away**
→ `50-archive-before-1440.png` → `51-archived-1440.png`: sentence *"This card was put away 13
September 2026. It stays out of the book until it is brought back."* (matches R-V's
always-on-the-face pattern exactly) and the act relabels to **Bring this card back**. Clicked it
→ `52-restored-1440.png`: toast *"Wren Ashby QA is back in the book."*, act relabels back to
"Put this card away", and `[data-archived-sentence]` is correctly absent again (only renders
while archived). Both `useArchiveStudioContact`/`useRestoreStudioContact` round-tripped cleanly
with no console errors. No finding.

## Console

Across every walk, the **only** recurring console signal is a transient pre-login noise pattern
(3 of 5 independent fresh browser contexts): a `TypeError: Failed to fetch` inside minified
`@supabase/*`'s `_getUser`/`_useSession`, immediately followed by `Error logged: AppError: Not
authenticated`, both firing during the very first paint of `/auth/signin`, before credentials
are submitted. Every subsequent flow in every session was clean.

**QA-8 (minor, low confidence)**: flagging per the "console clean" check rather than omitting
it. The stack traces are entirely minified vendor code with no W3 file in them, and it does not
block sign-in or anything downstream, so attribution to this wave is not established — logged
for completeness, not asserted as a regression.

## Notes / testing artifacts

- Fresh project `QA Bring Forward Fresh Job` (`eeee0000-0000-0000-0000-0000000000e1`), the
  merge duplicate pair (`Wren Ashby QA` / `W. Ashby QA`, ids `…d1`/`…d2`), the temporary
  `client_households` row, and the temporary `qa-member-2026-09-13@patina.dev` account were all
  created for this review and **removed** afterward (project + its parties/authority rows,
  both duplicate cards + their channels, the household row, the temp org-member/profile/auth
  user). Confirmed post-cleanup: `client_households` count 0, `studio_contacts` person count
  back to 28 in that org (matches pre-QA).
- **Not reverted, by design**: Ingrid Halvorsen's seat on Okonkwo residence is now `off_job`
  (closed with the QA reason text above) — closing a seat has no "reopen" act in this wave, so
  this is a permanent, intended-shape change to the local seed from performing the requested
  QA step. Whoever runs the next round on this DB should expect Ingrid off the job unless the DB
  is reset again (which the brief already has scheduled for later rounds).
- Person-card links from a folded/scrolled Call Sheet band were not reliably clickable via
  Playwright's accessible-name role query in this pass (the click landed without visible
  navigation, twice, on two different rows) — worked around with direct `?person=<id>` URLs.
  Not filed as a finding since the same person cards opened correctly when reached via the
  Directory or via `person=` links elsewhere in this walk; recorded here only so a re-run knows
  to scroll the row fully into view first, or use `getByRole('button', {name}).click({force:...})`-free
  direct navigation as done here.
- `supabase status -o env` and `next start` on `output: standalone` both required
  `dangerouslyDisableSandbox` for the same class of reason (a background daemon telemetry
  write, and the standalone-mode warning respectively) — neither affected the DB, only local
  tool sandboxing; noted for the record, not a product finding.

## Findings

| ID | Severity | Confidence | Where | Claim |
|---|---|---|---|---|
| QA-1 | **Blocking** | High | `apps/designer-portal/src/components/document/roster/household-band.tsx:203-208` vs seed `supabase/seed/people_crm_dev.sql:694,696` (rendered via existing `project_party_authority` designation copy) | On the pristine, freshly reset Okonkwo Call Sheet, the Client-side party rows unconditionally assert "Okonkwo household" exists with a recorded $2,500 authority (Chidi's row), while the household band a few lines below unconditionally asserts "No household is on file for this client, so there is nowhere to record who else may sign" — two simultaneously-rendered, directly contradictory facts about the same household on one screen, with no user action between them. |
| QA-4 | Major | High | `packages/supabase/src/hooks/use-households.ts:170-230` (`useProjectHousehold`'s `.overlaps("member_person_ids", …)`) and `:246-280` (`useCreateClientHousehold`) via `household-band.tsx:137-151` (`openHousehold`) | "Open a household" inserts a `client_households` row with `member_person_ids = {}` (never seeded); the band's own lookup requires a non-empty overlap with the project's client-side identities, so it can never detect the household it just created. Confirmed in DB after using the real UI button. The onboarding path for a first-time household is unusable for any project in the product; every retry silently creates another orphaned row. The rest of the mechanism (threshold set, member add, grant write) is correct once a household is made discoverable by direct DB edit. |
| QA-3 | Major | High | `packages/supabase/src/hooks/use-studio-contacts.ts:484-537` (`useStudioContactHistory`, `lastProjectName` = most-recent seat only) consumed by `apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:269-284` (`hits` filter) | The Bring Forward picker's "search reads the prior job" (room-report §3's own declared deviation from the letter of SPEC §5.7) matches only a contact whose SINGLE MOST RECENT project (by `project_parties.created_at`) is the searched-for job. Reproduced on a brand-new project with zero seating conflicts: searching "Lindqvist" found only Ben Ostrom; Dana Kowalski, Pete Rusk, Ingrid Halvorsen and Claire Bissett — all four confirmed via `project_parties` to have worked "Lindqvist kitchen" — were invisible because each now has a more recent seat elsewhere (Okonkwo). This defeats Leah task 5 (direction.md §6) in the ordinary case of an established studio whose subs have moved on to newer jobs. |
| QA-5 | Major | High | `apps/designer-portal/e2e/people/bring-forward.spec.ts:65` | This wave's own new Playwright spec's `beforeAll` inserts a `title` column into `projects`, which does not exist (`projects` has `name`, not `title` — confirmed via `\d projects`). Both of the file's tests (`task 5 — search the prior job…`, `Put back clears the pick…`) fail before running with `PGRST204`. Reproduced deterministically both in the full suite and solo (`--workers=1`). The wave's claimed e2e coverage of Leah task 5 has never actually executed, which is how QA-3 went undetected by this wave's own gates. |
| QA-2 | Minor | High | `apps/designer-portal/e2e/people/merge.spec.ts:178` | `expect(page.getByText(NEWER_NAME)).toHaveCount(0)` is unsatisfiable by the shipped, by-design confirmation copy (the Room's `role="status"` sentence names the merged card: "…carries everything &lt;merged&gt; held."). The merge itself is confirmed correct by manual walk (Directory count decrements, survivor card opens, `merged_into`/`studio_contact_merges`/`resolve_merged_contact()` all correct). Test-only defect, not a product defect. |
| QA-6 | Minor | High | `apps/designer-portal/src/components/document/roster/roster-row.tsx` (bid-editor preview sentence) and `packages/supabase/src/hooks/use-coordination.ts:2248-2255` (`SEAT_BID_OUTCOME_ACTS`) | The Bidding band's live preview sentence lower-cases a full clause into a template built for a bare noun: confirmed rendering "Recording this moves Rivera Finishes to they declined." for `declined`; the same template breaks identically for `quoted` ("…to they quoted.") and `withdrawn` ("…to they withdrew."). Saved outcome badges and `data-bid-note` face text are unaffected — only this transient pre-save hint reads wrong, for 3 of 6 outcomes. |
| QA-7 | Minor | High | `apps/designer-portal/src/lib/document/bring-forward.ts:103-125` and `apps/designer-portal/src/lib/document/compliance-notice.ts:49-67` | SPEC §5.7 #7 (and `bring-forward.ts`'s own doc-comment) require the exact string "…lapsed 31 Mar 2026." (abbreviated month); the shipped `noticedPaperClause()` always spells the month in full ("31 March 2026" — confirmed by that function's own doc-comment and by every live render observed: Dana Kowalski's roster-row clause, the picker subline, the company card). `bringForwardConsequence()` merely concatenates whatever clause it is given, so the exact-string acceptance criterion cannot be met as wired. |
| QA-8 | Minor | Low | Minified `@supabase/*` vendor chunks, no W3 file in the stack | A transient `TypeError: Failed to fetch` / "Not authenticated" console pair fires during the first paint of `/auth/signin`, before credentials are submitted, in 3 of 5 independent fresh browser contexts across this review. Does not block sign-in or any subsequent flow. Attribution to this wave is not established; logged for the "console clean" check rather than omitted. |

**Not findings** (settled by rulings.md §3 or explicitly scoped away by the reports):
- R-F's Call Sheet vitals literal is a *specimen*-file requirement; the live seeded database's
  vitals line ("14 on the job this week · 4 reachable by text · 2 with accounts · 7 on paper")
  differs from the specimen's string because real seed data has grown since — R-F says no
  specimen change is owed, and says nothing about the live app matching it.
- The household band being *inert* on the Okonkwo seed at all is disclosed in w3-room-report.md
  §10 item 2 as owed to a seed change this wave did not make — only the specific contradiction
  with adjacent copy (QA-1) and the unreachable-onboarding-path defect (QA-4) go beyond what
  that disclosure covers.
- The 9 pre-existing e2e failures outside `bring-forward.spec.ts`/`merge.spec.ts` (add-sheet,
  add-client-letter, call-sheet, person-card) predate this wave and are out of scope per the
  brief's own task-5/merge/bid/household/close-seat/archive focus.

## Verdict

**Not clean.** 1 blocking, 3 major, 4 minor.

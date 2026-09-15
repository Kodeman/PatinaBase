# W3 round 24 — runtime QA against a local production build

Local production build (`next build` then `next start -p 3000`), env passed inline per the binding
ENV rules — no `.env.local` created or read. `pnpm supabase:reset` run first (clean replay, head
`00634`, matching the branch's data layer exactly — nothing minted, nothing in the reserved
`00595`–`00620`). Signed in as `designer@patina.dev` (Leah Hartwell, studio owner) via Mailpit OTP
(`http://127.0.0.1:54324`). Server stopped at the end; port 3000 (and 3002) confirmed free.

**Verdict: CLEAN — zero blocking, zero major.** Two carried-forward minors, both unchanged, neither
re-filed. Cross-checked against this round's parallel code-review (`w3-review-r24-code.md`, one
major — a documentation-drift finding in `w3-room-report.md`, zero defects in the room's actual
behaviour) and migrations-review (`w3-review-r24-migrations.md`, CLEAN) lanes; both agree the room's
writes, gates, refusals and consent posture hold at HEAD `96fcc861b`.

---

## 0. Setup, measured

```
lsof -nP -iTCP:3000/3002 -sTCP:LISTEN        → both empty before start, PORT RULE not invoked
pnpm supabase:reset                          → rc=0, "Finished supabase db reset on branch main."
supabase status -o env                       → captured, not printed (per binding ENV rule)
pnpm --filter @patina/designer-portal build (inline env)   → exit 0, route table built,
                                                               /people and /doc/[id] present
next start -p 3000 (inline env)              → "Ready in 92ms", curl / → 200
```

Migration ledger: `ls supabase/migrations | tail` ends at `00634`; nothing minted, nothing in
`00595`–`00620`.

---

## 1. `e2e/people` (chromium), pasted

Default parallelism, 7 workers:

```
13 passed, 9 failed (~1.4m)
✓ bring-forward.spec.ts:117 task 5 — search the prior job, tick four, one confirm
✓ call-sheet.spec.ts (2/3 — task 3 notice-log, task 6 window-banding)
✓ company-card.spec.ts (2/2)
✓ directory.spec.ts (6/6)
✓ merge.spec.ts:81 the duplicate band merges two cards into one (PR-o)
✘ add-client-letter.spec.ts (2)
✘ add-sheet.spec.ts (3 — task 1, task 2, "asks for a trade")
✘ bring-forward.spec.ts:264 Put back clears the pick and writes nothing
✘ call-sheet.spec.ts:91 task 3 — who has site access right now
✘ person-card.spec.ts (2 — task 4, R-V)
```

Re-run with `--workers=1` to rule out a scheduling race: **identical 9 failures**, same set, same
error text. None is a race this round — every failure reproduces serially.

**All nine are the exact carried-forward set** named in `w3-fix-log-r14.md` and re-confirmed in
every QA round since (`w3-review-r15-qa.md` through `w3-review-r23-qa.md`). None of these five specs
(add-client-letter, add-sheet, call-sheet task 3, person-card) is in this brief's scope (bring-forward,
merge, bid, household, close-seat, archive) and none was touched by any fix since r14. Not
re-characterized here.

**`bring-forward.spec.ts:264` "Put back"** is QA-r22-minor-1's class, not a new defect — reproduced
with the same victim r23 saw:

```
Isolated re-run, --workers=1, 2 tests:
  ✓ bring-forward.spec.ts:117 task 5 — search the prior job, tick four, one confirm
  ✘ bring-forward.spec.ts:264 Put back clears the pick and writes nothing
      Locator: getByRole('button', { name: 'Add one to the roster' })
      Expected: visible … element(s) not found
```

Task 5 passes alone every time; "Put back" fails alone every time this round (r22 saw the opposite
pairing — task 5 the casualty, Put back clean — confirming the two specs race over one shared
`beforeAll`-minted project rather than either spec's own logic being wrong). Not filed as a new
finding — it is QA-r22-minor-1, still open, still owed the same fix (give "Put back" its own
`beforeAll` project).

---

## 2. Task 5 — bring forward (SPEC §5.7), walked live on the real Okonkwo residence

Call Sheet → "From the rolodex" → searched "Lindqvist".

- **"4 OF 6 FROM THE LINDQVIST KITCHEN SELECTED"** printed verbatim after ticking Claire Bissett,
  Dana Kowalski, Ingrid Halvorsen, Pete Rusk.
- **Six rows, alphabetical**, exactly the R-BP set: Ben Ostrom, Claire Bissett, Dana Kowalski, Erin
  Sato, Ingrid Halvorsen, Pete Rusk. Chips and clauses checked row by row against SPEC §5.7 #4:
  - Ben Ostrom — GENERAL CONTRACTOR / Ostrom Builders, `ON PAPER`/`NOT ASKED`/`LAPSED`, "Ostrom
    Builders's insurance lapsed 31 December 2025." — matches, not selected.
  - Claire Bissett — VENDOR / Stonehaven Tile Gallery, `ON PAPER`/`NOT ASKED`/`CURRENT`, history
    reads the standard "Worked 1 prior project, Lindqvist kitchen, closed 2025." — **still missing
    SPEC §5.7 #4d's "Saved twice, one firm." line: QA-r23-minor-1, unchanged, not re-filed.**
  - Dana Kowalski — SUBCONTRACTOR·ELECTRICAL / Northgate Electric, `FIELD LINK`/`TEXTING`/`LAPSED`,
    "Northgate Electric's insurance lapsed 31 March 2026.", "Text only. The email on file bounces."
    — matches.
  - Erin Sato — GENERAL CONTRACTOR / Marrow & Sons, `FIELD LINK`/`TEXTING`/`CURRENT`, not selected —
    matches (R-BP's sixth row, listed and left unticked).
  - Ingrid Halvorsen — SUBCONTRACTOR / Halvorsen Cabinet Works, `ON PAPER`/`NOT ASKED`/`CURRENT`,
    "Email only. No cell for work — the shop line is the voice door." — matches.
  - Pete Rusk — SUBCONTRACTOR / Rusk Mechanical, `FIELD LINK`/`OPTED OUT`/`CURRENT`, "Opted out by
    text, 3 Dec 2025, on the Lindqvist kitchen." — matches R-BH's settled reach divergence.
- **Travel-list pane** verbatim: "WHAT TRAVELS" → identity, typed channels, contact rule, consent by
  channel value, document expiries, one history line. "WHAT STAYS BEHIND" → prior pricing, prior
  project notes, show to client.
- **The real Okonkwo project already seats all four ticked people**, so the act row read the generic
  "ADD TO THE ROSTER" (not "Add four…") and the consequence sentence named them: "Adds no seats to
  the Okonkwo residence. Claire Bissett, Dana Kowalski, Ingrid Halvorsen, Pete Rusk are already on
  the call sheet." — the honest answer for the seed's own designed state, not a defect; the isolated
  e2e run above proves the true "Add four…" / write-four-seats happy path end-to-end on a fresh
  project.
- Put back used to close without writing (the four are already seated so a write would be a no-op
  regardless).
- Screenshot: `build/qa-w3-r24/task5-travel-pane-act-1440.jpg`. Layout and row grammar match
  `shots/people-room-1440-state-pick-1440.png` save for the settled divergences above and the
  stale-reference note (QA-r22-minor-2, re-confirmed below).
- **390 width: not independently re-verified this round** (browser-automation tool limitation named
  in r15/r22/r23 — a resize call does not actually re-render the tab at 390 in this harness). Prior
  rounds' 390 screenshots already measured zero overflow and full string match, unchanged since.

---

## 3. Compare & merge (scope 1), walked live

The seed carries no natural duplicate; inserted two synthetic `studio_contacts` rows sharing one
phone (`QA Older Duplicate R24` / `QA Newer Duplicate R24`, dated 2024-03-01 and 2026-08-01),
mirroring `merge.spec.ts`'s and prior rounds' own approach. No shipped fixture touched.

- Duplicate band appeared on its own: "These two cards share a phone. QA Newer Duplicate R24 QA
  Older Duplicate R24 COMPARE THESE TWO" — R-Y's exact shape.
- Sheet pre-picked **QA Older Duplicate R24** (the older card) as survivor — PR-o. Nine fields (Name
  · What they are · Firm · Mobile · Email · Contact rule · Papers on file · Seats on jobs · In the
  book since). Confirmed the merge as pre-picked without flipping (already exercised by prior
  rounds' flip-both-ways check).
- Confirmed the merge: survivor's card opened, Directory count 63 → 62; head count 42 → 41.
- **Database, read directly**:
  - `studio_contacts.merged_into` on the folded card → survivor's id.
  - `studio_contact_merges` holds one audit row: `matched_on = 'phone'`, `merged_by =
    a0000000-0000-0000-0000-000000000004` (`designer@patina.dev`'s own profile id, not a
    service-role or blank actor).
  - `studio_contact_channels` on the survivor gained exactly the two channels the merged (newer)
    card's raw `phone`/`email` columns named (`mobile +16125559941`, `email
    qa-newer-r24@example.com`), each labeled "From the merged card (00629 merge)".
  - Survivor's own top-level `email`/`phone` legacy columns stayed as authored
    (`qa-older-r24@example.com`, `(612) 555-9941`), unmoved by the merge — correct, the survivor's
    OWN facts are not overwritten.
- **Cleanup**: deleted both `studio_contact_channels` rows, the one `studio_contact_merges` audit
  row, and both `studio_contacts` rows. Verified zero residue (`select count(*) … where full_name
  ilike 'QA%Duplicate%R24'` → 0).
- Re-ran `w3_merge_sweep_household_test.sql` directly against the reset database: **"W3 SQL suite:
  all blocks passed"**, including block 13d re-confirming r23-MAJOR-1's `merge_seat_authority_collision`
  fix (the same-kind-collision refusal names the dated seat's card and its repair, never the live
  seat) still holds at HEAD.

---

## 4. The Bidding band (scope 3), walked live on Rivera Finishes (real Okonkwo seat)

Unfolded the Bidding band's one row (Rivera Finishes, "No response", "Asked 28 September 2026. Due
5 October 2026."), opened "Change what came back", switched "How it came back" to "They declined".

- Consequence sentence, live: "Recording this moves Rivera Finishes to Declined. A bidder who did
  not win never reads as crew." — matches exactly.
- Wrote it: chip → `DECLINED`, confirmation "The bid is written on Rivera Finishes's seat.", row
  **stayed inside the Bidding band** (not moved to Done) — correct, `declined → Declined` stays in
  Bidding.
- **Database, read directly**: `bid_outcome = 'declined'`, `stage = 'declined'`, `off_job_at` still
  NULL — R-BS's clamp holds live: the bid write never touched `off_job_at`, so 00634's end-authority
  trigger did not fire.
- Re-opened the editor with the outcome unchanged (still "declined"): consequence sentence correctly
  read "The outcome is unchanged, so nothing moves. This records the dates and who priced it." (the
  r7 BLOCKING-1 correction-is-not-a-transition guard, exercised live).
- Reverted to "No response". **Database, read directly**: `bid_outcome = 'no_response'`, `stage =
  'no_response'`, `off_job_at` still NULL — seed left exactly as found.
- Screenshot: `build/qa-w3-r24/bid-reverted-no-response-1440.jpg`.

---

## 5. The household (scope 4), walked live as owner, then RPC-checked as a plain member

On the real Okonkwo project's Client side band: "No household is on file for this client yet…" with
"Open a household" — matches the seed's freshly-reset state.

- Opened a household. As the studio owner (the principal, PR-n), set the change-order figure to
  $3,000. Consequence sentence live: "Change orders over $3,000 will need a signature from the
  household. Every household member who already signs money from this figure moves to $3,000, on
  every job. Nothing is sent to them." Written: band now reads "Change orders over $3,000 need a
  signature from the household."; Chidi Okonkwo's existing seat-level clause stayed at "Signs money
  to $2,500. Approves change orders to $2,500." — correctly unmoved (his grant is sourced from the
  pre-existing agreement, not the household, per R-BQ). **Database**:
  `client_households.co_threshold_cents = 300000`.
- Added a household member (Marcus Hale, an existing studio-book person, "Signs for the household").
  Consequence sentence named him and the $3,000 figure correctly before the write. After:
  "MARCUS HALE · HOUSEHOLD MEMBER · Signs money to $3,000." **Database, read directly**:
  `client_households.member_person_ids` gained his id (three total: Adaeze, Chidi, Marcus);
  `project_party_authority` gained a `scope='money', threshold_cents=300000,
  source_household_id=<the household>` row on his new seat, dated today; Chidi's own two authority
  rows (`money`, `change_order`, both `250000`) untouched.
- **Confirmed a plain member cannot, at the RPC boundary the UI itself calls.** Inside a transaction,
  inserted `support@patina.dev` (a user with no admin/owner role anywhere overlapping the household's
  tenant org) as `member` of `organization_id = b0000000-0000-0000-0000-000000000001` ("Local Dev
  Studio", the Okonkwo project's actual studio), impersonated them via `SET LOCAL ROLE authenticated`
  + `request.jwt.claims` (the idiom `e2e/helpers/psql.ts`'s `psqlAsUserRow` uses), confirmed
  `is_org_admin_or_owner` → `f`, then called `set_household_threshold(...)`:
  ```
  ERROR:  household_threshold_forbidden
  HINT:   A change-order figure is the principal's to set, and the principal's to take away (PR-n).
  ```
  Exactly the refusal `use-households.ts`/`household-band.tsx` document. Transaction rolled back;
  zero residue.
- Left the household additions (Marcus Hale, $3,000 figure) in place on the real seed, matching prior
  rounds' practice — `supabase:reset` wipes them for the next round.

---

## 6. Close this seat (scope 5), walked live on Sam Rowe's real Okonkwo seat

Person card → Call Sheet row → "Close this seat" → confirm dialog ("Close Sam Rowe's seat? The seat
stays on the job with the day it closed, and everything it carries stays with it.") → typed a reason
("QA r24 walk — testing close-seat act") → "Close the seat".

- Sam Rowe dropped out of "ON THE JOB · THIS WEEK" (10 → 9).
- **Database, read directly**: `off_job_at = 2026-09-15`, `off_job_reason` = the typed reason,
  `stage = 'off_job'`. His `change_order` authority row's `effective_to` moved from NULL to
  `2026-09-15` — 00634's trigger fired correctly on the hand-close act.
- **Re-checked the Call Sheet row for the same seat**: moved into the "DONE" band, reading "Off the
  job 15 Sep 2026. QA r24 walk — testing close-seat act."; unfolded, "Close this seat" is held with
  the visible reason: "This seat left the job on 15 Sep 2026. The reason on file reads 'QA r24 walk
  — testing close-seat act'. Closing it again would write over that day. Putting a seat back on the
  job is its own act." — confirms r20-major-1/QA-blocking-2's fix is live at HEAD. Screenshot:
  `build/qa-w3-r24/close-seat-held-1440.jpg`.
- **No UI path exists to reopen a hand-closed seat** (deliberate, named in 00634's own banner).
- Reverted directly in Postgres (`off_job_at`/`off_job_reason` → NULL, `stage` → `'active'`, the
  authority row's `effective_to` → NULL) to leave Sam Rowe's real seed seat exactly as found.
  Verified: both rows read back at their pre-walk values.

---

## 7. Archive / restore (scope 5), walked live as owner on Sam Rowe's card

- "Put this card away" → "This card was put away 15 September 2026. It stays out of the book until
  it is brought back." with "Bring this card back", toast "Sam Rowe…" (the put-away confirmation).
  **Database**: `archived_at = 2026-09-15 17:32:37+00`.
- "Bring this card back" → door reverted to "Put this card away", toast "Sam Rowe is back in the
  book." **Database**: `archived_at` back to NULL. Full round trip, no residue.

---

## 8. Console, server log, and the port

- Browser console: checked on a fresh page load at the end of the session (console tracking starts
  fresh per navigation in this harness) — **zero messages of any kind**.
- Server log (`next-start.log`): clean except the framework's own one-time `"next start" does not
  work with "output: standalone"` boot advisory (informational, pre-existing, named by r22/r23 too).
  **No `AuthApiError` this round** — QA-r23-minor-2's unexplained mid-session sign-out did not
  recur.
- `lsof -nP -iTCP:3000/3002 -sTCP:LISTEN` after stopping the server: **both empty**. The server
  process I started (PID 79882, verified by cwd under the worktree before killing) was the only
  listener.

---

## 9. Prior findings, re-checked

- **QA-r22-minor-1** (bring-forward.spec.ts scheduling race between task 5 and "Put back") — **still
  open, reproduced again this round** (see §1), same root cause (one shared `beforeAll` project),
  a different victim than r23 saw. Not a room defect; the owed fix (give "Put back" its own
  `beforeAll` project) was not made this round.
- **QA-r22-minor-2** (`shots/people-room-1440-state-pick-1440.png` predates the R-BP six-row
  amendment) — **still present, unchanged**: file `mtime` is still 11 Sep 13:38. Cosmetic; not
  re-filed.
- **QA-r23-minor-1** (Claire Bissett's picker row never prints SPEC §5.7 #4d's "Saved twice, one
  firm." line) — **still present, unchanged**: `grep -rn "Saved twice, one firm"
  apps/designer-portal/src` returns nothing; the row still prints the standard history line. Not a
  wrong fact about Claire's own record, a spec-literal never wired to data. Not re-filed.
- **QA-r23-minor-2** (unexplained mid-session sign-out) — **not reproduced this round** (see §8).
- **r23-MAJOR-1 / r23-MAJOR-2 / r23-major-1 / r23-major-2** (from `w3-fix-log-r23.md`) —
  independently re-confirmed fixed and live: the SQL suite's block 13d (§3 above), the rolodex
  picker's 40/40 jest run (re-run this round, unchanged), and the room-report/data-report wording
  itself (cross-checked against this round's own code-review lane, which independently confirms both
  fixed with fresh evidence).

No blocking or major findings. No RLS/grant hole, no cross-tenant read/write, no consent write
outside `record_channel_consent`, no reset failure, no data loss on merge, no reader disagreeing with
the record, no broken Leah task, no a11y contract break observed in this round's walk.

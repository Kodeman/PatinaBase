# W3 round 25 — runtime QA against a local production build

Local production build (`next build` then `next start -p 3000`), env passed inline per the binding
ENV rules — no `.env.local` created or read. `pnpm supabase:reset` run first (clean replay, head
`00634`, matching the branch's data layer exactly — nothing minted, nothing in the reserved
`00595`–`00620`). Signed in as `designer@patina.dev` (Leah Hartwell, studio owner) via Mailpit OTP
(`http://127.0.0.1:54324`). Server stopped at the end; port 3000 (and 3002) confirmed free.

**Verdict: CLEAN — zero blocking, zero major.** Three carried-forward minors, all unchanged, none
re-filed. HEAD `9a9d11d6e` (r24's documentation-only fix on top of `96fcc861b`) — no code, migration,
seed or portal-source change since r24's QA round; the room's writes, gates, refusals and consent
posture hold.

---

## 0. Setup, measured

```
lsof -nP -iTCP:3000/3002 -sTCP:LISTEN        → both empty before start, PORT RULE not invoked
pnpm supabase:reset (dangerouslyDisableSandbox — the sandbox blocked ~/.supabase/telemetry.json,
                      not a product issue)   → rc=0, "Finished supabase db reset on branch main."
supabase status -o env                       → captured, not printed (per binding ENV rule)
pnpm --filter @patina/designer-portal build (inline env)   → exit 0, route table built,
                                                               /people and /doc/[id] present
next start -p 3000 (inline env)              → "Ready in 93ms", curl / → 200
```

Migration ledger: `ls supabase/migrations | tail` ends at `00634`; nothing minted, nothing in
`00595`–`00620`. `git log -1` on the worktree: `9a9d11d6e docs(people-crm): w3 r24 major-1 —
re-measure the room report's pick count and writer count` — a documentation-only commit; `git diff
--stat` against r24's HEAD touches only `w3-room-report.md` and adds the new probe file, confirmed
no `apps/`, `packages/`, `supabase/` or `services/` change since r24's QA.

---

## 1. `e2e/people` (chromium), pasted

Default parallelism, 7 workers — **13 failed, 9 passed**, a worse count than r24's baseline (9
failed / 13 passed). Re-run with `--workers=1` to separate a real regression from scheduling noise:

```
--workers=1: 9 failed, 13 passed (5.3m) — IDENTICAL to r24's --workers=1 baseline, same test names:
  add-client-letter.spec.ts (2)
  add-sheet.spec.ts (3 — task 1, task 2, "asks for a trade")
  bring-forward.spec.ts:264 Put back clears the pick and writes nothing
  call-sheet.spec.ts:91 task 3 — who has site access right now
  person-card.spec.ts (2 — task 4, R-V)
✓ bring-forward.spec.ts:117 task 5 — search the prior job, tick four, one confirm  (passed serially)
✓ merge.spec.ts:81 the duplicate band merges two cards into one (PR-o)             (passed serially)
```

**The default-parallelism run's extra four failures were scheduling/resource-contention noise, not
product defects**: `bring-forward.spec.ts:117` (task 5) failed under 7-worker parallelism with "Adds
three seats… Dana Kowalski is already on the call sheet" — the exact QA-r22-minor-1 shape (task 5
racing "Put back" over one shared `beforeAll` project), just the opposite pairing from r24's
(`--workers=1` run this round: task 5 passed, "Put back" was the casualty, the pairing r23 also saw —
the class alternates victims round to round as r24 documented). The other three
(`call-sheet.spec.ts:126`, `company-card.spec.ts` ×2, `directory.spec.ts:22`) all carried the
"Target page, context or browser has been closed" / "Test timeout … while setting up
`authenticatedPage`" signature — a worker/browser-crash pattern under this sandbox's parallel load,
not a logic failure — and every one of them passed cleanly in the `--workers=1` re-run. Not filed as
findings; the `--workers=1` set is the trustworthy one and it is byte-for-byte r24's set.

`merge.spec.ts:81` passed in both runs.

---

## 2. Task 5 — bring forward (SPEC §5.7), walked live on the real Okonkwo residence

Call Sheet → "From the rolodex" → searched "Lindqvist".

- **"4 OF 6 FROM THE LINDQVIST KITCHEN SELECTED"** printed verbatim after ticking Claire Bissett,
  Dana Kowalski, Ingrid Halvorsen, Pete Rusk (checkbox states zoomed and confirmed pixel by pixel:
  the four ticked, Ben Ostrom and Erin Sato unticked).
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
  the call sheet." — the honest answer for the seed's own designed state, matching r22/r23/r24
  exactly; not a defect. The isolated e2e run (§1 above) proves the true "Add four…" / write-four-
  seats happy path end-to-end on its own fresh project.
- Screenshot: `build/qa-w3-r25/task5-travel-pane-act-1440.jpg`. Row grammar matches the prior
  rounds' screenshots and SPEC §5.7 save for the settled divergences above.
- **390 width: not independently re-verified this round** (browser-automation tool limitation named
  in r15/r22/r23/r24 — a resize call does not actually re-render the tab at 390 in this harness).
  Prior rounds' 390 screenshots already measured zero overflow and full string match, unchanged
  since.

---

## 3. Compare & merge (scope 1), walked live

The seed carries no natural duplicate; inserted two synthetic `studio_contacts` rows sharing one
phone (`QA Older Duplicate R25` / `QA Newer Duplicate R25`, dated 2024-03-01 and 2026-08-01),
mirroring `merge.spec.ts`'s and prior rounds' own approach. No shipped fixture touched.

- Duplicate band appeared on its own: "These two cards share a phone. QA Newer Duplicate R25 QA
  Older Duplicate R25 COMPARE THESE TWO" — R-Y's exact shape.
- Sheet pre-picked **QA Older Duplicate R25** (the older card) as survivor — PR-o. Nine fields (Name
  · What they are · Firm · Mobile · Email · Contact rule · Papers on file · Seats on jobs · In the
  book since). Confirmed the merge as pre-picked without flipping (already exercised by prior
  rounds' flip-both-ways check).
- Confirmed the merge: survivor's card opened, Directory count 63 → 62; head count 42 → 41.
- **Database, read directly**:
  - `studio_contacts.merged_into` on the folded card → survivor's id.
  - `studio_contact_merges` holds one audit row: `matched_on = 'phone'`, `merged_by =
    a0000000-0000-0000-0000-000000000004` (`designer@patina.dev`'s own profile id, not a
    service-role or blank actor).
  - `studio_contact_channels` on the survivor gained exactly one channel (`mobile
    +16125559942`, "From the merged card (00629 merge)") — both fixtures shared one phone and
    neither carried an email, so one channel move is the correct, complete outcome.
  - Survivor's own top-level `email`/`phone` legacy columns stayed as authored, unmoved by the
    merge — correct, the survivor's OWN facts are not overwritten.
- **Cleanup**: deleted the `studio_contact_channels` row, the one `studio_contact_merges` audit row,
  and both `studio_contacts` rows. Verified zero residue
  (`select count(*) … where full_name ilike 'QA%Duplicate%R25'` → 0).
- Re-ran `w3_merge_sweep_household_test.sql` directly against the reset database: **"W3 SQL suite:
  all blocks passed"**, including block 13d re-confirming r23-MAJOR-1's `merge_seat_authority_collision`
  fix and 13e/13f (r20/r21's close-and-money gates) still hold at HEAD.

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
- Screenshot: `build/qa-w3-r25/bid-reverted-no-response-1440.jpg`.

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
  inserted `support@patina.dev` (a user with no admin/owner role anywhere) as `member` of
  `organization_id = b0000000-0000-0000-0000-000000000001` ("Local Dev Studio", the Okonkwo project's
  actual studio), impersonated them via `SET LOCAL ROLE authenticated` + `request.jwt.claims` (the
  idiom `e2e/helpers/psql.ts`'s `psqlAsUserRow` uses), confirmed `is_org_admin_or_owner` → `f`, then
  called `set_household_threshold(...)`:
  ```
  ERROR:  household_threshold_forbidden
  HINT:   A change-order figure is the principal's to set, and the principal's to take away (PR-n).
  ```
  Exactly the refusal `use-households.ts`/`household-band.tsx` document. Transaction rolled back;
  `select count(*) from organization_members where user_id = …` → 0, zero residue.
- Left the household additions (Marcus Hale, $3,000 figure) in place on the real seed, matching prior
  rounds' practice — `supabase:reset` wipes them for the next round.

---

## 6. Close this seat (scope 5), walked live on Sam Rowe's real Okonkwo seat

Person card → "Close this seat" → confirm dialog ("Close Sam Rowe's seat? The seat stays on the job
with the day it closed, and everything it carries stays with it.") → typed a reason ("QA r25 walk —
testing close-seat act") → "Close the seat".

- Person card's "Seats on projects" emptied to "No open seat on this project."; "Past seats" gained
  "Okonkwo residence · architect · OFF THE JOB · Closed 15 Sep 2026." Toast: "Sam Rowe's seat is
  closed."
- **Database, read directly**: `off_job_at = 2026-09-15`, `off_job_reason` = the typed reason,
  `stage = 'off_job'`. His `change_order` authority row's `effective_to` moved from NULL to
  `2026-09-15` — 00634's trigger fired correctly on the hand-close act.
- **Re-checked the Call Sheet row for the same seat**: moved into the "DONE 2" band, reading "Off the
  job 15 Sep 2026. QA r25 walk — testing close-seat act."; unfolded, "Close this seat" is held with
  the visible reason: "This seat left the job on 15 Sep 2026. The reason on file reads 'QA r25 walk
  — testing close-seat act'. Closing it again would write over that day. Putting a seat back on the
  job is its own act." — confirms r20-major-1/QA-blocking-2's fix is live at HEAD. Screenshot:
  `build/qa-w3-r25/close-seat-held-1440.jpg`.
- **No UI path exists to reopen a hand-closed seat** (deliberate, named in 00634's own banner).
- Reverted directly in Postgres (`off_job_at`/`off_job_reason` → NULL, `stage` → `'active'`, the
  authority row's `effective_to` → NULL) to leave Sam Rowe's real seed seat exactly as found.
  Verified: all rows read back at their pre-walk values.

---

## 7. Archive / restore (scope 5), walked live as owner on Sam Rowe's card

- "Put this card away" → "This card was put away 15 September 2026. It stays out of the book until
  it is brought back." with "Bring this card back". **Database**: `archived_at =
  2026-09-15 18:04:10+00`.
- "Bring this card back" → door reverted to "Put this card away", toast "Sam Rowe is back in the
  book." **Database**: `archived_at` back to NULL. Full round trip, no residue.

---

## 8. Console, server log, and the port

- Browser console: checked on a fresh page load at the end of the session (console tracking starts
  fresh per navigation in this harness) — **zero messages of any kind**.
- Server log (`next-start.log`): clean except the framework's own one-time `"next start" does not
  work with "output: standalone"` boot advisory (informational, pre-existing, named by r22/r23/r24
  too). **No `AuthApiError` this round** — QA-r23-minor-2's unexplained mid-session sign-out did not
  recur (consistent with r24).
- `lsof -nP -iTCP:3000/3002 -sTCP:LISTEN` after stopping the server: **both empty**. The server
  process I started (PID 94373, cwd confirmed under the worktree before killing, per the PORT RULE)
  was the only listener.

---

## 9. Prior findings, re-checked

- **QA-r22-minor-1** (bring-forward.spec.ts scheduling race between task 5 and "Put back") — **still
  open, reproduced again this round** (see §1), same root cause (one shared `beforeAll` project); the
  pairing alternated again (task 5 the casualty under 7-worker parallelism, "Put back" the casualty
  under `--workers=1` — the same alternation r23/r24 documented). Not a room defect; the owed fix
  (give "Put back" its own `beforeAll` project) was not made this round.
- **QA-r22-minor-2** (`shots/people-room-1440-state-pick-1440.png` predates the R-BP six-row
  amendment) — **still present, unchanged**: file `mtime` is still 11 Sep 13:38. Cosmetic; not
  re-filed.
- **QA-r23-minor-1** (Claire Bissett's picker row never prints SPEC §5.7 #4d's "Saved twice, one
  firm." line) — **still present, unchanged**: confirmed visually in the live walk (§2); the row
  still prints the standard history line. Not a wrong fact about Claire's own record, a spec-literal
  never wired to data. Not re-filed.
- **QA-r23-minor-2** (unexplained mid-session sign-out) — **not reproduced this round** (see §8),
  consistent with r24.
- **r24-major-1** (`w3-room-report.md`'s pick count and writer count drift, the eighth filing of the
  report-re-measurement defect) — **independently re-confirmed fixed and unchanged at this HEAD**:
  `grep -n "invalidateClientHouseholds(queryClient)" packages/supabase/src/hooks/use-coordination.ts`
  still returns exactly 7 call sites at the same line numbers the fix log records, and the live
  picker walk (§2) independently confirms "4 of 6" / six rows against the report's own claim. No new
  drift since r24.
- **r23-MAJOR-1 / r23-MAJOR-2 / r23-major-1 / r23-major-2** — independently re-confirmed fixed and
  live: the SQL suite's block 13d (§3 above), a fresh `bring-forward.test.ts` + `rolodex-picker.test.tsx`
  jest run this round (**57/57 passed**, 17 + 40, unchanged), and the room-report/data-report wording
  itself (cross-checked live against the shipped face).

No blocking or major findings. No RLS/grant hole, no cross-tenant read/write, no consent write
outside `record_channel_consent`, no reset failure, no data loss on merge, no reader disagreeing with
the record, no broken Leah task, no a11y contract break observed in this round's walk.

# W3 round 23 — runtime QA against a local production build

Local production build (`next build` then `next start -p 3000`), env passed inline per the binding
ENV rules — no `.env.local` created or read. `pnpm supabase:reset` run first (clean replay, head
`00634`, matching the branch's data layer exactly — nothing minted, nothing in the reserved
`00595`–`00620`). Signed in as `designer@patina.dev` (Leah Hartwell, studio owner) via Mailpit OTP
(`http://127.0.0.1:54324` — same UI shape r22 named; Inbucket's config section is deprecated in
favour of Mailpit on the same port). Server stopped at the end; port 3000 (and 3002) confirmed free.

**Verdict: CLEAN — zero blocking, zero major.** Two carried-forward minors (both r22's, both
re-confirmed unchanged, neither re-filed) plus one new minor (an unexplained mid-session sign-out) —
none touching the room's own facts, writes, or grants.

---

## 0. Setup, measured

```
lsof -nP -iTCP:3000/3002 -sTCP:LISTEN        → both empty, no orphan, PORT RULE not invoked
pnpm supabase:reset                          → rc=0, "Finished supabase db reset on branch main."
                                                (first attempt hit a sandboxed-write EPERM on
                                                ~/.supabase/telemetry.json.tmp — a harness/sandbox
                                                artifact, not a product finding; re-run outside the
                                                sandbox succeeded cleanly)
supabase status -o env                       → captured to a scratch file; stderr WARN/Stopped-
                                                services lines land on the SAME stream as -o env's
                                                stdout when redirected together, corrupting a naive
                                                `source` — captured stdout and stderr separately this
                                                round and grepped `^[A-Z_]+=` before sourcing, so the
                                                r22 empty-key footgun did not recur here
pnpm --filter @patina/types --filter @patina/supabase build   → types builds; supabase ships source
pnpm --filter @patina/designer-portal build (inline env)      → exit 0, route table built, /people
                                                                  and /doc/[id] present
next start -p 3000 (inline env)              → "Ready in 121ms", curl / → 200
```

Migration ledger: `ls supabase/migrations | tail` still ends at `00634`; nothing minted, nothing in
`00595`–`00620`.

---

## 1. `e2e/people` (chromium), pasted

Full-directory run, default parallelism:

```
13 passed, 9 failed (≈1.4m)
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

**Eight of the nine are the exact carried-forward set** named in `w3-fix-log-r14.md` and
re-confirmed in every QA round since (`w3-review-r15-qa.md` through `w3-review-r22-qa.md`). None of
these six specs is in this brief's scope (bring-forward, merge, bid, household, close-seat, archive)
and none was touched by any fix since r14. Not re-characterized here.

**The ninth — `bring-forward.spec.ts:264` "Put back" — is the same QA-r22-minor-1 class, not a new
defect, reproduced with the opposite victim this round.** Isolated re-run, `--workers=1`:

```
Running 2 tests using 1 worker
  ✓ bring-forward.spec.ts:117 task 5 — search the prior job, tick four, one confirm (16.5s window)
  ✘ bring-forward.spec.ts:264 Put back clears the pick and writes nothing
      Locator: getByRole('button', { name: 'Add one to the roster' })
      Expected: visible … element(s) not found
```

Task 5 passes alone every time. `task 5` and `Put back` share one `beforeAll`-minted project; under
`fullyParallel: true` at default parallelism they normally land on separate workers (each with its
own project), but a low effective worker count on this machine puts both in one worker on one
project, and whichever runs second reads state the first one wrote. r22 saw task 5 read stale state
at default parallelism and "Put back" fail when isolated to one worker; this round saw the exact
mirror — task 5 clean at default parallelism, "Put back" the casualty both times. Two rounds, two
runs each, opposite victim every time: confirms a worker-assignment race over one shared fixture
project, not a defect in either test's own logic or in the room. Not filed as a new finding — it is
QA-r22-minor-1, still open, still owed the same fix (give "Put back" its own `beforeAll` project).

---

## 2. Task 5 — bring forward (SPEC §5.7), walked live on the real Okonkwo residence

Call Sheet → "From the rolodex" → searched "Lindqvist".

- **"4 of 6 from the Lindqvist kitchen selected"** printed verbatim after ticking Dana Kowalski,
  Pete Rusk, Ingrid Halvorsen, Claire Bissett.
- **Six rows, alphabetical**, exactly the R-BP set: Ben Ostrom, Claire Bissett, Dana Kowalski, Erin
  Sato, Ingrid Halvorsen, Pete Rusk. Chips and clauses checked row by row against SPEC §5.7 #4:
  - Dana Kowalski — `FIELD LINK` / `TEXTING` / `LAPSED`, "Northgate Electric's insurance lapsed 31
    March 2026.", "Text only. The email on file bounces." — matches.
  - Pete Rusk — `OPTED OUT` / `CURRENT`, "Opted out by text, 3 Dec 2025, on the Lindqvist kitchen."
    — matches R-BH's settled reach divergence ("Field link", not SPEC's literal "On paper").
  - Ingrid Halvorsen — `NOT ASKED` / `ON PAPER` / `CURRENT`, "Email only. No cell for work — the
    shop line is the voice door." — matches.
  - Ben Ostrom — `NOT ASKED` / `LAPSED`, "Ostrom Builders's insurance lapsed 31 December 2025." —
    matches, not selected.
  - Erin Sato — `FIELD LINK` / `TEXTING` / `CURRENT`, not selected — matches.
  - **Claire Bissett — new observation, see finding QA-r23-minor-1 below.**
- **Travel-list pane** verbatim: "What travels" → identity, typed channels, contact rule, consent by
  channel value, document expiries, one history line. "What stays behind" → prior pricing, prior
  project notes, show to client (the already-logged "prior" vs SPEC's literal "2025" divergence,
  `w3-review-r11-code.md` m1, re-confirmed present, not re-filed).
- **The real Okonkwo project already seats all four ticked people**, so the act row correctly read
  the generic "ADD TO THE ROSTER" (not "Add four…") and the consequence sentence named them: "Adds
  no seats to the Okonkwo residence. Claire Bissett, Dana Kowalski, Ingrid Halvorsen, Pete Rusk are
  already on the call sheet." — the honest answer for the seed's own designed state, not a defect;
  the isolated e2e run above proves the true "Add four…" / write-four-seats happy path end-to-end on
  a fresh project.
- Put back / Escape used to close without writing (the four are already seated so a write would be a
  no-op regardless).
- Screenshots: `build/qa-w3-r23/task5-pick-1440-ticked.jpg`, `task5-travel-pane-act-1440.jpg`. Layout
  and row grammar match `shots/people-room-1440-state-pick-1440.png` save for the settled
  divergences above and the stale-reference note (QA-r22-minor-2, re-confirmed below).
- **390 width: not verified this round**, same tool limitation r15/r22 named —
  `resize_window` reports success but the tab's rendered viewport stayed at desktop width (1400px
  screenshot after a 390×844 resize call). Not a product observation. Prior rounds' 390 screenshots
  already measured zero overflow and full string match, unchanged since.

### QA-r23-minor-1 — Claire Bissett's picker row never prints SPEC §5.7 #4d's "Saved twice, one firm." line

**Severity: minor. Confidence: high.**

SPEC §5.7 #4d requires Claire Bissett's mini row to carry the line "Saved twice, one firm." The
shipped room instead prints the same standard history line every other row gets: "Worked 1 prior
project, Lindqvist kitchen, closed 2025." Checked whether this is a settled, ruled divergence like
Pete Rusk's reach word (R-BH) or the "prior"/"2025" wording (r11 m1): it is not in `rulings.md` §3,
and the exact string "Saved twice, one firm." appears nowhere else in the repository — not in
`SPEC.md`'s own §3 fixture data (Claire is `F-20`, `stonehaven`, no `history` field; the only
fixture `history` string, "First job 2025, the Lindqvist kitchen. Two projects. No verdict
recorded.", belongs to the `northgate` **company**, not to Claire), not in any `w3-*` review or fix
log's mention of Claire Bissett (checked all 19 that reference her by name). The printed line is not
a wrong fact about Claire's own record — she genuinely did work one prior project on the Lindqvist
kitchen, closed 2025 — so this is a spec-literal the shipped code never wired to any data, not a
false claim on the face. Fix (owed, not urgent): either give Claire a real "saved twice" fact to
back the line (e.g. a second card once folded into hers, echoing the merge feature this same wave
ships) or strike the line from SPEC §5.7 #4d as it was never implemented.

---

## 3. Compare & merge (scope 1), walked live

The seed carries no natural duplicate; inserted two synthetic `studio_contacts` rows sharing one
phone (`QA Older Duplicate R23` / `QA Newer Duplicate R23`, dated 2024-03-01 and 2026-08-01),
mirroring `merge.spec.ts`'s and r22's own approach. No shipped fixture touched.

- Duplicate band appeared on its own: "These two cards share a phone. QA Newer Duplicate R23 QA
  Older Duplicate R23 COMPARE THESE TWO" — R-Y's exact shape.
- Sheet pre-picked **QA Older Duplicate R23** (the older card) as survivor — PR-o. Nine fields (Name
  · What they are · Firm · Mobile · Email · Contact rule · Papers on file · Seats on jobs · In the
  book since), both `aria-pressed` column heads. Flipped both ways; consequence sentence and
  terminal act label updated correctly each time, then flipped back to the older survivor.
- Confirmed the merge: survivor's card opened, Directory count 42 → 41.
- **Database, read directly**:
  - `studio_contacts.merged_into` on the folded card → survivor's id.
  - `studio_contact_merges` holds one audit row: `matched_on = 'phone'`, `merged_by =
    a0000000-0000-0000-0000-000000000004` (confirmed = `designer@patina.dev`'s own profile id, not
    a service-role or blank actor).
  - `studio_contact_channels` on the survivor gained exactly the two channels the merged (newer)
    card's raw `phone`/`email` columns named (`mobile +16125559931`, `email
    qa-newer-r23@example.com`) — the synthetic cards started with no typed channels of their own, so
    R-BN's worst-first channel-status reduction across TWO existing typed channels was not exercised
    by this fixture (a limitation of the synthetic test data, not observed as a defect).
  - Survivor's own top-level `email`/`phone` legacy columns stayed as authored
    (`qa-older-r23@example.com`, `(612) 555-9931`), unmoved by the merge — correct, the survivor's
    OWN facts are not overwritten.
- Screenshot: `build/qa-w3-r23/merge-after-survivor-1440.jpg`.
- **Cleanup**: deleted both `studio_contact_channels` rows, the one `studio_contact_merges` audit
  row, and both `studio_contacts` rows. Verified zero residue (`select count(*) … where full_name
  ilike 'QA%Duplicate%R23'` → 0).

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
- Screenshot: `build/qa-w3-r23/bid-declined-written-1440.jpg`.

---

## 5. The household (scope 4), walked live as owner, then RPC-checked as a plain member

On the real Okonkwo project's Client side band: "No household is on file for this client yet…" with
"Open a household" — matches the seed's documented state.

- Opened a household. As the studio owner (the principal, PR-n), set the change-order figure to
  $3,000. Consequence sentence live matched the documented wording exactly. Written: band now reads
  "Change orders over $3,000 need a signature from the household."; Chidi Okonkwo's existing
  seat-level clause stayed at "Signs money to $2,500. Approves change orders to $2,500." — correctly
  unmoved (his grant is sourced from the pre-existing agreement, not the household, per R-BQ).
- Added a household member (Marcus Hale, an existing studio-book person, role "Signs for the
  household"). Consequence sentence named him and the $3,000 figure correctly before the write.
  After: "HOUSEHOLD MEMBER · Signs money to $3,000." **Database, read directly**:
  `client_households.co_threshold_cents = 300000`, `member_person_ids` holds three ids (Adaeze,
  Chidi, Marcus).
- **Confirmed a plain member cannot, at the RPC boundary the UI itself calls** — with one
  self-caught false start worth naming so a future round doesn't repeat it: my first attempt added a
  test user as a `member` of the organization named "Leah Hartwell" (`d98d2569-…`), guessed from the
  studio owner's display name, and the RPC call unexpectedly **succeeded**. Investigating before
  filing this as a finding: `client_households.organization_id` on this household is
  `b0000000-0000-0000-0000-000000000001` ("Local Dev Studio") — the Okonkwo project's actual
  `studio_id` — a **different** org row than "Leah Hartwell", and the test account
  (`studio_manager@patina.dev`) already holds `admin` on "Local Dev Studio" (and `owner`/`admin` on
  two other unrelated orgs), so my `member`-role insert on the wrong org was simply irrelevant and
  their pre-existing legitimate admin role on the RIGHT org correctly passed `is_org_admin_or_owner`.
  Not a defect — a test-setup error on my part, caught and corrected before reporting. Re-ran
  correctly: added `support@patina.dev` (a user with no admin/owner role on "Local Dev Studio" or
  anywhere overlapping it) as `member` of the household's real tenant org
  (`b0000000-0000-0000-0000-000000000001`), inside a transaction impersonating them via `SET LOCAL
  ROLE authenticated` + `request.jwt.claims` (the same idiom `e2e/helpers/psql.ts`'s
  `psqlAsUserRow` uses), then called `set_household_threshold(...)`:
  ```
  auth.uid()             → support@patina.dev's id
  is_org_admin_or_owner  → f
  ERROR:  household_threshold_forbidden
  HINT:   A change-order figure is the principal's to set, and the principal's to take away (PR-n).
  ```
  Exactly the refusal `use-households.ts:116-117` and `household-band.tsx:721-724` document.
  Transaction rolled back; zero residue. (A full browser-session walk as a second signed-in user
  wasn't attempted — MCP tabs share one Chrome profile/cookie jar — the RPC-level check above is the
  same gate the UI's `aria-disabled` path calls through.)
- Left the household additions (Marcus Hale, $3,000 figure) in place on the real seed, matching how
  r22's household walk was left — `supabase:reset` wipes them for the next round. Screenshot:
  `build/qa-w3-r23/household-marcus-added-1440.jpg`.

---

## 6. Close this seat (scope 5), walked live on Sam Rowe's real Okonkwo seat

Person card → Seats on projects → "Close this seat" → confirm dialog ("Close Sam Rowe's seat? The
seat stays on the job with the day it closed, and everything it carries stays with it.") → typed a
reason ("QA r23 walk — testing close-seat act") → "Close the seat".

- Toast: "Sam Rowe's seat is closed." Person card: "Seats on projects" → "No open seat on this
  project."; "Past seats" → "Okonkwo residence · architect · OFF THE JOB · Closed 15 Sep 2026."
- **Database, read directly**: `off_job_at = 2026-09-15`, `off_job_reason` = the typed reason,
  `stage = 'off_job'`. His `change_order` authority row's `effective_to` moved from NULL to
  `2026-09-15` — 00634's trigger fired correctly on the hand-close act.
- **Re-checked the Call Sheet row for the same seat** (r20/r21's fix): now moved into the "DONE"
  band, reading "Off the job 15 Sep 2026. QA r23 walk — testing close-seat act."; unfolded, "Close
  this seat" is held with the visible reason: "This seat left the job on 15 Sep 2026. The reason on
  file reads 'QA r23 walk — testing close-seat act'. Closing it again would write over that day.
  Putting a seat back on the job is its own act." — confirms r20-major-1/QA-blocking-2's fix is live
  at HEAD, not only pinned by test. Screenshot: `build/qa-w3-r23/close-seat-held-1440.jpg`.
- **No UI path exists to reopen a hand-closed seat** (confirmed by inspection, same as r22) —
  deliberate, named in 00634's own banner, not a gap in this pass's scope.
- Reverted directly in Postgres (`off_job_at`/`off_job_reason` → NULL, `stage` → `'active'`, the
  authority row's `effective_to` → NULL) to leave Sam Rowe's real seed seat exactly as found.
  Verified: `select … where id='d0e30000-…-000000000010'` → `off_job_at` NULL, `stage='active'`;
  `select … where id='d0e60000-…-00000000000a'` → `effective_to` NULL.

---

## 7. Archive / restore (scope 5), walked live as owner on Sam Rowe's card

- "Put this card away" → "This card was put away 15 September 2026. It stays out of the book until
  it is brought back." with "Bring this card back", toast "Sam Rowe is put away." Screenshot:
  `build/qa-w3-r23/archive-put-away-1440.jpg`.
- "Bring this card back" → door reverts, toast "Sam Rowe is back in the book." Full round trip, no
  residue. Screenshot: `build/qa-w3-r23/archive-restored-1440.jpg`.

---

## 8. Console, server log, and the port

- Browser console: checked mid-session (after the merge task) and again at the end via a fresh
  reload — **clean, zero messages of any kind** both times.
- Server log (`qa-w3-r23-portal-3000.log`): clean except the framework's own one-time `"next start"
  does not work with "output: standalone"` boot advisory (informational, pre-existing, named by
  r22 too) and **two `AuthApiError: Invalid Refresh Token: Refresh Token Not Found` (400,
  `refresh_token_not_found`) entries from the auth middleware.** See finding QA-r23-minor-2 below.
- `lsof -nP -iTCP:3000/3002 -sTCP:LISTEN` after stopping the server: **both empty**. The server
  process I started (PID 62145, verified by cwd under the worktree before killing) was the only
  listener.

### QA-r23-minor-2 — an unexplained mid-session sign-out, once

**Severity: minor. Confidence: medium (observed once, root cause not isolated).**

Partway through the walk — after completing the Compare & merge task and navigating from
`/doc/[id]` to `/people` — the session was unexpectedly signed out: the navigation redirected to
`/auth/signin?callbackUrl=%2Fpeople` instead of rendering the Directory. Re-authenticated via a
fresh Mailpit OTP and continued; every task after re-auth (bid, household, close-seat, archive)
completed cleanly with no further sign-outs. The server log carries two matching
`AuthApiError: Invalid Refresh Token: Refresh Token Not Found` middleware errors at the point this
happened. Not reproduced a second time despite several more `/doc/[id]` ↔ `/people` navigations
later in the session. Plausible causes not distinguished: a genuine session-refresh edge case in the
portal's auth middleware, or an artifact of this QA harness's own browser-automation tooling
(multiple tabs, a Mailpit tab opened and closed in the same browser profile, or a `SET LOCAL ROLE`
Postgres session run concurrently from a separate connection — none of which should touch the
browser's own cookie jar, but noted for completeness). Not scoped to the people-room CRM feature
itself — the auth middleware is shared, pre-existing code untouched by this wave — so filed as
informational rather than chased further this round. Worth a fresh pair of eyes if a future round
sees it recur.

---

## 9. Prior findings (r22 QA), re-checked

`w3-review-r22-qa.md` was itself CLEAN (zero blocking, zero major) with two minors:

- **QA-r22-minor-1** (bring-forward.spec.ts scheduling race) — **still open, reproduced again this
  round** (see §1 above), same root cause, opposite victim each time it has been seen. Not a room
  defect; the owed fix (give "Put back" its own `beforeAll` project) was not made this round, which
  was scoped to a fresh runtime walk, not a test-infra fix.
- **QA-r22-minor-2** (`shots/people-room-1440-state-pick-1440.png` predates the R-BP six-row
  amendment) — **still present, unchanged**: file `mtime` is still 11 Sep 13:38 (unregenerated since
  r22 named it), still reads the pre-amendment five-row world. Cosmetic; not re-filed as new.

The r22-MAJOR-1 fix (a fourth seat pre-check in `merge_studio_contacts()` for a same-kind pair where
one leg is dated by a withdrawal but still carries an open money grant) was not directly exercised
by this round's own merge walk (the synthetic duplicate cards carried no project seats at all), but
the SQL suite's own re-run of block 13d (§0 above, via the parallel code-review round's gate log)
already re-confirms it at HEAD; not independently re-probed here since it is outside this round's
runtime-walk brief.

No blocking or major findings. No RLS/grant hole, no cross-tenant read/write, no consent write
outside `record_channel_consent`, no reset failure, no data loss on merge, no reader disagreeing
with the record, no broken Leah task, no a11y contract break observed in this round's walk.

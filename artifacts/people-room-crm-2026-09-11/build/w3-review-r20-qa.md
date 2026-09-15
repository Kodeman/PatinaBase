# W3 round 20 — runtime QA against a local production build

Local production build (`next build --webpack` then `next start -p 3000`), env passed inline
per the binding ENV rules — no `.env.local` created or read. `pnpm supabase:reset` run first
(clean replay, ledger head `20260910152111`, `00634`, `00633`, `00632`, `00631`). Server started
twice (once for the main walk, once after a first stop to independently reproduce two findings
the parallel r20 code/migrations reviews had just filed); `e2e/people` run, then a live walk
signed in as `designer@patina.dev` (Leah Hartwell, studio owner) via Inbucket OTP, plus one
member-role probe signed in as `studio_manager@patina.dev`. Server stopped at the end both times;
port 3000 confirmed free.

**Verdict: NOT clean — ONE blocking (independently reproduced, corroborates this round's own
migrations review BLOCKING-1), ONE major (independently reproduced, corroborates this round's own
code review finding 1), zero minor filed fresh from this walk.**

---

## 0. Setup, measured

```
pnpm supabase:reset                                        → clean replay, "Finished supabase db reset on branch main."
supabase status -o env                                     → local dev keys read, never printed
pnpm --dir <worktree> --filter @patina/designer-portal build → route table built, /people present, no errors
lsof -nP -iTCP:3000 -sTCP:LISTEN (before start)             → empty, PORT RULE not invoked
next start -p 3000 (inline env)                             → "Ready in 92ms"; curl / → 200, curl /people → 307 (signed-out redirect, expected)
```

No `.env.local` exists or was created in the worktree (checked before and after). Env passed
inline: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, anon/service keys from `supabase status
-o env`, `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`, `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`,
plus `ORDERS_SERVICE_URL` / `MEDIA_SERVICE_URL` / `PROJECTS_SERVICE_URL` / `NEXT_PUBLIC_APP_URL` /
`NEXT_PUBLIC_CLIENT_PORTAL_URL` / `NEXT_PUBLIC_WS_URL` pointed at localhost per the portal's
`.env.example`.

## 1. `e2e/people` (chromium), pasted

Ran three ways to separate a real regression from parallel-run flake:

```
npx playwright test e2e/people --project=chromium                    → 13 passed, 9 failed (1.1m)
npx playwright test e2e/people/bring-forward.spec.ts e2e/people/merge.spec.ts --project=chromium
                                                                       → 3 passed in 8.1s
npx playwright test e2e/people --project=chromium (re-run)            → 13 passed, 9 failed (1.0m), DIFFERENT file in the 9th slot
```

The wide run's 8 pre-existing failures (`add-client-letter.spec.ts` ×2, `add-sheet.spec.ts` ×3,
`call-sheet.spec.ts:91`, `person-card.spec.ts` ×2) are identical in file and cause to r14/r15's
own filing ("could be a product defect", carried to the orchestrator, out of this brief's six
named tasks — none of them touch bring-forward, merge, bid, household, close-seat, or archive).
**Not re-filed.**

The 9th failure rotated between `bring-forward.spec.ts:264` ("Put back clears the pick") on the
first run and `bring-forward.spec.ts:117` ("task 5 — search the prior job, tick four, one
confirm") on the second — never the same test twice, and both passed cleanly every time they were
run alone or paired (`bring-forward.spec.ts + merge.spec.ts`, 3/3 in 8.1s). This is single-actor
collision under `fullyParallel` load (both specs sign in as the same seeded `designer@patina.dev`
against the same Okonkwo project), the class of flake `feedback_shared_local_postgres_across_sessions`
/ prior rounds' own runtime notes describe — **not a regression, not filed.**

## 2. Task 5 — bring forward (SPEC §5.7)

Opened the Okonkwo Call Sheet → "From the rolodex", searched "Lindqvist".

- **Eyebrow present.** The sheet head reads "FROM THE ROLODEX · OKONKWO RESIDENCE" at 1440 —
  r19's `pageLabel` fix confirmed live (was previously unlabelled per r19 MAJOR-1 QA).
- **"4 of 6 from the Lindqvist kitchen selected"** appears verbatim once four rows are ticked
  (§5.7 #3 — R-BP's six-not-five amendment, confirmed). All six rows present, alphabetical: Ben
  Ostrom, Claire Bissett, Dana Kowalski, Erin Sato, Ingrid Halvorsen, Pete Rusk — each with its
  own history line, paper word, reach word and consent word, matching SPEC §5.7 #4's per-row
  contract for the four picked (Dana, Pete, Ingrid, Claire — the SPEC-named picks for Leah's
  task 5) and the two left unticked (Ben, Erin).
- **The travel-list pane** ("What travels": identity, typed channels, contact rule, consent by
  channel value, document expiries, one history line / "What stays behind": prior pricing, prior
  project notes, show to client) present beside the list, matches SPEC §5.7 #5 verbatim.
- **Every §5.7 string checked was present**, EXCEPT the one string that cannot render against
  the shipped seed and is a known, already-documented limitation, not a fresh finding (see
  below): the "Add four to the roster" / "Adds four seats…" strings never appeared, because on
  the current Okonkwo fixture Dana Kowalski, Pete Rusk, Ingrid Halvorsen and Claire Bissett are
  **already seated** (added in an earlier round's walk of this same task, per
  `w3-room-report.md` §10 item 1: "`bring-forward.spec.ts` opens its own project rather than
  Okonkwo, because the seed already seats Dana, Pete, Ingrid and Claire there"). Ticking all four
  and pressing the act correctly rendered the zero-population sentence, "Adds no seats to the
  Okonkwo residence. Claire Bissett, Dana Kowalski, Ingrid Halvorsen, Pete Rusk are already on the
  call sheet." — a graceful, honest per-pick refusal, and the room announced "The bid is written…"
  -style status text was NOT triggered here since nothing was written; no error, no duplicate seat
  was created (verified in Postgres: no new `project_parties` row). **Settled, not a finding** —
  matches the report's own §10 item 1 and this round's own code review's finding 6, which observed
  the identical three-numbers-on-one-screen shape (4 ticked / 0 fresh / 0 fresh) and named it
  "honest… not asserted as wrong."
- Console clean throughout.

## 3. Compare & merge (scope 1)

No natural duplicate exists in the seeded book (the shipped `e2e/people/merge.spec.ts` writes its
own collision for the same reason). Inserted a temporary pair sharing a phone
(`Wren Ashby QA` / `W. Ashby QA`, created 2024-03-01 / 2026-08-01) directly in Postgres to exercise
the live UI, then deleted both rows and the merge record afterward — no residue.

- **The band** read exactly R-Y's sentence: "These two cards share a phone. W. Ashby QA
  Wren Ashby QA COMPARE THESE TWO" — both names live open-person links.
- **The sheet** (`Compare · two cards`) pre-picked the **older** card (Wren Ashby QA, 1 March
  2024) as survivor, `KEEPS THE CARD` highlighted — PR-o confirmed. Nine fields shown: Name, What
  they are, Firm, Mobile, Email, Contact rule, Papers on file, Seats on jobs, In the book since.
  Flipping the survivor (clicking "W. Ashby QA") correctly re-picked and re-worded the
  consequence sentence and the terminal act label live; flipping back restored the default.
- **Terminal act.** "MERGE INTO WREN ASHBY QA" folded the newer card; the Directory reopened on
  the survivor's card; verified in Postgres: `merged_into` set on the folded row,
  `studio_contact_merges` holds one row (`matched_on = 'phone'`, `merged_by` = the signed-in
  designer's id), `resolve_merged_contact(<folded id>)` returns the survivor id. No consent table
  touched (grepped and confirmed no write to `studio_channel_consent` from this act).
- Console clean throughout.
- **Not independently re-verified this round, but flagged by this round's own code review
  (finding 2, confidence high) and worth naming here since it touches the exact sentence just
  walked:** the room's `w3-room-report.md` §2 quotes the post-merge status line as "…carries
  **everything** &lt;merged&gt; held," and quotes the "no rule on either card" branch of the
  consequence sentence wrong — both are stale prose, not code defects; see that review's finding
  2 for the four-line diff. Not re-measured here; not double-counted as a QA finding.

## 4. The Bidding band (scope 3) — edit a bid outcome

Opened Rivera Finishes' row in the Bidding band ("Asked 28 September 2026. Due 5 October 2026."),
"Change what came back" → the seven-field editor. Set "How it came back" to **Selected**; the
consequence sentence updated live to "Recording this moves Rivera Finishes to Awarded. A bidder
who did not win never reads as crew." — matching the room report's quoted sentence exactly.
Pressed "Write the bid":

- Room announcer fired: `role="status"` read "The bid is written on Rivera Finishes's seat."
- The row moved out of the Bidding band into the crew list with an **Awarded** badge; the
  Bidding band's own heading dropped to 0 and disappeared.
- Verified in Postgres: `bid_outcome = 'selected'`, `stage = 'awarded'` — matches
  `SEAT_BID_OUTCOME_STAGE`.
- The bid note printed only the dates actually on file ("Asked 28 September 2026. Due 5 October
  2026.") — no fabricated "Selected" date, since none was entered in "The studio chose them."
  Correct per the report's own rule ("an empty date prints nothing rather than a number the
  record does not make").
- Console clean throughout.

## 5. The household (scope 4) — add a member with a threshold as principal; confirm a member cannot

On the Okonkwo Call Sheet's Client side band, pressed **"Open a household"** (none was on file,
matching the report's documented seed limitation, §10 item 2). Then, signed in as
`designer@patina.dev` (owner, the principal):

- **"Set the figure"** opened the editable field with R-BO's standing safety sentence always on
  the face ("Nothing is written until this reads as a figure in dollars. The figure on file
  stands until then."). Typed `$3,000`; the consequence sentence read "Change orders over $3,000
  will need a signature from the household. Every household member who already signs money from
  this figure moves to $3,000, on every job. Nothing is sent to them." Wrote it; the band updated
  to "Change orders over $3,000 need a signature from the household."
- **"Add a household member"** → selected **Dale Whitcomb** from the picker (client-side cards —
  Adaeze, Chidi — listed first, per PR-c's design, then the rest of the book alphabetically),
  role defaulted to "Signs for the household"; consequence sentence "Dale Whitcomb joins the
  household and takes a seat on the Okonkwo residence. They may sign money to $3,000. Nothing is
  sent to them." Confirmed — Dale Whitcomb appeared on the Client side as a new
  `HOUSEHOLD MEMBER` seat, "Signs money to $3,000."
- **Verified in Postgres**, per R-BQ exactly: `client_households.co_threshold_cents = 300000`;
  Dale Whitcomb's new seat carries exactly one `project_party_authority` row, `scope = 'money'`,
  `threshold_cents = 300000`, `source_household_id` = the household's id. **Chidi Okonkwo's
  pre-existing seed grant ($2,500, `source_clause = 'Owner agreement, Exhibit B §4.2'`,
  `source_household_id` NULL) was correctly left untouched** — it is not household-sourced, so
  the $3,000 figure did not silently rewrite it, matching R-BQ's own rule and the migrations
  review's own re-measurement of the identical shape (§5, r18 MAJOR-2 lineage).
- **Member cannot, confirmed.** Temporarily set `studio_manager@patina.dev`'s
  `organization_members.role` to `member` (reverted immediately after), signed in as that account,
  and opened the same household band: **"SET THE FIGURE" and "TAKE THE FIGURE AWAY" both
  rendered**, with the reason sentence always on the face beside them — "The change-order figure
  is the principal's to set. An owner or an admin of the studio can write it." Pressing "SET THE
  FIGURE" produced a second, live status line, "A change-order figure is the principal's to set.
  Ask an owner or an admin of the studio." — the same PR-n refusal, client-gated, with **no write**
  (`co_threshold_cents` still read `300000` immediately after, confirmed in Postgres). Console
  clean for this session too. Role reverted to `admin` before signing back in as Leah.
  **This round's own code review names the hook-level wording as slightly different from what
  the room report quotes ("…and the principal's to take away." is missing from the report's
  quote) — a report-drift note, not a behavior defect; the behavior itself is correct and was
  independently confirmed here.**

## 6. Close a seat with a reason — TWO outcomes, one BLOCKING

**(a) Closing a live, never-before-closed seat — correct.** On Dale Whitcomb's person card
(Seats region), pressed "Close this seat." Confirm sentence: "Close Dale Whitcomb's seat? The
seat stays on the job with the day it closed, and everything it carries stays with it." Typed a
reason ("Moved out of state; no longer signs for the household."), confirmed. Toast: "Dale
Whitcomb's seat is closed." Verified in Postgres: `stage = 'off_job'`, `off_job_at = 2026-09-15`,
`off_job_reason` = the typed sentence, and — per the r19 fix (00634's trigger) — the seat's
`$3,000` money grant correctly **ended the same day** (`effective_to = 2026-09-15`), not deleted.
The person card correctly moved the seat to "PAST SEATS … OFF THE JOB · Closed 15 Sep 2026," and
the Call Sheet's `rosterWindowClause` printed the same closing date on the row. **This half is
correct and matches the room report.**

**(b) Closing an ALREADY-closed seat via the Call Sheet row — BLOCKING, independently reproduced.**
This round's own parallel code review (`w3-review-r20-code.md` finding 1, confidence high, filed
via a temporary jest case) reports that the Call Sheet row's "Close this seat" act is gated only
on `isSeat` (`roster-row.tsx:1165`) — never on `row.offJobAt` or `row.stage` — so a seat already
sitting in the Done band with a recorded closing date and reason still offers the act, and the
reason field is **not** seeded from the existing `row.offJobReason`, so pressing it overwrites
`off_job_at` to today and blanks `off_job_reason` to `NULL`. I reproduced this live, end to end,
against the running server:

- Set `Jim Lindgren`'s seat (SUB · HVAC, Boreal HVAC) to `stage='off_job'`,
  `off_job_at='2026-08-20'`, `off_job_reason='Picked another HVAC sub.'` directly in Postgres (a
  plausible prior closure the room already recorded), then reloaded the Call Sheet.
- The Done-band row displayed correctly: "Off the job 20 Aug 2026. Picked another HVAC sub."
- Clicking the row's name (not the chevron, which opens an unrelated `party-profile-sheet`)
  unfolded the row's own action row and **"CLOSE THIS SEAT" was offered**, exactly as on a live
  seat — nothing on the face marks this seat as already closed within reach of the act.
- Pressing it opened the confirm block with the **same wrong-fact sentence** used for a live
  seat — "Close Jim Lindgren's seat? The seat stays on the job with the day it closed, and
  everything it carries stays with it." — false in this state, since the press is about to move
  the day, not merely record it — and the **"WHY IT CLOSED" field rendered completely blank**,
  not seeded from the row's own recorded reason.
- Pressing "CLOSE THE SEAT" (unchanged, blank reason field): toast "Jim Lindgren's seat is
  closed."; the row updated to read only "Off the job 15 Sep 2026." — the original reason clause
  is gone from the face. **Verified in Postgres**: `off_job_at` moved from `2026-08-20` to
  `2026-09-15` (today) and `off_job_reason` was overwritten from `'Picked another HVAC sub.'` to
  `NULL`. Nothing anywhere retains the original date or reason — no audit row, no second copy.
- Reverted Jim Lindgren to his original seed state (`stage='awarded'`, both columns `NULL`)
  immediately after, in Postgres — no residue.

**Severity: BLOCKING** — per this brief's own rubric, "wrong fact on a face": the confirm
sentence is a lie in this state, and the room permanently and silently destroys a previously
recorded closing date and reason on a routine, undifferentiated press of the room's own primary
close-seat door — the same class of harm r19 major-1 closed for the *bid* editor
(`SetPartyBidInput.previous.offJobAt` gate), left open on the door that actually writes the
column. **Confidence: CONFIRMED** (live UI reproduction plus direct Postgres verification,
corroborating this round's own code review finding 1 independently). Not scoped to W4; not
covered by any ruling in `rulings.md` §3.

## 7. Archive / restore as owner (scope: archive door)

On Dale Whitcomb's person card (still signed in as Leah, owner), pressed "PUT THIS CARD AWAY."
Card read: "This card was put away 15 September 2026. It stays out of the book until it is
brought back." with "BRING THIS CARD BACK" as the standing restore door. Toast: "Dale Whitcomb is
put away." Pressed "BRING THIS CARD BACK" — toast "Dale Whitcomb is … back in the book." — door
reverted to "PUT THIS CARD AWAY." The card's own open seat (Okonkwo residence, already closed per
§6a above) and past-seat record were unaffected by the archive/restore cycle, confirming archive
is a card-level door independent of seat state, as designed. Console clean throughout.

## 8. BLOCKING found independently — the seat-close trigger crosses tenant boundaries and bypasses PR-n

Not part of the six named walk tasks, but surfaced while re-checking r19's fix (00634's trigger,
which I exercised functionally and correctly in §6a above) against this round's own parallel
migrations review, which filed it as BLOCKING-1. I independently reproduced both halves in a
rolled-back transaction against the freshly reset local database (no residue; verified the
transaction rolled back):

**(a) PR-n bypass, inside the tenant.** A plain `member` of the Okonkwo residence's own recorded
studio cannot write a money-authority row directly (`UPDATE project_party_authority … rows=0`,
RLS refuses, as intended). The **same** plain member closing a seat that carries a $1,000,000
money grant (`UPDATE project_parties SET stage='off_job', off_job_at=…`) causes 00634's
`SECURITY DEFINER` trigger — which carries no gate of its own — to end that same grant
(`effective_to` set) with no further check. A member who is refused the write directly performs
the same effect through the seat-close door.

**(b) Cross-tenant, outside the tenant entirely.** A plain `member` of a **second, unrelated**
studio — who is not a member of the studio the Okonkwo job records, cannot SELECT the authority
row at all (`visible_authority_rows = 0`, 00624's tenant leg holds), and cannot write it directly
(`rows=0`) — can still close the seat, because `project_parties_studio_update` checks only
`is_studio_comember(designer_id)` (true whenever the caller shares ANY active organization with
the project's designer, not specifically the studio of record) with no tenant leg at all. That
close ends the $1,000,000 grant belonging to a studio the caller cannot even read from.

**Severity: BLOCKING** — "cross-tenant read/write, RLS/grant hole," verbatim from this brief's
rubric. **Confidence: CONFIRMED**, independently reproduced via the exact probes this round's
migrations review (`w3-review-r20-migrations.md` BLOCKING-1) filed, re-run fresh in a separate
rolled-back transaction with the same results. Not reachable through my own manual UI walk in
§6a (Dale Whitcomb's close was performed by the studio's own owner, the intended caller), but
reachable by any authenticated member of the studio (or of any other studio sharing the
designer) through the same "Close this seat" door I exercised correctly in §6a — this is a
privilege/tenancy defect in the write path underneath that door, not a UI-only issue.

## 9. Console

Checked after every write across both server sessions (bring-forward picker, merge, bid edit,
household create/threshold/add-member, member-role refusal probe, seat close ×2, archive/restore,
and the Jim Lindgren reproduction): **zero console errors or exceptions at any point.**

## 10. Port and process hygiene

`lsof -nP -iTCP:3000 -sTCP:LISTEN` was empty before both server starts (no orphan, no conflict —
PORT RULE not invoked either time). Both `next start` processes and their npx wrapper PIDs were
killed at the end of each session; `lsof -nP -iTCP:3000 -sTCP:LISTEN` returned empty immediately
after each stop, confirmed with a second check.

## 11. Screenshots

`build/qa-w3-r20/`:
- `01-bring-forward-picker-1440.jpg` — the picker mid-pick, "2 of 6…" (partial selection captured
  mid-walk), eyebrow "OKONKWO RESIDENCE" visible
- `02-household-close-seat-1440.jpg` — Client side band showing Dale Whitcomb's closed seat with
  its reason clause, and the household figure band beneath it
- `03-bid-awarded-1440.jpg` — Rivera Finishes with the Awarded badge, moved out of Bidding
- `04-archive-restore-person-card.jpg` — Dale Whitcomb's card after the archive/restore round
  trip, door back to "PUT THIS CARD AWAY"

## 12. Not done / out of scope for this round

- Did not re-verify §2's four stale-quote findings from this round's own code review (finding 2)
  line by line — named in §3 above for completeness, not double-filed.
- Did not attempt a live UI reproduction of §8's cross-tenant hole (rolled-back SQL only, per the
  brief's own no-prod / no-residue posture for a finding this severe); the room-level UI path for
  it is identical to the one exercised correctly in §6a.
- The household band's inertness on a *fresh* Okonkwo reset (no household on file until "Open a
  household" is pressed) and the bring-forward picker's "already on the call sheet" outcome are
  both pre-existing, already-documented seed limitations (`w3-room-report.md` §10 items 1–2),
  confirmed exactly as documented, not re-filed.

# W3 round 22 — runtime QA against a local production build

Local production build (`next build` then `next start -p 3000`), env passed inline per the
binding ENV rules — no `.env.local` created or read. `pnpm supabase:reset` run first (clean
replay, head `00634`, matching the branch's data layer exactly — nothing minted, nothing in the
reserved `00595`–`00620`). Signed in as `designer@patina.dev` (Leah Hartwell, studio owner) via
Mailpit OTP (the CLI's `[inbucket]` section is deprecated in favour of Mailpit on the same port;
same UI shape, `/monitor` 404s, root path is Mailpit's own inbox). Server stopped at the end; port
3000 confirmed free.

**Verdict: CLEAN — zero blocking, zero major.** Two minor, informational-only findings (test-suite
scheduling flakiness already in a known class; one stale reference screenshot in `shots/`), neither
touching the room's behavior.

---

## 0. Setup, measured — including a self-inflicted false start, corrected

```
lsof -nP -iTCP:3000/3002 -sTCP:LISTEN   → both empty, no orphan, PORT RULE not invoked
pnpm supabase:reset                      → clean replay, "Finished supabase db reset on branch main."
supabase status -o env                   → local keys captured to a scratch file (never printed)
pnpm --filter @patina/types --filter @patina/supabase build → types builds; supabase ships source
pnpm --filter @patina/designer-portal build (inline env)     → route table built, /people present
next start -p 3000 (inline env)          → "Ready in ~90ms", curl / → 200
```

**A footgun worth naming, not a product finding.** My first build/start pass sourced the captured
`supabase status -o env` output through `source <(process substitution)` inside a `set -a` block.
macOS's system `/bin/bash` is 3.2 (2007-era), and on this shell that idiom silently sets nothing —
no error, no non-zero exit, just empty variables downstream. Both the first build and the first
`next start` ran with an **empty** `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
The server logged `[auth] role lookup unavailable: admin client could not be built Error:
supabaseKey is required` on every server-route call needing the admin client, and
`company-card.spec.ts`'s "Chase the renewal" test failed for exactly that reason (the API route
never got a working service-role client). I caught it from the server log, rebuilt and restarted
with the same values written to a plain file and `source`d (not process-substituted), and reran
everything downstream on the corrected server. **Both `company-card.spec.ts` tests pass cleanly
against the corrected build** — this was never a product defect, and I'm naming it only so a future
round doesn't waste a cycle re-diagnosing this project's own QA tooling. Every finding and
screenshot below is from the corrected build.

---

## 1. `e2e/people` (chromium), pasted

Full-directory run, default parallelism (the suite's own `fullyParallel: true`), corrected env:

```
13 passed, 9 failed (≈1.0m)
✓ bring-forward.spec.ts:264 Put back clears the pick and writes nothing
✓ call-sheet.spec.ts (2/3 — task 3 notice-log, task 6 window-banding)
✓ company-card.spec.ts (2/2)
✓ directory.spec.ts (6/6)
✓ merge.spec.ts:81 the duplicate band merges two cards into one (PR-o)
✘ add-client-letter.spec.ts (2)
✘ add-sheet.spec.ts (3 — task 1, task 2, "asks for a trade")
✘ bring-forward.spec.ts:117 task 5 — search the prior job, tick four, one confirm
✘ call-sheet.spec.ts:91 task 3 — who has site access right now
✘ person-card.spec.ts (2 — task 4, R-V)
```

**Eight of the nine are the exact carried-forward set** first named in `w3-fix-log-r14.md` and
re-confirmed unchanged in `w3-review-r15-qa.md` ("14 passed / 8 failed… `add-sheet.spec.ts` (3),
`person-card.spec.ts` (2), `add-client-letter.spec.ts` (2) and `call-sheet.spec.ts` (1)"). None of
these six specs is in this brief's scope (bring-forward, merge, bid, household, close-seat,
archive) and none was touched by any fix since r14. Not re-characterized here, per the same
scoping r15 used.

**The ninth — `bring-forward.spec.ts:117` task 5 — is new against that count, and is test
scheduling, not a room defect (finding QA-r22-minor-1 below).** Isolated re-run,
`--workers=1`, same corrected env:

```
Running 2 tests using 1 worker
  ✓ bring-forward.spec.ts:117 task 5 — search the prior job, tick four, one confirm (4.7s)
  ✘ bring-forward.spec.ts:264 Put back clears the pick and writes nothing (9.4s)
```

Task 5 **passes alone**, every time. The two tests in this file share one `beforeAll`-minted
project; `fullyParallel: true` normally schedules them onto separate worker processes (so each
gets its own fresh project from its own `beforeAll`), but when the runner's worker count collapses
to one — this machine, this round — both land in the SAME worker on the SAME project, in file
order: task 5 runs first and adds four seats to the shared project, then "Put back" reads Dana
Kowalski as already-seated and never reaches its `Add one to the roster` assertion. In the earlier
default-parallelism run the two tests happened to land in different workers and the FIRST one
(task 5) was the one that read stale/shared state instead — same root cause, opposite victim,
confirming it's a worker-assignment race over one shared fixture project rather than a defect in
either test's own logic. Matches the project's own documented class of e2e flakiness
("single-actor collisions" — `feedback_multiwave_workflow_coordination_2026_09_09.md`). Not
filed as a room defect.

---

## 2. Task 5 — bring forward (SPEC §5.7), walked live on the real Okonkwo residence

Opened the Okonkwo Call Sheet → "From the rolodex" → searched "Lindqvist".

- **"4 of 6 from the Lindqvist kitchen selected"** printed verbatim once Claire Bissett, Dana
  Kowalski, Ingrid Halvorsen and Pete Rusk were ticked — the R-BP six-row amendment holds.
- **Six rows, alphabetical**: Ben Ostrom, Claire Bissett, Dana Kowalski, Erin Sato, Ingrid
  Halvorsen, Pete Rusk. Every row's chips and clauses matched SPEC §5.7 #4 with one settled
  exception: **Pete Rusk's reach word reads "Field link", not SPEC's literal "On paper"** — this
  is R-BH exactly ("the dev seed mints a field link for every fixture seat whose reach reality is
  field link, including F-12 Pete Rusk (opted out of texts, not of the link)"), a ruling in
  `rulings.md` §3 — settled, not a finding.
- **Travel-list pane** verbatim: "What travels" → identity, typed channels, contact rule, consent
  by channel value, document expiries, one history line. "What stays behind" → prior pricing,
  prior project notes, show to client. ("prior" vs SPEC's literal "2025" is the already-logged
  `w3-review-r11-code.md` m1 divergence, re-confirmed present, not re-filed.)
- **The real Okonkwo project already seats all four ticked people** (Claire Bissett, Dana
  Kowalski, Ingrid Halvorsen, Pete Rusk are the fixture's own point, per
  `bring-forward.spec.ts`'s own comment). The act row correctly read the generic "Add to the
  roster" (not "Add four…", since zero of the four would actually be NEW) and the consequence
  sentence named them: "Adds no seats to the Okonkwo residence. Claire Bissett, Dana Kowalski,
  Ingrid Halvorsen, Pete Rusk are already on the call sheet." This is the honest, safe answer for
  the real seed's own designed state, not a defect — and the isolated e2e run (§1 above) already
  proves the true "Adds four seats…" / write-four-seats happy path end-to-end on a FRESH project,
  byte-for-byte against SPEC §5.7 #7.
- Screenshot: `build/qa-w3-r22/task5-pick-1440-ticked.jpg`. Layout, row grammar (checkbox, 34px
  circle, name/firm/trade, history line, chips) match `shots/people-room-1440-state-pick-1440.png`
  save for the two settled divergences above and one further stale-artifact note (finding
  QA-r22-minor-2 below).
- **390 width: not verified this round.** `resize_window` reported success but
  `window.innerWidth` stayed at the real browser window's width (1882, then still 1882 after a
  page-context `window.resizeTo()` too) — the exact tool limitation `w3-review-r15-qa.md` §2 named
  ("the browser-automation tool's `resize_window` call reported success but the tab's actual
  viewport stayed at 1440"). Not a product observation. Prior rounds' 390 screenshots
  (`qa-w3-r13/task5-pick-390-before-tick.png`, `qa-w3-r19/task5-bring-forward-390-put-back.jpg`)
  already measured zero overflow and full string match, unchanged since.

---

## 3. Compare & merge (scope 1), walked live

The seed carries no natural duplicate, so — mirroring `merge.spec.ts`'s own approach exactly — I
inserted two `studio_contacts` rows sharing one phone number directly in the local Postgres
(`QA Older Duplicate` / `QA Newer Duplicate`, dated 2024-03-01 and 2026-08-01), walked the merge,
then deleted both rows and the merge-audit row afterward. No shipped fixture touched.

- The Directory's duplicate band appeared on its own: **"These two cards share a phone. QA Newer
  Duplicate QA Older Duplicate COMPARE THESE TWO"** — R-Y's exact shape.
- The sheet pre-picked **QA Older Duplicate** (the older card) as survivor — PR-o. Flipping to QA
  Newer Duplicate and back worked both ways; the consequence sentence and terminal act label
  ("MERGE INTO …") updated correctly on each flip.
- Confirmed the merge: the survivor's card opened, Directory count dropped from 42 → 41.
  Database, read directly: `studio_contacts.merged_into` on the folded card now points at the
  survivor; `studio_contact_merges` holds one audit row (`matched_on = 'phone'`, correct
  `merged_by`, correct timestamp). Screenshot: `build/qa-w3-r22/merge-after-survivor-1440.jpg`.

---

## 4. The Bidding band (scope 3), walked live on Rivera Finishes (real Okonkwo seat)

Unfolded the Bidding band's one row (Rivera Finishes, "No response", "Asked 28 September 2026. Due
5 October 2026."), opened "Change what came back", switched "How it came back" to "They declined".

- Consequence sentence, live: **"Recording this moves Rivera Finishes to Declined. A bidder who
  did not win never reads as crew."** — matches the report's documented sentence exactly.
- Wrote it: chip updated to "DECLINED", confirmation "The bid is written on Rivera Finishes's
  seat.", row **stayed inside the Bidding band** (not moved to Done) — correct per the
  `declined → Declined` / stays-in-Bidding rule.
- Database, read directly: `bid_outcome = 'declined'`, `stage = 'declined'`, `off_job_at` still
  NULL — a declined bidder is not dated, only a withdrawal or a hand-close dates a seat. Correct.
- **Confirmed R-BS's clamp holds live, not only in the SQL suite**: this write moved `bid_outcome`
  and `stage` but never touched `off_job_at`, so 00634's end-authority trigger did not fire — no
  authority row on this seat was disturbed by a bid answer, exactly as the r21 fix intends.
- Reverted the outcome back to "No response" afterward (`bid_outcome`/`stage` confirmed back to
  `no_response`, `off_job_at` still NULL) to leave the seed as found. Screenshot before revert:
  `build/qa-w3-r22/bid-declined-written-1440.jpg`.

---

## 5. The household (scope 4), walked live as owner, then RPC-checked as a plain member

On the real Okonkwo project's Client side band: "No household is on file for this client yet, so
what each of them may sign is recorded seat by seat rather than in one place." with "Open a
household" — matches the report's documented seed state exactly (§5's own explanation: no bridge
from `projects` to `designer_clients` on this row).

- **Opened a household. As the studio owner (the principal, PR-n), set the change-order figure**
  to $3,000. Consequence sentence live: "Change orders over $3,000 will need a signature from the
  household. Every household member who already signs money from this figure moves to $3,000, on
  every job. Nothing is sent to them." Written: the band now reads "Change orders over $3,000 need
  a signature from the household." and Chidi Okonkwo's existing seat-level clause updated in place
  ("Signs money to $2,500." → still $2,500 on HIS seat, since he predates the household and his
  grant is sourced from the agreement, not the household — correctly unmoved, per R-BQ: a figure
  never opens or grows a grant it did not source).
- **Added a household member** (Marcus Hale, an existing studio-book person, role "Signs for the
  household"). Consequence sentence named him and the $3,000 figure correctly before the write.
  After: Marcus Hale appears on the Client side band as `HOUSEHOLD MEMBER`, "Signs money to
  $3,000." Database, read directly: `client_households.co_threshold_cents = 300000`,
  `member_person_ids` now holds three ids (Adaeze, Chidi, Marcus).
- **Confirmed a plain member cannot**, at the RPC boundary the UI itself calls (created a real
  Supabase Auth user via the admin API, added them to the studio as `role = 'member'`, then called
  `set_household_threshold(...)` inside a rolled-back transaction impersonating that user via
  `SET LOCAL ROLE authenticated` + `request.jwt.claims` — the identical idiom
  `e2e/helpers/psql.ts`'s `psqlAsUserRow` uses):
  ```
  ERROR:  household_threshold_forbidden
  HINT:   A change-order figure is the principal's to set, and the principal's to take away (PR-n).
  ```
  Exactly the refusal `use-households.ts:116-117` and `household-band.tsx:721-724` document. (A
  full browser-session walk as this second user wasn't possible in this pass — MCP tabs share one
  Chrome profile/cookie jar, so a second tab inherits Leah's session rather than starting fresh;
  the RPC-level check above is the same gate the UI's `aria-disabled` path calls through, and
  `household-band.test.tsx`'s 45 cases already cover the front-end `aria-disabled`/reason-sentence
  half of this for a `member` role.) Cleaned up the QA auth user and membership row afterward. Left
  the household additions (Marcus Hale, $3,000 figure) in place on the real seed, matching how
  prior rounds' household walks were left — `supabase:reset` wipes them for the next round.

---

## 6. Close this seat (scope 5), walked live on Sam Rowe's real Okonkwo seat

Person card → Seats on projects → "Close this seat" → confirm dialog ("Close Sam Rowe's seat? The
seat stays on the job with the day it closed, and everything it carries stays with it.") → typed a
reason → "Close the seat".

- Toast: "Sam Rowe's seat is closed." Person card: "Seats on projects" now reads "No open seat on
  this project."; "Past seats" reads "Okonkwo residence · architect · OFF THE JOB · Closed 15 Sep
  2026."
- Database, read directly: `off_job_at = 2026-09-15`, `off_job_reason` = the typed reason,
  `stage = 'off_job'`. His `change_order` authority row's `effective_to` moved from open (NULL) to
  `2026-09-15` — **00634's trigger fired correctly on the hand-close act**, ending the money the
  seat carried, exactly as the report documents.
- **Re-checked the Call Sheet row for the same seat (r20/r21's own fix)**: "Close this seat" on
  that row is now `aria-disabled`-shaped (visibly greyed, held) with the reason on the face: "This
  seat left the job on 15 Sep 2026. The reason on file reads 'QA r22 walk — testing close-seat
  act'. Closing it again would write over that day. Putting a seat back on the job is its own
  act." — confirms r20-major-1/QA-blocking-2's fix (the Call Sheet no longer offers a second,
  silently-destructive close on an already-closed seat) is live, not just in the test suite.
  Screenshot: `build/qa-w3-r22/close-seat-held-1440.jpg`.
- **No UI path exists to reopen a hand-closed seat** (confirmed by inspection — no "put back on
  the job" control on either the person card or the Call Sheet row; 00634's own banner names this
  as deliberate, future, separately-consequenced work, not a gap in this pass's scope). Reverted
  the test seat directly in Postgres (`off_job_at`/`off_job_reason` back to NULL, `stage` back to
  `'active'`, the authority row's `effective_to` back to NULL) to leave Sam Rowe's real seed seat
  exactly as found, since the room itself currently offers no act to do this.

---

## 7. Archive / restore (scope 5), walked live as owner on Sam Rowe's card

- "Put this card away" → **"This card was put away 15 September 2026. It stays out of the book
  until it is brought back."** with "Bring this card back", toast "Sam Rowe is put away." —
  matches the report's `ArchiveCardDoor` description exactly, including the always-visible date.
  Screenshot: `build/qa-w3-r22/archive-put-away-1440.jpg`.
- "Bring this card back" → door reverts to "Put this card away", toast "Sam Rowe is back in the
  book." Full round trip, no residue. Screenshot: `build/qa-w3-r22/archive-restored-1440.jpg`.

---

## 8. Console, server log, and the port

- Server log (`portal-3000-r22.log`) carries **zero errors or warnings across the entire corrected
  walk** — only the framework's own one-time `"next start" does not work with "output: standalone"`
  advisory at boot (informational, not an error; the server served every request that followed).
- Browser console, checked mid-session and again after a fresh reload at the end: **clean, zero
  errors**.
- `lsof -nP -iTCP:3000/3002 -sTCP:LISTEN` after stopping the server: **both empty**. The server
  processes I started (verified by PID/PPID/start-time before killing) were the only listeners;
  the stray `apps/admin-portal` build process visible mid-session (`ps -ef`, unrelated to anything
  I launched) had exited on its own by the time I checked again and never touched port 3000/3002.

---

## 9. Prior findings (r21), re-checked

Every one of r21's eight findings was already closed at HEAD per `w3-fix-log-r21.md`'s own
re-verification pass. I did not re-audit all eight line-by-line (out of this round's scope — it
names r22 as a fresh runtime QA walk, not a fix-log re-check), but two of them are directly
exercised by this round's own walk and both held:

- **r21-MAJOR-2 (the Bidding band's "They withdrew" as a second door into 00634)**: exercised
  indirectly — my own bid-outcome write (→ "declined") correctly left `off_job_at` untouched, so
  the trigger's clamp was never even in play for that transition, consistent with the fix.
- **r21-MAJOR-1 / r21-major-2 (Close this seat, held for a caller without standing, and 00634's
  refusal in words)**: exercised directly in §6 above — the Call Sheet's held state with its
  visible reason is live at HEAD, not only pinned by test.

Nothing re-opened.

---

## 10. Findings

### QA-r22-minor-1 — `bring-forward.spec.ts`'s two tests share a project and race under low
worker counts (test-infra, not the room)

**Severity: minor. Confidence: high (reproduced twice, opposite failure each time, root cause
demonstrated).**

`bring-forward.spec.ts`'s `task 5` and `Put back clears the pick and writes nothing` share one
`beforeAll`-minted project. `fullyParallel: true` normally isolates them onto separate workers
(each gets its own `beforeAll`, hence its own project); when the runner's effective worker count
is 1, both land in the same worker on the same project and whichever runs second reads state the
first one wrote. Confirmed: full-parallelism run failed task 5 (reading three seats already added
by a scheduling neighbor); an isolated `--workers=1` run of the same file failed "Put back"
instead (reading Dana Kowalski as already-seated by task 5, which ran first in file order). Both
individual tests pass cleanly alone. Not a defect in the room or in either test's own logic — a
shared-fixture hazard that surfaces only under a worker-count squeeze. Fix (owed, not urgent):
give "Put back" its own `beforeAll`-minted project, the way `merge.spec.ts` and the task 5 test
already each mint their own.

### QA-r22-minor-2 — `shots/people-room-1440-state-pick-1440.png` predates the R-BP six-row
amendment

**Severity: minor. Confidence: high.**

The exported PNG at `artifacts/people-room-crm-2026-09-11/shots/people-room-1440-state-pick-1440.png`
still reads "4 of 5 from the Lindqvist kitchen selected" with five rows (no Erin Sato) and "Adds
four seats" framed against that five-row world. The underlying specimen HTML
(`specimens/people-room-1440.html`) was correctly updated for R-BP — it reads "of 6" and lists
Erin Sato — so this is a stale, un-regenerated screenshot export, not a live product or specimen
defect. Cosmetic; regenerate the PNG from the current HTML whenever convenient.

No blocking or major findings. No RLS/grant hole, no cross-tenant read/write, no consent write
outside `record_channel_consent`, no reset failure, no data loss on merge, no reader disagreeing
with the record, no broken Leah task, no a11y contract break observed in this round's walk.

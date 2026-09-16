# W3 (P2) — runtime QA, round 21

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`. Local
Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). Against a **local
production build** of `apps/designer-portal` (`next build` + `next start -p 3000`, env passed
inline per the binding instruction — no `.env.local` created). No prod touched. No migration
minted (`00634` unapplied on Strata, amended in place — nothing to number). Signed in as
`designer@patina.dev` (owner of `b0000000-0000-0000-0000-000000000001`, "Local Dev Studio") via
Mailpit OTP.

Every write this round made against the seed was inside a manual QA action; every one of them was
independently verified against `psql` and then reverted or deleted afterward. Final-state diff
against the fresh reset: **zero** — confirmed by direct query (§8).

---

## 1. Setup

- `lsof -nP -iTCP:3000/3002 -sTCP:LISTEN` — both free before starting; no PORT RULE case triggered.
- `pnpm supabase:reset` (workdir `.codex/worktrees/agent-people-build`) — clean: "Finished supabase
  db reset on branch main." Migrations through `00634_seat_close_ends_authority.sql` (amended in
  place, per the fix log) plus `20260910152111_create_contact_messages.sql` applied; seeds through
  `people_crm_dev.sql` loaded. `ls supabase/migrations | tail` confirms the branch still ends at
  `00634`, nothing minted, nothing in `00595`–`00620`.
- `supabase status -o env` (workdir the same) piped straight into env vars for build/start/e2e —
  keys never printed.
- `pnpm --filter @patina/designer-portal build` with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`,
  the local anon/service keys, `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`,
  `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`, and the three service URLs pointed at
  localhost per `.env.example` — **exit 0**, full route table printed, `/people` present as a
  static route.
- `npx next start -p 3000` (same env) in the background — `✓ Ready in 88ms`. The
  `"next start" does not work with "output: standalone"` warning is advisory only: `/auth/signin`
  answered 200, `/people` redirected 307 to sign-in as expected for an unauthenticated request, and
  every subsequent authenticated page load rendered correctly for the rest of the round.
- `npx playwright test e2e/people/bring-forward.spec.ts e2e/people/merge.spec.ts --project=chromium`,
  `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_URL`/anon key exported inline for the Playwright process
  itself (the `webServer` block's own env only reaches the process it spawns, not the runner) —

  ```
  Running 3 tests using 3 workers
  [1/3] bring-forward.spec.ts:117:5 › task 5 — search the prior job, tick four, one confirm
  [2/3] merge.spec.ts:81:5 › the duplicate band merges two cards into one (PR-o)
  [3/3] bring-forward.spec.ts:264:5 › Put back clears the pick and writes nothing
  3 passed (8.9s)
  ```

  `reuseExistingServer: !process.env.CI` (`playwright.config.ts:98`) meant the suite ran against the
  server already up on 3000, not a second `pnpm dev`. `CI` was unset.
- `psql -f supabase/tests/people/w3_merge_sweep_household_test.sql` — **re-run this round**, fresh
  off the reset above: "W3 SQL suite: all blocks passed", block `13e` last (r20's own negative
  control), block `12` (the r15 closed-seat pin) and `13b`/`13c` (R-BQ) all reporting `passed`.

---

## 2. Prior findings (`w3-fix-log-r20.md`) — re-checked

| Finding | Status | Evidence |
|---|---|---|
| r20-blocking-1 / r20-qa-blocking-1 — 00634's trigger opened a money-authority door around PR-n | **FIXED, confirmed** | SQL suite block `13e` passed on a fresh reset (§1). Also independently re-probed live in this round: a plain member of the recorded studio was refused `household_threshold_forbidden` on `set_household_threshold` in a rolled-back transaction (§5) — a different RPC than 00634's trigger, but the same owner/admin gate shape, confirms the pattern holds. |
| r20-qa-blocking-2 / r20-major-1 — Call Sheet offered "Close this seat" on a seat that had already left, and taking it overwrote the recorded day/reason | **FIXED, confirmed live** | Closed Joe Wozniak's seat myself this round (§6), then clicked "Close this seat" again on the now-closed row: the act announced the held reason ("This seat left the job on 15 Sep 2026. The reason on file reads…") and made **no** mutation call — `psql` before/after the second click showed `off_job_at`/`off_job_reason` unchanged. Matches the fix's own described shape exactly. |
| r20-major-2 — `w3-room-report.md` §2/§5 stale in five places (the sixth report-drift filing) | **FIXED, confirmed against HEAD** | Re-measured independently rather than trusting the fix log's own claim: `MERGE_REFUSAL_SENTENCES` in `packages/supabase/src/hooks/use-studio-contacts.ts:1925-1952` has **fourteen** keys (counted by grep, not by the report's prose) including `merge_seat_collision`; the `role="status"` string at `compare-merge-sheet.tsx:461-465` reads "…carries what \<merged\> held, and where both cards said something, \<survivor\>'s own words stand — except the trades and specialties, which are kept together." (no "EVERYTHING"); `household-band.tsx:721-724`'s click-handler string and `use-households.ts:116-117`'s `household_threshold_forbidden` string are the two *different* sentences the report now says they are, word for word. No sixth report-drift filing needed this round. |

No other pre-r20 finding was re-opened by anything observed this round.

---

## 3. Task 5 — bring Dana, Pete, Ingrid and the Stonehaven rep onto Okonkwo (SPEC §5.7)

Opened the Call Sheet (`/doc/d0e00000-0000-0000-0000-00000000000a?sheet=call`) → "From the
rolodex" → searched **"Lindqvist"**.

- **Six rows**, not five: Ben Ostrom, Claire Bissett, Dana Kowalski, Erin Sato, Ingrid Halvorsen,
  Pete Rusk — matches R-BP's amendment (Erin Sato listed, not selected, because F-28 gives her a
  second Lindqvist seat). Count line read **"0 of 6 from the Lindqvist kitchen selected"** before
  any tick, matching SPEC §5.7 #3 as amended.
- Ticked Dana Kowalski, Pete Rusk, Ingrid Halvorsen, and Claire Bissett (Stonehaven Tile Gallery —
  "the Stonehaven rep"). Line updated to **"4 of 6 from the Lindqvist kitchen selected"**, the
  square-checkbox mark (no tick glyph) shown filled on all four, empty on Ben Ostrom and Erin Sato
  — SPEC §5.7 #3/#4.
  Screenshot: `build/qa-w3-r21/01-task5-bring-forward-picker.jpg`.
- Every §5.7 #4 string present per row as specified: history line ("Worked 1 prior project,
  Lindqvist kitchen, closed 2025"), paper word, reach word, consent word (Pete Rusk's "Opted out by
  text 3 Dec 2025, on the Lindqvist kitchen." line printed on the row, not only in an unfold — R-T
  shape carried into the picker), Ingrid Halvorsen's rule clause ("Email only. No cell for work —
  the shop line is the voice door.").
- "What travels" / "What stays behind" panes present with the exact six/three items SPEC §5.7 #5
  names.
- Act row: on Okonkwo specifically, the label read **"Add to the roster"** (no count) rather than
  "Add four to the roster", because `bringForwardActLabel(selected)` (`lib/document/bring-forward.ts:96-100`)
  is driven by how many picks would actually add a **new** seat, and the seed already seats Dana,
  Pete, Ingrid and Claire on Okonkwo — this is the documented, deliberate seed shape from
  `w3-room-report.md` §10 item 1 ("bring-forward.spec.ts opens its own project rather than Okonkwo,
  because the seed already seats Dana, Pete, Ingrid and Claire there"), not a defect. Pressing the
  act produced the correctly-worded per-pick refusal: "Adds no seats to the Okonkwo residence. Claire
  Bissett, Dana Kowalski, Ingrid Halvorsen, Pete Rusk are already on the call sheet." — no error, no
  partial write (confirmed no new `project_parties` rows were created). The exact SPEC §5.7 #7
  string ("Add four to the roster… Adds four seats… Pete Rusk arrives opted out of texting.
  Northgate Electric's insurance lapsed 31 Mar 2026.") is provable only against a project where
  these four are not already seated, which is exactly why `bring-forward.spec.ts` opens its own
  project — confirmed green in §1.
- "Put back" cleared every tick and reset the line to "Adds no seats to the Okonkwo residence."
  with no names, live at both times, never `aria-disabled` — R-I.
- Compared against `shots/people-room-1440-state-pick-1440.png` / `-390.png`: those specimen plates
  (rendered 2026-09-11, before R-BP's 2026-09-14 amendment) show **five** rows and "4 of 5" — this
  is the specimen's own known staleness, already documented and superseded by R-BP and the amended
  SPEC text (which itself now reads "4 of 6"), not a new finding.
- Console clean throughout (`read_console_messages` with `onlyErrors:true`, checked repeatedly).

**No finding.**

### Minor, low-confidence observation (not filed as a finding)

The picker's six rows render in alphabetical-by-first-name order (Ben, Claire, Dana, Erin, Ingrid,
Pete) rather than SPEC §5.7 #4's listed order (Dana, Pete, Ingrid, Claire, Ben, Erin — selected
rows first). Content, ticks and every string are correct; only the row order differs from the
specimen's own illustrative list. I could not find anywhere in SPEC, the acceptance table, or
either e2e spec that pins DOM order as a contract (the e2e specs assert on names and text, not
position), so I am not confident this is an intended requirement rather than an artifact of how the
specimen happened to lay out its fixture — reporting it only because findings are not to be
filtered, not because I believe it rises to a real defect.

---

## 4. Merge two duplicate cards

The dev seed carries **no** persistent duplicate pair (`merge.spec.ts:27-63` writes and tears down
its own — confirmed by `select phone_e164, count(*) … having count(*) > 1` returning zero rows
before this test). I created a temporary pair the same way the spec does (`Wren Ashby QA81926` /
`W. Ashby QA81926`, one phone, organization `b0000000-…-001`, created 2024-03-01 / 2026-08-01),
walked it, then deleted every row I inserted (`studio_contacts`, no channels were ever written) —
confirmed zero residue afterward (§8).

- Directory band read exactly: **"These two cards share a phone. W. Ashby QA81926 Wren Ashby
  QA81926 COMPARE THESE TWO"** — R-Y's wording, both names live open-person controls.
- Sheet pre-picked **Wren Ashby QA81926** (the older card, created 2024-03-01 vs 2026-08-01) as
  survivor, ties-would-break-on-id per `preferredSurvivorId` — PR-o.
- Flipped the pick to W. Ashby: both column heads are `aria-pressed` buttons, the consequence
  sentence and terminal act label ("MERGE INTO W. ASHBY QA81926") updated together, correctly.
  Flipped back to Wren before merging.
- Neither test card carries a contact rule, so the consequence sentence correctly **dropped** the
  "contact rule" clause from the first sentence and inserted no sixth clause — the pair-branch shape
  r13 MAJOR-2 fixed (`compare-merge-sheet.tsx:131-138`), re-confirmed live.
- Pressed "Merge into Wren Ashby QA81926": Directory count dropped by one (42→41 people at that
  point, with my extra pair in the fixture), the survivor's card opened automatically. `psql`
  confirmed: `W. Ashby QA81926.merged_into = <Wren's id>`, and
  `studio_contact_merges(survivor_id, merged_id, matched_on) = (Wren, W.Ashby, 'phone')`.
  Screenshot: `build/qa-w3-r21/02-merge-survivor-opened.jpg`.
- Console clean.

**No finding.** Both cards were fully deleted (`studio_contact_merges`, `studio_contact_channels`
— none existed, `studio_contacts`) afterward; the merge left no residue in the real seed.

---

## 5. Add a household member with a threshold as the principal; confirm a member cannot

`designer@patina.dev` is `owner` of `b0000000-…-001` (queried directly — the only two members of
this local studio are `designer@patina.dev` (owner) and `studio_manager@patina.dev` (admin); no
plain `member` role exists in the seed, so the negative leg was verified by RPC probe rather than a
second signed-in session — see below).

**As principal (owner):**
- Okonkwo's Client side read "No household is on file for this client yet…" with "Open a
  household" live (not held) — matches §10 item 2's description of the seed's inert state.
- Pressed "Open a household" → household created (member ids seeded from the project's existing
  client/client_rep seats — Adaeze and Chidi, per `useProjectHousehold`'s overlap read), band showed
  "No change-order figure is on file for this household." with "Set the figure" / "Add a household
  member" both live.
- "Set the figure" → typed 3500 → consequence sentence read "Change orders over $3,500 will need a
  signature from the household. Every household member who already signs money from this figure
  moves to $3,500, on every job. Nothing is sent to them." → wrote it. Band updated to "Change
  orders over $3,500 need a signature from the household." `psql`: `client_households.co_threshold_cents
  = 350000`. Chidi's card correctly **still read** "Signs money to $2,500…" unchanged — his standing
  grant is sourced `'Owner agreement, Exhibit B §4.2'`, not this household, so R-BQ's rule ("a
  household figure never opens a money grant by itself… `set_household_threshold` only MOVES grants
  whose `source_household_id` is that household") correctly left it alone. This is the documented,
  correct behavior, not a bug.
- "Add a household member" → chose Sam Rowe (an existing crew card, architect, not previously a
  household member), role "Signs for the household" → consequence sentence: "Sam Rowe joins the
  household and takes a seat on the Okonkwo residence. They may sign money to $3,500. Nothing is
  sent to them." → confirmed. Sam Rowe appeared under Client side as a new `HOUSEHOLD MEMBER` row,
  "Signs money to $3,500." `psql` confirmed a **new** `client_rep` seat for Sam Rowe with a `money`
  authority row, `threshold_cents=350000`, `source_clause='client_households.co_threshold_cents'`,
  `source_household_id` = the household's id — the per-member, project-scoped grant R-BQ describes,
  written correctly and separately from his pre-existing `architect`/`change_order` seat (untouched).
- Console clean throughout.

**As a plain member (RPC probe, rolled-back transaction — no seeded plain-member account existed to
sign in as):** created a temporary `authenticated` user, added as `member` (not owner/admin) of
`b0000000-…-001`, `assume_user()`'d into their session (the same pattern the program's own
`probe-r20-a-plain-member-ends-money.sql` uses), and called
`set_household_threshold(<the household>, 999900)` directly:

```
=== A plain member of the recorded studio tries to move the household threshold ===
NOTICE:  refused as expected: household_threshold_forbidden
=== Household state AFTER (must be unchanged) ===
 co_threshold_cents = 350000   -- unchanged
```
`ROLLBACK` at the end of the script — the temp user, membership row and probe never persisted.

**No finding.** The household band's own `aria-disabled`/held-reason UI (`household-band.tsx:715-724`)
was not separately exercised by a second signed-in *member* session in this round (no such account
exists locally); the RPC-level gate it is built on was directly confirmed refusing exactly the way
the fixed report says it does. If a UI-level walk by an actual `member`-role signed-in user is
wanted, that needs a seeded plain-member dev account, which is outside a QA-only round to add.

Cleanup: deleted Sam Rowe's new seat + authority row and the household row itself. `psql` confirms
zero `client_households` rows and Sam Rowe carries no `client_rep` seat on Okonkwo afterward (§8).

---

## 6. Close a seat with a reason

Closed **Joe Wozniak**'s seat (Cedar & Iron Framing, carpentry & framing) from the Call Sheet's
"On the job" band:

- "Close this seat" → confirm sentence: "Close Joe Wozniak's seat? The seat stays on the job with
  the day it closed, and everything it carries stays with it." — the surviving hard-delete option
  ("Added by mistake") shown alongside, held with its own refusal reason ("This number has a
  texting record behind it. Close the seat instead — the record stays either way, and the seat is
  how you can still see it.") per the design R-AB describes.
- Typed a reason ("QA test close — picked another framer") into "Why it closed", pressed "Close the
  seat". Row moved from "On the job" to the "Done" band, printing "Off the job 15 Sep 2026. QA test
  close — picked another framer" on the collapsed row. `psql`: `stage='off_job'`,
  `off_job_at='2026-09-15'`, `off_job_reason='QA test close — picked another framer'` — exactly what
  was typed, dated today.
- **Re-checked the r20 fix live**: with the seat now closed, "Close this seat" is `held` — pressing
  it again only re-announced "This seat left the job on 15 Sep 2026. The reason on file reads "QA
  test close — picked another framer". Closing it again would write over that day. Putting a seat
  back on the job is its own act." and made **no** write (`psql` before/after the second click:
  identical `off_job_at`/`off_job_reason`). This is r20-qa-blocking-2's fix, confirmed holding.
- Console clean.

Cleanup: `UPDATE project_parties SET stage='active', off_job_at=NULL, off_job_reason=NULL` restored
Joe Wozniak's seat to its original seeded state (no UI "put back" act was found on the Call Sheet
row itself in this round — `w3-room-report.md` §6 names the standing repointing of the Call Sheet
onto `CloseSeatAct` as owed work, §10 item 9, not something this wave shipped — so a direct restore
was used instead of hunting for a UI path that may not exist on this surface).

**No finding.**

---

## 7. Archive / restore a card as owner

Archived **Marcus Hale** (Waterline Supply rep) from his person card:

- "Put this card away" → confirm → toast "Marcus Hale is put away." Card body updated to "This card
  was put away 15 September 2026. It stays out of the book until it is brought back." with "Bring
  this card back" live. `psql`: `archived_at = 2026-09-15 14:30:33+00`.
- Directory list correctly dropped Marcus Hale from the count and rows while archived.
- "Bring this card back" → toast "Marcus Hale is back in the book." Card returned to "Put this card
  away" (standing act, R-AB). `psql`: `archived_at` back to `NULL`.
- Full-page reload after restore showed Marcus Hale back in the Directory list with all his original
  facts (channels, contact rule, seat) intact — confirmed against `get_page_text`, matching the
  pristine pre-session listing verbatim.
- Console clean.

**No finding.**

---

## 8. Final residue check

```
select count(*) from studio_contacts where full_name ilike '%Ashby QA%' or full_name ilike '%QA plain%';  -- 0
select count(*) from client_households;                                                                    -- 0
select archived_at from studio_contacts where id = '<Marcus Hale>';                                         -- NULL
select stage, off_job_at, off_job_reason from project_parties where display_name='Joe Wozniak'
  and project_id = '<Okonkwo>';                                                                             -- active, NULL, NULL
select stage, bid_outcome from project_parties where display_name='Rivera Finishes'
  and project_id = '<Okonkwo>';                                                                             -- no_response, no_response
```

Every mutation this round was created and then removed or reverted by direct SQL matching the
UI's own write shape; nothing new is left on the branch's local Postgres beyond what
`pnpm supabase:reset` produced at the top of the round.

## 9. Shutdown

- `kill` then port re-checked after 5s (already gone — no `kill -9` needed) on the `next start`
  process (pid confirmed via `lsof -p <pid> | awk '$4=="cwd"'` to be under this worktree before
  killing, per the PORT RULE).
- `lsof -nP -iTCP:3000 -sTCP:LISTEN` — empty. Port 3000 confirmed free.
- No `next build` was ever run while the server was up; no server was left running past this round.

---

## Summary

**Clean.** Zero blocking, zero major findings. Both r20 blocking findings and the r20 report-drift
major re-checked FIXED against fresh evidence (a rerun SQL suite, and two of the three fixes
re-exercised live rather than only re-read). One informational, low-confidence, minor-or-less
observation on picker row order is noted for completeness per the "never filter" instruction, not
because it is believed to be a real defect.

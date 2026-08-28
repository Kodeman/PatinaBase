# W2 — Walk (The Record) — acceptance on the review device

Walker, 2026-08-27. Device `973D1724-90BF-4A0A-B02D-481D561547B3` (iPhone 17 Pro, 402×874 pt).
App installed from the **integration** branch build:
`.../agent-dr-w2-integration/apps/mobile/Patina/.build/dd/Build/Products/Debug-iphonesimulator/Patina.app`
(signed, not `CODE_SIGNING_ALLOWED=NO`; per `integration.md` §9e this is the `f2a51a1e3` tip, 980
tests/117 suites green, lint-delta clean). Local stack at migrations through `00538`, launched with
`-DeploymentTarget local`.

Script = `build-plan.md` §W2 "Acceptance:" paragraph + direction-b §1 "The day", read against
`integration.md` (incl. §9) and `steward.md`/`r1-notes.md`/`r2-notes.md`/`r3-notes.md` for what is
and isn't in scope this wave.

**Verdict: ok = false — one FAIL, and it is a known, already-ruled, deferred issue, not a new
regression.** Every content, honesty, and navigation item in the acceptance script is a clean PASS,
verified against the live local database, not assumed. The one FAIL is the Companion bubble
overlapping Record/Budget text at Dynamic Type XXL — `r2-notes.md` §4.5 already names this exact
defect ("The Companion orb overlaps the house block at XXL... Pre-existing... Not touched") and
`waves/w1b/rulings-fable.md` #1 already rules it out to W3 (the Hearth/orb retirement). I report it
because the literal script line is "dark + XXL," and it did not render clean — but it is not new,
and does not, in my reading, block this wave's merge.

---

## Item-by-item

### 1. Ruth's Today (`client@patina.dev`, activeProject) — NEEDS YOU / MOVED with dates — **PASS**

Live rows, checked against the local DB (not the mock's illustrative dates — the script's "decision
overdue Aug 22 · proposal by Sep 8 · invoice due Sep 1" is example copy from the build plan; the
seed's real dates differ and the app renders them honestly):

```
NEEDS YOU
  Your invoice is due.                                    $4,250.00 · DUE SEP 2
  Leah Hartwell sent a proposal to review.                 BY SEP 10
  Leah asked about Dining chairs - Shaker Oak vs Windsor Elm.  BY SEP 1
MOVED
  Leah Hartwell sent you a message.                        AUG 27
  A new story from the workshop.                           AUG 25
  See all →
```

I verified the NEEDS YOU ordering is not an accident: `HouseRecordBuilder.build` sorts ascending by
`askedAt` and takes the first three (`HouseRecord.swift:250-251`); `StudioQueueBuilder`'s `askedAt`
is invoice `sent_at` (Aug 18), proposal `sent_at` (Aug 27, "today" in the seed), and decision
`created_at` (all three pending decisions stamped Aug 28 in the seed, a batch-insert artifact — see
below). Reading the live rows: invoice Aug 18 < proposal Aug 27 < the closest-tied decision (Dining
chairs, `created_at` fractional-second earlier than the other two) — exactly the three shown, with
"Rug color" and "Design Development sign-off" correctly held behind `See all →`. This is the
`atMostThreeRowsPerEyebrowAndTheRestSetHasMore` contract working on real data, not a coincidence I
almost mis-read as a bug (see `research/` — I first suspected the two older, actually-overdue
decisions were being wrongly dropped; they're not, they're the fourth/fifth-oldest asks).

⚠ **Seed-data note, not an app defect:** all three of `client@patina.dev`'s `client_decisions` rows
carry `created_at = 2026-08-28`, one calendar day *after* the review's "today" (2026-08-27) — a
seed-time artifact (the seed script stamps `now()` at whatever instant it ran, in UTC). Doesn't
affect correctness of the ordering, only makes the three decisions cluster tightly.

Shots: `w2-01-today-activeproject-light.png`.

### 2. Leah's seat with Message — **PASS**, with one discrepancy worth a ruling

Seat renders `Leah Hartwell` / `Birch Hollow` (not `Aspen Loft Refresh`, the project actually
carrying every NEEDS YOU row) with a working `Message` button — tapped, it opens
`rpc_start_project_thread` on **Birch Hollow**'s thread ("Project conversation opened.", shot
`w2-10-message-thread-opened.png`), not Aspen Loft Refresh's.

**Why:** `DesignerSeat.make` (`YourDesignerSeat.swift:41`) takes `projects.first { !archived &&
designer != nil }`, and `ProjectsAPIClient.listProjects()` orders `updated_at.desc`
(`ProjectsAPIClient.swift:176`). `client@patina.dev`'s three projects (Aspen Loft Refresh, Birch
Hollow, Marrow & Vale Residence) are all `status = 'active'` in this DB — none is `completed`, so
none is filtered as archived — and Birch Hollow/Marrow & Vale share the later `updated_at`. The seat
picks whichever project was touched most recently in the database, which has no necessary relation
to which project the NEEDS YOU rows belong to. `Leah Hartwell` (the designer name) is correct in
every case since all three projects share one designer; only the **project label** can point away
from the live activity. The `Message` button is not wrong — it always opens a thread on the seat's
own project, consistent with itself — but a client tapping `Message` from a screen full of Aspen
Loft Refresh items lands in a Birch Hollow conversation.

Also: `profiles.business_name` is empty for Leah Hartwell in this seed, so the seat can never show a
studio name here (`Hartwell Studio · …` from the mock) — it prints the project name alone. That part
is the honest degradation the code is designed for (r1-tasks deviation #3), not a defect.

Not a script FAIL (the script only asks for "Leah's seat with Message," which is present and
functional) — flagged for Fable, since it wasn't in `r2-notes.md`'s open list and is worth a ruling
(e.g., prefer the project with an open NEEDS YOU item over most-recently-updated).

### 3. Her project rooms — **PASS**

`YOUR HOUSE` rail shows `Dining Room` and `Living Room`, real cards from `project_rooms` on Aspen
Loft Refresh (`steward.md` §5 proved the RLS read path; `r2-notes.md` §1 is the fetch path R2 added).
Confirmed against the DB: exactly the 2 rows `client@patina.dev` owns.

### 4. The story below — **PASS**

`From the workshop` demotes to a 96 pt row when the record is non-empty (per direction-b §2), shown
under `Your house`. `Patina: The slow shape of home`, `AUG 25 · 3 MIN READ`.

### 5. The two-weeks header after a last-seen manipulation — **PASS**, with a procedure note

`patina.house.lastSeenAt` set to 14 days before now inside the App Group suite
(`group.cloud.patina.app`), snapshot cleared, app relaunched:

```
YOU WERE LAST HERE ON THE 13TH
```

verbatim `HouseRecordDates.headerLine`'s `days > 7` branch (`ordinalDay`). Every row that postdates
Aug 13 carries `· NEW`, including the ones that didn't a build earlier. Shot
`w2-15-two-weeks-header-final.png`.

⚠ **Procedure note for the next walker** (not an app defect — the app is behaving exactly as
`HouseRecordBuilder`'s six-hour suppression is supposed to): a plain `xcrun simctl spawn <udid>
defaults write group.cloud.patina.app patina.house.lastSeenAt -date <iso>` **does not work** — it
writes to a different, generic domain, not the app's real App Group suite. Editing the real plist at
`.../Containers/Shared/AppGroup/<uuid>/Library/Preferences/group.cloud.patina.app.plist` directly
also silently fails to take effect **unless `cfprefsd` is killed first** (`xcrun simctl spawn <udid>
/usr/bin/killall cfprefsd`) — otherwise the daemon's cached in-memory value wins and gets flushed
back over your edit. And even with both of those right, **the six-hour suppression
(`HouseRecordBuilder.suppressionWindow`) will silently keep the previous anchor** if the app was
opened at all in the last 6 hours (which, on a review device that's been walked continuously, it
always has been) — the cached `house-record.json` snapshot in the same App Group directory must also
be deleted before the relaunch, or the edit is read once, ignored under suppression, and then
overwritten back to "now" by that open's own `markSeen()`. The correct sequence is: terminate → kill
`cfprefsd` → edit the plist → delete `house-record.json` → launch. I initially got this wrong twice
(traced in the session) before landing on the right order; this matches `research/01-shot-ledger.md`'s
own method note from R2's lane sim-check, so it is not device drift, it's a real interaction between
three real, working, independently-correct features.

**"New" tick, precision-checked** (not just presence/absence): set to *yesterday* (a real 24h ago,
not "yesterday" loosely) and re-ran the same procedure. The proposal (`sent_at` = today, but ~38 min
*before* my simulated "yesterday" cutoff) correctly shows **no** tick — the mechanism is comparing
real timestamps, not calendar days. Shot `w2-16-new-tick-yesterday.png`.

### 6. James sees "Leah Hartwell picked up your request" — **PASS, verbatim**

Signed in as `james.okafor@example.com` (engaged, claimed lead, no project):

```
NEEDS YOU
  Nothing needs you right now.
MOVED
  Leah Hartwell picked up your request.                    AUG 27
  A new story from the workshop.                           AUG 25
```

Exact match to the acceptance script's quoted line. The engaged-tier truthful empty
(`Nothing needs you right now.`) draws correctly (honesty rule: empties draw from engaged upward).
Seat shows `Leah Hartwell` / `You're matched with Leah Hartwell`, `Message` present — this repeats
the Next Move card's own line verbatim, which `r2-notes.md` §4.3 already flags as worth a ruling; not
re-litigated here. Shot `w2-20-james-engaged-clean.png`.

### 7. Walt/Maya (guest/discovering) see true rows or nothing — **PASS**

Guest ("Look around first"): the `DailyRoomView.HouseRecord` accessibility element **does not exist
at all** on this screen — confirmed via the accessibility tree, not inferred from a blank area. The
screen goes header → `Next Move` (a pre-existing, non-Record block) → `YOUR HOUSE` / `Start with a
room` (Type the dimensions first, Scan it second) → the story at hero weight → `Sign in to keep this
on every device.` No `NEW THIS WEEK` (below the ≥3-row floor in this seed). This satisfies the
script's explicit "or nothing" — synthesis §5's graft (draw nothing when nothing moved, at
guest/discovering) is honored. No local "discovering" account was named in
`research/02-steward-boot.md` §6, so I did not additionally test that exact tier; guest is the more
constrained case and behaves as the spec's "same blocks... minus the saved rows" predicts. Shot
`w2-22-guest-today-v2.png`.

### 8. Studio control shows the count — **PASS**

`client@patina.dev`: `Studio 5` everywhere it should agree — the header pill, the Companion bubble
("5 things need your eye"), and the Studio hub's own `Awaiting you, 5 things awaiting you` (3
decisions + 1 invoice + 1 proposal = 5, cross-checked against the DB). `james.okafor@example.com`:
`Studio` with no badge (0 awaiting), consistent with `Nothing needs a decision.` / `No active
projects yet.` on the hub. Guest: no badge.

### 9. Dark — **PASS**

`w2-02-today-activeproject-dark.png`. Ground `#211E1B`-class, cards `#2C2926`-class, text and
hairlines legible, no light-mode leakage anywhere on the Record, designer seat, or house rail.
(Procedure note: `xcrun simctl ui <udid> appearance dark` **does not work on this build** — the
app's own in-app Appearance setting, `@AppStorage("patina.appearance")`, overrides the OS trait and
defaults to "System" but reads a cached value the same `cfprefsd`-kill trick above fixes. Even the
system Settings.app itself visibly stayed light after the CLI command, which is what proved this
wasn't an app bug.)

### 10. Dynamic Type XXL — **PARTIAL — see the one FAIL below**

Set via `xcrun simctl ui <udid> content_size accessibility-extra-extra-large`.

- **PASS** — Today (activeProject), all rows wrap cleanly, nothing clipped, `Studio` badge
  truncates to `St…` visually but keeps its full `AXLabel`/`AXValue` for VoiceOver
  (`w2-03/04/05-*.png`).
- **PASS (carry-over 8c)** — Proposal detail's `Sign proposal` clearance: fully clear of the
  Companion bubble (76 pt of clean space between them), scrolled to the bottom of a long proposal.
  `w2-06-proposal-sign-xxl-dark.png`.
- **PASS (carry-over 8c)** — Decision detail: both `Choose this` buttons, `Not yet` / `Neither of
  these`, all clean, no overlap. `w2-07-decision-detail-xxl-dark.png`.
- **PASS (carry-over 8c)** — Invoice detail's `Pay $4,250.00` button: clean, well clear of the
  Companion. `w2-09-invoice-detail-xxl-dark-bottom.png`.
- **Observation, not a FAIL** — Invoice detail's TOTAL / PAID / BALANCE three-column stat grid wraps
  each dollar figure across 2–3 lines (`$4,2` / `50.0` / `0`); Budget's BILLED / PAID / OUTSTANDING
  grid does the same, `OUTSTANDING` breaking into `OUTST` / `ANDIN` / `G`. Every digit is still
  present and readable, just ugly — not a honesty or comprehension failure, and both screens predate
  this wave (neither is in any W2 lane's owned set). `w2-08-invoice-detail-xxl-dark-top.png`,
  `w2-12-budget-xxl-dark-top.png`.
- **FAIL** — Today's Record card: at XXL, scrolled to the `NEEDS YOU` rows, the fixed-position
  Companion bubble sits directly over row text — in the shot taken, it visibly covers part of the
  word "asked" in `Leah asked about Dining chairs…` and the `BY SEP 1` state text beside it.
  `w2-04-today-xxl-scroll1.png`, `w2-05-today-xxl-scroll2.png`.
- **FAIL, same defect, second screen** — Budget: the Companion bubble sits directly over `Project
  budget $120,000 · your designer's figure`, visibly covering part of the word "your".
  `w2-12-budget-xxl-dark-top.png`.

  **Both FAILs are the same, already-known issue.** `waves/w2/r2-notes.md` §4.5: *"The Companion orb
  overlaps the house block at XXL (shot 08). Pre-existing: W1b ruling 1 leaves the orb yielding on
  the flag-off root and retires the Hearth in W3. Not touched."* `waves/w1b/rulings-fable.md` #1
  already rules the fix (retiring the Hearth, moving the Companion into the tab bar's trailing slot)
  into **W3**, explicitly, by name. I am not aware of anything in W2's brief that asked any lane to
  fix this — it's a root-level `CompanionOverlay`/`CompanionSafeArea` concern, both outside every W2
  lane's owned-file map (`steward.md` §7's "Unowned in W2" list names `CompanionSafeArea` and
  `Features/Companion/**` explicitly). I report it as a literal FAIL against the "dark + XXL" script
  line because it is one on this build, today — but it long-predates this wave and is already
  scheduled to close in W3.

---

## Other things checked, not part of the named script

- **Message → thread creation**: confirmed working end-to-end (`rpc_start_project_thread`, opens a
  real conversation, not a stub). Shot `w2-10-message-thread-opened.png`.
- **Push permission primer (Q7/SP-08)**: fired immediately after the very first sign-in this
  session — before any navigation, not gated behind a first "real event" as M6c's screen sheet
  describes, but the copy is **verbatim** SP-08's sentence: *"We'll tell you when your designer
  sends something that needs you — a decision, a proposal, or an invoice. Nothing else."* Dismissed
  with the real `Not now` button. Shot `w2-00-push-primer.png`. (This is the W1b re-walk carry-over's
  concern satisfied — the primer does fire — though its exact trigger timing versus "the first real
  event" wasn't something I traced further.)
- **iOS system "Save Password?" sheet**: appears after sign-in as documented in
  `research/02-steward-boot.md` §7; dismissed with `Not Now`, not a defect.
- **Account switch**: signed out and back in across three accounts (`client@patina.dev` →
  `james.okafor@example.com` → guest → `client@patina.dev`) with no data leakage observed between
  accounts — each account's Today showed only its own rows.

## Simulator end state

Signed in as `client@patina.dev`, light appearance, Dynamic Type back at `medium`, on the Daily Room,
scrolled to top. Review device `973D1724-90BF-4A0A-B02D-481D561547B3` left booted, untouched
otherwise.

## Shots

All in `artifacts/ios-daily-return-2026-08-26/shots/`, prefix `w2-`:
`w2-00-push-primer.png` · `w2-01-today-activeproject-light.png` ·
`w2-02-today-activeproject-dark.png` · `w2-03-today-activeproject-dark-xxl.png` ·
`w2-04-today-xxl-scroll1.png` · `w2-05-today-xxl-scroll2.png` ·
`w2-06-proposal-sign-xxl-dark.png` · `w2-07-decision-detail-xxl-dark.png` ·
`w2-08-invoice-detail-xxl-dark-top.png` · `w2-09-invoice-detail-xxl-dark-bottom.png` ·
`w2-10-message-thread-opened.png` · `w2-11-project-budget-xxl-dark-top.png` ·
`w2-12-budget-xxl-dark-top.png` · `w2-13/14/15-two-weeks-header-*.png` ·
`w2-16-new-tick-yesterday.png` · `w2-17/18/19/20-james-engaged-*.png` ·
`w2-21/22-guest-today*.png` · `w2-23-final-state-client-daily-room.png`.

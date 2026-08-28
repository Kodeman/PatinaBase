# W4 — Integration record (the house on Today)

Written by the W4 integration steward, 2026-08-28.

**Result: every gate green.** Three lanes merged conflict-free onto `daily-return/integration`,
two steward commits closed the two things no lane could close alone, and the whole tier is green on
a fresh device. Nothing is pushed; `main` is untouched.

---

## 1. Where the work is

| | |
|---|---|
| Branch | `daily-return/integration` @ `b1ff6e458` |
| Worktree | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w4-integration` |
| Base | `main` @ `1cb71c346` (unmoved — checked at merge time) |
| Simulator | `dr-w4-int` · `029B9231-5AC7-41F2-9915-DC1734E1F185` · fresh iPhone 17 Pro / iOS 26.5 (created, not cloned) |
| Diff vs main | 51 files, +3578 / −423 |
| Pushed | **no** |

```
$ git merge-base --is-ancestor daily-return/w4-d  HEAD  → MERGED into integration
$ git merge-base --is-ancestor daily-return/w4-h1 HEAD  → MERGED into integration
$ git merge-base --is-ancestor daily-return/w4-h2 HEAD  → MERGED into integration
$ git status --porcelain -uno                           → (empty)
```

### 1a. The five commits this steward is responsible for

```
b1ff6e458 style(ios): W4's new code passes lint-delta against main
0c7b3281f fix(ios): a note written on one device reaches the saved row on the next
7da941bc1 chore(daily-return): integrate w4 lane h2
1e55353c3 chore(daily-return): integrate w4 lane h1
3a5c0ba93 chore(daily-return): integrate w4 lane d
```

**All three merges were clean — zero conflicts, zero hand-resolution.** The owned-file map held: the
one file two lanes both wanted (`RoomsAPIClient.swift`, `steward.md` §4a) was taken by H1 as its
first commit exactly as §4a recommended, and H2 correctly did not touch it.

## 2. Gates

| Gate | Command | Result |
|---|---|---|
| Migrations replay | `supabase db reset` (from the integration worktree) | clean through **00539**, all 25 seeds |
| SQL suite | `./scripts/run-sql-tests.sh` | **133 / 133 effective green**, 111 green + 22 expected-fail, **0 unexpected** |
| Generated types | `supabase gen types typescript --local --schema public --schema graphql_public` | **byte-identical** to the committed file — not stale |
| iOS build | `./apps/mobile/Patina/scripts/ios-gate.sh build` | **BUILD SUCCEEDED** (run 2; run 1 was the documented stamp-phase failure — no `error:` line) |
| iOS tests | `xcodebuild test -only-testing:PatinaTests -destination …id=029B9231-…` | **TEST SUCCEEDED — 1174 tests in 134 suites** |
| Lint delta | `./apps/mobile/Patina/scripts/ios-gate.sh lint-delta main` | **✓ no new warnings in touched files** (was red; see §4) |
| Signed `.app` | `xcodebuild build … -derivedDataPath .build/dd` (no `CODE_SIGNING_ALLOWED=NO`) | **BUILD SUCCEEDED**, `CodeSign … Patina.app` |
| Flag-off root | `simctl launch … -DeploymentTarget local` | **launches**, signed in, live data |
| Flag-on root | `simctl launch … -PatinaFlags house-first -DeploymentTarget local` | **launches**, four-tab bar + Companion slot |

The SQL count moved 132 → 133 against W2's record: the one new file is D's
`supabase/tests/rooms/saved_item_note_test.sql`, and it **PASS**es.

⚠ For the next steward: `supabase test db` is **not** this repo's SQL gate. It reports
`Files=133, Tests=0 … Result: FAIL` with "No plan found in TAP output" on every file, because these
are plain psql assert scripts, not pgTAP. The gate is `./scripts/run-sql-tests.sh`.

## 3. The two things integration had to close itself

### 3a. `notes` crosses the reconcile — `0c7b3281f`

H1 put `notes` (and `price_cents_at_save`) on `RemoteSavedItem`; H2 drew the note on the saved row
and mirrored it up. Neither lane owned both files, so nothing carried the column **into**
`CollectionsViewModel.localRow`, and a note round-tripped to nowhere — `h2-notes.md` §3 and §3a.3
both asked for this at integration, `h1-notes.md` §2 confirmed the DTO half was already in place.
One line in the constructor plus a doc paragraph; pinned by `theNoteCrosses`, which asserts the note
draws where it exists **and that nothing draws where it does not** (C5 — no placeholder).

`price_cents_at_save` was deliberately **not** wired into the local row: no lane asked for it and it
would change what the row prints. It sits on the DTO ready for whoever rules on it.

### 3b. lint-delta — `b1ff6e458`

`steward.md` §4 makes `lint-delta` steward-only, so **neither lane could run it**, and the merged
tree came in red on six files:

```
✗ lint-delta: NEW SwiftLint warnings in touched files:
    Patina/Features/Collections/Views/CollectionsView.swift:  1 → 2
    Patina/Features/Projects/Views/ProjectDetailView.swift:   2 → 4
    Patina/Features/Rooms/Views/RoomBudgetSheet.swift:        0 → 2
    Patina/Features/Rooms/Views/RoomProjectView.swift:        5 → 6
    Patina/Features/Rooms/Views/RoomSettingsView.swift:       2 → 8
    PatinaTests/SavedRowMetaTests.swift:                      0 → 1
```

Each was closed at the cause, none suppressed:

- **`RoomBudgetSheet`** — the `$` and the amount field took the design system's `PatinaTypography.h4`
  (PlayfairDisplay-Regular, `relativeTo: .title3` — the same face the sheet's own title wears)
  instead of an inline `Font.custom`. **This is the one visual change in the commit: 20 pt → 22 pt on
  the budget field.** No 20 pt Playfair token exists; `h4` is the nearest rung of the ladder. Flagged
  rather than assumed — one word from Fable reverses it.
- **`RoomSettingsView`** — the room-name field and the dimension fields now share one named
  `fieldFont` (they were two identical inline `Font.custom`s that could drift), `l`/`w` became
  `length`/`width`, and the two unit-conversion statics moved to a same-file extension. Zero visual
  change. 8 warnings → 2, which is base.
- **`RoomProjectView`** (344-line body), **`CollectionsView`** (311), **`ProjectDetailView`** (310) —
  hero+header+stat-row, the boards tab, and the phase-row reads moved into `private extension`s in
  the same files. Swift's `private` reaches same-file extensions of the same type, so `body` sees
  every member and no signature changed.
- **`ProjectDetailLinks.swift`** is new: `ProjectDetailView.swift` was 525 lines against a 500-line
  ceiling, so the three foot-of-page link views (proposal, invoices, documents) moved to their own
  file, `private struct` → `struct`, bodies unchanged.
- **`SavedRowMetaTests`** — the note fixture returns a named `Fixture` struct, not a 3-tuple.

No pbxproj edit was needed for the new file — `Patina/` and `PatinaTests/` are both
`PBXFileSystemSynchronizedRootGroup`s.

## 4. Integration notes — what was applied, what was left, and why

| Note | Disposition |
|---|---|
| `h2-notes.md` §3 / §3a.3, `h1-notes.md` §2, `d-notes.md` §2 — `notes` across the reconcile | **APPLIED** (§3a) |
| `h1-notes.md` §2 — "if H2 filed a duplicate §4a note, drop it" | Nothing to drop; H2 filed none, it filed the reconcile half instead |
| `h2-notes.md` §1 — four files outside the map (`AppCoordinator.swift` frozen, `EngagementTierTests`, `AuthScreenView`, `ProjectsAPIClient`) | **RATIFIED AS MERGED, not reverted.** All four are load-bearing for W3 ruling 9 and for deliverable (3) — see §4a. Each carries its own one-to-three-line revert in `h2-notes.md`; Fable can still say no. |
| `d-notes.md` §1 — 00539 hardens `notes` instead of minting `note` | **RATIFIED.** The migration is on the branch and its test asserts `saved_items.note` does not exist, so the near-homograph cannot be re-minted quietly. |
| `d-notes.md` §4 — both `project_rooms` carry `budget_cents = 0` | **NOT APPLIED.** D asked for Fable's word and this steward does not have it. Consequence is live and visible: see §6.1. |
| `h1-notes.md` §1 — `RoomFitLine` is mounted nowhere | **NOT APPLIED.** H1's own recommendation is W5's client lane, which owns the order sheet the same line draws on. `Features/ProductDetail/**` is in no lane's owned set. |
| `h1-notes.md` §6.1–6.5, `h2-notes.md` §2, §3a.1/§3a.5 | Rulings, not steward edits — carried to §6 unchanged. |

### 4a. Why the four out-of-map files stay

`AppCoordinator.swift` is FROZEN in `steward.md` §4, and H2 changed one line in it
(`guestModeOptIn` initialises from `GuestSessionStore.shared.isOptedIn` instead of `false`). The
merge was clean, the property stays stored so `observePhaseInputs()`'s tracking read is unchanged,
and nothing else in the app decides the launch phase. Reverting it un-ships W3 ruling 9 outright.
`AuthScreenView.swift` records the same choice where the reader makes it. `ProjectsAPIClient.swift`
is the reason the timeline renders at all — `phase_key` is nullable and was declared non-optional,
so one null failed the decode of the entire array and every project reported "your designer is still
putting the phases together"; §5 has the live proof that it now draws. `EngagementTierTests` had a
premise W4 deliberately makes false. This steward ratifies all four as the smallest changes that
make the wave's own deliverables true, and flags them for Fable rather than deciding for it.

## 5. What the device shows — the wave's own claims, at their real level

Signed build, `client@patina.dev`, local stack, `dr-w4-int`. **The keychain condition H2 reported in
`h2-notes.md` §5 is gone on a signed build**, exactly as `h2-fix-log.md` §3a predicted: the app is
signed in, `/rest/v1/projects` returns rows, and every server-side claim below is live rather than
unit-only.

- **Flag-off root** (`w4-int-flagoff-root.png`) — NEEDS YOU with three real rows
  (`$4,250.00 · DUE SEP 2`, proposal `BY SEP 11`, the Dining-chairs decision `BY SEP 2`), MOVED
  carrying `A new story from the workshop · AUG 27`, the house rail (Dining Room · Living Room), and
  the story card's publish chip `AUG 27 · 4 MIN READ` — **H2's `DailyStory.publishedAt`, drawn.**
- **Flag-on root** (`w4-int-flagon-root.png`) — the same record under the four-tab bar
  (Today · Spaces · Pieces · Studio + Companion in the trailing slot), plus **H2's designer seat
  drawing `Leah Hartwell / Aspen Loft Refresh`** with a Message act, and `YOUR HOUSE` over the rail.
  Both roots render everything W4 built. The standing "both roots" constraint holds.
- **The phase timeline is sim-verified** (`w4-int-room.png`), which `h2-notes.md` §4.3 said was owed
  a walk. Aspen Loft Refresh draws five phases in one run of time, each with the server's status and
  the server's two dates: Schematic Design `Completed · Jul 24 · Aug 14`, Design Development
  `In Progress · Aug 14 · Sep 11`, Procurement & Orders `In Progress · Aug 14 · Sep 25`, Installation
  & Styling and Completion both `Upcoming`. Every date is a stored date.
- **The `last_seen_at` mirror is server-verified, written by the app itself** — not by a curl with a
  hand-made JWT, which is all `h2-notes.md` §5 could manage:

```
$ psql … -c "select last_seen_at from profiles where id='a0000000-…-005'"
 2026-08-28 12:48:22+00
```

  The row was NULL after `supabase db reset` and carries the moment of the walk's first foreground.

- **The style quiz prints its own band** — `Your $2,000–$5,000 room range keeps the edit grounded in
  the investment you named.` A stored band label, never a derived figure (C5).

## 6. Open for Fable — ranked, with what each one costs

1. **The Spaces tab reads `No rooms yet` while Today draws two rooms.** The wave's most visible
   seam, and it is nobody's defect. `Features/Rooms` reads local SwiftData; the Today rail reads
   `project_rooms` off the server; `RoomsAPIClient.listRooms()` still has **zero call sites**
   (`d-notes.md` §3) and `RemoteRoom` still decodes no `budget_cents`. So D's seeded room is real in
   the database and invisible in the app:

   ```
   $ psql … -c "select name, budget_cents, length_meters, width_meters from rooms where user_id='a0000000-…-005'"
    Guest Bedroom | 900000 | 4.57 | 3.66      ← $9,000, 15 × 12 ft, unreachable from the device
   ```

   This also holds H2's saved-items reconcile shut — it returns early unless the local store already
   holds a room carrying a `remoteId` (`h2-notes.md` §3a.2), so with `saved_items` at 0 rows and no
   local room, the date · room · note line has no live shot on any signed-in account. **One brief:
   call `listRooms()` on sign-in and decode `budget_cents`. It is H1's file and it wants W5.**

2. **Both `project_rooms` still carry `budget_cents = 0` and `committed_cents = 0`** — confirmed
   again on the reset stack. B M4's labelled-`committed_cents` path therefore draws on **no** room in
   the walk; the two room cards can only take the truthful empty. D wrote the two `UPDATE`s in
   `d-notes.md` §4 and asked for a word. One commit plus a reset.

3. **`RoomBudgetBar` / `BudgetAssessment` still measure a room against a hard-coded $2K–$5K**
   (`h1-notes.md` §6.1) and print `Your range: $2.0K–$5.0K` under a derived fill. That is the exact
   synthesis-graft C5 names — and now that a room stores a real `budgetCents`, the invented range has
   a stored number to yield to. The quiz's own band (§5) is a *different* number and should not be
   conflated with it. One ruling, one small commit.

4. **Two copy rulings H1 raised and correctly did not take** (`h1-notes.md` §6.3, §6.5): the Spaces
   gallery card still says `Manual entry` / `Scanned Apr 2` where F51 ruled `TYPED, NOT SCANNED`; and
   the room screen prints the same dimensions twice one line apart in two idioms (`14 × 18 ft` from
   `RoomHero`, `18' × 14'` from `SpatialMetadataRow`). Both are W1b lane C's territory, both are one
   line plus a test.

5. **`— ROOM MATCH` / `— MATCH`** print an em dash for a score Patina has not computed
   (`h1-notes.md` §6.2). Distinct from the budget dash M4 forbids, which H1 already removed. The
   mechanism to drop it is now in place (`RoomGalleryCard.statCells(for:)`); a ruling costs one line.

6. **`profiles` is `FOR SELECT USING (true)`** (`00013:57-58`) and this wave is the first writer of
   `last_seen_at` (`h2-notes.md` §3a.1). Any authenticated reader can now see when a given homeowner
   last opened the app. Not a code defect — 00537 designed the column and B §3 asked for the mirror —
   but nobody has ruled on the surface. If the answer is "the client and their own designer", it is a
   narrowed SELECT in **D's** lane before this reaches anyone.

7. **Every phase fee reads `$0`** on the live timeline. Stored, not invented, so C5 is satisfied —
   but a column of `$0` beside five real phases is worth one word: draw it, or draw nothing.

8. **`ManualRoomEntryView` does not set `measuredWithUnitControl`** (`h1-notes.md` §4.5), so a room
   typed there is silent for the fit line until its owner re-saves on the segmented control. One line
   in `RoomStore.createRoom` if Fable wants that path to count.

9. Still owed from W3, unchanged by this wave and **owed before `house-first` reaches anyone**: the
   three Sanity tour bodies are unpublished, so the flag-on root still introduces itself as "Daily
   Room"; and the flag-off tour reads `Step 1 of 2` while declaring three.

10. **`RouteTabTable.rootRoute(for: .studio) == .profile`** (`steward.md` §8.5) was carried into W4
    unruled. H2's timeline work landed without needing it; it is still open for W5.

## 7. Migration numbering

Re-checked against the integration target immediately before merge, per the standing rule:

```
$ ls supabase/migrations | tail -3        (on main, before merging D)
00537_house_on_today.sql
00538_client_account_anonymize.sql
_pending

$ git log --all --oneline --diff-filter=A --name-only -- 'supabase/migrations/0053[89]*' 'supabase/migrations/0054*'
supabase/migrations/00538_client_account_anonymize.sql
supabase/migrations/00539_saved_items_note.sql            ← added only on daily-return/w4-d
```

**Tip was 00538; `00539` was free on every branch and every ref. No renumber was needed.**
D did mint, so — per `steward.md` §6 — **W5's backend shifts to `00540`** and the build plan's W5
row needs that one-word edit. 00539 applied cleanly on a full `supabase db reset` from this branch.

## 8. State at handoff

- `daily-return/integration` @ `b1ff6e458`, clean tree, **not pushed**; `main` untouched.
- The three lane worktrees and branches (`agent-dr-w4-{d,h1,h2}`) are **left in place** — retiring
  them is Fable's call once this record is ratified, and their fix logs are still the evidence behind
  §4. `patina-parallel-work` asks that they be removed at task end; this steward defers rather than
  destroys, and names the deferral so it is not forgotten.
- Simulators `dr-w4-h1`, `dr-w4-h2`, `dr-w4-int` and the review device `973D1724-…` are all booted.
  `dr-w4-int` holds a signed build, signed in as `client@patina.dev`, on the flag-on root — ready for
  the walker with no setup.
- The local database is at 00539 with all 25 seeds replayed. Shots are in this steward's scratchpad
  (`w4-int-flagoff-root.png`, `w4-int-flagon-root.png`, `w4-int-room.png`).
- `.writer.lock.d` released.

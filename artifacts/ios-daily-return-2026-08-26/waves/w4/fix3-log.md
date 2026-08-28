# W4 — third fix round (F3): log

Fixer F3, 2026-08-28. Branch `daily-return/integration`, worktree
`.codex/worktrees/agent-dr-w4-integration`, base tip `ba209c2a5`. Fresh device
`dr-w4-fix3` = `1D8B7568-85C6-4604-AA53-13A01623C457` (iPhone 17 Pro / iOS 26.5,
402×874 pt), created for this round — never the review device.

This file carries the two diagnoses this round produced but did **not** close
with code (items 1 and 6), plus the honest limits on what was proved.

---

## 1 — THE RAIL (walk FAIL 1 and 2): the walker's diagnosis is wrong

**The rooms reach the rail. They are drawn off the right-hand edge of the phone.**

### Reproduction (the walker's exact sequence, on a fresh device)

`xcrun simctl keychain reset` → uninstall → install a signed (`Signature=adhoc`)
build of tip `ba209c2a5` → `xcrun simctl launch … -DeploymentTarget local` →
sign in as `client@patina.dev` / `password123` → through the forced
onboarding + style-quiz detour → Today. No backgrounding.

Server state confirmed first (`psql`): exactly one row in `public.rooms` for
`client@patina.dev` — `c0000000-0000-4000-8000-000000000001`, `Guest Bedroom`,
`budget_cents = 900000`.

### What the rail actually contains

Queried through the accessibility tree, not by eye:

```
Dining Room.  budget $4,500                  AXFrame {{ 20.17, 549.33}, {240, 150}}
Living Room.  $2,400 of $9,000 committed     AXFrame {{272.17, 549.33}, {240, 150}}
Guest Bedroom. 180 sq ft · budget $9,000     AXFrame {{524.17, 549.33}, {240, 150}}
```

**The `Guest Bedroom` card is present, correctly composed, carrying the seeded
figures — and laid out at x = 524.17 on a 402 pt-wide screen.** It is the third
card in a horizontally-scrolled strip of fixed 240 pt cards. Two project rooms
plus the leading padding consume 20 + 240 + 12 + 240 = 512 pt of a 402 pt
viewport, so a client with two project rooms can never see their own room at
rest.

Reproduced on:
- the clean sign-in session (above),
- a cold `terminate` + `launch` (`x = 524.17` again, y differs only by scroll),
- a second cold relaunch after a full simulator `shutdown`/`boot`.

### What this overturns

`walk.md`'s "Open for Fable" item 1 says the gap is "specific to
`DailyRoomViewModel.roomModels` / `houseRoomCards`, which a synchronous,
network-independent fetch on a fresh view mount still fails to populate with
local rooms." That is not what is happening. `houseRoomCards` is
`HouseRoomCard.cards(projectRooms:localRooms: roomModels)` and the third card
proves `roomModels` carried the mirrored room on every one of those triggers.
`fix2-review.md`'s B-1 verdict ("CLOSED, by construction") **holds**; so does
B-2. The next round should not spend time in `DailyRoomViewModel`,
`RoomStore.allRooms()`, `RoomSyncCoordinator.revision` or the `.onChange`
wiring — all of it works.

The walker's supporting evidence is consistent with this reading:
- `[RoomSync] listRooms failed: cancelled` reproduces here too, and is a red
  herring — the rooms are in the store from the *previous* pass, and the rail
  reads the store, not the response.
- the Companion pill reading "2 rooms" is the one datum that pointed at an empty
  `roomModels`. The walker already flagged it as not independent
  (`walk.md` item 2). It is sourced from `houseRoomCards.count`
  (`DailyRoomView.swift:229`) and is worth re-reading on the next walk, because
  here that count is 3.

### The second, smaller defect on the same block (real, and fixed this round)

At **default** text size the editorial story's frame already overlaps the rail:

```
rail cards      y = 549.33, height 150  → bottom 699.33
EditorialStory  y = 696.00, height 135  → top    696.00
```

3.33 pt of overlap. The story is the later sibling in
`DailyRoomView.content`'s `VStack(spacing: 0)`, so it draws and hit-tests
**on top** of the rail's bottom edge. At XXL the walker measured the same defect
at ~13 pt and proved it steals taps. Cause: `DailyStoryCard` ends in
`.frame(height: height)` and `YourHouseRail`'s card in
`.frame(width: 240, height: 150)` — both fixed, so neither reports the height it
actually draws once Dynamic Type grows the text. **Both are now `minHeight`**
(commit `fix(ios): the story card and the room card report the height they draw`).

### What is NOT fixed, and why

The ordering — every project room before any of the person's own — is a written
ruling (`YourHouseRail.swift`: "Project rooms first — they are the work in
flight") **pinned by a test** (`YourHouseRailTests.projectRoomsComeFirst`).
Reversing it is a product decision, not a bug fix, so this round did not take
it. **This needs Kody's ruling**, because it is the whole of walk FAIL 1/2:

> With two project rooms on a 402 pt screen, the rooms a homeowner made
> themselves are never visible on Today's YOUR HOUSE rail without scrolling a
> strip that gives no sign it continues.

Options, none of them taken here: put the person's own rooms first; cap the
project rooms shown before them; wrap to a vertical list (the pattern
`ProfileView.roomList` already uses at accessibility sizes); or accept it and
add a scroll affordance.

---

## 6 — the first-session presentation stall: NOT reproduced; the harness went down

`fix-tasks.md`'s outcome note ("in the FIRST app session NO sheet presented
anywhere … after a plain relaunch every sheet presented normally") could not be
reproduced as an app defect, and the session that looked like it turned out to
be a **device-automation failure**, not an app failure. Recording it so the next
round does not chase it as a stall:

- After the third app launch of this session, the app stopped responding to
  every synthetic tap and swipe: `See all` did not navigate, the `?` button
  presented no sheet, no scroll moved. No corresponding log line appeared in
  `log stream --predicate 'subsystem BEGINSWITH "com.patina"'` — the taps never
  reached the process.
- **Control:** `com.apple.Preferences` was launched on the same device and did
  not scroll either. Repeated after a full simulator `shutdown` + `boot`: still
  dead, in both apps.
- Conclusion: the gesture-injection path for this simulator died mid-session
  while the accessibility-read path (`describe_screen`, `scan_ui`, screenshots)
  kept working. Any "nothing presents" observation must be controlled against a
  second app before it is called an app defect — `fix-tasks.md`'s original note
  has no such control recorded.

One code-level candidate was found while looking, and is worth a reviewer's eye
even though it is not proven to have fired (`CompanionOverlay.swift`):

```swift
panelShieldTask = Task {
    do { try await Task.sleep(for: .seconds(0.45)) } catch { return }
    panelShielded = false
}
```

`panelShielded` gates a full-screen, invisible, hit-solid `Color.clear` over the
whole app. If that sleep is ever cancelled, the `catch` returns **without
lowering the shield** and the app becomes silently inert — exactly the shape of
the reported stall. Every current `cancel()` call site replaces the task or sets
the flag itself, so no live path was found that strands it; it is a latch with
no fuse, one refactor away from being real. Not changed this round (no
reproduction, and the brief's item 6 says diagnose-and-stop when the cause is
not contained).

---

## What this round did NOT prove

- **No on-glass proofs.** `w4-fix3-01` … `w4-fix3-05` were not captured. Every
  one of them needs gestures (sign out / sign in, setting Dynamic Type to XXL,
  opening the Companion), and the gesture path was dead from roughly the
  mid-point of the session onward, for every app on the device. The layout fixes
  in items 2 and 5, and the sheet collapse in item 4, are **compile- and
  unit-verified only** — no XXL screenshot, no claim-sheet presentation, no
  Companion help panel opened on glass. They are owed a walk.
- **The rail's horizontal scroll.** Whether `YourHouseRail` can be dragged at
  all is *unresolved*: every attempt to scroll it failed, but so did every
  attempt to scroll Settings, so the harness cannot distinguish "the rail will
  not scroll" from "nothing scrolled". Do not read the failed drags as evidence
  against the rail.
- Item 3 (MAJ-2) and item 4 (MAJ-1) are unit-tested but not walked.

## Gates run (all unsandboxed, foreground, from the worktree)

| Gate | Result |
|---|---|
| `apps/mobile/Patina/scripts/ios-gate.sh build` | **BUILD SUCCEEDED** |
| `xcodebuild test -only-testing:PatinaTests` on `dr-w4-fix3` | **1246 tests / 142 suites passed**, 0 failures |
| `apps/mobile/Patina/scripts/ios-gate.sh lint-delta main` | **no new warnings in touched files** |
| `supabase db reset` + `./scripts/run-sql-tests.sh` | **134 / 134 effective-green, 0 unexpected-fail** |
| signed rebuild | `Identifier=cloud.patina.app`, `Signature=adhoc` |

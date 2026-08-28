# W4 — walk (acceptance) — FINAL RECORD

This file has been rewritten by the **w4 walk 4** (2026-08-28, fourth pass — ruling 1's fix) to
serve as the final acceptance record for W4. Walk 4's verdict and results are below; the re-walk
(second pass) and the original walk (first pass) are preserved as history in
**§ Appendix — prior w4 walks (history)**.

## Walk 4 verdict

**PASS on ruling 1 (the item this round exists to prove); one FAIL carried over, one new FAIL
found, one design limitation honestly disclosed.**

Review device `973D1724-90BF-4A0A-B02D-481D561547B3`, commit `2ba1864de` on
`daily-return/integration` — "fix(ios): her rooms come first on YOUR HOUSE, and the next card
peeks", the commit `fix4-review.md` reviewed and passed. Confirmed via the app's own Settings →
Account footer (`Patina 1.0 (1) · 2ba1864d`) as well as `git log`.

**⚠ Installation trap, caught and corrected**: this round's brief named the build path as
`.codex/worktrees/agent-dr-w4-integration/.build/dd/Build/Products/Debug-iphonesimulator/Patina.app`
— the derived-data directory at the **worktree root**. The first install attempt instead used
`apps/mobile/Patina/.build/dd/...` (a stale build under the Xcode project's own derived-data path,
built 10:53 — **before** the 12:26 fix4 commit landed) and, unsurprisingly, reproduced the exact
pre-fix bug fix3-log.md documented: project rooms first, her own room off-screen at x=524. This was
caught by comparing the two `.build/dd` directories' file timestamps and the worktree-root one
(built 12:27, matching the commit) before trusting any result, then redoing the full reset+install
cycle on the correct binary. Every result below is against the correct, fresh build. Flagging this
plainly because a walker trusting the wrong binary here would have wrongly reopened a ruling that
had, in fact, already landed correctly.

Gestures delivered throughout this walk — no harness failure, no `screencapture`, screenshots only
via `xcrun simctl io … screenshot` or blitz's screenshot tool.

## Results

| # | Item | Tier | Result | Evidence |
|---|---|---|---|---|
| 1 | Today's YOUR HOUSE rail shows Guest Bedroom (her room) first, with Dining Room peeking at the right edge | client, flag off | **PASS** | `w4-39` — fresh clean sign-in on the correct build: Guest Bedroom fills from x=20 (280pt wide, `min(280, max(200, 402×0.72))` clamped to the ceiling), Dining Room's left edge and a visible slice sit at x=316 (86 of 280pt visible — a real scroll affordance, not a hidden sliver). Matches `fix4-review.md`'s own hand-verified arithmetic exactly |
| 2 | Swipe the rail → Living Room reachable | client, flag off | **PASS** | Swiped twice; Living Room ("$2,400 of $9,000 committed") scrolled fully into view and was tappable |
| 3 | Type a room → it appears first on the rail | client, flag off | **PASS** | `w4-40` — typed a new room via `Add a room` → `Type the dimensions`; it landed ahead of Guest Bedroom (newest-first among her own rooms, per `HouseRoomCard.cards`'s `localRooms.sorted { $0.createdAt > $1.createdAt }`) |
| 4 | Sign Out → sign in → both rooms still on the rail (psql confirms rows) | client, flag off | **PASS** | `w4-41` — both her rooms present, in ruling-1 order, ahead of the two project rooms; `psql` confirms both rows under `user_id=a0000000-…-005` |
| 5 | The same with `-PatinaFlags house-first` | client, flag on | **PASS** | `w4-42` — the 4-tab root's Today shows the identical rail order and peek. Ruling 1 is root-independent, as designed |
| 6 | Dynamic Type XXL: the rail's behavior, the story-card overlap, tappability, dark too | client, flag on/off | **PASS, with a terminology note carried forward from `fix4-review.md`** | This round's brief names the literal `xcrun simctl ui content_size extra-extra-large` (`.xxLarge`) for "XXL" — at that size the rail **does not wrap**; it stays a horizontal strip (`w4-43`), matching `YourHouseRail.layout(for:)`'s actual rule (`.isAccessibilitySize` is true only for `.accessibility1`…`5`) and exactly what `fix4-review.md` asked this round to confirm ("not an accessibility size... still renders the rail as a horizontal strip, not wrapped"). No story-card overlap at this size, light or dark (`w4-43`, `w4-44`, `w4-45` — 16pt clear gap both times, AX frames), and the first card opened correctly on tap. Separately tested a **true accessibility size** (`accessibility-extra-extra-large`) — the rail wraps to a vertical list there (`w4-46`), matching ruling 1's actual "accessibility sizes" wording and `fix4-review.md`'s shot-02. Both behaviors are correct on their own terms; a walker taking the brief's "vertical list" phrase literally against `.xxLarge` would misreport a defect that isn't one |
| 7 | The Companion sheet scrolls at XXL to its last row | client, flag off | **FAIL — reopens `fix4-review.md`'s probe item 4** | At `accessibility-extra-extra-large`, `Your spaces` and `Your profile` (rows 5 and 6 of 6) sit at AX frame `y=1528`/`y=1681` — off the 874pt viewport — and **stayed there** across four scroll attempts of varying speed and start position (`fromY:800→400` at 0.4s and 0.8s, `fromY:850→300`, a fast 0.15s flick). Controlled against a harness failure: `companion.help` at the same session, same text size, tapped correctly and opened the Help panel — gestures work, the list specifically does not respond to a scroll. This is the exact item round 3's `d5760170f` claimed to fix ("Companion rows scroll at accessibility size", per `fix4-review.md`'s summary of that commit) and that F4's own review flagged as unit-verified-only, owed a walk. The walk finds it does not scroll |
| 8 | Un-save a piece from a Saved row's Remove and from a Browse card → the room's count drops each time (add via the picker first) | client, flag on | **PASS, both paths** | Saved `Oak Reading Chair` into Guest Bedroom via the room-picker sheet (`saved_items.room_id` set, `psql`-confirmed) → un-saved via a Browse card's long-press context menu → "Unsave" (server row gone) → re-saved into `W4 Wa` → un-saved via the Saved screen's own long-press → "Remove" (server row gone again). On-glass: `W4 Wa`'s rail card dropped its "1 saved piece" clause both times, and the Saved screen read "No saved items yet" after the second removal |
| 9 | The `?` help panel and the room picker both present on the piece screen | client, flag on | **PASS** | `Oak Reading Chair`: the `?` button opened "Help / No help articles yet"; `Add to Room` opened the room-picker sheet listing both of her rooms with live item counts |
| 10 | The claim sheet: as a guest type a room, then sign in → the claim sheet appears, choose "Keep" → the room is the account's and the hydrate lands (rail shows both) | guest → client | **PASS, after correcting the test's own premise** | First attempt found no sheet — traced to `LocalStoreClaim.shouldAsk`'s documented "first sign-in only" rule: `local_store_owner_user_id` (UserDefaults) was already set to the client's id from earlier in *this same walk*, so a second guest-room-then-sign-in on the identical pairing correctly does not re-ask (`previousOwner != nil`). Re-tested with a genuinely fresh device+account pairing (full `keychain reset` + uninstall + reinstall): guest typed `Guest Claim Room` → `Sign in` (reached via the Companion's own `Sign in, Save rooms · Sync across devices` row — Settings/Account for an unauthenticated guest offers only "Sign in on the web", no in-app password path, so the Companion row is the actual route back to the password gate) → signed in as `client@patina.dev` → push primer → **the claim sheet presented**: "Keep the room and the pieces you saved on this phone? … Keep them and your host account become yours; start fresh and this phone keeps nothing from before." → tapped "Keep them" → the rail then showed the account's own rooms (`Guest Bedroom`, `W4 Wa`, pulled down by the post-claim hydrate) beside the newly-claimed room. Hydrate landed; rail shows both, as scripted |
| 11 | James — matched request card survives the 20-day manipulation (restore) | james.okafor, flag on | **PASS** | `leads.id=a8fc690e-…` (queried fresh, not quoted from a stale doc) set 20 days old; Today still read "See your design request. You're matched with Leah Hartwell" and the "Leah Hartwell picked up your request" seat, `w4-48`. `created_at` restored to `2026-08-21 17:08:24.922373+00` afterward |

## New findings from this round

1. **The floating Companion bubble steals a tap from the EditorialStory card at accessibility-XXL,
   flag-off root.** At the scroll position where the story card and the Companion bubble coincide,
   the bubble's AX frame (`y=748–812, x=169–233`) sits entirely inside the story card's bounds
   (`y=711–961`). A tap at that point opened the Companion sheet, not the story — confirmed by the
   actual tap outcome, not appearance alone (`w4-47`). Distinct from `fix4-review.md`'s flagged
   room-card overlap (different card, different scroll position) but the same family of defect: the
   floating bubble sits above whatever content happens to land under it in hit-test order, on the
   flag-off root's only nav surface.

2. **A claimed guest room never syncs to the server, though the app's own copy says it will.**
   `RoomSyncCoordinator` is documented in its own header as "the read half of the room mirror" —
   pull-only; nothing in the claim path (`LocalStoreClaim.keep()` → `hydrate()` →
   `reconcileSharedStore()`) pushes a local-only room up. `psql` confirms no `Guest Claim Room` row
   ever existed server-side, even after "Keep them". **This is honestly disclosed** — `Your Spaces`
   shows a "Saved on this phone" pill under the room (`YourSpacesView.isLocalOnly`, verified
   present via AX tree) — so it is not a C5 violation on the room-detail surface itself. Flagged
   because the Companion's own `Sign in` row copy reads "Save rooms · **Sync across devices**", and
   for a room claimed this way that second half doesn't happen. Not scored as a FAIL against this
   round's script (which only asked that the hydrate land and the rail show both, which it does) —
   recorded for whoever owns the sign-in copy or a future sync-on-claim pass to weigh.

3. **Typed room names get truncated on save, inconsistently.** "W4 Walk4 Room" saved as `W4 Wa`
   (`psql`-confirmed — not a display ellipsis, the stored value); two independent attempts at
   "Guest Claim Test" / "Guest Claim Room" both saved as `Guest Cla`. The truncation points aren't a
   consistent character count (5 vs. 9), which points at an automation input-timing artifact — the
   harness's `input-text` outrunning the SwiftUI field, or the Save tap landing before the last
   keystrokes committed — rather than a deterministic field limit in the app. Recorded as an
   observation, not a confirmed app defect: it was not independently reproduced with a slower typing
   cadence, and the walk's own instructions don't call for that reproduction.

## What this round did NOT re-touch

- No re-walk of the money-screen suites (Proposals/Invoices/Budget/Decisions) or the W1b planks —
  out of scope for this round, which exists to prove ruling 1 and clear F4's probe list.
- Dark + XXL was walked only on the flag-off root's Today (where the new Companion-bubble finding
  surfaced); the project-room and Guest Bedroom room-screen dark+XXL passes from the prior re-walk
  (items 9/10 there) were not re-run, since round 3/4's commits didn't touch those screens.
- No production system, no push against Strata.

## Cleanup performed

- `leads.created_at`/`updated_at` for `a8fc690e-c31a-4928-b54b-1765d3b53697`
  (`james.okafor@example.com`) restored to `2026-08-21 17:08:24.922373+00`.
- `W4 Wa` (`rooms.id=86cc090e-31df-48f9-9661-ab842b636bb6`, the only test room this round actually
  synced to the server) deleted server-side — only D's seeded `Guest Bedroom` remains under the
  client's `user_id`.
- `saved_items` for `client@patina.dev` confirmed empty server-side (the save→un-save round-trips
  left no residue on either path tested).
- The local-only `Guest Claim Room` (`Guest Cla`) was never server-side and needed no server
  cleanup; its on-device SwiftData copy remains, harmless and consistent with the app's local-first
  design (SP-14) — exactly the same posture the prior re-walk left `W4 Rewalk Room`'s local artifact
  in.

## Leave state

Signed in as `client@patina.dev`, flag off, on the Daily Room, light appearance, medium (default)
text size, scrolled to top. Review device `973D1724-90BF-4A0A-B02D-481D561547B3` left booted.
`w4-49-leave-state-flagoff-client-daily-room-walk4.png` is that exact frame.

## Shots

All in `artifacts/ios-daily-return-2026-08-26/shots/`. This round: `w4-39` through `w4-49`
(continuing the numbering from the re-walk). Full per-shot description and every AX frame quoted:
`research/01-shot-ledger.md` §"w4 walk 4".

---

# Appendix — prior w4 walks (history)

## Re-walk (second pass, 2026-08-28)

Review device `973D1724-90BF-4A0A-B02D-481D561547B3`, tip `ba209c2a5` on `daily-return/integration`
(the branch `fix2-review.md` reviewed). Rebuilt fresh for this device (`xcodebuild build …
-derivedDataPath .build/dd`, signed `adhoc`, not `CODE_SIGNING_ALLOWED=NO`, built 2026-08-28 10:53
from this exact tip — the prior build on this device was stale, from before the second fix round).
Clean sign-in: `xcrun simctl keychain reset` + uninstall/install before signing in as
`client@patina.dev`.

`fix2-review.md` reported **B-1 "CLOSED, by construction"** — Today's house rail repaints
in-session via a shared `@Observable` `RoomSyncCoordinator.revision` and `w4-fix2-01` shows it
working. **This re-walk could not reproduce that.** Across three independent triggers on this device
— a fresh clean sign-in, a sign-out→sign-in cycle, and a cold terminate+relaunch, on both the
flag-off and `house-first` roots — Today's "YOUR HOUSE" rail showed only the two `project_rooms`
cards (`Dining Room`, `Living Room`) and never a locally-typed or server-mirrored room, even though
the same rooms are demonstrably present in the local SwiftData store and on the server the entire
time (`Your Spaces` — a separate `@Query`-driven surface — shows them correctly on every one of
those same checks). Reported as a **FAIL**, distinct from and more severe than `fix-review.md`'s
original B-1.

A second, independently-discovered defect: at dark + accessibility-XXL on Today, the editorial
story card's frame overlapped the house rail's cards by ~13pt, and — confirmed by repeated
mis-taps — the story card sat above the rail in hit-test order across the whole overlap, making the
covered portion of the room cards untappable, not merely visually crowded.

Every other scripted item passed, several of them decisively closing findings `fix-review.md` and
`fix2-review.md` raised (M-1's un-save-clears-the-room fix, M-2's help panel, the room-picker save
path, the fit line's mount). `ok = false` for the two FAILs above.

### Results (re-walk)

| # | Item | Tier | Result | Evidence |
|---|---|---|---|---|
| 1 | Today's house rail shows D's seeded Guest Bedroom beside the two project rooms, in-session (no bg/fg cycle); Your Spaces lists it | client, flag off | **Rail: FAIL · Spaces: PASS** | `w4-16` — rail shows only `Dining Room`/`Living Room` moments after a clean sign-in. `w4-17` — `Your Spaces` correctly lists `Guest Bedroom`. `w4-18` — back on Today, still only 2 cards, after Your Spaces' own successful reconcile. Device log: `[RoomSync] listRooms failed: cancelled` — the `.task`-scoped reconcile was cancelled by view churn, but that alone doesn't explain it (see item 2) |
| 2 | Type a room → Settings → Sign Out → sign in → the room is still on Today and in Spaces (psql) | client, flag off | **Spaces + server: PASS · Today: FAIL** | Created `W4 Rewalk Room`; confirmed synced. `w4-19` — Today's rail still only 2 cards after Sign Out → Sign In. `w4-20` — `Your Spaces` correctly lists both rooms post sign-in; server confirms both rows. `w4-21` — a full cold terminate+relaunch still shows only the 2 project-room cards — rules out task-cancellation as the sole cause |
| — | Repeat item 1 with `-PatinaFlags house-first` | client, flag on | **FAIL (same defect)** | `w4-22`/`w4-23` — the flag-on root's Today shows the identical 2-card rail; its own Your Spaces tab is correct. Bug is root-independent |
| 3 | A piece is saved into a room via the room picker from piece detail; Saved shows date · room · note; the room's own Saved lists it | client, flag on | **PASS** | `w4-24`–`w4-28` — help panel, fit line, room-picker save, Saved row with date/room/note, room's own YOUR ITEMS list all correct |
| 4 | Un-save it → the room's count drops | client, flag on | **PASS** | `w4-29`/`w4-30` — Guest Bedroom's own screen dropped to "0 SAVED PIECES" |
| 5 | The `?` help panel on the piece screen opens | client, flag on | **PASS** | `w4-24` |
| 6 | A qualifying piece shows the fit line | client, flag on | **PASS** | `w4-25` — first end-to-end on-glass proof of the fit line in this wave |
| 7 | james.okafor's matched request card survives a 20-day-old `created_at` (restore afterward) | james.okafor, flag on | **PASS** | `w4-31` |
| 8 | Dark + XXL on Today | client, flag on | **FAIL** | `w4-32`–`w4-34` — story/rail overlap, ~13pt, untappable portion of the rail |
| 9 | Dark + XXL on the room screen | client, flag on | **PASS** | `w4-36`–`w4-38` |

### Open for Fable — from the re-walk (resolved by walk 4 above, except where noted)

1. **B-1 is not closed.** — Resolved: ruling 1 (walk 4, item 1 above) fixes the root cause
   `fix3-log.md` diagnosed (the rooms were always present; the layout put her room off-screen at
   x=524). Not a repaint bug at all.
2. **A new interaction-blocking defect at dark+XXL on Today**: the editorial story card overlapped
   the house rail. — Resolved by round 3's `a849b39fd` (`minHeight` on both cards); confirmed at
   both `.xxLarge` and a true accessibility size by walk 4 above.
3. **Minor, non-gating**: the Companion action sheet's list does not scroll at large accessibility
   text sizes. — **Still open.** Round 3's `d5760170f` claimed a fix; walk 4 above found it does
   not scroll, and this round scores it as a FAIL (not merely non-gating) since it was explicitly on
   this round's script as an item to confirm fixed.

### Leave state (re-walk, superseded)

Signed in as `client@patina.dev`, flag off, on the Daily Room, light appearance, default text size,
scrolled to top. `w4-35-leave-state-flagoff-client-daily-room.png` was that frame (superseded by
`w4-49-leave-state-flagoff-client-daily-room-walk4.png` from walk 4).

### Shots (re-walk)

`w4-16` through `w4-38`. Full per-shot description and every AX frame quoted:
`research/01-shot-ledger.md` §"w4 re-walk".

## Original walk (first pass, 2026-08-28)

Review device `973D1724-90BF-4A0A-B02D-481D561547B3` (iPhone 17 Pro / iOS 26.5, 402×874 pt).
Installed
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w4-integration/apps/mobile/Patina/.build/dd/Build/Products/Debug-iphonesimulator/Patina.app`
(`xcrun simctl install`, unsandboxed) — `codesign -dv` confirmed `Identifier=cloud.patina.app`,
`Signature=adhoc`, **not** `CODE_SIGNING_ALLOWED=NO`. This was `waves/w4/integration.md`'s build,
integration tip `b1ff6e458` (superseded by `ba209c2a5` for the re-walk).

**Original verdict: NOT a clean PASS.** One scripted item failed on glass — the piece-detail fit
line never drew, for any room, because `RoomFitLine` was not mounted anywhere in the app. This was
fixed in the fix rounds that followed and is confirmed working by the re-walk above (item 6).

### Original results (superseded)

| # | Item | Tier | Result | Evidence |
|---|---|---|---|---|
| 1 | House rail shows the seeded typed room beside the two project rooms | client, flag off | **FAIL** | Rail showed only `Dining Room` / `Living Room`. `RoomsAPIClient.listRooms()` had zero call sites at this point in the wave |
| 1a | …with real budget/committed on the two project rooms | client, flag off | **FAIL, unruled — not this wave's defect** | Both `project_rooms` carried `budget_cents = 0` / `committed_cents = 0` at this point (fixed by fix-tasks §4 in the following round) |
| 2 | Room screen's `Edit dimensions` + `Set a budget` acts work and persist across relaunch | client, flag off | **PASS** | Created `Walk Test Room`; both acts saved and persisted across relaunch |
| 3 | The seat names the project carrying the open NEEDS YOU items and Message opens that project's thread | client, flag off | **PASS** | Seat read `Leah Hartwell, Aspen Loft Refresh`; `Message Leah Hartwell` opened a thread scoped to that project |
| 4 | A Saved row shows save date + room + a note after adding one | client, flag on | **PARTIAL — date and note PASS, room FAIL** | Room did not draw at this point in the wave (fixed by fix-tasks §2) |
| 5 | Project detail shows the phase timeline with the current phase marked | client, flag off | **PASS, with a caveat carried from the fix log** | Timeline drew all 5 phases with their own status; no single phase marked "current" by design |
| 6 | The story card shows its publish date | client, flag off/on | **PASS** | — |
| 7 | james — matched request card still visible after 20-day-old `created_at` | james.okafor, flag on | **PASS** | Confirmed unconditional visibility once `stage.isMatched` |
| 8 | A piece detail shows the fit line only for a room measured with the segmented control | client, flag on | **FAIL** | `RoomFitLine` mounted nowhere in the app at this point |
| 9 | Dark + XXL on Today | client, flag on | **PASS** | Full scroll, no clipping, no Companion-orb overlap, at this account/content state |
| 10 | Dark + XXL on the room screen | client, flag on | **PASS** | `Edit dimensions` / `Set a budget` both ended clear of the bar |

### Original "Open for Fable" (all resolved by later rounds)

1. **A save never carries a room, from any entry point.** — Resolved by fix-tasks §2.
2. **A locally-typed, already-synced room does not survive Sign Out → Sign In.** — The specific
   persistence gap was resolved; the *rail* issue that replaced it was resolved by ruling 1 (walk 4).
3. **`RoomFitLine` is mounted nowhere.** — Resolved by fix-tasks §3.
4. `research/02-steward-boot.md` §6(b)'s UUID for `james.okafor@example.com` was stale. — Resolved
   per fix-tasks §11 (revised): the section now carries the lookup query instead of a quoted id.

### Original leave state (superseded)

Signed in as `client@patina.dev`, flag off, on the Daily Room, light appearance, default text size,
scrolled to top. `w4-15-leave-state-flagoff-client-daily-room.png` was that frame.

### Original shots

`w4-01` through `w4-15`. Full per-shot description and every AX frame quoted:
`research/01-shot-ledger.md` §"w4 walk".

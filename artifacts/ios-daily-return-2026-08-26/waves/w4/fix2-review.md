# W4 — second fix-round review (role V2, adversarial, read-only)

Reviewer, 2026-08-28. Separate context; no code written, no gate re-run, no simulator, no build.
Read `waves/w4/{fix-review,fix-tasks,walk}.md`, `source/build-plan.md` §"Global constraints", every
one of the eight commits `99fea462e..ba209c2a5` on `daily-return/integration`
(`/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w4-integration`), the surrounding code
each lands in, and the round's seven shots (`shots/w4-fix2-01…07`).

**Verdict: a pass, with two majors to carry.** All five named items — B-1, B-2, M-1, M-2, M-3 —
are closed at the surface `fix-review.md` named, by construction rather than by luck, and four of
the five are also proved on glass. Nothing blocking. Two major findings remain, both of them the
*same defect one file away* from where it was fixed: the claim sheet the new hydrate-hold depends
on sits on the double-`.sheet` chain M-2 just fixed elsewhere, and the room's orphaned copy that
M-1 fixed on the piece screen still orphans from the Saved row's own Remove. Seven minors.

Every finding carries **severity** and **confidence**. Confidence is about the claim, not the fix.

---

## 1. The five items, answered

### B-2 — the hydrate takes the account's own rooms · **CLOSED**
**Confidence: high (code-read + tests read).**

Both halves the review asked for, and they are independent:

- **On the request.** `RoomsAPIClient.roomsListURL(base:userId:)` is a pure value function carrying
  `user_id=eq.<id>` beside `select` and `order`; `listRooms(userId:)` is the only way to call it —
  the unfiltered overload is gone, not deprecated, so no call site can drift back.
  `theRequestCarriesTheOwnerFilter` asserts the query item off `URLComponents`, not off a string.
- **In the merge.** `apply(_:in:owner:)` filters `rows` on `user_id.lowercased() == owner.lowercased()`
  before `RoomMerge.plan` sees them. `aForeignRowIsRejectedByTheMerge` (foreign row → store empty,
  `changed == false`) and `theOwnRowLandsBesideAForeignOne` (mixed response → only the account's row
  lands) are both against a real in-memory `ModelContainer`.
- The owner is `api.resolveUserId()` → `currentUserId()`, the session's own uid, which is
  `rooms.user_id`'s own value. Case is handled twice over: PostgREST casts to `uuid` (case-blind) and
  the merge lowercases both sides.
- m-8 taken in the same commit: `listRooms` now calls `ensureOK`, so a 401 is an `http(status:)`
  and not a decode error.

SP-06 holds on both legs. A designer signing into the client app now asks only for her own rooms,
and would drop her client book at the merge even if the request came back wide.

### B-1 — Today's rail repaints in-session · **CLOSED, by construction**
**Confidence: high on the mechanism; high on the shot.**

Not manual reloads at three call sites — a signal:

- `RoomSyncCoordinator` is `@Observable` with `public private(set) var revision`, bumped **only** when
  `apply` actually inserts or takes a server row (`changed` is set inside the two loops).
- `DailyRoomView` holds `@State private var roomSync = RoomSyncCoordinator.shared` and
  `.onChange(of: roomSync.revision) { viewModel.reloadRooms(); syncCompanionContext() }`. Reading
  `revision` in the `of:` expression registers the observation on body, so the bump invalidates and
  the handler fires.
- Every reconcile call site goes through `.shared` — `DailyRoomView` ×2, `YourSpacesView`,
  `LocalStoreClaim`, `AuthService` — so the one signal covers the auth listener's pass, which is the
  one the 30 s debounce would otherwise have hidden. Verified by grep: no site constructs its own
  coordinator outside tests.
- `reconcileSharedStore()` writes through `PersistenceController.shared.container.mainContext` — the
  same context the rail reads — so the re-read sees the rows.
- The room half of `load()` is extracted as `reloadRooms()`; the extraction is faithful (the
  `hasStyleProfile`/`tastePortrait` else-branch was correctly lifted back into `load()`, so a
  revision bump no longer clears the taste portrait).
- Tests: `aMirroredRoomReachesTheRail` runs the VM against a real container and asserts
  `houseRoomCards` gains `Guest Bedroom` (and `houseRoomCards` really is
  `HouseRoomCard.cards(projectRooms:localRooms: roomModels)`, so the assertion is the rail);
  `anUnchangedReconcileDoesNotBumpTheRevision`; a `SourcePin` that `DailyRoomView` watches the
  revision.
- **On glass:** `w4-fix2-01` (10:31, after the final commit at 10:28) shows the rail under
  `YOUR HOUSE` carrying `Guest Bedroom · 180 sq ft · budget $9,000` beside the project rooms;
  `w4-fix2-07` shows the same on the `house-first` root. That is walk item 1's own surface.

The `>=` correction in `RoomMerge.plan` is right and is load-bearing for the signal: both
`insertMirrored` and `applyRemote` write the parsed server stamp onto the mirror, so an unchanged
row now compares equal and lands in `keepLocal` instead of being re-taken (a write and a false
"changed") on every visit. m-1 (`inFlight` claimed before the first `await`) is folded in and correct.

### M-1 — un-save clears the room's copy · **CLOSED on the surface named**
**Confidence: high. See MAJ-2 for the two surfaces it does not reach.**

`toggleSave`'s un-save branch calls `removeFromRooms(productId:context:)`, which deletes the matching
`SavedItem` from every room through `RoomStore.removeItem` so the room's own count follows. The
iteration is over a value-typed snapshot of `room.items`, so deleting inside it is safe. Tests pin
the three figures a reader sees (`items`, `savedItemCount`, `totalInvestmentCents`) plus a second
piece in the same room that must survive. On glass: `w4-fix2-04` room reads `1 / $1,550`,
`w4-fix2-05` the same room reads `0 SAVED PIECES · A blank canvas` after the un-save.

### M-2 — one sheet driver on the piece screen · **CLOSED, and proved both ways**
**Confidence: high.**

`.helpPanel` is gone from `ProductDetailView`; both presentations run through one
`.sheet(item: $presented)` behind a `Presented` enum. The inline help construction is faithful — the
`helpPanel` modifier is *exactly* `sheet(isPresented:) { HelpPanelSheet(surfaceKey:isPresented:) }`,
so nothing (detents included, they live inside the sheet body) was lost. The derived binding
(`get: presented == .help`, `set: presented = nil`) closes correctly from the sheet's own X.

The review asked for the older presentation to be checked, not just the new one. Both were, in the
same session on the same screen: `w4-fix2-02` (Help panel over the piece) and `w4-fix2-03` (Add to
Room offering Guest Bedroom). The SourcePin also forbids `.sheet(isPresented:` and `.helpPanel(`
returning to this file.

The fixer's flagged walk artifact — no sheet presenting *anywhere* in the app's first session, help
and room picker alike, both fine after a plain relaunch — is honestly reported and is not this
round's doing (it swallows H1's already-collapsed sheet too). It deserves its own brief; see MAJ-1,
which is the same family and now load-bearing.

### M-3 — "Start fresh" waits for, and excludes, the account's rows · **CLOSED, belt and braces**
**Confidence: high on the wipe scoping; medium on the hold (MIN-1, MAJ-1).**

Two answers, and the second is the one that actually holds:

- **The hold.** `askIfNeeded` returns whether the sheet went up; `AuthService.settleLocalStore(for:)`
  spawns the hydrate only when it did not; `keep()`/`startFresh()` run it once the answer lands.
- **The scoping.** `startFresh()` routes to `LocalStoreReset.wipeGuestWork(in:)`, which deletes only
  rooms with `remoteId == nil` (their `SavedItem`s cascade — `@Relationship(deleteRule: .cascade)`
  confirmed on `RoomModel.items`) plus the saved rows, drafts, scan bundles and queue. A mirrored
  room is the account's own and survives. The whole-store wipe stays where SP-06 wants it: a
  *different* account taking the phone.
- Both wipes call `RoomSyncCoordinator.forget()`, so the debounce cannot keep an account off its own
  rooms for 30 s after the store changed under it.
- Tests: `aPendingClaimHoldsTheHydrate`, `anEmptyStoreAsksNothingAndHydratesAtOnce`,
  `theAuthListenerWaitsOnAPendingClaim` (SourcePin), `startFreshClearsOnlyTheRoomsThatNeverSynced`
  (mirrored row survives, guest row and the saved rows go), `aWipeMakesTheNextHydrateDue`.

The scoping is what makes the residual race (MIN-1) harmless today. That is the right order of
belts — but it means the hold is not the thing carrying the weight.

---

## 2. Major

### MAJ-1 · The claim sheet the hydrate now waits on is itself on a two-`.sheet` chain
**Severity: major · Confidence: medium (code shape is certain; whether it presents on this OS is not,
and the round's own walk note is evidence against it).**

`LocalStoreClaimSheet` is hosted on `CompanionOverlay`, whose modifier chain reads:

```
:520  .helpPanel(isPresented: $isHelpPanelPresented, surfaceKey: …Companion.root)   // a sheet(isPresented:)
:527  .sheet(isPresented: Binding(get: { localStoreClaim.isAsking }, …))            // the SP-06 claim
```

Two `sheet(isPresented:)` on one chain — the exact shape M-2 just collapsed on `ProductDetailView`
and H1 collapsed on `RoomProjectView`, with `h1-notes.md` §3.1 carrying it as a *repo-wide* caution.
This round did not look at the third instance, and it just became load-bearing: if the claim sheet
does not present, `isAsking` stays `true` forever, nothing ever calls `keep()`/`startFresh()`, and
`settleLocalStore`'s `guard !claimPending else { return }` permanently suppresses the auth listener's
hydrate for that sign-in. The person is also never asked the SP-06 question at all.

What limits the blast radius: the screens reconcile on their own (MIN-1), so the rooms still arrive.
So this is a stuck *question*, not a stuck house.

The fixer's own walk note — "in the FIRST app session NO sheet presented anywhere … after a plain
relaunch every sheet presented normally" — is consistent with this chain misbehaving, and the claim
sheet is a first-session surface by definition.

**Ask:** collapse `CompanionOverlay`'s two sheets onto one `item:` driver the way the other two now
are, and walk the guest → sign-in claim once (guest types a room, signs in, sheet appears, "Start
fresh" keeps the mirrored room). Nobody has yet seen this sheet on glass in this wave.

### MAJ-2 · Un-save still orphans the room's copy from the other two un-save surfaces
**Severity: major · Confidence: high (code-read; both callers are live).**

M-1 was fixed in `ProductDetailViewModel.toggleSave`. The same C5 failure is still reachable one
screen away, because two other un-save paths delete only the `TableItemModel`:

- `CollectionsViewModel.removeSavedItem(_:context:)` (`:171-175`) — `context.delete(item)` and
  nothing else. Caller: `CollectionsView.swift:211`, the saved row's own Remove.
- `RecommendationsViewModel.unsaveProduct(_:context:)` (`:248-258`) — fetches every
  `TableItemModel` for the product id and deletes them; the room's `SavedItem` is untouched.
  Callers: `RecommendationsView.swift:445, :457, :501`.

So: Add to Room from the piece screen (`w4-fix2-04`, room reads `1 / $1,550`), then remove the row
from Pieces → Saved, or from a recommendation's ⋯ menu. The Saved table is empty, `saved_items` is
empty, and the room still says one saved piece and still counts $1,550 against the budget the round
made honest. That is M-1's own sentence, on a surface the walk script's item 4 actually visits.

**Ask:** one shared helper — the inverse of what `addToRoom` wrote — called from all three un-save
paths, with the room-count assertion the M-1 tests already model.

---

## 3. Minor

| # | Finding | Severity | Confidence |
|---|---|---|---|
| MIN-1 | **The hold covers the listener only.** `DailyRoomView`'s `.task` (`:131`), its `.onChange(of: isAuthenticated)` (`:152`) and `YourSpacesView`'s `.task` (`:107`) call `reconcile` with no check on `LocalStoreClaim.isAsking`, so the hydrate still runs underneath an open claim sheet — the ordering M-3's first half exists to prevent. Harmless *today* because `wipeGuestWork` keeps mirrored rooms; it stops being harmless the day that wipe widens again. Either guard the coordinator itself on `isAsking` (one place, all call sites) or say in the banner that the scoping, not the hold, is the guarantee. | minor | high |
| MIN-2 | **`reloadRooms()` does more than reload rooms.** It also re-derives the active room, sets `allRecommendations = []` and calls `refreshFeedForSelectedRoom()`. So a mid-session revision bump blanks and refetches Today's recommendation rail under the reader. The selection itself is safe (`ContextMemoryStore.activeRoom` returns the current selection when it is still present), and the bump only fires on a real change — but the repaint is wider than the rail the fix names. | minor | high |
| MIN-3 | **The fit line can now go stale where it could not before.** `fitLine` is `@State`, refreshed in `.task` and after the room picker's `onSelect`. `+ New Room` navigates to `manualRoomEntry` and comes back to the *same* view instance, whose `.task` does not re-run — so a reader who creates their first room from the piece screen sees no fit line until the screen is rebuilt. Previously `body` recomputed it. One `refreshFitLine()` on return (or on `roomSync.revision`) closes it. | minor | medium |
| MIN-4 | **`RoomStore.removeItem`'s count arithmetic is ambiguous** — `room?.savedItemCount = max(0, (room?.items.count ?? 1) - 1)` runs *after* `context.delete(item)`, so whether it is right depends on whether the relationship array has already dropped the deleted row. The new tests pin only the one-item case, where both readings give 0. Pre-existing, and currently inert (`RoomModel.savedItemCount` has no UI reader — the surfaces count `items`), but M-1 made this the ordinary path. Assert `savedItemCount == 1` in the two-piece test and it is settled either way. | minor | medium |
| MIN-5 | **`ProductDetailView.swift` is 499 lines** — one line under the ceiling the round just moved it back under. The next edit to that file trips `lint-delta` again. Not a defect; a note for whoever takes W5's order sheet, which lands on this screen. | minor | high |
| MIN-6 | **An unparseable `updated_at` makes every reconcile "changed".** `RoomMerge.plan` falls to `takeServer` when `ISO8601DateParsing.dateOrDay` returns nil, and `applyRemote` then cannot stamp the mirror — so the row is re-taken and `revision` bumped on every pass, which now costs a rail reload and a feed refetch every 30 s rather than just a write. Only reachable on a malformed server stamp. | minor | medium |
| MIN-7 | **The two wipes have diverged silently.** `wipeUserScopedData` clears `RecordSnapshotStore` / `LastSeenStore` / `RecordOwnerStamp` (the App Group artefacts) and deletes `SavedItem` wholesale; `wipeGuestWork` does neither — it relies on the cascade, and leaves the Record artefacts. Almost certainly inert (a guest has no Record), but the comment claims the difference is *only* the mirrored rooms, and it is not. | minor | medium |
| MIN-8 | **`m-4` is sharper than "worth a word".** `w4-fix2-05` shows the mirrored Guest Bedroom's own header reading `12 × 15 FT · 180 SQ FT · TYPED, NOT SCANNED` — that copy comes from `hasBeenScanned`, while `insertMirrored`/`applyRemote` leave `measuredWithUnitControl = false`, which is what the fit line gates on. The app tells the reader the room was typed and then refuses to measure against it. Correctly deferred to Kody, but this is the sentence to put in front of him. | minor | high |
| MIN-9 | **An orphaned doc comment.** In `AuthService`, `reconcileLocalStoreOwner`'s first paragraphs ("…relaunch, token refresh are a no-op. Never wiped on sign-out…") now sit above `settleLocalStore(for:)`, and `reconcileLocalStoreOwner` is left with only the "Returns whether the claim sheet is now up" line. Cosmetic; the lint-delta commit's "no behaviour moves" claim is otherwise true. | trivial | high |

---

## 4. The brief's checklist, answered

| Asked | Answer |
|---|---|
| `user_id` filter on the request | **yes** — `roomsListURL(base:userId:)`, pinned on the query items; the unfiltered overload no longer exists |
| …**and** enforced in the merge | **yes** — `apply(_:in:owner:)` drops foreign rows before `plan` runs; two tests, one of them a mixed response |
| rail repaints in-session, by construction | **yes** — `@Observable revision` → `.onChange` → `reloadRooms()`; every call site is `.shared`; shared `mainContext`; VM test + SourcePin; `w4-fix2-01` on the named surface |
| un-save clears every model | **on the piece screen, yes** — `TableItemModel`, the room's `SavedItem`, and the server row via `mirrorUnsave`; counts pinned and shot. **Not from the Saved row or the ⋯ menu** — **MAJ-2** |
| the two sheets no longer compete | **yes** — one `.sheet(item:)`, `.helpPanel` gone, both routes shot in one session (`w4-fix2-02/03`). But the third instance of the same shape is untouched and now load-bearing — **MAJ-1** |
| "Start fresh" waits for the claim | **for the auth listener, yes**; the three screen-level reconciles are not held — **MIN-1** |
| "Start fresh" excludes mirrored rows | **yes** — `wipeGuestWork` keeps `remoteId != nil`, tested, and the debounce is cleared so the account refetches at once |
| tests real | **yes** — real in-memory `ModelContainer`s throughout, a real `URLComponents` assertion for the query, real `SET LOCAL ROLE` + JWT for the SQL insert case. `SourcePin` is used only for mounts/absences, which is its honest use. The fixer states both M-1 tests were confirmed red before the one-line call was restored |
| no unrelated change | **yes** — 17 files across the eight commits, every one inside B-1/B-2/M-1/M-2/M-3, a named minor, or the lint ceiling those edits crossed. No drive-by refactor; `ProductDetailBlocks.swift` is the split the W4 lane already made for this reason |
| pathspec commits | **yes** — eight Conventional Commits, each `--name-only` list confined to its own subject; branch `daily-return/integration` is local (`git branch -r --contains` empty), descends from current `main` (`1cb71c346`), and `main` is untouched |
| both roots render | **yes** — flag-off for the rail, the room and the piece screen (`w4-fix2-01, -04/05, -06`), which also closes the previous round's m-11; `house-first` relaunch shows the same rail (`w4-fix2-07`) |
| honesty (C5) | **yes**, and notably so: the gate-script observation (the main checkout's `ios-gate.sh` resolves its project from its own location and gates `main` — I confirmed `SCRIPT_DIR/..` at `:21-23`), the first-session sheet stall, and the four minors *not* taken are all reported against the round's own interest |

## 5. What I did not verify

- **Gates.** No build, no test run, no `supabase db reset`, no simulator — read-only role. The gate
  figures (1233 tests / 140 suites, lint-delta clean, 134 SQL / 0 unexpected) are taken as asserted.
  Two things corroborate them: the seven shots are stamped 10:31–10:40, after the final commit at
  10:28, so the walk was on the finished tree; and the lint-delta commit's own subject matches what
  the file sizes show (`ProductDetailView.swift` at 499).
- **`w4-fix2-01`'s "no background/foreground cycle"** is the fixer's word. The `.onChange` wiring is
  the construction proof, and it does not depend on the shot.
- **m-3, m-4, m-5, m-12** were deliberately not taken; I agree with each reason, and MIN-8 sharpens
  m-4 for the ruling.

## 6. What I would ask for before this round is accepted

1. **MAJ-2** — one shared "take it out of the room" helper called from all three un-save paths.
   This is a C5 failure on a surface the walk script visits.
2. **MAJ-1** — collapse `CompanionOverlay`'s two sheets, and walk the guest → sign-in claim once.
   Nobody has seen that sheet on glass, and the hydrate now waits on it.
3. **MIN-1** — a one-line ruling: guard the coordinator on `isAsking`, or state that the scoping is
   the guarantee and the hold is a courtesy.

Everything else is a note for Fable, not a gate.

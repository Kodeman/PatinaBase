# W4 — fix tasks (the three walk failures + the steward's ruled items)

Written by the W4 fix lane before any code, per `build-plan.md`'s writing-plans rule.
Branch `daily-return/integration`, worktree `.codex/worktrees/agent-dr-w4-integration`, tip
`b1ff6e458`. Device `dr-w4-fix` (fresh iPhone 17 Pro / iOS 26.5, created — never the review device).
Nothing is pushed. One Conventional Commit per item, pathspec-staged.

Inputs: `waves/w4/walk.md` (items 1, 4, 8 + "Open for Fable"), `waves/w4/integration.md` §6
dispositions, `h1-notes.md`, `h2-notes.md`, `d-notes.md`, `source/shared-planks.md` §SP-06 / §SP-11 /
§SP-14.

Format per task: **failing test → run → implement → run → commit**.

---

## 1 — Rooms hydrate from the server (walk item 1; walk "Open for Fable" 2)

`RoomsAPIClient.listRooms()` has zero call sites, so the account's rooms live only on the device that
typed them. D's seeded `Guest Bedroom` is invisible, and a room typed in-session vanishes on
sign-out → sign-in.

1.1 **Test first** — `PatinaTests/RoomSyncTests.swift`:
- `aServerRoomTheStoreLacksIsCreated` — one `RemoteRoom`, empty store → one local room carrying its
  name, dimensions, `budgetCents` and `remoteId`.
- `aLocalEditNewerThanTheServerIsKept` — local `updatedAt` after the server's `updated_at` → the
  local figures stand.
- `aServerRowNewerThanTheLocalOneWins` — the reverse.
- `aRoomThatNeverSyncedIsNeverMerged` — a local room with `remoteId == nil` (the guest's, SP-06) is
  neither updated nor deleted nor uploaded.
- `reconcilingTwiceLeavesOneRoom` — idempotency, keyed on `remoteId`; no duplicate.
- `theSameOwnerIsNotRefetchedWithinTheWindow` / `aDifferentOwnerAlwaysRefetches` — the debounce.

1.2 **Run** — expect a compile failure (`RoomSyncCoordinator` does not exist).

1.3 **Implement**
- `Core/Network/RoomsAPIClient.swift`: `RemoteRoom` decodes `budget_cents`.
- `Features/Rooms/RoomSyncCoordinator.swift` (new): `RoomListRemote` protocol,
  `RoomMerge.plan(server:local:)` (pure — insert / take-server / keep-local / untouched),
  `RoomSyncCoordinator.shared.reconcile(store:api:)` with the owner-keyed debounce.
- `Core/Persistence/RoomStore.swift`: `room(remoteId:)`, `insertMirrored(_:)`, `applyRemote(_:to:)`.
- Call sites: `Services/Auth/AuthService.swift` (sign-in completion, off the auth-state listener),
  `Features/Rooms/Views/YourSpacesView.swift` `.task`, `Features/Home/Views/DailyRoomView.swift`
  `.task`.

1.4 **Run** — `PatinaTests` green.

1.5 **Commit** — `feat(ios): the rooms an account owns reach the phone it signs in on`
(`Patina/Core/Network/RoomsAPIClient.swift Patina/Core/Persistence/RoomStore.swift
Patina/Features/Rooms/RoomSyncCoordinator.swift Patina/Features/Rooms/Views/YourSpacesView.swift
Patina/Features/Home/Views/DailyRoomView.swift Patina/Services/Auth/AuthService.swift
PatinaTests/RoomSyncTests.swift` + the two test files whose `RemoteRoom(...)` literals gain the new
field).

## 2 — Add to Room writes the room (walk item 4; walk "Open for Fable" 1)

`ProductDetailView`'s `Add to Room` (:443) only toggles the generic save. `SavedRowMeta` and the
room-scoped Saved already draw a room; the gap is the write.

2.1 **Test first** — `PatinaTests/ProductDetailRoomSaveTests.swift`:
- `thePayloadCarriesTheRoom` — the built `CreateSavedItemPayload` encodes `room_id`.
- `theSaveLandsTheRoomOnTheLocalRow` — after `addToRoom`, the `TableItemModel` carries `roomId` and
  the room's own item list holds the piece.
- `theRowMetaDrawsTheRoom` — `SavedRowMeta.line` over that row.
- `theRoomScopedSavedListFiltersByRoom` — `CollectionsViewModel.items(_:inRoom:)`.
- `aSaveWithNoRoomStaysRoomless` — no room chosen, nothing invented (C5).

2.2 **Run** — expect failures.

2.3 **Implement**
- `Features/ProductDetail/ViewModels/ProductDetailViewModel.swift`: `savePayload(...)` extracted
  pure; `addToRoom(localId:remoteId:context:)` writing the local row, the room's `SavedItem`, and the
  mirror carrying `room_id`; `mirrorSave` patches an existing roomless row's `room_id` rather than
  returning early.
- `Core/Network/RoomsAPIClient.swift`: `updateItemRoom(id:roomId:)`.
- `Features/ProductDetail/Views/ProductDetailView.swift`: mount `AddToRoomSheet` on `Add to Room`
  when no room is in context and the reader has a room; a room-scoped entry (`roomEmergence`)
  defaults to that room without asking.
- `Features/Collections/ViewModels/CollectionsViewModel.swift` + `Views/CollectionsView.swift`: the
  room filter moves to one tested helper.

2.4 **Run** — `PatinaTests` green.

2.5 **Commit** — `feat(ios): a piece saved into a room says which room`

## 3 — Mount the fit line (walk item 8; walk "Open for Fable" 3)

`RoomFitLine` exists with zero call sites.

3.1 **Test first** — `PatinaTests/RoomFitLineTests.swift` (extend):
- `theMountIsOnThePieceScreen` — `SourcePin` over `ProductDetailView.swift`.
- `theRoomInContextIsPreferred`, `anUnmeasuredRoomInContextSubstitutesNoOtherRoom`,
  `theMostRecentlyMeasuredRoomIsUsedWithNoContext`, `noMeasuredRoomDrawsNothing`.

3.2 **Run** — expect failures.

3.3 **Implement** — `RoomFitLine.room(preferredLocalId:preferredRemoteId:in:)`; the mount in
`ProductDetailView` under `specRows`.

3.4 **Run** — green.

3.5 **Commit** — `feat(ios): the piece screen prints the room's wall beside the piece's own width`

## 4 — §6.2 the two project rooms carry real figures

D's two `UPDATE`s from `d-notes.md` §4 into `supabase/seed/decisions.sql`, then `supabase db reset`.

4.1 Implement · 4.2 `supabase db reset` + `./scripts/run-sql-tests.sh` · 4.3 Commit —
`fix(daily-return): the client's project rooms carry the budget they were seeded to carry`

## 5 — §6.3 the budget bar measures against the budget its owner set

The hard-coded `$2K–$5K` goes; the bar draws only where `room.budgetCents` exists and prints
`$X of $Y`.

5.1 **Test first** — `PatinaTests/RoomBudgetTests.swift`: `theBarMeasuresAgainstTheStoredBudget`,
`noBudgetDrawsNoBar`, and a `SourcePin` that `200_000`/`500_000` are gone from `RoomProjectView`.
5.2 Run · 5.3 Implement (`BudgetAssessment.level(totalCents:budgetCents:)` → optional,
`RoomBudgetBar(totalCents:budgetCents:)`, `RoomProjectView`) · 5.4 Run · 5.5 Commit —
`fix(ios): the budget bar measures a room against the budget its owner set`

## 6 — §6.4 the typed room says so, once

`galleryMetaLine` reads `Typed, not scanned`; `SpatialMetadataRow` drops its duplicate dimensions.

6.1 Test (`RoomModelTests`/`RoomBudgetTests` + a `SourcePin` on `SpatialMetadataRow`) · 6.2 Run ·
6.3 Implement · 6.4 Run · 6.5 Commit —
`fix(ios): the Spaces card says a room was typed, and the room prints its size once`

## 7 — §6.5 a match nobody has scored draws nothing

`RoomGalleryCard.statCells` drops the `Match` cell, and `RoomProjectView.statRow` the
`Room match` cell, where `averageMatchScore` is nil.

7.1 Test · 7.2 Run · 7.3 Implement · 7.4 Run · 7.5 Commit —
`fix(ios): a match Patina has not computed draws no cell`

## 8 — §6.7 a phase with no fee draws no fee

`ProjectDetailCopy.phaseFee(cents:)` → nil for nil **and** for 0; both the visible figure and the
VoiceOver label read it.

8.1 Test · 8.2 Run · 8.3 Implement · 8.4 Run · 8.5 Commit —
`fix(ios): a phase with no fee draws no fee`

## 9 — §6.8 a room typed in feet counts as measured

`ManualRoomEntryView` → `RoomCreationCoordinator.createManualRoom` →
`RoomStore.createRoom(measuredWithUnitControl:)`. The fallback-scan path
(`QuietConversationFlowHost`) keeps `false`.

9.1 Test · 9.2 Run · 9.3 Implement · 9.4 Run · 9.5 Commit —
`fix(ios): a room typed on the feet fields counts as measured`

## 10 — §6.6 `last_seen_at` off the world-readable row

`profiles` is `FOR SELECT USING (true)` (00013:57-58), so every authenticated reader can see when a
homeowner last opened the app. 00539 is unmerged, so it is edited in place rather than a new number
minted (W5 keeps 00540).

10.1 **Test first** — `supabase/tests/rooms/profile_presence_test.sql`: the owner reads and upserts
her own row; her designer of record (accepted lead **or** active project) reads it; an unrelated
authenticated designer reads **zero**; `profiles.last_seen_at` no longer exists.
10.2 **Run** — `./scripts/run-sql-tests.sh -f profile_presence` fails.
10.3 **Implement** — 00539 gains `public.profile_presence`, its RLS, the `DROP COLUMN`, and the
`purge_client_account` re-issue that the drop requires (00538's body writes the column); rename to
`00539_saved_item_note_and_presence.sql` so the file's name is true. `house_on_today_test.sql` §2
re-pointed. `ProfileService.mirrorLastSeenIfNeeded` upserts `profile_presence`.
`packages/supabase/src/database.types.ts` regenerated.
10.4 **Run** — `supabase db reset` + full SQL suite.
10.5 **Commit** — `fix(db): when a homeowner was last here is hers and her designer's`

## 11 — the stale UUID at the source

`research/02-steward-boot.md` §6(b) names `28fd9d2c-…` for `james.okafor@example.com`; `auth.users`
says `b2490455-9737-4328-b943-507e727edc08`. Edited directly in the main checkout (read-only for git
there — the orchestrator carries it), per the fix brief.

## What the walk added to this list (written after the fact, not planned)

- **12 — a save reaches the account at all.** With the room write finally landing far enough to be
  refused, the walk found every `saved_items` POST this app has ever made coming back **400
  (23514)**: `source` has carried a CHECK since `00055:32` — `emergence`, `search`, `companion`,
  `extension` — and both iOS save paths sent `"ios"`. Nothing showed it (the local row is the saved
  thing, SP-14; the failure only logged), which is why `saved_items` was empty on every walk of this
  wave. Both paths now send the surface's own word, pinned against the column's vocabulary.
  Commit: `fix(ios): a save reaches the account instead of being refused for its source`.
- **13 — the piece screen past 500 lines.** The room picker and the fit line carried
  `ProductDetailView.swift` over SwiftLint's file ceiling, which `lint-delta` reads as a new
  warning. Its stateless blocks moved to `ProductDetailBlocks.swift`; no signature and no drawn
  pixel changed. Commit: `style(ios): the piece screen's stateless blocks move to their own file`.
- **11 (revised).** `research/02-steward-boot.md` §6(b)'s UUID could not be corrected by swapping in
  a newer one: `seed/leads_room_scans.sql:15-26` mints every homeowner id with `gen_random_uuid()`,
  so the id changes on every reset — the walk's own replacement (`b2490455-…`) was already stale by
  this reset (`9fbcfe71-…`). The section now carries the query instead of an id.

## Gates (all unsandboxed, foreground)

`ios-gate.sh build` → `xcodebuild test -only-testing:PatinaTests` on `dr-w4-fix` →
`ios-gate.sh lint-delta main` → `supabase db reset` + `./scripts/run-sql-tests.sh` → signed rebuild →
install on `dr-w4-fix` → the four proof walks (Guest Bedroom on Your Spaces; a typed room surviving
sign-out/sign-in; a save carrying its room on both the Saved row and the room's own Saved; the fit
line under a qualifying piece's dimensions), shot to `shots/w4-fix-NN-*.png`. `.writer.lock.d`
released and `dr-w4-fix` deleted at the end.

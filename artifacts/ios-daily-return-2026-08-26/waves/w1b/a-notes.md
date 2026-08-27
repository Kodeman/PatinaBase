# W1b · Lane A — integration notes

Written by the lane A implementer. Each entry is `file · exact change or precise
instruction · why`. The owning lane or the steward applies them at integration.

---

## 1. File claimed that the steward's map does not assign

**`apps/mobile/Patina/Patina/Core/Network/RoomsAPIClient.swift` — claimed by A, edited.**

The steward's owned-file map (§6.1–§6.4) names three `Core/Network/*` files
(`ProductAPIClient`, `EditorialStoriesAPIClient` → A; `DecisionsAPIClient` → B;
`NotificationsAPIClient` → C). `RoomsAPIClient.swift` is in no lane's row, and SP-14
cannot be delivered without it: `CreateSavedItemPayload.room_id` had to become
`String?` for a roomless mirror, and a per-user read had to exist because
`listItems(forRoomId:)` can never see a save that has no room.

Changes made, both additive:

- `CreateSavedItemPayload.room_id: String` → `String?`
- new `RoomsAPIClient.listItems(forUserId:) async throws -> [RemoteSavedItem]`

No other lane's plank touches `saved_items`, so a textual conflict is unlikely.
**Steward: confirm no other lane edited this file before merging A.**

## 2. New files added under directories A owns

- `Core/Persistence/StoryReadStore.swift` (SP-18)
- `Core/Persistence/LocalStoreClaim.swift` (SP-06)
- `Features/Collections/Views/LocalStoreClaimSheet.swift` (SP-06)
- `PatinaTests/BrowseGridContractTests.swift` (SP-02)
- `PatinaTests/SavedItemMirrorTests.swift` (SP-14)

`Patina.xcodeproj` uses `PBXFileSystemSynchronizedRootGroup`, so none of these touch
the pbxproj (critique §(c), verified: `git status` shows no pbxproj change).

## 3. SP-03's share subject/message — for lane C

`Features/ProductDetail/Views/ProductDetailView.swift:120-123` (A's file) still reads:

```swift
ShareLink(
    item: Self.shareURL(for: product),
    subject: Text(product.name),
    message: Text("\(product.name) by \(product.makerName) on Patina")
)
```

Two notes for C, who owns SP-03:

1. `product.makerName` here is the **vendor** name and can be the literal
   `"Unknown"`. SP-10 added `product.resolvedMakerName: String?` — the maker from
   `products.brand` with the vendor as fallback, and `nil` when neither resolves.
   The share message should read
   `"\(product.name) by \(maker) on Patina"` only when `resolvedMakerName` is
   non-nil, and `"\(product.name) on Patina"` otherwise. A has NOT changed the
   share copy — that is C's plank.
2. `Self.shareURL(for:)` still calls `PatinaDeepLinks.productURL(forProductId:)`.
   Repointing it at `PatinaPortalLinks.piece(id)` is C's edit; A left it alone.

The same `PatinaDeepLinks.productURL` call also appears in A's
`Features/Recommendations/Views/RecommendationsView.swift` card menu and in
`Features/Collections/Views/CollectionsView.swift` (the saved row's `shareURL:`).
**C: name the replacement and A's owner will apply it, or apply it at integration —
three call sites, all one-line.**

## 4. `SurfaceKeys.IOSApp.Profile.matchPercentage` is now unreferenced — for lane C

SP-18 removed Profile's `matchStat` (see the SP-18 commit for why). Its help key is
declared in `Features/Help/SurfaceKeys.swift:229` and listed in `allKnown` at `:305`
— **C's file**. A did not touch it, and `SurfaceKeysParityTests` still passes because
that suite pins the registry set (`iOS ⊆ web`), not usage.

No action is required. If C would rather the registry carry no dead key, remove both
lines and the matching entry from `PatinaTests/SurfaceKeysParityTests.swift`'s
`expectedSurfaceKeys` in the same commit.

`Features/Profile/ViewModels/ProfileViewModel.swift:91 matchPercentage` is likewise
now unused. That file is in no lane's row; A left it rather than edit an unassigned
file. It is dead code, not a defect.

## 5. For Kody — a visible subtraction (SP-18 says to flag these)

Two numbers came off screens rather than being fixed, because no data can support them:

- **The room's `0 IN AR` stat.** `get_recommendations` hard-codes `usdz_url` to
  `NULL::text` (00246:283) and the direct fetch hard-codes it nil, so `hasARModel`
  is false on every path — the stat could only ever be zero. The AR *button* on the
  piece detail is already correctly gated on `hasARModel` and simply never draws; A
  left it in place rather than delete a control that would come back the day a
  product carries a model.
- **Profile's `MATCH` stat.** It printed `styleProfile.confidence` — the quiz's
  confidence in its own reading — under a label claiming a match against nothing the
  screen names (63% signed in, 48% on the same device signed out). The plank offered
  "the rationale the app computes, or comes down"; the app computes no rationale
  here, so it came down. `Rooms` and `Saved` remain.

## 6. Environment findings from the lane's sim check (not defects in this lane's work)

- **The password sign-in sheet does not open on a fresh clone.**
  `auth.welcome.passwordButton` is present and hit-testable
  (`{{127.7, 619}, {147, 14.7}}`) but tapping it leaves the gate on screen, across
  four attempts at three coordinates and delays up to 4 s. Consequence: A's sim check
  ran the **guest** lane throughout (which is what the brief routes piece/grid checks
  to anyway). The money/studio/saved checks that need `client@patina.dev` could not be
  run from this clone. Worth the walker's attention before the wave walk.
- **`xcodebuild test` returns exit 144 / `** BUILD INTERRUPTED **` on the first
  invocation after an `ios-gate.sh build`, and passes on an immediate identical
  retry** (seen 4×; twice the interruption came *after* `Test run with N tests …
  passed` had already printed, i.e. during teardown). `ios-gate.sh build` writes to
  the **shared default DerivedData** (`~/Library/Developer/Xcode/DerivedData/
  Patina-…`), not the lane's `-derivedDataPath`, so all three iOS lanes are writing
  to one directory. Steward: expect this, and re-run rather than treat it as a
  failure. Every result reported by A is from a run that printed a `Test run with …
  passed` line.
- **The browse card's `.contextMenu` does not accept simulated taps** through the
  blitz harness: the menu opens, `scan_ui` reports every item with a real frame, and
  taps at those coordinates leave the menu open (5 attempts, tap and swipe, durations
  60–1200 ms). SP-11's "Add to room" is therefore proven **present and correctly
  gated** (`shots/w1b-a-09-card-menu-add-to-room.png` — it draws only because a room
  exists) but the tap-through and the resulting room count are **not sim-verified**.
  Same class of constraint as `feedback_chrome_automation_qa_constraints`.

## 7. Not exercised by A, and why

- **SP-06's claim sheet** (`LocalStoreClaimSheet`) could not be shown on the
  simulator: it presents on the first sign-in of an install that carries guest work,
  and sign-in does not complete on this clone (see §6). Its decision
  (`LocalStoreClaim.shouldAsk`) is unit-pinned four ways in `AccountIsolationTests`;
  the sheet itself is **compile-green only**.
- **SP-14's remote mirror** writes to `saved_items` as the signed-in user; guest has
  no account, so the mirror path is compile-green + unit-pinned
  (`SavedItemMirrorTests`), not sim-verified. The local half (idempotent save, seeded
  `isSaved`, one currency formatter) is unit-pinned.
- **No device claims** of any kind from this lane.

## 8. Fix round — SP-10's withhold depends on lane D's 00533 (seam, no file change asked)

`ProductAPIClient.withholdingUnresolvedMakers` (commit `4b1f7ed59`) drops a feed row whose
maker resolves from neither `products.brand` nor a real vendor name. **Before 00533 the RPC
does not return `brand`**, so on a pre-00533 database the filter falls back to the vendor
join alone and withholds every row the RPC labels `Unknown Maker` — four of the ten seeded
rows, measured. After 00533 (already applied on the local stack) all ten resolve and nothing
is withheld.

No change is requested in any lane D file: 00533 is already minted with `brand`, which is
exactly what this needs. Recorded so the **merge order D → A holds** — landing A ahead of D
would visibly thin the feed on a database that has not been migrated yet.

Also in the fix round: guest saves no longer attempt the `saved_items` mirror at all
(`SavedItemMirror.shouldAttempt`), so §7's "SP-14's remote mirror … not sim-verified" now
reads more precisely — the guest's **local** save is sim-verified end to end
(`shots/w1b-a-10`, `w1b-a-11`); the signed-in mirror remains unit-pinned only.

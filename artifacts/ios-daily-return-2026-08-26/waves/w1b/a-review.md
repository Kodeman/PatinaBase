# W1b · Lane A (piece & saved) — adversarial review

Reviewer: separate context, read-only (`git diff main...HEAD`, `git log`, `a-tasks.md`,
`a-notes.md`, `steward.md`, the implementer's report). No build, no commits.

Base: `main` @ `5b5c0c054`. Branch tip: `00362b443` (8 commits).

Planks in scope: SP-02, SP-06, SP-10 (client half), SP-11, SP-12, SP-14, SP-18.

## Summary

Lane A is well-built and disciplined in its git hygiene, its owned-file compliance, and most of
its honesty-rule execution (SP-02, SP-18, SP-06, SP-12 all land cleanly and match the plank text).
It has **one confirmed, undisclosed regression that breaks guest saving from the browse grid** —
the exact loop SP-14 exists to fix, and a direct violation of SP-14's own stated risk ("keep the
local store authoritative until sign-in... or the two planks will fight"). It also has one
confirmed partial delivery (SP-10's "withhold a product with no resolvable maker from the feed" is
not implemented — the maker line is blanked, but the product still ships). Neither is mentioned in
the implementer's report, notes, or shot ledger; both are inside the suites the report claims are
green, but neither is covered by a test that actually exercises the failure path.

Verdict on the acceptance line "no defects found" implied by the report: **not clean.** One
Major-severity confirmed bug should go back to the implementer before this lane merges.

---

## Findings

### 1. CONFIRMED — Major/Blocking. Guest saves from the browse grid (and "Add to room") now
silently delete themselves and show a false "connection" error, because SP-14's mirror was made
unconditional without SP-06's guest carve-out.

**File:** `apps/mobile/Patina/Patina/Features/Recommendations/ViewModels/RecommendationsViewModel.swift`,
`saveProduct(_:context:roomRemoteId:roomLocalId:)` (commit `108ca7f94`).

**Mechanism, verified line by line:**

1. `saveProduct` now calls `RoomsAPIClient.shared.resolveUserId()` unconditionally, for every
   save — not only room-scoped ones (this was the intended fix: "mirror to `saved_items` with a
   null room, not only room-scoped ones"). Verified diff: the old `if let roomRemoteId { Task {
   ... } }` guard is gone; the `Task` now always runs.
2. `resolveUserId()` (`Core/Network/RoomsAPIClient.swift:338-341`) is:
   ```swift
   public func resolveUserId() async throws -> String {
       guard let uid = await currentUserId() else { throw RoomsAPIError.notAuthenticated }
       return uid
   }
   ```
   `currentUserId()` (`:188-193`) checks the Supabase session, then
   `AuthService.shared.currentUserId` (`Services/Auth/AuthService.swift:28-30`,
   `session?.user.id.uuidString`) — both `nil` for a guest with no session. **A guest always
   throws `notAuthenticated` here.**
3. `saveProduct`'s catch block (unchanged in shape from before, but now reachable on every guest
   save, not only room-scoped ones):
   ```swift
   await MainActor.run {
       self.savedProductIds.remove(product.id)
       context.delete(item)
       self.showSaveFailure()
   }
   ```
   deletes the just-created local `TableItemModel` and calls `showSaveFailure()`, which sets
   `saveFailureMessage = "Couldn't save — check your connection and try again."`
   (`RecommendationsViewModel.swift:256`).

**Net effect:** a guest tapping the heart on a browse-grid card, or "Save" in the card's context
menu, or "Add to room" (which routes through the same `saveProduct`, see
`RecommendationsView.addPiece`) sees the heart fill in, then a moment later the save reverts and a
banner reads "Couldn't save — check your connection and try again." The claim is false — the
guest's connection is fine, they are simply not signed in — which is itself a C5 honesty problem
(a fabricated reason) layered on top of the functional regression.

**This is new, not pre-existing.** On `main`, the mirror `Task` only ran `if let roomRemoteId`,
so a guest saving from the unscoped grid (no room context, no `remoteId`) never attempted the
network call and never hit the revert branch — the save stayed local and succeeded. Confirmed by
reading `main`'s version of the same function via `git show main:...`.

**Inconsistency with the lane's own other save path.** `ProductDetailViewModel.toggleSave`
(commit `108ca7f94`, same commit) makes the *identical* choice — mirror on every save, room or
not — but its failure handler only logs (`#if DEBUG ... PatinaLog.ui.error(...)`) and does **not**
revert the local save or show a banner. That is the correct behavior per SP-14's risk note. The
grid path should match it and does not.

**Why this wasn't caught:** the walk ran guest-only (per `a-notes.md` §6, the password sheet does
not open on this clone), and the grid's own shot ledger entries (`w1b-a-02`, `w1b-a-09`) show the
grid rendering and the card menu opening, but no shot shows the outcome of an actual heart-tap or
a completed "Add to room" flow (the `.contextMenu` tap-through is separately blocked by the
harness, per `a-notes.md` §6, and is disclosed as unverified — but the *heart* button, which is a
plain `Button` and not a context menu, was tap-able and was not exercised either). No unit test
awaits the `Task` inside `saveProduct` and asserts on the reverted state — `SavedItemMirrorTests`
only pins payload encoding and formatter equality, never calls `saveProduct` itself.

**Confidence:** high — traced through three files to the exact throw site and the exact revert
site, cross-checked against `main` to confirm it's a regression, and cross-checked against the
sibling `ProductDetailViewModel` implementation that gets it right.

**Fix suggestion for the return round:** drop the revert-on-failure branch in
`RecommendationsViewModel.saveProduct` (match `ProductDetailViewModel.toggleSave`'s silent-log
behavior), or gate the mirror attempt on `AuthService.shared.isAuthenticated` before calling
`resolveUserId()` so an unauthenticated guest never enters the failure path at all.

---

### 2. CONFIRMED — Major. SP-10's "withhold a product with no resolvable maker from the feed" is
not implemented; the plank's stated repair is only half-done.

**Plank text (`shared-planks.md` SP-10):** "Source the maker line from `brand` with the vendor as
fallback, and **withhold a product with no resolvable maker from the feed** instead of shipping it
as `"Unknown Maker"`."

**What shipped:** `Product.hasResolvableMaker` / `resolvedMakerName` are computed and used to
*hide the maker line* on the card and detail screen (`resolvedMakerName.map { ("Maker", $0) }`,
`resolvedMakerName ?? "\u{00A0}"`), and to gate VoiceOver's maker mention. Verified with `grep -rn
"hasResolvableMaker"` across the app and tests: it appears only in `ProductModel.swift` (the
computed property itself) and `ProductDecodingTests.swift` (unit assertions on the property).
**It is never read by `RecommendationsViewModel.loadRecommendations`, `RecommendationsView`'s grid
rendering, or any filter** — a product with no resolvable maker still renders as a full card in
the grid, with a non-breaking space where the maker line would be, rather than being withheld.

This is a real improvement over the previous "Unknown Maker" text, but it is not the plank's
instruction, and the implementer's report does not flag the gap or explain the substitution — it
reads as delivered ("SP-10 renders REAL data today...") without noting this one clause was
dropped.

**Confidence:** high — grep-verified absence of any feed-level filter.

---

### 3. Minor — no violation, but a note for the steward. `RoomsAPIClient.swift` is claimed
outside the owned-file map, documented correctly.

`a-notes.md` §1 discloses this exactly as the process requires (file, exact change, why, and asks
the steward to confirm no other lane touched it). The two changes
(`CreateSavedItemPayload.room_id: String?`, new `listItems(forUserId:)`) are additive and, per the
diff, the only edits to that file. **No action needed from this review** — flagged only so the
steward's confirmation step isn't skipped. Not a lane-A defect.

---

### 4. Minor — honesty nit. The false failure copy compounds finding #1.

`"Couldn't save — check your connection and try again."` is shown for *any* mirror failure,
including `RoomsAPIError.notAuthenticated`. Per finding #1 this currently fires for every guest
grid-save, but even after that's fixed, the same generic copy would also fire for a genuinely
unauthenticated-but-should-be-signed-in edge case (expired session) and blame the network. Once
finding #1 is fixed (guest path no longer reaches this branch), this is lower stakes, but the
implementer should confirm the remaining failure modes that reach `showSaveFailure()` are actually
connection-shaped (HTTP failures, timeouts) and not auth-shaped, or the message is still
occasionally false — a C5 concern the plank explicitly cares about elsewhere (SP-15's "never
vendor/system error text").

**Confidence:** medium — contingent on how finding #1 is fixed.

---

## What checks out (verified, no finding)

- **Owned files.** Every file in the diff (`git diff main...HEAD --name-only`) is inside lane A's
  `steward.md` §6.1 map except `RoomsAPIClient.swift`, which is disclosed as an integration note
  per finding #3. No `pbxproj` change (confirmed: `PBXFileSystemSynchronizedRootGroup`, five new
  `.swift` files under synchronized directories). No file belonging to another lane's row was
  touched.
- **Commits.** All eight are Conventional Commits, each pathspec-restricted, and `git show --stat`
  for every commit matches its stated scope (verified all eight).
- **Tests are real and additive, not padding.** Counted every new `@Test` in the six new/changed
  suites: `ProductDecodingTests` +5, `BrowseGridContractTests` +4 (new file), `SavedItemMirrorTests`
  +5 (new file), `CompanionActionMatrixTests` +3, `DailyRoomFeedMappingTests` +3,
  `AccountIsolationTests` +4 — sums to the report's claimed +24 exactly. Each test references types
  or behavior that do not exist on `main` (`LocalStoreClaim.shouldAsk`, `StoryReadStore`,
  `RecommendationsViewModel.category(forFilter:)`, the ten new `Product` spec properties), so they
  would fail to compile — let alone pass — before this lane's changes: genuinely failing-without-
  the-change tests, not tautologies.
- **SP-02** (grid geometry). The stated mechanism (`PatinaAsyncImage`'s `.aspectRatio(.fill)`
  reporting an oversized child, `.frame(maxWidth: .infinity)` not clamping it) is verified against
  the actual pre-change code, and the fix (`Color.clear.overlay { image... }.clipped()`) is a
  correct SwiftUI pattern for constraining an oversized child to its proposal. One card aspect
  (4:3), `reservesSpace: true` on the two text lines, and a trailing-fade chip scroll all match the
  plank. Chip category now sent as `p_category` (RPC already accepted it, verified), subtitle
  copy changed "curated" → "chosen" exactly as specified.
- **SP-06.** `shouldWipeLocalStore`'s three existing cases are untouched (confirmed no diff inside
  that function); the new `LocalStoreClaim.shouldAsk` is a pure, unit-pinned decision matching the
  plank's four cases (first sign-in with guest work asks; empty store doesn't; a second real
  account doesn't — that branch wipes instead; same account relaunching doesn't). The claim sheet
  is hosted on `CompanionOverlay` (the one `.main`-phase-global surface, matching the plank's
  intent) and its dismiss-without-choosing path calls `keep()`, matching the report's claim
  ("Dismissing without choosing keeps"). Sheet UI itself is correctly disclosed as compile-green
  only, not sim-verified (the auth sheet doesn't complete on this clone — an environment issue, not
  a lane-A defect).
- **SP-12.** `collectionsRow` now returns a row unconditionally with an honest empty hint ("Nothing
  saved yet"); `CollectionsViewModel.defaultTab(boardCount:)` correctly defaults to "All items" at
  zero boards; `addToBoard` gets a real caller via `ProductCard`'s new `boardTargets` /
  `onAddToBoard` — wired from `CollectionsView`'s saved-item context menu, the only place a saved
  item and a board list are both in scope. Matches the plank.
- **SP-18.** The AR stat cell is removed from `RoomProjectView.statRow` (verified `usdz_url` is
  hard-coded `NULL::text` server-side and `nil` on the direct fetch, so the number could only ever
  be zero — the removal is justified, not cosmetic). "Match" is relabeled "Room match" so it names
  what it matches against, consistent with the plank's "or drop it" branch chosen for Profile's
  stat (which is removed outright, correctly, since the app computes no rationale). `StoryReadStore`
  is a small, correctly-scoped `UserDefaults` wrapper; `nextStoryId` correctly falls back to the
  ordered list's head once everything is read (verified by `DailyRoomFeedMappingTests`'s
  `theHomeServesAStoryTheReaderHasNotOpened`, which cycles through all three and confirms the wrap).
  `DailyStoryDetailView` marks read on `.task`, closing the loop.
- **SP-11.** `AddToRoomSheet` — previously mounted nowhere — is now mounted from the card menu,
  gated on `!roomOptions.isEmpty` (drawn only when a room exists, matching the plank and the
  report's shot `w1b-a-09`). The honest failure line ("Added to \(room.name) on this phone. It
  will reach your account once the room syncs.") fires exactly when `target.remoteId == nil`,
  which is the correct signal. The room's stacked "triple ask" is genuinely collapsed to one CTA
  (verified against `main`: the body-copy `Text` is removed, the button's title and destination
  logic are preserved unchanged). One deviation from the plank's literal instruction ("sync it
  before offering the CTA") — the shipped version always offers the CTA and reports the sync state
  afterward rather than syncing proactively first — is a defensible reading of the plank's own risk
  note ("say so on screen rather than falling back silently") and not flagged as a finding.
- **Absent-honestly rule (SP-10).** `ProductModel`'s new columns decode as optionals via `try?`,
  so a differently-shaped `dimensions` jsonb cannot fail the whole row (verified:
  `dimensions = try? container.decodeIfPresent(...)`); `dimensionsLine`/`leadTimeLine` return `nil`
  rather than a placeholder, and the view's `specRows` omits each row when its value is `nil` (no
  em-dash, no zero, no "TBD" — verified against the view code and the `w1b-a-04` shot description).
  Direct piece fetch reads real data today without waiting on 00533, because `productSelect` already
  uses `*` (verified) — matches the report's claim.
- **Currency formatting (SP-14).** All three formatters (`Product.fullFormattedPrice`,
  `SavedItem.fullFormattedPrice`, `TableItemModel.formattedPrice`) now route through the same
  `PatinaCurrency.formatWholeDollars(cents:)`, a pre-existing shared utility (confirmed it predates
  this lane, used elsewhere in Invoices/Proposals/Budget) — not a new formatter invented for this
  plank, consistent with "one currency formatter."
- **Idempotent save (SP-14).** `ProductDetailViewModel.toggleSave` and
  `RecommendationsViewModel.saveProduct` both guard on existing local rows before inserting
  (`storedItems(productId:...)` / `savedProductIds.contains`), so a second tap does not create a
  second `TableItemModel`. `seedSavedState` is called from both view models' `.task`/`.onAppear`
  paths so a piece saved on a previous visit correctly starts in the saved state.
- **Brand voice / canonical names.** No vendor or system error text found anywhere in the diff
  (aside from finding #4's generic-but-not-vendor-specific copy). No fabricated numbers, streaks,
  or countdowns. Copy changes ("chosen for your space", "Nothing saved yet", "Browse pieces for the
  <Room>", the claim sheet's two sentences) all read in Patina's voice and match the plank's
  suggested copy verbatim where the plank gave exact strings.
- **Gate claim.** Cannot re-run the gate (reviewer is read-only, no build), but the reported test
  delta (+24, broken down by suite) is independently reconstructible from the diff and matches
  exactly — no reason to doubt the reported `Test run with 695 tests in 88 suites passed`. The
  report's "did NOT run `ios-gate.sh all`/`lint-delta`" is correct per `steward.md` §4 (steward-only
  this wave).

## Not re-litigated

The implementer's own "failures" and "not exercised" sections (`SP-11`'s tap-through, `SP-06`'s
sheet presentation, `SP-14`'s remote mirror, the environment issues in `a-notes.md` §6) are
accurate as far as this review can verify from the diff and are not repeated here as findings —
they are honestly disclosed limitations, not defects.

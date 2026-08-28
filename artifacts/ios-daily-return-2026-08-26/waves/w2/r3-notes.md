# W2 R3 — Integration notes

For the wave's integration steward and other lanes. Full evidence and commands are in
`waves/w2/r3-tasks.md`; this file is the short "file, exact diff, why" version.

## 1. `HomeStoryRetryRow` re-homed — no action needed from R2

**File:** new `Patina/Features/Home/Views/HomeStoryRetryRow.swift`; deleted
`Patina/Features/Home/Views/DailyRoomStateBlocks.swift` (which held it, alongside two dead structs).

**Diff:** the struct moved verbatim (same body, same `let onRetry: () -> Void` signature). Header
comment rewritten to say why it moved.

**Why:** `DailyRoomStateBlocks.swift` was the Q4 orphan composition's root file
(`HomeStudioBlock` — dead, assembled `StudioHubSection`/`MarketplaceLinksSection`/`WorkWithDesignerCTA`
— plus `HomeFilteredFeedEmpty` — dead), but it also held a **third, live** struct the build plan and
critique never named: `HomeStoryRetryRow`, called from `DailyRoomView.swift:196` on a story-load
failure (U29). Deleting the file wholesale would have broken R2's build. Extracted it into its own
file instead.

**Action needed from R2/the steward: none.** The type's signature is unchanged and Swift resolves it
by name within the target regardless of which file defines it — `DailyRoomView.swift:196`
(`HomeStoryRetryRow(onRetry: { viewModel.refreshTodaysStory() })`) compiles against the new file
without any edit. Flagging only so nobody is surprised to find `HomeStoryRetryRow.swift` as a new file
in a lane whose brief said "delete the composition."

## 2. A second, unaddressed AR dead-end — out of R3's granted scope, worth knowing about

**File not touched:** `Patina/Features/Companion/Services/CompanionContextProvider.swift`.

Task 2 (`waves/w2/r3-tasks.md`) removed the Companion **menu row** "Try in your room" (analyticsId
`try_in_room`) from `discoveryItems()` in `CompanionAreaBuilders.swift` — that surface dead-ends on
every product while `usdz_url` is NULL. There is a **second, separate** surface with the same problem:
`CompanionContextProvider.nudge(for:context:)` (lines ~272-280) renders a persistent pill, `"Try in
your room →"`, above the resting Companion mark for `.emergence`/`.roomEmergence` whenever
`context.viewingPiece` is set, routing to the same dead `.arPlacement` destination. This is a different
mechanism (the nudge pill, not a menu row) in a file outside R3's granted scope for this carry-over
("CompanionAreaBuilders / CompanionActionRows are yours for this one edit" — steward.md/brief,
verbatim). Not fixed here. Whoever next touches `CompanionContextProvider.swift` should know the same
`usdz_url`-is-always-NULL fact applies to this pill too.

## 3. `AddToRoomSheet.swift` / `AddedToRoomToast.swift` — confirmed untouched

Both remain exactly as they were at base `e9da02569`. Confirmed live via
`ProductDetailViewModel.swift` (per `build-plan-critique.md` M1b's one still-accurate citation) and
excluded from R3's set per `waves/w2/steward.md` §7. No diff.

## 4. Test suites checked and left alone, with the reason on record

- `CompanionActionMatrixTests.homeStudioRow*` (three tests) — pin `CompanionActionProvider.actions(...)`
  containing/excluding `"Your studio"`, the **live** Companion row from `CompanionActionRows.swift`'s
  `studioRow()`. Confirmed via `grep -n "HomeStudioBlock\|StudioHubSection\|…"
  PatinaTests/CompanionActionMatrixTests.swift` → zero hits. Not the deleted `HomeStudioBlock` SwiftUI
  struct, despite the similar name. Left untouched.
- `DailyRoomFeedMappingTests.swift` — tests `DailyRoomViewModel.recommendation(from:)`, a `Product` →
  `DailyRecommendation` mapping. Zero references to any of the twelve Q4 symbols. Left untouched.

## 5. Files touched this lane, for the merge order (§10 of steward.md: D → R1 → R3 → R2)

| Commit | Files |
|---|---|
| `refactor(ios): retire the July home rail (Q4)…` | 10 deletions in `Features/Home/Views/`, 1 deletion in `Features/DesignServices/`, 1 new file `Features/Home/Views/HomeStoryRetryRow.swift` |
| `fix(ios): retire the Companion's dead AR quick action…` | `Features/Companion/Services/CompanionAreaBuilders.swift`, `PatinaTests/CompanionActionMatrixTests.swift` |
| `fix(ios): accepted-but-unsigned proposal shows checkmark.circle…` | `Features/Proposals/Views/ProposalDetailView.swift`, new `PatinaTests/ProposalDetailStatusIconTests.swift` |

**`ProposalDetailView.swift`** (steward.md §8): R2 owns line 39 (`.moneyScreenTopBand()` →
`PatinaScreenChrome` fold); R3 owns line 83's region (the seal-glyph fix, landed here as a new
`statusIcon(for:justSigned:)` static func plus the one call-site swap). Steward merges R2 before R3 on
this file per §8's rule; if R2's branch has already touched the file by merge time, re-apply R3's
`statusIcon` addition + the `Image(systemName:...)` call-site change by hand — it is a small, additive
diff (12 lines) that should not conflict with a top-band-only change at a different line.

Nothing else in this lane's diff touches a file another W2 lane owns.

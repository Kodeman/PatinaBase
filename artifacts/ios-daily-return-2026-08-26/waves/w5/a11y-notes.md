# W5 — lane A11Y — note for C1 (and the steward)

Branch `daily-return/w5-a11y`, from `daily-return/w5-d`.

## Files this lane writes

Only these three, plus their tests:

- `apps/mobile/Patina/Patina/Features/Companion/Components/CompanionHearthView.swift`
- `apps/mobile/Patina/Patina/Features/Companion/Views/CompanionOverlay.swift`
- `apps/mobile/Patina/Patina/Design/Components/CompanionSafeArea.swift`
- `apps/mobile/Patina/PatinaTests/CompanionSheetDriverTests.swift` (new assertions)
- `apps/mobile/Patina/PatinaTests/ChromeReachTests.swift` (one pin re-anchored — see below)

**No `CompanionAreaBuilders` edit.** Nothing in this lane needs it.

## The one thing C1 should know

`CompanionHearthMetrics` gained two constants and two functions. If C1's order sheet or piece
screen reserves bottom clearance, use the new function rather than the old constant:

```swift
CompanionHearthMetrics.reservation(accessibilityText: dynamicTypeSize.isAccessibilitySize)
```

- `reservedHeight` (120) and `dockHeight` (140) are **unchanged** — every existing call site keeps
  its number, and `pinnedFooterClearance(houseFirst:)` is untouched, so the money screens' clearance
  is exactly what W1b/W3 walked.
- New: `minimalDiameter` (44), `minimalDockHeight` (72), `yieldsToAccessibilityText(_:)`,
  `reservation(accessibilityText:)`.

The behavioural change C1 will see on a piece screen: **nothing new.** `pieceDetail` already
returned `.minimal` at every text size, so the Companion there is the same corner mark it was. The
new yield only changes routes that used to draw the full dock — Today, Your Spaces, the Studio, and
so on — and only at `.accessibility1`…`.accessibility5`.

If C1's order sheet is a `.sheet`, the Companion overlay is behind it and none of this reaches it.

## Re-anchored pin (steward, for the merge)

`ChromeReachTests.hearthReservationDrawsNothing()` scoped its C8 "reserved region, never a painted
bar" pin between `func companionHearthReservation` and `func companionSafeArea`. The reservation's
body moved into a `private struct CompanionHearthReservation: ViewModifier` — a plain `View`
extension cannot hold the `@Environment(\.dynamicTypeSize)` the height now reads. The pin's two
anchors moved to `struct CompanionHearthReservation` … `extension View {`; its four assertions are
unchanged and still green. Flagging it because it is the only test outside this lane's own suite
that this lane touched, and because a reviewer seeing a ChromeReach diff should know why.

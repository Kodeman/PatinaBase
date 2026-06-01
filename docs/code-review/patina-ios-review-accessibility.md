# Patina iOS — Accessibility Audit

**Date:** 2026-05-30
**Scope:** `apps/mobile/Patina/Patina/` — VoiceOver, Dynamic Type, Reduce Motion, contrast, hit targets
**Track:** 3 of 4 (parallel review tracks)
**Companion docs:** [Engineering](./patina-ios-review-engineering.md) · [Visual & UX](./patina-ios-review-design.md) · [Information Architecture](./patina-ios-review-ia.md) · [Sprint Plan](./patina-ios-sprint-plan.md)

---

Audit scope: ~300 Swift files under `apps/mobile/Patina/Patina/`. Methodology: ripgrep-driven pattern discovery + targeted reads of high-traffic components, gestures, animations, and design tokens. Severity is tagged 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low.

## Headline assessment

**Overall grade: D+.** The app has a small but high-quality "accessibility seed" — the Help system (`HelpInfoIcon`, `HelpTooltip`, `HelpCoachmark`), the Style-Conversation flow (`StyleSwatchCell`, `StylePillButton`, `PriorityView`), and the entire RoomScan stack (`ScanWalkView`, `ScanHUDView`, `WhisperBarView`, `EdgeToastView`) treat accessibility as a first-class concern: labels, traits, `.combine`, and `accessibilityReduceMotion` are all wired up correctly. Outside those islands, however, the rest of the app systematically ignores accessibility. Only ~30 of ~300 Swift files (10%) contain any `accessibilityLabel`. The most-used components on the most-visited surfaces — the Companion overlay, the Table, Collections, Recommendations, Notifications, Profile/Settings, Walk, Receiving, Room rows — are full of unlabeled image-only buttons, 28–36pt touch targets, fixed point-size fonts that don't scale with Dynamic Type, color-only state signals, and brand colors that fail WCAG AA contrast on the canonical `offWhite` background. The `PatinaColors.clay` (the primary "interactive" tint) scores **2.18:1** against `offWhite` — below AA-large (3:1) and well below AA-normal (4.5:1). The custom physical/gestural interactions (Linger, Hold, swipe-to-save, scatter drag) have zero accessible alternatives — there is not a single `accessibilityAction` or `accessibilityValue` in the codebase. Fixing the patterns is straightforward; the codebase clearly knows how (see Help/Style flows for templates), the discipline has just not been applied consistently.

## Critical & high-severity findings

### 1. 🔴 The Companion — primary navigation — has unlabeled controls and one undeclared button

`Features/Companion/Views/CompanionOverlay.swift`

- **`companionMark` (lines 400–421)** is the app's primary nav (replaces the tab bar). It's a 52-pt charcoal circle decorated with strata lines, made tappable via `.onTapGesture { expandToPanel() }` at line 193. With `onTapGesture` and no `accessibilityAddTraits(.isButton)` + no `accessibilityLabel`, VoiceOver will either skip it entirely or read raw geometry. This is the entry point to every action in the app.
- **Header "close" button (lines 265–275)** is a 28×28 circle with `Image(systemName: "xmark")` and no `accessibilityLabel`. (The sibling "help" button two blocks above is correctly labeled — see line 261–263 — so the pattern is known.)
- **Two 28×28 buttons** in the panel header are under Apple HIG's 44×44 minimum.

Fix sketch (add to `companionMark` callsite):

```swift
restingView
  .accessibilityLabel("Companion")
  .accessibilityHint("Opens actions for the current screen.")
  .accessibilityAddTraits(.isButton)
```

And on the close button: `.accessibilityLabel("Close")`. Wrap both 28pt circles in `.frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())` (the pattern the Help system already uses — see `HelpInfoIcon.swift:96`).

### 2. 🔴 Custom gestures have no accessible alternative anywhere in the app

`Design/Gestures/LingerGesture.swift`, `Design/Gestures/HoldGesture.swift`, `Design/Gestures/CompanionPullGesture.swift`, plus uses in `Features/Recommendations/Views/RecommendationsView.swift:148-167` (swipe right = save, swipe left = skip), `Features/Table/Components/TableItemCard.swift:155-185` (drag-to-position), and the `companionLongPressGesture` voice activation (`CompanionPullGesture.swift:88`).

There are **zero** `accessibilityAction(named:)` calls in the codebase (verified with `rg "accessibilityAction" --type swift` → no matches). A VoiceOver user therefore cannot:

- Save / skip a recommendation (swipe-only).
- Reposition a piece on the Table.
- Reveal progressive product info via Linger.
- Confirm a threshold via Hold (only works as a long-press without an alternative one-tap path).
- Activate the Companion voice input (long-press only).

This is the single highest-impact bucket of work. Pattern from Apple HIG: pair every custom gesture with a `.accessibilityAction(named: "Save") { … }` and/or a visible button alternative when VoiceOver is running (`UIAccessibility.isVoiceOverRunning`).

### 3. 🔴 Inline `Color(hex:)` for the primary interactive tint fails WCAG AA on the canonical background

`Design/Tokens/PatinaColors.swift:20` defines `clay = #C4A57B` and `offWhite = #FAF7F2`. Computed contrast ratio: **2.18:1**. WCAG AA requires 4.5:1 for normal text and 3:1 for "large text" or non-text UI elements (icons, focus rings, button strokes). Clay is used as:

- "Save" / "Mark all read" actions in `CollectionsView`, `NotificationFeedView`, `ReceiveDeliveryView`, `Designer*` empty-state CTAs.
- The "Continue" button background in `PatinaButton.style == .clay`.
- All "match label" pills, "MonoLabel" maker tags, "ETA" / "PO" metadata in `ReceiveDeliveryView`.
- The unread-notification background tint at `clay.opacity(0.04)` → blended luminance ratio **1.03:1** vs. `offWhite` (`NotificationFeedView.swift:170`) — effectively invisible.

Computed ratios vs. `#FAF7F2`:

| Token | Hex | Ratio | WCAG |
|---|---|---|---|
| `clay` | C4A57B | 2.18 | FAIL |
| `agedOak` | 8B7355 | 4.20 | AA-large only |
| `sage` | A8B5A0 | 2.01 | FAIL |
| `terracotta` | D4A090 | 2.13 | FAIL |
| `goldenHour` | E8C547 | 1.57 | FAIL |
| `success` | 7A9B76 | 2.90 | FAIL |
| `warning` | D4A574 | 2.08 | FAIL |
| `error` | C77B6E | 3.03 | AA-large only |
| `mocha` | 5C4A3C | 7.86 | AAA |
| `charcoal` | 2C2926 | 13.53 | AAA |

Mocha and charcoal are fine. Every other color in the brand palette fails AA on the primary background. Most damaging real-world example: `Features/ScanReview…` placeholder uses `agedOak.opacity(0.7)` over `softCream` — effective 2.47:1.

Fix: darken `clay` to ~`#9F7E48` (≈4.5:1), reserve the current shade for non-text decoration only, and define an explicit `PatinaColors.Text.interactiveOnLight` token used everywhere `clay` is currently used as text/icon. The "status" colors (success/warning/error) should also have darker text variants.

### 4. 🔴 Image-only buttons across the app are systematically unlabeled

Confirmed pattern: out of ~44 image-only buttons (verified via `rg "Button\s*\{" --type swift -A 4 | rg -B 1 "Image\(systemName"`), roughly half are unlabeled. Examples:

- `Features/Collections/Views/CollectionsView.swift:34-40` — "+" button to create a board, no label.
- `Features/Walk/Views/WalkView.swift` (`xmark` close, line near `dismiss()`) — no label.
- `Features/Emergence/Views/EmergenceView.swift` (`xmark` close) — no label.
- `Features/Messaging/Views/ThreadDetailView.swift` — `arrow.up.circle.fill` send button — no label.
- `Features/Companion/Components/InputBar.swift:55-64` — send button (the `arrow.up.circle.fill`) — no label.
- `Features/Recommendations/Views/RecommendationsView.swift:108-119` — 30×30 heart "save" button — no label.
- `Features/QRAuth/Views/QRScannerView.swift` — both the close and help "?" buttons are unlabeled (verified the help one is unlabeled despite being mirrored in DesignerHomeView with a label).
- `Features/Profile/Views/ProfileView.swift:225-230` — settings gear at 32×32, unlabeled (the help button in the same view *is* labeled — inconsistency within one file).
- `Features/Receiving/Views/ReceiveDeliveryView.swift` — `xmark.circle.fill` to remove a photo, unlabeled.
- `Features/RoomDetail/Views/ShareScanSheet.swift` — two `xmark.circle.fill` (close + clear search), unlabeled.

Fix: add `.accessibilityLabel("…")` immediately after every Button whose label is just an `Image`. Suggested project-wide convention: SwiftLint/SwiftFormat rule that flags `Button { … } label: { Image(systemName: …) }` without a sibling `.accessibilityLabel`.

### 5. 🔴 Dynamic Type is broken across the majority of feature views (300+ font calls)

The design tokens in `PatinaTypography.swift` are correctly defined with `relativeTo:` so they scale (e.g. `bodySmall = Font.custom("Inter-Regular", size: 14, relativeTo: .subheadline)`). However:

- **238 calls to `.font(.system(size: N))`** across 70+ feature files bypass tokens entirely and will not scale (e.g. `Features/Rooms/Views/RoomProjectView.swift` has 10, `ScanReviewView.swift` has 9, `Companion/Components/InputBar.swift:60` voice/send button, `Companion/Components/QuickActionsBar.swift:82` chip label `.font(.system(size: 12, weight: .medium))`, etc.).
- **158 inline `.font(.custom("Inter-…", size: N))` calls** — and **zero of them pass `relativeTo:`**. Verified: `rg "\.font\(\.custom\(.*relativeTo" --type swift | wc -l` → 0.

The single worst offender for legibility: `Features/Rooms/Components/RoomItemRow.swift:36` uses `.font(.custom("DMMono-Regular", size: 7))` for the maker name — 7pt is illegible at default Dynamic Type and will not grow. Other examples of fixed sub-14pt fonts that won't scale: `RoomItemRow.swift:41` (13pt product name), `ScanReviewView.swift:303,328` (10pt and 9pt photo counts), `Companion/Components/QuickActionsBar.swift:82` (12pt chip text).

Fix: replace `.font(.system(size: N))` with the nearest `PatinaTypography.*` token. For one-off custom sizes, always pass `relativeTo: .body` (or appropriate `Font.TextStyle`).

### 6. 🟠 The Companion is the only well-instrumented animation host; many other animations ignore Reduce Motion

`rg reduceMotion --type swift` shows the property is read in ~12 files. Coverage is excellent in `RoomScan/*`, the Companion's `companionMark` breathing scale, and `StyleReveal`. But several animation-heavy surfaces do NOT branch on it:

- `Features/Companion/Components/PulseAnimation.swift:42-49` — repeating `easeOut(1.5).repeatForever` for notification pulse with no reduce-motion guard.
- `Features/Companion/Components/InputBar.swift:115-118` (VoiceButton) — `easeInOut(1.0).repeatForever(autoreverses: true)` pulse, no reduce-motion guard.
- `Features/Conversation/Components/MessageBubble.swift:55-58` — every message animates in with `.spring(response: 0.4)`. Should be `withAnimation(reduceMotion ? nil : .spring(…))`.
- `Features/Conversation/Components/TypingIndicator.swift` — typing animation, unchecked.
- `Features/Table/Components/TableItemCard.swift:52-53` — `.spring` for drag + selection scaling, unchecked. In Scatter view this drives constant subtle animation.
- `Features/Collections/Views/CollectionsView.swift:50-52` — tab change `.spring(0.3)`, unchecked.
- `Features/Companion/Components/QuickActionsBar.swift:42-48` — staggered `.spring` chip entrance, unchecked.

The pattern in `ScanWalkView.swift` is the right model:

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion
…
.animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: trackingState)
```

### 7. 🟠 Touch targets pervasively below the 44×44 HIG minimum

Sample of buttons under 44pt (verified via `rg "\.frame\(width:\s*(2[0-9]|3[0-9]|4[0-3])"`):

| File:line | Size | Function |
|---|---|---|
| `CompanionOverlay.swift:254, 268` | 28×28 | Help + close in panel header |
| `RoomItemRow.swift:55` | 28×28 | "⋯" actions menu |
| `Recommendations…View.swift:113` | 30×30 | Heart / save |
| `ScanReviewView.swift:391` | 22×22 | Hide-photo "xmark" |
| `Profile/Views/ProfileView.swift:227` | 32×32 | Settings gear |
| `Companion/Components/QuickActionsBar.swift:85-86` | ~28pt tall (8+12+8) | Quick-action chips |
| `Design/Components/FilterChip.swift:23-24` | ~24pt tall (6+12+6) | Filter pills |
| `Companion/Components/InputBar.swift:55-64` | 24pt SF symbol w/o explicit hit area | Send button |
| `Companion/Components/ContextBar.swift:31` | 20×20 | Context icon |
| `RoomDetail/Views/RequestDesignServicesSheet.swift:137` | 28pt wide | Icon column |

Many of these are wrapped in `Button` so the hit-test extends slightly — but with no `contentShape(Rectangle())` and no `frame(minWidth:44…)`, the actual hit area is the image bounds. The `HelpInfoIcon` shows the correct pattern (`.frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())`); it has not been applied elsewhere.

### 8. 🟠 Color-only state signals

- **Notifications read/unread (`NotificationFeedView.swift:170`)**: `notification.isRead ? Color.clear : PatinaColors.clay.opacity(0.04)`. The unread tint blends to a luminance ratio of **1.03:1** vs. background — visually imperceptible AND no badge / dot / "Unread" label is added to the accessibility tree. A VoiceOver user has no way to tell read from unread.
- **`Features/Companion/Components/QuickActionsBar.swift:113-120`** — context indicator changes background fill when `hasNotification == true`, but never adds an icon, badge, or accessibility label change.
- **`Features/Rooms/Components/RoomItemRow.swift:21-31`** — AR badge is conveyed by an unlabeled clay circle + a `◎` character with no `accessibilityLabel("Has AR preview")`.
- **`Features/Companion/Components/InputBar.swift:96-165`** voice button conveys "active" only via fill color (clay vs. mocha) and icon swap (`mic` vs. `mic.fill`). No `.accessibilityValue("Recording")`.

### 9. 🟠 Custom-drawn rows / cards aren't combined into single accessibility elements

`MessageBubble`, `TableItemCard`, `RoomItemRow`, `NotificationFeedView.notificationRow`, `CollectionsView` board tiles, `RecommendationsView.productCard` all stack title / subtitle / metadata / price as separate `Text` elements without `.accessibilityElement(children: .combine)`. VoiceOver users will hear each child as a separate focus stop. (The pattern is used correctly in `Help/*`, `Companion/Views/CompanionSheet.swift`, `CompanionAuthPanel.swift`, `ScanHUDView.swift`, `WhisperBarView.swift`, `EdgeToastView.swift` — so the convention exists, it's just unevenly applied.)

## Medium-severity findings

### 10. 🟡 `onTapGesture` on non-Button views skips `.isButton` trait

- `CollectionsView`, `RecommendationsView`, `NotificationFeedView` rows are made tappable via `.onTapGesture` on a VStack/ZStack. They have no `.accessibilityAddTraits(.isButton)`, so VoiceOver doesn't announce them as buttons or surface the standard "double-tap to activate" cue. Use `Button { … } label: { … }.buttonStyle(.plain)` instead, or add the trait.

### 11. 🟡 `Spacer().frame(width: 12)` and similar layout primitives can break above XXL Dynamic Type

A lot of layouts hard-code spacings (`HStack(spacing: 8)`, `Spacer().frame(height: 100)`). Combined with fixed font sizes, scaling up Dynamic Type will clip or wrap into the next chunk. Most exposed: `Features/Companion/Views/CompanionOverlay.swift` panel actions (12pt help icons next to 16pt PlayfairDisplay), `Features/Rooms/Views/RoomProjectView.swift` row layouts, `Features/Receiving/Views/ReceiveDeliveryView.swift` PO card metadata.

A `@ScaledMetric` or `@Environment(\.dynamicTypeSize)` audit would be a worthwhile follow-up. (Verified: `rg "@ScaledMetric|dynamicTypeSize" --type swift` returns nothing.)

### 12. 🟡 `buttonStyle(.plain)` strips system accessibility, then it's not re-added

`rg "buttonStyle\(\.plain\)" --type swift` matches 54 sites. `.plain` removes the system pressed-state styling and (more importantly) the accessibility hint that comes with it. Most of these don't reattach `.accessibilityAddTraits(.isButton)` or any other trait. The trait usually survives because `Button` itself supplies it, but combined with no label this leaves rows that say nothing when focused.

### 13. 🟡 `Menu { … } label: { Image(…) }` patterns are unlabeled

`Features/Table/Views/TableView.swift:146-178` has two `Menu` controls (view-mode toggle, sort) whose labels are plain `Image(systemName:)` with no `accessibilityLabel`. Same pattern in `Features/Rooms/Views/ItemActionMenu.swift`. VoiceOver will announce "double-tap to activate" but not what it does.

### 14. 🟡 Help "?" buttons are labeled in some views and not in others (inconsistency)

The `?` help-panel trigger is labeled in `DesignerHomeView.swift:102-104`, `Profile/Views/ProfileView.swift:39-41`, `ProductDetail/Views/ProductDetailView.swift:106-108`, and `CompanionOverlay.swift:261-263`. It is NOT labeled in `Collections`, `Walk`, `Rooms/Views/YourSpacesView.swift` (verified to have one), `QRScannerView`. This kind of inconsistency suggests the team has the right instinct but no enforcement mechanism.

### 15. 🟡 `accessibilityValue` is never used; custom progress is opaque to VoiceOver

`rg "accessibilityValue" --type swift` returns nothing. Custom progress indicators (`Features/RoomScan/Shared/Components/ScanHUDView.swift` `Circle().trim`, `Features/Companion/Views/CompanionOverlay.swift:332-346` journeyMode progress ring with "X%", `Features/Walk/Components/WalkProgressIndicator.swift`, `Features/RoomScan/Views/ScanSavedConfirmationView.swift` progress fraction, `Design/Gestures/HoldGesture.swift` 60-step progress) should expose their state via `.accessibilityValue("\(Int(progress * 100)) percent")` so a VoiceOver user can hear scan progress without sighted polling.

### 16. 🟡 Voice input is gated behind an undiscoverable long-press

`Design/Gestures/CompanionPullGesture.swift:88-148` and `Features/Companion/Components/InputBar.swift:107-165` only activate voice via a sustained long-press. There is no quick tap-to-toggle alternative (well, `InputBar.swift:154-162` has one — but `CompanionPullGesture.companionLongPressGesture` does not). Users with motor impairments who can't sustain a press lose voice input entirely.

## Low-severity / nits

- 🟢 `Features/Companion/Views/CompanionOverlay.swift:454` uses a hard-coded `\u{203A}` (chevron) character — `Image(systemName: "chevron.right")` would render in correct SF Symbol style and pick up `.accessibilityHidden(true)` automatically.
- 🟢 The "Strata Mark" decorative icons in several headers (`CompanionOverlay.swift:404-419`, `StrataMarkView`) should probably carry `.accessibilityHidden(true)` to avoid VoiceOver reading them as separate elements when they're inside a labeled header. (The `companionMark` itself does need a label — see Critical #1 — but the decorative copies do not.)
- 🟢 The "★", "✦" decorative glyphs used in `StyleResultView.swift` should be `accessibilityHidden(true)` so they aren't read as "star" between headlines.
- 🟢 The `error: Color` token at #C77B6E barely scrapes AA-large (3.03:1 on offWhite). Bumping it darker (~#A5483A) would land it at AA-normal and signal "error" more strongly.
- 🟢 No `@Environment(\.accessibilityDifferentiateWithoutColor)` usage anywhere. For a brand that leans heavily on subtle clay/charcoal tonal differences, this is worth wiring up at least in unread/read states and active-tab indicators.
- 🟢 Animation durations are mostly tasteful but the 1.5s `repeatForever` in `PulseAnimation` and the 2.0s breathing default can be perceived as motion sickness triggers for some users — a stronger Reduce Motion stance is just to disable, not slow.

## Recommended quick wins

The team could ship these in a single week and meaningfully raise the floor. Each is high-impact and contained.

### 1. Label the Companion (and the close button in its panel)
`Features/Companion/Views/CompanionOverlay.swift:191-195, 265-275`

```swift
private var restingView: some View {
    companionMark
        .onTapGesture { expandToPanel() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Companion")
        .accessibilityHint("Opens actions for \(coordinator.currentScreen.displayName).")
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("companion.bubble")
}

// In the expanded header:
Button { collapseToButton() } label: { /* …xmark circle… */ }
    .accessibilityLabel("Close")
    .accessibilityIdentifier("companion.close")
    .frame(minWidth: 44, minHeight: 44)
    .contentShape(Rectangle())
```

### 2. Sweep image-only button labels across ~20 files
Pattern: `rg -n "} label: \{\s*$" --type swift -A 1 | rg -B 1 "Image\(systemName"` → manually add `.accessibilityLabel(…)` after the closing brace of the modifier chain. Highest-priority files: `Collections`, `Walk`, `Emergence`, `Profile` (gear icon), `QRScanner`, `ShareScanSheet`, `Messaging/ThreadDetailView`, `Recommendations` (heart), `Receiving/ReceiveDeliveryView` (remove-photo). ~30 minutes total.

### 3. Darken `clay` and create an explicit interactive-on-light text token
`Design/Tokens/PatinaColors.swift:20`

```swift
public static let clay = Color(hex: "C4A57B")           // keep for decorative use
public static let clayDeep = Color(hex: "9F7E48")       // NEW, ~4.6:1 vs offWhite

public enum Text {
    public static let primary = charcoal
    public static let secondary = mocha
    public static let muted = agedOak
    public static let interactive = clayDeep            // NEW
    public static let inverse = offWhite
}
```

Then sweep `foregroundColor(PatinaColors.clay)` → `foregroundColor(PatinaColors.Text.interactive)` in text/icon contexts. Decorative backgrounds (chip fills, progress strokes on dark surfaces) can keep the lighter shade.

### 4. Add a single project-wide `.accessibleButton()` modifier and apply it
Create `Design/Accessibility/AccessibleHitTarget.swift`:

```swift
extension View {
    /// Apply Apple-HIG-minimum hit target + button trait. Use on every
    /// image-only or pill-only control whose visual frame is < 44pt.
    public func accessibleHitTarget(label: LocalizedStringKey, hint: LocalizedStringKey? = nil) -> some View {
        self
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
            .accessibilityLabel(label)
            .accessibilityHint(hint ?? "")
            .accessibilityAddTraits(.isButton)
    }
}
```

Apply to `QuickActionChip`, `FilterChip`, `InputBar`'s send button, every `xmark` close button, every `⋯` row actions button. ~1 hour to write + sweep.

### 5. Make the unread state visible and audible in the notification feed
`Features/Notifications/Views/NotificationFeedView.swift:130-176`

```swift
HStack(alignment: .top, spacing: 12) {
    // Unread dot — visible and announceable
    Circle()
        .fill(notification.isRead ? Color.clear : PatinaColors.clayDeep)
        .frame(width: 8, height: 8)
        .padding(.top, 8)
        .accessibilityHidden(true)  // covered by the row label below

    // Icon
    Image(systemName: notification.icon) /* … */

    // Content VStack…
}
.padding(.horizontal, 24)
.padding(.vertical, 16)
.background(notification.isRead ? Color.clear : PatinaColors.clayDeep.opacity(0.08))
.contentShape(Rectangle())
.onTapGesture { handleTap(notification) }
.accessibilityElement(children: .combine)
.accessibilityLabel("\(notification.isRead ? "" : "Unread. ")\(notification.title). \(notification.body). \(notification.timeAgo).")
.accessibilityAddTraits(.isButton)
```

Same pattern applies to `MessageBubble`, `RoomItemRow`, `TableItemCard`, `CollectionsView` boards — combine children, mark as button, add a meaningful label.

---

**Tooling recommendation**: Add `swiftlint` rules `accessibility_label_for_image` (community) and a custom regex rule that flags `Button { … } label: { Image(systemName:` without a sibling `.accessibilityLabel`. Combined with a one-time sweep, this prevents the 90/10 regression from coming back.

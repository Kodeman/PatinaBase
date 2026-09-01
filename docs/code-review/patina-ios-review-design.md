# Patina iOS — Visual & Interaction Design Review

**Date:** 2026-05-30
**Scope:** `apps/mobile/Patina/Patina/` design system + per-feature visual review
**Track:** 2 of 4 (parallel review tracks)
**Companion docs:** [Engineering](./patina-ios-review-engineering.md) · [Accessibility](./patina-ios-review-accessibility.md) · [Information Architecture](./patina-ios-review-ia.md) · [Sprint Plan](./patina-ios-sprint-plan.md)

---

*Senior product designer review, 2026-05-30. Reviewer: Claude (Opus 4.7).*

## Overall design impression

Patina has a real point of view — and that is rare. The warm-earth palette (clay, mocha, aged oak on an off-white canvas), Playfair serif for moments, Inter for utility, DM Mono for metadata, and the Strata-mark Companion that breathes and morphs into a journey ring all add up to a *brand*, not a template. The motion vocabulary (gentle springs, breathing, letter-by-letter reveal in `RevealView`, the water-fill `WalkProgressView`, "Now let's talk about you." crossfade in `SoftLandingView`) shows the team thinks about pacing, not just pixels. **You're 70% of the way to a category-defining iOS app.** What's holding it back is the gap between the tokens-as-built and the tokens-as-used: features routinely bypass `PatinaTypography` to call `Font.custom("PlayfairDisplay-Italic", size: 22)` directly (~159 occurrences across `Features/`, vs ~443 `PatinaTypography.*` calls — about a 1:3 drift ratio), corner radii and paddings are often magic numbers (50 raw `.padding(.horizontal, 24)` vs 46 token uses), and the design system contains only 7 reusable components for a 30-feature app. The pattern is consistent: the *aesthetic* is excellent, the *system discipline* is mid. On iOS 26.5 the app reads as a beautifully art-directed iOS 17 app — it under-uses Liquid Glass, Tab Bar variants, and the new `glassEffect()` materials that would make Patina feel native to the OS it ships on.

---

## Design system

### Tokens — `Design/Tokens/`

**Color (`PatinaColors.swift:1`).** The palette is the strongest token in the system. Clay (`#C4A57B`), aged oak (`#8B7355`), mocha (`#5C4A3C`), charcoal (`#2C2926`) on off-white (`#FAF7F2`) is a coherent "lived-in" story. The semantic layer (`Background`, `Text`, `Interactive`, `Strata`) is the right shape. Problems:

- **No dark mode.** Every color is hard-coded sRGB. `PatinaColors.Background.primary` returns `offWhite` always. On iOS 26 with system-wide dark mode and Liquid Glass adaptation, this is going to look like a tourist. Bare minimum: define adaptive colors via `Color(.init { trait in ... })` for the four `Background`/`Text` semantic tokens. Better: ship a full dark palette (a warm graphite — not black — would match the brand).
- **Contrast audit (light mode, against `offWhite` #FAF7F2).** Approximate WCAG calculations:
  - `mocha` (#5C4A3C) on `offWhite`: contrast ~8.5:1 → **AAA pass**. Good for body and headlines.
  - `agedOak` (#8B7355) on `offWhite`: contrast ~4.2:1 → **AA pass** for body (>=4.5 is the bar, this is borderline — flag), **AA Large pass**. `MonoLabel` defaults to `agedOak` at 9–10pt — uppercase tracked mono small text on a marginal-contrast color is the riskiest typography pattern in the system. Bump default to `mocha` for anything below 12pt or move muted-mono to ≥11pt.
  - `clay` (#C4A57B) on `offWhite`: ~2.5:1 → **fails AA for text**. Reserve clay as an *accent* (it currently shows up as eyebrow labels and link text in `RevealView:41` and the toolbar principal in `ScanReviewView:180` — fine at 10pt monospace but worth a pass).
  - `clay` (#C4A57B) on `charcoal` (#2C2926): ~6:1 → AA pass. The Companion expanded panel uses this for action hint text and is solid.
  - `offWhite.opacity(0.7)` on `charcoal`: ~10:1 → fine, but stop using fractional opacity for foreground text — define a real `Text.inverseSecondary` token. Opacity multiplies with transparency stacks unpredictably.
- **Strata sub-palette** (`PatinaColors.swift:89`) is a brand asset and deserves to live next to the brand mark, not in the generic palette.
- **The deprecated aliases at line 97** (`clayBeige`, `mochaBrown`) are still used **213 times across Features/**. The deprecation is decorative right now — it warns but doesn't fail and nobody is migrating. Either commit to the rename (codemod + warnings-as-errors locally for those names) or delete the deprecation. Stale `@available(*, deprecated)` is design-system rot.

**Typography (`PatinaTypography.swift:1`).** Three-family system (Playfair / Inter / DM Mono) is right for a furniture editorial. The scale itself is reasonable but **inflated at the top and starved at the bottom**:

- 8 display/heading sizes (56 / 40 / 32 / 28 / 26 / 24 / 22 / 18) — too many. `display1` (56) appears once in the whole app (splash). `h2` (26) and `h3` (24) are visually indistinguishable at runtime. Collapse to 5: `display` (40), `h1` (32), `h2` (24), `h3` (20), `h5/headline` (18).
- Three "8/9/10px" mono variants is asking for trouble. **8pt is below iOS's recommended minimum (11pt for Dynamic Type defaults) and approaches illegibility on a 6.1" screen.** `monoTiny` (8) is used for "Step 2 of 4" indicators and `MonoLabel` defaults — at 8pt uppercase tracked DM Mono on `agedOak`, this is a Pinterest comment, not a luxury app. Floor mono at 10pt; promote "tiny" use cases to 10pt with tracking pulled back to 0.3.
- `relativeTo:` is set on every style — **good**. Dynamic Type will scale custom fonts. But there's no `dynamicTypeSize(...)` clamp anywhere I sampled and no testing at XXXL accessibility sizes. With 40pt headlines and 56pt displays scaling up 2x+, the layout will explode. Test at `.accessibility5` and add `.dynamicTypeSize(.xSmall ... .accessibility3)` clamps on hero screens.
- The four `View` extensions (`patinaDisplay`, `patinaBody`, `patinaEyebrow`, `patinaMono`) **are great** but barely used — `Font.custom("…")` calls outnumber them in features. The reason is they hard-code a color, which fights composition. Make the color optional (`patinaBody(.body, color:)`) and audit.

**Spacing (`PatinaSpacing.swift:1`).** The scale is sensible — `2 / 4 / 8 / 16 / 24 / 32 / 48 / 64` — but **broken in three ways**:

1. `xxs` and `xs` are both `4`. Useless duplicate. Pick one.
2. No 12pt step. `sm` (8) → `md` (16) is the most common jump and 12 is constantly needed (it's literally the most-used raw padding number in the codebase — search shows `.padding(.horizontal, 12)` everywhere). Add `xsm: 12`.
3. **Adoption is roughly 50/50.** ~50 raw integer `.padding(...)` calls vs ~46 `PatinaSpacing.*`. Worse, the raw numbers don't follow the scale — `ScanReviewView.swift` alone uses 14, 16, 24, 28, 32, 42, 12, 8 mixed. There's no design-system rhythm because half the app refuses to call the system.

**Gradients (`PatinaGradients.swift:1`).** 16 named gradients is **too many for product placeholders.** `walnut`, `wood`, `cherry`, `leather`, `linen`, `rattan`, `stone`, `metal` is a material taxonomy — fine — but they're all top-leading→bottom-trailing linear gradients with two stops. Visually they read as the same texture-less swatch. Either commit to procedural texture (you already have `PaperTextureOverlay` and `ClayTextureOverlay` — apply them to gradient placeholders), or collapse to 5 categories. The `companionDock` gradient (`PatinaGradients.swift:94`) is **the most sophisticated piece of token design in the system** — a 5-stop fade explicitly modeling visual breathing room around the Companion. More of this.

**Shadows (`PatinaShadows.swift:1`).** Four-step scale + two named (`dailyCard`, `companion`) is right-sized. All shadows are mocha-tinted at low opacity — **brand-aligned**, far better than the default iOS `Color.black.opacity(...)`. The `Shadow` struct is a thin wrapper around `View.shadow(...)`; works fine. One nit: no `inner` or `colored` shadow option for the Strata-mark glow effect in `CompanionOverlay:404`, which gets recreated inline. Promote it.

### Components — `Design/Components/` (7 files, ~700 lines)

For a 30-feature app, **7 reusable components is anemic**. Compare to the design-system package mentioned in root CLAUDE.md (`packages/patina-design-system` — 122 web components). The iOS team is reinventing primitives in every feature. Per-component:

- **`PatinaButton.swift:19`** — 4 styles (primary / secondary / ghost / clay). API is clean. **Missing**: loading state (no spinner), disabled state (no visual treatment — the `isPressed` state is there but no `isEnabled: Bool` input), destructive variant (red/error), icon support. Every feature reinvents these: `RevealView:53` uses `StyleContinueButton`, `SoftLandingView:111` re-rolls a charcoal capsule button inline, `WalkErrorView` builds its own `primaryButton`/`secondaryButton`. That's three implementations of "the primary CTA button" — pick one.
- **`AuthButton`** (same file, line 94) — should be a variant of `PatinaButton`, not a peer struct. Different corner radius (12 vs Capsule) and different height (50 vs 52) are arbitrary and break visual rhythm with the rest of the app.
- **`ClayBackground.swift:12`** — `Canvas`-based noise overlay. **Lovely idea**, but `ClayTextureOverlay:67` re-randomizes every render. That's flicker on state change. Generate once with a stable seed (`Int.random(in:using:)` with a seeded `RandomNumberGenerator`) or cache to an `Image`. Same problem in `PaperTextureOverlay:99`.
- **`FilterChip.swift:11`** — One-shape pill, two states. Fine. Missing: count badge, leading icon, disabled state.
- **`MatchPill.swift:10`** — Uses `.regularMaterial` for a frost effect and then layers `offWhite.opacity(0.92)` underneath, which **defeats the material**. Pick one or the other. On iOS 26 you'd use `glassEffect(.regular)`.
- **`MonoLabel.swift:11`** — Wrapper around `Text` with `.uppercase` and `.tracking(0.5)`. Useful, but it inlines a `UppercaseModifier` to work around iOS 14 `textCase` quirks — irrelevant at iOS 18+ target. Simplify.
- **`StrataMarkView.swift:14`** — Brand mark, animated, accessibility-aware (reduce-motion respected). **This is the best-designed component in the system.** Spec-traceable (comments cite "spec section 1.4"), the `useSpecColors` boolean is honest, accessibility label is real ("Patina Companion" + hint). The breathing animation properly cleans up. More components should be this rigorous.
- **`TierPill.swift:11`** — Renders nothing when `.standard`. That's logic, but it's correct logic. Fine.

**Missing components I'd ship next:**
1. `PatinaCard` — every feature builds its own rounded-rect-with-softCream-background-and-pearl-stroke (see `ScanReviewView:233`, `ScanReviewView:478`, `ProfileView:243`). It's the same component 30 times.
2. `PatinaTextField` — there are 18 `TextField(...)` calls and each one re-rolls the softCream + pearl border (`ScanReviewView:228`). Disastrous for consistency.
3. `PatinaStatusBadge` — sync status ("Saving to cloud", "Saved locally", error) reappears constantly with different visual treatments. Right now `WalkView.swift:628` and `ScanUploadProgressView` are two separate languages.
4. `PatinaSheet` header — the "Discard / title-as-eyebrow / Done" toolbar pattern (`ScanReviewView:166`) reappears in every modal.
5. `PatinaEmptyState` — `DailyRoomEmptyState` and `TableView.emptyState` both do icon-in-rounded-square + serif headline + body + CTA. Same structure, different code.

### Animation & motion — `Design/Animations/`

- **`BreathingAnimation.swift:11`** — Modifier with reduce-motion handling. **Properly respects accessibility** (line 36, 46). The default `minScale: 1.0 → maxScale: 1.05, duration: 2.0` curve is the brand. Solid.
- **`PatinaTransitions.swift:13`** — `Animation.patinaHero` (spring, 0.5/0.82) for card→fullscreen morphs and `patinaChrome` (easeOut 0.32) for accompanying chrome fades. **This is exactly the right level of system thinking.** The home `DailyProductCard` → `DailyProductDetailView` morph uses these. Need three or four more named curves — there's also a brand motion happening in `RevealView.startReveal` (letter-by-letter with 0.05s stagger) that should be named (`Animation.patinaReveal`) and reusable. Same for `SoftLandingView`'s 0.4/0.8/1.0/1.2 timing marks — those should be constants somewhere.
- **`CompanionPullGesture.swift:14`** and `companionLongPressGesture` are well-built — drag-to-cancel for voice input with warning haptic on cancel (line 133) is *exactly* the right interaction grammar. This is iOS-native craft.
- **Cohesion check**: scrub through the app and timings drift. `CompanionOverlay:135` uses `(response: 0.4, damping: 0.85)`, `PatinaTransitions` uses `(0.5, 0.82)`, `BackChevronButton` doesn't animate, and `Walk` swipe-up gesture has no animation at all. **Pick three curves and ban inline spring definitions.**
- **Reduce Motion coverage**: 50 `accessibilityReduceMotion` references across Features — pretty good, the team is conscious. But the `swipeHintOffset` chevron in `WalkView:124` repeats forever without checking reduce-motion. Audit pass needed.

---

## Feature-by-feature notes

### `Features/Walk/Views/WalkView.swift` (693 lines)

**Visual hierarchy** in the welcome state is strong: breathing Strata mark, h1 + body copy, swipe-up affordance. The microcopy ("Let's explore your space together. / I'll observe the light, the shapes, the possibilities." — line 107) is *on brand* — meditative without being precious. Keep this.

**Issues:**
- **Top bar (line 540)**: close button is a 16pt xmark in a `Color.white.opacity(0.15)` circle with `PatinaSpacing.sm` (8pt) padding — that's a ~32pt hit target. **Below the 44pt Apple HIG minimum.** Bump padding to 12 or set `.frame(minWidth: 44, minHeight: 44)`. Same problem on pause button.
- **Swipe-up-to-begin gesture** (line 140) is undiscoverable for a first-time user. A bouncing chevron + "Swipe up to begin" copy is the right hint but a tap should *also* work. Right now the screen is a dead-end for anyone who doesn't see the chevron.
- **Wall detection overlay** (line 488) is dead code — defined but never rendered. Either ship it or delete it.
- **Sync status view (line 628)** is in error state shows orange triangle + "Saved locally" + "Retry" link — text is at `PatinaTypography.caption` (12pt) on `offWhite.opacity(0.6)` against a dark background. That's <3:1 contrast. Fix: drop opacity, use a real foreground color.
- **"See What Emerged"** CTA (line 605) just `dismiss()`es. That's a stubbed-out promise. The user is told something will emerge and then is sent back to where they were. Brutal expectation mismatch.

### `Features/RoomScan/Views/ScanReviewView.swift` (1006 lines)

This is the **strongest feature view in the app** for craft. The headline pattern ("Your room, your way" in PlayfairDisplay-Italic 22 + Inter body — line 220) is the editorial voice working correctly. Hero photo with "Change" pill, supporting photos with caption/hide affordances, hidden-photos restore strip with a clay eyebrow label, scan details metadata table — each section has a clear job and a consistent visual grammar.

**Issues:**
- **It's 1006 lines.** Hero section, gallery section, notes section, scan details, three sheets, manifest loading, scoring math, save/discard logic — all in one file. Extract sections into views.
- **Direct `Font.custom("PlayfairDisplay-Italic", size: 22)` calls everywhere** (lines 109, 221, 222) — bypasses `PatinaTypography.h4` and `patinaVoiceLarge`. This is the single biggest token-drift culprit in the codebase.
- **Toolbar title is "REVIEW" in clay 10pt mono** (line 177). Clay on white at 10pt is ~2.5:1 contrast. **Fails AA.** Use mocha or charcoal.
- **"Save without notes" secondary CTA** (line 438) is just 14pt agedOak text in a borderless rectangle — looks like a footnote, not a button. If it's a real action, treat it like one (ghost button).
- **Error state** (line 105) is honest and human ("Your other rooms are safe — this only affects this scan.") — brand moment. Keep doing this.

### `Features/Companion/Views/CompanionOverlay.swift` (523 lines)

The Companion is **the most ambitious interaction concept in the app**. Five display modes (resting, nudging, expanded, journey, minimal) driven by route context, breathing glow ring, contextual action list. The `displayMode` computed property (line 41) is a clean state machine. The journey-mode progress ring with step dots (line 329) is a beautiful piece.

**Issues:**
- **Expanded panel is charcoal-on-charcoal-on-the-bottom-of-the-screen.** It's a dark island floating above content with a `Color.black.opacity(0.3) + .ultraThinMaterial.opacity(0.5)` scrim. On iOS 26 this *should* be `.glassEffect(.regular.tint(PatinaColors.charcoal.opacity(0.6)))` for proper depth and content awareness. Right now the scrim feels like an iOS 14 modal.
- **Resting state button = 52pt circle.** That's good (above 44pt minimum). But the breathing ring is 58pt and decorative-only with no extended hit target — `contentShape(Circle().frame(58))` would help thumbs.
- **"What next?"** (line 225) is in PlayfairDisplay-Italic 16 — charming brand voice, but the question is repeated in every panel open. After 50 uses it'll feel canned. Vary the title by context (route-dependent prompt — "Where to next?" on home, "Keep scanning?" mid-walk, "Want a recommendation?" after a save).
- **Help (`?`) and close (`x`) buttons** (lines 252, 266) are 28pt circles — **below 44pt.** Bigger hit area.
- **Companion has no "did-you-know" empty state** — first-time users see "What next?" and three actions but no explanation of *what this thing is*. The HelpInfoIcon is there (line 232) but it's a 12pt question mark. The first expansion of every install should self-explain. Consider a one-shot intro tooltip.

### `Features/Table/Views/TableView.swift` (317 lines)

The "physics-based scatter view of your collected pieces" concept is the **most distinctive feature in the app** — nobody else does this. Wood-grain background (`#DED4C4 → #C9BBA8`), three view modes (scatter / grid / list) toggled by menu. Header is editorial: "Your Table" / "12 pieces • $4,200" with serif + caption + mono.

**Issues:**
- **Wood-grain background is two-stop linear gradient — not actually wood-grain.** It reads as a beige rectangle. Either ship procedural noise (`Canvas`-based, like `ClayTextureOverlay`) or use a real wood texture image. The concept deserves better execution.
- **Empty state** (line 190) "Your table awaits" + "As you explore and discover pieces that resonate, they'll gather here—aging gracefully over time, developing their own patina." — *gorgeous* copy. Brand at full strength. The CTA "Start Exploring" has no action attached (line 220 closure is empty).
- **Header is `.ultraThinMaterial`** (line 184) — good iOS 26 instinct. But the rest of the screen isn't depth-aware. Either commit to layered glass throughout or drop it.
- **Scatter mode** likely has a serious tap-target problem (items can be drag-positioned anywhere, including under the Companion). Need bounds enforcement and a long-press-to-grab gesture to disambiguate tap-to-open from drag-to-move.
- **Sort/view menus** in the header (lines 146, 165) — they use `Menu` with `Label(text, systemImage:)` which on iOS 26 will use the system sheet — but the trigger labels are bare `Image(systemName:)` at 20pt. Add a `Menu`'s accessibility label.

### `Features/StyleReveal/Views/RevealView.swift` (195 lines)

**This is the single most cinematic screen in the app.** Charcoal background, "THE AESTHETE ENGINE" eyebrow in clay 10pt mono, then the user's aesthetic name reveals letter-by-letter in PlayfairDisplay-Light 42pt, followed by a multi-color spectrum bar that animates in segment-by-segment with staggered springs, then style tag pills fading in sequentially. The pacing (line 156-186) is theatrical and earned.

**Issues:**
- **`DispatchQueue.main.asyncAfter` cascade** (lines 165–186) is the wrong tool. Use `Task { try await Task.sleep(...) }` or `withAnimation(...delay:)` — current code can't be cancelled if the user navigates away mid-reveal.
- **`PlayfairDisplay-Light`** at 42pt is used here but **isn't in the font registry** I sampled (`Resources/Fonts/` only ships Italic, Medium, Regular for Playfair). This will silently fall back to the system font. Either ship the Light weight or change to `PlayfairDisplay-Regular`.
- **Spectrum bar** (line 107) — 5 fixed colors regardless of profile content, with width driven by `profile.spectrumValues`. If a profile has zero in one segment, that color disappears and the bar becomes a different shape — could read as a glitch. Consider keeping a minimum 4pt segment.
- **Secondary CTA "or explore your style profile →"** (line 61) is 12pt Inter agedOak — fine, but it's the *only* path to richer content. Make it visually heavier (14pt mocha, underlined, or a real `ghost` button).
- **Reduce motion path** (line 157) immediately resolves to final state — correct. Good craft.

### `Features/Profile/Views/ProfileView.swift` (252 lines)

**Strong information architecture.** Avatar (`PatinaGradients.earth` circle with initial in 28pt Playfair) → name → "Member since X" with help tooltip → style badge → stats row (Rooms / Saved / Match) → rooms scroll rail → action rows (Retake Style Quiz / Work with Designer / Settings). The use of `HelpTooltip` on the Patina-specific concepts (Design Journal, style signature, Match score) is **thoughtful onboarding** — credit.

**Issues:**
- **Stats row** uses `PlayfairDisplay-Medium 22` for the value and `monoTiny` (8pt) for the label. **8pt uppercase mono is unreadable.** Push to 10pt minimum.
- **Room cards in the rail** (line 199) — 140×100 with a flat `PatinaGradients.warm` placeholder. No room image, no hero photo, no occupancy data. Once `ScanReviewView` is shipped, surface the hero photo here. Right now every room looks identical.
- **`HelpTooltip`** is wrapped around the entire `MonoLabel` and `HStack` (lines 64–93). Tap targets are huge — good — but the tooltip-indicator visual treatment isn't shown in the code I read. If it's invisible, the affordance is invisible.
- **Action rows** (line 221) — clay icon in soft clay tile, charcoal label, agedOak chevron. Clean. This pattern should be a `PatinaSettingRow` component.

### `Features/Home/Views/DailyRoomView.swift` + `DailyGreetingHeader.swift`

The "Your Daily Room" editorial feed is the **right home screen for this brand**. Greeting header with date eyebrow + serif title + monogram avatar, then DailyStoryCard, then RoomChipRail, then context bar with filters, then product cards. First-launch tour with three coachmark anchors (`homeGreeting`, `savedHeart`, `profileMonogram`) is **above-and-beyond polish**.

**Issues:**
- **Help icon is a 13pt `questionmark.circle`** (`DailyGreetingHeader:38`) and a 17pt `questionmark.circle` in `ProfileView:32`. Pick one help affordance pattern and ship it.
- **Date eyebrow** (`DailyGreetingHeader:23`) is `monoTiny` (8pt). Same problem as everywhere else.
- **Empty state** (`DailyRoomEmptyState.swift:8`) is **excellent** — `house` SF Symbol in a soft-cream square, serif headline ("Start your first room"), Inter body, charcoal capsule CTA. This is the template every empty state should follow.

### Pre-Scan Checklist, Walk, Reveal Cinematics

The **multi-screen pacing** (PreScanChecklist → Walk → SoftLanding → Conversation → Reveal → FloorPlan) is genuinely impressive choreography for a mobile app. The 1.2s SoftLanding crossfade (line 64) with "Now let's talk about you." in PlayfairDisplay-Italic over a black-to-off-white background fade is *cinema*. Don't let anyone simplify this.

---

## HIG conformance & iOS-26 fit

The app reads as **a beautifully art-directed iOS 17 app shipping on iOS 26.5**. Specific gaps:

- **No Liquid Glass.** iOS 26's `glassEffect(.regular)`, `.glassEffect(.regular.interactive())`, and `GlassEffectContainer` are absent. 15 `.ultraThinMaterial` calls are doing the iOS-13-era equivalent. The Companion expanded panel, the bottom CTA bar over the Table scatter view, the Walk top bar, and the ProductDetail bottom action bar should all be the new glass system. This is the single biggest "ports vs natives" tell.
- **No TabView.** This is **intentional** — the Companion replaces the tab bar. Bold concept, well-executed. Just be sure to handle the new iOS 26 tab bar minimization (your Companion already does state-collapses, so the metaphor is consistent — own it harder).
- **`NavigationStack` is present** (26 references) but I didn't see `navigationTransition(.zoom(...))` anywhere. iOS 18+ zoom transitions on cards would make the home → detail morph even more seamless than the current `matchedGeometryEffect` approach.
- **Sheets** use `.presentationDetents([.large])` (`ScanReviewView:615`) — correct API, but `.presentationCornerRadius(24)` is missing, and `.presentationBackgroundInteraction()` is missing on the Companion panel.
- **Haptics callouts** — `HapticManager` is referenced 94 times (good!). The `.sensoryFeedback(...)` modifier (iOS 17+) is unused — calls go through the custom `HapticManager.shared.impact(.light)`. The custom manager is fine, but `sensoryFeedback` lets you bind haptics to state changes declaratively, which fits SwiftUI better. Worth a partial migration.
- **System colors are essentially absent** (2 hits for `Color.secondary` / `Color.accentColor`). For a brand-heavy app this is appropriate — but it means the app **will not respect tinting** if the user picks a system accent color, and won't adapt to dark mode at all. Accept the trade-off explicitly.
- **Dynamic Type clamps missing.** Custom fonts respect `relativeTo:` but no screen explicitly tests at `.accessibility3` or higher. Likely breakage on the cinematic screens (Reveal, SoftLanding) where layouts assume a specific text height.
- **Back chevron** (`PatinaTransitions:22`) — 14pt chevron in a 36pt circle. iOS native back is in a navigation bar with `chevron.backward`. Patina's custom version is **on brand** but is **below the 44pt minimum** and lacks the `NavigationStack`-integrated swipe-from-edge behavior. Verify the swipe-back gesture still works.

---

## Brand & voice

**The microcopy when it shows up is the strongest in any furniture/design app I've reviewed.**

Brand-voice high points:
- `WalkView:107` — "Let's explore your space together. / I'll observe the light, the shapes, the possibilities."
- `WalkView:591` — "I've observed your space. / Something may emerge from what I've seen."
- `TableView:211` — "As you explore and discover pieces that resonate, they'll gather here—aging gracefully over time, developing their own patina."
- `ScanReviewView:220` — "Your room, your way" / "Give the room a name, pick the photo you love most, and jot down anything worth remembering."
- `SoftLandingView:104` — "You've done this before."

**Generic copy that should be on-brand:**
- 14 occurrences of `"Try Again"` across error states. Patina's voice: "Let's try that again" or "Once more" or "Reset and retry".
- `WalkView:166` — "Preparing to observe..." — almost there, but the ellipsis breaks the meditative pace. "Preparing to observe." or "Settling in." would be better.
- `WalkView:635` — "Saving to cloud..." Just say "Saving" — "the cloud" is generic SaaS-speak.
- `ScanReviewView:98` — "Preparing your scan…" Better: "Gathering your scan…"
- `Walk` welcome state — "Swipe up to begin" is utilitarian. "Begin when ready" or even just "Begin ↑" with a discoverable affordance.
- Save without notes (`ScanReviewView:439`) — "Skip notes" or "Save as-is" would be more honest than the slightly awkward "Save without notes".
- **`Spacer().frame(height: 120)` to clear the Companion** appears in every scrollable feature. Establish a `.companionSafeArea()` modifier so future authors don't have to remember the number.

**Voice tension**: The app oscillates between *poetic Patina* (above) and *utility patina* ("Member since", "Rooms / Saved / Match", "Add to Room") — that's fine, you don't want to fight the user when they need information — but a few of the utility surfaces could lean a touch more brand. E.g., "Match" as a stat with no context invites "match with what?" curiosity. "Resonance" or "Alignment" would be more on-brand and explainable via the existing `HelpTooltip`.

---

## Top opportunities (prioritized: effort × impact)

1. **Ship dark mode for the four `Background` and three `Text` semantic tokens.** *Effort: S (2 days). Impact: huge.* — Without it the app looks broken on any iOS 26 device that respects system appearance. Use `Color(.init(dynamicProvider:))` and ship a warm-graphite dark palette (not pure black).

2. **Token-drift codemod + lint.** *Effort: M (3 days). Impact: huge.* — Replace every `Font.custom("PlayfairDisplay-…")` call site with `PatinaTypography.*`. Replace every raw `.padding(.horizontal, 24)` with a spacing token (or add `xsm: 12` and `mdLarge: 20` first). Add a CI lint that fails PRs introducing new `Font.custom` or `Color(hex:)` calls outside `Design/`.

3. **Ship the missing 5 design-system components** (`PatinaCard`, `PatinaTextField`, `PatinaStatusBadge`, `PatinaSheetHeader`, `PatinaEmptyState`). *Effort: M (4 days). Impact: massive long-term* — kills hundreds of duplicated lines and locks the brand to the system.

4. **Adopt Liquid Glass on the 6 surfaces that need depth** — Companion panel, Companion minimal pill, Table header, ProductDetail bottom bar, Walk top bar, ARPlacement controls. *Effort: M (3 days). Impact: medium-large* — moves the app from "iOS 17 dressed up" to "iOS 26 native".

5. **Fix sub-12pt mono text everywhere.** *Effort: S (1 day). Impact: medium-large* — Bump `monoTiny` floor to 10pt with reduced tracking, deprecate the 8pt variant, audit all `MonoLabel` defaults. Today, the mono metadata strewn across stats, eyebrows, and rail timestamps is **legibly weakest type in the system on an actual device**.

6. **Resolve the 5-state Companion intro problem.** *Effort: S–M (2–3 days). Impact: medium-large.* — On first app launch, the Companion's brilliant concept is invisible. A one-shot intro animation/popover ("This is your Companion — tap to see what's next") would convert the conceptual win into a comprehension win.

7. **Bump all sub-44pt tap targets** (Companion close/help, Walk top bar buttons, BackChevronButton). *Effort: S (1 day). Impact: medium* — Pure HIG hygiene, app-store rejection risk avoidance, accessibility win.

8. **Replace `DispatchQueue.main.asyncAfter` cascades in animations** (`RevealView`, `SoftLandingView`) with `Task`-based async sequences and proper cancellation. *Effort: S (1 day). Impact: medium* — avoids orphan animations when users navigate mid-reveal.

---

## What to preserve

- **The Strata mark Companion concept.** It is the most distinctive piece of mobile design system work I've reviewed in a while. The 5-state model (resting / nudging / expanded / journey / minimal) is right. The breathing animation is right. Defending the no-tab-bar bet is the *correct* product decision.
- **The Walk → SoftLanding → Reveal cinematic.** The 1.2s crossfade, the letter-by-letter reveal, the staggered spectrum-bar springs — this is the kind of pacing that competitors can't catch up to in six months.
- **The microcopy when it shows up.** "Something may emerge from what I've seen." — that line alone is a brand asset. Whoever writes those should be writing more of them and reviewing every string change.
- **`patinaHero` + `patinaChrome` animation curves.** The two-curve system for "card morphs to fullscreen while chrome eases independently" is exactly the right level of motion-design abstraction.
- **Earthy palette discipline.** Off-white / clay / aged oak / mocha / charcoal is a coherent brand color story that holds up at any scale. The temptation to add brighter accents to "pop" should be resisted.
- **`StrataMarkView` as the model component.** Spec-traced, accessibility-aware, properly handles reduce-motion start/stop, public API is minimal. Hold every new component to this standard.
- **`HelpTooltip` / `HelpInfoIcon` / contextual help panels.** Patina-specific concepts (Design Journal, Match, Companion, Resonance) get inline definitions. That's how you teach without onboarding flow bloat.
- **The `MockRoomScanView` simulator fallback.** Lets the team design and iterate without LiDAR hardware. Underrated dev-experience win.
- **Texture overlays (`ClayTextureOverlay`, `PaperTextureOverlay`).** Real material surfaces, not gradients pretending to be material. Use these much more.

---

*Reviewed files (selection):*
- `apps/mobile/Patina/Patina/Design/Tokens/{PatinaColors,PatinaTypography,PatinaSpacing,PatinaGradients,PatinaShadows}.swift`
- `apps/mobile/Patina/Patina/Design/Components/{PatinaButton,ClayBackground,FilterChip,MatchPill,MonoLabel,StrataMarkView,TierPill}.swift`
- `apps/mobile/Patina/Patina/Design/Animations/{BreathingAnimation,PatinaTransitions}.swift`
- `apps/mobile/Patina/Patina/Design/Gestures/CompanionPullGesture.swift`
- `apps/mobile/Patina/Patina/Features/Walk/Views/{WalkView,WalkProgressView}.swift`
- `apps/mobile/Patina/Patina/Features/RoomScan/Views/{ScanReviewView,SoftLandingView}.swift`
- `apps/mobile/Patina/Patina/Features/Companion/Views/CompanionOverlay.swift`
- `apps/mobile/Patina/Patina/Features/Table/Views/TableView.swift`
- `apps/mobile/Patina/Patina/Features/StyleReveal/Views/RevealView.swift`
- `apps/mobile/Patina/Patina/Features/Profile/Views/ProfileView.swift`
- `apps/mobile/Patina/Patina/Features/Home/Views/{DailyRoomView,DailyGreetingHeader,DailyRoomEmptyState}.swift`

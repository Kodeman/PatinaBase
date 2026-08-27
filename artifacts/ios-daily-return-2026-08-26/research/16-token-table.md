# 16 — iOS design tokens for the mock kit

Source of truth: `apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/` at `main @ 3cd84ecb3`.
Paths below are relative to that directory unless shown in full. Every value is cited; nothing is
inferred. Mocks are drawn at **402 × 874 CSS px** (instruments §9), so all point values map 1:1 to
CSS px.

---

## 1. Color — semantic roles, light + dark

Dark resolution is a trait-aware `UIColor` provider, not a media query:
`Color.patinaDynamic(light:dark:)` at `Tokens/PatinaColors.swift:154-166`. Every token below that
shows two hexes flips automatically; a token showing one hex is **static by design** and must be
drawn identically in both mock themes.

### Semantic roles (use these in mocks)

| Role | Light | Dark | Defined |
|---|---|---|---|
| `Background.primary` — the canvas | `#FAF7F2` | `#211E1B` | `PatinaColors.swift:94-96` (light `offWhite` :17; dark `DarkPalette.background` :77) |
| `Background.secondary` — cards, chips, group surfaces | `#F5F2ED` | `#2C2926` | `:98-100` (`softCream` :37; `DarkPalette.backgroundSecondary` :79) |
| `Background.tertiary` — hero bands | `#FAF7F2` | `#211E1B` | `:102-104` (`warmWhite` :40) |
| `Background.dark` — camera / AR / immersive chrome | `#2C2926` | `#2C2926` (static) | `:105-106` |
| `Text.primary` | `#2C2926` | `#F2EDE6` | `:110-112` (`charcoal` :32; `DarkPalette.textPrimary` :81) |
| `Text.secondary` | `#5C4A3C` | `#D8C9B4` | `:113-115` (`mocha` :29; `:83`) |
| `Text.muted` | `#8B7355` | `#B5A487` | `:116-118` (`agedOak` :26; `:85`) |
| `Text.inverse` — labels on filled controls | `#FAF7F2` | `#211E1B` | `:121-123` |
| `Text.interactive` — links, tappable text | `#9F7E48` | `#C4A57B` | `:124-126` (`clayDeep` :23; `DarkPalette.textInteractive = clay` :87) |
| `Interactive.default` — brand accent | `#C4A57B` | `#C4A57B` (static) | `:131` |
| `Interactive.hover` | `#8B7355` | `#B5A487` | `:132-134` |
| `Interactive.active` — filled control surface (pair with `Text.inverse`) | `#2C2926` | `#F2EDE6` | `:136-138` |
| `Strata.line1` | `#5C4A3C` | `#D8C9B4` | `:144-146` |
| `Strata.line2` | `#C4A57B` | `#C4A57B` (static) | `:147` |
| `Strata.line3` | `#C4A57B` @ 50% | same (static) | `:148` |

### Raw palette (referenced directly at call sites; **no dark variants** — draw as-is in both themes)

| Token | Hex | Role in source | Line |
|---|---|---|---|
| `offWhite` | `#FAF7F2` | primary background; inverse text | :17 |
| `clay` | `#C4A57B` | accent, chips, badges, icon washes at 12–15% | :20 |
| `clayDeep` | `#9F7E48` | accessible interactive text (light) | :23 |
| `agedOak` | `#8B7355` | muted text | :26 |
| `mocha` | `#5C4A3C` | secondary text, all shadow color | :29 |
| `charcoal` | `#2C2926` | primary text, filled controls, dark chrome | :32 |
| `softCream` | `#F5F2ED` | card surface | :37 |
| `warmWhite` | `#FAF7F2` | hero surface (identical to `offWhite`) | :40 |
| `pearl` | `#E5E2DD` | borders, dividers, hairlines, inactive | :43 |
| `sage` | `#A8B5A0` | spatial pills @15%, settings glyph | :46 |
| `dustyBlue` | `#8B9CAD` | `.info` badge, designer-response icon | :49 |
| `terracotta` | `#D4A090` | warm accent, notifications glyph | :52 |
| `goldenHour` | `#E8C547` | AR light slider, "emergence" icon | :55 |
| `success` | `#7A9B76` | match label, `.success` badge | :60 |
| `warning` | `#D4A574` | `.warning` badge | :63 |
| `error` | `#C77B6E` | `.error` badge, destructive button, field error | :66 |

### Dark palette internals (for reference; use the semantic rows above)

`DarkPalette.background #211E1B` · `backgroundSecondary #2C2926` · `textPrimary #F2EDE6` ·
`textSecondary #D8C9B4` · `textMuted #B5A487` · `textInteractive = clay #C4A57B`
(`PatinaColors.swift:75-88`). The comment at `:69-73` states the intent: *warm graphite, not a cold
OLED void*.

⚠ Mock-kit gotcha: `pearl` (`#E5E2DD`) is the hairline everywhere — including in dark mode, where it
is a **light** line on a `#211E1B` ground (`Features/Profile/Views/StudioHubView.swift:174,183`,
`Features/Notifications/Views/NotificationFeedView.swift:241`). Reproduce it as drawn; do not
"correct" it.

---

## 2. Typography

`Tokens/PatinaTypography.swift`. Three families, resolved by **PostScript name** through
`Font.custom(_:size:relativeTo:)`; the faces are registered process-wide by
`PatinaFonts.registerAll()` from the SwiftPM resource bundle
(`Support/PatinaFonts.swift:20-26`), called once at launch (`apps/mobile/Patina/Patina/PatinaApp.swift:64`).

### Bundled font files (`Resources/Fonts/`)

| File | PostScript name | CSS equivalent |
|---|---|---|
| `PlayfairDisplay-Regular.ttf` | `PlayfairDisplay-Regular` | Playfair Display 400 |
| `PlayfairDisplay-Medium.ttf` | `PlayfairDisplay-Medium` | Playfair Display 500 |
| `PlayfairDisplay-Italic.ttf` | `PlayfairDisplay-Italic` | Playfair Display 400 italic |
| `Inter-Regular.ttf` | `Inter-Regular` | Inter 400 |
| `Inter-Medium.ttf` | `Inter-Medium` | Inter 500 |
| `Inter-SemiBold.ttf` | `Inter-SemiBold` | Inter 600 |
| `DMMono-Regular.ttf` | `DMMono-Regular` | DM Mono 400 |
| `DMMono-Medium.ttf` | `DMMono-Medium` | DM Mono 500 |
| `DMMono-Light.ttf` | `DMMono-Light` | DM Mono 300 — **bundled but referenced by no token and no call site** (grep) |

Google-Fonts stacks for the deck/mocks (instruments §9):
`'Playfair Display', 'Iowan Old Style', Georgia, serif` ·
`Inter, -apple-system, 'Segoe UI', sans-serif` ·
`'DM Mono', ui-monospace, 'SF Mono', Menlo, monospace`.

### Roles

| Token | Family / PostScript | Size (pt) | Weight | Dynamic Type anchor | Line |
|---|---|---|---|---|---|
| `display1` | PlayfairDisplay-Medium | 56 | 500 | `.largeTitle` | :21 |
| `display2` | PlayfairDisplay-Medium | 40 | 500 | `.largeTitle` | :23 |
| `displaySmall` | PlayfairDisplay-Medium | 28 | 500 | `.title2` | :25 |
| `h1` | PlayfairDisplay-Medium | 32 | 500 | `.title` | :27 |
| `h2` | PlayfairDisplay-Regular | 26 | 400 | `.title2` | :29 |
| `h3` | PlayfairDisplay-Regular | 24 | 400 | `.title2` | :31 |
| `h4` | PlayfairDisplay-Regular | 22 | 400 | `.title3` | :33 |
| `h5` | PlayfairDisplay-Medium | 18 | 500 | `.title3` | :35 |
| `headlineSerif` | PlayfairDisplay-Medium | 24 | 500 | `.headline` | :39 |
| `headlineMedium` | Inter-SemiBold | 18 | 600 | `.headline` | :41 |
| `bodyLarge` | Inter-Regular | 18 | 400 | `.body` | :45 |
| `body` | Inter-Regular | 16 | 400 | `.body` | :47 |
| `bodyMedium` | Inter-Medium | 16 | 500 | `.body` | :49 |
| `bodySmall` | Inter-Regular | 14 | 400 | `.subheadline` | :51 |
| `bodySmallMedium` | Inter-Medium | 14 | 500 | `.subheadline` | :53 |
| `caption` | Inter-Medium | 12 | 500 | `.caption` | :55 |
| `captionMedium` | Inter-SemiBold | 12 | 600 | `.caption` | :57 |
| `captionSmall` | Inter-Regular | 10 | 400 | `.caption2` | :63 |
| `mono` | DMMono-Regular | 10 | 400 | `.caption2` | :68 |
| `monoSmall` | DMMono-Regular | 9 | 400 | `.caption2` | :71 |
| `monoTiny` | DMMono-Regular | 8 | 400 | `.caption2` | :75 — **deprecated**, "use monoLabel (10pt)"; still in live use (`Features/Home/Views/TodayModules.swift:189`, `Features/Notifications/Views/NotificationFeedView.swift:225`) |
| `monoLabel` | DMMono-Regular | 10 | 400 | `.caption2` | :78 |
| `monoMedium` | DMMono-Medium | 10 | 500 | `.caption2` | :81 |
| `eyebrow` | Inter-SemiBold | 12 | 600 | `.caption` | :86 |
| `patinaVoice` | PlayfairDisplay-Italic | 18 | 400 italic | `.body` | :89 |
| `patinaVoiceLarge` | PlayfairDisplay-Italic | 22 | 400 italic | `.title3` | :92 |
| `wordmark` | PlayfairDisplay-Medium | 38 | 500 | `.largeTitle` | :95 |
| `authLogo` | PlayfairDisplay-Medium | 32 | 500 | `.title` | :98 |
| `uiAction` | Inter-Medium | 15 | 500 | `.body` | :101 |
| `uiSmall` | Inter-Medium | 13 | 500 | `.footnote` | :104 |
| `monogramGlyph` | PlayfairDisplay-Medium | 14 | 500 | **none — fixed** (36 pt avatar) | :112 |
| `monogramGlyphSmall` | PlayfairDisplay-Medium | 9 | 500 | **none — fixed** (20 pt avatar) | :116 |

### Line-height and tracking

**There is no line-height token.** SwiftUI's per-face default leading is used, and extra leading is
added ad hoc at call sites via `.lineSpacing(_:)` — observed values across the app, in frequency
order: `2` (×11), `3` (×6), `4` (×5), `5` (×2), `0` (×2), `8` (×1). For mocks, `line-height: 1.45`
on body copy and `1.2` on Playfair headings reproduces the rendered result closely; anything tighter
will not match.

Tracking is also per-call-site. The recurring values, in frequency order: `0.4` (×25), `0.5` (×17),
`0.3` (×15), `2` (×11), `0.6` (×10), `1` (×7), `0.8` (×5) — plus `6` on the `PATINA` auth wordmark
(`apps/mobile/Patina/Patina/Features/Authentication/Views/AuthScreenView.swift:41`) and `8` on the
splash. Two convenience modifiers bake it in: `.patinaEyebrow()` = eyebrow + uppercase + tracking
`1.5` + `Text.muted` (`PatinaTypography.swift:137-143`); `.patinaMono()` = mono + uppercase +
tracking `0.5` + `agedOak` (`:146-152`).

**Rule of thumb for the mocks:** DM Mono labels are always uppercase with 0.3–0.6 tracking; Playfair
headings never track; the only wide tracking in the app is the wordmark.

---

## 3. Spacing scale — `Tokens/PatinaSpacing.swift:11-24`

| Token | pt |
|---|---|
| `xxxs` | 2 |
| `xxs` | 4 |
| `xs` | 4 (duplicate of `xxs`; the file notes "dedup deferred to the spacing sweep", :13) |
| `sm` | 8 |
| `xsm` | 12 |
| `md` | 16 |
| `mdLarge` | 20 |
| `lg` | 24 |
| `xl` | 32 |
| `xxl` | 48 |
| `xxxl` | 64 |

Observed layout constants that are **not** tokens and matter for the mocks: screen gutter is `20`
on the home (`apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift:120,138`) and `24`
on pushed screens (`Features/Recommendations/Views/RecommendationsView.swift:49,144`); pushed
screens start their content at `.padding(.top, 56)`; the Companion reserves a **120 pt** bottom
hearth (`ContentView.swift:166`, `DailyRoomView.swift:142`).

## 4. Corner radii — `Tokens/PatinaSpacing.swift:27-34`

| Token | pt | Typical use |
|---|---|---|
| `sm` | 4 | — |
| `md` | 8 | 32 pt settings icon tiles |
| `lg` | 12 | `PatinaCard`, text fields, `PatinaAsyncImage` |
| `xl` | 16 | Today cards (`TodayModules.swift:27,143`), settings group cards |
| `xxl` | 24 | detent-sheet corners (`ContentView.swift:125,131`) |
| `full` | 9999 | capsules (buttons, chips, badges) |

Non-token radii in live use: `14` (browse card, profile action row), `18` (Companion intro bubble),
`11` (notification icon tile), `6` (`MatchPill`). All `RoundedRectangle`s use
`style: .continuous` (Apple's squircle) — in CSS, plain `border-radius` is the closest available
approximation.

## 5. Shadows — `Tokens/PatinaShadows.swift:11-62`

All shadows are **mocha `#5C4A3C`** at varying alpha. SwiftUI's `radius` is a Gaussian σ; the CSS
blur equivalent is roughly `2 × radius`.

| Token | Color | Alpha | radius | x | y | CSS approximation | Line |
|---|---|---|---|---|---|---|---|
| `sm` | `#5C4A3C` | 0.06 | 4 | 0 | 2 | `0 2px 8px rgba(92,74,60,.06)` | :13-18 |
| `md` | `#5C4A3C` | 0.08 | 8 | 0 | 4 | `0 4px 16px rgba(92,74,60,.08)` | :20-25 |
| `lg` | `#5C4A3C` | 0.12 | 16 | 0 | 8 | `0 8px 32px rgba(92,74,60,.12)` | :27-32 |
| `xl` | `#5C4A3C` | 0.16 | 32 | 0 | 16 | `0 16px 64px rgba(92,74,60,.16)` | :34-39 |
| `dailyCard` | `mocha` | 0.18 | 24 | 0 | 4 | `0 4px 48px rgba(92,74,60,.18)` | :42-47 |
| `companion` | `#5C4A3C` | 0.20 | 12 | 0 | 4 | `0 4px 24px rgba(92,74,60,.20)` | :50-55 |

Applied via `.patinaShadow(_:)` (`:68-75`). Only `PatinaCard(style: .elevated)` carries one by
default (`Components/PatinaCard.swift:66-76`); the Today cards on the home are **flat** — surface fill
only, no shadow (`Features/Home/Views/TodayModules.swift:26-27,142-143`).

## 6. Gradients — `Tokens/PatinaGradients.swift:12-131`

All are `LinearGradient`; direction is given per row. `topLeading → bottomTrailing` ≈ CSS
`linear-gradient(135deg, …)`; `top → bottom` ≈ `linear-gradient(180deg, …)`.

| Token | Stops | Direction | Line |
|---|---|---|---|
| `warm` | `#F5F2ED` → `#C4A57B` | 135° | :14-17 |
| `dusk` | `#8B9CAD` → `#5C4A3C` | 180° | :19-22 |
| `earth` | `#8B7355` → `#C4A57B` | 135° | :24-27 |
| `sageGradient` | `#A8B5A0` → `#E5E2DD` | 135° | :29-32 |
| `leather` | `#8B6F47` → `#A3927C` | 135° | :34-37 |
| `linen` | `#D4CFC7` → `#E5E2DD` | 135° | :39-42 |
| `stone` | `#9E9689` → `#B8B0A5` | 135° | :44-47 |
| `wood` | `#6B5B4E` → `#8B7355` | 135° | :49-52 |
| `metal` | `#7A7B80` → `#A8A9AD` | 135° | :54-57 |
| `rattan` | `#B8A080` → `#D4C4A8` | 135° | :59-62 |
| `hero` | `#B8A080` → `#8B7355` → `#5C4A3C` | 135° | :65-68 |
| `hero2` | `#A8B5A0` → `#8B9CAD` → `#5C4A3C` | 135° | :71-74 |
| `walnut` | `#6B5B4E` → `#8B7355` (alias of `wood`) | 135° | :77-80 |
| `cherry` | `#8B5A3C` → `#B8775C` | 135° | :83-86 |
| `sunrise` | `#FAF7F2` → `#E8C547` → `#C4A57B` | 135° | :88-91 |
| `companionDock(warmTint:)` | `tint` α 0 → .15 → .50 → .85 → 1.0 at 0 / .25 / .55 / .80 / 1.0 | 180° | :94-106 |

`gradient(forKey:)` maps server strings (`"warm"`, `"walnut"`, `"hero"`, …) to these, `nil` on an
unknown key (`:111-131`) — the editorial story's `hero_gradient_key` and `maker_avatar_gradient_key`
come through here (`apps/mobile/Patina/Patina/Core/Network/EditorialStoriesAPIClient.swift:120-121`,
falling back to `hero` and `earth`).

**Room-type gradient mapping** (repeated verbatim in three views —
`Features/Home/Views/TodayModules.swift:202-211`, `Features/Rooms/Views/RoomProjectView.swift:193-202`,
`Features/Profile/Views/ProfileView.swift:372-381`): living → `warm`, bedroom → `dusk`, office →
`sageGradient`, dining → `earth`, kitchen → `rattan`, default → `linen`.

**Product-category placeholder mapping** (`apps/mobile/Patina/Patina/Core/Models/ProductModel.swift:115-124`):
seating → `leather`, tables → `wood`, lighting → `metal`, storage → `rattan`, decor → `linen`,
textiles → `warm`. Honest placeholders in the mocks should use these.

## 7. Motion

| Token | Value | Defined |
|---|---|---|
| Companion shell morph | spring, response `0.48`, damping `0.86` | `Tokens/PatinaCompanionMotion.swift:10-11` |
| Companion content follow | delay `0.08` s, fade `0.20` s | `:14-15` |
| Reduce Motion crossfade | `0.18` s ease-out | `:18` |
| Companion breathing (collapsed hearth only) | `3.0` s, autoreverse, scale → `1.08` | `:21`; `Components/StrataMarkView.swift:90-97` |
| Generic breathing modifier | `2.0` s, 1.0 → 1.05, autoreverse | `apps/mobile/Patina/Patina/Design/Animations/BreathingAnimation.swift:20-25` |
| Card → fullscreen hero morph (`.patinaHero`) | spring, response `0.5`, damping `0.82` | `apps/mobile/Patina/Patina/Design/Animations/PatinaTransitions.swift:14` |
| Chrome fade (`.patinaChrome`) | `0.32` s ease-out | `:18` |
| Phase root swap | `0.5` s easeInOut | `apps/mobile/Patina/Patina/ContentView.swift:81` |
| Phase transition (coordinator) | `0.4` s easeInOut | `App/Coordinators/AppCoordinator.swift:204` |
| Companion expand toggle | spring, response `0.4`, damping `0.8` | `AppCoordinator.swift:572` |
| Button press | scale `0.97`, opacity `0.9`, `0.15` s easeInOut | `Components/PatinaButton.swift:186-190` |
| Button loading/enabled fade | `0.15` s easeInOut | `:83-84` |
| Filter chip select | spring, response `0.3` | `Features/Recommendations/Views/RecommendationsView.swift:74` |
| `TimeOfDay.transitionDuration` | `0.8` s | `Tokens/TimeOfDay.swift:227` |
| Toast auto-dismiss | `2.4` s | `Features/Home/ViewModels/DailyRoomViewModel.swift:348` |
| Save-failure notice auto-clear | `4` s | `Features/Recommendations/ViewModels/RecommendationsViewModel.swift:233` |

**Reduce Motion is honoured everywhere** — every animated site branches on
`@Environment(\.accessibilityReduceMotion)` (C7): `StrataMarkView.swift:69-87`,
`PatinaCompanionMotion.shellAnimation(reduceMotion:)` `:23-30`, `BreathingModifier` `:36-52`,
`DailyRoomView.swift:54,154`, `OnboardingFlowView.swift:74,200`.

## 8. `TimeOfDay` token semantics — `Tokens/TimeOfDay.swift`

Six cases with fixed hour boundaries (`:211-222`), plus `next` for cycling (`:230-239`).

| Case | Hours | `greeting` (:27-42) | Background gradient stops (:47-86) | Overlay on a hero photo (:91-149) | Color temp K (:155-164) | Brightness (:167-176) | Text color (:181-196) | Glass? (:199-206) |
|---|---|---|---|---|---|---|---|---|
| `dawn` | 05:00–06:59 | "Early morning." | `#FFE4D6` → `#FFB5A7` → `#F8E0D0` | `#FFB48C` .18 → `#FFA064` .08 → clear, 135° | +800 | 0 | `#4A3830` @90% | no |
| `morning` | 07:00–10:59 | "Good morning." | `#FFF5E6` → `#FFE8D0` → `#F5E6D3` | `#FFD2A0` .15 → `#FFC382` .06 → clear, 135° | +400 | 0 | `#3D332B` @88% | no |
| `day` | 11:00–13:59 | "Good day." | `#F5F2ED` → `#E8E2D9` → `#DED6CC` | none (clear) | 0 | 0 | `#2E2622` @85% | no |
| `afternoon` | 14:00–17:59 | "Good afternoon." | `#F8F2E8` → `#E8DFD0` → `#D8CCBB` | `#FFF5DC` .08 → clear → `#C8B496` .06, 180° | +200 | 0 | `#3A302A` @88% | no |
| `evening` | 18:00–20:59 | "Good evening." | `#C9A99B` → `#A3927C` → `#7D6E63` | `#503C2D` .25 → `#32261E` .40, 180° | +600 | −0.15 | white @90% | **yes** |
| `night` | 21:00–04:59 | "Good night." | `#3F3B37` → `#2A2725` → `#1A1816` | `#191614` .45 → `#0F0C0A` .55, 180° | −200 | −0.30 | white @85% | **yes** |

⚠ **Live use is almost nil.** `TimeOfDay.current` is read in exactly three places: the
camera-permission primer's background gradient
(`apps/mobile/Patina/Patina/Features/FirstLaunch/Views/CameraPermissionView.swift:68`) and two
Companion greeting generators (`Features/Companion/Services/CompanionVoice.swift:34`,
`Services/Companion/CompanionService.swift:156`). The `overlayGradient`, `colorTemperature`,
`brightnessAdjustment`, `textColor`, and `usesGlassMorphism` members have **no call sites at all** —
they were built for the deleted Hero Frame / Threshold surfaces (`:7-10`). The Daily Room does not
read `TimeOfDay`. Any direction that puts time of day on the home is *re-activating* a full,
already-specified token set, not inventing one.

`CompanionVoice` also carries a first-time / returning greeting pair per case
(`CompanionVoice.swift:42-74`) — e.g. returning evening: *"Evening. Something surfaced while you were
away."*

---

## 9. Component inventory and visual rules

`Components/` — all `public`, all consumed by both apps.

### `PatinaButton` — `Components/PatinaButton.swift:25-125`
Capsule, **height 52**, full-width except `.ghost`; label `uiAction` (Inter-Medium 15); optional
leading icon; `isLoading` shows a `ProgressView` tinted to the foreground and suppresses taps;
`isEnabled == false` → opacity `0.5` + disabled. Every tap fires `HapticManager.impact(.light)`
(`:54`). Press feedback via `PressableButtonStyle`: scale `0.97`, opacity `0.9`, 0.15 s (`:183-192`).

| Style | Fill | Label | Border |
|---|---|---|---|
| `.primary` | `Interactive.active` (`#2C2926` / `#F2EDE6`) | `Text.inverse` | none |
| `.secondary` | `Background.primary` | `Text.primary` | `pearl` 1.5 pt |
| `.ghost` | clear (intrinsic width) | `Text.interactive` | none |
| `.clay` | `clay #C4A57B` | `offWhite` | none |
| `.destructive` | `error #C77B6E` | `offWhite` | none |

`AuthButton` (`:135-179`) is a thin adapter for the auth screens: **height 50**, radius **12** (not a
capsule), `.apple` = filled `Interactive.active` with no border; `.google` / `.email` =
`Background.primary` + `pearl` 1.5 pt border.

### `PatinaCard` — `Components/PatinaCard.swift:22-76`
Padding `md` (16), full width, leading-aligned, radius `lg` (12).
`.surface` = `Background.secondary`, no border, no shadow · `.elevated` = `Background.primary` +
`PatinaShadows.md` · `.outline` = clear + `pearl` 1 pt.

### `FilterChip` — `Components/FilterChip.swift:11-36`
Capsule; `caption` (Inter-Medium 12); padding `14 × 6`.
Active = `Interactive.active` fill + `Text.inverse`; inactive = `Background.secondary` fill +
`Text.secondary`. No border in either state.

### `MatchPill` — `Components/MatchPill.swift:10-31`
Text `"{score}% match"`, `monoLabel` (DM Mono 10), tracking `0.5`, **uppercase**, `Text.secondary`;
padding `8 × 3`; radius **6** `.continuous`; a `.regularMaterial` blur layered over a
`Background.primary` @ 92% fill. Used top-right on product artwork.
(`ProductDetailView` renders its own variant instead: `mono` (DM Mono 10) in `success #7A9B76` on
`success` @12%, capsule — `apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:177-184`.)

### `MonoLabel` — `Components/MonoLabel.swift:11-51`
Defaults: `PatinaTypography.mono` (DM Mono 10), **uppercase**, `Text.muted`, tracking `0.5`.
All four are overridable. This is the app's universal metadata label — maker names, "Active Room",
"Next Move", "Member since", stat labels, section eyebrows.

### `PatinaEmptyState` — `Components/PatinaEmptyState.swift:12-59`
Centered `VStack(spacing: md)`: SF Symbol at **40 pt, weight `.light`**, `Text.muted`; then
`VStack(spacing: xs)` with the title in `h4` (Playfair 22) `Text.primary` and the message in
`bodySmall` `Text.muted`, both centered; then an optional `PatinaButton(.secondary)` with
`.fixedSize()` and `xs` top padding. Outer padding `xl` (32), full width.

### `PatinaStatusBadge` — `Components/PatinaStatusBadge.swift:11-61`
Capsule; `HStack(spacing: xs)` of an SF Symbol at `caption` size + text in `captionMedium`
(Inter-SemiBold 12), tracking `0.5`, **uppercase**; foreground = the state tint; background = the
same tint at **14%**; padding `sm × xxs` (8 × 4).

| State | Tint | Icon |
|---|---|---|
| `.info` | `dustyBlue #8B9CAD` | `info.circle.fill` |
| `.success` | `success #7A9B76` | `checkmark.circle.fill` |
| `.warning` | `warning #D4A574` | `exclamationmark.triangle.fill` |
| `.error` | `error #C77B6E` | `xmark.circle.fill` |

Design-request stages map onto these at
`apps/mobile/Patina/Patina/Services/DesignServices/DesignRequestStatusService.swift:106-115`
(finding/held/inTouch → `.info`; introduced/booked/matched → `.success`; closed/expired →
`.warning`).

### `StrataMarkView` — `Components/StrataMarkView.swift:26-112`
The brand mark and the Companion's face: three stacked capsules, `VStack(spacing: 4 × scale)`, each
**3 pt tall**, widths **24 / 18 / 12 pt** (100% / 80% / 60%), scaled by `scale`.
With `useSpecColors` (default): line 1 = `Strata.line1` (`#5C4A3C` / `#D8C9B4`), line 2 =
`clay #C4A57B`, line 3 = `clay` @ 50%. With `useSpecColors: false`: the passed color at 100 / 70 /
50%. `breathing: true` animates scale → **1.08** over **3.0 s** autoreversed, and is fully suppressed
under Reduce Motion (`:69-87`). Accessibility is explicit: `.decorative` or
`.companionControl` — label **"Patina Companion"**, hint **"Double tap to open, or drag up for quick
actions"** (`:17-21`).

### Also in the kit (not named in the brief, but drawn in the mocks)
- `PatinaAsyncImage` (`Components/PatinaAsyncImage.swift:14`): the branded loading/failure
  placeholder — `Background.secondary` fill with a centered `StrataMarkView(color: clay)` at scale
  0.9 (loading) / 1.0 (failure). **This, not a grey box, is what an unloaded product image looks
  like.**
- `PatinaTextField` (`:20`): `Background.secondary` fill, radius `lg` (12), border `clay` @20%
  resting / `Text.interactive` @50% focused / `error` on error, optional 20 pt leading glyph.
- `PatinaSheetHeader` (`:12`), `ClayBackground` / `ClayCircleBackground`
  (`Components/ClayBackground.swift:36,61` — a seeded, non-re-rolling clay grain texture at
  `textureIntensity` 0.3 default).
- `HapticManager` (`Support/HapticManager.swift`) — `.impact`, `.notification`, `.companionPulse`.

### App-local components worth mirroring
`TierPill` (`apps/mobile/Patina/Patina/Design/Components/TierPill.swift:10` — designerSelection /
editorPick / standard), `PatinaLoadingState` / `PatinaErrorState`
(`Design/Components/`), `BackChevronButton` (`Design/Animations/PatinaTransitions.swift:22-55`:
36 pt circle, `.light` = charcoal chevron on `offWhite` @92% with a `pearl` hairline; `.dark` =
`offWhite` chevron on `offWhite` @12%, no stroke).

---

## 10. Quick reference for the deck build

```css
/* light */
--bg:            #FAF7F2;  --bg-2:      #F5F2ED;  --bg-dark:  #2C2926;
--text:          #2C2926;  --text-2:    #5C4A3C;  --text-mut: #8B7355;
--text-inv:      #FAF7F2;  --text-link: #9F7E48;
--accent:        #C4A57B;  --line:      #E5E2DD;
--active-fill:   #2C2926;
--success: #7A9B76; --warning: #D4A574; --error: #C77B6E; --info: #8B9CAD;
--sage: #A8B5A0; --terracotta: #D4A090; --golden: #E8C547;

/* dark — swap only these; every other value is static by design */
--bg:            #211E1B;  --bg-2:      #2C2926;
--text:          #F2EDE6;  --text-2:    #D8C9B4;  --text-mut: #B5A487;
--text-inv:      #211E1B;  --text-link: #C4A57B;
--active-fill:   #F2EDE6;

/* type */
--serif: 'Playfair Display', 'Iowan Old Style', Georgia, serif;   /* 400 / 500 / 400i */
--sans:  Inter, -apple-system, 'Segoe UI', sans-serif;            /* 400 / 500 / 600 */
--mono:  'DM Mono', ui-monospace, 'SF Mono', Menlo, monospace;    /* 400 / 500 */

/* space */  2 4 8 12 16 20 24 32 48 64
/* radius */ 4 8 12 16 24 / capsule
/* shadow */ 0 4px 16px rgba(92,74,60,.08)   /* md, the workhorse */
```

Reminders that will make a mock read wrong if ignored: the home's gutter is **20**, not 24; pushed
screens begin at **top: 56**; the Companion owns the bottom **120 pt**; Today cards are **flat**
(no shadow) at radius **16**; every DM Mono label is **uppercase**; and an unloaded product image is
a **Strata mark on `Background.secondary`**, never a grey rectangle.

---

## Correction — 2026-08-26 (G5 lane, `17-gap-fills.md`)

**`PatinaSheetHeader` (line 388 above) — the bare file:line is now a full spec, and it comes with a
correction: the component has ZERO call sites.** It is referenced nowhere in `apps/mobile/Patina` or
`apps/mobile/Capture`; the only hits in the repo are its own declaration and `#Preview`
(`PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaSheetHeader.swift:12, 83`). Every sheet in
the client app hand-rolls its header. **A mock that draws this component depicts something the app
has never rendered.**

**The component as written** (`PatinaSheetHeader.swift:43-77`) — one baseline-aligned `HStack`:

| Property | Value | Source |
|---|---|---|
| Container spacing | `PatinaSpacing.md` = **16pt**, `alignment: .firstTextBaseline` | `:44` |
| Padding | h `PatinaSpacing.lg` = **24pt** · v `PatinaSpacing.md` = **16pt** | `:61-62` |
| Eyebrow (optional) | `patinaEyebrow()` → Inter-SemiBold **12pt**, uppercase, tracking **1.5**, `Text.muted` | `:48-50`; `PatinaTypography.swift:86,136-143` |
| Eyebrow→title gap | `PatinaSpacing.xxxs` = **2pt** | `:47` |
| Title | `PatinaTypography.h4` = **PlayfairDisplay-Regular 22pt** (`relativeTo: .title3`), `Text.primary` | `:52-54`; `PatinaTypography.swift:33` |
| Actions (lead/trail) | SF Symbol at `bodyMedium` (Inter-Medium 16pt), `Text.secondary`, **44×44** frame, `.contentShape(Rectangle())`, `.buttonStyle(.plain)`, required `accessibilityLabel` | `:66-77` |
| Drag handle · divider · background | **none · none · none** (inherits its container) | — |

**Draw this instead — the de-facto Patina sheet header**
(`apps/mobile/Patina/Patina/Features/Home/Views/AddToRoomSheet.swift:16-36`), the closest living
relative to the mandated order sheet:

- Hand-drawn drag handle: `RoundedRectangle(cornerRadius: 2)`, `Text.muted.opacity(0.25)`,
  **36×4pt**, top padding **18**, bottom **14** (`:18-22`) — drawn manually even though
  `.presentationDragIndicator(.visible)` is used elsewhere (`Features/Help/Views/HelpPanelSheet.swift:122`).
- **Title first, eyebrow second** — inverted vs. the design-system component: `h5`
  (PlayfairDisplay-**Medium 18pt**), then a `monoSmall` (DMMono-Regular **9pt**) sub-label, tracking
  `0.4`, uppercased, `Text.muted` (`:24-33`).
- Leading-aligned, `.padding(.horizontal, 24)`, inner `VStack(spacing: 3)` — hard-coded, not tokens.
- `PatinaColors.Background.primary`, `.presentationDetents([.medium])`, **no divider** (`:55-57`).

Adopting the design-system component would flip title/eyebrow order, move the title 18pt → 22pt, and
still require a drag handle supplied from outside it. Call that out as a change if a direction wants it.

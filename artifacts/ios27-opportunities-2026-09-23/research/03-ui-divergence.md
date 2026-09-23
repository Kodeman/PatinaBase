# 03 — UI/UX divergence: Patina (client) vs Patina Field (Capture)

Read-only audit, 2026-09-23. Subjects:

- `/Users/kody/Code/patina-merged/apps/mobile/Patina` — **Patina**, client app, bundle `cloud.patina.app`
- `/Users/kody/Code/patina-merged/apps/mobile/Capture` — **Patina Field**, designer/trades app, bundle `cloud.patina.field`
- `/Users/kody/Code/patina-merged/apps/mobile/PatinaDesignKit` — shared SwiftPM design package

Every claim is labelled **EVIDENCE** (read in a file, cited `path:line`), **INFERENCE** (derived from evidence), or **ASSUMPTION** (could not confirm). Counts come from `grep -r --include='*.swift'` over app source only (`Patina/Patina` = 479 files; `Capture/Capture` + `Capture/CaptureKit` = 272 files); test targets excluded unless stated.

---

## 0. Executive shape of the divergence

**INFERENCE.** There is one shared design package and two apps that consume it at radically different depths. Patina treats `PatinaDesignKit` as its design system (it `@_exported import`s the whole module once, `apps/mobile/Patina/Patina/Design/DesignKitReexport.swift:11`). Capture treats it as a *colour and font supply*: `CaptureColor` re-points 20 legacy token names at `PatinaColors` values (`apps/mobile/Capture/CaptureKit/CaptureKit/Design/CaptureColor.swift:20-59`) and `CaptureType` declares its own 10-step ramp over the same font families (`.../CaptureType.swift:22-35`), then builds every component locally.

The result: the two apps **share pigments and typefaces but share almost no geometry, no component, no motion constant, and no lexicon.**

| Layer | Shared? | Evidence |
|---|---|---|
| Colour values | Yes, via alias | `CaptureColor.swift:20-59` — 20 aliases onto `PatinaColors` |
| Font *families* | Yes | both register via `PatinaFonts.registerAll()` (`PatinaApp.swift:64`, `CaptureApp.swift:22`) |
| Font *faces / ramp* | **No** | `PatinaTypography` 40 tokens vs `CaptureType` 10 tokens; different name strings (§2) |
| Spacing scale | **No** | `PatinaSpacing.*` used 243× in Patina, **0×** in Capture |
| Corner radii | **No** | `PatinaRadius.*` used 54× in Patina, **0×** in Capture |
| Shadows | **Barely** | `PatinaShadows` used once in Capture (`FieldCompanionHearthView.swift`) |
| Motion constants | **No** (duplicated) | `PatinaCompanionMotion` used 0× in Patina; Patina has a byte-identical private copy (§1.6) |
| Components | Partial | 4 of 13 shared components have **zero call sites anywhere** (§5.0) |
| Navigation idiom | **No** | hand-rolled 4-word bar vs two-realm `NavigationStack` (§6) |
| Lexicon | **No** | "piece" (test-enforced) vs "specimen" (§7) |

---

## 1. Design token sources

### 1.1 Token file inventory

**EVIDENCE.** `PatinaDesignKit/Sources/PatinaDesignKit/`:

| File | Purpose |
|---|---|
| `Tokens/PatinaColors.swift` | 24 raw hex + 9 semantic namespaces (`Background`, `Text`, `Border`, `Interactive`, `OnDark`, `Scrim`, `Stamp`, `Strata`, `DarkPalette`) |
| `Tokens/PatinaSpacing.swift` | 11-step spacing + 6-step `PatinaRadius` |
| `Tokens/PatinaTypography.swift` | 40 font tokens + 4 view modifiers |
| `Tokens/PatinaShadows.swift` | 6 shadow tokens + `patinaShadow()` modifier |
| `Tokens/PatinaGradients.swift` | 16 gradients + `gradient(forKey:)` server-key mapper |
| `Tokens/PatinaCompanionMotion.swift` | 6 motion constants, explicitly "shared by Patina and Patina Field" (`:9`) |
| `Tokens/TimeOfDay.swift` | 6-phase time model: gradients, overlays, colour temp, text colour |
| `Support/PatinaFonts.swift` | `CTFontManagerRegisterFontURLs` from `Bundle.module` |
| `Support/HapticManager.swift` | singleton, 7 generators, 4 named patterns |

**EVIDENCE.** Patina-app-local design files (`apps/mobile/Patina/Patina/Design/`): `Accessibility/AccessibleHitTarget.swift`, `Animations/BreathingAnimation.swift`, `Animations/PatinaTransitions.swift`, `Components/{CompanionSafeArea, InteractivePopGestureEnabler, PatinaErrorState, PatinaLoadingState, PatinaScreenChrome, TierPill}.swift`, `Gestures/{CompanionPullGesture, HoldGesture, LingerGesture}.swift`, `DesignKitReexport.swift`, `PatinaLog.swift`. **No colour, spacing, radius, or type file** — those all come from the package.

**EVIDENCE.** Capture-local design files (`apps/mobile/Capture/CaptureKit/CaptureKit/Design/`): `CaptureColor.swift`, `CaptureType.swift`, `Color+Hex.swift`, `FieldVerbControls.swift`, `ProvenanceBadge.swift`, `SpecimenFieldRow.swift`. **No spacing file, no radius file, no shadow file, no motion file.**

### 1.2 Colour palette — actual values

**EVIDENCE**, `PatinaColors.swift`:

| Token | Hex | Line |
|---|---|---|
| `offWhite` / `warmWhite` | `#FAF7F2` | `:17`, `:45` |
| `clay` | `#C4A57B` | `:20` |
| `clayDeep` | `#9F7E48` | `:23` |
| `clayInk` | `#82612F` | `:28` |
| `agedOak` | `#8B7355` | `:31` |
| `oakInk` | `#4E4339` | `:92` |
| `mocha` | `#5C4A3C` | `:34` |
| `charcoal` | `#2C2926` | `:37` |
| `softCream` | `#F5F2ED` | `:42` |
| `pearl` | `#E5E2DD` | `:48` |
| `sage` | `#A8B5A0` | `:51` |
| `dustyBlue` | `#8B9CAD` | `:54` |
| `terracotta` | `#D4A090` | `:57` |
| `terracottaInk` | `#9C5340` | `:71` |
| `goldenHour` | `#E8C547` | `:60` |
| `goldenHourInk` | `#79651E` | `:66` |
| `subtleInk` | `#5A4E43` | `:79` |
| `success` | `#7A9B76` | `:97` |
| `warning` | `#D4A574` | `:100` |
| `error` | `#C77B6E` | `:103` |
| `errorDeep` | `#9C4C3F` | `:107` |
| `Scrim.chrome` | `#332F2B` | `:193` |

Dark palette (`DarkPalette`, `:116-146`): `background #211E1B`, `backgroundSecondary #2C2926`, `surfaceDark #524B44`, `textPrimary #F2EDE6`, `textSecondary #DFD2C0`, `textMuted #C7B99F`, `textError #DE8A7B`.

Borders (`:205-217`): `hairline` = `pearl` / `#322E29`; `strong` = `#C8C3BB` / `#524C45`; `onDark` = `#756B61` (static).

`OnDark` (`:180-184`): `primary #FAF7F2`, `secondary #D8D2C8`, `muted #B7AE9F` — static, non-flipping.

**EVIDENCE.** Dark mode is resolved via `Color.patinaDynamic(light:dark:)` bridging `UIColor { traits in … }` (`PatinaColors.swift:333-339`).

### 1.3 Capture's colour mapping — the diff

**EVIDENCE**, `CaptureColor.swift`:

| Capture token | Resolves to | Light | Dark | Line |
|---|---|---|---|---|
| `verdigris` | `PatinaColors.clay` | `#C4A57B` | `#C4A57B` (static) | `:20` |
| `verdigrisInk` | `Text.interactive` | `#82612F` | `#C4A57B` | `:22` |
| `success` | `PatinaColors.success` | `#7A9B76` | same (static) | `:27` |
| `warning` | `PatinaColors.warning` | `#D4A574` | same (static) | `:29` |
| `error` | `PatinaColors.error` | `#C77B6E` | same (static) | `:31` |
| `goldenHour` | `PatinaColors.goldenHour` | `#E8C547` | same (static) | `:33` |
| `terracotta` | `PatinaColors.terracotta` | `#D4A090` | same (static) | `:35` |
| `paper` | `Background.primary` | `#FAF7F2` | `#211E1B` | `:40` |
| `paper2` | local `dynamic(pearl, charcoal)` | `#E5E2DD` | `#2C2926` | `:42` |
| `paper3` | `Background.secondary` | `#F5F2ED` | `#2C2926` | `:45` |
| `ink` | `Text.primary` | `#2C2926` | `#F2EDE6` | `:50` |
| `ink2` | `Text.secondary` | `#5C4A3C` | `#DFD2C0` | `:52` |
| `inkSoft` | `Text.muted` | `#8B7355` | `#C7B99F` | `:54` |
| `line` | `Text.primary` @16% | — | — | `:58` |
| `line2` | `Text.primary` @30% | — | — | `:59` |

**Gaps.** Capture has **no** equivalent of: `Border.hairline`/`strong` (it derives hairlines from text ink at 16%/30% — `:58-59`, a different construction), `OnDark.*`, `Scrim.chrome`, `Stamp.*` (six pigments), `Interactive.active`, `Text.inverse`, `Text.error`, `errorDeep`, the four `*Ink` accessibility-raised values, or `Strata.*`. **EVIDENCE.**

**Consequence (INFERENCE).** Patina's palette was audited and raised for contrast — `clayInk` exists because "`clayDeep` is 3.54:1 on the light canvas and `clay` is 2.18:1, so neither can hold text (A-73)" (`PatinaColors.swift:26-27`); `Text.error` exists because `error` "computes **3.03:1** on the light canvas" (`:243`); `oakInk` exists because `agedOak` "measures 4.20:1 on paper" (`:87-88`). Capture aliases straight onto the **un-raised** values (`error`, `warning`, `goldenHour`, `terracotta` — all static, non-flipping) and uses them as fills with flipping ink. Two computed failures:

- `FieldAffirmationChip` (`apps/mobile/Capture/Capture/Features/Capture/FieldAffirmationChip.swift:22-24`): `CaptureColor.ink` on `CaptureColor.goldenHour` (`#E8C547`) → **9.01:1 light, 1.39:1 dark**. INFERENCE (WCAG relative-luminance computed from the cited hex values).
- `OfflineQueueBanner` queued-count pill (`apps/mobile/Capture/Capture/Features/Resilience/OfflineQueueBanner.swift:49-52`): `CaptureColor.ink` on `CaptureColor.warning` (`#D4A574`) → **6.50:1 light, 1.93:1 dark**. INFERENCE, same method.

Patina's own `PatinaStatusBadge` avoids this by using the status colour only as a 14 % wash and routing ink through `Text.error` (`PatinaStatusBadge.swift:40-45, 74-77`). **EVIDENCE.**

### 1.4 Spacing & radius scales

**EVIDENCE**, `PatinaSpacing.swift:12-33`:

```
xxxs 2 · xxs 4 · xs 4 · sm 8 · xsm 12 · md 16 · mdLarge 20 · lg 24 · xl 32 · xxl 48 · xxxl 64
PatinaRadius: sm 4 · md 8 · lg 12 · xl 16 · xxl 24 · full 9999
```

(`xxs` and `xs` are both 4 — "dedup deferred to the spacing sweep", `:13`.)

**EVIDENCE.** Adoption:

| | Patina | Capture |
|---|---|---|
| `PatinaSpacing.*` call sites | 243 (`md` 60, `sm` 57, `lg` 38, `xsm` 30, `xl` 23, `mdLarge` 16, `xs` 11, `xxs` 3, `xxl` 3, `xxxs` 2) | **0** |
| `PatinaRadius.*` call sites | 54 (`lg` 30, `xl` 14, `md` 9, `sm` 1) | **0** |
| raw `spacing: N` literals | 599 | 495 |
| raw `cornerRadius: N` | 217 | 154 |

**EVIDENCE.** Modal raw values diverge:

| | Patina top-3 `spacing:` | Patina top-3 `cornerRadius:` | Patina top `.padding(.horizontal, N)` |
|---|---|---|---|
| | 0 (114), 12 (112), 8 (71) | 12 (72), 14 (42), 16 (34) | **24 (154)**, 20 (33), 16 (27) |

| | Capture top-3 `spacing:` | Capture top-3 `cornerRadius:` | Capture top `.padding(.horizontal, N)` |
|---|---|---|---|
| | 10 (80), 8 (75), 12 (64) | **14 (51)**, 12 (44), 10 (26) | 16 (28), 20 (26), 14 (17) |

**INFERENCE.** Patina's page gutter is **24 pt** (a clear mode). Capture has **no page gutter convention** — 16/20/14 are within 15 % of each other. Capture's card radius is **14** (off-grid; `PatinaRadius` has no 14). Capture's dominant `spacing: 10` is off-grid too.

### 1.5 Shadows

**EVIDENCE**, `PatinaShadows.swift:13-55`. All use `#5C4A3C` (mocha):

| Token | Opacity | Radius | y |
|---|---|---|---|
| `sm` | 0.06 | 4 | 2 |
| `md` | 0.08 | 8 | 4 |
| `lg` | 0.12 | 16 | 8 |
| `xl` | 0.16 | 32 | 16 |
| `dailyCard` | 0.18 | 24 | 4 |
| `companion` | 0.20 | 12 | 4 |

**EVIDENCE.** Capture uses `PatinaShadows.companion` exactly once (`FieldCompanionHearthView.swift`, via `.patinaShadow(…)`). It has no other shadow token; Capture's cards use a 1 pt stroke instead of elevation (`RecognitionSupport.swift:114`, `ProjectsSupport.swift:141-142`).

### 1.6 Motion — the duplicated constant block

**EVIDENCE.** `PatinaCompanionMotion.swift:8-21` declares: `morphResponse 0.48`, `morphDampingFraction 0.86`, `contentFollowDelay 0.08`, `contentFadeDuration 0.20`, `reducedMotionCrossfadeDuration 0.18`, `breathingDuration 3.0`. Its header says "Cross-app motion tokens … shared by Patina and Patina Field" (`:4, :9`).

**EVIDENCE.** `grep PatinaCompanionMotion` in `apps/mobile/Patina/Patina` → **0 hits**. Patina's `CompanionHearthView` reads `CompanionConstants.*` instead (`CompanionHearthView.swift:84-89`), which declares byte-identical values at `apps/mobile/Patina/Patina/Features/Companion/Models/CompanionState.swift:174-243` (`springResponse 0.48`, `springDamping 0.86`, `contentFollowDelay 0.08`, `contentFadeDuration 0.20`, `reducedMotionCrossfadeDuration 0.18`, `breathingDuration 3.0`).

**EVIDENCE.** Capture's `FieldCompanionHearthView` *does* use the shared token (`FieldCompanionHearthView.swift:54-55, 70, 73`).

**INFERENCE.** The shared motion file was extracted for cross-app parity, Capture adopted it, Patina never did. The values agree today; nothing keeps them agreeing. **ACCIDENTAL.**

---

## 2. Typography

### 2.1 Vendored faces (ground truth)

**EVIDENCE.** Parsed the `name` table of all 9 TTFs in `PatinaDesignKit/Sources/PatinaDesignKit/Resources/Fonts/`:

| File | family (nameID 1) | PostScript (nameID 6) |
|---|---|---|
| `PlayfairDisplay-Regular.ttf` | `Playfair Display` | `PlayfairDisplay-Regular` |
| `PlayfairDisplay-Medium.ttf` | **`Playfair Display Medium`** | `PlayfairDisplay-Medium` |
| `PlayfairDisplay-Italic.ttf` | `Playfair Display` | `PlayfairDisplay-Italic` |
| `Inter-Regular.ttf` | `Inter` | `Inter-Regular` |
| `Inter-Medium.ttf` | **`Inter Medium`** | `Inter-Medium` |
| `Inter-SemiBold.ttf` | **`Inter SemiBold`** | `Inter-SemiBold` |
| `DMMono-Regular.ttf` | `DM Mono` | `DMMono-Regular` |
| `DMMono-Medium.ttf` | **`DM Mono Medium`** | `DMMono-Medium` |
| `DMMono-Light.ttf` | `DM Mono Light` | `DMMono-Light` |

Each non-Regular weight ships as its **own family**, not as a style within one family.

### 2.2 How each app names fonts

**EVIDENCE.** `PatinaTypography.swift:15-17` uses PostScript-style names and concatenates the weight: `"PlayfairDisplay" + "-Medium"`, `"Inter" + "-SemiBold"`, `"DMMono" + "-Regular"`.

**EVIDENCE.** `CaptureType.swift:17-19` uses **family names with spaces**: `serif = "Playfair Display"`, `sans = "Inter"`, `mono = "DM Mono"` — and every token is built from those three strings alone (`:22-35`). The only weight expression is `CaptureType.bodyEmph = Font.custom(sans, size: 16, relativeTo: .body).weight(.semibold)` (`:28`).

**INFERENCE (high confidence).** `"Playfair Display"` resolves to the *Regular* face, because `Playfair Display Medium` is a different family (§2.1). **Patina Field never renders Playfair Medium.** `"Inter"` + `.weight(.semibold)` cannot reach `Inter SemiBold` for the same reason; SwiftUI will synthesise weight on Inter Regular. **Capture's "semibold" is faux bold.** This is the exact failure mode `PatinaTypography.swift:25-30` documents for `PlayfairDisplay-Light` ("that face is not vendored, so `Font.custom` fell back to San Francisco silently").

**ASSUMPTION.** I did not run either app to confirm the rendered faces; the conclusion rests on the name-table dump plus Core Text family/PostScript semantics.

### 2.3 The two ramps side by side

**EVIDENCE.**

| Role | Patina token (face @ pt, `relativeTo:`) | Capture token (face @ pt, `relativeTo:`) |
|---|---|---|
| Hero | `display1` Playfair-Medium 56 `.largeTitle` | — |
| | `display2` Playfair-Medium 40 `.largeTitle` | — |
| | `display2Regular` Playfair-Regular 40 | — |
| | `displaySmall` Playfair-Medium 28 `.title2` | — |
| Screen title | `h1` Playfair-Medium 32 `.title` | `display` "Playfair Display" 32 `.largeTitle` |
| | `h2` Playfair-Regular 26 `.title2` | — |
| | `h3` Playfair-Regular 24 `.title2` | `title` "Playfair Display" 24 `.title` |
| | `h4` Playfair-Regular 22 `.title3`; `h4Medium` 22 Medium | — |
| | — | `title2` "Playfair Display" 20 `.title2` |
| | `h5` Playfair-Medium 18; `h5Regular` 18 Regular `.title3` | — |
| | `h6` Playfair-Medium 15 `.subheadline` | — |
| | `headlineSerif` Playfair-Medium 24 `.headline` | — |
| | `headlineMedium` Inter-SemiBold 18 `.headline` | — |
| Body | `bodyLarge` Inter-Regular 18 | — |
| | `body` Inter-Regular 16 `.body` | `body` "Inter" 16 `.body` |
| | `bodyMedium` Inter-Medium 16 | `bodyEmph` "Inter" 16 `.weight(.semibold)` |
| | `bodySerif` Playfair-Regular 16 `.body` | — |
| | `bodySmall` Inter-Regular 14 `.subheadline` | — |
| | `bodySmallMedium` Inter-Medium 14 | — |
| | — | `callout` "Inter" 15 `.callout` |
| | — | `footnote` "Inter" 13 `.footnote` |
| Caption | `caption` Inter-Medium 12 `.caption` | — |
| | `captionRegular` Inter-Regular 12 | — |
| | `captionMedium` Inter-SemiBold 12 | — |
| | `captionSerif` Playfair-Medium 12 | — |
| | `captionSmall` Inter-Regular 10 `.caption2` | — |
| Mono | `mono` / `monoLabel` / `monoMedium` DMMono 10 `.caption2` | `eyebrow` "DM Mono" **11** `.caption2` |
| | `monoSmall` DMMono-Regular 9 | `monoSmall` "DM Mono" **12** `.caption` |
| | `monoTiny` DMMono 8 *(deprecated)* | — |
| | `monoLarge` DMMono-Regular 14 `.subheadline` | `monoBody` "DM Mono" 14 `.subheadline` |
| Voice | `patinaVoice` Playfair-**Italic** 18 | **none** |
| | `patinaVoiceLarge` Italic 22; `voiceLead` Italic 26; `voiceSmall` Italic 15; `voiceCaption` Italic 13 | **none** |
| Brand | `wordmark` Playfair-Medium 38; `authLogo` 32 | — |
| UI | `uiAction` Inter-Medium 15 `.body`; `uiSmall` Inter-Medium 13 `.footnote` | — |
| Fixed | `monogramGlyph` Playfair-Medium 14 (no `relativeTo:`); `monogramGlyphSmall` 9 | — |

**40 tokens vs 10.** **EVIDENCE.**

Three name collisions with different values: `monoSmall` (Patina 9 pt / Capture 12 pt), `eyebrow` (Patina = **Inter-SemiBold 12**, `PatinaTypography.swift:128`; Capture = **DM Mono 11**, `CaptureType.swift:33`), `title` vs `h3` (both 24 but different weights per §2.2). **EVIDENCE.**

### 2.4 Dynamic Type

**EVIDENCE.** Every token in both ramps carries `relativeTo:` except Patina's two `monogramGlyph*` (deliberately, `PatinaTypography.swift:161-169`).

**EVIDENCE.** Escape hatches:

| | Patina | Capture |
|---|---|---|
| `.system(size:` (fixed, non-scaling) | **129** | **8** |
| `Font.custom(` outside token file | 1 | 0 |
| `Color(hex:` outside token file | 0 | 0 |
| `Color.white` | 16 | 0 |
| `Color.black` | 20 | 2 |
| `Color.gray` | 3 | 0 |
| `foregroundStyle(.white)` | 7 | 2 |
| `foregroundStyle(.secondary)` | 6 | 1 |
| `.dynamicTypeSize` guard rails | 71 | 23 |
| `.minimumScaleFactor` | 31 | **0** |

**INFERENCE.** Capture's SwiftLint ratchet bans raw hex and untokenised `Font.custom` outside `Design/` (`apps/mobile/Capture/.swiftlint.yml:16-30`) and it is working — Capture leaks almost nothing. Patina's `.swiftlint.yml` has **no raw-hex rule and no system-colour rule** (`apps/mobile/Patina/.swiftlint.yml:59-86` — only `foregroundColor`, `Font.custom` in `Features/`, `navigationBarHidden`, `cornerRadius`, `asyncAfter`, `print`). Patina therefore leaks 129 fixed sizes and 46 raw SwiftUI colours. **The stricter lint lives on the app with the weaker token adoption.**

---

## 3. Colour — semantic naming conventions

**EVIDENCE.** Patina's convention is **role-first, nested**: `PatinaColors.Text.primary`, `.Background.secondary`, `.Border.hairline`, `.Interactive.active`, `.Stamp.mocha`, `.OnDark.muted`, `.Scrim.chrome`. Each pairs a light and dark value through `patinaDynamic`.

**EVIDENCE.** Capture's convention is **material-metaphor, flat**: `paper` / `paper2` / `paper3` (surfaces), `ink` / `ink2` / `inkSoft` (text), `line` / `line2` (rules), `verdigris` / `verdigrisInk` (accent). The header states the names are legacy: "verdigris family → clay family … The legacy names survive as aliases so ~230 call sites keep compiling" (`CaptureColor.swift:6-10`).

**INFERENCE. ACCIDENTAL.** `verdigris` is the name of a *green* patina; it now paints `#C4A57B`, a warm clay gold. A designer reading Capture's source sees a colour word that contradicts the pixel. The file itself calls this a deferred rename.

**EVIDENCE.** Dark mode control:
- Patina ships a user-facing Appearance picker (System / Light / Dark) — `apps/mobile/Patina/Patina/Services/Settings/AppearanceSetting.swift:13-38`, applied at `PatinaApp.swift:106`, surfaced at `SettingsView.swift:39, 61`.
- Capture has **zero** `preferredColorScheme` call sites and no appearance setting. It follows the OS only.

**VERDICT: ACCIDENTAL.** A field app used outdoors in bright sun is the *stronger* case for a manual light lock, not the weaker one.

---

## 4. Spacing, layout, safe area

**EVIDENCE.**

| | Patina | Capture |
|---|---|---|
| `ignoresSafeArea` | 61 | 36 |
| `safeAreaInset` | 19 | 8 |
| `safeAreaPadding` | 8 | **0** |
| `GeometryReader` | 10 | 5 |

**EVIDENCE.** Patina has a named page chrome: `.patinaScreen(title:style:)` + `.patinaTopBand()` (`apps/mobile/Patina/Patina/Design/Components/PatinaScreenChrome.swift:23-51`). Its header documents the drift it replaced: "17 pushed destinations hid the system nav bar and hand-rolled their own pinned `BackChevronButton` overlay (top: 8, leading: 18), 8 kept the system bar with no title … a couple did both at once" (`:6-10`).

**EVIDENCE.** Capture has no equivalent. Its nearest thing is `RecognitionSheetLayout` — `VStack(alignment: .leading, spacing: 18).padding(20)` (`RecognitionSupport.swift:207-214`) — scoped to the N-sheets only.

**EVIDENCE.** Patina's bottom bar geometry is specified: `PatinaTabBar.itemHeight = 49`, `barHeight = 83` (49 + 34 pt home indicator), 6 pt side padding, 54 pt trailing slot (`PatinaTabBar.swift:26-36, 60`). Capture's Companion dock is placed by `safeAreaInset(edge: .bottom, spacing: 0)` with no published height (`RootView.swift:58-60`).

**VERDICT: INTENTIONAL** that the layouts differ (one is a tabbed browse app, one is a camera app). **ACCIDENTAL** that Capture has no gutter constant at all.

---

## 5. Components

### 5.0 Shared-component adoption (the headline number)

**EVIDENCE.** Call-site counts (symbol references in app source; `Components/<Name>.swift` itself excluded):

| Shared component | Patina | Capture | Status |
|---|---|---|---|
| `PatinaButton` | 44 | 15 | adopted both sides |
| `PatinaEmptyState` | 18 | 4 | adopted both sides |
| `MonoLabel` | 88 | **0** | Patina-only |
| `PatinaAsyncImage` | 19 | **0** | Patina-only |
| `PatinaStamp` | 18 | **0** | Patina-only |
| `PatinaStatusBadge` | 11 | **0** | Patina-only |
| `StrataMarkView` | 9 | 1 | both (Companion mark) |
| `PatinaTextField` | 5 (2 call sites) | **0** | Patina-only |
| `FilterChip` | **1** | 0 | near-dead |
| `MatchPill` | **0** (tests only) | 0 | **DEAD** |
| `PatinaCard` | **0** | **0** | **DEAD** |
| `PatinaSheetHeader` | **0** | **0** | **DEAD** |
| `ClayBackground` | **0** | **0** | **DEAD** |

**4 of 13 shared components have zero call sites in either app** (`PatinaCard` 105 LOC, `PatinaSheetHeader` 98, `ClayBackground` 225, `MatchPill` 37 — 465 lines). **EVIDENCE**, verified with a repo-wide grep excluding `.build/` and the components' own files.

### 5.1 Buttons — five implementations, three shapes

| Impl | File:line | Shape | Height / padding | Fill | Label |
|---|---|---|---|---|---|
| `PatinaButton` `.primary`/`.clay` | `PatinaDesignKit/.../PatinaButton.swift:93-141` | **Capsule** | `height 52`, `.horizontal PatinaSpacing.lg (24)` | `Interactive.active` (`#2C2926` / `#F2EDE6`) | `Text.inverse` |
| `PatinaButton` `.secondary` | same | Capsule | same | `Background.primary` | `Text.primary`, 1.5 pt `Border.strong` |
| `PatinaButton` `.destructive` | same | Capsule | same | `errorDeep #9C4C3F` | `OnDark.primary` |
| `AuthButton` (DesignKit) | `PatinaButton.swift:180-201` | **RoundedRect 12** | `height 50` | `Interactive.active` or `Background.primary` | `Text.inverse`/`Text.primary` |
| `AuthFilledButtonStyle` (Patina) | `apps/mobile/Patina/Patina/Features/Authentication/Views/AuthenticationView.swift:435-447` | RoundedRect `PatinaRadius.lg` (12) | (caller-set) | `Interactive.active` | `Text.inverse`, `.opacity 0.4` when disabled |
| `FieldVerbConfirmButtonStyle` | `apps/mobile/Capture/CaptureKit/CaptureKit/Design/FieldVerbControls.swift:165-176` | **RoundedRect 12** | `h 22 / v 13` | **`verdigris` = clay `#C4A57B`** | `paper3` |
| `FieldVerbDeclineButtonStyle` | `.../FieldVerbControls.swift:148-160` | RoundedRect 12 outline | `h 22 / v 13` | clear, 1 pt `line2` | `inkSoft` |
| `RecognitionPrimaryButtonStyle` | `apps/mobile/Capture/Capture/Features/Recognition/RecognitionSupport.swift:181-190` | RoundedRect 12 | `v 14`, **no h padding** | `verdigris` | `paper3` |
| `RecognitionGhostButtonStyle` | `.../RecognitionSupport.swift:192-202` | RoundedRect 12 | `v 14` | `paper2` + 1 pt `line2` | `ink2` |
| `OnboardingFilledButtonStyle` | `apps/mobile/Capture/Capture/Features/Onboarding/OnboardingSupport.swift:54-70` | **RoundedRect 14 continuous** | `v 15` | `verdigris` (tintable) | `paper3` |
| `OnboardingGhostButtonStyle` | `.../OnboardingSupport.swift:74-83` | none (text) | `v 13` | — | `ink` @85 % |

**Three conflicts.** **EVIDENCE + INFERENCE:**

1. **Shape.** Patina's commitment button is a **capsule**; Capture's are **rounded rects at 12 or 14**. Both apps ship both idioms, because Capture also uses `PatinaButton` via `RouteActionButton` (`apps/mobile/Capture/Capture/Features/Route/RouteSessionUI.swift:45-58`) and directly in `QRApproveScreen.swift:366`, `SpecimenSheetScreen.swift:166-168`, `SiteScanSetupScreen.swift:284`, `SiteScanReviewUploadViews.swift:76-319`.
2. **Fill.** `PatinaButtonStyle.patinaFillColor` deliberately collapsed to **one** filled commitment style: "two primary treatments shipped at once — solid tan … and near-white on everything else … There is one filled commitment style now" (`PatinaButton.swift:24-29`). Capture's three local primaries all paint **solid clay**, which is the treatment that ruling removed. **ACCIDENTAL.**
3. **Label on clay in dark mode.** `RouteActionButton`'s doc-comment names the bug it fixed by delegating: "offWhite label on the clay/error fills, so it stays legible in dark mode where the old paper3 label went dark-on-clay" (`RouteSessionUI.swift:24-28`). `FieldVerbConfirmButtonStyle`, `RecognitionPrimaryButtonStyle`, and `OnboardingFilledButtonStyle` **still use `paper3` on clay** — `paper3` is `#2C2926` in dark. **INFERENCE: the same bug is live in three Capture button styles.**

Also **EVIDENCE**: Capture passes `style: .clay` (`RouteSessionUI.swift:53`, `QRApproveScreen.swift:366`), and `.clay` renders as `.primary` — charcoal — per `PatinaButton.swift:15, 31-33`. So a Capture screen using `RouteActionButton(kind: .primary)` gets a charcoal capsule while the card beside it gets a clay rounded rect.

### 5.2 Cards

| Impl | File:line | Radius | Padding | Fill | Border |
|---|---|---|---|---|---|
| `PatinaCard .surface` | `PatinaDesignKit/.../PatinaCard.swift:31-62` | `PatinaRadius.lg` = **12** | `PatinaSpacing.md` = 16 | `Background.secondary` | none |
| `PatinaCard .elevated` | same | 12 | 16 | `Background.primary` | none + `PatinaShadows.md` |
| `PatinaCard .outline` | same | 12 | 16 | clear | 1 pt `Border.hairline` |
| `RecognitionCard` | `apps/mobile/Capture/Capture/Features/Recognition/RecognitionSupport.swift:105-116` | **14** | 16 | `paper3` | 1 pt `line` |
| `RouteCardModifier` | `apps/mobile/Capture/Capture/Features/Route/RouteSessionUI.swift:127-137` | **14** | 16 | `paper` (or tint) | 1 pt `line` |
| `projectsCard()` | `apps/mobile/Capture/Capture/Features/Projects/ProjectsSupport.swift:139-144` | **14** | none | `paper3` | 1 pt `line` |
| `peopleCard()` | `apps/mobile/Capture/Capture/Features/People/PeopleSupport.swift:157-162` | **14** | none | `paper3` | 1 pt `line` |

**EVIDENCE.** `projectsCard()` and `peopleCard()` are **byte-identical** two-line implementations in two files. `ProjectsSupport.swift:135-137` states why: "kept local to Projects/ rather than depending on another flow's directory".

**EVIDENCE.** Patina bypasses `PatinaCard` too — 16 bespoke card views: `RoomHeroCard`, `DailyStoryCard`, `HouseRecordCard`, `TodayNextMoveCard`, `InvoiceRowCard`, `ProductCard`, `BrowseCardInfo`, `RoomGalleryCard`, `OrderCard`, `ProposalRowCard`, `BudgetSummaryCard`, `BudgetProposalCard`, `FirstLaunchTourPopoverCard`, `RoomCardHeroImage`, `HouseCardWidth`, `StudioHubView`'s inline card at radius 16 (`StudioHubView.swift:148`).

**VERDICT: ACCIDENTAL.** `PatinaCard` is a shared component nobody calls; both apps re-derive it at a radius the token set does not contain.

### 5.3 Chips / pills / badges

| Impl | File:line | Shape | Padding | Fill / stroke | Type |
|---|---|---|---|---|---|
| `FilterChip` (shared) | `PatinaDesignKit/.../FilterChip.swift:22-35` | Capsule | h14 / v6 | active `Interactive.active`, else `Background.secondary` | `caption` = Inter-Medium 12 |
| `PatinaStatusBadge` | `.../PatinaStatusBadge.swift:65-79` | Capsule | h`sm`8 / v`xxs`4 | state tint @ **14 %** | `captionMedium` = Inter-SemiBold 12, uppercase, tracking 0.5 |
| `MatchPill` (shared, **dead**) | `.../MatchPill.swift:17-30` | RoundedRect 6 | h8 / v3 | `.regularMaterial` + `Background.primary` @92 % | `monoLabel` DMMono 10 |
| `TierPill` (Patina-local) | `apps/mobile/Patina/Patina/Design/Components/TierPill.swift:22-33` | **RoundedRect 6** | h`sm`8 / v3 | `Interactive.active` (solid) | `monoLabel` DMMono 10 |
| `ProjectTintChip` (Capture) | `apps/mobile/Capture/Capture/Features/Projects/ProjectsSupport.swift:88-101` | Capsule | h8 / v3 | tint @ **12 %** | `eyebrow` = DM Mono 11 |
| `RouteStatusChip` (Capture) | `apps/mobile/Capture/Capture/Features/Route/RouteSessionUI.swift:164-178` | Capsule **stroke** @45 % | h7 / v3 | no fill | `eyebrow` DM Mono 11 |
| `ProvenanceBadge` (Capture) | `apps/mobile/Capture/CaptureKit/CaptureKit/Design/ProvenanceBadge.swift:13-26` | **RoundedRect 3** stroke @50 %, dashed `[3,2]` for `.smartGuess` | h6 / v2 | no fill | `eyebrow` DM Mono 11 |
| `FieldAffirmationChip` (Capture) | `apps/mobile/Capture/Capture/Features/Capture/FieldAffirmationChip.swift:19-31` | Capsule | h14 / v10 | **solid `goldenHour`** | `footnote` Inter 13 |
| `ViewfinderVisitChip` / `ViewfinderNightChip` / `ViewfinderTorchPill` | `apps/mobile/Capture/Capture/Features/Capture/ViewfinderControls.swift:38, 107, 121` | — | — | — | — |
| `RouteChipLabel` / `FlowChips` | `apps/mobile/Capture/Capture/Features/Route/V0VisitSheet.swift:386, 403` | — | — | — | — |

**INFERENCE.** Four different "tinted status pill" recipes across the two apps (14 % Capsule / 12 % Capsule / 45 % Capsule stroke / 50 % RoundedRect-3 stroke), plus one solid-fill chip, plus a solid-fill `TierPill`. The wash percentage, the shape, and the label face all differ. **ACCIDENTAL** for the status family; **INTENTIONAL** for `ProvenanceBadge` (its dashed variant encodes "guess", which is a real Field-only semantic — `ProvenanceBadge.swift:23`).

### 5.4 Empty / error / loading states

| Role | Patina | Capture |
|---|---|---|
| Empty | `PatinaEmptyState` (shared) — icon 40 pt light, `h4` title, `bodySmall` message, `.secondary` CTA (`PatinaEmptyState.swift:64-92`); 18 refs | `PatinaEmptyState` (shared), **4 refs**: `V0VisitSheet.swift:42`, `ProjectListScreen.swift:197`, `LogTimeSheet.swift:60`, `V1SessionTrayScreen.swift:358` |
| Error | `PatinaErrorState` (Patina-local) — `exclamationmark.triangle` at `.system(size: 28)`, `Text.muted`; retry label **"Let's try that again"** (`apps/mobile/Patina/Patina/Design/Components/PatinaErrorState.swift:14-37`) | **two** locals: `ProjectsErrorState` — "Couldn't load this" / **"Retry"** (`ProjectsSupport.swift:108-133`); `PeopleErrorState` — **"Couldn't reach the studio"** / **"Try again"** (`ProjectRosterScreen.swift:371-392`) |
| Loading | `PatinaLoadingState` (Patina-local) — `ProgressView().tint(Text.interactive)` + `bodySmall` label, default **"One moment…"** (`.../PatinaLoadingState.swift:11-24`) | none — 30 bare `ProgressView` call sites, **zero** with a label string |

**EVIDENCE.** The two Capture error states differ in glyph (one has an icon, one doesn't), headline, retry verb, and tap target (`PeopleErrorState` adds `.frame(minHeight: 44)`; `ProjectsErrorState` does not). Capture also ships both `"No messages yet."` and `"No messages yet"` (period/no period).

**VERDICT: ACCIDENTAL** on every axis. Three retry verbs across two apps ("Let's try that again" / "Retry" / "Try again") for one act.

### 5.5 Sheets & headers

| Impl | File:line | Layout |
|---|---|---|
| `PatinaSheetHeader` (shared, **dead**) | `PatinaDesignKit/.../PatinaSheetHeader.swift:43-63` | HStack `.firstTextBaseline`, 44 pt icon buttons, `patinaEyebrow()` + `h4` title, `.horizontal lg (24)` / `.vertical md (16)` |
| `RouteSheetHeader` (Capture) | `apps/mobile/Capture/Capture/Features/Route/RouteSessionUI.swift:63-101` | VStack spacing 6, eyebrow `CaptureType.eyebrow` uppercase + `title` (Playfair 24) + optional subtitle `callout`; close `xmark` with **`.padding(6)`** — a ~26 pt tap target |
| `RecognitionHeader` (Capture) | `apps/mobile/Capture/Capture/Features/Recognition/RecognitionSupport.swift:35` | separate again |

**EVIDENCE.** `PatinaSheetHeader` gives its actions `.frame(width: 44, height: 44)` (`:72`). `RouteSheetHeader`'s close button has `.padding(6)` around a `CaptureType.body` glyph (`RouteSessionUI.swift:87-89`) — below the 44 pt HIG floor that `AccessibleHitTarget.swift:15` names.

### 5.6 Text fields

| Impl | File:line | Chrome |
|---|---|---|
| `PatinaTextField` (shared) | `PatinaDesignKit/.../PatinaTextField.swift:74-119` | **filled box**: `Background.secondary`, radius `PatinaRadius.lg` (12), 1 pt `Border.strong` → 1.5 pt `error` on error, focus ring `Text.interactive` @50 %; label `caption`, helper/error `caption` in `Text.error`; `.animation(.easeInOut(0.15))` on focus and error. 2 call sites. |
| `AuthTextField` (Patina-local) | `apps/mobile/Patina/Patina/Features/Authentication/Views/AuthenticationView.swift:456+` | compact icon-prefixed row; header says it is "retained" after a name collision with the design-system component (`:449-454`) |
| `SpecimenFieldRow` (Capture) | `apps/mobile/Capture/CaptureKit/CaptureKit/Design/SpecimenFieldRow.swift:23-44` | **underlined slot**: eyebrow label + `ProvenanceBadge`, bare `TextField`, 1 pt bottom `Rectangle` rule, `.padding(.vertical, 8)`. **No focus state, no error state, no helper.** |
| `RouteFieldShell` (Capture) | `apps/mobile/Capture/Capture/Features/Route/RouteSessionUI.swift:106-123` | same underline idiom, `.padding(.vertical, 10)` |

**VERDICT: INTENTIONAL** that Field uses an underlined slot (dense, one-handed, glanceable provenance). **ACCIDENTAL** that it has no error or focus affordance at all, and that Patina's own richer field has 2 call sites while a third local variant carries the auth screens.

---

## 6. Navigation conventions

| | Patina | Patina Field |
|---|---|---|
| Shell | **Hand-rolled 4-item bar**, not `TabView` — "the fifth slot holds the Companion's Strata mark, which is not a tab, a cost B-1 names and accepts" (`PatinaTabBar.swift:7-8`) | **Two peer realms** (`camera` / `work`) with independent `NavigationStack`s (`FieldRealmHistory.swift:4-12`, `RootView.swift:295-302`) |
| Destinations | `today · spaces · pieces · studio` (`PatinaTab.swift:17-20`) | `CaptureRoute`: 24 cases incl. `viewfinder, session, specimen, work, projectList, leadList, decisionList, inbox, receiving, qrScan, siteScan, people, visitReview` (`CaptureNavigation.swift`) |
| Bar drawing | **No icons.** Four words in `uiSmall` (Inter-Medium 13) + Strata mark (`PatinaTabBar.swift:17-18, 86-87`) | No bar. Realm switch is a control inside the shell |
| "Home" | `today` tab, label "Today", VoiceOver "Today" (`PatinaTab.swift:26-43`) | `.today` via `FieldLaunchPolicy.todayIsHome = true` (`FieldLaunchPolicy.swift:35`), reachable back to camera-first with a one-character edit (`:27-31`) |
| System nav bar | **hidden** — 17 × `.toolbar(.hidden, for: .navigationBar)`; only **5** `navigationTitle` | **used** — 23 distinct `navigationTitle`, 22 × `.inline` + 8 × `.large` |
| Back affordance | custom pinned `BackChevronButton` via `.patinaScreen(…)` (`PatinaScreenChrome.swift:47-51`) + `.interactivePopGestureEnabled()` | system Back chevron |
| Sheets | `.presentationDetents`: `[.medium,.large]` ×7, `[.medium]` ×4, `[.large]` ×4, `[.height(320)]` ×1 | `[.medium,.large]` ×4, `[.large]` ×4 |
| Sheet routing | `coordinator.presentedSheet` enum | `RouteRegistry.shared.view(for: sheet)` + `$coord.sheet` (`RootView.swift:61-63`) |
| Full-screen | — | `.fullScreenCover` for onboarding (`RootView.swift:64-69`) |
| Orientation | portrait-only, **status bar hidden app-wide** (`INFOPLIST_KEY_UIStatusBarHidden = YES`) | portrait-only, `UIRequiresFullScreen = YES`, status bar visible |

**EVIDENCE.** Both call home **"Today"** — `PatinaTab.title == "Today"` and `WorkDashboardScreen.swift:117` `.navigationTitle("Today")`. **INTENTIONAL and correct alignment.**

**VERDICT.** The shells are **INTENTIONAL** (a browse app vs a camera app). The chrome idiom is **ACCIDENTAL**: Patina hides the system bar and hand-rolls chevrons and titles on 17 screens while Capture uses the stock bar on 23 — so the same designer moving between the two apps meets two different back-button positions, two different title typefaces (Patina's `h4` Playfair vs the system's SF), and two different casing rules (§7.4).

---

## 7. Terminology — the glossary diff

This is the largest and most actionable divergence.

### 7.1 The enforced lexicon (client side only)

**EVIDENCE.** `apps/mobile/Patina/PatinaTests/NounConsistencyTests.swift:5-8`:

> "the consumer lexicon is fixed: **Piece · Room · Studio · Companion · Record.** Assert zero user-facing occurrences of 'Product', 'Item', 'Your profile', 'Portal', 'Daily Room', 'UNKNOWN MAKER'"

**EVIDENCE.** That is a real, per-site test net — e.g. `#expect(source.contains("\"See the piece\""))` (`:40`), `#expect(!collections.contains("\"No saved items yet\""))` (`:62`), `#expect(AppRoute.crossRoom.displayName == "All pieces")` (`:57`). Patina also has `SentenceCaseTests`, `ApprovalVocabularySweepTests`, `ApprovalVocabularyOnTheRecordTests`, `MoneyAndStudioCopyTests`, `RoomTypedCopyTests`, `ErrorVoiceTests`.

**EVIDENCE.** `apps/mobile/Capture/CaptureTests/` (51 files) contains **no** noun-consistency, sentence-case, or copy-voice test. The nearest is `FieldVerbCopyTests.swift`, scoped to one menu.

### 7.2 Same thing, different name

| Real-world thing | Patina (client) | Patina Field | designer-portal (web) | client-portal (web) |
|---|---|---|---|---|
| A furnishing | **piece** — `"All pieces"`, `"Browse pieces"`, `"No saved pieces yet"`, `"See the piece"`, `"Ask about this piece"`; `Product`/`Item` banned in copy (`NounConsistencyTests.swift:5-8`) | **specimen** — `navigationTitle("Specimen")`, `"Add to specimen"`, `"Review this specimen"`, `"That specimen is no longer here."`, `"hold for a multi-shot specimen"`; also **capture** — `"\(venue) · \(specimens.count) CAPTURES"` | **line** / **piece** (`"a line"` 143, `"the line"` 157, `piece` 802, `spec book` 51 — file-text counts) | **piece** (206 file-text hits) |
| Source counts (identifier + string) | `piece` 370, `specimen` **0** | `specimen` **1 017**, `piece` **7** | — | — |
| The physical place | **house** / **room** / **space** — `"This is Today — what moved in your house"`, `"Your Spaces"`, `"Your rooms"`, `HouseRecordCard`, `house-widget`; `house` 122, `room` 1 574, `site` 42 | **site** / **venue** / **room** — `navigationTitle("Site scan")`, `"Site access"`, `"Met on site"`, `venue.placemarkName`; `site` 208, `visit` 432, `house` **20** (all `Schoolhouse`/`household`/internal) | `room` / `rooms` route group | `house` (608 file-text hits) |
| The engagement | **project** (428) | **project** (450) | `/doc/[id]` — **"the document"**, **"the paper"** | `projects` |
| The designer's org | **Studio** — but see §7.3 | **studio** — `"Couldn't reach the studio"`, `"Sync captures to your studio's Patina library."`, `"This account isn't part of a studio yet."`; ALSO **workspace** in the auth layer: `WorkspaceAuthorizing`, `OnboardingWorkspace`, `ConnectWorkspaceScreen`, `"No workspace found for your account — ask your studio admin."` | `StudioDrawer`, studio | — |
| The end customer | **client** (597) and **homeowner** (115); homeowner is not user-facing in Patina's own copy (ASSUMPTION — no `Text("…homeowner…")` hits) | **client** (355) — `"Not yet viewed by client"`, `"Nothing waiting on clients."`; **homeowner** 13 (wire types only) | `/clients` | — |
| The vendor | **maker** (81) — `"\(product.name) by \(product.makerName)"`, `"UNKNOWN MAKER"` banned | **maker** (58) — `"\(maker.uppercased()) · …"`; also **vendor** 22 | `catalog/vendors` | — |
| The landing screen | **Today** | **Today** | **The Desk** (`app/(document)/layout.tsx:31` `title: 'The Desk · Patina'`) | — |
| The decision object | **Decision** | **Decision** | **ceremony** / **decision** | `decisions` |
| The money doc | **Proposal** (290), **Invoice** (319) | **none** — `proposal` 4, `invoice` **0** | `drafting`, `accounts` | `proposals`, `invoices` |
| Team roster | `"Your Studio"` hub | **"Call sheet"** (`navigationTitle("Call sheet")`) | **"Call sheet"** (`mobile-bar.tsx:164`) | — |

### 7.3 The "Studio" homonym

**EVIDENCE.** In Patina, **"Your Studio"** is the *client's own* fourth tab — the place her projects, decisions, proposals, invoices and files live: `PatinaTab.studio.canonicalName == "Your Studio"` (`PatinaTab.swift:42`), `"Your Studio begins with a project."` / `"Sign in to see conversations, decisions, proposals, invoices, and shared files."` (`StudioHubView.swift:153-158`), `Coordinator.swift:149`.

**EVIDENCE.** In the *same app*, **"Studio"** also means the design firm: `.accessibilityLabel("Studio: \(identity.name)")` (`StudioIdentityLine.swift:33`), `StudioIdentityService`, `rpc("resolve_studio_identity")`.

**EVIDENCE.** In Capture and in the designer portal, **"studio"** means only the design firm.

**INFERENCE. ACCIDENTAL, and the highest-cost item in this section.** One word names two different things one screen apart in the client app, and a third meaning ("workspace", `ConnectWorkspaceScreen.swift:18-51`) in the field app's auth layer. A homeowner reading "Your Studio" next to "Studio: Walbridge Studio" has no way to tell which is hers.

### 7.4 Casing

**EVIDENCE.** Capture's 23 `navigationTitle`s are **sentence case** without exception: `"Site scan"`, `"Visit review"`, `"Review scan"`, `"Upload scan"`, `"Sign-in request"`, `"Met on site"`, `"Call sheet"`, `"Scan to sign in"`.

**EVIDENCE.** Patina's 5 are mixed: `"Account"`, `"Help"`, `"Note"` but `"Pick Hero Photo"` and `"Reorder Photos"` — Title Case. Patina's `SentenceCaseTests` is pinning sentence case per-site elsewhere ("Settings' rows are sentence case", `:23`; "the auth sheet's buttons are sentence case", `:47`), which means Patina is **mid-migration** while Capture is already there. **ACCIDENTAL, and the fix direction is already decided.**

### 7.5 Voice, in permission strings (the one copy surface both ship)

**EVIDENCE.** Patina (`Patina.xcodeproj/project.pbxproj`): first-person brand, warm — *"Patina uses your camera to **walk through your space together** and visualize furniture in your room."*, *"**Have a voice conversation with Patina** about your space and style."*, *"**Speak naturally with Patina** instead of typing."*

**EVIDENCE.** Capture (`Capture.xcodeproj/project.pbxproj`): second-person, instrumental — *"Patina Field uses the camera to photograph products and read their labels, barcodes, and dimensions."*, *"**Stamps each capture with the venue where you found it.**"*, *"Shows a level guide for square, steady captures."*

**VERDICT: INTENTIONAL.** Different readers, different register. But note the leak: Capture's mic string says *"a quick voice note about **a piece**"* while its UI says *specimen* — **ACCIDENTAL** inconsistency inside Capture.

### 7.6 The approval grammar Capture does not speak

**EVIDENCE.** `PatinaStamp` is a twelve-state, four-dial mark explicitly built for cross-surface parity: "the iOS port of the portals' `GateStamp` grammar, so a homeowner meets the same mark in her inbox, on the web and on her phone" (`PatinaStamp.swift:5-6`). Its rules are load-bearing: no fill, no shadow, SIGNED is `mocha` never `sage`, `terracotta` appears exactly once so "no traffic-light reading is available anywhere in the table" (`:18-22`). 18 refs in Patina; **0 in Capture**.

**EVIDENCE.** Capture's decision list renders state as `"PENDING · \(count)"`, `"Seen by client"`, `"Not yet seen"` with SF symbols `checkmark.circle.fill` and `checkmark.seal` (`apps/mobile/Capture/Capture/Features/Decisions/DecisionListScreen.swift`).

**INFERENCE. ACCIDENTAL, and it contradicts a shipped ruling.** `PatinaEmptyState.swift:30-33` records that `P-17` **refuses a glyph that carries a state** on approval surfaces — "the empty decision list said 'nothing waiting on you' under a check mark, which is a check mark used as status." Capture's decision list does exactly that, on the designer's side of the same decision object.

---

## 8. Forms & controls

**EVIDENCE.**

| | Patina | Capture |
|---|---|---|
| `@FocusState` | 3 | 2 |
| `.submitLabel` | 2 | 3 |
| `.onSubmit` | 2 | **0** |
| `.scrollDismissesKeyboard` | 2 | 3 |
| `.keyboardType` | 13 | 5 |
| `.textContentType` | 5 | 2 |
| `.textInputAutocapitalization` | 3 | 7 |
| `.autocorrectionDisabled` | 4 | 5 |
| `ToolbarItemGroup(placement: .keyboard)` | 3 | **0** |
| explicit keyboard dismissal (`hideKeyboard`/`resignFirstResponder`) | 4 | **0** |

**INFERENCE.** Neither app has a forms system. Patina has a **Done-bar** convention (3 keyboard toolbars) that Capture lacks entirely; Capture relies on `.scrollDismissesKeyboard` alone. Validation display exists only in `PatinaTextField` (error string + 1.5 pt `error` stroke + `Text.error` caption, `PatinaTextField.swift:67-72, 108-112`) and it has **2 call sites**. Capture's `SpecimenFieldRow` and `RouteFieldShell` have no error path. **ACCIDENTAL.**

---

## 9. Feedback — haptics, toasts, loading

### 9.1 Haptics

**EVIDENCE.** `HapticManager` (`PatinaDesignKit/Sources/PatinaDesignKit/Support/HapticManager.swift`) is a shared singleton with 7 prepared generators and 4 named brand patterns: `thresholdCrossed()` = `.medium @0.7`, `companionPulse()` = `.soft @0.5`, `itemPlaced()` = `.rigid @0.6`, `emergenceReveal()` = `.success` (`:75-92`).

**EVIDENCE.** Adoption:

| | Patina | Capture |
|---|---|---|
| `HapticManager.shared.*` | **56** (`notification` 25, `impact` 21, `companionPulse` 6, `thresholdCrossed` 4) | **0** |
| raw `UIImpactFeedbackGenerator` | — | 3 (`.light` ×2, `.medium` ×1) |
| raw `UINotificationFeedbackGenerator` | — | 1 |
| `.sensoryFeedback(…)` | 0 | 2 (`.success`, `.impact`) |

**VERDICT: ACCIDENTAL.** The shared haptic vocabulary is used by exactly one of the two apps. Capture uses three different mechanisms (raw UIKit generators, SwiftUI `.sensoryFeedback`, nothing) across 11 sites.

### 9.2 Toasts / banners

**EVIDENCE.**

| Impl | File | Shape |
|---|---|---|
| `AddedToRoomToast` (Patina) | `Features/Home/Views/AddedToRoomToast.swift:37-48` | RoundedRect **16** continuous, `Background.dark`, `charcoal @25 %` shadow r16 y8, h18/v10, `caption` label in `offWhite` |
| `EdgeToastView` (Patina) | `Features/RoomScan/Shared/Components/EdgeToastView.swift:46+` | 32 pt circled icon in `warning @20 %`, `h6` title + body, spacing 14 |
| `DesignRequestResumeBanner` (Patina) | `Features/DesignServices/DesignRequestResumeBanner.swift` | — |
| `OfflineQueueBanner` (Capture) | `Features/Resilience/OfflineQueueBanner.swift:61-69` | RoundedRect **12**, `ink @78 %` fill (flips!), `terracotta @45 %` 1 pt stroke, h14/v10, `monoBody` DM Mono 14 |
| `PortalLoginToast` (Capture) | `App/DeepLinking/PortalLoginController.swift:32-38` | `{success, info, error}` model struct |

**INFERENCE.** Five toast/banner shapes, no shared one, three corner radii (12/16/32-circle), and Capture's banner **inverts** in dark mode because both its fill (`ink @78 %`) and its label (`paper3`) flip together — light text on a dark banner becomes dark text on a near-white banner. **ACCIDENTAL.**

### 9.3 Loading

**EVIDENCE.** `ProgressView` 32 (Patina) / 30 (Capture). Patina routes 3 of them through `PatinaLoadingState` with copy (`"One moment…"`, `"Finding pieces for you…"`, `"Loading this piece…"`, `"Loading today's story…"`). Capture has **zero** `ProgressView("…")` with a label. `.redacted(reason:)` — Patina 0, Capture 1. Neither has a skeleton system.

---

## 10. Accessibility

**EVIDENCE.** Absolute counts, and density per Swift file (Patina 479 files, Capture 272):

| Modifier | Patina | /file | Capture | /file |
|---|---|---|---|---|
| `accessibilityLabel` | 163 | 0.34 | 99 | 0.36 |
| `accessibilityHint` | 54 | 0.11 | 22 | 0.08 |
| `accessibilityValue` | 17 | 0.035 | 9 | 0.033 |
| `accessibilityIdentifier` | 269 | 0.56 | 157 | 0.58 |
| `accessibilityAddTraits` | 31 | 0.065 | 12 | 0.044 |
| `accessibilityElement` | 79 | 0.165 | 37 | 0.136 |
| `accessibilityHidden` | 60 | 0.125 | 31 | 0.114 |
| `accessibilityReduceMotion` | 29 | 0.061 | 9 | 0.033 |
| `dynamicTypeSize` | 71 | **0.148** | 23 | **0.085** |
| `minimumScaleFactor` | 31 | 0.065 | **0** | **0** |
| `accessibilitySortPriority` | 2 | — | 0 | — |
| 44 pt tap-target frames | 86 | 0.18 | 52 | 0.19 |

**INFERENCE.** Per-file coverage is **comparable** on labels, identifiers, and tap targets. Capture is behind on: Dynamic Type guarding (0.085 vs 0.148 per file), Reduce Motion (0.033 vs 0.061), and `minimumScaleFactor` (zero — no truncation guard anywhere).

**EVIDENCE.** Only Patina has infrastructure: `AccessibleHitTarget.swift` (44 pt + labelled button element, 6 call sites), `PatinaTabBar`'s explicit `.isTabBar` / `.isSelected` traits and the "VoiceOver speaks the canonical name in full" ruling (`PatinaTabBar.swift:107-110`), the `.dynamicTypeSize(...DynamicTypeSize.accessibility2)` cap on tab words with the reason written down (`:93-100`), and a `PatinaTests/ContrastTests.swift` + `TapTargetTests.swift` + `DynamicTokenTests.swift` + `TypographyAdoptionTests.swift` + `BorderTokenAdoptionTests.swift` suite. Capture has none of these.

**INFERENCE.** Both apps are portrait-only and Patina hides the status bar globally (`INFOPLIST_KEY_UIStatusBarHidden = YES`). **ASSUMPTION:** I did not audit whether hiding the status bar app-wide interacts badly with VoiceOver status announcements.

---

## 11. Cross-app handoffs

### 11.1 What exists

**EVIDENCE.**

| Seam | Patina | Patina Field |
|---|---|---|
| Custom URL scheme | `patina://` (`Patina/Patina/Info.plist:19-22`) | `field://` (`Capture/Capture/Info.plist:24-27`) |
| Associated domain | `applinks:client.patina.cloud` (`Patina.entitlements`) | `applinks:client.patina.cloud` (`Capture.entitlements`) |
| AASA paths claimed | `/piece/*`, `/invoices/*`, `/proposals/*`, `/decisions/*` (`apps/client-portal/src/app/.well-known/apple-app-site-association/route.ts:37-38`) | `/field/sr_*` only (`:11-19`) |
| App Group | `group.cloud.patina.app` | `group.cloud.patina.field` |
| Push (APNs) | **yes** — `aps-environment` in entitlements, `UNUserNotificationCenter` delegate (`Patina/App/AppDelegate.swift:47, 174-205`), `.from("device_push_tokens")` | **none** — no `aps-environment` key, **zero** `UNUserNotificationCenter` / `registerForRemoteNotifications` hits |
| Widget | `PatinaWidget` (`HouseWidget.swift`, `HouseWidgetProvider.swift`, `HouseWidgetViews.swift`, own entitlements + `PrivacyInfo.xcprivacy`) | `CaptureWidgets/` directory exists and is **empty** |
| Share extension | none | `CaptureShareExtension/` directory exists and is **empty** |
| Live Activity | none | `CaptureLiveActivityController.swift` + `CaptureSyncAttributes.swift` |
| QR handoff | web → app: `patina://auth` + `QRAuthService.handleDeepLink` → `.qr` sheet (`DeepLinkHandler.swift:224-240`) | web → app: `field://login?v=1&th=<hash>` → `PortalLoginController` with same/different-account confirm (`PortalLoginController.swift:4-16`); in-app scanner Q1 forwards defensively |
| Deep-link queue | `PendingLinkQueue` — on-disk FIFO, 15-min life, cleared on sign-out (`DeepLinkHandler.swift:21-24, 66-68`) | none — `CaptureDeepLink` drops unresolvable URLs (`CaptureDeepLink.swift:30, 35`) |
| Verification harness deep links | `-CaptureScreen` equivalent not present | `field://screen/<CaptureScreenID>` drives all ~40 screens (`CaptureDeepLink.swift:42-49`) |
| Trade/guest handoff | — | `https://client.patina.cloud/field/<sr_token>` → `enterGuestRequest` (`CaptureDeepLink.swift:25-32`); minted by `rpc("create_field_link")` |

**EVIDENCE.** Shared Supabase surface (tables both apps read/write): `profiles`, `rooms`, `room_scans`, `room_scan_images`, `user_roles`; shared RPC `mark_scan_upload_complete`.

**EVIDENCE.** Split-but-paired surface — the decision loop spans both apps with **no shared table access**: Patina calls `rpc("client_pick")` and reads `decision_comments` / `decision_snoozes`; Capture reads `client_decisions` / `client_decision_options`.

### 11.2 What is missing but implied

**INFERENCE**, each grounded in a cited absence:

1. **Patina Field has no push at all.** No `aps-environment`, no notification centre delegate. The designer who is the *subject* of every "waiting on you" state in the system cannot be told about one. Patina — the client, who is explicitly not supposed to be engagement-optimised — is the app that has push. `CLAUDE.md`'s vision note ("the homeowner is engaged daily", "never optimize the studio surface for engagement") argues for exactly this split — but "no push" and "no alerts of any kind" are different things, and there is no local-notification path either (`grep UNUserNotificationCenter` in Capture → 0).
2. **`CaptureWidgets/` and `CaptureShareExtension/` are empty directories** with no references in `Capture/scripts/generate_project.rb`. A scan/capture app with a share extension stub and no share extension means "import from Photos" (`PhotoImportSheet`, `ResilienceScreens.swift:39`) is the only ingest path.
3. **No app-to-app handoff between Patina and Patina Field.** Separate App Groups, separate keychains, no `field://` in Patina's scheme table and no `patina://` in Capture's. **ASSUMPTION** that this is intentional (different humans) — but a designer who is *also* a Patina client on the same device has no bridge.
4. **AASA asymmetry.** Patina claims 4 path families; Capture claims 1 (`/field/sr_*`). A designer tapping an emailed `client.patina.cloud/decisions/<id>` link on a phone with Patina Field installed lands on the **web**, while the same link on a client's phone opens the app. The designer's own decision surface exists in Capture (`CaptureRoute.decisionDetail`) and is unreachable by link.
5. **Capture has no held-link queue.** `CaptureDeepLink.handle` returns early when the URL does not resolve (`:30, 35`) — a `field://` arrival during a cold, signed-out start is lost. Patina solved this with `PendingLinkQueue` and documents three separate findings it closed (`DeepLinkHandler.swift:22-23` — `C2-02`, `C2-21`, `GAP7B-09`).
6. **`room_scans` is the one true shared table and the two apps render it with different vocabulary.** Patina: `"Scan Your First Room"`, `"Re-Scan This Room"`, `"This room isn't on this phone"`. Capture: `navigationTitle("Site scan")`, `"Review scan"`, `"Upload scan"`, `"Scan a room on site and attach it to a project."` Same rows, two names for the act.

---

## 12. Verdict table — every difference classified

| # | Difference | Verdict | Justification |
|---|---|---|---|
| 1 | Two-realm camera shell vs 4-word tab bar | **INTENTIONAL** | Camera-first vs browse-first is the product difference. `FieldLaunchPolicy.swift:27-31` documents the trade and keeps the reversal one character away. |
| 2 | Field's underlined field slot vs client's filled box | **INTENTIONAL** | Dense one-handed entry with inline provenance (`SpecimenFieldRow.swift:23-44`) is a field affordance. |
| 3 | `ProvenanceBadge`'s dashed stroke for `.smartGuess` | **INTENTIONAL** | Encodes confidence, a Field-only semantic (`ProvenanceBadge.swift:23`). |
| 4 | Permission-string register (warm first-person vs instrumental second-person) | **INTENTIONAL** | Different readers. |
| 5 | Field has no proposals/invoices; client has no scan routing | **INTENTIONAL** | Domain split. |
| 6 | Both call home "Today" | **INTENTIONAL (good)** | The one deliberate cross-app alignment. |
| 7 | Deployment target **26.0** vs **18.0** | **ACCIDENTAL** | 8 major versions apart; `PatinaDesignKit/Package.swift:26-28` still says the floor is 17.6 "because the Patina app target's `IPHONEOS_DEPLOYMENT_TARGET` is 17.6" — the comment is stale against `Patina.xcodeproj` (`IPHONEOS_DEPLOYMENT_TARGET = 26.0`). |
| 8 | `PatinaSpacing`/`PatinaRadius` used 297× in Patina, **0×** in Capture | **ACCIDENTAL** | No stated rationale anywhere; Capture's own lint ratchet covers colour and font but not geometry (`Capture/.swiftlint.yml:16-30`). |
| 9 | Capture's card radius 14 (off-grid) vs `PatinaRadius.lg` 12 | **ACCIDENTAL** | 14 is not in the scale. 4 Capture card chromes all use it. |
| 10 | `projectsCard()` ≡ `peopleCard()` byte-for-byte | **ACCIDENTAL** | `ProjectsSupport.swift:135-137` names the reason as directory hygiene, not design. |
| 11 | `PatinaCard`, `PatinaSheetHeader`, `ClayBackground`, `MatchPill` — 465 LOC, zero call sites | **ACCIDENTAL** | Shared components nobody adopted; both apps re-derived them. |
| 12 | Capture font names are **family** strings, Patina's are **PostScript** | **ACCIDENTAL** | `CaptureType.swift:17-19` vs the TTF name table (§2.1). Capture cannot reach Playfair Medium or Inter SemiBold. |
| 13 | `eyebrow` means Inter-SemiBold 12 in one app and DM Mono 11 in the other | **ACCIDENTAL** | Same token name, different face and size (`PatinaTypography.swift:128` vs `CaptureType.swift:33`). |
| 14 | `monoSmall` = 9 pt vs 12 pt | **ACCIDENTAL** | Same name, 33 % size difference. |
| 15 | Capture has no italic voice face | **ACCIDENTAL** | `patinaVoice*`/`voiceLead`/`voiceSmall`/`voiceCaption` have no Capture counterpart; the brand's speaking register is client-app-only. |
| 16 | `PatinaCompanionMotion` used by Capture, ignored by Patina, which keeps an identical private copy | **ACCIDENTAL** | The file says "shared by Patina and Patina Field" (`:9`) and Patina has 0 references. |
| 17 | `HapticManager` used 56× in Patina, **0×** in Capture | **ACCIDENTAL** | Capture uses 3 unrelated mechanisms across 11 sites. |
| 18 | Three commitment-button shapes (capsule / rr-12 / rr-14) and two fills (charcoal / clay) | **ACCIDENTAL** | `PatinaButton.swift:24-29` records the ruling that collapsed this to one; Capture's three local styles predate and contradict it. |
| 19 | `paper3` label on clay fill in 3 Capture button styles | **ACCIDENTAL (live defect)** | `RouteSessionUI.swift:24-28` names this exact bug as fixed in one place only. |
| 20 | `goldenHour` and `warning` used as solid fills under flipping ink | **ACCIDENTAL (live defect)** | Computed 1.39:1 and 1.93:1 in dark (§1.3). |
| 21 | Patina has an Appearance picker; Capture has none | **ACCIDENTAL** | A sunlit field app is the stronger case for a manual light lock. |
| 22 | Three retry verbs: "Let's try that again" / "Retry" / "Try again" | **ACCIDENTAL** | Two of the three are in the same app, in files 2 directories apart. |
| 23 | Patina 129 `.system(size:)` and 46 raw system colours vs Capture 8 and 2 | **ACCIDENTAL** | Patina's `.swiftlint.yml` has no raw-hex or system-colour rule; Capture's does. The stricter lint is on the weaker-token app. |
| 24 | Capture has **zero** `minimumScaleFactor` | **ACCIDENTAL** | No truncation guard anywhere at accessibility text sizes. |
| 25 | Capture Dynamic-Type / Reduce-Motion density ≈ 57 %/54 % of Patina's | **ACCIDENTAL** | No rationale; Capture uses the same SwiftUI APIs where it does use them. |
| 26 | Capture has no design-system test net (no noun/case/contrast/tap-target suites) | **ACCIDENTAL** | Patina has 7 such suites; Capture has 0 of the equivalents in 51 test files. |
| 27 | **"piece" vs "specimen"** for the same object | **ACCIDENTAL** | Patina's lexicon is test-enforced (`NounConsistencyTests.swift:5-8`) and Capture is outside it. Capture's own mic permission string says "a piece". |
| 28 | **"house/space/room" vs "site/venue/room"** for the same place | **ACCIDENTAL** | Client portal says "house"; Field says "site". Both point at the same `rooms` / `room_scans` rows. |
| 29 | **"Your Studio" (the client's tab) vs "Studio" (the design firm) vs "Workspace" (Field auth)** | **ACCIDENTAL — highest cost** | Three meanings, one word, and two of them inside the same app one screen apart (§7.3). |
| 30 | Title Case in Patina's nav titles vs sentence case everywhere in Capture | **ACCIDENTAL** | Patina is mid-migration; `SentenceCaseTests` already pins the target. |
| 31 | `PatinaStamp`'s twelve-state grammar in Patina; SF check-marks in Capture's decision list | **ACCIDENTAL** | Directly contradicts the `P-17` ruling recorded at `PatinaEmptyState.swift:30-33`. |
| 32 | Patina Field has **no push and no local notifications** | **ACCIDENTAL** | Entitlements + zero `UNUserNotificationCenter` hits. The vision argues against *engagement optimisation*, not against alerts. |
| 33 | `CaptureWidgets/` + `CaptureShareExtension/` are empty, unreferenced directories | **ACCIDENTAL** | Stubs with no generator references. |
| 34 | AASA claims 4 path families for the client app, 1 for Field | **ACCIDENTAL** | `route.ts:11-38`. Designer-facing decision/project links have no app destination. |
| 35 | Capture has no held-deep-link queue | **ACCIDENTAL** | Patina closed three findings building one (`DeepLinkHandler.swift:22-23`). |
| 36 | `verdigris` (a green) names `#C4A57B` (a clay gold) | **ACCIDENTAL** | Self-declared deferred rename (`CaptureColor.swift:6-10`). |
| 37 | `RouteSheetHeader`'s close button is ~26 pt | **ACCIDENTAL** | `.padding(6)` on a body glyph (`RouteSessionUI.swift:87-89`) vs the shared header's 44 pt (`PatinaSheetHeader.swift:72`). |
| 38 | Patina hides the system nav bar on 17 screens; Capture uses it on 23 | **ACCIDENTAL** | Two back-chevron positions, two title typefaces, for one designer moving between two apps. |
| 39 | Capture has no page-gutter constant (16/20/14 all within 15 %) | **ACCIDENTAL** | Patina's is 24 pt with 154 call sites. |
| 40 | Capture has no labelled loading state (0 `ProgressView("…")`) | **ACCIDENTAL** | Patina has `PatinaLoadingState` with copy. |

---

## 13. Highest-leverage fixes, in order

**INFERENCE**, ranked by (blast radius × cheapness):

1. **Name the "Studio" homonym** (#29). Pure copy, no code shape change, and it is the one ambiguity a homeowner can actually hit.
2. **Fix `CaptureType`'s three font strings** to PostScript names (#12). Three-line change in one file; it restores Playfair Medium and real Inter SemiBold across 272 Capture files at once.
3. **Route Capture's three local primary button styles through `PatinaButton`** (#18, #19). The adapter pattern already exists (`RouteActionButton`) and already carries the dark-mode fix.
4. **Stop using `goldenHour`/`warning` as solid fills under `CaptureColor.ink`** (#20). Two call sites, two measured failures.
5. **Delete or adopt the four dead shared components** (#11). 465 lines either become the convention or stop pretending to be one.
6. **Collapse `PatinaCompanionMotion` / `CompanionConstants`** (#16) — the duplication is already 1:1 and will not stay that way.
7. **Settle `piece` vs `specimen`** (#27). Expensive (1 017 identifiers in Capture) — but the *user-facing* subset is ~8 strings, and that is the cheap half.
8. **Add a geometry rule to Capture's lint ratchet and a colour rule to Patina's** (#8, #23). Each app already has the machinery; each is missing the half the other has.

# W1 · L1-D — integration notes OUT

Written by L1-D on 2026-09-02 from `first-flight/w1-l1d` (base `ba83aa67f`). Every note below is
**also appended verbatim** to its target lane's inbox — `l1-a-notes.md`, `l1-b-notes.md`,
`l1-c-notes.md`, `l1-f-notes.md` — because a note nobody schedules is not a plan.

**What L1-D shipped that these notes depend on.** All of it is on `first-flight/w1-l1d`, in
`PatinaDesignKit` and this lane's four `Patina/**` files, and all of it merges **second**
(D14: L1-C → **L1-D** → L1-B → L1-F → L1-A → L1-X → L1-E). So every token named below exists by the
time any other lane rebases.

| New API | What it is for |
|---|---|
| `PatinaColors.Border.hairline` | The quiet rule: card edges, list separators, the tab bar's top line. Light `#E5E2DD` (unchanged) / dark `#322E29`. Replaces `PatinaColors.pearl` wherever pearl was drawing a **border or divider** |
| `PatinaColors.Border.strong` | The rule a tester is meant to see: field outlines, unselected chip edges, an "inactive step" fill. Light `#C8C3BB` / dark `#524C45` |
| `PatinaColors.Border.onDark` | A hairline on a `Background.dark` object, where the page behind it is what it has to separate from. Static `#756B61`, 3.18:1 on the dark canvas |
| `PatinaColors.OnDark.primary` / `.secondary` / `.muted` | Ink for a surface that is dark in **both** appearances. Static — it does not flip. `#FAF7F2` / `#D8D2C8` / `#B7AE9F` |
| `PatinaColors.Scrim.chrome` | An opaque ground for a control drawn over a photograph. Static `#332F2B`; `OnDark.primary` on it is 12.42:1 whatever the photo |
| `PatinaColors.clayInk` (`#82612F`) | Interactive labels and filled accent surfaces that carry a light label. `Text.interactive`'s light side is now this: `clayDeep` was 3.54:1 |
| `PatinaColors.errorDeep` (`#9C4C3F`) | The destructive fill. `error` under `offWhite` is 3.03:1 |
| `PatinaTypography.voiceLead` · `voiceSmall` · `voiceCaption` · `bodySerif` · `h6` · `monoLarge` | The six ramp gaps the 44 remaining inline `.font(.custom(…))` sites were reaching past |

**Changed behaviour, so nobody is surprised at merge:**

- **`PatinaColors.Background.dark` is now adaptive** — light `charcoal` (unchanged) / dark `#524B44`.
  Seven surfaces read it: the Companion orb and panel, `AddedToRoomToast`, `DesignerConsultationView`'s
  hero, `RoomBudgetBar`, `WholeHomeCrossRoomBar`. In dark mode they were 1.15:1 against the page and
  had no body at all (`C-01`). Their light-mode look is byte-identical.
- **`PatinaButtonStyle.clay` now renders the `.primary` treatment** (`C-41`). The five call sites —
  `InvoiceDetailView:219`, `ProposalDetailView:165`, `ProposalSignSheet:69`, `DecisionDetailView:425`,
  `DecisionDeferSheet:59` — keep compiling and stop being tan. `.destructive` fills with `errorDeep`.
  `PatinaButtonStyle` also publishes `patinaFillColor`, `patinaLabelColor`, `patinaBorderColor` and
  `filledCases`.
- **`DarkPalette.textSecondary` and `textMuted` are raised** (`#DFD2C0`, `#C7B99F`) — `C-20`.
- **`PatinaAsyncImage` takes a `caption:`** and has three states, not two: `loading` (shimmering mark),
  `failed` (mark + "Tap to retry"), `missing` (mark + the caption, no retry). Passing `url: nil` now
  gives the *missing* state rather than the failure state.
- **`PatinaTests` now links `PatinaDesignKit`.** `apps/mobile/Patina/Patina.xcodeproj/project.pbxproj`
  gains one `XCSwiftPackageProductDependency` on the test target. Before this, a test referencing any
  kit symbol compiled and then failed to link (`Undefined symbols … PatinaDesignKit.PatinaColors…`),
  which is why `HomeHeaderTests` says the target "does not link PatinaDesignKit" and pins `TimeOfDay`
  through a source read. It does now. Steward ruling **S-5** assumed the link already existed; it did
  not, and this is the smaller of the two fixes it implies.

---

## D→A-1 · L1-A · `P-25` — the OTP field announces a code that is not there

`Features/Authentication/Views/AuthenticationView.swift:326-331`.

`scan_ui` on the **empty** field returns `AXValue: "000000"`, so VoiceOver announces a six-digit code
to a tester who has typed nothing — and the placeholder is itself a plausible code. Visually, empty
and filled differ only in text opacity: same glyphs, same position, same font.

Replace the field with:

```swift
                    TextField("", text: $viewModel.otpToken, prompt: Text("Enter the 6-digit code"))
                        .textContentType(.oneTimeCode)
                        .keyboardType(.numberPad)
                        .font(.system(.title2, design: .monospaced))
                        .tracking(8)
                        .multilineTextAlignment(.center)
                        .accessibilityLabel("Sign-in code")
                        .accessibilityValue(
                            viewModel.otpToken.isEmpty
                                ? "Empty"
                                : "\(viewModel.otpToken.count) of 6 digits entered"
                        )
```

and give the field a filled state that differs by more than opacity — the one-line version is a border
that changes with content, using L1-D's new tokens:

```swift
                        .overlay(
                            RoundedRectangle(cornerRadius: PatinaRadius.md, style: .continuous)
                                .stroke(
                                    viewModel.otpToken.isEmpty
                                        ? PatinaColors.Border.strong
                                        : PatinaColors.Text.interactive,
                                    lineWidth: viewModel.otpToken.isEmpty ? 1 : 1.5
                                )
                        )
```

`P-25` is scored to L1-D and its file is L1-A's; L1-D closes nothing here without this task.

---

## D→A-2 · L1-A · `C3-06` and `A-73` — the auth form's affordance is inverted

`AuthenticationView.swift:513-520` (the form primary) and `:366-372` (the OTP **Verify** button) both
read:

```swift
.background(viewModel.isFormValid ? PatinaColors.Interactive.active : PatinaColors.clay)
```

Enabled is neutral charcoal; **disabled is the brand accent** — the warmest, most tappable-looking
colour in the palette — and the label stays `Text.inverse` in both, so the disabled state is also the
2.18:1 case. On the email-code path every round-one tester walks, the button looks *more* live before
the field is valid than after.

Both sites become one filled style dimmed when disabled:

```swift
.background(PatinaColors.Interactive.active)
.opacity(viewModel.isFormValid ? 1.0 : 0.4)
```

and for the OTP button, the same shape with its own predicate:

```swift
.background(PatinaColors.Interactive.active)
.opacity(otpToken.count == 6 && !isVerifying ? 1.0 : 0.4)
```

`PatinaButton` already does exactly this (`.opacity(isEnabled ? 1.0 : 0.5)`), so if either site can be
replaced outright by `PatinaButton(..., style: .primary, isEnabled:)` that is better still.

Also on L1-A's screens, same finding family (`A-73`), each a one-line swap:

| file:line | today | final |
|---|---|---|
| `Features/Authentication/Views/AuthScreenView.swift:124` | `.stroke(PatinaColors.pearl, lineWidth: 1.5)` | `.stroke(PatinaColors.Border.strong, lineWidth: 1.5)` |
| `Features/Onboarding/Views/OnboardingFlowView.swift:230` | `.fill(PatinaColors.pearl.opacity(0.6))` | `.fill(PatinaColors.Border.hairline)` |
| `Features/StyleQuiz/Views/StyleQuizView.swift:139` | `.overlay(Circle().stroke(PatinaColors.pearl, lineWidth: 0.5))` | `.overlay(Circle().stroke(PatinaColors.Border.hairline, lineWidth: 0.5))` |
| `Features/StyleQuiz/Views/StyleResultView.swift:153` | `.fill(PatinaColors.pearl)` | `.fill(PatinaColors.Border.hairline)` |
| `Features/StyleConversation/Shared/Components/StylePillButton.swift:36` | `isSelected ? PatinaColors.Interactive.active : PatinaColors.pearl,` | `isSelected ? PatinaColors.Interactive.active : PatinaColors.Border.strong,` |
| `Features/StyleConversation/Views/PriorityView.swift:71` | `isSelected ? PatinaColors.Interactive.active : PatinaColors.pearl,` | `isSelected ? PatinaColors.Interactive.active : PatinaColors.Border.strong,` |
| `Features/StyleConversation/Views/InvestmentPerspectiveView.swift:60` | `.fill(PatinaColors.pearl)` | `.fill(PatinaColors.Border.hairline)` |

`C3-05`'s quiz half is also L1-A's: `StyleQuizView.swift:239,243,325,329,335` put an `offWhite`/white
label on a `clay` fill at 2.18:1, on the app's minute-two screen. Route the **selected** state through
`FilterChip(title:isActive:)` or, in place, swap the fill to `PatinaColors.Interactive.active` and the
label to `PatinaColors.Text.inverse`. Never `clay` under a light label.

---

## D→A-3 · L1-A · `A-11` — full-colour emoji are the quiz's iconography

`Features/StyleQuiz/Models/QuizModels.swift:80-84`, `:104-107`, `:114-117`, rendered at
`Features/StyleQuiz/Views/StyleQuizView.swift:269-280` as `Text(icon).font(.system(size: 20/24))`.

VoiceOver reads the glyph as part of the label — `"🍷, Love having people over…"` — and Q4 mixes 🌱 and
💬 with flat black ✦ and ◆ in one four-item list. This is the template-app tell, on the onboarding
path every tester walks in minute two.

**Exact replacement.** Change the `icon` strings to SF Symbol names, and render them as symbols in one
weight and one colour so the icon never carries state:

| question | option | today | SF Symbol |
|---|---|---|---|
| Q2 | Love having people over | `🍷` | `wineglass` |
| Q2 | My quiet sanctuary | `🧘` | `moon.stars` |
| Q2 | Work from this room | `💻` | `laptopcomputer` |
| Q2 | Family central | `👨‍👩‍👧` | `figure.2.and.child.holdinghands` |
| Q2 | Personal retreat | `📚` | `books.vertical` |
| Q4 | (the 🌱 option) | `🌱` | `leaf` |
| Q4 | (the ✦ option) | `✦` | `sparkle` |
| Q4 | (the ◆ option) | `◆` | `diamond` |
| Q4 | (the 💬 option) | `💬` | `bubble.left.and.bubble.right` |
| Q5 | (the 🏠 option) | `🏠` | `house` |
| Q5 | (the ✨ option) | `✨` | `sparkles` |
| Q5 | (the 🔄 option) | `🔄` | `arrow.triangle.2.circlepath` |
| Q5 | (the 💎 option) | `💎` | `diamond.inset.filled` |

At the call site, `StyleQuizView.swift:269-280`:

```swift
                Image(systemName: option.icon)
                    .font(.system(size: 22, weight: .light))
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .frame(width: 28, height: 28)
                    .accessibilityHidden(true)
```

One weight, one colour, no fill variants, no colour semantics — and `accessibilityHidden` so the
option's label is the sentence alone, not "wineglass, Love having people over".

**VISION note, carried so the lane does not have to re-derive it:** a line symbol that carries no state
is not a badge and not red/green status, so this fix does not collide with §6.

---

## D→A-4 · L1-A · `C3-15` — the inline fonts in L1-A's files

Nine sites. Two of them (`ScanFloorPlanPreviewView`) have **no `relativeTo:` at all**, so they ignore
Dynamic Type outright.

| file:line | today | final |
|---|---|---|
| `Features/StyleConversation/Shared/Components/ConversationHeaderView.swift:28` | `.font(.custom("PlayfairDisplay-Italic", size: 26, relativeTo: .title2))` | `.font(PatinaTypography.voiceLead)` |
| `Features/StyleConversation/Views/ContemplativePauseView.swift:29` | `.font(.custom("PlayfairDisplay-Italic", size: 20, relativeTo: .title3))` | `.font(PatinaTypography.patinaVoiceLarge)` |
| `Features/StyleConversation/Views/VisualResonanceView.swift:73` | `.font(.custom("Inter-SemiBold", size: 11, relativeTo: .caption2))` | `.font(PatinaTypography.captionMedium)` |
| `Features/StyleConversation/Shared/Components/StyleSwatchCell.swift:35` | `.font(.custom("Inter-SemiBold", size: 11, relativeTo: .caption2))` | `.font(PatinaTypography.captionMedium)` |
| `Features/StyleConversation/Views/InvestmentPerspectiveView.swift:34-38` | the two-face ternary at 18 pt | `.font(isDiscussRow ? PatinaTypography.patinaVoice : PatinaTypography.h5)` |
| `Features/StyleConversation/Views/InvestmentPerspectiveView.swift:49` | `.font(.custom("DMMono-Regular", size: 11, relativeTo: .caption2))` | `.font(PatinaTypography.mono)` |
| `Features/StyleConversation/Views/PriorityView.swift:54` | `.font(.custom("PlayfairDisplay-Regular", size: 16, relativeTo: .callout))` | `.font(PatinaTypography.bodySerif)` |
| `Features/StyleReveal/Views/ScanFloorPlanPreviewView.swift:108` | `.font(.custom("DMMono-Regular", size: 11))` | `.font(PatinaTypography.mono)` |
| `Features/StyleReveal/Views/ScanFloorPlanPreviewView.swift:113` | `.font(.custom("DMMono-Regular", size: 11))` | `.font(PatinaTypography.mono)` |

`InvestmentPerspectiveView.swift:40` also carries a comment saying `Inter-Light` is not bundled — if a
call below it still names that face, it takes `PatinaTypography.bodySmall`. The suite that catches an
unbundled face is `PatinaTests/TypographyAdoptionTests.everyNamedFaceIsRegistered`.

---

## D→A-5 · L1-A · `GAP4-16` needs nothing from `StyleContinueButton`

Recorded so the lane does not fix it twice. `GAP4-16` — the Reveal's only CTA is invisible in light
mode, a charcoal capsule on a charcoal ground — is **closed on `first-flight/w1-l1d`** in
`RevealView.swift`, which L1-D owns: the screen now carries `.environment(\.colorScheme, .dark)`, so
its permanently-charcoal ground resolves `Interactive.active` on the near-white side and the capsule
appears. `Features/StyleReveal/Views/StyleContinueButton.swift` is **unchanged and should stay
unchanged** — its `Interactive.active` fill and `Text.inverse` label are correct once the scheme
matches the ground, and hard-coding an on-charcoal variant there would break it on any light screen
that reuses it.

---

## D→B-1 · L1-B · `C5-14` — the ten money bypasses

Today's New This Week rail prints `fullFormattedPrice` → `$4,200`; the same piece one tap later prints
`formattedPrice` → `$4.2K`. `PatinaCurrency` is the app's one currency formatter and **publishes no
compact form on purpose** — a call site that wants `$4.2K` should find nothing to reach for. Six sites
hand-roll it and four more hand-roll a bare `"$\(dollars)"`.

| file:line | today | final |
|---|---|---|
| `Core/Models/ProductModel.swift:181-187` | the whole `formattedPrice` body | `PatinaCurrency.formatWholeDollars(cents: priceCents)` |
| `Core/Models/SavedItem.swift:78-84` | the whole `formattedPrice` body | `PatinaCurrency.formatWholeDollars(cents: priceCents)` |
| `Features/Rooms/Components/RoomBudgetBar.swift:68-74` | the `K` branch | `PatinaCurrency.formatWholeDollars(cents: cents)` |
| `Features/Rooms/Components/RoomGalleryCard.swift:148-154` | the `K` branch | `PatinaCurrency.formatWholeDollars(cents: cents)` |
| `Features/Rooms/Components/WholeHomeCrossRoomBar.swift:51-53` | `dollarString = "$\(String(format: "%.1f", Double(dollars) / 1000))K"` | `dollarString = PatinaCurrency.formatWholeDollars(cents: cents)` |
| `Features/Rooms/Views/CrossRoomView.swift:240` | `let dollarString = total >= 1000 ? String(format: "$%.1fK", Double(total) / 1000) : "$\(total)"` | `let dollarString = PatinaCurrency.formatWholeDollars(cents: total * 100)` |
| `Features/Projects/Views/ProjectListView.swift:229-231` | `private func formatPrice(_ cents: Int) -> String { let dollars = cents / 100; return "$\(dollars.formatted())" }` | `private func formatPrice(_ cents: Int) -> String { PatinaCurrency.formatWholeDollars(cents: cents) }` |
| `Features/Projects/Views/ProjectDetailView.swift:352-355` | same shape | same replacement |

Once `ProductModel.formattedPrice` and `SavedItem.formattedPrice` route through `PatinaCurrency` they
agree with `fullFormattedPrice`, and the two properties can collapse into one in W2 — **not in W1**,
because `fullFormattedPrice` has call sites in three other lanes' files.

Two more are L1-C's and reach that lane separately (`DailyStoryDetailView.swift:190` reads
`product.formattedPrice`, so it fixes itself; `DecisionDetailView.swift:285-288`).

`PatinaTests/CurrencyFormattingTests` carries a **ratchet** at today's six hand-rolled compact
formatters — it fails if the count climbs, and it drops to zero the wave these land.

---

## D→B-2 · L1-B · `C3-01` — the `pearl` hairline sites in L1-B's files

`PatinaColors.pearl` is a flat sRGB literal: 1.21:1 against the light canvas (the whisper it was drawn
to be) and **12.84:1** against the dark one, so every one of these is the brightest thing on the
screen in dark mode. `pearl` itself stays — a dozen call sites use it as light ink on a permanently
dark surface — and a **border** takes `Border.hairline` (a rule the eye should not notice) or
`Border.strong` (a rule it should).

**`Border.hairline`** — replace `PatinaColors.pearl` with `PatinaColors.Border.hairline` at:

```
Features/Collections/Views/CollectionsView.swift:111
Features/Documents/DocumentListView.swift:125
Features/Orders/Views/OrderDetailView.swift:226
Features/Projects/Views/ProjectDetailView.swift:240, 254, 304, 333
Features/Proposals/Views/ProposalDetailBlocks.swift:40
Features/Rooms/Components/RoomGalleryCard.swift:125
Features/Rooms/Views/CrossRoomView.swift:88, 122, 253
Features/Rooms/Views/ItemActionMenu.swift:21, 36
Features/Rooms/Views/MoveOrCopyItemSheet.swift:33
Features/Rooms/Views/NewRoomSheet.swift:17
Features/Rooms/Views/RoomProjectView.swift:237, 379
Features/RoomScan/Views/ScanDetailsSection.swift:44
Features/RoomScan/Views/ScanReviewView.swift:365, 449
Features/RoomScan/Views/ScanSavedConfirmationView.swift:140
```

**`Border.strong`** — an outline or an unselected edge a tester is meant to see:

```
Features/Projects/Views/ProjectDetailView.swift:144
Features/Projects/Views/ProjectListView.swift:126
Features/Rooms/Views/ManualRoomEntryView.swift:153
Features/Rooms/Views/MoveOrCopyItemSheet.swift:115      (the `: PatinaColors.pearl` arm only)
Features/Rooms/Views/RoomBudgetSheet.swift:74
Features/Rooms/Views/RoomProjectView.swift:307
Features/Rooms/Views/RoomSettingsView.swift:119, 171, 205, 264
Features/RoomScan/Views/CaptionEditorSheet.swift:40
Features/RoomScan/Views/ScanDetailsSection.swift:56
Features/RoomScan/Views/ScanFallbackEntryView.swift:118, 185, 259   (the `: PatinaColors.pearl` arms)
Features/RoomScan/Views/ScanReviewHeader.swift:38
Features/RoomScan/Views/ScanReviewView.swift:341, 476
Features/RoomScan/Views/HeroPickerSheet.swift:44
```

**`OnDark.secondary`** — these three are ink on a surface that is dark in both appearances, not a
border. `Background.dark` is adaptive as of L1-D's branch, and `pearl` on its dark value is still
readable, but the token that *says* what it is:

```
Features/Rooms/Components/RoomBudgetBar.swift:26            → PatinaColors.OnDark.secondary
Features/Rooms/Components/WholeHomeCrossRoomBar.swift:34    → PatinaColors.OnDark.secondary
Features/RoomScan/Shared/Components/PauseMenuView.swift:96  → foreground: Color = PatinaColors.OnDark.primary
```

and at `PauseMenuView.swift:80, 85` the two `PatinaColors.pearl.opacity(0.35 / 0.55)` become
`PatinaColors.OnDark.muted` and `PatinaColors.OnDark.secondary` — the opacities were doing the job a
ramp should do.

**`Features/Rooms/Views/ManualRoomEntryView.swift:43`** is `foregroundStyle(PatinaColors.pearl)` on a
`Background.dark` band → `PatinaColors.OnDark.secondary`.

---

## D→B-3 · L1-B · `C3-15` — the inline fonts in L1-B's files

Thirty-two sites. Two of them are **below the design system's own floor**: the token file deprecated
its 8 pt mono in favour of a 10 pt floor, and these two are 7 pt and 8 pt.

| file:line | today | final |
|---|---|---|
| `Features/Rooms/Views/RoomProjectView.swift:456` | `.font(.custom("DMMono-Regular", size: 7, relativeTo: .caption2))` | `.font(PatinaTypography.monoLabel)` |
| `Features/Rooms/Views/RoomSettingsView.swift:243` | `.font(.custom("DMMono-Regular", size: 8, relativeTo: .caption2))` | `.font(PatinaTypography.monoLabel)` |
| `Features/Rooms/Views/RoomProjectView.swift:193, 201` | Playfair Italic 13 / `.footnote` | `.font(PatinaTypography.voiceCaption)` |
| `Features/Rooms/Views/RoomProjectView.swift:252` | Playfair Regular 18 / `.title3` | `.font(PatinaTypography.h5)` |
| `Features/Rooms/Views/RoomProjectView.swift:453` | Playfair Medium 20 / `.title3` | `.font(PatinaTypography.h5)` |
| `Features/Rooms/Components/RoomBudgetBar.swift:29` | Playfair Medium 22 / `.title2` | `.font(PatinaTypography.h4)` |
| `Features/Rooms/Views/ManualRoomEntryView.swift:33, 67, 135` | Playfair Regular 16 / `.body` | `.font(PatinaTypography.bodySerif)` |
| `Features/RoomScan/Shared/Components/EdgeToastView.swift:60` | Playfair Medium 15 / `.subheadline` | `.font(PatinaTypography.h6)` |
| `Features/RoomScan/Shared/Components/EdgeToastView.swift:63` | Inter Regular 12 / `.caption` | `.font(PatinaTypography.caption)` |
| `Features/RoomScan/Shared/Components/PauseMenuView.swift:39` | Playfair Regular 28 / `.title` | `.font(PatinaTypography.displaySmall)` |
| `Features/RoomScan/Views/ScanDetailsSection.swift:33` | Inter Regular 13 / `.footnote` | `.font(PatinaTypography.uiSmall)` |
| `Features/RoomScan/Views/ScanDetailsSection.swift:37` | DMMono Regular 12 / `.caption` | `.font(PatinaTypography.mono)` |
| `Features/RoomScan/Views/ScanReviewHeader.swift:23` | Inter Regular 13 / `.footnote` | `.font(PatinaTypography.uiSmall)` |
| `Features/RoomScan/Views/ScanReviewHeader.swift:28` | Inter Regular 15 / `.subheadline` | `.font(PatinaTypography.uiAction)` |
| `Features/RoomScan/Views/SoftLandingView.swift:112` | Inter Regular 13 / `.footnote` | `.font(PatinaTypography.uiSmall)` |
| `Features/RoomScan/Views/ScanSavedConfirmationView.swift:52` | Playfair Italic 24 / `.title2` | `.font(PatinaTypography.patinaVoiceLarge)` |
| `Features/RoomScan/Views/ScanSavedConfirmationView.swift:63` | Inter Regular 13 / `.footnote` | `.font(PatinaTypography.uiSmall)` |
| `Features/RoomScan/Views/ScanSavedConfirmationView.swift:127` | Inter Regular 12 / `.caption` | `.font(PatinaTypography.caption)` |
| `Features/RoomScan/Views/ScanThresholdView.swift:119` | Playfair Italic 17 / `.body` | `.font(PatinaTypography.patinaVoice)` |
| `Features/RoomScan/Views/ScanWalkView.swift:200` | Playfair Italic 26 / `.title2` | `.font(PatinaTypography.voiceLead)` |
| `Features/RoomScan/Views/ScanReviewView.swift:133, 299, 378` | Inter Regular 13 / `.footnote` | `.font(PatinaTypography.uiSmall)` |
| `Features/RoomScan/Views/ScanReviewView.swift:139` | Inter Regular 12 / `.caption` | `.font(PatinaTypography.caption)` |
| `Features/RoomScan/Views/ScanReviewView.swift:360, 438` | Inter Medium 11 / 10 | `.font(PatinaTypography.captionSmall)` |
| `Features/RoomScan/Views/PhotoReorderSheet.swift:48` | Inter Regular 11 / `.caption2` | `.font(PatinaTypography.captionSmall)` |
| `Features/RoomScan/Views/ScanFallbackEntryView.swift:174` | Inter Regular 15 / `.subheadline` | `.font(PatinaTypography.uiAction)` |
| `Features/RoomScan/Views/ScanFallbackEntryView.swift:235` | DMMono Regular 14 / `.subheadline` | `.font(PatinaTypography.monoLarge)` |

`ios-gate.sh lint-delta` enforces the direction (`disallow_font_custom_in_features`), and
`PatinaTests/TypographyAdoptionTests.theInlineFontCountNeverClimbs` carries the app-wide ratchet.

---

## D→C-1 · L1-C · `C-02` — the Companion's status line vanishes in dark mode

`Features/Companion/Components/CompanionHearthView.swift:402`.

The panel is `Background.dark`, a surface that is dark in **both** appearances. The subtitle uses
`PatinaColors.Text.inverse`, which flips to `#211E1B` in dark, composites at 0.72 over the panel to
`(36,33,30)` and measures **1.11:1** — including with Increase Contrast on. The title directly above it
stays legible only because `:396` uses a static light value. The app's signature voice moment — "5
things need your eye." — simply is not there for any tester whose phone is in dark mode.

```swift
                        .foregroundStyle(PatinaColors.OnDark.secondary)
```

Drop the `.opacity(0.72)`: `OnDark.secondary` is already the dimmer step, and it holds 5.71:1 on the
panel in dark and 9.62:1 in light. (If the opacity is wanted for the animation, `OnDark.secondary` at
0.72 is still 3.81:1, which clears the meta bar — `CompanionOrbAppearanceTests` asserts both.)

Same file, same class, `:467`: `.foregroundStyle(PatinaColors.pearl)` → `PatinaColors.OnDark.secondary`.
And `Features/Companion/Views/CompanionOverlay.swift:806`:
`isSuggested ? PatinaColors.offWhite : PatinaColors.pearl` →
`isSuggested ? PatinaColors.OnDark.primary : PatinaColors.OnDark.secondary`.

---

## D→C-2 · L1-C · `C-01` — the Companion orb, second notch (optional)

**The token half is already done and needs nothing from L1-C.**
`PatinaColors.Background.dark` is adaptive on `first-flight/w1-l1d` — light `charcoal` unchanged, dark
`#524B44` — so the orb's disc goes from 1.15:1 to **1.93:1** against the dark page with no call-site
change, and `CompanionMarkView.swift:163-168` compiles untouched.

If the walk still reads the disc as thin against the page, the second notch is a hairline, **not** a
glow — VISION §6 refuses shadows, and `PatinaShadows.companion` is deliberately unchanged:

```swift
                Circle()
                    .fill(PatinaColors.Background.dark)
                    .frame(width: 52, height: 52)
                    .overlay(Circle().stroke(PatinaColors.Border.onDark, lineWidth: 1))
                    .patinaShadow(PatinaShadows.companion)
```

`Border.onDark` is 3.18:1 against the dark canvas and 3.2:1 against the light one, so the rule reads in
both. The same one-liner applies to the panel shell at `CompanionHearthView.swift:96-105`. Take it only
if the screenshot says so.

---

## D→C-3 · L1-C · `A-36`, `C-27`, `B-18` — the missing-image state and the chrome scrim

`Features/Recommendations/Views/RecommendationsView.swift:362-370`:

```swift
            if let imageURL = product.imageURL, let url = URL(string: imageURL) {
                PatinaAsyncImage(url: url)
            } else {
                product.placeholderGradient
            }
```

The `else` branch is why two of ten pieces on the app's shopping screen are flat colour rectangles
still carrying a heart, a ⋯ and a "45% match" badge over nothing — and why the Pieces tab paints a
blank **cream** slab on a near-black page (`placeholderGradient` has no dark variant). Replace the
whole conditional with:

```swift
            PatinaAsyncImage(
                url: product.imageURL.flatMap(URL.init(string:)),
                contentMode: .fill,
                caption: product.name
            )
```

`PatinaAsyncImage` now has three states — a shimmering mark while loading, mark + "Tap to retry" on a
failed load, and mark + the piece's name when there is no photograph at all. Passing `nil` is the
*missing* state, which is the distinction `A-36` asks for.

**The scrim half of `C-27`, which does not go away when real photography lands.** The heart and ⋯ are
`Circle().fill(.ultraThinMaterial)` (`:504-508`, `:526-530`) and the match pill is
`.background(.ultraThinMaterial)` (`:375-382`). A material's contrast is a function of what is behind
it: over a light tile in dark mode it inverts to a light-on-light wash, and the chrome measured
**2.01:1** with the pill's text at **1.86:1**. Replace each `.ultraThinMaterial` background with the
scrim and pin the ink:

```swift
                        .foregroundStyle(PatinaColors.OnDark.primary)
                        .patinaChromeScrim(Circle())
```

and for the match pill:

```swift
                        .foregroundStyle(PatinaColors.OnDark.primary)
                        .patinaChromeScrim(RoundedRectangle(cornerRadius: 6, style: .continuous))
```

`patinaChromeScrim` is a `View` extension in `PatinaDesignKit`; `OnDark.primary` on
`Scrim.chrome` is 12.42:1 whatever the photograph.

The same `else product.placeholderGradient` shape appears on the Pieces tab and the piece detail —
every one of them takes the same replacement.

---

## D→C-4 · L1-C · `A3-01` — the honest empty state on every product surface

Production's `get_aesthete_matches` returns **zero rows for every tester**: `public.products` holds 15
rows, exactly one of which is `layer='catalog' AND status='published'`, and it is named
"Smoke Test Ceramic Lamp" at $20 with no image. Whether or not Leah's manifest lands before build 1
(**D2**), the app has to say one true thing when nothing comes back — the same sentence on every
surface, and no door with nothing behind it.

`PatinaDesignKit` publishes it:

```swift
PatinaEmptyState(.stillChoosingPieces)
```

which renders `square.stack` over **"Nothing here yet"** and *"Your designer is still choosing pieces
for you. This fills in as they do."* — with no CTA, deliberately.

Apply it in place of every "no recommendations" branch on:

```
Features/Recommendations/Views/RecommendationsView.swift    (the Pieces tab root)
Features/Home/Views/DailyRoomView.swift                     (the Today rails, when the rail is empty)
```

**Copy ownership.** The two strings are L1-D's placeholder for an L1-E deck row that does not exist
yet — `build/waves/w1/l1-e-copy-deck.md` was absent when this note was written. If the deck lands with
different words, change them in
`apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaEmptyState.swift`
(`PatinaEmptyStateContent.stillChoosingPieces`) — **one place, not per surface** — and
`PatinaTests/ImagePlaceholderTests.stillCuratingStateIsAvailable` will name the two rows that changed.

---

## D→C-5 · L1-C · `A3-17` — the story card with no hero

**The read-time half is done** in `Core/Network/EditorialStoriesAPIClient.swift` (L1-D's file): the
row's `read_minutes` is now clamped to what its body can carry, so the 387-character "A defense of
imperfect linen" prints "1 min read" instead of "5 min read". All three production rows are stubs
billed at 3–5 minutes; none of them changes in the database.

**The hero half is L1-C's.** All three rows have `hero_image_url` NULL, so `DailyStory.heroGradient`
falls back to `PatinaGradients.hero` — a coloured rectangle where the art should be, on the one card a
tester can open when the catalogue is empty. `Features/Home/Views/DailyStoryCard.swift` and
`DailyStoryDetailView.swift` should route the hero through the component that knows what to do:

```swift
                PatinaAsyncImage(url: story.heroImageURL, contentMode: .fill, caption: story.tag)
```

which draws the strata mark on the quiet surface with the story's tag under it, instead of a gradient
pretending to be a photograph. Keep `story.heroGradient` only if a *deliberate* editorial gradient is
wanted for rows that pin `hero_gradient_key`; the fallback case is the one this is about.

Also in those two files, `DailyStoryCard.swift:71` and `DailyStoryDetailView.swift:140`:
`.foregroundStyle(PatinaColors.pearl)` → `PatinaColors.OnDark.secondary` (ink over a dark hero, not a
border).

---

## D→C-6 · L1-C · `C3-01` — the `pearl` hairline sites in L1-C's files

**`Border.hairline`:**

```
Design/Animations/PatinaTransitions.swift:53              (the `style == .light ?` arm)
Features/Home/Views/HouseRecordCard.swift:271, 302, 329
Features/Invoices/Views/InvoiceDetailBlocks.swift:97, 133
Features/Navigation/PatinaTabBar.swift:68
```

`PatinaTabBar.swift:68` is the loudest single site in the app: it is the top rule of the four-tab bar
every round-one tester sees on the shipped root, and in dark mode it is a 12.84:1 near-white line
across the screen.

**`Border.strong`:**

```
Features/Home/Views/YourHouseRail.swift:293               (the dashed "add" outline)
Features/Profile/Views/StudioHubView.swift:181, 190, 254
Features/Rooms/Components/RoomTypePillRow.swift:41        (the unselected arm only)
```

**`OnDark.secondary`** — ink on a permanently dark surface, not a border:

```
Features/Companion/Components/CompanionHearthView.swift:467      (also in D→C-1)
Features/Companion/Views/CompanionOverlay.swift:806              (also in D→C-1)
Features/DesignServices/DesignerConsultationView.swift:27
Features/Home/Views/DailyStoryCard.swift:71                      (also in D→C-5)
Features/Home/Views/DailyStoryDetailView.swift:140               (also in D→C-5)
Features/ProductDetail/Views/ProductDetailView.swift:637
```

---

## D→C-7 · L1-C · `C3-15` and `C3-05` in L1-C's files

**Inline fonts** — three sites, all in `Features/Companion/Views/CompanionIntroBubble.swift`:

| line | today | final |
|---|---|---|
| `:70` | `.font(.custom("PlayfairDisplay-Italic", size: 18, relativeTo: .headline))` | `.font(PatinaTypography.patinaVoice)` |
| `:74` | `.font(.custom("PlayfairDisplay-Italic", size: 15, relativeTo: .body))` | `.font(PatinaTypography.voiceSmall)` |
| `:118` | `.font(.custom("PlayfairDisplay-Italic", size: 15, relativeTo: .body))` | `.font(PatinaTypography.voiceSmall)` |

**Clay fills carrying a light label** (`C3-05`, 2.18:1):

| file:line | today | final |
|---|---|---|
| `Features/Companion/Views/CompanionIntroBubble.swift:90` | a `clay` fill under an `offWhite` label | fill `PatinaColors.Interactive.active`, label `PatinaColors.Text.inverse` |
| `Features/Home/Views/DailyGreetingHeader.swift:155-158` | the attention count on `clayDeep` with an `offWhite` numeral (3.54:1) | fill `PatinaColors.clayInk` (5.31:1) — or `Interactive.active` if the count should read as neutral |
| `Features/Home/Views/DailyGreetingHeader.swift:189-192` | `UnreadBadge`, a 10 pt numeral on `clay` | fill `PatinaColors.Interactive.active`, label `PatinaColors.Text.inverse` |
| `Features/Rooms/Components/RoomTypePillRow.swift:32, 37` | selected pill: light label on `clay` | fill `PatinaColors.Interactive.active`, label `PatinaColors.Text.inverse` — or route through `FilterChip` |

`TierPill.swift` is L1-D's and is already done; `PatinaButton .clay` is already collapsed into
`.primary`, so `DecisionDetailView:425` and `DecisionDeferSheet:59` need no edit — they stop being tan
on their own.

**`C-06` / `GAP1B-03` interaction, recorded not requested.** L1-C is rewriting the Today header for
Dynamic Type. `DarkPalette.textSecondary` and `textMuted` moved on L1-D's branch (`C-20`), so if the
header's dark-mode screenshots are being taken as evidence, take them **after** rebasing onto L1-D.

---

## D→C-8 · L1-C · `C-20`'s body half is a disabled control, not an ink colour

**This one is new, and it changes what `C-20` asks for.** Measured on this lane's own clone, on the
four-tab root, signed in, in dark mode — `shots/w1-l1d/before-04-today-dark.png` and
`after-04-today-dark.png`, method and table in `shots/w1-l1d/ledger.md`:

| row on the Today card | measured |
|---|---|
| "Leah Hartwell sent you a message." — **has** a route | 12.42:1 |
| "Meadow Linen Sectional shipped." — **has** a route | 12.42:1 |
| "A new story from the workshop." — **no** route | **4.27:1** |
| `SEP 2` meta on a routed row | 5.94:1 → 7.48:1 after L1-D's token raise |
| `SEP 1` meta on the unrouted row | 2.60:1 → 3.01:1 after L1-D's token raise |

Every row uses `PatinaColors.Text.primary` at `HouseRecordCard.swift:384`. The dim one is dim because
`HouseRecordCard.swift:375` puts `.disabled(row.route == nil)` on the row's `Button`, and SwiftUI
renders a disabled button's label at roughly half alpha. `C-20` measured 4.27:1 and 2.66:1 and read
them as a token problem; they reproduce exactly here, and **no token value can fix the body half** —
the row has to stop being a disabled control.

L1-D's side is done: the meta tier now clears the 3:1 bar even under the dimming.

The fix is L1-C's, and the smallest version is to stop dressing an informational row as a dead
control — keep it a plain, non-interactive row rather than a `Button` that is `.disabled`:

```swift
        .buttonStyle(.plain)
        // C-20: a row with no route was a *disabled* Button, and SwiftUI dims a
        // disabled label to about half alpha — 12.42:1 became 4.27:1 on the app's
        // home screen in dark mode. `.allowsHitTesting` withholds the tap without
        // withholding the contrast.
        .allowsHitTesting(row.route != nil)
        .accessibilityElement(children: .ignore)
```

i.e. drop `.disabled(row.route == nil)` at `:375` and keep the trait line below it, which already says
`accessibilityAddTraits(row.route == nil ? [] : .isButton)` — so VoiceOver still does not announce it
as a button.

If a row with nowhere to go should read as quieter, that is a **deliberate** ink choice
(`PatinaColors.Text.secondary`, 9.72:1 in dark) rather than a system side effect — and it would still
clear the 4.5:1 body bar, which the current dimming does not.

---

## D→F-1 · L1-F · `C3-01` — the `pearl` sites in messaging and notifications

Four, all dividers or a card outline. `pearl` is 12.84:1 against the dark canvas.

| file:line | today | final |
|---|---|---|
| `Features/Messaging/Views/ThreadDetailView.swift:291` | `Rectangle().fill(PatinaColors.pearl).frame(height: 1)` | `Rectangle().fill(PatinaColors.Border.hairline).frame(height: 1)` |
| `Features/Messaging/Views/ThreadListView.swift:175` | `Rectangle().fill(PatinaColors.pearl).frame(height: 1)` | `Rectangle().fill(PatinaColors.Border.hairline).frame(height: 1)` |
| `Features/Messaging/Views/ThreadListView.swift:129` | `.stroke(PatinaColors.pearl, lineWidth: 1)` | `.stroke(PatinaColors.Border.strong, lineWidth: 1)` |
| `Features/Notifications/Views/NotificationFeedView.swift:289` | `Rectangle().fill(PatinaColors.pearl).frame(height: 1)` | `Rectangle().fill(PatinaColors.Border.hairline).frame(height: 1)` |

`ThreadDetailView.swift:291` sits on the screen `L07-02` is about — the composer drawn under the tab
bar — so it is the same file that lane is already editing.

Unrelated to `C3-01` but in the same file and cheap:
`Features/Notifications/Views/NotificationFeedView.swift:272` uses `PatinaTypography.monoTiny`, which
is deprecated in favour of the 10 pt floor (`monoLabel`) and emits a build warning today.

---

## Not sent, and why

- **`C5-14`'s two remaining sites in L1-C's files** (`DecisionDetailView.swift:285-288`) are inside
  `D→C-7`'s file set but are a copy/format concern L1-E's deck may restate; the one-line replacement is
  `PatinaCurrency.formatWholeDollars(cents: cents)` if the lane wants it now.
- **`PatinaGradients.sageGradient`** still names `pearl` as a gradient stop. That is a colour in a
  gradient, not a rule, and it is L1-D's own file — left as it is deliberately.
- **`Features/Budget/**`, `Features/Orders/Views/OrderedListView.swift`, `Features/Purchase/**`
  (except `OrderFailureCopy.swift`), `Features/DesignServices/ScanPickerView.swift`** carried ten
  `pearl` sites and one `clay`-under-light-label site between them and are owned by **no** W1 lane, so
  L1-D applied them directly rather than writing a note nobody would schedule. They are on
  `first-flight/w1-l1d`.

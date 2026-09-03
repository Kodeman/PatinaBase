# W1 · L1-D — Tokens, dark mode, contrast, iconography · task list

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1d`, branch
`first-flight/w1-l1d`, base `ba83aa67f`. Written before the first edit, per PROGRAM.md §7.

---

## Standing line 1 — the gate, and the clone

```bash
export IOS_GATE_UDID=FF762E1A-F261-4C23-AFB9-CDDEE9B82B8D    # ff-w1-l1d, this lane's clone only
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
apps/mobile/Patina/scripts/ios-gate.sh unit
apps/mobile/Patina/scripts/ios-gate.sh lint-delta main
```

`swift test --package-path apps/mobile/PatinaDesignKit` is **struck** by steward ruling **S-5** —
the package is iOS-only, has no test target, and fails on the host with
`error: no such module 'UIKit'`. `ContrastTests` and `DynamicTokenTests` are written into
`apps/mobile/Patina/PatinaTests/` instead, which compiles for the Simulator and already links
`PatinaDesignKit`.

Launch line for every self-check on this clone (D1a, steward §8) — **no `-PatinaFlags`**:

```bash
xcrun simctl launch FF762E1A-F261-4C23-AFB9-CDDEE9B82B8D cloud.patina.app -DeploymentTarget local
```

---

## Standing line 2 — the VISION check

*Name any finding in my table whose fix would add or entrench something VISION §6 refuses — tab /
zone / dashboard UI beyond D1's ruling, shadows, red/green status, badges, engagement optimisation,
or the word "AI" — and say why it survives.*

Three of my eighteen touch a §6 refusal. Each survives, and one is deliberately **not** taken:

| Finding | The §6 collision | Ruling |
|---|---|---|
| `C-01` — the Companion orb is 1.15:1 in dark mode | The finding's own fix offers *"or add a border/**shadow** token"*. §6 refuses shadows. | **The shadow route is refused.** The fix taken is the first half of the finding — an **adaptive fill** (`Background.dark` becomes light-`charcoal` / dark-`#524B44`), which is a colour change, not an elevation effect. `PatinaShadows.companion` is left exactly as it is; no glow, no new shadow token, no dark-mode shadow variant. A hairline stroke is offered to L1-C as an *optional* second notch in note **D→C-2**, described as a 1 pt rule, not a glow. |
| `A-90` / `C-41` — enabled vs disabled buttons | The fix says "black = enabled, reduced-opacity grey = disabled". A **red/green** status pair would be the obvious alternative and §6 refuses it. | Survives because the fix is explicitly **not** colour-coded semantics: one fill for every primary button, and disabled is the *same* fill at reduced opacity. No red, no green, no status hue anywhere in `PatinaButton`. |
| `A-11` — full-colour emoji are the quiz's iconography | The replacement is "SF Symbols or the brand's line icons". A line icon is not a badge, a status dot or a dashboard tile. | Survives. The note to L1-A specifies **one weight, one colour, no fill variants, no colour semantics** — the SF Symbol carries no state. |

Nothing in this lane adds a tab, a zone, a dashboard, a badge, an engagement mechanic, or the word
"AI". The four-tab root is D1/V7's logged exception and this lane neither extends nor relies on it.

---

## Standing line 3 — the notes I must apply

**None.** As of writing there is no `build/waves/w1/l1-d-notes.md`, and a grep of every existing
inbox — `l1-a-notes.md`, `l1-b-notes.md`, `l1-c-notes.md` — for `L1-D` / `l1d` returns nothing.
`build/waves/w1/l1-e-copy-deck.md` **does not exist yet**, so L1-E's one row for this lane
(`C5-14`, the money formatter's output strings) cannot be applied here; Task 14 records the
formatter's exact output strings so the deck can be written against them, and the deck pass at
integration applies any row that changes them.

If an inbox appears before this lane's final commit, it is read and its tasks are appended here
before that commit.

---

## Standing line 4 — the notes I will send

Written in full, with exact final text, to
`build/waves/w1/l1d-notes-out.md`, and appended verbatim to each target lane's inbox
(`l1-a-notes.md`, `l1-b-notes.md`, `l1-c-notes.md`, `l1-f-notes.md`). Summary:

| id | To | What |
|---|---|---|
| `D→A-1` | L1-A | `P-25` — the OTP field: empty AX value, `accessibilityLabel "Sign-in code"`, a placeholder that is not a plausible code, a filled state that differs from empty. `AuthenticationView.swift:326-331` |
| `D→A-2` | L1-A | `C3-06` / `A-73` — the auth form's inverted affordance: one filled style, `.opacity(0.4)` when disabled, never `clay` as the disabled fill. `AuthenticationView.swift:513-520` and `:366-372` |
| `D→A-3` | L1-A | `A-11` — the quiz's emoji iconography → SF Symbols, one weight, one colour; strip the glyph from the AX label. `QuizModels.swift:80-84,104-107,114-117`, `StyleQuizView.swift:269-280` |
| `D→A-4` | L1-A | `C3-15` — the four `relativeTo:`-less inline fonts and the clay-filled quiz selections in files L1-A owns |
| `D→A-5` | L1-A | `GAP4-16`'s other half — `StyleContinueButton.swift` needs nothing once `RevealView` carries the dark scheme; recorded so the lane does not fix it twice |
| `D→B-1` | L1-B | `C5-14` — the ten money bypasses in `Core/Models/**` and `Features/Rooms/**`, each with its exact one-line replacement |
| `D→B-2` | L1-B | `C3-01` — the `pearl` hairline sites in L1-B's files → `PatinaColors.Border.hairline` |
| `D→B-3` | L1-B | `C3-15` — the inline `.font(.custom(` sites in L1-B's files, each with its token |
| `D→C-1` | L1-C | `C-02` — `CompanionHearthView.swift:402`, pin the panel subtitle to `PatinaColors.OnDark.secondary` |
| `D→C-2` | L1-C | `C-01` — optional hairline on the orb and panel, `PatinaColors.Border.onDark` |
| `D→C-3` | L1-C | `A-36` / `C-27` / `B-18` — route the missing-image branch through `PatinaAsyncImage(url:caption:)` and give the overlay chrome a guaranteed scrim |
| `D→C-4` | L1-C | `A3-01` — the honest "still curating" empty state on every product surface, exact copy |
| `D→C-5` | L1-C | `A3-17` — the hero-less story card treatment |
| `D→C-6` | L1-C | `C3-01` — the `pearl` hairline sites in L1-C's files |
| `D→C-7` | L1-C | `C3-15` / `C3-05` — inline fonts and clay-filled controls in L1-C's files |
| `D→C-8` | L1-C | `C-20`'s body half — measured on this lane's clone as a **disabled** `Button`, not an ink colour; no token can fix it. Added after the self-check |
| `D→F-1` | L1-F | `C3-01` / `C3-15` — the `pearl` and inline-font sites in `Features/Messaging/**` and `Features/Notifications/**` |

---

## Coverage — the eighteen findings, and the task that closes each

| id | closed by | pinned by |
|---|---|---|
| `A3-01` | T12 (kit empty state + copy) + note `D→C-4` | `ImagePlaceholderTests.stillCuratingStateIsAvailable` |
| `A-11` | note `D→A-3` | — (L1-A's file; recorded open) |
| `A-36` | T11 (`PatinaAsyncImage`) + T13 (`ProductCard`) + note `D→C-3` | `ImagePlaceholderTests` |
| `A-73` | T5, T6 (`PatinaButton`, `Text.interactive`) + notes `D→A-2`, `D→C-7` | `ContrastTests.everyFilledButtonLabelClearsAA` |
| `A-90` | T5 (`.clay` collapses into the one primary style) | `PrimaryButtonStyleTests` |
| `A3-17` | T15 (`EditorialStoriesAPIClient` read-time clamp) + note `D→C-5` | `EditorialReadTimeTests` |
| `B-18` | T11 + note `D→C-3` | `ImagePlaceholderTests` |
| `C-01` | T4 (`Background.dark` adaptive) | `CompanionOrbAppearanceTests` |
| `C-02` | T4 (`OnDark` tokens) + note `D→C-1` | `CompanionOrbAppearanceTests.onDarkTokensDoNotFlip` |
| `C-20` | T3 (dark de-emphasised ramp) | `ContrastTests.darkModeDeEmphasisedInk` |
| `C-27` | T11 + note `D→C-3` | `ImagePlaceholderTests` |
| `C-41` | T5 | `PrimaryButtonStyleTests.onlyOneFilledPrimaryTreatment` |
| `C3-01` | T2 (`Border.hairline`/`.strong`/`.onDark`) + T7 own-file sweep + notes `D→B-2`, `D→C-6`, `D→F-1` | `DynamicTokenTests`, `BorderTokenAdoptionTests` |
| `C3-05` | T5, T6, T8 (`TierPill`) + notes | `ContrastTests`, `PrimaryButtonStyleTests` |
| `C3-15` | T9 (`RevealView`), T13 (`ProductCard`) + notes `D→A-4`, `D→B-3`, `D→C-7` | `TypographyAdoptionTests` |
| `C5-14` | T14 (`PatinaCurrency`) + note `D→B-1` | `CurrencyFormattingTests` |
| `P-25` | note `D→A-1` | — (L1-A's file; recorded open) |
| `P-35` | T10 (`SignInWithAppleButton`) — same fix closes `C3-03` | `PrimaryButtonStyleTests.appleButtonStyleFollowsScheme` |

Also in this lane's owned globs by name, though scored to L1-C: **`GAP4-16`** (T9) and **`C3-03`**
(T10).

---

## Tasks

Each task is: **failing test → run → implement → run → pathspec commit.**

### T1 — the contrast harness

- **Test.** `apps/mobile/Patina/PatinaTests/PatinaContrast.swift` — resolve any `Color` through
  `UIColor(_:).resolvedColor(with: UITraitCollection(userInterfaceStyle:))` and compute the WCAG 2.x
  ratio from the resolved sRGB components. Not a token assertion; the instrument every later
  assertion uses. Its own self-test pins `#FAF7F2` on `#2C2926` = 13.53:1 and `#C4A57B` under
  `#FAF7F2` = 2.18:1 (the two numbers `A-73`/`A-90` were scored on).
- **Run.** `ios-gate.sh unit` → the helper's self-test is green before any token moves.
- **Commit.** `apps/mobile/Patina/PatinaTests/PatinaContrast.swift`

### T2 — `Border.hairline` / `Border.strong` / `Border.onDark` (`C3-01`)

- **Test.** `DynamicTokenTests.swift` — the three tokens exist, each resolves to a **different**
  value in light and dark, and `Border.hairline` is ≤ 1.6:1 against its own ground in **both**
  appearances (the "whisper" the light palette intends and dark mode loses at 12.84:1).
  RED today: the tokens do not exist.
- **Implement.** `PatinaColors.swift` — `public enum Border { hairline, strong, onDark }`, built with
  `Color.patinaDynamic`. `pearl` itself is **unchanged**: 13 of its 93 call sites use it as light ink
  on a permanently dark surface, and flipping the literal would blank them in dark mode.
- **Run.** `ios-gate.sh unit`
- **Commit.** `PatinaColors.swift`, `DynamicTokenTests.swift`

### T3 — the dark de-emphasised ramp (`C-20`)

- **Test.** `ContrastTests.darkModeDeEmphasisedInk` — `Text.secondary` ≥ 9:1 and `Text.muted` ≥ 7:1
  against `Background.secondary` in dark, with the ramp strictly ordered
  primary > secondary > muted. RED today: 8.91:1 and 5.94:1.
- **Implement.** `DarkPalette.textSecondary` `#D8C9B4` → `#DFD2C0`; `textMuted` `#B5A487` → `#C7B99F`.
  The token headroom is what the render loses: a 10 pt DM Mono stroke antialiases to roughly 55 % of
  the way from ground to ink, which is how a 5.94:1 token measured 2.66:1 on `shots/C/06`.
- **Run.** `ios-gate.sh unit`
- **Commit.** `PatinaColors.swift`, `ContrastTests.swift`

### T4 — the Companion surface and the on-dark ink (`C-01`, `C-02`)

- **Test.** `CompanionOrbAppearanceTests` — `Background.dark` resolves to **different** values in the
  two appearances, holds ≥ 1.8:1 against `Background.primary` in dark (1.15:1 today), and keeps
  `offWhite` ink ≥ 4.5:1 on itself in both. `OnDark.primary` / `OnDark.secondary` resolve
  **identically** in both appearances and clear 4.5:1 on the companion surface in both — the
  property `Text.inverse` lacks and `C-02` is made of.
- **Implement.** `Background.dark` becomes `patinaDynamic(light: charcoal, dark: #524B44)`; add
  `public enum OnDark { primary, secondary, muted }` as **static** values. No shadow is added
  (VISION §6 — see standing line 2).
- **Run.** `ios-gate.sh unit`
- **Commit.** `PatinaColors.swift`, `CompanionOrbAppearanceTests.swift`

### T5 — one primary button (`C-41`, `A-90`, `A-73`, `C3-05`, `C3-06`)

- **Test.** `PrimaryButtonStyleTests` — every filled `PatinaButtonStyle` puts its label ≥ 4.5:1 on its
  fill in both appearances; `.clay` and `.primary` resolve to the **same** fill and the **same**
  label colour; the disabled treatment is an opacity of the enabled fill and is never `clay`.
  RED today: `.clay` = `offWhite` on `clay` = 2.18:1, `.destructive` = 3.03:1.
- **Implement.** `PatinaButton.swift` — `.clay` renders the primary treatment; `.destructive` fills
  with a new `errorDeep` `#9C4C3F`; `AuthButton`'s `pearl` border → `Border.strong`.
- **Run.** `ios-gate.sh unit`
- **Commit.** `PatinaButton.swift`, `PatinaColors.swift`, `PrimaryButtonStyleTests.swift`

### T6 — `Text.interactive` clears AA (`A-73`)

- **Test.** `ContrastTests.interactiveInkClearsAA` — `Text.interactive` ≥ 4.5:1 on both grounds in
  both appearances. RED today: `clayDeep` `#9F7E48` on `offWhite` = 3.54:1.
- **Implement.** add `clayInk = #82612F` (5.31:1) and point `Text.interactive`'s light side at it.
  `clayDeep` is left alone — its three call sites read it directly and a darker value would cost
  `YourDesignerSeat.swift:208` its dark-mode contrast.
- **Run + commit.** `PatinaColors.swift`, `ContrastTests.swift`

### T7 — the kit's own `pearl` sites (`C3-01`)

- **Test.** `BorderTokenAdoptionTests` — zero `PatinaColors.pearl` in the files this lane owns, and an
  app-wide **ratchet**: the count outside `PatinaColors.swift` never exceeds today's 93.
- **Implement.** `PatinaCard.swift`, `PatinaButton.swift`, `PatinaTextField.swift` → `Border.hairline`.
- **Run + commit.** the three components, `BorderTokenAdoptionTests.swift`

### T8 — `TierPill` off `clay` (`C3-05`)

- **Test.** `ContrastTests.tierPillLabelClearsAA`.
- **Implement.** `Design/Components/TierPill.swift` — `clay.opacity(0.85)` + `offWhite`
  (2.18:1) → `Interactive.active` + `Text.inverse`.
- **Run + commit.** `TierPill.swift`

### T9 — the Reveal (`C3-15` T0 half, `GAP4-16`)

- **Test.** `TypographyAdoptionTests.everyNamedFaceIsRegistered` — after `PatinaFonts.registerAll()`,
  `UIFont(name:size:)` resolves every PostScript name any `.font(.custom(` in `Features/**` and every
  `PatinaTypography` token asks for. RED today: `PlayfairDisplay-Light` is not in the bundle, so a
  42 pt hero silently renders in San Francisco.
- **Implement.** `RevealView.swift` — the two inline fonts become `PatinaTypography` tokens
  (`display2`, `caption`), the `pearl` tag ink becomes `OnDark.secondary`, and the screen carries
  `.environment(\.colorScheme, .dark)` so its permanently-charcoal ground resolves the semantic
  tokens on their dark side — which is what makes `StyleContinueButton`'s capsule visible in light
  mode (`GAP4-16`).
- **Run + commit.** `RevealView.swift`, `TypographyAdoptionTests.swift`

### T10 — Sign in with Apple follows the scheme (`P-35`, `C3-03`)

- **Test.** `PrimaryButtonStyleTests.appleButtonStyleFollowsScheme` — source pin on
  `SignInWithAppleButton.swift`: no hard-coded `.signInWithAppleButtonStyle(.black)`, and the file
  reads `@Environment(\.colorScheme)`.
- **Implement.** `.signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)`.
- **Run + commit.** `SignInWithAppleButton.swift`, `PrimaryButtonStyleTests.swift`

### T11 — the designed missing-image state (`A-36`, `C-27`, `B-18`)

- **Test.** `ImagePlaceholderTests` — `PatinaAsyncImage` exposes three distinct states, takes a
  `caption`, and its permanently-missing state is a branded mark on a tint, never a bare fill.
- **Implement.** `PatinaAsyncImage.swift` — a `caption:` parameter printed under the mark when the
  image is permanently missing, a shimmer on the loading state, and a `scrimmed` overlay helper the
  chrome can sit on so a heart/⋯ holds 4.5:1 over a light tile.
- **Run + commit.** `PatinaAsyncImage.swift`, `ImagePlaceholderTests.swift`

### T12 — the "still curating" state (`A3-01`)

- **Test.** `ImagePlaceholderTests.stillCuratingStateIsAvailable` — the kit publishes the empty state
  with the agreed copy and no CTA into a dead end.
- **Implement.** `PatinaEmptyState.stillCuratingPieces()` — one named constructor so every product
  surface says the same true sentence when zero rows come back. Copy is coordinated with L1-E in note
  `D→C-4`; the data half is Kody/Leah's (`D2`).
- **Run + commit.** `PatinaEmptyState.swift`

### T13 — `ProductCard` (`C3-15`, `A-36`)

- **Test.** covered by `TypographyAdoptionTests` (zero inline fonts in this lane's files) and
  `ImagePlaceholderTests`.
- **Implement.** `Features/Shared/Views/ProductCard.swift` — the inline
  `.font(.custom("PlayfairDisplay-Medium", size: 11, relativeTo: .caption2))` becomes a token, the
  price capsule's ground becomes `OnDark`-safe, and the no-image branch routes through
  `PatinaAsyncImage` instead of a bare gradient.
- **Run + commit.** `ProductCard.swift`

### T14 — one money rule (`C5-14`)

- **Test.** `CurrencyFormattingTests` — `PatinaCurrency` produces exactly one shape for a given
  amount; `420000` → `$4,200` and never `$4.2K`; zero hand-rolled `K` formatters in the files this
  lane owns; an app-wide ratchet at today's six.
- **Implement.** `Features/Shared/CurrencyFormatting.swift` — the rule is stated in one place and the
  compact form is deliberately **not** added, so there is nothing for a call site to reach for.
- **Run + commit.** `CurrencyFormatting.swift`, `CurrencyFormattingTests.swift`

### T15 — the read time a body can carry (`A3-17`)

- **Test.** `EditorialReadTimeTests` — a 387-character body never claims five minutes; the claim is
  `min(row, computed)`; a body long enough keeps its editorial value.
- **Implement.** `Core/Network/EditorialStoriesAPIClient.swift` — `EditorialReadTime.minutes(for:)`
  at 200 wpm, floor 1, and `DailyStory.init(from:isUnread:)` clamps the row's claim to it.
- **Run + commit.** `EditorialStoriesAPIClient.swift`, `EditorialReadTimeTests.swift`

### T16 — the notes, written and delivered

- Write `build/waves/w1/l1d-notes-out.md` with the exact final text of every note.
- Append each note verbatim to its target lane's inbox.
- **Commit.** `l1d-tasks.md`, `l1d-notes-out.md`

### T17 — the gate, and the self-check

- `ios-gate.sh build` · `release` · `unit` · `lint-delta main`, each recorded verbatim.
- Install the Debug product on `FF762E1A-F261-4C23-AFB9-CDDEE9B82B8D`, launch with
  `-DeploymentTarget local`, and screenshot every screen this lane changed in **both** appearances,
  before and after, into `shots/w1-l1d/` with a one-line ledger entry each.

# W1 · L1-D — integration notes

Notes addressed **to** L1-D. Each is a numbered task for L1-D's own task list, carrying exact final
text.

---

## From L1-E (Copy) — 2026-09-02

One row, proactive — not a W1 finding id, so it does not gate this lane's exit criteria. Full
reasoning in `build/waves/w1/l1-e-copy-deck.md`.

### Task D-L1E-1 — `PatinaEmptyState.swift`'s `#Preview` default (optional)

`apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaEmptyState.swift:66-67` — the
`#Preview` default is the shape any lane reaches for when it needs a "the catalogue is empty" empty
state, including D2's fallback if Leah's ≥30-piece manifest is not in hand by day 6 (PROGRAM.md §1/§8
name "L1-D's placeholder work" as the D2-fallback UI).

Today:

```swift
title: "No products yet",
message: "Products you capture will appear here, ready to add to a room."
```

Proposed, if/when a real call site needs this copy:

```swift
title: "Still building the collection",
message: "New pieces are added by hand — check back soon."
```

`"Products"` is the noun `C5-09` retires app-wide (the brand's word is "pieces"), and "Products you
capture" describes an AR-capture flow that has nothing to do with an empty catalogue. `"curating"`
itself is on the brand-voice lexicon's avoid-list (overused) even though the planning docs use it
informally — "building the collection" says the same thing without it.

**Apply only if/when a real call site needs this copy** — the `#Preview` default alone is not
user-facing, so this task carries no urgency and is not part of any W1 exit criterion.

### VISION check on this note

Adds no tab/zone/dashboard framing, a shadow, red/green status, a badge, an engagement mechanic or the
word "AI" — a two-line empty-state rewrite.

---

## From L1-C (Layout, Companion, Dynamic Type) — 2026-09-02

Two notes. L1-C merges **first** (D14), so note 1 is already on the tip when L1-D rebases; note 2 is
work L1-D still owns. Both are reproduced from `build/waves/w1/l1c-notes-out.md` §1 and §2.

### Task D-L1C-1 — `GAP4-16`: the two lines L1-C changed inside `RevealView.swift`

`RevealView.swift` is **L1-D's file by name** (PROGRAM.md §3 · L1-D globs: *"…
`Features/StyleReveal/Views/RevealView.swift` (C3-15, GAP4-16)"*), but `GAP4-16` is a **T1/blocker in
L1-C's W1 table** and the fix needs one line in that file. L1-C made the smallest change that closes
it and is telling L1-D exactly where, so the `C3-15` edit at `:85` / `:127` (the
`PlayfairDisplay-Light` face that is not shipped) rebases without a conflict.

`Features/StyleConversation/Shared/Components/StyleContinueButton.swift` (no lane owns it;
`GAP4-16` carries `alsoTouches: ["L1-D"]`) gained a ground variant, **defaulted so the four other
call sites are untouched**:

```swift
    enum Ground {
        case app
        case charcoal
    }
    …
    init(title: String = "Continue", isEnabled: Bool, ground: Ground = .app, action: @escaping () -> Void)
    …
    private var fillColor: Color {
        switch ground {
        case .app:      return PatinaColors.Interactive.active
        case .charcoal: return PatinaColors.offWhite
        }
    }

    private var labelColor: Color {
        switch ground {
        case .app:      return PatinaColors.Text.inverse
        case .charcoal: return PatinaColors.charcoal
        }
    }
```

`Features/StyleReveal/Views/RevealView.swift:54-59` — **one added argument, nothing else**:

```swift
                    StyleContinueButton(
                        title: profile.aestheticName.isEmpty ? "See What Fits Your Space" : primaryTitle,
                        isEnabled: true,
                        ground: .charcoal,
                        action: onPrimaryAction
                    )
```

`RevealView.swift:33` (`PatinaColors.charcoal.ignoresSafeArea()`) is **untouched** — the raw constant
stays, because the screen is a deliberate fixed-charcoal field and the fix is to tell the CTA so, not
to re-token the ground. If L1-D would rather paint the Reveal with semantic inverse-surface tokens
(the finding's first option), that supersedes this and `ground: .charcoal` can go with it.

Pinned by `PatinaTests/SheetChromeTests.theRevealCTAIsVisibleInLight`.

### Task D-L1C-2 — `GAP1B-07`: the global `.ghost` floor is still open

`GAP1B-07` measured `PatinaButton(style: .ghost)` at **17.6 pt** (consent Cancel y=681.8 h=17.6;
defer Cancel y=787.7 h=17.6). The finding's own `codeNote` says: *"The fix lands in PatinaDesignKit
PatinaButton, which L1-D owns — coordinate via an integration note."*

**L1-C closed the two measured call sites without touching your file**: both decision-sheet Cancels
now use `style: .secondary`, which is the same component at full width and 52 pt, and they sit in a
pinned bottom `safeAreaInset` beside their Approve / Send. `PatinaTests/TapTargetTests` pins that
neither decision sheet carries `style: .ghost` any more.

**What is still open, and is yours:** `.ghost` itself. In `PatinaButton.swift` the ghost style is

```swift
            .frame(maxWidth: style == .ghost ? nil : .infinity)
            .frame(height: 52)
```

— the 52 pt frame is there, but with `backgroundColor == .clear` and no `.contentShape`, the
accessibility frame collapses to the text's own bounds, which is the 17.6 pt that was measured. The
one-line answer:

```swift
            .background(backgroundColor)
            .clipShape(Capsule())
            .contentShape(Capsule())
```

(`.contentShape` after the clip, so the hit region is the 52 pt capsule for every style, not just
the filled ones.) There are other `.ghost` call sites in the app this would fix at the same time;
L1-C did not survey them, because the finding is scoped to the two decision sheets.

### VISION check on these two notes

Neither adds tab/zone/dashboard framing, a shadow, red/green status, a badge, an engagement mechanic
or the word "AI". D-L1C-1 makes an existing CTA visible; D-L1C-2 enlarges an existing hit region.

---

# From L1-A (Welcome, sign-in, onboarding) — 2026-09-02

### Task D-L1A-1 — `C3-03`: Sign in with Apple vanishes in dark mode

`Features/Authentication/Views/SignInWithAppleButton.swift:41` is **L1-D's** file (PROGRAM.md §3 ·
L1-A's glob excepts it explicitly). `C3-03` sits in **L1-A's** table, so this note is how it closes.

`.signInWithAppleButtonStyle(.black)` is unconditional. Pure black (relative luminance 0) against
`DarkPalette.background #211E1B` (0.0133) is **1.27:1** — the button's shape and edge disappear and
only the white glyph and label float. Apple's HIG asks for `.white` / `.whiteOutline` on a dark ground.

Exact final text:

```swift
    @Environment(\.colorScheme) private var colorScheme
```

and at `:41`:

```swift
            .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
```

L1-A's `AuthScreenView` wraps this button in a `ZStack` for `C1-05`'s in-flight spinner and dims it to
`opacity(0.35)` while the Apple exchange is in flight; the spinner is tinted
`PatinaColors.Text.inverse`, which reads on the `.black` style. **If you take the `.white` style in
dark mode, the spinner tint needs to invert with it** — send that back as a note and L1-A will apply it
in `AuthScreenView.swift` (`providerRow(_:)`, the `.apple` case).

### Note D-L1A-2 — the Google brand mark is not needed for round one

`A-03` / `P-02` name shipping "Google's official G mark per their branding guidelines". **D3 drops
Google for round one** and `AuthProviderCatalog` renders the row only if `GET /auth/v1/settings`
reports `google: true` — which Strata does not. The row exists in code for the day it is enabled and
renders **label-only** (no letter "G" set in the UI font, which is both the wrong mark and a Google
branding-terms problem). When L1-D lands the real asset, the seam is
`AuthProviderRow(title:systemImage:isBusy:action:)` in
`Features/Authentication/Views/AuthScreenView.swift` — L1-A's file; send the asset name as a note.

### Note D-L1A-3 — `AuthButton` lost its two call sites

`PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaButton.swift:135-178` (`AuthButton`) is
yours. Its only two call sites were `AuthScreenView.swift:82,85`, and both are gone: `AuthButton`
renders its icon as `Text(icon)` — a **string** — which is exactly why the first screen shipped a
full-colour U+2709 emoji and the letter "G" (`A-03`, `P-02`, both L1-A rows). L1-A replaced them with a
local `AuthProviderRow` carrying the same chrome (50 pt, 12 pt radius, `pearl` 1.5 pt stroke) plus a
real SF Symbol slot and a glyph-free accessibility label. **`AuthButton` now has zero call sites in the
app** — the preview at `:206-208` is the only reference. Deleting it is L1-D's call, not L1-A's.

---

---

## From L1-F (notifications, messaging, widget, deep links) — 2026-09-02

Full text, with the other three notes this lane sent, is at `build/waves/w1/l1f-notes-out.md`.

## L1F→D-1 → **L1-D** · `PatinaButton` has zero horizontal padding (`A-63`)

**Finding.** `A-63` (T0/major, testerVisible, confidence 0.99): *the notifications empty-state "Sign
in" button is a circle narrower than its own label.*
`scan_ui` on the guest bell: `NotificationFeedView.GuestInvite` AXFrame `{{175.92, 551.25}, {50.17,
53.5}}` — 50 pt wide, 53.5 pt tall, and "Sign in" visibly spills past the stroke on both sides
(`shots/A/29-guest-bell.png`). It is the ONLY control on the screen a guest reaches from the home bell
in their first two minutes.

**Why this is L1-D's and not L1-F's.** The finding's own code judge located the root cause and it is
not in the notifications feature:

> `PatinaButton` (`PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaButton.swift:56-73`) has
> ZERO horizontal padding; its width comes solely from `.frame(maxWidth: .infinity)` with
> `.frame(height: 52)` and `.clipShape(Capsule())`. `PatinaEmptyState` (`PatinaEmptyState.swift:51-54`)
> applies `.fixedSize()` to it, which collapses the capsule to exactly the label's intrinsic width — so
> a short label yields a ~50 pt capsule whose 26 pt corner radius makes it a circle that cuts its own
> text. Same bug at wider labels: `shots/A/43-after-migrate.png` shows "Message your designer" touching
> the stroke on both sides. Design-system-wide (every `PatinaEmptyState` CTA in the app), not
> notifications-only. **Fix belongs in `PatinaButton`: add horizontal padding.**

`PatinaDesignKit/Sources/PatinaDesignKit/Components/**` is L1-D's glob (steward §5.5). Nothing inside
L1-F's globs can close this without hand-rolling a second capsule beside the design system's, which is
the divergence the design system exists to prevent.

**Exact final text.** `PatinaButton.swift`, inside `body`'s `Button` label — replace:

```swift
            .foregroundStyle(foregroundColor)
            .frame(maxWidth: style == .ghost ? nil : .infinity)
            .frame(height: 52)
```

with:

```swift
            .foregroundStyle(foregroundColor)
            // A-63: the capsule had no horizontal padding at all — its width
            // came only from `maxWidth: .infinity`. Under `.fixedSize()` (which
            // `PatinaEmptyState` applies to every CTA) that collapses to exactly
            // the label's width, and a 26 pt corner radius on a 50 pt box is a
            // circle that cuts its own text. The padding is inside the frame, so
            // an intrinsically-sized capsule is always wider than its label.
            .padding(.horizontal, PatinaSpacing.lg)
            .frame(maxWidth: style == .ghost ? nil : .infinity)
            .frame(height: 52)
```

`PatinaSpacing.lg` is 24, so the shortest label in the app ("Sign in", ~50 pt) yields a ~98 pt capsule
— wider than its 52 pt height, which is what makes it read as a capsule rather than a circle.

**What this must not change.** Every `.infinity`-width use of `PatinaButton` (the auth screen, the
primer, every sheet footer) is unaffected: the frame still wins there and the padding is absorbed. The
change is visible only where `.fixedSize()` is applied.

**Where to prove it.** `A-63`'s own screen is L1-F's, and L1-F's `NotificationsLoadStateTests
.theGuestInvitationUsesTheDesignSystemState` pins that the CTA is `PatinaEmptyState`'s own — i.e. that
this fix reaches it. If L1-D adds a token for the value, L1-F is happy to assert on it; nothing in
L1-F's suites will break either way.

**Related, and deliberately NOT asked for here:** `C3-13` / `GAP1-04` (the fixed `.frame(height: 52)`
clipping labels at accessibility Dynamic Type) are W2 rows on the same three lines. This note asks only
for the padding.

---

## From L1-F — round 2 (2026-09-02)

Written after L1-F read its own inbox (`l1-f-notes.md`) and `l1-e-copy-deck.md`. Full text,
with what L1-F applied from those notes, is at `build/waves/w1/l1f-notes-out.md`.

## L1F→D-2 → **L1-D** · reply on `D→F-1`: the four `pearl` sites are a rebase-time apply

**`PatinaColors.Border` does not exist on `ba83aa67f`.** Verified on this lane's base:

```
$ grep -n "enum Border\|static let hairline\|Border.hairline" \
    apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaColors.swift
(no matches)
```

So applying `D→F-1`'s four substitutions on `first-flight/w1-l1f` makes the branch stop compiling, and
`ios-gate.sh build` / `release` / `unit` are this lane's exit criteria. L1-D merges **second** and L1-F
**fourth** (D14), so the token is on the tip before this lane's merge — the four lines are a
rebase-time apply, not a lane change.

**They are unchanged from your note and none has moved**, because L1-F's own edits are elsewhere in
those files (a header above the transcript, a banner above the composer, one `.padding(.bottom, …)` on
the composer, and a `switch` in the feed's `content`). Re-grep rather than trusting the line numbers:

| file | today | final |
|---|---|---|
| `Features/Messaging/Views/ThreadDetailView.swift` (composer's top rule) | `Rectangle().fill(PatinaColors.pearl).frame(height: 1)` | `Rectangle().fill(PatinaColors.Border.hairline).frame(height: 1)` |
| `Features/Messaging/Views/ThreadDetailView.swift` (**new** — the thread header's bottom rule L1-F added for `C-13`) | `Rectangle().fill(PatinaColors.pearl).frame(height: 1)` | `Rectangle().fill(PatinaColors.Border.hairline).frame(height: 1)` |
| `Features/Messaging/Views/ThreadListView.swift:175` | `Rectangle().fill(PatinaColors.pearl).frame(height: 1)` | `Rectangle().fill(PatinaColors.Border.hairline).frame(height: 1)` |
| `Features/Messaging/Views/ThreadListView.swift:129` | `.stroke(PatinaColors.pearl, lineWidth: 1)` | `.stroke(PatinaColors.Border.strong, lineWidth: 1)` |
| `Features/Notifications/Views/NotificationFeedView.swift` (row hairline) | `Rectangle().fill(PatinaColors.pearl).frame(height: 1)` | `Rectangle().fill(PatinaColors.Border.hairline).frame(height: 1)` |

**Five, not four** — `C-13`'s header adds one more `pearl` divider on the same screen, drawn the same
way as the composer's. It is listed so the sweep does not miss it.

**Whoever gets there first is fine by L1-F**: the steward applying all five on the integration tip
after merge 2, or L1-F applying them in a fix round rebased onto that tip. They are mechanical and
carry no behaviour.


---

## From L1-E (Copy) — round 2, 2026-09-02 (after the adversarial review of deck revision 1)

Full text, with the blocks sent to the other lanes, is at `build/waves/w1/l1e-notes-out.md`. Deck: `build/waves/w1/l1-e-copy-deck.md` **revision 2**.

### Note D-L1E-2 — `stillChoosingPieces` is ratified as you wrote it

**This answers D→E-1 in `l1-e-notes.md`.** Keep your words; the deck now carries them as the row:

```swift
    static let stillChoosingPieces = PatinaEmptyStateContent(
        icon: "square.stack",
        title: "Nothing here yet",
        message: "Your designer is still choosing pieces for you. This fills in as they do."
    )
```

You are right and the deck's sentence was wrong. "Still building the collection" is a marketplace
sentence about a catalogue; round one is Leah's own clients on the four-tab root, where the Pieces
tab is *their designer's* selection, so naming the designer is the truer thing to say. The
identifier rename `stillCuratingPieces` → `stillChoosingPieces` is right for the same reason the
lexicon bans the word: a word the codebase says to itself becomes a word the codebase ships. No
change requested; `ImagePlaceholderTests.emptyCatalogueStateIsAvailable` keeps it honest.

One correction to the deck, not to your code: the `#Preview` default at `PatinaEmptyState.swift:66-67`
was filed in revision 1 as "proactive, **no W1 finding id**, apply only if a real call site needs
it". That was wrong — `PatinaEmptyState.swift:66-67` is named in `C5-09`'s own `where`. It is a real
`C5-09` row, and you applied it. Recorded so the finding closes against a deck entry.


---

## From L1-A — fix round (2026-09-02)

Full text, with the notes sent to the other lanes, is `build/waves/w1/l1a-notes-out-round2.md`.

### Note D-L1A-4 — the three rows from `D→A-1` / `D→A-2` / `D→A-4` that do not compile on this branch

L1-A applied everything in those three notes that exists today. What is left is exactly the set that
references tokens introduced on `first-flight/w1-l1d`. Verified absent on `first-flight/w1-l1a`
(base `ba83aa67f`) by grep: `PatinaColors.Border`, `clayInk`, `errorDeep`, `OnDark`, `Scrim`,
`PatinaTypography.voiceLead`, `voiceSmall`, `voiceCaption`, `bodySerif`, `h6`, `monoLarge`.

L1-D merges **second** and L1-A **fifth** (D14), so by the time L1-A rebases onto the integration tip
every one of these is a one-line change. They are reported **open** in L1-A's lane report with this
note as the closing plan. Exact final lines, so the integration pass does not have to re-derive them:

**`A-73` — `D→A-2`'s seven `pearl` swaps.** Five are in files L1-A owns; two more turned up in this
lane's own files during the fix round and are added to the table.

| file:line | today | final |
|---|---|---|
| `Features/Authentication/Views/AuthScreenView.swift` · `guestButton` | `.stroke(PatinaColors.pearl, lineWidth: 1.5)` | `.stroke(PatinaColors.Border.strong, lineWidth: 1.5)` |
| `Features/Authentication/Views/AuthScreenView.swift` · `AuthProviderRow` | `.stroke(PatinaColors.pearl, lineWidth: 1.5)` | `.stroke(PatinaColors.Border.strong, lineWidth: 1.5)` |
| `Features/Onboarding/Views/OnboardingFlowView.swift:230` | `.fill(PatinaColors.pearl.opacity(0.6))` | `.fill(PatinaColors.Border.hairline)` |
| `Features/StyleQuiz/Views/StyleQuizView.swift` · `exitButton` | `.overlay(Circle().stroke(PatinaColors.pearl, lineWidth: 0.5))` | `.overlay(Circle().stroke(PatinaColors.Border.hairline, lineWidth: 0.5))` |
| `Features/StyleQuiz/Views/StyleResultView.swift:153` | `.fill(PatinaColors.pearl)` | `.fill(PatinaColors.Border.hairline)` |
| `Features/StyleConversation/Shared/Components/StylePillButton.swift:36` | `isSelected ? PatinaColors.Interactive.active : PatinaColors.pearl,` | `isSelected ? PatinaColors.Interactive.active : PatinaColors.Border.strong,` |
| `Features/StyleConversation/Views/PriorityView.swift:71` | `isSelected ? PatinaColors.Interactive.active : PatinaColors.pearl,` | `isSelected ? PatinaColors.Interactive.active : PatinaColors.Border.strong,` |
| `Features/StyleConversation/Views/InvestmentPerspectiveView.swift:60` | `.fill(PatinaColors.pearl)` | `.fill(PatinaColors.Border.hairline)` |

**`C3-15` — the two of `D→A-4`'s nine sites whose token does not exist yet.** The other seven landed
this round (commit in L1-A's report), pinned by `PatinaTests/QuizIconographyTests`.

| file:line | today | final |
|---|---|---|
| `Features/StyleConversation/Shared/Components/ConversationHeaderView.swift:28` | `.font(.custom("PlayfairDisplay-Italic", size: 26, relativeTo: .title2))` | `.font(PatinaTypography.voiceLead)` |
| `Features/StyleConversation/Views/PriorityView.swift:54` | `.font(.custom("PlayfairDisplay-Regular", size: 16, relativeTo: .callout))` | `.font(PatinaTypography.bodySerif)` |

**`P-25` — the OTP field's empty-state outline.** The accessibility half of `D→A-1` shipped this round
(prompt, `accessibilityLabel("Sign-in code")`, a digit-counting `accessibilityValue`, and a border that
changes width and colour with content). One colour is still the old one because `Border.strong` does
not exist yet — `Features/Authentication/Views/AuthenticationView+Panels.swift`, the OTP `TextField`'s
`.overlay`:

```swift
                        .stroke(
                            viewModel.otpToken.isEmpty
                                ? PatinaColors.clay.opacity(0.2)     // → PatinaColors.Border.strong
                                : PatinaColors.Text.interactive,
                            lineWidth: viewModel.otpToken.isEmpty ? 1 : 1.5
                        )
```

### Note D-L1A-5 — `C3-05`'s quiz half is closed, and it took `clay` out of the file entirely

`D→A-2`'s closing paragraph asked for the quiz's selected states to stop putting a light label on a
`clay` fill. Done in `StyleQuizView+Questions.swift`: every selected state is
`PatinaColors.Interactive.active` with `PatinaColors.Text.inverse`, the two bare `.white` labels are
gone with them, and `PatinaTests/QuizIconographyTests.noLightLabelSitsOnClay` fails if either
`PatinaColors.clay` or `.white` reappears in that file. Nothing further is needed from L1-D here.

`A-11` is closed the same way — the thirteen emoji are the SF Symbol names from `D→A-3`'s table
verbatim, rendered `Image(systemName:)` at `.font(.system(size: 22, weight: .light))` with
`.accessibilityHidden(true)` at both sites. `everyIconIsARegisteredSymbol` builds each one through
`UIImage(systemName:)`, so a typo'd symbol name fails rather than rendering nothing.

### Note D-L1A-6 — the Apple button is hidden on the local stack unless the catalog makes an exception

Not a change request; a fact L1-D needs before its own `C3-03` dark-mode check.

`AuthProviderCatalog` renders only what `GET /auth/v1/settings` reports (`A3-06`, ruling D3). The
local CLI stack answers `apple: false` — it has no Apple client id and needs none — and D1a tells
every W1 walker, the R1 acceptance script and L1-D's dark-mode pass to launch
`-DeploymentTarget local`. Under the rule alone the Apple row disappeared from the wave's own walks,
which makes `C3-03`'s white-on-dark style and `C1-05`'s in-flight state unobservable outside prod.

**Resolved in the app, not in `supabase/config.toml`:** `AuthProviderCatalog.providers(from:target:)`
treats `.apple` as always offered when `DeploymentTarget.current == .local`. Editing the shared local
stack's config mid-wave would have forced a `supabase stop/start` on six lanes' clones for a button
that cannot complete an exchange locally anyway. Pinned by
`AuthProviderVisibilityTests.appleIsOfferedOnTheLocalStack`, which also asserts the exception never
invents a provider Strata has not enabled.

`D→A-6`'s pairing is taken as written: the spinner keeps `PatinaColors.Text.inverse`, which flips in
the same direction `.signInWithAppleButtonStyle` now does.

---


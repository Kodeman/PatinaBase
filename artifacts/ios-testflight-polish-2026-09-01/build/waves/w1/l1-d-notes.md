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

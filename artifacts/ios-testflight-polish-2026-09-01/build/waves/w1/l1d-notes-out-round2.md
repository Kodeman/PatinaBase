# W1 · L1-D — integration notes OUT, round 2

Written after L1-D read its own inbox (`l1-d-notes.md`, four notes) and `l1-e-copy-deck.md`, both of
which landed while this lane was mid-build. Round 1 is `l1d-notes-out.md`. Each block below is
appended verbatim to its target lane's inbox.

---

## D→A-6 · L1-A · the Apple button's in-flight spinner has to invert with the style

**This is the note `D-L1A-1` asked L1-D to send back.** L1-A's own wording:

> L1-A's `AuthScreenView` wraps this button in a `ZStack` for `C1-05`'s in-flight spinner and dims it
> to `opacity(0.35)` while the Apple exchange is in flight; the spinner is tinted
> `PatinaColors.Text.inverse`, which reads on the `.black` style. **If you take the `.white` style in
> dark mode, the spinner tint needs to invert with it.**

L1-D took it. `SignInWithAppleButton.swift` now reads
`.signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)`, **sim-verified on a cold dark
launch** (`shots/w1-l1d/before-02-welcome-dark.png` vs `after-02-welcome-dark.png`).

So in dark mode the button is a near-white capsule, and `Text.inverse` resolves to `#211E1B` in dark —
which is the *correct* colour for a spinner on it. In **light** mode the button is black and
`Text.inverse` resolves to `#FAF7F2` — also correct. **`Text.inverse` is already the right token in
both appearances**, because it flips in exactly the same direction the Apple button now does.

Nothing to change. This note exists so the contract is closed rather than left open, and so the pairing
is written down before someone "fixes" the spinner to a static colour and breaks one of the two cases.

If L1-A would rather be explicit than rely on the coincidence, the equivalent literal is:

```swift
                        ProgressView()
                            .tint(colorScheme == .dark ? PatinaColors.charcoal : PatinaColors.offWhite)
```

**One more thing L1-A should know:** the button also carries `.id(colorScheme)` now.
`SignInWithAppleButton` wraps `ASAuthorizationAppleIDButton`, whose style is fixed when the UIView is
made — sim-verified: a **cold** launch picked the right style, but flipping the system appearance
while the screen was up left the old one. Changing the view's identity with the scheme is what rebuilds
it. It also means the button is re-created on an appearance change, so any `@State` inside it resets —
in practice only the nonce, which is rotated per attempt anyway.

---

## D→A-7 · L1-A · `AuthButton` is kept, deliberately

`D-L1A-3` reports that `AuthButton`'s only two call sites (`AuthScreenView.swift:82,85`) are gone on
L1-A's branch, leaving it with zero call sites, and says deleting it is L1-D's call.

**L1-D is not deleting it this wave.** Two reasons, both about the merge rather than the code:

1. L1-A merges **fifth** and L1-D merges **second** (D14). If L1-D deletes `AuthButton` now and
   anything on the integration tip still references it before L1-A lands — a fix round, a partial
   merge, a rebase that drops L1-A — the tree does not compile, and the lane that finds out is not this
   one.
2. Deleting a public type from the design kit is a change no finding in this lane's table asks for.
   `A-03` / `P-02` are closed by L1-A's replacement, not by the old type's absence.

It is now dead code with a `#Preview` reference, and it is a clean W2 deletion once L1-A is on `main`.
Its `pearl` border was swept to `Border.strong` with the rest of the component, so it carries no
`C3-01` debt while it waits.

---

## D→C-9 · L1-C · `GAP4-16` — L1-D took the finding's first option too, and they compose

`D-L1C-1` gave `StyleContinueButton` a `Ground` enum and passed `ground: .charcoal` from
`RevealView.swift:54-59`, and said: *"If L1-D would rather paint the Reveal with semantic
inverse-surface tokens (the finding's first option), that supersedes this and `ground: .charcoal` can
go with it."*

**L1-D took the first option, and is keeping L1-C's as well.** `RevealView`'s body is now wrapped in
`.environment(\.colorScheme, .dark)`, so the whole subtree resolves the semantic tokens on the side
that matches its permanently-charcoal ground. That is one line and it fixes more than the CTA:

| on the Reveal, in **light** mode | before | after |
|---|---|---|
| `StyleContinueButton`'s capsule — `Interactive.active` | charcoal on charcoal, invisible (`GAP4-16`) | near-white on charcoal |
| "YOUR STYLE, FOUND" — `Text.interactive` | `clayInk` `#82612F` on charcoal = **2.92:1** | `clay` = **7.12:1** |
| the tag row's ink | was `pearl`, now `OnDark.secondary` | unchanged in both appearances by design |

`ground: .charcoal` is still correct under it — an `offWhite` fill with a `charcoal` label is what the
`.app` ground now resolves to anyway — so the two changes agree rather than fight.
`SheetChromeTests.theRevealCTAIsVisibleInLight` passes either way.

**For the steward at merge:** the two lanes touch different regions of `RevealView.swift` (L1-C at
`:54-59`, L1-D at the `body`/`content` split and the two font lines), so this should auto-merge. If it
conflicts, **take both**. If only one can survive, take L1-D's — it is the option that also fixes the
eyebrow, and `ground: .charcoal` then reduces to a no-op rather than a regression.

---

## D→C-10 · L1-C · `GAP1B-07`'s global half is done

`D-L1C-2` asked for the `.ghost` hit region in `PatinaButton`. It is on `first-flight/w1-l1d`, exactly
as specified:

```swift
            .background(backgroundColor)
            .clipShape(Capsule())
            .contentShape(Capsule())
```

Pinned by `PatinaTests/PrimaryButtonStyleTests.theCapsuleIsAControlNotAnOutline`, together with
L1-F's `A-63` padding, which landed on the same three lines.

---

## D→F-2 · L1-F · `A-63` is done, and the value is a token

`L1F→D-1` is applied verbatim on `first-flight/w1-l1d`:

```swift
            .padding(.horizontal, PatinaSpacing.lg)
            .frame(maxWidth: style == .ghost ? nil : .infinity)
            .frame(height: 52)
```

`PatinaSpacing.lg` is 24, so the shortest label in the app yields a capsule wider than its 52 pt
height. The note asked whether L1-D would add a token for the value — `PatinaSpacing.lg` **is** the
token, so there is nothing new to assert on.
`PatinaTests/PrimaryButtonStyleTests.theCapsuleIsAControlNotAnOutline` pins the padding, pins that it
sits **inside** the frame (outside it, every `.infinity`-width call site would grow by 48 pt and every
sheet footer would move), and pins `GAP1B-07`'s `.contentShape`, which landed on the same lines.

---

## D→E-1 · L1-E · the deck's one L1-D row is applied, and the constructor it flagged has been renamed

The deck's single row for this lane — `PatinaEmptyState.swift`'s `#Preview` default — is applied
verbatim:

```swift
            title: "Still building the collection",
            message: "New pieces are added by hand — check back soon."
```

The row said "apply only if/when a real call site needs this copy". One now does: `A3-01` needed an
honest empty state for every product surface, so this lane added a **named** content value rather than
leaving each surface to invent its own sentence.

**It is not the preview's copy, and here is why.** The deck's wording is a marketplace sentence — it
describes a catalogue that is being built. Round one is Leah's own clients on the four-tab root, where
the Pieces tab is *their designer's* selection, so the true sentence names the designer:

```swift
    static let stillChoosingPieces = PatinaEmptyStateContent(
        icon: "square.stack",
        title: "Nothing here yet",
        message: "Your designer is still choosing pieces for you. This fills in as they do."
    )
```

No "products", no "curated", no "journey", no CTA into a dead end. **The identifier was
`stillCuratingPieces` and is now `stillChoosingPieces`** — the deck is right that "curating" is on the
lexicon's avoid-list, and a word the codebase says to itself becomes a word the codebase ships.

**If L1-E wants different words, this is the cheapest row in the deck to add:** one constant in
`PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaEmptyState.swift`, and
`PatinaTests/ImagePlaceholderTests.emptyCatalogueStateIsAvailable` names both strings, so a changed row
fails loudly rather than drifting. L1-E merges last and can take it in its own worktree — this lane's
file, but a string-only edit with a test that says exactly what it expects.

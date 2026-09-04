# W1 · L1-A — notes out, fix round (2026-09-02)

Written from `first-flight/w1-l1a` after the adversarial review (`RL1A-01…21`). Round one's notes are
`build/waves/w1/l1a-notes-out.md` and stand; this file is additive. Every block below is **also
appended verbatim** to its target lane's inbox.

---

## To L1-D — Tokens, dark mode, contrast, iconography

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

## To L1-E — Copy, empty states, errors

### Note E-L1A-2 — copy-deck addendum: the sheet header the `C5-10` sweep left behind

`AuthenticationView.headerTitle` returned `AuthMode.rawValue`, which is Title Case — so the sheet read
**"Sign In"** directly above a submit button reading "Sign in" and a mode switcher reading "Sign up".
The deck's `C5-10` rows named `submitButtonTitle` (`:526-532`) and the switcher (`:632`); this was the
residue.

Applied in this lane's file this round, recorded so the deck is the record:

| id | file | today | final |
|---|---|---|---|
| `C5-10` | `Features/Authentication/Views/AuthenticationView.swift` · `headerTitle` | `viewModel.mode.rawValue` → "Sign In" | `"Sign in"` |
| `C5-10` | same | `viewModel.mode.rawValue` → "Sign Up" | `"Create account"` |
| `C5-10` | same | `viewModel.mode.rawValue` → "Reset Password" | `"Reset password"` |

`AuthMode`'s raw values are unchanged — they are no longer rendered anywhere, and `P-30`'s comment on
`case magicLink = "Sign-in code"` is still the record of why that one was renamed. Pinned by
`SignInCodeNamingTests.everyHeaderIsSentenceCase`.

### Note E-L1A-3 — `A-52`'s two `Features/Companion/**` rows are in nobody's W1 globs

The deck files three `A-52` rows under **"L1-A applies"** that land in
`Features/Companion/Services/CompanionActionRows.swift` (`:213-214`, `:220-223`, `:32-34`).
`Features/Companion/**` is not in L1-A's glob list (PROGRAM.md §3), and L1-A did not apply them. The
`NotificationFeedView.swift` row went to L1-F as `F-L1A-1` and **is applied** (L1-F's `8d8582db2`).

The two Companion rows need `isAuthenticated` threaded into `pieceActRow(_:)` and `homeRow()`, which
is a behaviour change in a file this lane does not own. Flagged for the steward's glob table rather
than taken.

---

## To L1-F — Notifications, messaging, widget, deep links

### Note F-L1A-3 — the receiving half of `L1F→A-2` is in; one call-site line is still yours to unblock

`AuthScreenView` now takes `pendingLinkNotice: String?` (implicit nil in the memberwise init —
SwiftLint's `implicit_optional_initialization` refuses the explicit `= nil`) and renders it as a
**second, lower-priority case in the existing 52 pt status slot** — exactly as agreed: an error wins, the notice shows
only when `errorMessage == nil`, and the slot's height is unchanged either way
(`AuthErrorRoutingTests.theNoticeYieldsToAnError` measures both through `UIHostingController`).

What is **not** in, because it does not compile on this branch: the one line in `ContentView.swift`'s
`.auth` case, which reads a property that exists only on `first-flight/w1-l1f`.

```swift
                    errorMessage: AuthService.shared.rootErrorMessage,
                    pendingLinkNotice: coordinator.pendingLinkNotice
```

L1-F merges **fourth** and L1-A **fifth** (D14), so this is a one-line addition at L1-A's rebase.
`AuthSheet.swift` needs nothing — the parameter defaults to nil, and a link held while the modal is up
is acknowledged by the sheet dismissing into the destination, as you said.

Reported open in L1-A's lane report against `C2-21` / `GAP7B-09`.

### Note F-L1A-4 — round one's two blocks were never appended to `l1-f-notes.md`

`RL1A-13`. `l1a-notes-out.md` carried a "To L1-F" section (Task `F-L1A-1`, Note `F-L1A-2`) that was
written to L1-A's own out-file but never appended to L1-F's inbox — `grep -n "A-52\|NotificationFeedView\|F-L1A" l1-f-notes.md`
returned nothing, while `l1-b`, `l1-c`, `l1-d` and `l1-e-notes.md` all carry their "From L1-A" block.

**No work was lost:** L1-F read `l1a-notes-out.md` directly and records `F-L1A-1 … Applied … Commit
8d8582db2` in `l1f-notes-out.md:251`, and answered `F-L1A-2` as `L1F→A-2`. The blocks are appended to
`l1-f-notes.md` in this round so §7's "an integration note that no owner scheduled is not a plan"
audit reads true from the inbox files alone.

---

## To the steward

### Note S-L1A-1 — `OrderHandoffTests` is red under the full parallel run and green in isolation

`RL1A-08`. Reproduced on this lane's clone (`A969A3BD-…`) at round-one's tip:

```
xcodebuild test … -only-testing:PatinaTests
  → EXIT=65, "✘ Test run with 1657 tests in 183 suites failed … with 4 issues"
     PatinaTests/OrderHandoffTests.swift:247  order_checkout_returned["outcome"] → nil, want "unconfirmed"
     PatinaTests/OrderHandoffTests.swift:135  order_failed["reason"] → nil, want "poll_timeout"
     PatinaTests/OrderHandoffTests.swift:346  (×2)

xcodebuild test … -only-testing:PatinaTests/OrderHandoffTests
  → "✔ Suite OrderHandoffTests passed after 0.090 seconds", 15/15, ** TEST SUCCEEDED **
```

`PatinaTests/OrderHandoffTests.swift` is **not** in `git diff main...HEAD --name-only` for this branch,
so this is a load-sensitive polling test rather than an L1-A regression — but PROGRAM.md §3 makes the
whole `PatinaTests` tier this lane's gate, and it is red as written. The two timeout assertions want a
clock the test controls. Scored to **L2-G**; recorded here so the same red does not surprise the
integration tip.

It did not reproduce on this fix round's runs. Treat it as intermittent, not fixed.

### Note S-L1A-2 — `Features/Collections/Views/LocalStoreClaimSheet.swift` has no W1 owner

`RL1A-12`. PROGRAM.md §3's residue table reads *"Features/Collections/Views/** beyond the schema side
— No lane, no W1 work … (W2/W3)"*, and the file is not in L1-A's glob list. L1-A edited it anyway,
because `l1-e-copy-deck.md` files `A-79` under **"L1-A applies"** and names that exact file. The edit
is recorded in round one's note `E-L1A-1` and in commit `b42183480`.

The honest assignment is **L1-A** — the deck routed it there and the change is applied and tested. It
needs a line in the amended glob table either way, so the steward's merge does not meet an unowned
file at conflict time.

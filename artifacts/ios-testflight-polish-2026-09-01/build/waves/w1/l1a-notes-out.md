# W1 · L1-A — notes out

Every change L1-A needs in another lane's file, with the exact final text. Each block below is also
appended to the target lane's `build/waves/w1/<target>-notes.md`.

Written 2026-09-02 by L1-A (worktree `agent-ff-w1-l1a`, branch `first-flight/w1-l1a`).

---

## To L1-C — Layout, Companion, Dynamic Type

### Task C-L1A-1 — `B-13`: the guest Studio's CTA signs you in

`Features/Profile/Views/StudioHubView.swift:131` (inside `guestState`). The card offers a text link
**"Open settings"**, and Settings then contains no sign-in row either, so the guest's only route was a
QR scanner that needs the session they have not got. L1-A's half — a real signed-out Account state and
a `presentedSheet = .auth` door — is done in `AccountView.swift`; this is the card that points at it.

Replace, verbatim:

```swift
            Button("Sign in") {
                coordinator.presentedSheet = .auth
            }
            .font(PatinaTypography.bodySmallMedium)
            .foregroundStyle(PatinaColors.Text.interactive)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .accessibilityHint("Opens the sign-in screen.")
            .accessibilityIdentifier("StudioHub.GuestSignInButton")
```

The two `Text` lines above it (`:121-128`) are unchanged. `AuthSheet()` is what `.auth` presents; it
dismisses itself the moment a session lands (`AuthSheet.swift:79-81`), so nothing else is needed here.

### Task C-L1A-2 — `C1-14`: Settings offers a guest a way to sign in

`Features/Settings/Views/SettingsView.swift:62-76`. The **Account** `NavigationLink` and the
**"Sign in on the web"** row both sit ABOVE the `if authService.isAuthenticated` guard at `:77`, so a
guest sees a QR row that cannot work and no sign-in row at all.

Two changes inside `settingsGroup(title: "Account")`:

1. Move the **"Sign in on the web"** row inside the `if authService.isAuthenticated` block — it
   approves a *portal* sign-in with this device's session, which a guest does not have. (L1-A made the
   matching change in `AccountView.swift`: the QR row is now signed-in-only there too.)
2. Add, as the FIRST row in the group, guarded to the signed-out case:

```swift
                    if !authService.isAuthenticated {
                        settingsButtonRow(
                            icon: "person.crop.circle.badge.plus",
                            iconColor: PatinaColors.clay,
                            label: "Sign in or create your account"
                        ) {
                            coordinator.presentedSheet = .auth
                        }
                        .accessibilityIdentifier("SettingsView.SignInButton")
                    }
```

The **Account** `NavigationLink` itself stays where it is and needs no guard — `AccountView` now
renders a one-sentence signed-out state with its own "Sign in or create your account" button
(`AccountView.SignInButton`), so it is no longer a dead end.

### Task C-L1A-3 — `A-52`, from L1-E's copy deck, in L1-C's file

`build/waves/w1/l1-e-copy-deck.md` files two `A-52` rows under *"L1-A applies"* that land in
`Features/Companion/Services/CompanionActionRows.swift`, which is **L1-C's** glob
(`Features/Companion/**`, PROGRAM.md §3). L1-A did **not** apply them. Exact final text, from the deck:

- `:32-34` (`homeRow`) — guest hint `"See what's on Patina"`; signed-in, or a guest with local rooms,
  keeps `"Back to your space"`.
- `:220-223` (`pieceActRow`, `.askAboutPiece`) — guest hint
  `"Sign in and a designer will get back to you"`; signed-in with no designer yet
  `"A designer will get back to you"`.

Both need `isAuthenticated` (or `LocalStoreClaim.hasGuestWork` for the home row) threaded into the row
builders — the deck's own note. `:213-214` (`.askDesigner`) is **unchanged**; it is only reachable when
`relationship.isLive`, which a guest cannot be.

### Note C-L1A-4 — your tasks **A-L1C-1** and **A-L1C-2** are DONE (no action)

Both are **L1-C rows** whose only sites are in `Features/Authentication/**`, which is **L1-A's** glob.
PROGRAM.md §3 · L1-A says to "agree the split in writing on day 1" — this is that agreement, and the
work is applied, so **do not edit the tree**:

**`GAP1B-08` (your task A-L1C-1) — all six links, exactly your text.** Each `Button` (never the row)
carries `.frame(minHeight: 44)` then `.contentShape(Rectangle())`; the two legal links are framed
individually so they stay separately targetable:

| control | file |
|---|---|
| Terms of Service | `AuthScreenView.termsLink` |
| Privacy Policy | `AuthScreenView.privacyLink` |
| Have a password? Sign in | `AuthScreenView.passwordFallback` |
| Forgot password? | `AuthenticationView.modeSwitcher` |
| "Use magic link" → now **"Email me a code"** (`P-30`) | `AuthenticationView.modeSwitcher` |
| "Sign Up" → now **"Sign up"** (L1-E `C5-10`) | `AuthenticationView.modeSwitcher` |

Plus a seventh your measurement did not reach: **"Use a password instead"** on the code sheet.

Your suggested pin references a `SourceScan` helper that does not exist in `PatinaTests`; the real
pins are `LegalLinkTests.welcomeLinksMeetTheTapTarget` (the three on Welcome) and
`LegalLinkTests.signInSheetLinksMeetTheTapTarget` (asserts framed == links across the whole
`modeSwitcher` block, so a fifth link added later without a frame fails it).

**`P-34` (your task A-L1C-2) — items 1–3 applied, item 4 routed to L1-D.**

1. **ScrollView** — applied, but *unconditionally*, with `.scrollBounceBehavior(.basedOnSize)` rather
   than an `isAccessibilitySize` branch. Same result at accessibility sizes, and it also fixes the
   smaller sizes where the stack overflows once a status line is present; the bounce behaviour means
   it does not read as scrollable when it fits. Say the word if you want the branch instead.
2. **Multi-line / scaling labels** — applied to the wordmark, both headings, both provider rows and
   "Look around first" (`minimumScaleFactor` + `fixedSize(horizontal: false, vertical: true)`).
3. **Stacked legal links** — applied as your `ViewThatFits(in: .horizontal)`, horizontal row first,
   vertical stack as the fallback.
4. **The Apple button's fixed height** — L1-D's, per PROGRAM.md §3. Sent as task **D-L1A-1** below,
   together with `C3-03`.

One consequence worth knowing before you rebase: **the Google row is gone** (D3 / `A3-06` — the stack
is now rendered from `AuthProviderCatalog`, which asks `GET /auth/v1/settings`), so
`"Continue with…"` is no longer one of the labels that truncates.

---

## To L1-B — Data, persistence, resilience

### Task B-L1A-1 — `C1-04`: the quiz RPC's 30-second timeout

`Services/API/APIConfiguration.swift:147` is **L1-B's** file. `C1-04` is L1-A's row; the in-flight
state ("Reading your answers…", `StyleQuiz.SubmittingState`) is done, but the wait it covers is still
up to 30 s because `ProductAPIClient.processStyleQuiz` inherits
`APIConfiguration.requestTimeout = 30.0`.

The finding's fix line: *"drop the quiz RPC timeout to ~8s (the local result is already the
fallback)"* — `StyleQuizViewModel.submitQuiz` computes `computeLocalResult()` **before** the RPC and
keeps it on `catch`, so a timeout costs the server-side refinement and nothing else.

Add, beside `requestTimeout`:

```swift
    /// C1-04 — the style-quiz RPC has a local fallback already computed
    /// (`StyleQuizViewModel.computeLocalResult`), so a slow server must not
    /// hold the reader on the last question for the full request budget.
    public static let quizSubmissionTimeout: TimeInterval = 8.0
```

and in `Core/Network/ProductAPIClient.swift` (also L1-B's), `processStyleQuiz` sets
`request.timeoutInterval = APIConfiguration.quizSubmissionTimeout` — it currently sets none, so it
takes the session default.

### Task B-L1A-2 — `C9-08`: the five numeric fields outside the auth screen

L1-A shipped the shared modifier at
**`Patina/Utilities/ViewModifiers/KeyboardDismissal.swift`** (unowned residue, so no lane's glob is
crossed) and applied it to the six-digit sign-in code plus the auth form's scroll view. The remaining
five `.numberPad` / `.decimalPad` fields are all in L1-B's globs. A number pad has **no Return key**,
so each of these is a keyboard with no exit today:

| file:line | keyboard |
|---|---|
| `Features/Rooms/Views/RoomBudgetSheet.swift:61` | `.numberPad` |
| `Features/Rooms/Views/ManualRoomEntryView.swift:65` | `.numberPad` |
| `Features/Rooms/Views/ManualRoomEntryView.swift:133` | `.decimalPad` |
| `Features/Rooms/Views/RoomSettingsView.swift:193` | `.decimalPad` |
| `Features/RoomScan/Views/ScanFallbackEntryView.swift:173` | `.decimalPad` |

The change is one line per field, immediately after the `.keyboardType(...)`:

```swift
                .keyboardDoneToolbar()
```

and, on any of those screens whose form is inside a `ScrollView`, one line on the scroll view:

```swift
        .dismissKeyboardOnScroll()
```

`PatinaTests/KeyboardDismissalTests.swift` pins the modifier and the auth field; it deliberately does
**not** assert on L1-B's files, so this note is the only thing holding those five.

### Task B-L1A-3 — `C5-10`, from L1-E's copy deck, in L1-B's file

The deck files one `C5-10` row under *"L1-A applies"* that lands in
`Features/RoomScan/Shared/Components/PauseMenuView.swift:63-64`, which is **L1-B's** glob. L1-A did not
apply it. Exact final text, from the deck: `"Discard Scan"` → `"Discard scan"`, `"Keep Scanning"` →
`"Keep scanning"`.

### Note B-L1A-4 — `A-79`'s counts were read in the view, not on `LocalStoreClaim`

The deck's `A-79` row suggests adding `roomCount` / `pieceCount` to `LocalStoreClaim`
(`Core/Persistence/LocalStoreClaim.swift`) — **L1-B's** file. L1-A did **not** touch it. The two counts
are read in `Features/Collections/Views/LocalStoreClaimSheet.swift` instead, from the same
`ModelContext` and with the same two `fetchCount` calls `LocalStoreClaim.hasGuestWork` uses. The
rendered string is byte-identical to the deck's. If L1-B wants the counts hoisted onto
`LocalStoreClaim` later, `LocalStoreClaimSheet.title(rooms:pieces:)` is a static function that takes
them as arguments — no other change needed.

---

## To L1-D — Tokens, dark mode, contrast, iconography

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

## To L1-E — Copy

### Note E-L1A-1 — deck rows applied by L1-A

Applied verbatim in `agent-ff-w1-l1a`:

| deck row | file | state |
|---|---|---|
| `A-101` ×3 | `Features/Account/AccountDeletionService.swift` | applied — title, body and `failureCopy`, exactly as written |
| `A-06` ×3 | `Features/Onboarding/Views/OnboardingFlowView.swift` | applied — U+2019 in all three |
| `C5-20` | `OnboardingFlowView.swift:32` | applied — `"Let's begin"` (U+2019), byte-identical to page 3 |
| `C5-20` | `AuthenticationView.swift:134` | applied — `"Save your rooms and pieces, and pick them up on any device."` |
| `C5-10` | `AccountView.swift:184` | applied — `"Sign out"` |
| `C5-10` | `QRScannerView.swift:201` | applied — `"Open settings"` |
| `C5-10` | `CameraPermissionView.swift:223` | applied — `"Open settings"` |
| `C5-10` | `AuthenticationView.swift` `submitButtonTitle` + mode switcher | applied — `"Sign in"` / `"Create account"` / `"Email me a code"` / `"Send reset link"` / `"Sign up"` |
| `A-79` ×2 | `LocalStoreClaimSheet.swift` | applied — count-aware title; the `:23` body left unchanged as the deck says. See **Note B-L1A-4** for where the counts are read |
| `B-23` | `StyleResultView.swift:65` | applied — `"Your portrait is yours — reset it any time in Settings."` |

**Not applied — the file belongs to another lane**, routed as notes above: `A-52` ×3
(`CompanionActionRows.swift` → L1-C, task **C-L1A-3**; `NotificationFeedView.swift` → **L1-F**, task
**F-L1A-1**), `C5-10` (`PauseMenuView.swift` → L1-B, task **B-L1A-3**).

### Note E-L1A-2 — `P-30`'s naming, and where it meets the deck

`P-30` (L1-A's row) rules the mechanism has **one name: "sign-in code"**. The strings L1-A changed:

| where | was | now |
|---|---|---|
| `AuthenticationView.swift` mode switcher | `"Use magic link"` | `"Email me a code"` |
| the sent panel | `"We sent a magic link to"` | `"We sent a sign-in code to"` |
| the sent panel | `"Click the link in the email to sign in."` | `"Open the email and enter the code to sign in."` |
| the sent panel's resend | `"Resend magic link"` | `"Resend the code"` |
| `AuthViewModel.sendMagicLink` | `"We emailed you a 6-digit code"` | `"We emailed you a 6-digit sign-in code"` |
| `AuthViewModel.resendMagicLink` | *(no message)* | `"We emailed you a new sign-in code"` |

`"Continue with email"` is kept on both the Welcome button and the sheet header: it names the **door**
(which method), not the mechanism, and the deck's own `C5-10` row records it as already correct. The
submit button stays at the deck's `"Email me a code"` — the short form of the same name, after the
subtitle has said it in full. Pinned by `PatinaTests/SignInCodeNamingTests.swift`, which fails if
"magic link" reappears in any reader-facing literal in the three auth files.

### Note E-L1A-3 — three new sentences this lane wrote that were not in the deck

They are on screens `P-29` / `P-20` / `C1-04` required, and no deck row covers them. Flagging for the
integration copy pass:

| where | string | why |
|---|---|---|
| `AuthViewModel.emailValidationMessage` | `"That doesn't look like an email address yet."` | `P-20` — an invalid address produced no message at all; the button was silently inert |
| `StyleQuizView.submittingOverlay` | `"Reading your answers…"` | `C1-04` — `isSubmitting` had no reader anywhere |
| `AccountView.signedOutSection` | `"You're looking around without an account."` / `"Sign in to see your projects, decisions, proposals and invoices."` / `"Sign in or create your account"` | `B-12`, `C1-14` — the guest's Account screen was `"Not signed in"`, `"Email —"`, `"Member since —"` and a QR button that could not work |
| `StyleQuizView` defer control | `"I'll do this later"` | `B-21` — the quiz had no exit on any step |
| `OnboardingFlowView` / `StyleQuizView` | `"I already have an account — Sign in"` | `P-18` — after one tap on "Look around first" the sign-in screen was unreachable forever |

Straight apostrophes are deliberate in the two `"doesn't"` / `"You're"` / `"I'll"` strings **only if**
the deck's `A-06` sweep is scoped to `OnboardingFlowView` as written; if the sweep is app-wide, send
the three back as a deck row and L1-A will re-apply.

---

## To L1-F — Notifications, messaging, widget, deep links

### Task F-L1A-1 — `A-52`, from L1-E's copy deck, in L1-F's file

The deck files an `A-52` row under *"L1-A applies"* that lands in
`Features/Notifications/Views/NotificationFeedView.swift:193` (`guestInviteView`), which is **L1-F's**
glob. L1-A did not apply it. Exact final text, from the deck:

- `:193` message → `"Sign in to see updates on your projects and messages here."`
- `:192` title `"Nothing yet"` — **unchanged.**

The view is already correctly branched on auth state; only the sentence inside it still presumes a
designer relationship the guest does not have.

### Note F-L1A-2 — `C2-21` / `GAP7B-09`'s acknowledgement line

Both are **L1-F rows** on `AppCoordinator.swift` (the deep-link queue). PROGRAM.md §3 · L1-A's
integration notes say they carry "an L1-A acknowledgement line on the auth screen".

`AuthScreenView` now has a **fixed-height status slot** (`AuthScreenView.statusSlotHeight`, 52 pt,
always in the layout) built for `P-29`. It renders `errorMessage` today. If L1-F wants the queued-link
acknowledgement there, send back the exact sentence and the property name to read, and L1-A will add a
second, lower-priority case to the same slot — **not** a second element, because the whole point of
`P-29` is that nothing on that screen may move.

L1-A has **not** added an acknowledgement line: with no queue state exposed to read there is nothing to
render, and inventing a sentence for a mechanism L1-F has not built yet would be a guess.

---

# From L1-A — fix round 4 (tail fix), 2026-09-03

## To the steward and the closer — Note A→S-7 · `RL4A-04`, the ruling: **L1-A is 25/27**, and merge 5's acceptance criterion

`A→S-6` (`steward.md`, fix round 3) put the question to Fable: `PROGRAM.md` §11.6 and
`findings-by-lane.md` record L1-A at **27/27**, and two of those rows are open. **Fable has ruled:
record L1-A at 25 of 27, with two carried rows.** This note is that ruling written where the merge
happens. The same text is in `l1a-tasks.md` § "Fix round 4 — the tail" · **Z4**.

### The two carried rows

| carried row | why it is open | what closes it | the test that goes red when it lands |
|---|---|---|---|
| `C9-08` | four of the five `.numberPad`/`.decimalPad` files are **L1-B's** — `RoomBudgetSheet.swift:61`, `ManualRoomEntryView.swift:65,133`, `RoomSettingsView.swift:193`, `ScanFallbackEntryView.swift:173`. The modifier itself (`Utilities/ViewModifiers/KeyboardDismissal.swift`) exists only on `first-flight/w1-l1a`, so the work cannot compile anywhere else until this lane merges | `l1-b-notes.md` **B-L1A-2**, applied at **X29** | `KeyboardDismissalTests.everyBareNumericFieldIsOneOfTheFiveKnownOpenSites` |
| `C2-21` / `GAP7B-09`, **acknowledgement half only** | `AuthScreenView` accepts `pendingLinkNotice` and renders it in the fixed-height status slot; nothing passes it, because `AppCoordinator.pendingLinkNotice` is **L1-F's** and merges fourth | the two call-site lines — `ContentView.swift`'s `.auth` case and `AuthSheet.swift` — applied at **X29** | `AuthErrorRoutingTests.theHeldLinkNoticeIsWiredWhenTheCoordinatorCanSupplyIt` |

Neither is a gap in L1-A's work. Both are work that **cannot compile on this branch**, routed to
lanes that merge before this one, and owned here as `X29` — the numbered exit task that runs in this
worktree after the tip carries merges 1–4 and before merge 5 is pushed.

### Merge 5's acceptance criterion

**L1-A merges at 25/27 with two carried rows.** Push merge 5 only when all four hold:

1. `ios-gate.sh build`, `release`, `unit` and `lint-delta main` are green **on the integration tip
   after merges 1–4** — not on `first-flight/w1-l1a` alone.
2. **X29 has run in this worktree**, on that tip, and its checklist is applied — including the four
   `.keyboardDoneToolbar()` sites that close `C9-08` and the two `pendingLinkNotice` call sites that
   close `C2-21` / `GAP7B-09`'s acknowledgement half.
3. `KeyboardDismissalTests.everyBareNumericFieldIsOneOfTheFiveKnownOpenSites` and
   `AuthErrorRoutingTests.theHeldLinkNoticeIsWiredWhenTheCoordinatorCanSupplyIt` are **green with
   the dependencies present**. Both are deliberately inert while the dependency is absent, so a
   green run taken before merges 1–4 proves nothing about either row — the tip is the only place the
   check means anything.
4. If X29 has not run, **refuse merge 5**, or carry the two rows past it explicitly and say so in
   `PROGRAM.md` §11.6. They are not counted closed by silence.

### What the closer amends

`PROGRAM.md` §11.6 and `findings-by-lane.md` say **27/27** today. The correct number is **25/27**,
carrying `C9-08` and `C2-21`/`GAP7B-09`'s acknowledgement half to X29. L1-A does not edit
`PROGRAM.md` — that is the closer's file — so this note is the referent for the amendment.

**Where this note lives, stated plainly** (`RL3A-04`'s lesson: never claim a delivery that did not
happen). `A→S-7` is written **here and in `l1a-tasks.md` § Z4, and nowhere else**. Fable's ruling
named those two files and no other, so unlike `A→S-1`…`A→S-6` it has **not** been appended to
`steward.md`. If the steward's inbox is meant to carry it, that append is one paste and it is the
closer's to make.

## To L1-E — see `l1-e-notes.md`, Note **A→E-5**

`RL4A-01`. All three `C5-20` rows on `QuizModels.swift` are applied (`:73` `"Collected Eclectic"`,
`:105` `"Considered Comfort"`, `:112` `"What’s bringing you here?"`), keys untouched.
`BrandVoiceLintTests.styleQuizLabelsAreRenamed`'s `withKnownIssue` can come off at merge 6.
`BrandVoiceLintTests.styleQuizIsClean`'s cannot without one edit first: L1-E's `lint(_:file:)` reads
`key:` values, so unwrapping it reds on `eclectic_curated` and `curated_comfort` — the two strings
L1-E's own `styleQuizWireKeysAreUnchanged` requires to stay. Full text in the note.

---

# Fix round 5 (2026-09-03) — one note out

## To the steward — see `steward.md`, Note **A→S-7**

A fresh simulator boot no longer clears `OrderHandoffTests` / `CompanionCoachingModelTests`. Round
four's `Z5` concluded "warm sim red, fresh boot green"; this round booted fresh and still took 7
issues at `load avg 892`, then 0 issues from the same two suites run alone (0.109 s). The variable is
the other five lanes' concurrent gates, not warmth — so the fresh-boot remedy cannot be relied on at
D14's between-merge gates. L1-B's 20 s `waitFor` is on `first-flight/w1-l1b` only and is
**deliberately not duplicated here**: the file is residue in no lane's glob, and a second copy of the
same edit is a conflict for nothing. Full text, with the three-run table, in the note.

Nothing else went out this round: verification found no change that needs another lane's file.

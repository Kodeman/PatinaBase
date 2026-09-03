# W1 · L1-E — integration notes

Notes addressed **to** L1-E. Each is a numbered task for L1-E's own task list, carrying exact final
text.

---

## From L1-C (Layout, Companion, Dynamic Type) — 2026-09-02

**No task. A record of three strings L1-C wrote and one row L1-C deleted**, so the deck pass at
integration can bless or replace them. Reproduced from `build/waves/w1/l1c-notes-out.md` §7.

### The deck rows L1-C applied

`build/waves/w1/l1-e-copy-deck.md` landed while L1-C was mid-lane; all six rows addressed to L1-C in
`l1-c-notes.md` are applied:

| row | finding | what landed |
|---|---|---|
| `C-L1E-1` | `A-60`, `C-22` | `CompanionActionRows.swift:36-39` → `"Your studio"` / `"Style · Settings"`; `:51-54` → `"Your projects"` / `"Projects"` |
| `C-L1E-2` | `A-60` | `ProfileView.swift` `Text("YOUR PROFILE")` → `Text("MORE")` |
| `C-L1E-3` | `C-30` | `ProfileView.swift` (two call sites) → `label: viewModel.roomCount == 1 ? "Room" : "Rooms"` |
| `C-L1E-4` | `C-38` | `RecommendationsView.recommendationRationale` room-scoped branch → `return nil` |
| `C-L1E-5` | `B-20` | `RoomProjectView.swift:254` → `cta(primary: "Browse pieces for this room")` |
| `C-L1E-6` | `C5-05` | structural, no string — see below |

The deck's own **"L1-C applies"** table carries four `C5-10` casing rows that `l1-c-notes.md` does
not repeat. All four are applied:

| deck row | what landed |
|---|---|
| `SettingsView.swift:81` | `label: "Sign Out"` → `"Sign out"` |
| `SettingsView.swift:121` | `label: "Haptic Feedback"` → `"Haptic feedback"` |
| `SettingsView.swift:156` | `label: "Contact Us"` → `"Contact us"` |
| `SettingsView.swift:159` | `label: "Terms & Privacy"` → `"Terms & privacy"` |
| `SettingsView.swift:153` | "Help Center" — the deck says **unchanged**; the row is removed entirely for `C5-05` (below), so nothing remains to case |

**One thing the deck does not cover, flagged rather than guessed.** The row now reads "Sign out" and
opens an alert whose title and confirm button are both still `"Sign Out"`
(`SettingsView.swift:212,214`). The deck names only `:81`, and
`AccountActionsTests.settingsSurfacesBothAccountActions` pins the literal `"Sign Out"` in this file,
so L1-C changed neither. If L1-E wants the alert cased to match, send the two strings and the pin
update together — it is one edit, but it is L1-E's word, not L1-C's.

`C-L1E-3` was applied at **two** call sites, not the one the deck names: `ProfileView` draws the stat
row twice, once stacked for accessibility text sizes and once horizontally, and both printed
`"1 ROOMS"`.

### Three strings L1-C wrote that were not on the deck

All three are `accessibilityLabel:` values — VoiceOver-only, never drawn — written for `C-05`, whose
fix line is *"give any remaining ones distinct labels naming their subject"*. Before them, three
`HelpInfoIcon`s on one header all announced the component default, `"More information"`.

| file | string |
|---|---|
| `Features/Rooms/Views/YourSpacesView.swift` | `"About Your Spaces"` |
| `Features/Rooms/Views/YourSpacesView.swift` | `"About Whole Home"` |
| `Features/Rooms/Views/YourSpacesView.swift` | `"About scanning a room"` (the empty state's icon) |
| `Features/Home/Views/DailyGreetingHeader.swift` | `"About Today"` |

The third is now **Today's only help affordance** — L0.4's Task C-L04-1 removed the `?` panel door
100 pt away.

### One row L1-C deleted

Settings → **Help Center** is gone. `C5-05`: `https://patina.cloud/help` is a live 404 whose SPA
fallback serves the marketing homepage, so the failure was invisible — the tester just got the wrong
page. `C-L1E-6` says no L1-E word is coming for that row and the fix is structural; removal is the
option the finding names ("remove the row until one does"), and pointing it at `HelpPanelSheet` was
not available, because all six `?` doors are hidden for round one (`C5-02`) and the article fetch
still 400s (`R-10`, L1-B).

The Support group now has two rows: "Contact Us" and "Terms & Privacy". If a later deck carries a
Help Center rewrite, it has nothing to land on until W2 restores the row.

### One row L1-C did NOT apply

`C5-06` (Today's greeting: "Good night." for eight hours a day) is an **L1-E W1 row** whose fix is in
`PatinaDesignKit/Sources/PatinaDesignKit/Tokens/TimeOfDay.swift` — **L1-D's glob**, not L1-C's — and
no deck row addressed it to L1-C. `DailyGreetingHeader` renders `TimeOfDay.current.greeting`
unchanged. Recorded so it is not assumed closed by the header rewrite.

### VISION check on this note

Nothing here adds tab/zone/dashboard framing, a shadow, red/green status, a badge, an engagement
mechanic or the word "AI" — three VoiceOver labels and one removed row.

---

# From L1-A (Welcome, sign-in, onboarding) — 2026-09-02

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


---

# From L1-D — round 2 (2026-09-02, after reading `l1-d-notes.md` and the copy deck)

Written after L1-D read its own inbox (`l1-d-notes.md`, four notes) and `l1-e-copy-deck.md`, both of
which landed while this lane was mid-build. Round 1 is `l1d-notes-out.md`. Each block below is
appended verbatim to its target lane's inbox.

---

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

# W1 · L1-E — outbound integration notes

Every change L1-E wants in another lane's file, with the exact final text. Each block below is
appended verbatim to the target lane's `build/waves/w1/<lane>-notes.md`, in both the shared main
checkout and this lane's worktree.

**Round 1** (2026-09-02, deck revision 1) sent rows to L1-A, L1-B, L1-C and L1-D. **Round 2** (this
file, after the adversarial review `RL1E-01`…`RL1E-22`) corrects three mis-addressed rows, adds the
sites the fix round found on the built branch, and answers the three open questions L1-E's inbox
(`l1-e-notes.md`) carries. Rows already applied are marked so no lane touches the same line twice.

Deck: `build/waves/w1/l1-e-copy-deck.md` **revision 2**.

---

## To L1-A — `Features/Authentication/**`, `Onboarding/**`, `FirstLaunch/**`, `StyleQuiz/**`, `Account/**`

### Task A-L1E-8 — `C5-10` · the taste portrait's primary CTA

`Features/StyleQuiz/Views/StyleResultView.swift:54`

```swift
Text("View Recommendations")   // today
Text("See your pieces")        // final
```

Title Case on the primary button of the screen every first-run tester lands on after the quiz.
"See the piece" is the phrase `OrderPlacedView` already uses and the one `ItemActionMenu` takes
under `C5-09`, so the plural is the same voice. Pinned by
`SentenceCaseTests.stylePortraitCTAIsSentenceCase`.

### Task A-L1E-9 — `C5-20` · the style quiz says "Curated" twice on the first-run path

`Features/StyleQuiz/Models/QuizModels.swift:73` and `:105`. **Change the `label:` only. The `key:`
values are spectrum-mapping and budget-lookup inputs** (`StyleQuizViewModel.swift:221,242,296` match
on them) and must not change.

```swift
// :73  — question 1 of 5, "Which palette feels like home?"
QuizOption(label: "Eclectic Curated",   gradient: PatinaGradients.rattan, key: "eclectic_curated")  // today
QuizOption(label: "Collected Eclectic", gradient: PatinaGradients.rattan, key: "eclectic_curated")  // final

// :105 — question 4 of 5, "Let's talk about investment"
QuizOption(label: "Curated Comfort",    subtitle: "$2,000 – $5,000 per room", icon: "✦", key: "curated_comfort")  // today
QuizOption(label: "Considered Comfort", subtitle: "$2,000 – $5,000 per room", icon: "✦", key: "curated_comfort")  // final
```

"Curated" is on the deck's banned lexicon and `BrandVoiceLintTests` bans it, yet the app ships it
twice on the mandatory first-run quiz — a harder placement than `C5-20`'s own two strings.
"Collected" is the interiors word for a room assembled over time, which is what that palette means.
"Considered" is parallel to its siblings "Thoughtful Starter" and "Heirloom Investment". Pinned by
`BrandVoiceLintTests.styleQuizIsClean`, which also asserts both keys survive.

### Task A-L1E-10 — `A-06` · the ruling on the sweep's scope, and five strings

**This answers your question in `l1-e-notes.md` Note E-L1A-3.** `A-06`'s W1 sweep is **every
user-facing string in a file the deck names**, not only `OnboardingFlowView`; the app-wide sweep is
W2 · L1-E's. Three of the five sentences you flagged carry an apostrophe, and they are in files the
deck names, so they are in scope:

| where | today | final |
|---|---|---|
| `AuthViewModel.emailValidationMessage` | `"That doesn't look like an email address yet."` | `"That doesn’t look like an email address yet."` |
| `AccountView.signedOutSection` | `"You're looking around without an account."` | `"You’re looking around without an account."` |
| `StyleQuizView` defer control | `"I'll do this later"` | `"I’ll do this later"` |

The other two ("Reading your answers…", "I already have an account — Sign in") carry no apostrophe
and are already correct.

Two more in the same sweep, in `Features/Account/AccountDeletionService.swift`:

| line | today | final |
|---|---|---|
| `:38-39` (`failureCopy`) | `"We couldn't delete your account just now. …"` | `"We couldn’t delete your account just now. Try again, or write to hello@patina.cloud."` |
| `:55-58` (`confirmationBody`) | `"… This can't be undone."` | `"… This can’t be undone."` |

⚠ **`confirmationBody`'s edit turns one of your own tests red unless it goes in the same commit.**
`PatinaTests/AccountActionsTests.deletionConfirmationCopyIsHonest` asserts
`confirmationBody.contains("can't be undone")` with a straight apostrophe — change it to
`"can’t be undone"`.

### Task A-L1E-11 — `C5-10` · the sign-out alert contradicts the button that opens it

`Features/Account/AccountView.swift:59,61`

```swift
.alert("Sign Out", isPresented: $showingSignOutAlert)   // today
Button("Sign Out") { … }                                 // today

.alert("Sign out?", isPresented: $showingSignOutAlert)  // final
Button("Sign out") { … }                                 // final
```

`AccountView.swift:217` already reads `"Sign out"` after your `C5-10` row, so one screen now ships
both spellings — which is exactly `C5-10`'s complaint. The `?` on the title is not a casing change:
it matches the file's sibling alerts, and it is the difference between a title and a command.

⚠ **Same-commit pin:** `PatinaTests/AccountActionsTests.accountViewSurfacesBothAccountActions`
asserts `source.contains("\"Sign Out\"")` → change to `"\"Sign out\""`. (The `SettingsView` half of
that test file is L1-C's row — a different `@Test` function, so the two edits merge cleanly.)

### Note A-L1E-12 — `A-101` · your acknowledgement is requested, and `A-13`'s string is ratified

**`A-101`.** PROGRAM.md §3 · L1-E's exit criteria says the delete-account sentence names what is
deleted, what is retained "**and for how long**, agreed with L1-A". The deck's sentence deliberately
states **no retention period**: there is no purge window anywhere in the code — `purge_client_account`
(00538) never writes to `proposals`, `projects`, `invoices`, `client_decisions` or `designer_clients`,
and `delete-account/index.ts` schedules nothing — so any number would be a claim the product cannot
keep, on the one screen App Review reads under 5.1.1(v). It is recorded in the deck as an explicit
exception for Fable to ratify. **Please record your agreement (or your objection) in
`l1-a-notes.md`**, so "agreed with L1-A" has a referent in the wave record.

**`A-13`.** Revision 1 of the deck omitted this row entirely, though PROGRAM.md names it by id. You
have already applied it, at `StyleQuizViewModel.swift:61-66` — the nudge is gone on every step that
has a real Continue button, and the surviving line reads `"See your style"`. **That string is
ratified as the deck row**; no change is asked for. Recorded so the finding is closeable against a
deck entry rather than against a commit nobody filed.

### Note A-L1E-13 — three rows are now correctly addressed elsewhere; no action

Revision 1 filed these under "L1-A applies" against `steward.md` §5. You had already re-routed all
three, correctly:

| row | file | true owner |
|---|---|---|
| `A-52` ×2 | `Features/Companion/Services/CompanionActionRows.swift` | **L1-C** (§5.4) — your task `C-L1A-3` |
| `A-52` ×1 | `Features/Notifications/Views/NotificationFeedView.swift:193` | **L1-F** (§5.7) — applied by L1-F |
| `A-79` ×2 | `Features/Collections/Views/LocalStoreClaimSheet.swift` | **no W1 owner**, so L1-E's under its own carve-out — but you applied it verbatim first. Recorded, not re-applied. |

---

## To L1-B — `Core/**`, `Services/Sync/**`, `Features/RoomScan/**`, `Features/Rooms/**`

### Task B-L1E-4 — `C5-09` · three sites in `Features/Rooms/**` the deck missed

`C5-09`'s `where` names eight sites; deck revision 1 covered one. Three of the remaining seven are
yours:

| file:line | today | final |
|---|---|---|
| `Features/Rooms/Views/CrossRoomView.swift:64` | `Text("All Items")` (screen title) | `Text("All pieces")` |
| `Features/Rooms/Views/CrossRoomView.swift:81` | `tabButton("All Items", .all)` | `tabButton("All pieces", .all)` |
| `Features/Rooms/Views/RoomProjectView.swift:212` | `Text("Your Items")` (section eyebrow) | `Text("Your pieces")` |

The sibling tabs `"By Category"` / `"By Maker"` are Title Case too, but that is `C5-10`'s casing
sweep, not `C5-09`'s noun collision — **leave them**; W2 has that row. Pinned by
`NounConsistencyTests.roomsSurfacesSayPieces`.

### Note B-L1E-5 — `B-20` was applied by L1-C in your file; do not apply it twice

`Features/Rooms/Views/RoomProjectView.swift:254` now reads
`cta(primary: "Browse pieces for this room")`. Deck revision 1 addressed `B-20` to L1-C, which was
wrong — `Features/Rooms/**` is yours (§5.3) and `RoomProjectView.swift` is not one of the string-
literal carve-outs. L1-C applied it anyway, as task `C-L1E-5`. The hunk is on
`first-flight/w1-l1c`; your `C5-09` edit above is at `:212`, a different line, so the two merge.
Flagged to the steward in L1-E's report.

---

## To L1-C — `Design/**`, `Companion/**`, `Home/**`, `Decisions/**`, `Help/**`, `Settings/**`, `ProfileView.swift`, `RecommendationsView.swift`

### Task C-L1E-7 — `C5-10` · the sign-out alert, with its pin (answers your open question)

**This is the answer to "One thing the deck does not cover" in `l1-e-notes.md`.** Yes — case the
alert to match the row, and here are both strings and the pin update, as you asked:

`Features/Settings/Views/SettingsView.swift:212,214`

```swift
.alert("Sign Out", isPresented: $showingSignOutConfirmation)   // today
Button("Sign Out") { signOut() }                                // today

.alert("Sign out?", isPresented: $showingSignOutConfirmation)  // final
Button("Sign out") { signOut() }                                // final
```

The `?` is not a casing change: the file's three other alerts are questions ("Forget recent
context?", "Reset taste portrait?", "Discard this scan?"), and a title that is a bare command
reads as a second button. One screen, one shape.

⚠ **Same-commit pin:** `PatinaTests/AccountActionsTests.settingsSurfacesBothAccountActions` asserts
`source.contains("\"Sign Out\"")` → change to `"\"Sign out\""`. Leave
`accountViewSurfacesBothAccountActions` alone — that is L1-A's half, a different `@Test` function in
the same file, so the two merge cleanly. Pinned by
`SentenceCaseTests.settingsSignOutAlertMatchesItsRow`.

### Task C-L1E-8 — `C5-10` · "Retake Style Quiz" beside "Get design help"

`Features/Profile/Views/ProfileView.swift:154` (`:140` on your branch)

```swift
profileActionRow(icon: "paintpalette", label: "Retake Style Quiz")   // today
profileActionRow(icon: "paintpalette", label: "Retake your style quiz")  // final
```

Title Case sits directly above `"Get design help"` and `"Settings"` inside one section — `C5-10`'s
complaint verbatim, and `GAP2-22`'s own ruled fix, reused so W2 has nothing left to decide. Pinned
by `SentenceCaseTests.studioActionRowsShareOneCasing`.

### Task C-L1E-9 — `C5-09` · one word in one VoiceOver announcement

`Features/Profile/Views/ProfileView.swift:217`

```swift
.accessibilityLabel("Saved items: \(viewModel.savedItemCount). More information available.")   // today
.accessibilityLabel("Saved pieces: \(viewModel.savedItemCount). More information available.")  // final
```

The visible stat reads `"Saved"`, which is fine; only the announcement names the retired noun.
Pinned by `NounConsistencyTests.profileSavedStatSaysPieces`.

### Task C-L1E-10 — `A-52` · the two Companion guest rows are still open

Your task `C-L1A-3` (re-routed to you by L1-A, correctly — `Features/Companion/**` is yours under
§5.4) is **not applied on `first-flight/w1-l1c`**: `CompanionActionRows.swift:33` still reads
`item("house", "Home", "Back to your space", …)` unconditionally, and the file carries no
`isAuthenticated` parameter. Exact final text, unchanged from the deck:

- `:32-34` (`homeRow`) — **guest** hint `"See what’s on Patina"`; signed in, or a guest with local
  rooms, keeps `"Back to your space"`.
- `:220-223` (`pieceActRow`, `.askAboutPiece`) — **guest** hint
  `"Sign in and a designer will get back to you"`; signed in with no designer yet,
  `"A designer will get back to you"`.

Both need `isAuthenticated` (or `LocalStoreClaim.hasGuestWork` for the home row) threaded into the
row builder. `:213-214` (`.askDesigner`) is **unchanged** — it is only reachable when
`relationship.isLive`, which a guest cannot be. Note the apostrophe in `"what’s"` is **U+2019**
(`A-06`). Pinned by `GuestPromiseTests.companionRowsBranchOnAuthState`, which is a recorded known
issue until this lands.

### Note C-L1E-11 — `C5-06` changed the greeting's width on the flags-off root

Not a request; a heads-up, because you own `DailyRoomView.swift` and `DailyGreetingHeader.swift`.
Launched on L1-E's clone at 21:41 with `-PatinaFlags ""`: the flags-off header — which carries the
Studio pill, the bell and the help icon on the same row — now breaks the headline as "Good /
evening" over two lines, where "Good night." fitted one. The same happens at midday, where "Good
afternoon" (14 characters) replaces "Good day." (9). **The four-tab root has the width and renders
one line**, so this only affects the D1 kill-switch fallback. Recorded rather than reverted; if you
want the header to reserve two lines there, that is your call, not a copy change.

### Note C-L1E-12 — `GAP1B-01` needs no sentence, and that is now written down

`Features/Decisions/Views/DecisionDetailView.swift:368-448`. PROGRAM.md names `GAP1B-01` as a row
this deck owes ("the sheet is L1-C's, the sentence is a deck row L1-C applies"). Having read the
sheet: **no string is needed.** The copy inside it is already correct and no new text appears at any
Dynamic Type size — the fix is entirely the content-driven detent. Recorded in the deck so the exit
criterion "every deck row is either applied or carries a written 'not this wave, because…'" has an
entry for it, and so you are not waiting on a sentence that is not coming.

### Note C-L1E-13 — your three VoiceOver labels are blessed

`"About Your Spaces"`, `"About Whole Home"`, `"About scanning a room"`, `"About Today"`. Correct
voice, correct specificity, and `C-05`'s fix line asks for exactly this. No deck row needed. (Two
carry Title Case — `"Your Spaces"` and `"Whole Home"` — but both are the on-screen proper names of
those surfaces, so the announcement matching them is right.)

---

## To L1-D — `PatinaDesignKit/**`, `Features/Shared/**`

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

## To L1-F — `Features/Notifications/**`, `Messaging/**`, `PatinaWidget*/**`, `AppCoordinator.swift`

### Note F-L1E-1 — `A-52`'s third site was yours all along; thank you for catching it

`Features/Notifications/Views/NotificationFeedView.swift:193`. Deck revision 1 filed this row under
"L1-A applies", and `l1e-notes-out.md` round 1 recorded "**L1-F (none in W1)**" — so this lane never
told you about a row in your own glob (`Features/Notifications/**`, steward.md §5.7). You found and
applied it anyway; on `first-flight/w1-l1f` the guest empty state reads:

```swift
message: "Sign in to see updates on your projects and messages here.",
```

which is the deck's exact final text. **No action.** The routing is corrected in deck revision 2 and
the string is pinned by `GuestPromiseTests.notificationsGuestStateMakesNoPromise`. Recorded here so
the wave record shows the row had an owner who was told, rather than an owner who guessed.

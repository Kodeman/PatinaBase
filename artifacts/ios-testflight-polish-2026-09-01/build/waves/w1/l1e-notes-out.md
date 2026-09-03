# W1 · L1-E — outbound integration notes

Every change L1-E wants in another lane's file, with the exact final text. Each block below is
appended verbatim to the target lane's `build/waves/w1/<lane>-notes.md`, in both the shared main
checkout and this lane's worktree.

**Round 1** (2026-09-02, deck revision 1) sent rows to L1-A, L1-B, L1-C and L1-D. **Round 2** (after
the first adversarial review `RL1E-01`…`RL1E-22`) corrects three mis-addressed rows, adds the sites
that round found on the built branch, and answers the three open questions L1-E's inbox
(`l1-e-notes.md`) carried. **Round 3** (the sections marked *Round 3* below, after `RL1E2-01`…`-24`)
carries the apostrophe corrections the deck's own lint could not see, the quiz's `"journey"` title,
the four surviving `"Curated"` display names, `C-38`'s live half, and the answer to L1-B's **O13**.
Rows already applied are marked so no lane touches the same line twice.

Deck: `build/waves/w1/l1-e-copy-deck.md` **revision 3**.

> **One thing every lane should know.** Until this round, `BrandVoiceLintTests.apostrophesAreCurly`
> read only the nine files L1-E owns. Every deck row another lane applied was therefore **unchecked**
> for `A-06`'s glyph — and five had already landed with the straight `'` (U+0027). There is now one
> apostrophe pin per cross-lane file. If you are applying a deck row that contains an apostrophe,
> the byte is **U+2019 `’`**, not `'`.

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

---

# Round 3 — after the second adversarial review (`RL1E2-01` … `RL1E2-24`)

The three blocks below were appended verbatim to `l1-a-notes.md`, `l1-b-notes.md` and `l1-c-notes.md`
in the shared main checkout. Nothing new goes to L1-D or L1-F this round.

---

## Round 3 → L1-A

### Note E3-L1A-1 — three rows landed with the wrong apostrophe, and here are the bytes

`RL1E2-01` (blocker). Deck revision 2 marked two `A-101` sentences **Applied** and added "with
U+0027; see the apostrophe row below" — and that apostrophe row was never sent as its own note, so
the wrong glyph is on `first-flight/w1-l1a` today. The lane's lint could not catch it: until this
round `BrandVoiceLintTests.apostrophesAreCurly` read only the nine files L1-E owns.

| file:line | today (on your branch) | final |
|---|---|---|
| `Features/Account/AccountDeletionService.swift:39` | `"We couldn't delete your account just now. Try again, or write to hello@patina.cloud."` | `"We couldn’t delete your account just now. Try again, or write to hello@patina.cloud."` |
| `AccountDeletionService.swift:58` | `+ "for our legal and accounting obligations. This can't be undone."` | `+ "for our legal and accounting obligations. This can’t be undone."` |

The byte is `U+2019` (`’`). **Apply the matching pin in the same commit** —
`PatinaTests/AccountActionsTests.deletionConfirmationCopyIsHonest` asserts
`confirmationBody.contains("can't be undone")` with the straight glyph, so the string edit alone
turns that test red. Pinned by `BrandVoiceLintTests.accountDeletionApostrophesAreCurly`, which is
`withKnownIssue`-wrapped today and unwraps when this lands.

### Note E3-L1A-2 — `"journey"` is live on question 5 of 5 of the first-run quiz

`RL1E2-02` (blocker). `Features/StyleQuiz/Models/QuizModels.swift:112`:

```swift
title: "What's driving your design journey?",
```

"journey" is the exact word `C5-20` is filed about and `BrandVoiceLintTests` bans it — and it went
unseen because `styleQuizIsClean` hand-wrote six `contains` assertions instead of linting the file.
The file is linted in full now.

**Final:**

```swift
title: "What’s bringing you here?",
```

That is what the four options answer — "Fresh start, new space" · "Finally making it mine" · "Life
change, design change" · "Ready to invest in quality" — which is *why now*, not *how far along*.
Curly apostrophe. A question title carries no wire key, so nothing else changes on this line.

While you are in the file, the two `"Curated"` label rows from deck revision 2 are still open on your
branch (`:73` → `label: "Collected Eclectic"`, `:105` → `label: "Considered Comfort"`) — and **the
`key:` values on both lines must not change** (`StyleQuizViewModel.swift:221,242,296` match on them).
`BrandVoiceLintTests.styleQuizWireKeysAreUnchanged` pins the keys **unwrapped**, so a rename that
takes them with it fails immediately.

Also: `QuizModels.swift` carries three straight apostrophes in literals (`:107` `"Let's Discuss"`,
`:107` `"I'd like designer guidance"`, and `:112`'s title). Same sweep, same byte.

### Note E3-L1A-3 — `A-101`'s retention exception is still unratified

`RL1E2-24`. PROGRAM.md §3 · L1-E's exit criteria requires the delete-account sentence to name what is
retained **"and for how long, agreed with L1-A"**. The deck's sentence names what is retained and
**states no period, deliberately**: no purge window exists in `purge_client_account` (00538) or
`supabase/functions/delete-account/index.ts`, so any number would be a false claim on the one screen
App Review reads under 5.1.1(v).

Round 2 asked for L1-A's acknowledgement so "agreed with L1-A" has a referent, and `l1-a-notes.md`
carries the request with no answer. **This is a one-line reply, not work**: either "agreed — no
period, because none exists in the code", or a period you can point at in a migration. L1-E's report
carries it as an open item for Fable either way.

---

## Round 3 → L1-B

### Note E3-L1B-1 — three rows landed with the wrong apostrophe

`RL1E2-01` (blocker). Same cause as L1-A's: the deck's lint read only L1-E's own nine files, so every
row you applied was unchecked for `A-06`'s glyph.

| file:line | today (on your branch) | final |
|---|---|---|
| `Core/Network/RoomsAPIClient.swift:430` | `case .emptyResponse: return "We didn't get a response. Try again."` | `"We didn’t get a response. Try again."` |
| `Features/RoomScan/Shared/Components/ScanUploadFailureCopy.swift:25` | `"Upload paused — check your connection. It'll pick up automatically."` | `"Upload paused — check your connection. It’ll pick up automatically."` |
| `ScanUploadFailureCopy.swift:26` | `"We couldn't finish uploading your scan. Try again from here."` | `"We couldn’t finish uploading your scan. Try again from here."` |

`RoomsAPIClient.swift` is pinned **unwrapped** (`BrandVoiceLintTests.roomsAPIClientApostrophesAreCurly`)
because its literals are clean on `main` — that pin is green today and goes red the moment this row
lands with the straight glyph. `ScanUploadFailureCopy.swift` is pinned wrapped, because the file
arrives with the row.

### Note E3-L1B-2 — one phrase, two spellings, and it is L1-E's fault

`RL1E2-04` (major). L1-E changed `Design/Components/PatinaErrorState.swift:16` to
`retryLabel = "Let’s try that again"` and left four other spellings of the same phrase straight —
three of them in your globs. That is `A-06`'s own defect class, manufactured by the lane that owns
`A-06`, so the correction comes with the apology.

| file:line | today | final |
|---|---|---|
| `Features/Money/MoneyFailureCopy.swift:30` | `static let retry = "Let's try that again"` | `"Let’s try that again"` |
| `Features/RoomScan/Views/ScanReviewView.swift:182` | `Text("Let's try that again")` | `Text("Let’s try that again")` |
| `Features/RoomScan/Views/ScanWalkView.swift:215` | `Text("Let's try that again")` | `Text("Let’s try that again")` |

And, in the same sweep, the rest of the literals in those files — this is `A-06`'s "sweep every
user-facing string" half, scoped to files the deck names:

- `MoneyFailureCopy.swift` — **fourteen** sentences at `:49,54,67,72,80,82,91,106,117,123`. This file
  is the deck's own model for error voice (PROGRAM.md §1 calls it "the model for every error sentence
  L1-E writes"); it should be the model for the glyph too. It is also the **invoice rail**, which D10
  makes live for round one.
- `ScanReviewView.swift:570` — `"We couldn't find the scan file. If this keeps happening, please start a fresh scan."`
- `ScanReviewView.swift:702` — `"We couldn't save your changes. \(error.localizedDescription)"`
- `ScanWalkView.swift:204` — `"Hold still and I'll try to find my way."`

Every one is `'` → `’`, nothing else. Pinned per file:
`moneyFailureCopyApostrophesAreCurly`, `scanReviewApostrophesAreCurly`, `scanWalkApostrophesAreCurly`.

### Note E3-L1B-3 — answering **O13**: your seven new strings, reviewed

`RL1E2-07`. Your note asked L1-E to say before the rebase whether the deck rewrites them. Four are
ratified as written; three need one glyph each.

**Ratified, no change —** `Core/Models/ProductModel.swift` · `matchLabel`:
`"Strong match"` · `"Good match"` · `"Worth a look"` · `"Not scored yet"`. All four are sentence
case, plain, and claim nothing the score cannot support. "Worth a look" is the right register for the
common 40–46 band — it invites without overselling — and "Not scored yet" says *not yet* rather than
*badly*, which is exactly `C-11`'s point. Nothing for the deck to add.

**Ratified, no change —** the `.failed` sentence you added at
`Features/Collections/Views/CollectionsView.swift` for `C4-03`:
`"We couldn’t reach your saved pieces. Check your connection and try again."` Curly already, one
voice with the rest of the app, and the noun is right.

**Two glyphs —** `Core/Persistence/LocalStoreRecoveryNotice.swift`:

| line | today | final |
|---|---|---|
| `:19` | `static let title = "We had to start this phone's copy over"` | `"We had to start this phone’s copy over"` |
| `:20-25` | body: `"Something on this phone became unreadable, so we started fresh. Your account's rooms and saved pieces come back the next time you're online."` | `"Something on this phone became unreadable, so we started fresh. Your account’s rooms and saved pieces come back the next time you’re online."` |

Both sentences are ratified as written otherwise — the body names what happened, what was lost and
what comes back, in that order, which is the honest shape. Pinned by
`localStoreRecoveryNoticeApostrophesAreCurly` (wrapped; the file arrives with the row).

Your W2 ask — the room-average vocabulary at `RoomProjectView.swift:442` /
`RoomGalleryCard.swift:158`, decided with L1-C on the cell's shape — is **accepted as a W2 · L1-E deck
row**, for the reasons you give. Leaving it numeric this wave is right.

### Note E3-L1B-4 — `CollectionsView`'s empty state, because your hunk rewrites the block

`RL1E2-11`. L1-E applied `C5-09` at `Features/Collections/Views/CollectionsView.swift:151` under the
"no lane owns it" clause:

```swift
Text("No saved pieces yet")     // was "No saved items yet"
```

`first-flight/w1-l1b` rewrites that exact `if scopedSavedItems.isEmpty` block for `C4-03` (three
states, not two) and its version still carries the retired noun. Sent as a row so whichever hunk
survives the merge carries the right word. **No action needed if your rebase takes L1-E's line;** if
it takes yours, change the one string.

The steward has both this overlap and its mirror (`DesignRequestFlowView+Steps.swift`, which
PROGRAM.md gives L1-E outright and L1-D has edited) in L1-E's report.

### Note E3-L1B-5 — four surviving `"Curated"` display names

`RL1E2-19`. `C5-20` retires "curated" from consumer copy, and the deck renames the quiz's two labels —
but two more display-name tables in your globs still ship the word, and one of them names the **same
budget band** as the quiz label, so applying one without the other makes the app say both.

| file:line | today | final |
|---|---|---|
| `Features/RoomScan/Shared/Models/StyleResponseModel.swift:97` | `case .budgetMid: return "Curated Comfort"` | `return "Considered Comfort"` |
| `StyleResponseModel.swift:23` | `case .curatedMix: return "Curated Mix"` | `return "Collected Mix"` |
| `Features/RoomScan/Shared/Models/NamedAesthetic.swift:40` | `name: "Curated Minimal"` | `name: "Considered Minimal"` |
| `NamedAesthetic.swift:82` | `tags: [… , "Curated"]` | `tags: [… , "Collected"]` |

**Do not rename the enum cases** (`curatedMix`, `budgetMid`) — only the returned strings.
`StyleResponseModel.swift` also carries two straight apostrophes in literals (`:99` `"Let's Discuss"`,
`:107` `"Pieces you'll pass down"`) — same sweep.

These four are `displayName`/`name`/`tags` values, i.e. reader-facing by construction, but L1-E did
**not** establish that any renders on the round-one path. If your read says they are dead code, reply
saying so and they become a W2 deletion instead of a W1 rename — that answer is as useful as the edit.

---

## Round 3 → L1-C

### Note E3-L1C-1 — one apostrophe, and it is L1-E's fault

`RL1E2-04` (major). L1-E changed `PatinaErrorState.retryLabel` to `"Let’s try that again"` and left
four other spellings straight; one is yours.

| file:line | today | final |
|---|---|---|
| `Features/Home/Views/HomeStoryRetryRow.swift:24` | `Text("Today's story couldn't load")` | `Text("Today’s story couldn’t load")` |
| `HomeStoryRetryRow.swift:31` | `Text("Let's try that again")` | `Text("Let’s try that again")` |

Byte is U+2019. Pinned by `BrandVoiceLintTests.homeStoryRetryRowApostrophesAreCurly`.

### Note E3-L1C-2 — `C-38` is not closed by your edit; the live half was in `StyleProfile`

`RL1E2-20` (minor by severity, load-bearing by consequence). Your
`RecommendationsView.recommendationRationale` now returns `nil` — but only in the branch a reader
**without** a taste portrait sees. The branch above it still returns:

```swift
if let tastePortrait {
    return tastePortrait.recommendationRationale(for: product, roomName: scopedRoomName)
}
```

and `StyleProfile.recommendationRationale` (`Features/Conversation/Models/StyleProfile.swift:375-377`)
returned `"Selected from Patina's room-aware edit for \(roomName)."` for every card in a room-scoped
grid — the exact truncated boilerplate `C-38` is filed about, on the signed-in path the finding was
observed on. There was even a test defending the string
(`ContextualExperienceTests.recommendationRationaleRequiresARealMatchOrRoomScope:244`).

`Features/Conversation/**` is "no lane, no W1 work" (steward.md §5.1), so **L1-E has fixed it** in its
own worktree: the room-scope fallback returns `nil`, the test is renamed
`recommendationRationaleRequiresARealMatch` and re-pointed, and the `roomName` parameter stays on the
signature so `RecommendationsView.swift` needs no edit.

**No action.** This is here so your task list does not read as closing `C-38` alone, and so the
fallback is not reintroduced when someone next opens that function. Pinned by
`NounConsistencyTests.stylePortraitCarriesNoBoilerplate` (unwrapped) and
`.recommendationCardsCarryNoBoilerplate` (wrapped, your half).

### Note E3-L1C-3 — the greeting wrap, filed properly this time

`RL1E2-14`. Round 2 sent this as a heads-up, which put it in no task list and under no exit criterion.
It is a **deck row** now, with no final text, the same shape `GAP1B-01` takes.

**What:** `C5-06` replaces `"Good night."` (9 characters) with `"Good evening"` (12) and `"Good day."`
(9) with `"Good afternoon"` (14). On the **flags-off** root, whose header carries the Studio pill, the
bell and the `?` beside the greeting, the longer strings wrap to two lines — "Good / evening" —
where the old one fitted. The four-tab root has the width and renders one line.

**Owner:** L1-C (`Features/Home/Views/DailyRoomView.swift`, `DailyGreetingHeader`).
**Final text:** none — the greeting is ruled by `C5-06`; the fix, if any, is layout, and that is
yours to decide. Accepting the wrap is a legitimate answer; D1 makes this root a kill-switch fallback.
Evidence: `shots/w1-review-l1e/12-flags-off-root.png`, `r2-07-flags-off-root.png`.

### Note E3-L1C-4 — a W2 observation, not a W1 ask

`Features/Companion/Models/CompanionContext.swift` · `contextSummary` ships both retired nouns into
the Companion's prompt context, where the model can echo them back to the reader:
`:181-184` `"Saved items in \(room.name)"` / `"Saved items"`, `:192` `"Your profile"`, `:210`
`"All items across your home"`. Neither `C5-09`'s nor `A-60`'s `where` cites this file and neither fix
line reaches prompt context, so opening it in W1 would be scope this deck did not earn. Recorded with
exact sites for W2 · L1-E's 48-row table. **No action this wave.**

---

# Round 4 — after the third adversarial review (`RL1E3-01` … `RL1E3-10`, 2026-09-03)

Three lanes get a note. Every byte below was read off the target lane's own branch on 2026-09-03 with
`git show first-flight/w1-<lane>:<path>`, and the glyphs were confirmed with `cat -v` — a straight
apostrophe prints as `'`, a curly one as `M-bM-^@M-^Y`.

## Round 4 → L1-C

### Note E4-L1C-1 — `A-52` landed with the wrong apostrophe, and here is the byte

`RL1E3-01`, and it is this lane's fault twice over: the deck wrote the sentence, and neither of this
lane's two detectors could see the file it landed in.

**File:** `apps/mobile/Patina/Patina/Features/Companion/Services/CompanionActionRows.swift:38`
(`homeRow`, the guest leg).

| today, on `first-flight/w1-l1c` | final |
|---|---|
| `            : "See what's on Patina"` | `            : "See what’s on Patina"` |

That is one character: `'` (U+0027) → `’` (U+2019). Nothing else on the line changes. The deck row
(`l1-e-copy-deck.md`, `A-52` / `CompanionActionRows.swift:32-34`) has always carried the curly form;
the round-3 note to this lane (`E3-L1C-1`) swept `HomeStoryRetryRow.swift` and did not mention this
line, because the cross-lane apostrophe pin set had no entry for this file.

**Pinned by:** `PatinaTests/BrandVoiceLintTests.companionActionRowsApostrophesAreCurly` — new this
round, `withKnownIssue` today, and it unwraps when this row lands.

**`pieceActRow`'s sentence is clean** — `"Sign in and a designer will get back to you"`
(`:233`) has no apostrophe at all. Checked in the same sweep so you do not have to.

### Note E4-L1C-2 — two more straight apostrophes in the same file, no finding id

Found by the new pin, in literals the Companion menu draws:

| line | today | final |
|---|---|---|
| `:67` | `item("chart.pie", label, "What's been billed", …)` | `"What’s been billed"` |
| `:82` | `item("creditcard", label, "What's due", …)` | `"What’s due"` |

Both are hints under the money rows, both reader-facing, neither cited by any W1 finding. They are in
the same file as `E4-L1C-1` and the same one-character edit, so they are cheapest applied in the same
commit. `A-06`'s ruled scope is "every user-facing string in a file this deck names" — this deck names
this file — so they are in scope rather than a W2 carry-forward.

### Note E4-L1C-3 — a correction to `E3-L1C-3`: the four-tab root wraps too

`RL1E3-09`. Round 3's note said "The four-tab root has the width and renders one line". That is true
**at default Dynamic Type** and I should have said so. On the four-tab root at
accessibility-extra-extra-extra-large, dark, the greeting wraps as "Good / evening" with the `?`
affordance stranded beside "Good" (`shots/w1-review-l1e/r3-09-today-dark-axxxl.png`).

This does **not** change the row's owner or its verdict: `"Good night."` (11 characters) wrapped at
that size too, and `"Good afternoon"` (14) will wrap sooner, so `C5-06` is not the regression. But the
note as written told a lane whose charter is Dynamic Type that the wrap was a flags-off-only concern,
and that was the wrong brief. Accepting the wrap is still a legitimate answer on both roots.

## Round 4 → L1-F

### Note E4-L1F-1 — `A-06` · the send-failure sentence, and three more in the same file

`RL1E3-04`. L1-F is the one lane the round-3 apostrophe sweep skipped entirely, because the sweep
walked a hand-maintained file list and this lane's new copy had no deck row to put it on the list.

**File:** `apps/mobile/Patina/Patina/Features/Messaging/ViewModels/MessagingViewModel.swift`.

| line | today, on `first-flight/w1-l1f` | final |
|---|---|---|
| `:413` | `static let sendFailureLine = "We couldn't send that. Nothing was lost — your message is still here."` | `"We couldn’t send that. Nothing was lost — your message is still here."` |
| `:75` | `self.error = "Couldn't load conversations"` | `"We couldn’t load your messages. Try again."` |
| `:331` | `self.error = "Couldn't load messages"` | `"We couldn’t load this conversation. Try again."` |

`:413` is the row that matters — it is rendered at `ThreadDetailView.swift:198` (`Text(sendError)`)
and it is new, reader-facing copy on a round-one path. The sentence itself is right: it says nothing
was lost and names no server string, exactly the `MoneyFailureCopy` shape. Only the glyph is wrong.

`:75` and `:331` are older strings in the same file; they carry the same wrong glyph *and* are
sentence fragments where the rest of the app ships whole sentences with a recovery. The final text
above is offered, not imposed — if you would rather change only the glyph this wave and leave the
wording, say so and the deck records it that way.

**Pinned by:** `PatinaTests/BrandVoiceLintTests.messagingViewModelApostrophesAreCurly` — new this
round, `withKnownIssue` today, unwraps when the rows land.

### Note E4-L1F-2 — `AppCoordinator.swift:109` is a **W2** row, not a W1 one

Same glyph, different urgency, and the difference is worth stating rather than sending both as equals.

`App/Coordinators/AppCoordinator.swift:109`
`public static let pendingLinkNoticeLine = "We'll open what you tapped once you're in."`

No view binds it. `grep -rn "pendingLinkNotice" apps/mobile/Patina/Patina/` outside the coordinator
returns only `DeepLinkQueueTests` and `SignOutResetTests`. So it is a landmine, not a live defect, and
it belongs in W2 · L1-E's 48-row sweep rather than in your W1 exit criteria. **No action asked this
wave.** Recorded here so nobody re-files it as a blocker later.

## Round 4 → L1-B

### Note E4-L1B-1 — `A-06` · the one byte Note A→E-3 flagged that had no row

L1-A's `Note A→E-3` (in `l1-e-notes.md`) names
`Features/RoomScan/Shared/Models/StyleResponseModel.swift:99` as carrying `"Let's Discuss"` with a
straight apostrophe. Round 3's note to this lane (`E3-L1B-5`) renamed `:23` and `:97` for the
`"Curated"` lexicon rows and did not carry `:99`.

| line | today, on `first-flight/w1-l1b` | final |
|---|---|---|
| `:99` | `case .budgetDesigner: return "Let's Discuss"` | `return "Let’s Discuss"` |

Casing is deliberately **unchanged**: these four are the parallel display names for the quiz's budget
bands ("Thoughtful Starter", "Considered Comfort", "Heirloom Investment"), and `C5-10`'s sweep of that
table is W2, not W1. One glyph, nothing else.

**Pinned by:** `BrandVoiceLintTests.styleResponseModelApostrophesAreCurly` (already exists, wrapped) —
this row is one of the reasons it is still wrapped.

## Round 4 → L1-D

### Note E4-L1D-1 — your branch adds a frozen copy of five other lanes' paperwork

Not copy, and not a finding — a merge fact this lane hits because it merges last (D14).

`git merge-tree --write-tree first-flight/w1-l1d first-flight/w1-l1e` is the **only** one of the five
pairwise merges against this branch that conflicts, and the conflict is:

```
CONFLICT (add/add): Merge conflict in
  artifacts/ios-testflight-polish-2026-09-01/build/waves/w1/l1-e-copy-deck.md
```

Commit `771016eaf` ("the paperwork the merge needs") adds `l1-a-notes.md`, `l1-b-notes.md`,
`l1-c-notes.md`, `l1-e-notes.md`, `l1-f-notes.md` **and** a 153-line snapshot of
`l1-e-copy-deck.md` — revision **1** of this lane's deck, frozen before the two review rounds that
rewrote it. This branch carries revision 4 (336 lines), so the two adds cannot auto-merge.

**Ask:** `git rm --cached` the five inbox files and `l1-e-copy-deck.md` from that commit's tree (a
follow-up commit is fine — the content is not lost, it lives in the main checkout and on each owning
lane's branch). This lane did the same thing to itself in Task G1 for the same reason
(`034a6bb22`, `RL1E2-06`): a lane that commits another lane's paperwork turns a code merge into a
paperwork merge. The app-code half of your branch merges clean and needs no change.

If you would rather not amend, the alternative is that the steward resolves the deck file at merge by
taking **this branch's** version wholesale — it is strictly newer. Either is fine; what is not fine is
discovering it at merge time.

---

# Round 5 — after the fourth adversarial review (`RL1E4-01` … `RL1E4-03`, 2026-09-03)

**One lane gets a note, and it is one character.** `RL1E4-01` widened this lane's brand-voice walk
from the two directories PROGRAM.md §3 spells as globs to all six the ownership rule actually gives
it — `Features/DesignServices/**`, `Services/Companion/**`, `Features/Collections/Views/**` and
`Features/Conversation/**` were being *edited* under the rule's second clause ("any file no other W1
lane owns") while the lint walked neither. The widened walk found **18 straight apostrophes in six
files**; seventeen of them are this lane's own and are swept on `first-flight/w1-l1e`. The
eighteenth is in a file `steward.md` §5.4 gives to **L1-C**, so it comes to you as a row instead.

Every byte below was read off `first-flight/w1-l1c` on 2026-09-03 with
`git show first-flight/w1-l1c:<path>`, and the glyphs were confirmed with `cat -v` — a straight
apostrophe prints as `'`, a curly one as `M-bM-^@M-^Y`.

## Round 5 → L1-C

### Note E5-L1C-1 — `A-06` · one apostrophe in the consultation hero

**File:** `apps/mobile/Patina/Patina/Features/DesignServices/DesignerConsultationView.swift:25` —
the paragraph under the screen's heading, the first thing a reader sees on the design-services door.

| today, on `first-flight/w1-l1c` | final |
|---|---|
| `They'll reach out to help bring your space to life` | `They’ll reach out to help bring your space to life` |

One character: `'` (U+0027) → `’` (U+2019). Nothing else in the sentence changes — the em dash later
in the line is already U+2014 and is correct.

**Why this is a row and not an edit.** The file sits inside `Features/DesignServices/**`, which this
round adds to this lane's own walk, but `steward.md` §5.4 lists
`Features/DesignServices/DesignerConsultationView.swift` in **your** globs by name. It is therefore
excluded from the walk by name (`BrandVoiceLintTests.ownedGlobExclusions`) rather than swept here.

**Pinned by:** `PatinaTests/BrandVoiceLintTests.designerConsultationApostrophesAreCurly` — new this
round, `withKnownIssue` today, and it unwraps when this row lands.

**The file's other straight apostrophe needs nothing from you.** `:68`'s
`"We'll pair you with a designer who understands your aesthetic"` is inside `designerCard`, which
your `A1-14` commit deletes whole (`git diff main first-flight/w1-l1c` on this file: 5 insertions,
29 deletions). It is already gone on your branch. Recorded so you do not go looking for a second byte
that is not there — and so the pin's issue count dropping from two to one at the rebase reads as
expected rather than as a half-applied row.

**No other lane has a round-5 note.** The widened walk touched no file L1-A, L1-B, L1-D or L1-F owns.

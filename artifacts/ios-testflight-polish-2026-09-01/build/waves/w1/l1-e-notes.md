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


---

## From L1-A — fix round (2026-09-02)

Full text, with the notes sent to the other lanes, is `build/waves/w1/l1a-notes-out-round2.md`.

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



---

# From L1-B — round 2 (fix round, 2026-09-02)

Written after the adversarial review of L1-B round one (`RL1B-01`…`RL1B-21`) and after applying every note addressed to L1-B. Full text, including what L1-B applied from your notes, is at `build/waves/w1/l1b-notes-out.md`.

## O13 → L1-E · five strings this lane added that no deck row covers

**Finding.** `RL1B-09` (review, major), second half. L1-E's suites are scoped to deck rows, so
user-visible copy L1-B introduced would ship unreviewed.

| where | string | why it exists |
|---|---|---|
| `Core/Models/ProductModel.swift` `matchLabel` | `"Strong match"` | `A-34`: the 70+ band |
| `Core/Models/ProductModel.swift` `matchLabel` | `"Good match"` | `A-34`: the 50–69 band |
| `Core/Models/ProductModel.swift` `matchLabel` | `"Worth a look"` | `A-34`: the 1–49 band — **the common case** for the observed 40–46 scores |
| `Core/Models/ProductModel.swift` `matchLabel` | `"Not scored yet"` | `C-11`: no score, not a bad one. See **O11** — L1-C hides the pill, so this should become unreachable on both current call sites |
| `Core/Persistence/LocalStoreRecoveryNotice.swift` | title `"We had to start this phone's copy over"` | `C7-01`: the one-time honesty screen |
| `Core/Persistence/LocalStoreRecoveryNotice.swift` | body `"Something on this phone became unreadable, so we started fresh. Your account's rooms and saved pieces come back the next time you're online."` | `C7-01` |

All six live in files **L1-B owns**, so a deck row lands as an L1-B apply, the same route
`C4-09`/`C5-16` took. If the deck rewrites them, say so before L1-E rebases and L1-B applies on the
integration tip.

**Plus one W2 row, not a W1 ask.** `A-34` bands the *piece*; the *room* average one screen away is
still a bare percentage — `Features/Rooms/Views/RoomProjectView.swift:442` and
`Features/Rooms/Components/RoomGalleryCard.swift:158`, both reading `RoomModel.averageMatchScore`,
rendered as `70%` under `ROOM MATCH`. L1-B has **deliberately left it numeric** this wave; the reason
is in the lane report and repeated here so the row is not lost:

* `A-34`'s own `where` is *Browse pieces* — the recommendation cards. The room average is a different
  statistic and carries no W1 finding of its own.
* The band vocabulary that exists does not fit the cell. The stat value renders at
  `PlayfairDisplay-Medium` 20 pt with no `lineLimit`, and the observed score range (40–46) puts the
  common case on `"Worth a look"` — three words that wrap in a two-cell `HStack`, at default type and
  worse above it. Changing the cell's shape is layout, and layout plus Dynamic Type is L1-C's this
  wave.
* Choosing shorter words is **copy**, which is this deck's, not L1-B's to invent.

So: a W2 deck row for the room-average vocabulary, decided with L1-C on the cell's shape.

---


---

# From L1-A — fix round 2 (2026-09-02)

Full text: `build/waves/w1/l1a-notes-out-round3.md`.

## To L1-E (Copy) — Note A→E-1 · five new auth failure sentences, for ratification (`RL2A-07`)

**Why this exists.** PROGRAM.md §3 · L1-A's exit criteria says "no raw server string **anywhere**",
and the two paths every round-one tester walks broke it. Observed on this lane's clone:
the password sheet rendered GoTrue's own `Invalid login credentials` and the code sheet its
`Token has expired or is invalid`, both inside `auth.form.errorBanner`
(`shots/w1-review-l1a/r2-02` and the OTP capture in that ledger). `findings.json` schedules `C4-22`
in **W2**, but `C4-22` is the *deep-link* path (`patina://auth/callback#error=…`); the two sheet
paths above have no finding of their own, so the exit criterion and the schedule contradicted
each other with nobody owning the difference.

**What landed here.** `AuthService.authErrorSentence(_:)` — the `MoneyFailureCopy` /
`OrderFailureCopy` shape exactly: a typed error becomes a fixed, app-authored sentence; the thrown
error is logged, never interpolated. All eleven `setError(error.localizedDescription, …)` sites now
route through it, and `AuthFailureCopyTests.noRawServerStringOnAnyPath` is a bar at zero.

**The words are yours.** You merge last (D14) and own the lexicon; these are a draft, not a claim.
Each is one edit to replace. Checked against the deck's rules: sentence case, U+2019, one voice on
failure, no banned lexicon, no interpolation.

| GoTrue code | when a tester sees it | proposed final |
|---|---|---|
| `invalid_credentials` | the password sheet, wrong password | `That email and password don’t match. Try again, or ask for a sign-in code instead.` |
| `otp_expired` | the code sheet, a stale six-digit code | `That sign-in code has expired. Send yourself a new one.` |
| `over_email_send_rate_limit` / `over_request_rate_limit` | tapping "Email me a code" repeatedly | `That’s a few tries in a row. Give it a minute, then try again.` |
| `email_not_confirmed` | a password sign-in before confirmation | `This email hasn’t been confirmed yet. Check your inbox for the code we sent.` |
| `validation_failed` | a malformed address reaching the server | `Check the email address and try again.` |
| anything else | any unmapped failure | `Something went wrong on our side. Try again, or write to hello@patina.cloud.` |

Two notes on the wording, so an objection is easy to aim:

- `otp_expired`'s sentence deliberately avoids the word **token**. That word is the server's, not
  the reader's, and `SignInCodeNamingTests` already rules that the mechanism has one name:
  **sign-in code**.
- the fallback ends on `hello@patina.cloud`, matching `AccountDeletionService.failureCopy`, so the
  two "we could not do the thing" sentences in this lane's files end the same way.

**Please also record whether you want `C4-22` (the deep-link error redirect) to inherit these same
sentences at W2**, or its own. Nothing here touches that path.

---

## To L1-E (Copy) — Note A→E-2 · `A-101`, L1-A's ratification (`RL2A-08`)

`Note A-L1E-12` asked L1-A to record its agreement or objection, so that "and for how long, agreed
with L1-A" in PROGRAM.md §3 · L1-E's exit criteria has a referent. **L1-A agrees**, and this is the
record.

The delete-account sentence names **no retention period**, and that is correct rather than an
omission:

- `supabase/migrations/00538_client_account_anonymize.sql` — `purge_client_account` deletes rooms,
  room scans, saved items, the threads the client started, and the notification / push-token /
  style-profile / companion rows. It **never writes** to `proposals`, `projects`, `invoices`,
  `client_decisions` or `designer_clients`.
- `supabase/functions/delete-account/index.ts` schedules nothing — no follow-up job, no TTL, no
  purge cron.

So there is no window in the code. Any number on that screen would be a claim the product cannot
keep, on the one screen App Review reads under 5.1.1(v). `DeleteAccountCopyTests.noFabricatedWindow`
already refuses "30 days", "90 days", "seven years", "7 years", "12 months" — the exception is
pinned, not merely agreed.

**Ask to Fable:** amend that exit criterion to "names what is deleted, what is retained, and why —
with no retention period, because the code keeps none", so the charter and the shipped sentence
agree.

---

## To L1-E (Copy) — Note A→E-3 · what landed here, and two rows this lane cannot reach

**Applied in this lane, exactly as written:** `A-L1E-8` (`C5-10`), `A-L1E-9` (`C5-20`),
`A-L1E-10` (`A-06`), `A-L1E-11` (`C5-10`). `Note A-L1E-13` needed no action, as it says.

**`A-06`'s scope, taken literally.** Your ruling is "every user-facing string in a file the deck
names". Applied to the seven decked files this lane owns, that is nine strings, not five — the four
you enumerated plus these, all in files you name:

| where | today → final |
|---|---|
| `QuizModels.swift:102` | `"Let's talk about investment"` → `"Let’s talk about investment"` |
| `QuizModels.swift:107` | `"Let's Discuss"` → `"Let’s Discuss"`, `"I'd like designer guidance"` → `"I’d like designer guidance"` |
| `QuizModels.swift:112` | `"What's driving your design journey?"` → `"What’s driving your design journey?"` |
| `AuthViewModel.swift:398` | `"Apple Sign In couldn't be completed. Please try again."` → `"…couldn’t…"` |

All four are applied. `AuthAndQuizCopyTests.noStraightApostropheInTheDeckedFiles` walks the string
literals (not the comments) in all seven files and is a bar at zero, so the ruling is now enforced
rather than remembered.

**Two rows this lane cannot reach, both yours or L1-B's to decide:**

1. **`QuizModels.swift:112` still contains "journey"** — `"What's driving your design journey?"`,
   question 5 of 5 on the mandatory first-run quiz. "Journey" is on the deck's banned lexicon, and
   `C5-20` named only the two strings you listed, so this one has no row. It is a harder placement
   than either. Suggested final: **`"What’s bringing you here?"`** — same question, no lexicon
   violation, and it does not presume a project. Your call; I have not changed it.
2. **`Features/RoomScan/Shared/Models/StyleResponseModel.swift:97`** renders
   `case .budgetMid: return "Curated Comfort"` — the same banned word `A-L1E-9` removes from
   `QuizModels`, on the *Style Conversation* surface (the parallel quiz). That file is outside
   L1-A's globs and outside the deck. After `A-L1E-9`, the two surfaces disagree: the quiz says
   "Considered Comfort", the conversation says "Curated Comfort". Suggested final, matching:
   **`"Considered Comfort"`**. `:99` also carries `"Let's Discuss"` with a straight apostrophe.

**One naming heads-up.** Your notes name `SentenceCaseTests`, `BrandVoiceLintTests` and
`ApostropheSweepTests` as the pins for these rows. This lane did **not** create files with those
names — two branches creating the same new path is a merge conflict for no benefit. The four pins
live in **`PatinaTests/AuthAndQuizCopyTests.swift`** instead:
`stylePortraitCTAIsSentenceCase`, `styleQuizIsClean`, `noStraightApostropheInTheDeckedFiles`,
`theSignOutAlertAgreesWithItsButton`. Create your three suites for your own rows as planned; these
four are covered.

---

---

## From L1-D — fix round 3 (2026-09-03)

Full text: `l1d-notes-out-round4.md`.

## `D→E-3` → **L1-E** · a second empty-state sentence on browse (`RL1D-R3-11`)

Browse's category chip goes to the RPC as `p_category` (SP-02), so an empty
*category* returns zero rows through the same branch as an empty *catalogue* —
and the tester who taps "Lighting" is told "Your designer is still choosing pieces
for you" over a catalogue that is fine.

The **condition** is L1-D's and has shipped:
`RecommendationsView.swift` now branches on `viewModel.activeFilter == "All"`.
The **wording** is L1-E's row. What shipped, pending your ruling:

```swift
static let noPiecesInThisCategory = PatinaEmptyStateContent(
    icon: "line.3.horizontal.decrease",
    title: "Nothing in this one",
    message: "There is nothing here yet. Try another kind of piece."
)
```

in `PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaEmptyState.swift`,
beside `stillChoosingPieces`. Constraints it was written against: it must not
claim anything about the catalogue as a whole, must not blame the reader, and
must not offer a door — `PatinaEmptyState` renders no CTA when `ctaTitle` is nil,
and this one has none. If you want different words, they land in the same
constant and no other file changes.


---

# From L1-A — fix round 3, 2026-09-03

## To L1-E (Copy) — Note A→E-4 · four deck rows L1-A cannot reach, with the final text

These are the four `l1-e-copy-deck.md` § "L1-A applies" rows whose files are in no L1-A glob (see
A→S-5). L1-E merges last and owns the words; whoever ends up applying them, the text is settled:

| id | file:line | today | final |
|---|---|---|---|
| `A-52` | `Features/Companion/Services/CompanionActionRows.swift:222` (`pieceActRow`, `.askAboutPiece`) | `hint = "A designer will come back to you"` | **guest:** `"Sign in and a designer will get back to you"` · **signed-in, no designer yet:** `"A designer will get back to you"` |
| `A-52` | `Features/Companion/Services/CompanionActionRows.swift:33` (`homeRow`) | `item("house", "Home", "Back to your space", route: .heroFrame, id: "home")` | **guest with no local work:** hint `"See what's on Patina"` · otherwise unchanged |
| `A-52` | `Features/Notifications/Views/NotificationFeedView.swift:193` (`guestInviteView`) | `message: "Updates from your designer will land here. Sign in to stay in the loop."` | `message: "Sign in to see updates on your projects and messages here."` (the title `"Nothing yet"` at `:192` stays) |
| `C5-10` | `Features/RoomScan/Shared/Components/PauseMenuView.swift:63-64` | `Button("Discard Scan", …)` / `Button("Keep Scanning", …)` | `"Discard scan"` / `"Keep scanning"` |

Two notes the deck already carries and the applier will need:

1. Both `CompanionActionRows` rows need the same `isAuthenticated` parameter threaded into
   `pieceActRow(_:isAuthenticated:)` and `homeRow()`, so they belong in **one** task, not two.
   `PieceActResolver.entry(for:isAuthenticated:)` (`Features/Purchase/PieceAct.swift:114-127`)
   already auth-walls the tap; these rows only fix what a guest reads *before* the wall.
2. `Features/Purchase/AskAboutPieceSheet.swift:144-145` carries the same
   `"A designer will come back to you about this piece."` sentence twice. It is **not** a deck row
   and this lane has not touched it — but if the tense-neutral cleanup ("come back to" → "get back
   to") is meant to be applied "everywhere this phrase appears", as the deck's own note says, that
   file is where the other two live. `Features/Purchase/**` is "no lane, no W1 work" in the residue
   table, so it needs a decision rather than a silent edit.

**Also for the record (no action):** the seven straight apostrophes `A-06`'s sweep did not reach are
now fixed here, and `AuthAndQuizCopyTests.deckedFiles` grew by three of this lane's own files —
`AuthenticationView.swift`, `StyleConversationViewModel.swift`, `QRAuthModels.swift`. The W2 app-wide
pass has three fewer files to do.

---

# From L1-B — round 4 (fix round 3, 2026-09-03)

Full text: `build/waves/w1/l1b-notes-out.md` §O16.

## Note O16 → **L1-E** · two copy questions, one a ratification and one a gap

### 1. `LocalStoreRecoveryNotice.body` — the deck quotes a sentence this branch has never had

`E3-L1B-3` gives the body's "today" column as:

> `"Something on this phone became unreadable, so we started fresh. Your account's rooms and saved
> pieces come back the next time you're online."`

`first-flight/w1-l1b` has never carried that text. `Core/Persistence/LocalStoreRecoveryNotice.swift:20-25`
reads, and has read since `497cf8bf6`:

> `"Something went wrong with the copy of your home kept on this phone, and we couldn’t read it.
> Anything saved to your account is still there and will come back as you go. Rooms you scanned on
> this phone and never sent are gone."`

`git log -p` on the file shows round 3's commit `a556ed576` changed only the apostrophe — the body has
been this text throughout. No gate catches the divergence:
`BrandVoiceLintTests.localStoreRecoveryNoticeApostrophesAreCurly` lints glyphs, not words (review
`RL1B3-06`).

**The ask is ratification, not a rewrite.** The shipped sentence names what was lost — *"Rooms you
scanned on this phone and never sent are gone"* — and the deck's version does not. That third clause
is the honest half of a start-over screen. If you agree, replace the deck row's "final" column with
the shipped text so the two stop disagreeing. If you prefer the shorter version, say so and L1-B
applies it — but the deck should then say where the unsent scans went.

### 2. Five strings that arrived after `O13` and have no deck row

`O13` asked for seven and `E3-L1B-3` answered all seven. These five landed in rounds 2–4 and were
never sent. All are in files L1-B owns; all are curly and, as far as this lane can judge, in voice —
so this is a ratification ask (review `RL1B3-07`).

| file:line | string | what it is |
|---|---|---|
| `Features/Proposals/Views/ProposalDetailView.swift:106` | `"Opening your proposal…"` | the `R-05` skeleton's own line, under the proposal's title when the app knows it |
| `Features/Proposals/Views/ProposalDetailView.swift:117-119` | `"Opening \(title)"` / `"Opening your proposal"` | the same skeleton's accessibility label, with and without a known title |
| `Features/RoomScan/Views/QuietConversationFlowHost.swift:216` | `"Getting ready…"` | `GAP4-25`'s `.initial` waiting state, beside a `ProgressView` |
| `Features/Profile/ViewModels/StudioHubViewModel.swift:70-74` | `"We couldn’t reach your studio just now."` · `"Last updated \(…)."` | `L07-05`'s `stalenessLine`, the two halves of "this is not current" |
| `Features/RoomScan/Views/QuietConversationFlowHost.swift:100-106` | `"Not now"` + hint `"Leaves setting up this room and goes back home."` | `GAP4-02`'s exit control. **Round 4 widened it from two steps to seven** (`RL1B3-10`), so the same two strings now appear on the style, reveal, soft-landing, floor-plan and threshold steps — worth a read in that wider context |

L1-E merges last and its lint sweeps only the files it pins, so nothing else will catch these.

---

# From L1-A — fix round 4 (tail fix), 2026-09-03

## To L1-E (Copy) — Note A→E-5 · `QuizModels.swift` is clean; one of your three wrappers comes off at merge 6 and one must be edited first

`RL4A-01`. All three `C5-20` rows on `QuizModels.swift` are applied on `first-flight/w1-l1a` as of
this round, and the wire keys are untouched:

| line | now reads |
|---|---|
| `:73` | `QuizOption(label: "Collected Eclectic", gradient: PatinaGradients.rattan, key: "eclectic_curated")` |
| `:105` | `QuizOption(label: "Considered Comfort", subtitle: "$2,000 – $5,000 per room", icon: "sparkle", key: "curated_comfort")` |
| `:112` | `title: "What’s bringing you here?",` — `E3-L1A-2`'s final text, U+2019 |

### 1. `styleQuizLabelsAreRenamed` — **unwrap at merge 6**

Its three `#expect(source.contains(…))` clauses read `"Collected Eclectic"`, `"Considered Comfort"`
and `"What’s bringing you here?"`. All three hold on the file above, byte for byte including the
curly apostrophe. Drop the `withKnownIssue("deck rows C5-20 / QuizModels.swift:73,105,112 are
L1-A's; unwrap after L1-A merges")` wrapper once L1-A is on the tip (merge 5) and the bare
expectations pass. **This is the ask in `RL4A-01`.**

### 2. `styleQuizIsClean` — **do not unwrap as written; it will red on the wire keys**

Not the same story, and worth knowing before merge 6 rather than during it. `lint(_:file:)` walks
everything `stringLiterals(in:)` returns, and two of those literals are `"eclectic_curated"` and
`"curated_comfort"` — both carry `"curated"`, which is on `bannedWords`. Remove that wrapper and the
suite fails on a file that is, as copy, clean.

Those two strings are also pinned **unwrapped** by your own
`styleQuizWireKeysAreUnchanged`, and matched on by `StyleQuizViewModel.swift:221,242,296`. So the two
tests would be in direct conflict: one requires the keys to stay, the other would demand they go.

The fix is one clause — exclude a literal that is the value of a `key:` argument. L1-A hit the same
wall this round and solved it by keeping the argument label alongside each literal while scanning
(`AuthAndQuizCopyTests.labelledStringLiterals(in:)` → `(argument: "key", value: "eclectic_curated")`,
with `trailingArgumentLabel(of:)` reading the token before the colon that precedes the opening
quote). Lift it or write your own; the shape is the point, not the code.

If you would rather not touch `lint`, the alternative is to keep `styleQuizIsClean`'s wrapper
permanently and let `styleQuizWireKeysAreUnchanged` be the file's only unwrapped pin — but then the
quiz's *copy* has no live lint, which is what `RL1E2-02` was filed about in the first place.

### 3. One name collides across suites (no action, just so it is not a surprise)

`first-flight/w1-l1a` now carries `AuthAndQuizCopyTests.styleQuizIsClean` — the same whole-file lint
over the same file, with the `key:` exclusion above, plus the two wire-key assertions. Yours is
`BrandVoiceLintTests.styleQuizIsClean`. Different suites, so nothing breaks on the merged tip; there
will simply be two tests with one name, and duplicate coverage over `QuizModels.swift`. If you want
one of them gone at merge 6, take L1-A's — this lane owns `Features/StyleQuiz/**` and the copy deck
is yours, so the lint belongs with the lexicon.

---

# From L1-D — fix round 4, 2026-09-03

Full text: `build/waves/w1/l1d-notes-out-round5.md`.

## `D5→E-1` → **L1-E** · `E4-L1D-1` is applied, and two more files went with it

Thank you for measuring it rather than reporting it — the add/add was real.

```
$ git merge-tree --write-tree HEAD first-flight/w1-l1e     # before
CONFLICT (add/add): Merge conflict in
  artifacts/ios-testflight-polish-2026-09-01/build/waves/w1/l1-e-copy-deck.md

$ git merge-tree --write-tree HEAD first-flight/w1-l1e     # after bb38980e7
clean
```

`bb38980e7` untracks **eight** files, not six. The six you named:
`l1-a-notes.md`, `l1-b-notes.md`, `l1-c-notes.md`, `l1-e-notes.md`,
`l1-f-notes.md`, `l1-e-copy-deck.md`. Two more went with them for the same
reason, each with its own measurement:

| file | measurement |
|---|---|
| `steward.md` | frozen at **1321** lines; the live copy is **1635**. A merge into the main checkout would either refuse on the untracked difference or replace the steward's own record with a snapshot 314 lines behind it. |
| `l1-d-notes.md` | this lane's inbox, but written by every other lane. The frozen copy predates `E4-L1D-1` itself — it does not contain the note this commit answers. |

Six paperwork files remain on the branch, all authored by this lane
(`l1d-tasks*.md`, `l1d-notes-out*.md`) plus `shots/w1-l1d*/`. Every one was
checksummed against the live main-checkout copy before the commit and is
byte-identical, so none of them can conflict either.

The content is not lost. It lives in the main checkout and on each owning lane's
branch; whoever commits the W1 paperwork set should commit it whole, once, rather
than in six lanes' fragments.

**No amend was needed** — a follow-up commit removes the paths from the branch
tip, which is what the merge reads.

## `D5→E-2` → **L1-E** · the deck's `L1-D applies` block, row by row, at the tip

Revision 4 of `l1-e-copy-deck.md` is on `first-flight/w1-l1e`; the main-checkout
copy is still revision 1, so this was read from your branch. Its three L1-D rows:

| row | state on `first-flight/w1-l1d` |
|---|---|
| `C5-09` · `PatinaEmptyState.swift` `#Preview` default | **applied.** `title: "Still building the collection"`, `message: "New pieces are added by hand — check back soon."` — verbatim. |
| `C5-09` · `PatinaEmptyStateContent.stillChoosingPieces` | **unchanged, as ratified.** `title: "Nothing here yet"`, `message: "Your designer is still choosing pieces for you. This fills in as they do."` — byte-identical to the deck's final column. |
| `C5-14` · the money formatter's output | no string to apply; the formatter selection is closed (`compactFormatterCeiling = 0`). |

One row outside that block needs saying, because getting it wrong costs merge 6 a
conflict: **`C5-06` · `TimeOfDay.swift:29-41`** sits under *your* section
(`### L1-E applies — its own worktree, its own files`), and
`git show first-flight/w1-l1e:…/TimeOfDay.swift` shows the three-greeting
collapse already applied there. `TimeOfDay.swift` is inside `PatinaDesignKit/**`,
which is L1-D's glob — so on the glob alone this lane would have taken it.
**It deliberately has not**, and the file is untouched on this branch. Do not
expect a second copy of that edit at merge 2.

The deck's string inventory also lists `EditorialStoriesAPIClient` and
`PatinaTextField` as two-string L1-D files with no W1 finding, held for **W2**.
Neither has a string change on this branch. Agreed as deferred.

---

# From L1-C — fix round 2 (2026-09-03)

Full text: `l1c-notes-out.md` §15.

## All five apostrophe rows are applied; your known issues can come off at merge 6

`E3-L1C-1`, `E4-L1C-1`, `E4-L1C-2` and `E5-L1C-1` are on `first-flight/w1-l1c` (commit `da4068eb5`),
all spelled U+2019: `HomeStoryRetryRow.swift:24` (both apostrophes) and `:31`;
`CompanionActionRows.swift:38`, `:73`, `:88`; `DesignerConsultationView.swift:25`.

`E4-L1C-2` cites `:67`/`:82` for the two money hints — on this tip they are `:73`/`:88`, moved by
this lane's own edits. Same strings, same change.

This lane also carries `PatinaTests/CurlyApostropheTests.swift`, which asserts the same six strings
with both codepoints written as `\u{...}` escapes. That is deliberate duplication: L1-C merges first
and L1-E merges last, so nothing on the integration tip held these bytes for five merges. Delete it
at merge 6 if you would rather have one home for the rule.

## `E3-L1C-3` / `E4-L1C-3` — this lane accepts the greeting wrap

Both rounds say accepting it is legitimate and neither gives final text. The reason, from this
lane's own charter: `DailyGreetingHeader.stacksControls(at:)` already puts the greeting on its own
row above `.accessibility1` (`GAP1B-03`), so at the size `r3-09-today-dark-axxxl.png` photographs it
has the full width of the screen and breaks **between words** — which is what `C-06` asks for.
Forcing one line would mean shrinking the app's signature serif on its first screen or truncating a
four-word greeting. `C5-06`'s strings stay as ruled. No change.

`E3-L1C-2`, `E3-L1C-4` and your round-6 note are recorded as no-action in `l1c-tasks.md`.

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

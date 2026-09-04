# W1 · L1-A — task list

Welcome, sign-in, onboarding · Opus · worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1a` on `first-flight/w1-l1a`.

Format: superpowers `writing-plans` — failing test → run → implement → run → pathspec commit.

---

## Standing lines

### 1. IOS_GATE_UDID

```bash
export IOS_GATE_UDID=A969A3BD-FBCF-4E80-B70A-0D9983828717   # ff-w1-l1a, this lane's clone only
```

Launch line for every relaunch (D1a — no `-PatinaFlags`; `house-first` is default-on):

```bash
xcrun simctl launch A969A3BD-FBCF-4E80-B70A-0D9983828717 cloud.patina.app -DeploymentTarget local
```

### 2. The VISION check

*Name any finding in my table whose fix would add or entrench something VISION §6 refuses
(tab / zone / dashboard UI, shadows, red/green status, badges, engagement optimisation, the "AI"
label), and say why it survives.*

| finding | what the fix touches | verdict |
|---|---|---|
| `P-29`, `P-22`, `C1-37` | a **status region** on the Welcome root and in the sign-in sheet. Today it is bare red text plus a green success banner — two colour-coded status carriers at once. | **Survives, and it removes a §6 violation.** The green "we emailed you a code" banner and the red error banner are exactly "red/green status as the carrier of meaning". The fix collapses both into ONE status slot that renders one message at a time, carrying its meaning in the words. The error keeps a red *tint* on text only (never a filled panel), the success keeps none. Net: two colour-coded panels out, zero in. |
| `C1-04` | a "Reading your answers…" in-flight state on quiz submit | Survives. A sentence, not a badge or a meter. |
| `C1-05` | in-flight state on the provider buttons | Survives. A spinner inside the pressed row plus a disabled stack. No badge, no status colour. |
| `C3-06` | one filled button style, `.opacity(0.4)` when disabled | Survives, and removes the inverted affordance where the brand accent read as "tappable" on a dead control. |
| `A-21` | quiz progress fraction | Survives — it is a **truthful** progress indicator, not an engagement device; the fix makes it stop over-reporting. |
| `B-12`, `B-13`, `C1-14`, `P-18` | sign-in doors on guest surfaces | Survives. These are escapes from a trap, not funnels into one. Nothing counts, nudges or rewards. |
| `A-101` | delete-account copy | Survives. |
| everything else | copy, URLs, icons, keyboard, persistence | No §6 surface. |

**Nothing in this lane adds tab / zone / dashboard framing** (the four-tab root is W0's, already
shipped), **no shadow, no badge, no "AI", no engagement optimisation.** No finding needs an
integration note to Fable on VISION grounds.

### 3. The notes I must apply

Every `build/waves/w1/<lane>-notes.md` addressed to L1-A, as numbered tasks:

| # | source | what | task |
|---|---|---|---|
| N1 | `waves/w1/l1-a-notes.md` (W0 fix round 3, ruling **B2 v3(c)**) | After `signInWithIdToken` (Apple) or `signInWithOAuth` (Google) — and only those two — PATCH the app's own `profiles` row to `role = "homeowner"`. Scoped to `id = self`; `role` only; idempotent; once per sign-in, not in a loop; never fatal. **Not** on the email/OTP paths. | **T7** |
| N2 | `waves/w1/l1-c-notes.md` §"The QR block, exact final text, for L1-A" (L0.4 door removal) | Delete the `?` help-panel trigger at `QRScannerView.swift:59-77`; keep `Spacer()` at `:78` and `.helpPanel(…)` at `:102-105`. The scanner must still open (R1 device row **D-06**). | **T13** |

`build/waves/w1/l1-b-notes.md` carries nothing addressed to L1-A (checked: three L0.4 tasks, all
L1-B/L1-C). `build/waves/w1/l1-e-copy-deck.md` **does not exist yet** — recorded in T15.

### 4. The notes I will send

Written verbatim to `build/waves/w1/l1a-notes-out.md` **and** appended to each target's
`build/waves/w1/<target>-notes.md`. Targets: **L1-C** (SettingsView, StudioHubView, the two of
L1-C's own rows that land in files L1-A owns), **L1-B** (`APIConfiguration.swift` quiz timeout, the
five non-auth numeric-keyboard call sites), **L1-D** (`SignInWithAppleButton.swift` colour scheme;
the Google brand mark if the provider is ever re-enabled), **L1-E** (the two copy decisions this
lane had to make before the deck existed). Task **T16**.

---

## Coverage — the 27 findings in `findings-by-lane.md` § "W1 · L1-A"

| id | task that closes it | test that pins it |
|---|---|---|
| `A3-06` blocker | T2 | `AuthProviderVisibilityTests` |
| `P-29` blocker | T3, T5 | `AuthErrorRoutingTests` |
| `A-101` blocker | T12 | `DeleteAccountCopyTests` |
| `A-03` | T2 | `AuthProviderVisibilityTests.emailButtonCarriesNoGlyph…` |
| `P-02` | T2 | same |
| `C1-05` | T4 | `AuthProviderVisibilityTests.inFlight…` |
| `C1-30` | T6 | `LegalLinkTests` |
| `C5-04` | T6 | `LegalLinkTests` |
| `C3-03` | T16 (note to L1-D — not this lane's file) | — (L1-D's) |
| `C3-06` | T5 | `AuthFormAffordanceTests` |
| `P-20` | T5 | `AuthFormAffordanceTests` |
| `P-22` | T5 | `AuthStatusRegionTests` |
| `C1-37` | T5 | `AuthStatusRegionTests` |
| `P-30` | T5 | `SignInCodeNamingTests` |
| `C9-08` | T11, then **X29** | `KeyboardDismissalTests` — ⚠ **OPEN** (`RL2A-05`): the T0 half (the 6-digit code field) is in; the other five `.numberPad`/`.decimalPad` sites are L1-B's files and land at the X29 rebase |
| `A3-07` | T7 | `AppleSignInRoleTests` |
| `A3-16` | T8 | `TestAccountLoginFallbackTests` |
| `B-21` | T9 | `OnboardingResumptionTests` |
| `A-05` | T10 | `GuestEscapeTests.skipSkips…` |
| `P-18` | T10 | `GuestEscapeTests` |
| `C1-28` | T10 | `GuestEscapeTests.quizProgressPersists…` |
| `A-21` | T10 | `QuizProgressTests` |
| `A-13` | T10 | `QuizProgressTests.noDeadNudge…` |
| `C1-04` | T10 | `QuizProgressTests.submittingHasAReader` |
| `B-12` | T12 | `AuthSheetPresentationTests` (extended) |
| `C1-14` | T12 (Account half) + T16 (Settings half → L1-C) | `AuthSheetPresentationTests` (extended) |
| `B-13` | T16 (note to L1-C — `StudioHubView.swift` is L1-C's) | — (L1-C's) |

Closed/open list is written at the end of the report.

---

## T1 — Failing-test scaffolding and the pure seams

**Why first.** Six of the eight new suites need a pure decision function that does not exist yet
(`AuthProviderCatalog.providers(from:)`, `AuthErrorScope`, `TestAccountLoginFallback.shouldAttempt`,
`OnboardingCompletion`). Writing the seams and the red tests together keeps every later task a
one-file change.

1. Write `PatinaTests/AuthProviderVisibilityTests.swift`, `AuthErrorRoutingTests.swift`,
   `TestAccountLoginFallbackTests.swift`, `AppleSignInRoleTests.swift`, `GuestEscapeTests.swift`,
   `OnboardingResumptionTests.swift`, `LegalLinkTests.swift`, `AuthStatusRegionTests.swift`,
   `AuthFormAffordanceTests.swift`, `SignInCodeNamingTests.swift`, `QuizProgressTests.swift`,
   `KeyboardDismissalTests.swift`, `DeleteAccountCopyTests.swift`.
2. Run `apps/mobile/Patina/scripts/ios-gate.sh build` — expect **failure** (the seams do not exist).
3. Commit only after T2 makes them compile; a red suite that does not compile is not a commit.

## T2 — `A3-06` + `A-03` + `P-02`: providers come from GoTrue, and the icons are one idiom

**Ruling D3.** Drop Google for round one; render only the providers `GET /auth/v1/settings` reports
enabled; fetch once, cache, fail to Apple + email.

1. New `Patina/Services/Auth/AuthProviderCatalog.swift` — `@Observable`, `shared`, an ordered
   `providers: [AuthProvider]` (`.apple`, `.google`, `.email`), a pure
   `static func providers(from external: [String: Bool]) -> [AuthProvider]`, `resolve()` that
   `GET`s `{APIConfiguration.apiURL}/auth/v1/settings` with the `apikey` header once per process,
   persists the answer to `UserDefaults`, and falls back to `[.apple, .email]` on any failure and
   before the first answer.
2. `AuthScreenView.swift`: render the stack from `AuthProviderCatalog.shared.providers`; `.task`
   calls `resolve()`. Replace the `AuthButton(icon: "✉")` / `AuthButton(icon: "G")` calls with a
   local `AuthProviderRow` that draws an SF Symbol `envelope` tinted to the ink token, carries no
   glyph in its accessibility label, and keeps AuthButton's chrome (50 pt, 12 pt radius, pearl
   stroke). Google, if ever re-enabled, renders label-only until L1-D ships the brand mark.
3. `xcodebuild test … -only-testing:PatinaTests/AuthProviderVisibilityTests`
4. `git add apps/mobile/Patina/Patina/Services/Auth/AuthProviderCatalog.swift
   apps/mobile/Patina/Patina/Features/Authentication/Views/AuthScreenView.swift
   apps/mobile/Patina/PatinaTests/AuthProviderVisibilityTests.swift`
   → `fix(ios-auth): render only the providers GoTrue reports enabled (A3-06, D3) and one icon idiom (A-03, P-02)`

## T3 — `P-29` half 1: an error raised in the sheet never reaches the root

1. `AuthService.swift`: add `AuthErrorScope` (`.root` / `.sheet`), stamp it on every entry point,
   expose `rootErrorMessage: String?` (the message only when the scope is `.root`).
2. `ContentView.swift` (`.auth` cases only) and `AuthSheet.swift`: pass `rootErrorMessage`.
3. `AuthenticationView.swift`: Cancel and `.onDisappear` clear the error.
4. `xcodebuild test … -only-testing:PatinaTests/AuthErrorRoutingTests`
5. Commit → `fix(ios-auth): scope auth errors so a sheet failure never lands on the Welcome root (P-29)`

## T4 — `C1-05`: in-flight state on every provider button

1. `AuthScreenView.swift`: `isLoading` parameter + `@State pressed: AuthProvider?`; the pressed row
   spins, the whole stack disables. `ContentView.swift` / `AuthSheet.swift` thread
   `AuthService.shared.isLoading`.
2. `xcodebuild test … -only-testing:PatinaTests/AuthProviderVisibilityTests`
3. Commit → `fix(ios-auth): in-flight state on the Welcome sign-in buttons (C1-05)`

## T5 — `P-29` half 2 + `P-22` + `C1-37` + `P-20` + `C3-06` + `P-30`: the status region, the form

1. `AuthScreenView.swift`: a **fixed-height reserved status slot** so the stack cannot shift
   (`AuthScreenView.statusSlotHeight`), two-line, scaling, tinted text only — no filled panel.
2. `AuthenticationView.swift`: one status region that replaces its contents (error wins, success
   otherwise); Verify pinned below it; auto-verify at the sixth digit; inline email validation copy;
   one filled submit style with `.opacity(0.4)` disabled.
3. `AuthViewModel.swift`: `emailValidationMessage`; clear `successMessage` when an error lands;
   auto-verify hook.
4. `P-30` — one name, **"sign-in code"**, everywhere in this file (recorded to L1-E in T16).
5. `xcodebuild test … -only-testing:PatinaTests/AuthStatusRegionTests -only-testing:PatinaTests/AuthFormAffordanceTests -only-testing:PatinaTests/SignInCodeNamingTests`
6. Commit → `fix(ios-auth): one status region, pinned CTA, auto-verify, email validation, one name for the code (P-29, P-22, C1-37, P-20, C3-06, P-30)`

## T6 — `C1-30` + `C5-04`: Privacy resolves to /privacy

1. `AuthScreenView.swift`: `privacyURL = https://patina.cloud/privacy`; the two links get 44 pt hit
   areas (`GAP1B-08`, L1-C's row on this lane's file — recorded in T16).
2. `xcodebuild test … -only-testing:PatinaTests/LegalLinkTests`
3. Commit → `fix(ios-auth): Privacy Policy points at /privacy (C1-30, C5-04)`

## T7 — `A3-07` / note **N1**: the Apple-and-Google self-downgrade

Per `l1-a-notes.md`'s five rules exactly.

1. `AuthService.swift`: `applyHomeownerRoleAfterOAuth()` — `.from("profiles").update(["role":
   "homeowner"]).eq("id", value: session.user.id)`; called immediately after the two OAuth sign-ins
   only; failures logged and swallowed.
2. `xcodebuild test … -only-testing:PatinaTests/AppleSignInRoleTests`
3. Commit → `fix(ios-auth): relabel the app's own profile row homeowner after Apple/Google sign-in (A3-07, B2 v3c)`

## T8 — `A3-16` / ruling **D7**: the test-account-login fallback

Contract read from `supabase/functions/test-account-login/{index,lib}.ts` and
`apps/designer-portal/src/app/auth/test-account-fallback.ts`: POST `{email, code}`; on 200 take
`token_hash`; redeem with `verifyOTP(tokenHash:type: .magiclink)`. **No allow-list in the app — the
server decides.** Fail closed: any non-200, missing `token_hash`, or redeem failure falls through to
the ordinary invalid-code error.

1. New `Patina/Services/Auth/TestAccountLoginFallback.swift` with injectable transport +
   redeem closures so the decision logic is testable without network.
2. `AuthService.verifyOtp`: on failure **and** on a resolve-without-session, try the fallback once.
3. `xcodebuild test … -only-testing:PatinaTests/TestAccountLoginFallbackTests`
4. Commit → `fix(ios-auth): wire the test-account-login fallback into verifyOtp (A3-16, D7)`

## T9 — `B-21`: a returning account is never re-run through the intro or the quiz

1. New `Patina/Services/Auth/OnboardingCompletion.swift` — completion keyed to the **account**
   (a per-user-id set in `UserDefaults`) plus a server read of `user_style_signals` for the account.
2. `AuthService.swift`: after a session is established, resolve it and flip
   `AppSettings.shared.hasCompletedOnboarding` for an account that has already finished.
3. `OnboardingFlowHost.swift`: record completion against the signed-in account.
4. `xcodebuild test … -only-testing:PatinaTests/OnboardingResumptionTests`
5. Commit → `fix(ios-onboarding): key onboarding completion to the account, not the install (B-21)`

## T10 — `A-05` + `P-18` + `C1-28` + `A-21` + `A-13` + `C1-04`: the guest flow is escapable, the quiz is honest

1. `OnboardingFlowView.swift`: Skip really skips (straight past the quiz), stays visible on the last
   page, and every page carries "I already have an account — Sign in".
2. `OnboardingFlowHost.swift`: a `skipQuiz` path that completes onboarding; a `signIn` escape that
   clears the guest session and returns to `.auth`.
3. `StyleQuizView.swift`: Back, "I'll do this later", the sign-in escape, an
   `isSubmitting` reader ("Reading your answers…"), and `saveProgress()` on `.onDisappear` /
   `scenePhase != .active`.
4. `StyleQuizViewModel.swift`: `progress` from answers recorded; the dead `companionNudgeLabel`
   removed.
5. `xcodebuild test … -only-testing:PatinaTests/GuestEscapeTests -only-testing:PatinaTests/QuizProgressTests`
6. Commit → `fix(ios-onboarding): escapable guest flow, honest quiz progress, saved answers (A-05, P-18, C1-28, A-21, A-13, C1-04)`

## T11 — `C9-08`: a keyboard-dismiss affordance

1. New `Patina/Utilities/ViewModifiers/KeyboardDismissal.swift` — `.keyboardDoneToolbar()` and
   `.dismissKeyboardOnScroll()`, in unowned residue so every lane can call it.
2. Apply to `AuthenticationView.swift` (the six-digit field + the form scroll view) and add the
   `@FocusState` chain (email → password → submit).
3. The other five numeric fields are **L1-B's files** → note in T16 with the exact one-line change.
4. `xcodebuild test … -only-testing:PatinaTests/KeyboardDismissalTests`
5. Commit → `fix(ios-auth): keyboard Done toolbar, interactive scroll dismiss, focus chain (C9-08)`

## T12 — `A-101` + `B-12` + `C1-14` (Account half)

1. `AccountDeletionService.swift`: copy that names the Patina account **and its server data**, what
   is retained and for how long, one verb ("Delete account") in row, title and button.
2. `AccountView.swift`: a signed-out state that is one sentence and a "Create your account" button
   raising `presentedSheet = .auth`; the QR row hidden for guests.
3. `xcodebuild test … -only-testing:PatinaTests/DeleteAccountCopyTests -only-testing:PatinaTests/AuthSheetPresentationTests`
4. Commit → `fix(ios-account): honest delete-account copy and a guest sign-in door (A-101, B-12, C1-14)`

## T13 — note **N2**: the QR help door

1. `QRScannerView.swift:59-77` — delete the `?` trigger exactly as `l1-c-notes.md` specifies; keep
   `Spacer()` and `.helpPanel(…)`.
2. `apps/mobile/Patina/scripts/ios-gate.sh build`
3. Commit → `fix(ios-qr): remove the QR help-panel door (L0.4, note from L1-C)`

## T14 — the whole gate

```bash
export IOS_GATE_UDID=A969A3BD-FBCF-4E80-B70A-0D9983828717
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=A969A3BD-FBCF-4E80-B70A-0D9983828717' -only-testing:PatinaTests
apps/mobile/Patina/scripts/ios-gate.sh lint-delta main
```

## T15 — the L1-E copy deck

Read `build/waves/w1/l1-e-copy-deck.md`; apply every row addressed to a file this lane owns; record
which rows were applied. **If it does not exist, say so in the report** — the deck pass at
integration applies them.

## T16 — the notes out

Write `build/waves/w1/l1a-notes-out.md` and append each block to its target's notes file.

## T17 — the self-check on this lane's clone

Not a walk. Install the signed Debug build on `A969A3BD-…`, launch with `-DeploymentTarget local`,
sign in as `client@patina.dev` / `password123` where needed, screenshot each changed screen before
and after into `shots/w1-l1a/` with a `ledger.md` line per shot.

---
---

# Fix round — 2026-09-02, fresh context, same lane and branch

Base: `first-flight/w1-l1a` @ `aad558202`. Input: the 21 adversarial-review findings `RL1A-01…21`.
Same format — failing test → run → implement → run → pathspec commit.

## Standing lines (fix round)

### 1. IOS_GATE_UDID

```bash
export IOS_GATE_UDID=A969A3BD-FBCF-4E80-B70A-0D9983828717   # ff-w1-l1a, this lane's clone only
xcrun simctl launch A969A3BD-FBCF-4E80-B70A-0D9983828717 cloud.patina.app -DeploymentTarget local
```

### 2. The VISION check

*Any fix here that would add or entrench tab / zone / dashboard UI beyond D1, a shadow, red/green
status, a badge, engagement optimisation, or the word "AI"?*

| fix | what it touches | verdict |
|---|---|---|
| `RL1A-02`, `RL1A-21` (C1-05 in-flight) | a spinner inside the pressed provider row | **Survives.** A spinner is not a badge and carries no status colour; the change makes it *fire less* — only while an exchange is actually running. |
| `RL1A-03` (P-34 / the collapsed Welcome) | the Welcome screen's vertical composition | **Survives.** It restores the layout that shipped; nothing is added. |
| `RL1A-07` (the quiz sign-in door) | moves an existing link out from under the Companion pill | **Survives.** Fewer overlapping surfaces, not more chrome. |
| `A-11` (D→A-3) | SF Symbols replacing emoji in the quiz | **Survives.** One weight, one colour, `accessibilityHidden` — the icon carries no state, so it is not a badge and not red/green status. L1-D carried this verdict in the note itself. |
| `C3-05` (D→A-2) | selected quiz rows move from `clay` to `Interactive.active` | **Survives.** A selection fill, not a status colour; it removes a 2.18:1 pairing. |
| `RL1A-04` (the fallback's domain gate) | a constant naming Patina's own domain | **Survives.** No §6 surface. |
| everything else | tests, error scoping, persistence bounds, notes | No §6 surface. |

**Nothing in this round adds tab / zone / dashboard framing, a shadow, a badge, an engagement
mechanic or the word "AI".** No finding needs an integration note to Fable on VISION grounds.

### 3. The notes I must apply

`RL1A-01` is the blocker: five integration notes addressed to L1-A were read but never scheduled.
Scheduled here, split by whether they compile on this branch.

| # | source | what | task | status |
|---|---|---|---|---|
| N3 | `l1-a-notes.md` **D→A-3** | `A-11` — thirteen emoji → SF Symbol names in `QuizModels.swift`, rendered as `Image(systemName:)` in one weight, one colour, `accessibilityHidden` | **X6** | lands now |
| N4 | `l1-a-notes.md` **D→A-2** (`C3-05` half) | the quiz's `clay` fills under a light label → `Interactive.active` + `Text.inverse` | **X7** | lands now |
| N5 | `l1-a-notes.md` **D→A-1** | `P-25` — the OTP field announces `000000` when empty; prompt + `accessibilityLabel`/`accessibilityValue` + a filled state that differs by more than opacity | **X8** | lands now, **minus** the `Border.strong` token |
| N6 | `l1-a-notes.md` **D→A-4** | `C3-15` — nine inline `.font(.custom(…))` sites → ramp tokens | **X9** | **seven of nine** land now; `voiceLead` and `bodySerif` do not exist on this branch |
| N7 | `l1-a-notes.md` **L1F→A-2** | the queued-link acknowledgement as a second, lower-priority case in the 52 pt status slot | **X10** | the `AuthScreenView` half lands now; the one `ContentView` call-site line needs L1-F's `AppCoordinator.pendingLinkNotice` |
| N8 | `l1-a-notes.md` **D→A-2** (`A-73` half) | seven `pearl` → `Border.hairline` / `Border.strong` swaps | **X17** | **does not compile on this branch** — `PatinaColors.Border` is L1-D's, unmerged. Reported open. |

Verified by grep on this branch: `PatinaColors.Border`, `clayInk`, `errorDeep`, `OnDark`, `Scrim`,
`PatinaTypography.voiceLead`, `voiceSmall`, `voiceCaption`, `bodySerif`, `h6`, `monoLarge` are **all
absent** — they exist only on `first-flight/w1-l1d`, which merges second (D14) while this lane merges
fifth. `patinaVoiceLarge`, `captionMedium`, `patinaVoice`, `h5`, `mono`, `bodySmall` **do** exist.

### 4. The notes I will send

Written to `l1a-notes-out.md` and appended to each target's inbox. Task **X18**.

- **L1-D** — the three token-dependent rows this lane could not compile (`A-73`'s seven swaps,
  `C3-15`'s two `voiceLead`/`bodySerif` sites, `P-25`'s `Border.strong` outline), each with the exact
  final line, to be applied at integration once `first-flight/w1-l1d` is on the tip.
- **L1-E** — a copy-deck addendum: `AuthenticationView.headerTitle` still renders `AuthMode.rawValue`
  ("Sign In" / "Sign Up") beside a button reading "Sign in" (`RL1A-11`, `C5-10` residue).
- **L1-F** — the two blocks from `l1a-notes-out.md` that were never appended to `l1-f-notes.md`
  (`RL1A-13`), for the record, plus the one call-site line `L1F→A-2` still needs.
- **Steward / L2-G** — `OrderHandoffTests` records 4 issues under the full parallel run and passes in
  isolation (`RL1A-08`).

---

## Coverage — the 21 review findings

| id | sev | task | test that pins it |
|---|---|---|---|
| `RL1A-01` | blocker | X6–X10, X17, X18 | the suites named per row below |
| `RL1A-02` | major | X1 | `AuthProviderVisibilityTests.aCancelledAppleResultLeavesNoRowBusy` |
| `RL1A-03` | major | X2 | `AuthErrorRoutingTests.welcomeContentFillsTheViewport` |
| `RL1A-04` | major | X3 | `TestAccountLoginFallbackTests.noPairLeavesTheDeviceForANonTestAddress` |
| `RL1A-05` | major | X4 | `OnboardingResumptionTests.resolvedBeforeTheSessionIsPublished` |
| `RL1A-06` | major | X5 | `AuthProviderVisibilityTests.appleIsOfferedOnTheLocalStack` |
| `RL1A-07` | major | X11 | `QuizProgressTests.theSignInDoorClearsTheCompanionPill` |
| `RL1A-08` | major | X18 (note only) | — not this lane's file |
| `RL1A-09` | minor | X5 | `AuthProviderVisibilityTests.bothSurfacesGateOnTheCatalog` |
| `RL1A-10` | minor | X12 | `AuthErrorRoutingTests` — measured slot + driven scope |
| `RL1A-11` | minor | X13 | `SignInCodeNamingTests.everyHeaderIsSentenceCase` |
| `RL1A-12` | minor | X18 (note only) | — Fable's glob call |
| `RL1A-13` | minor | X18 | — |
| `RL1A-14` | minor | X5 | `AuthProviderVisibilityTests.aFailedResolveIsRetried` |
| `RL1A-15` | minor | X14 | `QuizProgressTests.backCancelsThePendingAutoAdvance` |
| `RL1A-16` | minor | X14 | `QuizProgressTests.nextQuestionArrowIsGone` (extended) |
| `RL1A-17` | minor | X15 | the two suites become `@Suite(.serialized)` |
| `RL1A-18` | minor | X12 | `AuthErrorRoutingTests.clearingAnErrorAlsoClearsItsScope` |
| `RL1A-19` | minor | X16 | `DeleteAccountCopyTests.oneVerbEverywhere` (softened) |
| `RL1A-20` | minor | X16 | `OnboardingResumptionTests.theAccountRecordIsBounded` |
| `RL1A-21` | minor | X1 | `AuthProviderVisibilityTests.aBusyRowRendersDifferently` |

---

## X1 — `RL1A-02` + `RL1A-21`: the provider rows spin only when something is in flight

1. Test first, in `PatinaTests/AuthProviderVisibilityTests.swift`:
   `aCancelledAppleResultLeavesNoRowBusy` drives the new pure seam
   `AuthScreenView.inFlightProvider(forAppleSucceeded:)`; `aBusyRowRendersDifferently` renders
   `AuthProviderRow` at `isBusy: true` and `false` through `ImageRenderer` and asserts the two PNGs
   differ. Delete the `isBusy: pressed == .email` string pin.
2. `AuthScreenView.swift`: the Apple completion sets `pressed` from the seam, so a `.failure`
   (a cancel) clears it instead of leaving the hero button dimmed under a spinner for the rest of the
   screen's life; the email row drops `isBusy:` (its door opens a sheet synchronously — nothing to
   wait for).
3. `xcodebuild test … -only-testing:PatinaTests/AuthProviderVisibilityTests`
4. Commit → `fix(ios-auth): the Apple row's spinner follows the exchange, not the callback (C1-05)`

## X2 — `RL1A-03`: the Welcome screen fills the viewport again

1. Test first, in `PatinaTests/AuthErrorRoutingTests.swift` (no new `AuthLayoutTests.swift` file —
   corrected in fix round 3, `RL3A-10`): host `AuthStatusSlot` and the Welcome content and assert the
   composition's height matches the viewport it was given.
2. `AuthScreenView.swift`: `GeometryReader { proxy in ScrollView { content.frame(minHeight:
   proxy.size.height) } }`. The `dynamicTypeSize.isAccessibilitySize ? 0 : nil` ternary is a no-op in
   both branches and goes.
3. `xcodebuild test … -only-testing:PatinaTests/AuthErrorRoutingTests`
4. Commit → `fix(ios-auth): the Welcome ScrollView collapsed its Spacers (P-34)`

## X3 — `RL1A-04`: the pair never leaves the device for a non-test address

PROGRAM.md §3 · L1-A's test list: *"never sends the pair for a non-test address (`A3-16`, D7)"*.
Ruling D7 names the identity `firstflight@patina.cloud`.

1. Test first: `noPairLeavesTheDeviceForANonTestAddress` — a real-looking outside address is
   withheld and `mintTokenHash` is never called; `@patina.cloud`, in any case, is sent.
2. `TestAccountLoginFallback.isWorthAttempting` gains the domain suffix. It is Patina's own public
   domain, not a roster: nothing in the binary names a person.
3. `xcodebuild test … -only-testing:PatinaTests/TestAccountLoginFallbackTests`
4. Commit → `fix(ios-auth): the test-login pair never leaves the device for an outside address (A3-16)`

## X4 — `RL1A-05`: `B-21` resolves before the session is published, not after

1. Test first: `OnboardingResumptionTests.resolvedBeforeTheSessionIsPublished` pins that the resolve
   runs inside the seam that installs the session, ahead of the assignment the phase observer reads.
2. `AuthService.swift`: `establishSession(_:)` — resolve, then `applySession`. Every site that
   installs a real session routes through it; `applySession(nil)` (sign-out, refresh failure) does
   not. The listener's separate resolve block collapses into it, watermark and all.
3. `xcodebuild test … -only-testing:PatinaTests/OnboardingResumptionTests`
4. Commit → `fix(ios-onboarding): resolve onboarding before the session is published (B-21)`

## X5 — `RL1A-06` + `RL1A-09` + `RL1A-14`: the catalog on the local stack, on both surfaces, and after a blink

1. Tests first: `appleIsOfferedOnTheLocalStack`, `bothSurfacesGateOnTheCatalog`,
   `aFailedResolveIsRetried`.
2. `AuthProviderCatalog.swift`: `.apple` is always offered when `DeploymentTarget.current == .local`
   (the CLI stack reports `apple: false` and every W1 walker launches `-DeploymentTarget local`, so
   the rule was deleting the button from the wave's own walks); `resolveTask = nil` in the catch so a
   launch that started offline can answer later.
3. `AuthenticationView.swift`: its Apple button reads the same catalog the root does.
4. `xcodebuild test … -only-testing:PatinaTests/AuthProviderVisibilityTests`
5. Commit → `fix(ios-auth): the provider catalog answers on the local stack, on both surfaces, and after a failure (A3-06)`

## X6 — note **N3** / `A-11`: SF Symbols are the quiz's iconography

1. Test first: `QuizIconographyTests` — no option carries an emoji scalar, every `icon` is a
   registered SF Symbol name, and the render site is `Image(systemName:)` in one weight and one
   colour with `accessibilityHidden(true)`.
2. `QuizModels.swift` (thirteen strings, D→A-3's table verbatim) and
   `StyleQuizView+Questions.swift` (the two `Text(icon)` sites).
3. Commit → `fix(ios-onboarding): SF Symbols replace the quiz's emoji iconography (A-11, D→A-3)`

## X7 — note **N4** / `C3-05`: never `clay` under a light label

1. Test first: `QuizIconographyTests.noLightLabelSitsOnClay`.
2. `StyleQuizView+Questions.swift`: the three selected states (`:46/:50/:55`, `:81`, `:132/:136/:142`)
   take `Interactive.active` + `Text.inverse`.
3. Commit → folded into X6's commit (same file, same note).

## X8 — note **N5** / `P-25`: the OTP field stops announcing a code that is not there

1. Test first: `SignInCodeNamingTests.theEmptyFieldAnnouncesNoCode`.
2. `AuthenticationView+Panels.swift`: `prompt:` instead of the `"000000"` placeholder,
   `accessibilityLabel("Sign-in code")`, `accessibilityValue` counting digits, and a border that
   changes with content. `Border.strong` is L1-D's and unmerged — the empty state keeps the stroke it
   has today and the swap goes out as a note.
3. Commit → `fix(ios-auth): the sign-in code field announces what is actually typed (P-25)`

## X9 — note **N6** / `C3-15`: the inline fonts that have a token today

Seven of D→A-4's nine sites. `ConversationHeaderView:28` (`voiceLead`) and `PriorityView:54`
(`bodySerif`) stay as they are and go out as a note.

1. Test first: `TypographyAdoptionTests` is L1-D's suite; this lane pins its own files with
   `QuizIconographyTests.noInlineCustomFontsInTheseFiles` over the seven paths.
2. Commit → `fix(ios-onboarding): the conversation fonts take the ramp (C3-15, D→A-4)`

## X10 — note **N7** / `L1F→A-2`: the held-link acknowledgement

1. Test first: `AuthErrorRoutingTests.theNoticeYieldsToAnError`.
2. `AuthScreenView.swift`: `var pendingLinkNotice: String? = nil` and a second case in the existing
   52 pt slot, rendered only when `errorMessage == nil`. Nothing moves; the slot's height is
   unchanged.
3. The one `ContentView` line (`pendingLinkNotice: coordinator.pendingLinkNotice`) needs L1-F's
   property. ⚠ **OPEN** (`RL2A-06`): nothing passes the argument today, so the receiving half does
   not ship. Owned by **X29**, at the rebase after merge 4 — `C2-21` and `GAP7B-09`'s
   acknowledgement half read OPEN against L1-A until then, not closed.
4. Commit → `fix(ios-auth): a held link is acknowledged in the status slot (C2-21, GAP7B-09)`

## X11 — `RL1A-07`: the quiz's sign-in door is not painted on the Companion

1. Test first: `QuizProgressTests.theSignInDoorClearsTheCompanionPill`.
2. `StyleQuizView.swift`: measure the pill and inset the content column by its height, so the link
   sits above it at every Dynamic Type size rather than at one measured offset.
3. Commit → `fix(ios-onboarding): the quiz sign-in door sits above the Companion pill (P-18)`

## X12 — `RL1A-10` + `RL1A-18`: the two tautologies become measurements, and a cleared error clears its scope

1. Tests first: `reservedHeightIsIndependentOfContent` measures `AuthStatusSlot` through
   `UIHostingController.sizeThatFits`; `sheetScopedErrorDoesNotReachTheRoot` drives
   `setError(_:scope:)` and reads `rootErrorMessage`; `clearingAnErrorAlsoClearsItsScope` is new.
2. `AuthService.swift`: `clearError()` resets `errorScope`; `sheetErrorMessage` joins
   `rootErrorMessage`; `setError` becomes internal so a test can drive it; the Apple path carries the
   scope of the surface that raised it. `AuthViewModel.errorMessage` reads the sheet-scoped accessor.
3. Commit → `fix(ios-auth): a cleared error clears its scope, and the sheet reads only its own (P-29)`

## X13 — `RL1A-11`: the sheet header is sentence case too

1. Test first: `SignInCodeNamingTests.everyHeaderIsSentenceCase`.
2. `AuthenticationView.swift`: `headerTitle` returns its own strings rather than `mode.rawValue`.
3. Commit → folded into X12's commit (same file).

## X14 — `RL1A-15` + `RL1A-16`: the auto-advance is owned, and the dead nudge is deleted

1. Tests first: `backCancelsThePendingAutoAdvance`, and `nextQuestionArrowIsGone` extended to assert
   the property is gone rather than merely unreachable.
2. `StyleQuizViewModel.swift`: the advance task is stored and cancelled in `goBack()`,
   `saveProgress()` and `deinit`; `companionNudgeLabel` and its render site are removed.
3. Commit → `fix(ios-onboarding): Back cancels the pending auto-advance, and the dead nudge goes (A-13)`

## X15 — `RL1A-17`: the two mutating suites are serialized

`OnboardingResumptionTests` and `GuestEscapeTests` take `@Suite(.serialized)`; `StyleQuizViewModel`
gains the `defaults:` seam `restoreSavedProgress` needed.

## X16 — `RL1A-19` + `RL1A-20`: the cross-lane assertion, and the unbounded id list

1. `DeleteAccountCopyTests` stops pinning `SettingsView`'s literal row label (L1-C's file) and pins
   only that it reads the two `AccountDeletionService` constants.
2. `OnboardingCompletion` caps the completed-id list and drops it on delete-account.
3. Commit → `fix(ios-onboarding): bound the completed-account record (B-21)`

## X17 — the token-dependent rows, reported open

`A-73`'s seven `pearl` swaps, `C3-15`'s two remaining sites and `P-25`'s outline colour. Each has its
exact final line in `l1a-notes-out.md`; each is a one-line change once L1-D is on the tip.

## X18 — the notes out, and the record

Append the two missing blocks to `l1-f-notes.md` (`RL1A-13`), write the L1-D / L1-E / L1-F / steward
blocks, and record `RL1A-08` (the `OrderHandoffTests` parallel-run flake) and `RL1A-12` (the unowned
`LocalStoreClaimSheet.swift`) for the steward.

## X19 — the whole gate, then the self-check

```bash
export IOS_GATE_UDID=A969A3BD-FBCF-4E80-B70A-0D9983828717
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=A969A3BD-FBCF-4E80-B70A-0D9983828717' -only-testing:PatinaTests
apps/mobile/Patina/scripts/ios-gate.sh lint-delta main
```

Then reinstall on the clone and re-shoot the Welcome screen, the sign-in code screen and quiz Q2/Q4
into `shots/w1-l1a/`, appending to `ledger.md`.

---

## Fix-round outcome

| task | commit |
|---|---|
| X1, X2, X5, X10, X12 (`AuthScreenView` half) | `7069b3a4a` |
| X4, X12, X13 (`AuthService` / `AuthViewModel`) | `b71cf04a0` |
| X3 | `10d4f33e5` |
| X15, X16, X19 | `e7984eea3` |
| X6, X7, X9 | `47cf65fff` |
| X11, X14 | `cff6bf90b` |
| X8, X13 (`headerTitle`) | `5db95396a` |
| the two lint budgets the new code crossed | `d8cdad7db` |
| X18 (notes) | `build/waves/w1/l1a-notes-out-round2.md`, appended to `l1-d`, `l1-e`, `l1-f` and `steward.md` |
| X17 | reported open — see the lane report's open list |

---
---

# Fix round 2 — 2026-09-02, fresh context, same lane and branch

Against the fourteen review findings `RL2A-01` … `RL2A-14`. Same worktree
(`/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1a`), same branch
(`first-flight/w1-l1a`), same clone.

## Standing lines (fix round 2)

### 1. IOS_GATE_UDID

```bash
export IOS_GATE_UDID=A969A3BD-FBCF-4E80-B70A-0D9983828717   # ff-w1-l1a, this lane's clone only
xcrun simctl launch A969A3BD-FBCF-4E80-B70A-0D9983828717 cloud.patina.app -DeploymentTarget local
```

No `-PatinaFlags` — `house-first` is default-on since W0 (ruling D1a).

### 2. The VISION check

*Any fix here that would add or entrench tab / zone / dashboard UI beyond D1, a shadow, red/green
status, a badge, engagement optimisation, or the word "AI"?*

| fix | what it touches | verdict |
|---|---|---|
| `RL2A-02` (the quiz's saved progress) | a `UserDefaults` snapshot, no UI | **Survives.** No §6 surface. |
| `RL2A-03` (the code field's prompt) | replaces a truncated sentence with a six-glyph mask in muted ink | **Survives.** A placeholder is not status; it carries no colour and no state. |
| `RL2A-04` (four copy rows) | four strings, all sentence-case or lexicon fixes | **Survives.** "Curated" leaves; nothing is added. |
| `RL2A-07` (the auth failure sentences) | five fixed sentences replacing GoTrue's own | **Survives.** They are Patina's ordinary failure voice (the `MoneyFailureCopy` / `OrderFailureCopy` shape) — no red panel, no badge, no status colour; the terracotta status slot they render in is unchanged and already pinned by `AuthErrorRoutingTests.statusIsTintedTextNotAColouredPanel`. |
| `RL2A-13` (the Welcome CTA labels) | two labels wrap to a second line instead of shrinking | **Survives.** Type only; the rows already grow (`minHeight: 50`). |
| everything else | tests, an injectable seam, a task-list correction, notes | No §6 surface. |

**Nothing in this round adds tab / zone / dashboard framing, a shadow, a badge, an engagement
mechanic or the word "AI".** No finding needs an integration note to Fable on VISION grounds.

### 3. The notes I must apply

Every `build/waves/w1/<lane>-notes.md` block addressed to L1-A, as numbered tasks. Round one and
round two's notes were applied under `X6`–`X10` and `X17`; what follows is everything unscheduled.

| # | source | what | task | status |
|---|---|---|---|---|
| N9 | `l1-a-notes.md` **Task A-L1E-8** | `C5-10` — `StyleResultView.swift:54` `"View Recommendations"` → `"See your pieces"` | **X22** | lands now |
| N10 | `l1-a-notes.md` **Task A-L1E-9** | `C5-20` — `QuizModels.swift` `"Eclectic Curated"` → `"Collected Eclectic"`, `"Curated Comfort"` → `"Considered Comfort"`; both `key:` values unchanged | **X22** | lands now |
| N11 | `l1-a-notes.md` **Task A-L1E-10** | `A-06` — five straight apostrophes → U+2019, in the five sites the note names, with the two same-commit test pins | **X22** | lands now |
| N12 | `l1-a-notes.md` **Task A-L1E-11** | `C5-10` — `AccountView.swift` `.alert("Sign Out")` → `"Sign out?"`, `Button("Sign Out")` → `"Sign out"`, with the `AccountActionsTests` pin | **X22** | lands now |
| N13 | `l1-a-notes.md` **Note A-L1E-12** | `A-101` — record L1-A's agreement (or objection) to the no-retention-period exception | **X30** | recorded, not code |
| N14 | `l1-a-notes.md` **Note A-L1E-13** | three rows correctly routed elsewhere | — | no action, per the note |
| N15 | `l1-a-notes.md` **`D→A-7`** (L1-D round 3) | the two new `pearl` strokes on `AuthScreenView` → `Border.strong` | **X29** | **cannot compile here** — rebase-time, now an owned exit task |
| N16 | `l1-a-notes.md` **L1-D round 3, the conflict table** | at merge 5: take the other lane's structure, re-apply L1-D's substitution, in `AuthScreenView.swift`, `InvestmentPerspectiveView.swift`, `ScanFloorPlanPreviewView.swift` | **X29** | rebase-time, now an owned exit task |
| N17 | `l1-a-notes.md` **From L1-C, fix round** | `StyleContinueButton` gained a defaulted `ground:` — keep it through the rebase | **X29** | no edit; recorded on the rebase task |
| N18 | `l1-b-notes.md` **B-L1A-2** (via `steward.md` §S3) | `.keyboardDoneToolbar()` on the five remaining `.numberPad`/`.decimalPad` fields in L1-B's files | **X29** | rebase-time; `C9-08` reads **OPEN** until it lands |

### 4. The notes I will send

Written to `build/waves/w1/l1a-notes-out-round3.md` and appended to each target's inbox. Task **X32**.

- **L1-E** — the five auth failure sentences `RL2A-07` introduces, exact final text, for ratification
  or replacement at merge 6; plus L1-A's ratification of `A-101`'s no-retention-period exception
  (`Note A-L1E-12`'s explicit ask); plus the record that the four round-2 rows are applied here.
- **L1-C** — `P-34` item 2 is now applied verbatim as L1-C wrote it (`RL2A-13`); the round-one
  scale-to-fit substitution is withdrawn.
- **Steward** — `RL2A-01`'s correction (five of `D→A-7`/`Note D-L1A-4`'s eight `pearl` rows arrive
  already fixed from L1-D; two need hand-work and they are L1-A's own), `RL2A-05`'s owner for
  `B-L1A-2`, `RL2A-06`'s owner for the `pendingLinkNotice` call site, and `RL2A-11`'s glob ruling ask.
- **Fable** — `RL2A-07`'s exit-criterion question, answered by code rather than by an amendment; and
  `RL2A-14`'s 2 s worst case on the launch path, now pinned by a test.

---

## Coverage — the fourteen review findings

| id | sev | task | test that pins it |
|---|---|---|---|
| `RL2A-01` | blocker | X29, X32 | `AuthErrorRoutingTests.theRebaseTokenSitesAreEnumerated` — ⚠ **superseded in fix round 3** by `Y3` (`RL3A-03`): that case read an absolute path into another checkout and could not fail. It is now three source ratchets in this repo. |
| `RL2A-02` | major | X20 | `QuizProgressTests.discardThenLeaveLeavesNoSnapshot` · `submitThenLeaveLeavesNoSnapshot` |
| `RL2A-03` | major | X21 | `SignInCodeNamingTests.theEmptyFieldsPromptIsNotClipped` |
| `RL2A-04` | major | X22 | All three round-2 copy pins live in **`AuthAndQuizCopyTests`** — `stylePortraitCTAIsSentenceCase`, `styleQuizIsClean`, `noStraightApostropheInTheDeckedFiles` — plus `AccountActionsTests` (amended). `SentenceCaseTests` / `BrandVoiceLintTests` / `ApostropheSweepTests` are **L1-E's suite names**, and L1-E merges last: two branches creating the same new path is a conflict for no benefit, so this lane aliased them into one file and told L1-E (`l1a-notes-out-round3.md` Note A→E-3). Corrected in fix round 3 (`RL3A-10`). |
| `RL2A-05` | major | X29 | `KeyboardDismissalTests.noBareNumericFieldInThisLanesFiles` today; fix round 3 adds `everyBareNumericFieldIsOneOfTheFiveKnownOpenSites`, a tree-wide ratchet that reds when a sixth appears **or** when one of the five is fixed and the list is not updated (`Y3`). |
| `RL2A-06` | major | X29 | `AuthErrorRoutingTests.theNoticeYieldsToAnError` + the new call-site pin on the rebase task |
| `RL2A-07` | minor | X28 | `AuthFailureCopyTests` (new) — no `setError(error.localizedDescription` anywhere |
| `RL2A-08` | minor | X30 | — recorded, not code |
| `RL2A-09` | minor | X24 | `AppleSignInRoleTests.aSecondSignInIssuesTheSameSingleKeyWrite` · `aThrownRelabelDoesNotFailTheSignIn` |
| `RL2A-10` | minor | X25 | `AuthErrorRoutingTests.everySetErrorCarriesAnExplicitScope` |
| `RL2A-11` | minor | X32 | — Fable's glob call, sent |
| `RL2A-12` | minor | X23 | `OtpVerifyCoalescingTests.oneCodeStartsOneVerify` |
| `RL2A-13` | minor | X26 | `AuthErrorRoutingTests.theWelcomeCtaLabelsWrapRatherThanShrink` |
| `RL2A-14` | minor | X27 | `OnboardingResumptionTests.theServerReadBudgetIsTwoSeconds` |

---

## X20 — `RL2A-02`: a discarded or submitted quiz stays discarded

1. Test first, `PatinaTests/QuizProgressTests.swift`: `discardThenLeaveLeavesNoSnapshot` calls
   `discardSavedProgress()` then the disappear path and expects no key in the injected suite;
   `submitThenLeaveLeavesNoSnapshot` answers all five, submits, then the disappear path, same
   expectation. Run → red.
2. `StyleQuizViewModel` gains `private(set) var runHasEnded` (set by `discardSavedProgress()` and by
   `submitQuiz()`) and `saveProgressIfInFlight()`, which returns early when the run has ended or
   nothing is answered. `StyleQuizView`'s `.onDisappear` and its `scenePhase` handler both call it.
3. `GuestEscapeTests:126-127`'s two source pins follow the rename, same commit.
4. Run → green. Commit.

## X21 — `RL2A-03`: the code field's placeholder is readable

1. Test first, `SignInCodeNamingTests.theEmptyFieldsPromptIsNotClipped`: render the empty field at
   the sheet's width with `ImageRenderer`/`sizeThatFits` and assert the prompt's ideal width fits.
   Run → red.
2. The prompt becomes a six-glyph mask in `Text.muted`, not a sentence — the sentence
   "Enter the 6-digit code from your email" already sits two rows above at AXFrame y=551.
3. `theEmptyFieldAnnouncesNoCode`'s `prompt:` pin follows, same commit. The accessibility half of
   `D→A-1` (label, value, content-driven outline) is untouched — it is the half `P-25` is about.
4. Run → green. Commit.

## X22 — `RL2A-04`: the four L1-E round-2 rows, applied here

1. Tests first: `SentenceCaseTests.stylePortraitCTAIsSentenceCase`,
   `BrandVoiceLintTests.styleQuizIsClean` (bans "curated" in `QuizModels.swift`, asserts both `key:`
   values survive), `ApostropheSweepTests.noStraightApostropheInTheDeckedFiles`. Run → red.
2. Apply N9, N10, N11, N12 exactly as written.
3. The three same-commit pins the notes name: `AccountActionsTests.deletionConfirmationCopyIsHonest`
   and `.accountViewSurfacesBothAccountActions`, `DeleteAccountCopyTests` ×2, and
   `QuizProgressTests.deferControlSavesFirst`.
4. Run → green. Commit.

## X23 — `RL2A-12`: one code starts one verify

1. Test first, `PatinaTests/OtpVerifyCoalescingTests.swift`: drive `otpTokenChanged("123 456")` with
   a counting seam and expect exactly one verify. Run → red.
2. `verifyOtp()` sets `isVerifyingOtp = true` on the synchronous pass, before the `Task` exists.
3. Run → green. Commit.

## X24 — `RL2A-09`: the relabel behind an injectable seam

1. Test first, `AppleSignInRoleTests.aSecondSignInIssuesTheSameSingleKeyWrite` and
   `aThrownRelabelDoesNotFailTheSignIn`, over a new `relabelProfile` seam. Run → red.
2. `AuthService.relabelProfile: @Sendable (UUID) async throws -> Void`, defaulting to the live
   PostgREST write moved into `AuthService.liveRelabelProfile`. The source pins stay as the belt,
   re-targeted at the live closure.
3. Run → green. Commit.

## X25 — `RL2A-10`: the counts become the property they stand for

1. `AuthErrorRoutingTests.entryPointsStampTheirOwnScope` drops `== 4` / `== 3` / `== 6` and asserts
   instead that every `setError(` call in `AuthService.swift` carries an explicit `scope:`.
2. Run → green. Commit (folded into X28's commit — the same file, the same invariant).

## X26 — `RL2A-13`: the Welcome CTAs wrap rather than shrink

1. Test first, `AuthErrorRoutingTests.theWelcomeCtaLabelsWrapRatherThanShrink`. Run → red.
2. `A-L1C-2` item 2's exact four modifiers on `guestButton`'s label and on `AuthProviderRow`'s title,
   replacing the `lineLimit(1)` + `minimumScaleFactor(0.75)` substitution round one shipped.
3. Re-shoot the Welcome screen at accessibility-XXXL on the clone.
4. Run → green. Commit.

## X27 — `RL2A-14`: the launch-path budget is a pinned constant

1. `OnboardingResumptionTests.theServerReadBudgetIsTwoSeconds` — a change to `serverReadBudget` must
   now be deliberate. The serial ordering itself stays: it is what removed the 130 ms cross-fade
   through `.onboarding`, and 2 s sits inside L1-B's 8 s `LaunchWatchdog.stallDeadline`.
2. Run → green. Commit.

## X28 — `RL2A-07`: no raw server sentence on any auth failure path

1. Test first, `PatinaTests/AuthFailureCopyTests.swift`: the mapper answers Patina sentences for
   `invalidCredentials`, `otpExpired`, `overEmailSendRateLimit`, `emailNotConfirmed` and for an
   unknown error; and `AuthService.swift` contains no `setError(error.localizedDescription`. Run → red.
2. `AuthService.authErrorSentence(_:)`, applied at all twelve `setError(error.localizedDescription…)`
   sites. The five sentences go to L1-E as a deck addendum (X32) — L1-E merges last and may replace
   any of them with one edit.
3. Run → green. Commit.

## X29 — `RL2A-01` + `RL2A-05` + `RL2A-06`: the rebase apply becomes an owned exit task

The three findings are one gap: work that cannot compile on this branch, routed to lanes that merge
before this one, owned by nobody. It becomes **L1-A's own numbered exit task**, run in this worktree
after the integration tip carries merges 1–4 and before merge 5 is pushed.

1. ⚠ **Corrected in fix round 3 (`RL3A-03`).** The checklist is no longer read out of this file by a
   test — that read used an absolute path into Kody's main checkout, to a file git does not track, and
   returned early (passing) whenever it was missing. `AuthErrorRoutingTests` now carries three
   ratchets over source in THIS checkout instead (`Y3`), each of which goes red on its own when the
   rebase is due.
2. The checklist, each line a one-line change:
   - `AuthScreenView.swift` — the two `.stroke(PatinaColors.pearl, lineWidth: 1.5)` sites (`guestButton`,
     `AuthProviderRow`) → `.stroke(PatinaColors.Border.strong, lineWidth: 1.5)`.
   - `ConversationHeaderView.swift:28` → `PatinaTypography.voiceLead`; `PriorityView.swift:54` →
     `PatinaTypography.bodySerif`.
   - `AuthenticationView+Panels.swift` — the code field's empty-state outline → `PatinaColors.Border.strong`.
   - `ContentView.swift`'s `.auth` case gains `pendingLinkNotice: coordinator.pendingLinkNotice`
     (L1-F's `AppCoordinator` property, on the tip after merge 4), and `AuthSheet.swift` the same.
   - `RoomBudgetSheet.swift:61`, `ManualRoomEntryView.swift:65,133`, `RoomSettingsView.swift:193`,
     `ScanFallbackEntryView.swift:173` each gain `.keyboardDoneToolbar()` (`l1-b-notes.md` B-L1A-2).
   - The three merge-5 conflicts, **in this lane's own voice** (corrected in fix round 3, `RL3A-12`
     — the round-two bullet quoted L1-D's sentence verbatim, so "the other lane" read as L1-D from
     this seat and would have thrown away this branch's 443-line `AuthScreenView` rewrite). The
     authority is `steward.md`'s merge-5 conflict table, **rows 1–3**:
     - row 1 `AuthScreenView.swift` — take **THIS lane's** structure, then apply `D→A-2`'s two rows:
       both `.stroke(PatinaColors.pearl, lineWidth: 1.5)` → `PatinaColors.Border.strong`.
     - row 2 `InvestmentPerspectiveView.swift` — take **THIS lane's** structure, then re-apply
       `.fill(PatinaColors.pearl)` → `.fill(PatinaColors.Border.hairline)` at the divider.
     - row 3 `ScanFloorPlanPreviewView.swift` — take **THIS lane's** structure, then re-apply the
       `.font(.custom(` → `PatinaTypography` promotions (`C3-15`).
     `StyleContinueButton`'s defaulted `ground:` survives.
3. Then extend `KeyboardDismissalTests` to a bar — every `.numberPad`/`.decimalPad` in the tree
   carries `.keyboardDoneToolbar()` — and `AuthErrorRoutingTests` to a call-site pin for
   `pendingLinkNotice`, and re-run `ios-gate.sh unit`.
4. **Until this task runs, `C9-08` and the `C2-21`/`GAP7B-09` acknowledgement half read OPEN**, not
   closed, in this lane's coverage. Corrected in the table above.

`RL2A-01`'s second half — the misaddressed note — is corrected in X32: five of `Note D-L1A-4`'s eight
`pearl` rows (`OnboardingFlowView`, `StyleQuizView.exitButton`, `StyleResultView`, `StylePillButton`,
`PriorityView`, `InvestmentPerspectiveView`) are already zero on `first-flight/w1-l1d` and arrive
fixed; only the two `AuthScreenView` strokes this branch added need hand-work, and they are L1-A's.

## X30 — `RL2A-08` + `RL2A-11`: the two things that need a written referent

1. `A-101`: L1-A ratifies the no-retention-period exception, with the reason, in
   `l1a-notes-out-round3.md`, appended to `l1-e-notes.md`. Answers `Note A-L1E-12`'s explicit ask.
2. `RL2A-11`: nothing to revert. The two out-of-glob files are recorded and defensible; the ruling
   ask goes to the steward.

## X31 — the whole gate

```bash
export IOS_GATE_UDID=A969A3BD-FBCF-4E80-B70A-0D9983828717
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=A969A3BD-FBCF-4E80-B70A-0D9983828717' -only-testing:PatinaTests
apps/mobile/Patina/scripts/ios-gate.sh lint-delta main
```

## X32 — the copy deck re-read, the notes out, the self-check

1. Re-read `build/waves/w1/l1-e-copy-deck.md` and record which "L1-A applies" rows are applied.
2. Write `l1a-notes-out-round3.md`; append each block to its target's inbox.
3. Reinstall on the clone and re-shoot Welcome (default + AX-XXXL), the sign-in code screen, quiz
   Q1/Q4 and the taste portrait into `shots/w1-l1a/`, appending to `ledger.md`.


---

## Fix-round-2 outcome

| task | commit |
|---|---|
| X20 (`RL2A-02`) | `2fd54b2d3` |
| X21 (`RL2A-03`) | `f69ef74ba` |
| X22 (`RL2A-04`) | `4daa28519` |
| X23 (`RL2A-12`) | `cfcb15797` |
| X24 (`RL2A-09`) | `fa0671488` |
| X25 (`RL2A-10`) + X28 (`RL2A-07`) | `cbe28d7b0` |
| X26 (`RL2A-13`) + X27 (`RL2A-14`) + X29's test half (`RL2A-01`) | `616c42586` |
| the success-line pin, re-anchored after X23 moved the flag | `a7fd63365` |
| X30, X32 (notes, ledger, coverage corrections) | `build/waves/w1/l1a-notes-out-round3.md`, appended to `l1-e-notes.md`, `l1-c-notes.md`, `steward.md`; `shots/w1-l1a/ledger.md` |
| X29's **apply** half | **not run** — it is a rebase task, after merges 1–4 and before merge 5 |

**Open at the end of this round, by design:** `C9-08` (five of six numeric fields), and
`C2-21` / `GAP7B-09`'s acknowledgement half. Both are X29's, both now have an owner and a date, and
both read OPEN in the coverage tables above rather than closed.


---
---

# Fix round 3 — 2026-09-03, fresh context, same lane and branch

Against the seventeen adversarial-review findings `RL3A-01` … `RL3A-17`. Same worktree
(`/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1a`), same branch
(`first-flight/w1-l1a`), same clone (`A969A3BD-FBCF-4E80-B70A-0D9983828717`). Base tip `a7fd63365`.

Format: superpowers `writing-plans` — failing test → run → implement → run → pathspec commit.

## Standing lines (fix round 3)

### 1. IOS_GATE_UDID

```bash
export IOS_GATE_UDID=A969A3BD-FBCF-4E80-B70A-0D9983828717   # ff-w1-l1a, this lane's clone only
xcrun simctl launch A969A3BD-FBCF-4E80-B70A-0D9983828717 cloud.patina.app -DeploymentTarget local
```

No `-PatinaFlags` — `house-first` is default-on since W0 (ruling **D1a**).

### 2. The VISION check

*Any fix here that would add or entrench tab / zone / dashboard UI beyond D1, a shadow, red/green
status, a badge, engagement optimisation, or the word "AI"?*

| fix | what it touches | verdict |
|---|---|---|
| `RL3A-01` (the onboarding sign-in door) | moves an existing link out of a pinned overlay into the scrolling column | **Survives.** One fewer floating surface, not one more. Nothing is added to the screen. |
| `RL3A-02` (the session-less verify) | one Patina failure sentence in the status slot that already exists | **Survives.** Terracotta tinted text, never a filled panel — the slot is pinned by `AuthErrorRoutingTests.statusIsTintedTextNotAColouredPanel`, unchanged. |
| `RL3A-07` (the provider glyph scales) | an SF Symbol's font ramp | **Survives.** One weight, one colour, no state — it is not a badge. |
| `RL3A-08` (the status slot's height) | `@ScaledMetric` instead of a magic 52 | **Survives.** The slot still reserves a constant at any one type size, which is the whole of `P-29`; it simply reserves the right constant. |
| `RL3A-11` (seven apostrophes) | seven characters | No §6 surface. |
| `RL3A-13` (the QR help mount) | two comments | No §6 surface. |
| `RL3A-14` (the claim sheet's counts) | a `@State` hoist, no visible change | No §6 surface. |
| `RL3A-16`, `RL3A-17` (error scope, provider sentence) | error routing and one sentence | No §6 surface. |
| everything else | tests, plan corrections, notes, shots | No §6 surface. |

**Nothing in this round adds tab / zone / dashboard framing, a shadow, a badge, an engagement
mechanic or the word "AI".** No finding needs an integration note to Fable on VISION grounds.

### 3. The notes I must apply

Every `build/waves/w1/<lane>-notes.md` block addressed to L1-A. Rounds one and two scheduled N1–N18
(`T7`, `T13`, `X6`–`X10`, `X17`, `X22`, `X29`). Re-swept this round: **nothing is unscheduled.**

| # | source | what | task | status |
|---|---|---|---|---|
| N1–N18 | `l1-a-notes.md`, `l1-b-notes.md`, `l1-c-notes.md` | applied under T7/T13/X6–X10/X17/X22 | — | done, or open on **X29** by design |
| — | `l1-e-copy-deck.md` § "L1-A applies" | re-read this round (**Y13**). Every row whose file is inside L1-A's globs is applied. Four rows name files in **no L1-A glob** (`CompanionActionRows.swift` ×2, `NotificationFeedView.swift`, `PauseMenuView.swift`) and go out as a note (**Y14**). | **Y13** | recorded |

`grep -rn "L1-A\|→A-\|A-L1E" waves/w1/l1-b-notes.md waves/w1/l1-c-notes.md waves/w1/l1-d-notes.md
waves/w1/l1-e-notes.md waves/w1/l1-f-notes.md` finds nothing new since round two.

### 4. The notes I will send

Written verbatim to `build/waves/w1/l1a-notes-out-round4.md` **and** appended to each target's
`build/waves/w1/<target>-notes.md`. Task **Y14**.

- **The steward** — `RL3A-04`'s repair: the four `## To the steward` blocks from
  `l1a-notes-out-round3.md` (A→S-1 … A→S-4) appended **verbatim** to `steward.md`, which is where the
  round-three file claimed they already were and where they were not; plus the `## To Fable` block
  A→F-1, which has no other inbox; plus this round's `A→S-5` (the copy deck's four out-of-glob rows)
  and `A→S-6` (`RL3A-06`, the 25/27 acceptance criterion for merge 5).
- **L1-E** — `A→E-4`: the four copy-deck rows this lane cannot reach, with the exact final text.

---

## Coverage — the seventeen review findings

| id | sev | task | test that pins it |
|---|---|---|---|
| `RL3A-01` | blocker | Y1 | `GuestEscapeTests.theSignInDoorScrollsWithThePage` |
| `RL3A-02` | major | Y2 | `AuthErrorRoutingTests.aSessionlessResolveWithNoFallbackIsAMiss` · `.aSessionlessResolveTakenByTheFallbackSucceeds` · `AuthFailureCopyTests.aSessionlessResolveReadsAsAnExpiredCode`. Written in `OtpVerifyCoalescingTests` first and **moved**: they drive `AuthService.shared`'s error state, which `AuthErrorRoutingTests` also drives, and swift-testing runs suites in parallel — the two cases raced and the message was cleared under them. `AuthErrorRoutingTests` is now `@Suite(.serialized)` and owns every case that touches that singleton. |
| `RL3A-03` | major | Y3 | `AuthErrorRoutingTests.thePearlStrokesAreRatchetedToZero` · `.theHeldLinkNoticeIsWiredWhenTheCoordinatorCanSupplyIt` · `KeyboardDismissalTests.everyBareNumericFieldIsOneOfTheFiveKnownOpenSites` |
| `RL3A-04` | major | Y14 | — a document repair; verified by `grep -n "Note A→S-" steward.md` |
| `RL3A-05` | major | Y5 | `AuthSheetPresentationTests.aGuestAccountScreenOffersADoor` · `.theQrRowIsInsideTheAuthenticatedBranch` |
| `RL3A-06` | major | Y14 | — Fable's call; the acceptance criterion goes to the steward as `A→S-6` |
| `RL3A-07` | minor | Y6 | `AuthProviderVisibilityTests.theProviderGlyphScalesWithItsLabel` |
| `RL3A-08` | minor | Y7 | `AuthErrorRoutingTests.reservedHeightIsIndependentOfContent` (extended to `.accessibility5`) |
| `RL3A-09` | minor | Y14 | — a ruling ask, delivered this time |
| `RL3A-10` | minor | Y13 | — the plan's own coverage tables, corrected above |
| `RL3A-11` | minor | Y8 | `AuthAndQuizCopyTests.noStraightApostropheInTheDeckedFiles` over three more files |
| `RL3A-12` | minor | Y13 | — X29's conflict bullet, rewritten above in this lane's voice |
| `RL3A-13` | minor | Y9 | `AuthProviderVisibilityTests` — n/a; a comment pin in `QRHelpDoorTests`-free form, see the task |
| `RL3A-14` | minor | Y10 | `AccountActionsTests.theClaimSheetReadsItsCountsOnce` |
| `RL3A-15` | minor | Y15 | — shots + `ledger.md`, or a written reason |
| `RL3A-16` | minor | Y11 | `AuthErrorRoutingTests.entryPointsStampTheirOwnScope` (tightened to a zero bar) |
| `RL3A-17` | minor | Y12 | `AuthFailureCopyTests.aProviderValidationFailureDoesNotBlameTheEmailAddress` |

---

## Y1 — `RL3A-01` (blocker): the onboarding sign-in door scrolls with the page

**The bug.** `P-18`'s link was added to the ZStack overlay's bottom, so at
accessibility-extra-extra-extra-large its 92 pt frame sat *inside* the body paragraph's 434 pt of
text, and `Onboarding.PrimaryButton.0` was not in the AX tree at all. This branch introduced it: on
`main` the overlay is `HStack{Skip} + Spacer()` and nothing else.

1. Test first, `PatinaTests/GuestEscapeTests.swift` — `theSignInDoorScrollsWithThePage`: the pinned
   overlay contains `Onboarding.SkipButton` and **not** `Onboarding.SignInButton`; the door is inside
   `pageContent`, after `primaryButton`. Run → red.
2. `OnboardingFlowView.swift`: the `if let onSignIn { Button(…) }` moves out of the overlay `VStack`
   and becomes `signInDoor` at the end of `pageContent`, below the CTA, inside the `ScrollView`.
   `onboardingCarouselOffersSignIn`'s "outside the TabView" comment and assertion follow the move —
   the claim is now "in `pageContent`, which every page renders".
3. Run → green. Re-shoot page 1 at default and at accessibility-XXXL (**Y15**).
4. Commit.

## Y2 — `RL3A-02` (major): a session-less resolve is a miss on both legs

`verifyOtp` had `if response.session == nil, await fallback.attempt(…) { return }`. When the session
was nil **and** the fallback declined, the `if` simply failed: no throw, no `setError`, and the
reader saw six digits over an empty status region.

1. Test first, `PatinaTests/OtpVerifyCoalescingTests.swift`: over a new injectable verify seam,
   `aSessionlessResolveWithNoFallbackIsAMiss` expects a throw and a **sheet-scoped** Patina sentence;
   `aSessionlessResolveTakenByTheFallbackSucceeds` expects neither. Run → red. (Both then move into
   `AuthErrorRoutingTests`, `@Suite(.serialized)`, which already owns the singleton's error state.)
2. `AuthService.swift`: `verifyOtpTransport: @Sendable (String, String) async throws -> Bool`
   (defaulting to `AuthService.liveVerifyOtp`, which returns `response.session != nil`); the nil case
   hoists out of the `if` condition, and the decline path lands on the same sentence the catch path
   uses via `Self.authErrorSentence(_:surface:)`.
3. Run → green. Commit.

## Y3 — `RL3A-03` (major): the X29 enforcement becomes three ratchets that can fail

`theRebaseTokenSitesAreEnumerated` read `contentsOfFile:` at an absolute path into Kody's main
checkout, to a file `git ls-files` does not know, and `return`ed (passing) when the range was
missing. It asserted that eleven strings still appeared in prose — never that a line of Swift moved.

1. Tests first, all three over source in **this** checkout:
   - `AuthErrorRoutingTests.thePearlStrokesAreRatchetedToZero` — `PatinaColors.pearl` in
     `Features/Authentication/**` is `<= 2` while `PatinaColors.Border` is absent from
     `PatinaDesignKit`, and **must be 0** the moment it is present.
   - `AuthErrorRoutingTests.theHeldLinkNoticeIsWiredWhenTheCoordinatorCanSupplyIt` — `AuthScreenView`
     accepts `pendingLinkNotice` today, and the moment `AppCoordinator` grows the property both call
     sites must pass it.
   - `KeyboardDismissalTests.everyBareNumericFieldIsOneOfTheFiveKnownOpenSites` — a tree-wide walk;
     the set of files with a pad keyboard and no `.keyboardDoneToolbar()` must equal exactly the five
     `B-L1A-2` names. A sixth reds it; one of the five getting fixed reds it too, which is the signal
     to close `C9-08`.
2. Delete the absolute file read.
3. Run → green. Commit.

## Y5 — `RL3A-05` (major): `B-12` gets the test PROGRAM.md asked for

`AuthSheetPresentationTests` is byte-identical to `main` on this branch; `signedOutSection` — B-12's
whole fix — is pinned nowhere.

1. Tests first, in `PatinaTests/AuthSheetPresentationTests.swift`:
   `aGuestAccountScreenOffersADoor` (the `isAuthenticated` branch, `AccountView.SignInButton`,
   `presentedSheet = .auth`, and the one-sentence copy) and `theQrRowIsInsideTheAuthenticatedBranch`
   (`C1-14`'s second half). Run → red on `main`'s file.
2. No production change — the code is already right; this is the missing pin.
3. Run → green. Commit.

## Y6 — `RL3A-07` (minor): the provider glyph scales with its label

`Image(systemName:).font(.system(size: 16, weight: .regular))` is fixed-point; the `Text(icon)` it
replaced scaled. At AX-XXXL a small envelope sits beside a two-line ~40 pt label.

1. Test first: `AuthProviderVisibilityTests.theProviderGlyphScalesWithItsLabel` — the row's symbol
   carries the same type ramp as its title, and no `.system(size:` remains in `AuthProviderRow`.
2. `AuthScreenView.swift`: `.font(PatinaTypography.uiAction)` + `.imageScale(.medium)`.
3. Run → green. Commit (folded with Y7 — same file).

## Y7 — `RL3A-08` (minor): the reserved slot is measured in the reader's own type size

52 pt at every size. `bodySmall` is `relativeTo: .subheadline`, so two lines at AX-XXXL are ~100 pt;
`.minimumScaleFactor` resolves width, not height.

1. Test first: `reservedHeightIsIndependentOfContent` gains an `.accessibility5` pass — the empty and
   two-line heights still match **and** the AX height exceeds the default one.
2. `AuthScreenView.swift`: `@ScaledMetric(relativeTo: .subheadline) private var statusSlotHeight`,
   seeded from the existing `static let statusSlotHeight` so the constant keeps one home.
3. Run → green. Commit.

## Y8 — `RL3A-11` (minor): seven straight apostrophes, all in this lane's own files

The review found six; the sweep finds seven (`AuthenticationView.swift:406` as well).

1. Test first: `AuthAndQuizCopyTests.deckedFiles` gains `AuthenticationView.swift`,
   `StyleConversationViewModel.swift`, `QRAuthModels.swift`. Run → red ×7.
2. Replace `'` with `’` in the seven literals. Nothing else on those lines changes.
3. Run → green. Commit.

## Y9 — `RL3A-13` (minor): the parked help panel says it is parked

L1-C's note **N2** is explicit — *"keep `Spacer()` at `:78` and `.helpPanel(…)` at `:102-105`"* — so
the mount stays. What was missing is the record at the two sites a reader lands on.

1. One comment at `@State private var isHelpPanelPresented` and one at the `.helpPanel(…)` mount,
   each naming L0.4 and the finding that re-opens it (`C5-05`, the Sanity gap).
2. **Declined:** deleting the mount. It would contradict a written integration note from the lane
   that owns the removal, and `R1 · D-06` opens this screen on Kody's phone.
3. `ios-gate.sh build`. Commit.

## Y10 — `RL3A-14` (minor): the claim sheet counts once

`title` runs two `modelContext.fetchCount` calls on every body evaluation; the counts cannot change
while the sheet is up.

1. Test first: `AccountActionsTests.theClaimSheetReadsItsCountsOnce` — the view holds `@State` counts
   filled in a `.task`, and `body` reads `Self.title(rooms:pieces:)` rather than a computed property
   that fetches.
2. `LocalStoreClaimSheet.swift`: `@State private var counts: (rooms: Int, pieces: Int)?`, filled once.
3. Run → green. Commit.

## Y11 — `RL3A-16` (minor): every clear goes through `clearError()`

Ten in-method `errorMessage = nil` lines bypass `clearError()`, which is the only thing that also
resets `errorScope`. Latent today (both accessors gate on a non-nil message) and exactly the
condition `ScopeRouting.clearingAnErrorAlsoClearsItsScope` was written to prevent.

1. Test first: `entryPointsStampTheirOwnScope` gains a zero bar — outside `setError` and `clearError`
   the file contains no `errorMessage =` assignment at all. Run → red ×10.
2. `AuthService.swift`: the ten become `clearError()`.
3. Run → green. Commit.

## Y12 — `RL3A-17` (minor): a provider failure does not blame the email address

`validationFailed` maps to *"Check the email address and try again."* GoTrue answers exactly that
code for *"Unsupported provider: provider is not enabled"*, and `signInWithGoogle` routes through the
same mapper — so a misconfigured OAuth client tells the reader to check an email field that is not on
the screen.

1. Test first: `AuthFailureCopyTests.aProviderValidationFailureDoesNotBlameTheEmailAddress`. Run → red.
2. `authErrorSentence(_:surface:)` — an `AuthFailureSurface` enum (`.emailForm` default, `.provider`);
   the two OAuth paths pass `.provider`.
3. Run → green. Commit (folded with Y2 and Y11 — same file, same invariant).

## Y13 — `RL3A-06` + `RL3A-09` + `RL3A-10` + `RL3A-12`: the plan documents

1. `RL3A-10` — the two `AuthLayoutTests` rows become `AuthErrorRoutingTests`; the round-2 copy row
   names `AuthAndQuizCopyTests` and says why it is not `SentenceCaseTests`; the `KeyboardDismissalTests`
   case name is corrected. **Done above.**
2. `RL3A-12` — X29's conflict bullet is rewritten in L1-A's own voice and cites `steward.md`'s
   merge-5 table rows 1–3 by number; `InvestmentPerspectiveView`'s `Border.hairline` is now named.
   **Done above.**
3. `RL3A-06` — this lane closes **25 of 27**. `C9-08` and `C2-21`/`GAP7B-09`'s acknowledgement half
   are X29's and read OPEN. The acceptance criterion for merge 5 goes to the steward (`A→S-6`).
4. `RL3A-09` — no revert. The ruling ask is `A→S-4`, delivered this time (**Y14**).
5. The copy deck re-read: every "L1-A applies" row whose file is in an L1-A glob is applied
   (recorded in the report); four rows name files in no L1-A glob and go to L1-E as `A→E-4`.

## Y14 — `RL3A-04`: the notes actually reach their inboxes

1. Append `l1a-notes-out-round3.md`'s **A→S-1, A→S-2, A→S-3, A→S-4** and **A→F-1** to
   `waves/w1/steward.md`, verbatim, under a dated heading.
2. Write `waves/w1/l1a-notes-out-round4.md` with `A→S-5`, `A→S-6` and `A→E-4`; append `A→S-5`/`A→S-6`
   to `steward.md` and `A→E-4` to `l1-e-notes.md`.
3. Verify with `grep -n "Note A→S-" waves/w1/steward.md`.

## Y15 — `RL3A-15`: the self-check on this lane's clone

HID preflight first. Screens changed this round: the onboarding carousel (page 1, default +
AX-XXXL), the Welcome root (the provider glyph, the status slot). The sign-in code screen, quiz Q1/Q4
and the taste portrait are the three round-two shots that were never taken; try the argument-domain
route (`-patina.guest.optedIn YES`, a seeded `styleQuiz.savedProgress.v1`) and record the outcome
either way in `shots/w1-l1a/ledger.md`.

## Y16 — the whole gate

```bash
export IOS_GATE_UDID=A969A3BD-FBCF-4E80-B70A-0D9983828717
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
apps/mobile/Patina/scripts/ios-gate.sh unit
apps/mobile/Patina/scripts/ios-gate.sh lint-delta main
```

---

## Fix-round-3 outcome

| task | finding(s) | commit |
|---|---|---|
| Y1 | `RL3A-01` blocker | `1fc553cb1` |
| Y2, Y11, Y12 | `RL3A-02`, `RL3A-16`, `RL3A-17` | `df7113b2d` |
| Y3 | `RL3A-03` | `bfce98fcb` |
| Y5 | `RL3A-05` | `5ae9dd578` |
| Y6, Y7 | `RL3A-07`, `RL3A-08` | `81402fd9a` |
| Y8 | `RL3A-11` | `8454c191a` |
| Y9, Y10 | `RL3A-13`, `RL3A-14` | `7d245f758` |
| two pins re-anchored after the above | `RL3A-11`, `RL3A-02` | `8be670f27` |
| Y13 | `RL3A-06`, `RL3A-09`, `RL3A-10`, `RL3A-12` | this file, above |
| Y14 | `RL3A-04`, `RL3A-06`, `RL3A-09` | `steward.md` (A→S-1…S-4, A→F-1, A→S-5, A→S-6), `l1-e-notes.md` (A→E-4), `l1a-notes-out-round4.md` |
| Y15 | `RL3A-01` evidence; `RL3A-15` partial | `shots/w1-l1a/r4-01…r4-05` + `ledger.md` |

**Gate on `8be670f27`** — build ✅ · release ✅ · `PatinaTests` **1711 tests / 188 suites, 0 issues**
✅ · `lint-delta main` ✅. (1711 vs round two's 1700: 11 new cases.)

**Still OPEN at the end of this round, by design:**

- `C9-08` — four of the five `.numberPad`/`.decimalPad` files are L1-B's. `X29`, at the rebase.
- `C2-21` / `GAP7B-09`'s acknowledgement half — `AppCoordinator.pendingLinkNotice` is L1-F's, and
  L1-F merges fourth. `X29`, at the rebase.
- `RL3A-15`'s three round-two re-shoots (the sign-in code screen, quiz Q1/Q4, the taste portrait).
  **Taps are dead on this clone and swipes are not** — re-tested this round through a full
  shutdown/boot cycle. Every screen this round changed that a launch argument can reach was shot.

**The X29 checklist is no longer prose.** `AuthErrorRoutingTests.thePearlStrokesAreRatchetedToZero`,
`.theHeldLinkNoticeIsWiredWhenTheCoordinatorCanSupplyIt` and
`KeyboardDismissalTests.everyBareNumericFieldIsOneOfTheFiveKnownOpenSites` each go red on their own
when the dependency lands, so the rebase apply cannot be forgotten — see Note **A→S-6**.

---

# Fix round 4 — the tail (2026-09-03)

Four findings from the fourth adversarial review: one blocker, two major, one ruling. Fresh context,
same lane, same worktree and same clone (`A969A3BD-FBCF-4E80-B70A-0D9983828717`).

## Coverage — the four findings

| id | sev | what it was | test that pins it |
|---|---|---|---|
| `RL4A-01` | blocker | `QuizModels.swift:112` still read `"What’s driving your design journey?"` — the exact word `C5-20` is filed about — because `styleQuizIsClean` hand-wrote six `contains` clauses and never read the rest of the file | `AuthAndQuizCopyTests.styleQuizIsClean`, rewritten as a whole-file banned-lexicon lint |
| `RL4A-02` | major | `verifyOtp`'s session-less throw was raised **inside** the `do`, so it landed in the general `catch` and asked `testAccountLogin.attempt` a second time — two POSTs and two hits on 00551's limiter for one tap — and, if that second ask landed, returned success with the expired-code sentence still standing | `AuthErrorRoutingTests.aSessionlessResolveWithNoFallbackIsAMiss` · `.aSessionlessResolveTakenByTheFallbackSucceeds` — both count the asks |
| `RL4A-03` | major | the two cases the round-three coverage table named at `l1a-tasks.md:906` were never written; the branch was only ever asserted about as source text | the same two cases, now written against the `verifyOtpTransport` seam — the table at `:906` stands as printed |
| `RL4A-04` | ruling | `PROGRAM.md` §11.6 and `findings-by-lane.md` record L1-A at 27/27 | — Fable's ruling, taken below |

## Z1 — `RL4A-01`: the title, and a lint that would have caught it

1. `QuizModels.swift:112` → `title: "What’s bringing you here?",` — `E3-L1A-2`'s final text, U+2019.
   Nothing else on the line changes; a question title carries no wire key.
2. `AuthAndQuizCopyTests.styleQuizIsClean` drops the six `contains` clauses and lints **every string
   literal in the file** against the copy deck's banned lexicon (`curated`, `journey`, `elevated`,
   `disrupt`, `revolutionize`, `artificial intelligence`, `machine learning`), case-insensitively.
   Not `"AI"`: as a bare substring it fires on "chair", "detail" and "available", and a whole-file
   lint cannot afford that.
3. **`key:` values are excluded from the lint and pinned separately.** `eclectic_curated` and
   `curated_comfort` both contain `"curated"`, both are matched on by
   `StyleQuizViewModel.swift:221,242,296`, and a lint that read them would demand the rename that
   `styleQuizWireKeysAreUnchanged` forbids. `labelledStringLiterals(in:)` keeps each literal's
   argument label alongside it (`trailingArgumentLabel(of:)` reads the token before the colon that
   precedes the opening quote), so `key: "eclectic_curated"` is skipped and every other literal is
   read. The two keys are then asserted present by name.
4. Note to L1-E (`A→E-5`, in `l1-e-notes.md`): `BrandVoiceLintTests.styleQuizLabelsAreRenamed`'s
   `withKnownIssue` can be unwrapped at merge 6 — all three of its clauses hold on this branch's
   file. Its neighbour `BrandVoiceLintTests.styleQuizIsClean` **cannot**: L1-E's `lint(_:file:)`
   reads `key:` values, so unwrapping it reds on the two wire keys its own
   `styleQuizWireKeysAreUnchanged` requires to stay. That needs the same exclusion clause, and it is
   L1-E's file.

## Z2 — `RL4A-02`: each leg gets exactly one turn at the fallback

The `do` now covers the network call and nothing else. `hasSession` is bound inside it; the
session-less decision is made **after** it, at the same scope as the `catch`. Neither branch can
reach the other's fallback ask, and both `return` paths call `clearError()` first so a sign-in that
worked cannot leave a sentence standing in the sheet's status slot.

## Z3 — `RL4A-03`: the two cases exist now

`AuthErrorRoutingTests` §5, over the `verifyOtpTransport` seam and an injected
`TestAccountLoginFallback` whose `mintTokenHash` increments a lock-guarded counter:

- `aSessionlessResolveWithNoFallbackIsAMiss` — transport resolves `false`, the fallback mints no
  hash. Expects `AuthVerificationFailure.resolvedWithoutSession`, `asks.count == 1`, and
  `sheetErrorMessage == "That sign-in code has expired. Send yourself a new one."`
- `aSessionlessResolveTakenByTheFallbackSucceeds` — transport resolves `false`, the fallback mints
  and redeems. Expects no throw, `asks.count == 1`, and `errorMessage == nil`.

Both restore `verifyOtpTransport`, `testAccountLogin` and the error state on the way out:
`AuthService.shared` is one object shared with every other suite, which is why
`AuthErrorRoutingTests` is `@Suite(.serialized)`. The round-three coverage table at `:906` named
these two names; it is now true as printed, so it is left as written.

## Z4 — `RL4A-04`, Fable's ruling: **L1-A closes 25 of 27**

Taken. The two carried rows, and what closes each:

| carried row | why it is open | what closes it | the test that goes red when it lands |
|---|---|---|---|
| `C9-08` | four of the five `.numberPad`/`.decimalPad` files are **L1-B's** — `RoomBudgetSheet.swift:61`, `ManualRoomEntryView.swift:65,133`, `RoomSettingsView.swift:193`, `ScanFallbackEntryView.swift:173`. `KeyboardDismissal.swift` exists only on `first-flight/w1-l1a` | `l1-b-notes.md` **B-L1A-2**, applied at **X29** | `KeyboardDismissalTests.everyBareNumericFieldIsOneOfTheFiveKnownOpenSites` |
| `C2-21` / `GAP7B-09`, acknowledgement half | `AuthScreenView` accepts and renders `pendingLinkNotice`; nothing passes it, because `AppCoordinator.pendingLinkNotice` is **L1-F's** and merges fourth | the two call-site lines in `ContentView.swift` and `AuthSheet.swift`, applied at **X29** | `AuthErrorRoutingTests.theHeldLinkNoticeIsWiredWhenTheCoordinatorCanSupplyIt` |

### Merge 5's acceptance criterion

**L1-A merges at 25/27 with two carried rows.** The steward may push merge 5 only when all four hold:

1. `ios-gate.sh build`, `release`, `unit` and `lint-delta main` are green **on the integration tip
   after merges 1–4**, not on this lane's branch alone.
2. **X29 has run in this worktree**, on that tip, and its checklist is applied — including the four
   `.keyboardDoneToolbar()` sites that close `C9-08` and the two `pendingLinkNotice` call sites that
   close `C2-21` / `GAP7B-09`'s acknowledgement half.
3. `KeyboardDismissalTests.everyBareNumericFieldIsOneOfTheFiveKnownOpenSites` and
   `AuthErrorRoutingTests.theHeldLinkNoticeIsWiredWhenTheCoordinatorCanSupplyIt` are **green with
   the dependencies present** — both are inert while the dependency is absent and both go red the
   moment it lands unapplied, so a green run before merges 1–4 proves nothing about either row.
4. If X29 has **not** run, merge 5 is refused, or the two rows are carried past it explicitly and
   `PROGRAM.md` §11.6 says so — they are not silently counted closed.

`PROGRAM.md` §11.6 and `findings-by-lane.md` record L1-A at 27/27 today. **That is wrong and it is
the closer's to amend**: L1-A is **25/27**, with `C9-08` and `C2-21`/`GAP7B-09`'s acknowledgement
half carried to X29. `A→S-6` in `steward.md` asked for this call; this is the call, taken.

## Z5 — the whole gate, and the `OrderHandoffTests` flake

```bash
export IOS_GATE_UDID=A969A3BD-FBCF-4E80-B70A-0D9983828717
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
apps/mobile/Patina/scripts/ios-gate.sh unit
apps/mobile/Patina/scripts/ios-gate.sh lint-delta main
```

**`OrderHandoffTests` is flaky on this clone when the simulator is warm, and green after a fresh
boot. It is not this lane's to fix.** `PatinaTests/OrderHandoffTests.swift` and
`Features/Purchase/OrderHandoff.swift` are byte-identical to `main` on this branch
(`git diff main...HEAD --` over both paths is empty).

What was run, in order:

| run | what | result |
|---|---|---|
| 1 | `ios-gate.sh unit`, simulator warm | **6 issues** — `checkoutReturnCarriesItsOutcome`, `pollSettlesOnPaid`, `pollTimesOutIntoUnconfirmed` ×2, `unsettledReturnReportsUnconfirmed` ×2. Every one at `OrderHandoffTests.swift:346:21`, the `waitFor` helper's `Issue.record("condition never became true within \(timeout)")`. Whole tier took **18.679 s** |
| 2 | `-only-testing:PatinaTests/OrderHandoffTests`, alone | 15 tests, **passed**, 0.134 s |
| 3 | the same, alone, again | 15 tests, **passed**, 0.126 s |
| 4 | `xcrun simctl shutdown` + `boot` on the clone, then `ios-gate.sh unit` | **1713 tests / 188 suites, 0 issues**, whole tier **5.011 s** |

The mechanism is plain from the timings: `waitFor` is a wall-clock `.seconds(3)` budget polled every
5 ms, the whole tier ran 3.7× slower on the warm simulator, and five of those budgets ran out. The
failure is in the harness's timing assumption, not in `OrderHandoff`. For the steward: it will
resurface on any loaded machine, and the durable fix is in `waitFor`'s budget or in a clock the test
controls — an `OrderHandoff`-owning lane's call, not L1-A's.

## Fix-round-4 outcome

| task | finding(s) | where |
|---|---|---|
| Z1 | `RL4A-01` blocker | `QuizModels.swift`, `AuthAndQuizCopyTests.swift`, `l1-e-notes.md` (`A→E-5`) |
| Z2 | `RL4A-02` major | `AuthService.swift` |
| Z3 | `RL4A-03` major | `AuthErrorRoutingTests.swift` §5 |
| Z4 | `RL4A-04` ruling | this file (above), `l1a-notes-out.md`; `PROGRAM.md` §11.6 is the closer's |
| Z5 | the gate | build ✅ · release ✅ · `PatinaTests` **1713 tests / 188 suites, 0 issues** ✅ · `lint-delta main` ✅ |

1713 vs round three's 1711: the two cases `RL4A-03` names.

**Still OPEN at the end of this round, by design** — unchanged, and now written into merge 5's
acceptance criterion above: `C9-08`, and `C2-21`/`GAP7B-09`'s acknowledgement half. Both are X29's.

---
---

# Fix round 5 — 2026-09-03, fresh context, same lane and branch

**The input this round is round one's review, re-issued.** The dispatch carried the twenty-one
`RL1A-01…21` findings and the round-one lane report (tip `aad558202`, 1657 tests). The branch is at
`12a20aabe`, thirteen commits past that report, and `RL1A-01…21` were the input to **fix round one**
(tasks `X1`–`X19`, above) — every one of them is answered there, and three further reviews
(`RL2A`, `RL3A`, `RL4A`) have landed since.

So this round is a **verification round, not a fix round**: re-derive each of the twenty-one at the
current tip from the source rather than from the record, re-run the whole gate, and report. A commit
is written only where verification finds something actually open. Nothing is taken on the strength of
an earlier round's own claim.

## Standing lines (fix round 5)

### 1. IOS_GATE_UDID

```bash
export IOS_GATE_UDID=A969A3BD-FBCF-4E80-B70A-0D9983828717
```

Clone `ff-w1-l1a`. It was found **Booted** and warm at the start of this round, which is the exact
condition `Z5` recorded `OrderHandoffTests` failing under — so the unit tier is run after a
`shutdown` + `boot`, as `Z5`'s run 4 was.

### 2. The VISION check

No fix is proposed this round, so nothing is added to any surface: no tab, zone or dashboard UI, no
shadow, no red/green status, no badge, no engagement optimisation, and the word *AI* appears nowhere.
The check passes trivially, and would have to be re-run against any change verification turned up.

### 3. The notes I must apply

Re-swept this round with
`grep -rn "L1-A\|→A-\|A-L1E" waves/w1/l1-{a,b,c,d,e,f}-notes.md` and by reading the section list of
`l1-a-notes.md`. The last block addressed to this lane is **`D→A-8`** (L1-D fix round 3, 2026-09-03,
the two `pearl` strokes), which is scheduled on **X29** and held red by
`AuthErrorRoutingTests.thePearlStrokesAreRatchetedToZero`. **Nothing is unscheduled, and nothing
new has arrived since round three's sweep.**

### 4. The notes I will send

None. Verification found nothing that needs another lane's file. `RL1A-13`'s repair (round one's two
blocks appended to `l1-f-notes.md`) is verified present at `l1-f-notes.md:310`.

---

## Coverage — the twenty-one findings, re-derived at `12a20aabe`

Evidence is a read of the file at the tip, not the round-one task that claimed it.

| id | sev | verified at the tip | evidence |
|---|---|---|---|
| `RL1A-01` | blocker | **closed**, less the two rows carried by design | `QuizModels.swift` holds no emoji (`grep` for the twelve returns nothing); `AuthenticationView+Panels.swift:138-139` carries `.accessibilityLabel("Sign-in code")` + `.accessibilityValue`; `StyleQuizView+Questions.swift` has no `clay` fill and no `.white` label — `Interactive.active` under `Text.inverse` throughout; both surviving `.font(.custom…)` sites (`ConversationHeaderView.swift:28`, `PriorityView.swift:54`) now carry `relativeTo:`; `AuthScreenView.swift:46,122,352,362` accepts and renders `pendingLinkNotice` |
| `RL1A-02` | major | closed | `AuthScreenView.swift:157` sets `pressed` from `Self.inFlightProvider(…)`, `:79-80` clears it on the `isLoading` edge |
| `RL1A-03` | major | closed | `AuthScreenView.swift:69,72` — `GeometryReader { proxy in … .frame(minHeight: proxy.size.height) }`; pinned by `AuthErrorRoutingTests.welcomeContentFillsTheViewport` |
| `RL1A-04` | major | closed | `TestAccountLoginFallback.swift:89-94` — `address.lowercased().hasSuffix(testAccountDomain)` |
| `RL1A-05` | major | closed | `AuthService.swift:184-210` — `establishSession` awaits `onboardingCompletion.resolve` **before** `applySession` publishes the session; the listener no longer owns the resolve (`:235-237`) |
| `RL1A-06` | major | closed | `AuthProviderCatalog.swift:83-87` — `|| (target == .local && $0 == .apple)`, `target` injectable |
| `RL1A-07` | major | closed | superseded by `RL3A-01`/`Y1`: the door scrolls with the page (`GuestEscapeTests.theSignInDoorScrollsWithThePage`) |
| `RL1A-08` | major | note only, still true | `Z5` measured it: warm sim 18.7 s tier / 6 issues, fresh boot 5.0 s / 0. Re-measured this round |
| `RL1A-09` | minor | closed | `AuthenticationView.swift:19` — `@State private var catalog = AuthProviderCatalog.shared` |
| `RL1A-10` | minor | closed | `AuthErrorRoutingTests.reservedHeightIsIndependentOfContent` measures a rendered `AuthStatusSlot` at five type sizes (`:143-165`), not a constant against itself |
| `RL1A-11` | minor | closed | `AuthenticationView.swift:134-142` — `headerTitle` switches on the mode, comment names `C5-10` |
| `RL1A-12` | minor | note only | `LocalStoreClaimSheet.swift` glob ownership — Fable's call, recorded in `l1a-notes-out.md` |
| `RL1A-13` | minor | closed | `l1-f-notes.md:310` — "From L1-A — round one, appended late (RL1A-13)" |
| `RL1A-14` | minor | closed | `AuthProviderCatalog.swift:121` — `self.resolveTask = nil` on the catch path |
| `RL1A-15` | minor | closed | `StyleQuizViewModel.swift:29` — the advance task is held so `goBack()` can cancel it |
| `RL1A-16` | minor | closed | `companionNudgeLabel` has no occurrence anywhere in the target |
| `RL1A-17` | minor | closed | `@Suite(.serialized)` at `GuestEscapeTests.swift:23`, `OnboardingResumptionTests.swift:27`, `AuthErrorRoutingTests.swift:31` |
| `RL1A-18` | minor | closed | `AuthService.swift:72-75` — `clearError()` sets `errorScope = .root` |
| `RL1A-19` | minor | closed | `DeleteAccountCopyTests.swift:33-37` — the comment names L1-C's file and the pin is the coupling, not the row label |
| `RL1A-20` | minor | closed | `OnboardingCompletion.swift:66` — `Array(ids.suffix(Self.recordLimit))` |
| `RL1A-21` | minor | closed | `AuthScreenView.swift:188` — the email door passes no `isBusy` and says why; `AuthProviderRow.isBusy` (`:406,412`) is exercised by the Google/Apple rows |

## W1 — the whole gate, on a fresh boot

```bash
export IOS_GATE_UDID=A969A3BD-FBCF-4E80-B70A-0D9983828717
xcrun simctl shutdown "$IOS_GATE_UDID"; xcrun simctl boot "$IOS_GATE_UDID"
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
apps/mobile/Patina/scripts/ios-gate.sh unit
apps/mobile/Patina/scripts/ios-gate.sh lint-delta main
```

## Fix-round-5 outcome

**No commit.** Twenty-one findings re-derived at `12a20aabe`; every one already answered by rounds
one to four, and no verification turned up a regression. A round that writes code it does not need
is a round that spends the wave's merge budget for nothing.

| gate line | result |
|---|---|
| `ios-gate.sh build` | ✅ `** BUILD SUCCEEDED **`, RC=0 |
| `ios-gate.sh release` | ✅ `** BUILD SUCCEEDED **`, RC=0 |
| `ios-gate.sh unit` | ❌ RC=65 on all three attempts — **1713 tests / 188 suites, every issue in `OrderHandoffTests` and `CompanionCoachingModelTests`**, neither of which this branch touches |
| `ios-gate.sh lint-delta main` | ✅ `no new warnings in touched files`, RC=0 |

### The unit line, measured

| run | conditions | wall | issues |
|---|---|---|---|
| 1 | fresh `shutdown`+`boot`, `load avg 892` | 98.9 s | 7 — `OrderHandoffTests` ×6, `CompanionCoachingModelTests` ×1 |
| 2 | the two suites alone, straight after | 0.109 s | **0** (36 tests) |
| 3 | whole tier, `load avg ~500` | 10.1 s | 4 — `OrderHandoffTests` only |
| 4 | whole tier, `load avg ~578` | 12.0 s | 7 — the same two suites |
| 5 | the two suites alone, straight after run 4, `load avg 984` | 0.154 s | **0** (36 tests) |

Every `✘` line in run 4 resolves to `OrderHandoffTests.swift:135`, `:247`, `:346` (×4) and
`CompanionCoachingModelTests.swift:384` — nothing else in 188 suites. `git diff main...HEAD
--name-only` over `PatinaTests/OrderHandoffTests.swift`,
`PatinaTests/CompanionCoachingModelTests.swift` and `Features/Purchase/OrderHandoff.swift` is empty.
Run 5 is the disproof of any theory that blames this branch: at the **highest** load of the round,
the same two suites pass in 0.154 s when they are not competing with 186 others.

**Round four's conclusion is superseded.** `Z5` recorded the flake as warm-simulator-only and a fresh
boot as the remedy; run 1 booted fresh and took 7 issues. The variable is the other five lanes'
concurrent gates — six `xcodebuild`s were resident throughout — not simulator warmth. That went to
the steward as **`A→S-7`**, alongside the reason L1-B's 20 s `waitFor` is deliberately **not**
duplicated onto this branch: `PatinaTests/OrderHandoffTests.swift` is residue in no lane's glob, and
a second copy of the same one-line edit buys a merge conflict in an unowned file for a fix already
arriving on `first-flight/w1-l1b`.

### The self-check, and why it was not re-shot

Nothing rendered differently this round — there is no code change to photograph, and the clone's taps
are still dead (`RL3A-15`), so the launch-argument-reachable screens would have reproduced
`r4-01…r4-05` byte for byte. A redundant Debug compile at `load avg 984` costs every other lane's
gate real wall time, which is the same currency the unit line above is losing. `shots/w1-l1a/` is
unchanged and its `ledger.md` stands.

### Still open, unchanged and by design

`C9-08` and `C2-21`/`GAP7B-09`'s acknowledgement half — both **X29**'s, both held red by a ratchet
(`KeyboardDismissalTests.everyBareNumericFieldIsOneOfTheFiveKnownOpenSites`,
`AuthErrorRoutingTests.theHeldLinkNoticeIsWiredWhenTheCoordinatorCanSupplyIt`). L1-A stands at
**25/27**, per `Z4`.

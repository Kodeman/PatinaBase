# W1 · L1-E — task list (Copy)

`IOS_GATE_UDID=2AF6D0CA-91AB-446E-AFA3-4C126AD5827B`

**The VISION check.** None of L1-E's 18 findings' fixes add or entrench a tab/zone/dashboard, a shadow,
red/green status, a badge, an engagement mechanic, or the word "AI" — every row is a string rewrite, a
noun-collision fix, or an error-message mapping. The one row that touches layout at all (`C-30`'s
`statItem` label) changes which *word* renders, not the layout. All eighteen survive the check without
exception.

**The notes I must apply.** None. No `<lane>-notes.md` file addressed to L1-E exists in
`build/waves/w1/` as of this task list (`l1-a-notes.md`, `l1-b-notes.md`, `l1-c-notes.md` are all
addressed to their own lanes; none carries a section "From … → L1-E"). `l1-a-notes.md`'s B2 v3 section
is read for context (it explains why `A3-28`'s migration half is not this lane's to apply — see the
copy deck's "Not applied this wave" table) but issues no task to L1-E.

**The notes I will send.** Every row is in `build/waves/w1/l1-e-copy-deck.md`, grouped by owning lane.
The exact final text for each is appended to that lane's own `<lane>-notes.md` (Tasks 9–12 below) and
mirrored in `build/waves/w1/l1e-notes-out.md`.

---

## Coverage — all 18 W1 findings in L1-E's table

| id | task that closes it | test that pins it |
|---|---|---|
| `A-52` | 9 (note → L1-A) | `PatinaTests/GuestPromiseTests.swift` |
| `A-60` | 11 (note → L1-C) | `PatinaTests/NounConsistencyTests.swift` |
| `A-79` | 9 (note → L1-A) | `PatinaTests/GuestPromiseTests.swift` |
| `A3-28` | — not applied, reason recorded in the deck | — |
| `B-20` | 11 (note → L1-C) | `PatinaTests/SentenceCaseTests.swift` (grammar assertion) |
| `B-23` | already true, no L1-E row needed (verified below) | — |
| `C-22` | 11 (note → L1-C) | `PatinaTests/NounConsistencyTests.swift` |
| `C-30` | 11 (note → L1-C) | `PatinaTests/PluralisationTests.swift` |
| `C-38` | 11 (note → L1-C) | `PatinaTests/NounConsistencyTests.swift` (jargon sweep) |
| `C4-08` | 3, 4 (own files) + 9b (note → L1-B) | `PatinaTests/ErrorVoiceTests.swift` |
| `C4-09` | 5, 6 (own files) + 10 (note → L1-B) | `PatinaTests/ErrorVoiceTests.swift` |
| `C5-06` | 1, 2 (own file) | `PatinaTests/GreetingWindowTests.swift` |
| `C5-09` | 10 (note → L1-B) | `PatinaTests/NounConsistencyTests.swift` |
| `C5-10` | 9, 10, 11 (notes → L1-A/L1-B/L1-C) | `PatinaTests/SentenceCaseTests.swift` |
| `C5-11` | 6, 7 (own files) + 10 (note → L1-B) | `PatinaTests/ErrorVoiceTests.swift` |
| `C5-16` | 10 (note → L1-B) | `PatinaTests/NounConsistencyTests.swift` |
| `A-06` | 9 (note → L1-A) | source-scan inside `BrandVoiceLintTests.swift` |
| `C5-20` | 9 (note → L1-A) | `PatinaTests/BrandVoiceLintTests.swift` |

`B-23` — verified against the current code, not applied: `StyleResultView.swift:65`'s footnote
("Your portrait stays on this device and can be reset in Settings.") is the exact string the finding
names, but its owning file is `Features/StyleQuiz/**`, L1-A's glob. **This finding has no L1-E deck
row because it needs no L1-E judgement — its own fix line names the exact replacement** ("Your
portrait is yours — reset it any time in Settings.") verbatim, brand-voice clean as written. Sending
it as a plain one-line note (Task 9) rather than a deck row with commentary, since there is nothing
for a copy review to add.

---

## Task 1 — failing test: `GreetingWindowTests`

- [ ] Write `PatinaTests/GreetingWindowTests.swift`: sweep all 24 hours, assert `TimeOfDay(for:).greeting`
  (or `TimeOfDay.current.greeting` with an injected hour) returns exactly one of `"Good morning"`,
  `"Good afternoon"`, `"Good evening"`; assert no returned string ends in `.`; assert no string equals
  `"Good night"`, `"Good day"`, or `"Early morning"` at any hour (`C5-06`).
- [ ] Run: `xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug -destination "platform=iOS Simulator,id=$IOS_GATE_UDID" -only-testing:PatinaTests/GreetingWindowTests` — **expect failure** (current strings still have periods and the six-way split).

## Task 2 — implement: `TimeOfDay.swift`

- [ ] Edit `apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/TimeOfDay.swift:26-41` per the
  deck's `C5-06` row: dawn/morning → `"Good morning"`, day/afternoon → `"Good afternoon"`,
  evening/night → `"Good evening"`.
- [ ] Re-run Task 1's test — expect green.
- [ ] Pathspec commit: `apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/TimeOfDay.swift`,
  `apps/mobile/Patina/PatinaTests/GreetingWindowTests.swift`.

## Task 3 — failing test: AR save-failure copy

- [ ] Write `PatinaTests/ARPlacementFailureCopyTests.swift`: `ARPlacementViewModel.saveFailureMessage`
  is a fixed, non-empty string that never contains `"RoomsAPIError"`, `"Patina."`, or a digit run
  matching an error code; `ARPlacementView`'s toast text for `.failed` renders the message with no
  `"Save failed: "` prefix (source-scan the view body for the literal, since the view has no host
  harness in this target) (`C4-08`).
- [ ] Run — **expect failure** (the prefix and the interpolated `error.localizedDescription` are both
  still present).

## Task 4 — implement: `ARPlacementViewModel.swift` + `ARPlacementView.swift`

- [ ] `Features/ARPlacement/ViewModels/ARPlacementViewModel.swift:87` — replace
  `self.saveState = .failed(error.localizedDescription)` with
  `self.saveState = .failed(Self.saveFailureMessage)`, adding
  `static let saveFailureMessage = "We couldn't save this. Try again."` Log `error` in `#if DEBUG`
  at the same call site so the underlying cause is not lost, only stopped from reaching the toast.
- [ ] `Features/ARPlacement/Views/ARPlacementView.swift:111-113` — drop the `"Save failed: "` prefix:
  `case .failed(let msg): toastPill(text: msg, tint: PatinaColors.clay)`.
- [ ] Re-run Task 3 — expect green.
- [ ] Pathspec commit: both files + the new test.

## Task 5 — failing test: DesignServices error voice

- [ ] Write `PatinaTests/ErrorVoiceTests.swift` (the lane's keystone suite — starts here, grows in
  Task 7): assert `DesignServicesError.invalidRequest("anything").errorDescription` and
  `.networkError("anything").errorDescription` never contain the associated `message`/detail string
  passed in (construct with a canary string like `"CANARY_RAW_TEXT"` and assert it is absent from the
  rendered description); assert `.submissionFailed.errorDescription ==
  "We couldn't send your request. Nothing was lost — try again."` (`C4-09`, `C5-11`).
- [ ] Run — **expect failure** (`.invalidRequest`/`.networkError` still echo the canary; `.submissionFailed`
  still reads the old sentence).

## Task 6 — implement: `DesignServicesService.swift` + `DesignRequestFlowView+Steps.swift`

- [ ] `Services/DesignServices/DesignServicesService.swift` — per the deck's `C4-09`/`C5-11` rows:
  `.invalidRequest` → fixed `"We couldn't process your request. Try again."` (keep the associated
  `message` on the case for `#if DEBUG` logging only); `.networkError` → fixed
  `"Check your connection and try again."`; `.submissionFailed` → the exact sentence from the deck.
- [ ] `Features/DesignServices/DesignRequestFlowView+Steps.swift:170` — the `??` fallback becomes
  `"Something went wrong. Try again."`
- [ ] Re-run Task 5 — expect green.
- [ ] Pathspec commit: both files + the test.

## Task 7 — failing test extension + implement: `CompanionAPIModels.swift`

- [ ] Extend `PatinaTests/ErrorVoiceTests.swift`: `CompanionAPIError.badRequest("CANARY").errorDescription`
  never contains `"CANARY"`; `.serverError(999).errorDescription` never contains `"999"`; the four
  "Something went wrong" family strings across `CompanionAPIError`, the `PatinaErrorState` previews,
  and `ScanReviewView` (source-scanned, since the last is not this lane's file to construct in a unit
  test) collapse to the two canonical sentences the deck names — `"Something went wrong."` (a bare
  headline) and `"Something went wrong. Try again."` (an inline failure with no separate retry
  button) — and no third variant remains anywhere `PatinaTests/` can see (`C5-11`).
- [ ] Run — expect failure on the `CompanionAPIModels.swift` half.
- [ ] `Services/Companion/Models/CompanionAPIModels.swift` — per the deck: `.badRequest` → fixed
  `"That didn't go through. Try again."`; `.serverError` → fixed `"Something went wrong. Try again."`
  (drop the code); `.decodingError` → `"Something went wrong. Try again."` (drop "Please").
- [ ] `Design/Components/PatinaErrorState.swift:41,49` (Preview only) → `"Something went wrong."`
- [ ] Re-run — expect green on this lane's own files; the `ScanReviewView.swift` half of the source
  scan stays red until Task 10's note lands in L1-B's worktree and merges — expected, recorded in the
  deck's closing note.
- [ ] Pathspec commit: `CompanionAPIModels.swift`, `PatinaErrorState.swift`, the test file.

## Task 8 — `BrandVoiceLintTests` (scoped) + verify `B-23`, no code change

- [ ] Write `PatinaTests/BrandVoiceLintTests.swift`: source-scan
  `Features/Onboarding/Views/OnboardingFlowView.swift` and
  `Features/Authentication/Views/AuthenticationView.swift` for `journey` (case-insensitive) and assert
  zero occurrences (`C5-20`); scan the same two files plus every file this deck names for `curated`,
  `elevated`, `disrupt`, `revolutionize`, and the AI-word set — zero everywhere. This will not go fully
  green until Task 9's note lands in L1-A's worktree; record that in the commit body, same as Task 7.
- [ ] Read `Features/StyleQuiz/Views/StyleResultView.swift:65` and confirm the string is exactly what
  `B-23`'s evidence and fix line quote — no L1-E code change, the note in Task 9 carries the fix's own
  verbatim replacement to L1-A.
- [ ] Pathspec commit: the test file only.

## Task 9 — send: L1-A's rows

- [ ] Append the "L1-A applies" table from `build/waves/w1/l1-e-copy-deck.md` to
  `build/waves/w1/l1-a-notes.md` under a new `## From L1-E (Copy) — 2026-09-02` heading, as numbered
  tasks with exact final text (`A-52`, `A-79`, `A-101`, `A-06`, `C5-20`, `C5-10`'s L1-A-owned rows).
  Add `B-23` as its own one-line task (no deck row needed — see the coverage table above): replace
  `StyleResultView.swift:65`'s string with `"Your portrait is yours — reset it any time in Settings."`
  verbatim, the fix line's own text.
- [ ] Mirror the same content into `build/waves/w1/l1e-notes-out.md`.
- [ ] Also record the `CompanionActionRows.swift` file-overlap warning for the steward: A-52 (L1-A) and
  A-60/C-22 (L1-C, Task 11) both touch this file at different, non-overlapping line ranges — flagged so
  the merge is a textual no-op, not silently dropped.

## Task 10 — send: L1-B's rows

- [ ] Append the "L1-B applies" table to `build/waves/w1/l1-b-notes.md` under
  `## From L1-E (Copy) — 2026-09-02`: `C4-09` (`ScanUploadProgressView.swift`, the `ScanUploadFailureCopy`
  contract modelled on `OrderFailureCopy.swift`), `C5-16` (the `resolvedMakerName` guard, three call
  sites), `C5-09`/`C5-10` (`ItemActionMenu.swift`'s five rows), and the `RoomsAPIError` `LocalizedError`
  conformance (`C4-08`'s second half) and `ScanReviewView.swift:128`'s headline period (`C5-11`).
- [ ] Mirror into `l1e-notes-out.md`.

## Task 11 — send: L1-C's rows

- [ ] Append the "L1-C applies" table to `build/waves/w1/l1-c-notes.md` under
  `## From L1-E (Copy) — 2026-09-02`: `A-60`/`C-22` (`CompanionActionRows.swift`'s two rows, done
  together, with the reasoning for why "Your studio" moves from `studioRow` to `profileRow`),
  `ProfileView.swift:148` ("MORE", with the reasoning against a literal "YOUR STUDIO"), `C-30`
  (`statItem` pluralisation), `C-38` (drop the rationale line), `B-20` (fixed CTA label), and `C5-05`'s
  structural note (no string change — flagged so L1-C does not wait on a word that isn't coming).
- [ ] Mirror into `l1e-notes-out.md`.

## Task 12 — send: L1-D's row (proactive, no finding id)

- [ ] Create `build/waves/w1/l1-d-notes.md` (did not exist before this task) with the
  "L1-D applies" table's one row — the `PatinaEmptyState.swift` Preview default — clearly marked
  optional/proactive, not gating any W1 exit criterion.
- [ ] Mirror into `l1e-notes-out.md`.

## Task 13 — self-check screenshots

- [ ] Launch on `IOS_GATE_UDID`, `-DeploymentTarget local`, no `-PatinaFlags` (D1a default), sign in as
  `client@patina.dev` / `password123` where a screen requires it.
- [ ] Before/after: Today headline at a night-hour override (or read the rendered string via
  `describe_screen`) for `C5-06`; the AR placement save-failure toast for `C4-08` (trigger via a scan
  with no scans / an offline save attempt, or confirm via `describe_screen` after a forced failure);
  the design-request send screen's error line for `C4-09`/`C5-11` (best-effort — needs a live failure
  to trigger; if unreachable locally within the time budget, record as `PLAUSIBLE`, not `CONFIRMED`,
  and say so in the report).
- [ ] Screenshots to `shots/w1-l1e/`, one line per shot in `shots/w1-l1e/ledger.md`.

## Task 14 — apply the L1-E deck rows to files this lane owns, from `l1-e-copy-deck.md` if it is later
revised by review

- [ ] Re-read `build/waves/w1/l1-e-copy-deck.md` after Opus review lands (if it changes) and re-apply
  any row this lane owns that the review corrected. Not scheduled unless review returns changes.

## Task 15 — gate

- [ ] `apps/mobile/Patina/scripts/ios-gate.sh build`
- [ ] `apps/mobile/Patina/scripts/ios-gate.sh release`
- [ ] `apps/mobile/Patina/scripts/ios-gate.sh unit`
- [ ] `apps/mobile/Patina/scripts/ios-gate.sh lint-delta main`
- [ ] Record every command's tail verbatim in the final report.

---
---

# FIX ROUND — 2026-09-02, after the adversarial review (22 findings, `RL1E-01`…`RL1E-22`)

Same lane, fresh context, same branch `first-flight/w1-l1e`, same worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1e`.

`IOS_GATE_UDID=2AF6D0CA-91AB-446E-AFA3-4C126AD5827B`

**The VISION check (fix round).** Every fix below is a string, a test, or a markdown row. Nothing adds
or entrenches a tab, a zone, a dashboard, a shadow, red/green status, a badge, an engagement mechanic,
or the word "AI". Two fixes deserve naming because they touch words a tester reads:

- `RL1E-12` renames two style-quiz option labels (`"Eclectic Curated"` → `"Collected Eclectic"`,
  `"Curated Comfort"` → `"Considered Comfort"`). Both are taxonomy labels on the first-run path; the
  rename removes a banned lexicon word and adds nothing. The wire `key`s (`eclectic_curated`,
  `curated_comfort`) are **unchanged** — they are spectrum-mapping inputs, not copy.
- `RL1E-13` restores diagnostic logging. `PatinaLog` is `os.Logger`; nothing is rendered to a tester,
  so no status colour or badge is introduced.

**The notes I must apply.** `build/waves/w1/l1-e-notes.md` now exists and carries three sections
addressed to this lane. Each is a numbered task below:

1. **From L1-C** — record of six deck rows applied, four `C5-10` casing rows applied, one row deleted
   (`C5-05`, Help Center removed), one row *not* applied (`C5-06` — correctly, it is L1-E's own file),
   three VoiceOver labels L1-C wrote, and **one open question**: `SettingsView.swift:212,214`'s alert
   still reads `"Sign Out"` in both title and confirm button, and `AccountActionsTests` pins that
   literal. L1-C asks L1-E for the two strings **and** the pin update together → **Task F7**.
2. **From L1-A** — record of ten deck rows applied verbatim, `P-30`'s "sign-in code" naming, and
   **one open question**: L1-A wrote five new sentences with **straight** apostrophes and asks whether
   `A-06`'s sweep is scoped to `OnboardingFlowView` or app-wide → **Task F8**.
3. **From L1-D (round 2)** — `PatinaEmptyState`'s deck row applied, and the constant renamed
   `stillCuratingPieces` → `stillChoosingPieces` with different words from the deck's, offered back to
   L1-E to change → **Task F9**.

**The notes I will send.** Exact final text for every change this fix round wants in another lane's
file, written to `build/waves/w1/l1e-notes-out.md` **and** appended to the target's
`build/waves/w1/<lane>-notes.md`:

- **L1-A** — `RL1E-11` (`StyleResultView` CTA), `RL1E-12` (two quiz labels), `RL1E-16`
  (`A-101` retention acknowledgement), `RL1E-07` (`A-13` string ratified), Task F8's answer.
- **L1-B** — `RL1E-10`'s `C5-09` rows in `CrossRoomView.swift` and `RoomProjectView.swift`.
- **L1-C** — `RL1E-11` (`"Retake Style Quiz"`), `RL1E-10`'s `ProfileView` accessibility label,
  Task F7's two `Sign Out` alert strings + pin, `RL1E-15` (the greeting now wraps on the flags-off
  header).
- **L1-F** — a `## From L1-E (Copy)` section acknowledging `NotificationFeedView.swift`'s `A-52` row
  (`RL1E-03b`); L1-F already applied it, so the note is a confirmation, not a request.
- **Steward** — `RL1E-03`/`RL1E-04`/`RL1E-22` ownership items and `RL1E-01`'s unwrap step go in the
  final report, not into a lane file.

---

## Fix-round coverage — every review finding to a task

| review id | severity | task | verified by |
|---|---|---|---|
| `RL1E-01` | blocker | F2 | `ios-gate.sh unit` green on this branch |
| `RL1E-02` | blocker | F3, F4, F5, F6, F10 | four new suites compile and run |
| `RL1E-03` | major | F10 (deck), F11 (notes) | deck rows addressed to the steward's owner |
| `RL1E-04` | major | F10 | recorded: L1-A already applied it (`l1-e-notes.md`, Note E-L1A-1) |
| `RL1E-05` | major | F1 | `BrandVoiceLintTests.apostrophesAreCurly` |
| `RL1E-06` | major | F2 | same test |
| `RL1E-07` | major | F10 | deck rows for `A-13` and `GAP1B-01` |
| `RL1E-08` | major | F1 | `ErrorVoiceTests.errorSentencesEndInPeriods` + `theTwoServicesShareOneNetworkSentence` |
| `RL1E-09` | major | F0 | `diff` against the live main-checkout files |
| `RL1E-10` | major | F1, F10, F11 | `NounConsistencyTests` |
| `RL1E-11` | major | F10, F11 | `SentenceCaseTests` |
| `RL1E-12` | major | F10, F11 | `BrandVoiceLintTests.styleQuizIsClean` |
| `RL1E-13` | minor | F1 | `ErrorVoiceTests.rawDetailIsStillLogged` (source pin) |
| `RL1E-14` | minor | F2 | `GreetingWindowTests.hourBandsArePinned` |
| `RL1E-15` | minor | F11 | note to L1-C |
| `RL1E-16` | minor | F10, F11 | deck exception row + L1-A acknowledgement |
| `RL1E-17` | minor | F2 | assertions rewritten |
| `RL1E-18` | minor | F2 | lint scans string literals only |
| `RL1E-19` | minor | F10 | fenced block under `### C5-16` |
| `RL1E-20` | minor | F4 | `NounConsistencyTests.noRoleWordIsRendered` |
| `RL1E-21` | minor | F10 | recorded consequence, declined with a reason |
| `RL1E-22` | minor | F10 + report | deck records the no-id `.badRequest` fix |

---

## Task F0 — restore the three truncated notes files (`RL1E-09`)

- [ ] `diff` each of `l1-a-notes.md`, `l1-b-notes.md`, `l1-c-notes.md`, `l1-d-notes.md` in this
  worktree against the live copy in the main checkout; confirm main is a strict superset
  (0 lines present only in the worktree copy).
- [ ] Copy all four live files over the worktree copies.
- [ ] Re-verify the `## From L1-E` section survives in each.
- [ ] Commit `docs(first-flight): restore the full shared notes files L1-E had snapshotted stale`.

## Task F1 — the source fixes in files this lane owns

Failing test first for each (Tasks F2–F6 hold the tests; write them before this task's edits land).

- [ ] `RL1E-05` — every user-facing string in `DesignServicesService.swift`,
  `CompanionAPIModels.swift` and `ARPlacementViewModel.swift` uses **U+2019**, not U+0027.
- [ ] `RL1E-08` — one punctuation rule in `CompanionAPIError.errorDescription`: a complete failure
  sentence ends in a period. All six generic arms follow it. `DesignServicesError.networkError` and
  `CompanionAPIError.networkError` become **byte-identical**.
- [ ] `RL1E-13` — the raw detail is logged, not discarded: `PatinaLog` at `error` level (not
  `#if DEBUG` — `os.Logger.error` is the level that survives into a Release archive, which is the
  whole point in a TestFlight round) at `DesignServicesService.submitDesignRequest`'s catch, at
  `CompanionAPIClient`'s `.badRequest` and `.serverError` throw sites, and unconditionally at
  `ARPlacementViewModel.saveCurrentPlacement`'s catch.
- [ ] `RL1E-10` — `C5-09`'s two sites in files **no W1 lane owns**, applied here:
  `App/Coordinators/Coordinator.swift:135,198` and
  `Features/Collections/Views/CollectionsView.swift:151`.

## Task F2 — repair the three existing suites (`RL1E-01`, `RL1E-06`, `RL1E-14`, `RL1E-17`, `RL1E-18`)

- [ ] `ErrorVoiceTests` — wrap each cross-lane source-scan in `withKnownIssue`, naming the deck row
  and the owning lane, so the suite is green on this branch and fails loudly at the deck pass once the
  row has landed (the signal to unwrap it). Fix `sendingStepFallbackIsCanonical`'s vacuous negative
  assertion and `companionGenericFailuresAreCanonical`'s "two"/three mismatch. Add
  `errorSentencesEndInPeriods`, `theTwoServicesShareOneNetworkSentence` and `rawDetailIsStillLogged`.
- [ ] `BrandVoiceLintTests` — extract double-quoted string literals before linting, so a
  `curationScore` identifier or a comment quoting a finding cannot fail the gate. Add
  `apostrophesAreCurly` (`A-06`'s missing lint half). Add `styleQuizIsClean`. Wrap the two L1-A files
  in `withKnownIssue`.
- [ ] `GreetingWindowTests` — add `hourBandsArePinned`, pinning all six `case N..<M` arms of
  `TimeOfDay.current`.

## Task F3 — `PatinaTests/NounConsistencyTests.swift` (`RL1E-02`, `RL1E-10`, `RL1E-20`)

## Task F4 — `PatinaTests/PluralisationTests.swift` (`RL1E-02`)

## Task F5 — `PatinaTests/SentenceCaseTests.swift` (`RL1E-02`, `RL1E-11`)

## Task F6 — `PatinaTests/GuestPromiseTests.swift` (`RL1E-02`)

Each of F3–F6 is a scoped source-pin suite on the exact `file:line` sites the deck names, wrapping any
site whose owning lane has not merged yet in `withKnownIssue` naming the row and lane.

## Task F7 — answer L1-C's open question (`l1-e-notes.md`, "One thing the deck does not cover")

- [ ] Supply the two `SettingsView.swift:212,214` alert strings and the `AccountActionsTests` pin
  update as a deck row + an integration note to L1-C.

## Task F8 — answer L1-A's open question (`l1-e-notes.md`, Note E-L1A-3)

- [ ] Rule the scope of `A-06`'s apostrophe sweep and send the answer to L1-A.

## Task F9 — answer L1-D's open question (`l1-e-notes.md`, D→E-1)

- [ ] Ratify or replace `PatinaEmptyState.stillChoosingPieces`'s two strings.

## Task F10 — rewrite `l1-e-copy-deck.md`

Every deck-shaped review finding: `RL1E-02` (closing paragraph), `RL1E-03` (re-address three rows),
`RL1E-04`, `RL1E-07` (`A-13`, `GAP1B-01`), `RL1E-10` (`C5-09` scope + all eight sites), `RL1E-11`,
`RL1E-12`, `RL1E-16` (`A-101` exception), `RL1E-19` (fenced block), `RL1E-21` (recorded consequence),
`RL1E-22` (no-id `.badRequest` fix recorded).

## Task F11 — notes out

- [ ] `l1e-notes-out.md` rewritten, and each block appended to `l1-a-notes.md`, `l1-b-notes.md`,
  `l1-c-notes.md`, `l1-f-notes.md` in **both** this worktree and the shared main checkout.

## Task F12 — self-check on the clone

- [ ] Launch with `-DeploymentTarget local`, no `-PatinaFlags`; screenshot each changed screen
  before/after into `shots/w1-l1e/`; one ledger line per shot.

## Task F13 — gate

- [ ] `apps/mobile/Patina/scripts/ios-gate.sh build`
- [ ] `apps/mobile/Patina/scripts/ios-gate.sh release`
- [ ] `apps/mobile/Patina/scripts/ios-gate.sh unit`
- [ ] `apps/mobile/Patina/scripts/ios-gate.sh lint-delta main`

---

# Fix round 2 (`RL1E2-01` … `RL1E2-24`) — 2026-09-02

`IOS_GATE_UDID=2AF6D0CA-91AB-446E-AFA3-4C126AD5827B`

**The VISION check.** Twenty-four review findings, and not one fix adds or entrenches a tab, a zone, a
dashboard, a shadow, red/green status, a badge, an engagement mechanic, or the word "AI". The
inventory, so the claim is checkable rather than asserted:

- Eleven are **test-shape** repairs (`RL1E2-05`, `-08`, `-15`, `-16`, `-17`, `-18`, `-21`, `-22`) or
  **wave-record** repairs (`RL1E2-06`, `-23`, `-24`) — no product surface at all.
- Nine are **one-word or one-glyph string edits** (`RL1E2-01`, `-02`, `-03`, `-04`, `-09`, `-13`,
  `-19`, `-20`, and `RL1E2-07`'s ratifications).
- `RL1E2-10` adds an **inflection** to a visible count label ("1 piece", not "1 pieces") — the same
  `C-30` shape already ruled, changing which word renders, not the layout.
- `RL1E2-12` changes which **enum arm** a non-network error maps to; nothing new is drawn.
- `RL1E2-11` and `RL1E2-14` are routed as notes and a recorded consequence; neither adds UI.

`RL1E2-18` moves the AI-word lint from leading-space needles to word boundaries, which makes the "zero
occurrences of AI" rule **stronger**, in the direction VISION asks. No exception is claimed.

**The notes I must apply** — every `<lane>-notes.md` section addressed to L1-E, as numbered tasks. Read
from the shared main checkout at `/Users/kody/Code/patina-merged/artifacts/ios-testflight-polish-2026-09-01/build/waves/w1/l1-e-notes.md`
(mtime 22:29, newer than this branch's frozen copy — see Task G1):

| # | note | task |
|---|---|---|
| 1 | **O13 → L1-E** (`l1-e-notes.md:248-283`, from L1-B) — six strings L1-B introduced that no deck row covers: `ProductModel.matchLabel`'s `"Strong match"` / `"Good match"` / `"Worth a look"` / `"Not scored yet"`, and `LocalStoreRecoveryNotice`'s title and body. "If the deck rewrites them, say so before L1-E rebases." | **G6** — all six answered as deck rows, plus the seventh L1-B has since added (`CollectionsView`'s `.failed` sentence) |
| 2 | **From L1-C** (`:8-91`) — deck rows applied, three strings L1-C wrote, one row deleted, one row not applied | Already answered in fix round 1 (Tasks F7, F10); re-checked, nothing new outstanding |
| 3 | **Note E-L1A-1/-2/-3** (`:93-163`, `:204-247`) — L1-A's applied rows, the `AuthMode` header residue, three new sentences, and the `A-52` re-route | Already answered in fix round 1 (Tasks F8, F10); `RL1E2-24` leaves **one** item open — L1-A has not answered `A-101`'s retention-period exception. Re-sent in **G9**, reported as open |
| 4 | **D→E-1** (`:165-203`, from L1-D) — `stillChoosingPieces` ratification | Already answered in fix round 1 (Task F9) |

**The notes I will send** — every change this lane needs in another lane's file, with the exact final
text, written to `build/waves/w1/l1e-notes-out.md` **and** appended to the target lane's
`<lane>-notes.md` in the shared main checkout (Task **G9**):

| target | rows |
|---|---|
| `l1-a-notes.md` | five straight-apostrophe corrections (`RL1E2-01`); `QuizModels.swift:112`'s `"journey"` title (`RL1E2-02`); the `A-101` retention ratification, re-asked (`RL1E2-24`) |
| `l1-b-notes.md` | three straight-apostrophe corrections (`RL1E2-01`); `MoneyFailureCopy` + `ScanReviewView` + `ScanWalkView`'s `"Let’s try that again"` (`RL1E2-04`); `CollectionsView`'s empty-state noun, because L1-B rewrites that block (`RL1E2-11`); the four `"Curated"` display names (`RL1E2-19`); `LocalStoreRecoveryNotice`'s two apostrophes and the four `matchLabel` ratifications (`RL1E2-07`) |
| `l1-c-notes.md` | `HomeStoryRetryRow`'s `"Let’s try that again"` (`RL1E2-04`); `C-38` is **not** closed by L1-C's edit — the live path is `StyleProfile`, fixed here (`RL1E2-20`); the greeting-wrap row, filed properly this time (`RL1E2-14`) |
| `l1-f-notes.md` | nothing new this round |

---

## Fix-round-2 coverage — every review finding to a task

| id | sev | task | test that pins it |
|---|---|---|---|
| `RL1E2-01` | blocker | **G2**, **G9** | `BrandVoiceLintTests.crossLane*ApostrophesAreCurly` — one `@Test` per file |
| `RL1E2-02` | blocker | **G3**, **G9** | `BrandVoiceLintTests.styleQuizIsClean` now calls `Self.lint` over the whole file |
| `RL1E2-03` | major | **G4** | `BrandVoiceLintTests.apostrophesAreCurly` (`OrderFailureCopy.swift` added to `deckFiles`) |
| `RL1E2-04` | major | **G2**, **G9** | `BrandVoiceLintTests.crossLaneMoney/Home/RoomScanApostrophesAreCurly` |
| `RL1E2-05` | major | **G2** | the wrappers themselves — one `@Test` per deck row |
| `RL1E2-06` | major | **G1** | `git ls-tree HEAD` in the report |
| `RL1E2-07` | major | **G6**, **G9** | `BrandVoiceLintTests.crossLaneLocalStoreRecoveryApostrophesAreCurly` |
| `RL1E2-08` | major | **G7** | new `NounConsistencyTests.recommendationCardsCarryNoBoilerplate`, `SentenceCaseTests.roomCTAIsAFixedLabel`, `NounConsistencyTests.theQuizNudgeIsGone` |
| `RL1E2-09` | major | **G5** | `NounConsistencyTests.theSavedTabsSayPieces` |
| `RL1E2-10` | major | **G5** | `PluralisationTests.boardRowInflectsItsVisibleCount` |
| `RL1E2-11` | major | **G9** | `NounConsistencyTests.unownedSitesSayPieces` (already) + the note |
| `RL1E2-12` | minor | **G4** | `DesignServicesErrorMappingTests.mapErrorOnlyClaimsAConnectionForARealOne` |
| `RL1E2-13` | minor | **G5** | `SentenceCaseTests.theSavedScreenDoesNotMixCasing` |
| `RL1E2-14` | minor | **G8**, **G9** | recorded row + note (no code) |
| `RL1E2-15` | minor | **G2** | the reads are hoisted; a missing file now throws out of the `@Test` |
| `RL1E2-16` | minor | **G2** | `ErrorVoiceTests.rawDetailIsStillLogged` pins the exact call |
| `RL1E2-17` | minor | **G2** | `GreetingWindowTests` is `throws` throughout |
| `RL1E2-18` | minor | **G2** | `BrandVoiceLintTests.lint` uses word boundaries for all four AI needles |
| `RL1E2-19` | minor | **G7**, **G9** | `BrandVoiceLintTests.crossLaneStyleModelsAreClean` |
| `RL1E2-20` | minor | **G4**, **G7** | `NounConsistencyTests.recommendationCardsCarryNoBoilerplate` |
| `RL1E2-21` | minor | **G2** | `CompanionAPIClient.swift` added to `deckFiles` |
| `RL1E2-22` | minor | **G8** | — (wave-record correction) |
| `RL1E2-23` | minor | **G8** | — (wave-record correction) |
| `RL1E2-24` | minor | **G9** | — (reported open; not this lane's to ratify) |

---

## Task G1 — drop the five inbox files this lane does not own (`RL1E2-06`)

- [ ] `git rm` `l1-b-notes.md`, `l1-c-notes.md`, `l1-d-notes.md`, `l1-f-notes.md`, `l1-e-notes.md`
  from the branch, and restore `l1-a-notes.md` to `main`'s version — L1-A's own branch modifies it and
  a second lane's +800 lines would conflict at merge.
- [ ] Verify: `git ls-tree --name-only HEAD .../waves/w1/` lists exactly `l1-a-notes.md` (unmodified),
  `l1-e-copy-deck.md`, `l1e-notes-out.md`, `l1e-tasks.md`.
- [ ] Commit `chore(first-flight): drop the shared W1 inboxes this lane does not own`.

## Task G2 — repair the seven suites' shape (`RL1E2-05`, `-15`, `-16`, `-17`, `-18`, `-21`, and `-01`/`-04`'s pins)

- [ ] Failing test first: add the cross-lane apostrophe pins for the eight files the deck names for
  another lane — `AccountDeletionService`, `RoomsAPIClient`, `ScanUploadFailureCopy`,
  `MoneyFailureCopy`, `HomeStoryRetryRow`, `ScanReviewView`, `ScanWalkView`,
  `LocalStoreRecoveryNotice` — **one `@Test` per file**, each `withKnownIssue`-wrapped, each reading
  its source *outside* the wrapper.
- [ ] Run: `ios-gate.sh unit` → the eight record known issues (green here, red-on-unwrap after merge).
- [ ] Split every multi-row `withKnownIssue` in `NounConsistencyTests`, `SentenceCaseTests`,
  `GuestPromiseTests`, `BrandVoiceLintTests`, `PluralisationTests` into one `@Test` per deck row.
- [ ] Hoist every `try SourcePin.read` out of every wrapper.
- [ ] `GreetingWindowTests`: `try!` static → `throws` + `try` per test.
- [ ] `BrandVoiceLintTests`: word-boundary regex for `gpt`, `llm`, `artificial intelligence`,
  `machine learning`; add `Services/Companion/CompanionAPIClient.swift` to `deckFiles`.
- [ ] `ErrorVoiceTests.rawDetailIsStillLogged`: pin the exact DesignServices log call.
- [ ] Run: `ios-gate.sh unit`. Commit `test(copy): one pin per deck row, and a lint that reads the whole deck`.

## Task G3 — the quiz's fifth question (`RL1E2-02`)

- [ ] Failing test first: `BrandVoiceLintTests.styleQuizIsClean` calls `Self.lint` over
  `QuizModels.swift` instead of six hand-written `contains`.
- [ ] Run: the wrapper records the `"journey"` issue (and the two `"Curated"` labels).
- [ ] Deck row + note to L1-A with the exact final title. No code change here — `StyleQuiz/**` is L1-A's.
- [ ] Commit with G2.

## Task G4 — the three source fixes in files this lane owns (`RL1E2-03`, `-12`, `-20`)

- [ ] Failing test first: add `Features/Purchase/OrderFailureCopy.swift` to `deckFiles`;
  add `DesignServicesErrorMappingTests.mapErrorOnlyClaimsAConnectionForARealOne`;
  add `NounConsistencyTests.recommendationCardsCarryNoBoilerplate`.
- [ ] Run: `ios-gate.sh unit` → three failures.
- [ ] Implement: sweep `OrderFailureCopy.swift`'s eleven straight apostrophes to U+2019;
  `DesignServicesError.map(_:)` maps a real `URLError` to `.networkError` and everything else to
  `.submissionFailed` (the arm `map(message:detail:)` already uses as its catch-all);
  `StyleProfile.recommendationRationale`'s room-name fallback returns `nil`.
- [ ] Run: `ios-gate.sh unit` → green.
- [ ] Commit `fix(copy): the purchase path's apostrophes, an honest catch-all, and C-38's live half`.

## Task G5 — the Saved screen (`RL1E2-09`, `-10`, `-13`)

- [ ] Failing test first: `NounConsistencyTests.theSavedTabsSayPieces`,
  `PluralisationTests.boardRowInflectsItsVisibleCount`,
  `SentenceCaseTests.theSavedScreenDoesNotMixCasing`.
- [ ] Run → three failures.
- [ ] Implement in `Features/Collections/**` (no W1 lane — steward.md §5.1's residue row):
  `allItemsTab = "All pieces"`; the board row's visible count inflects and says "piece";
  `"New Board"` → `"New board"`, `"Create Board"` → `"Create board"`.
- [ ] Run → green. Commit `fix(copy): the Saved screen says pieces, inflects its counts, and picks one casing`.

## Task G6 — answer L1-B's O13 (`RL1E2-07`)

- [ ] Read all seven strings; write a deck row for each — four ratified as written, three corrected.
- [ ] Pin `LocalStoreRecoveryNotice`'s two apostrophes in G2's cross-lane list.
- [ ] Commit with G8.

## Task G7 — the three rows with no pin (`RL1E2-08`, `-19`, `-20`)

- [ ] Add `SentenceCaseTests.roomCTAIsAFixedLabel` (`B-20`),
  `NounConsistencyTests.recommendationCardsCarryNoBoilerplate` (`C-38`, both halves),
  `NounConsistencyTests.theQuizNudgeIsGone` (`A-13`),
  `BrandVoiceLintTests.crossLaneStyleModelsAreClean` (`RL1E2-19`).
- [ ] Correct the coverage table's two wrong claims and `RL1E2-22`'s wrong function name.
- [ ] Run → green. Commit with G2/G4.

## Task G8 — deck revision 3 (`RL1E2-14`, `-22`, `-23`, and every row above)

- [ ] Rewrite `l1-e-copy-deck.md`: the new rows, the greeting-wrap row filed properly, the honest gate
  tail with the isolation run and the `S-L1A-1` citation, the corrected pin table.
- [ ] Commit `docs(first-flight): copy deck revision 3`.

## Task G9 — notes out

- [ ] `l1e-notes-out.md` rewritten; each block appended to `l1-a-notes.md`, `l1-b-notes.md`,
  `l1-c-notes.md` **in the shared main checkout** (not committed — see G1).

## Task G10 — self-check on the clone

- [ ] Launch with `-DeploymentTarget local`, no `-PatinaFlags`; sign in as `client@patina.dev`;
  screenshot each changed screen before/after into `shots/w1-l1e/`; one ledger line per shot.

## Task G11 — gate

- [ ] `apps/mobile/Patina/scripts/ios-gate.sh build`
- [ ] `apps/mobile/Patina/scripts/ios-gate.sh release`
- [ ] `apps/mobile/Patina/scripts/ios-gate.sh unit`
- [ ] `apps/mobile/Patina/scripts/ios-gate.sh lint-delta main`

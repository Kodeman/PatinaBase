# Wave 2 — merge-readiness review

**Branch:** `feat/field-companion-w2` · **range reviewed:** `6d91eb1b6...695addb5f` (14 commits)
**Worktree:** `.claude/worktrees/field-companion-w2` (read-only; no edits, no git mutations, no builds)
**Reviewer context:** separate from every implementer and from the wave conductor.
**Date:** 2026-08-25

---

## Verdict: **MERGE**

Fast-forward is clean and provable: `main` is `6d91eb1b6875a31e8a516c256d7c3901a396f430`, which is
exactly the merge-base with the branch, so `git merge --ff-only feat/field-companion-w2` moves main
to `695addb5f` with no merge commit.

I found **no blocker**. Every claim the brief asked me to check reconciles against the code. The
one finding the conductor's own list does not carry (W2-01, N5's `setConfidence` mis-pin) is
pre-existing, reachable today only through the verification harness, and is correctly a Wave 3
item rather than a merge gate.

Two things to be explicit about, because they are the honest cost of merging:

1. **The wave's headline feature is unverified at any level.** The real reader ships; nothing —
   not the gate, not the sim sweep, not a test — proves it ever lands a value on a real capture.
   Device criteria 1 and 2 are the only things that can settle it and both are "not run". This is
   the second consecutive wave the device pass has been blocked on wifi-only phones. It is a
   standing fact, not a branch defect, but it should become a named line item with Kody rather
   than a gate-time hope.
2. **On the fast path the feature may in practice record nothing.** A multi-MB HEIC read (still on
   the main actor — W2-05) plus a Vision pass races a one-tap Save, and the `.local` guard
   correctly drops the late write. The behaviour is *honest* (records nothing rather than something
   false, which is the wave's thesis) but it is a delivery risk, not a delivered feature.

Neither justifies holding the merge: the branch is strictly more truthful than what is on main
today, and both are cleanly named in the wave report.

---

## Gate coverage of the merge tip

The wave gate ran at `f41150e37` — three commits before the tip. I verified that gap is safe:

- `a5fd7a7e0` — I diffed every changed line in all six Swift files. **Every one is a `//` or `///`
  comment line.** The only non-comment change in the commit is one markdown line in `README.md`.
- `65606a315`, `695addb5f` — docs only (`docs/design/field-companion/waves/wave-2/**`).

So the green gate at `f41150e37` genuinely covers `695addb5f`. A re-run at the tip is cheap
insurance but is not required by evidence.

---

## 1. The one-commit frozen-seam edit (`13cf6a28f` + `1ac708735`)

**Verified correct.** Every item on the brief's list landed, in one commit, with the pbxproj diff
inside it.

| Check | Result | Evidence |
|---|---|---|
| `CaptureSheet.visit` | ✅ | `CaptureNavigation.swift:62`, `id` at `:83`, `registryKey` at `RouteRegistry.swift:83` |
| `CameraMode.voice` | ✅ | `CaptureEnums.swift:16` |
| `viewfinderSelectable` is a **literal**, not a filter | ✅ | `CaptureEnums.swift:26-28` — `[.photo, .tag, .measure, .scan]` |
| Every `allCases` consumer repointed | ✅ | grep for `CameraMode.allCases` across `apps/mobile/Capture` returns **zero** production hits; the only survivor is the assertion `CameraModeSeamTests.swift:21`. The three call sites are now `ViewfinderControls.swift:191`, `ViewfinderPlaceholder.swift:38`, `CameraPrimingScreen.swift:79`, all reading `viewfinderSelectable` |
| `CaptureScreenID` gains `v0Visit`/`c6Voice`/`v4VisitReview` | ✅ | `CaptureScreenID.swift:82-84` |
| `screen.F1.context` orphan fixed | ✅ | case at `CaptureScreenID.swift:80`; `SiteScanContextCapture.swift:346,:348` now use `CaptureScreenID.f1Context.rawValue` instead of the hand-typed literal |
| `AppContainer.smartGuess` + `featureFlags` | ✅ | `AppContainer.swift:43,:47`; wired in **both** branches (`:85-86` real, `:125-126` mock) |
| `ContentState` gains three optionals | ✅ | `CaptureSyncAttributes.swift:22-24`, all defaulted `= nil` in the memberwise init |
| Three `LocalCaptureSyncService` sites still compile | ✅ | `LocalCaptureSyncService.swift:184`, `:717`, `:825` are all `.init(queued:…)` with no new argument — they compile unchanged on the `= nil` defaults |
| `FieldPlaceholderScreen` deleted | ✅ | file removed in `13cf6a28f`; zero references repo-wide |
| Headers corrected | ✅ | `AppContainer.swift:1-18` in the seam commit; the rest in `86e369f10` |

**Exhaustive switches.** I enumerated every switch that could break:

- **`CameraMode`** — exactly one exhaustive switch exists repo-wide:
  `SpecimenCapturePolicy.nextStep` (`SpecimenCapturePolicy.swift:19-27`). It handles `.voice →
  .quickConfirm` with a comment naming Wave 3's `producesPhoto(_:)` guard as the real fix. The
  other `switch mode` hit (`AVFoundationCameraService.swift:209`) is over `TorchMode`, not
  `CameraMode`. `ViewfinderModel.swift:262` switches over `CaptureNextStep`.
- **`CaptureSheet`** — the two `switch self` sites (`CaptureNavigation.swift:69` `id`,
  `RouteRegistry.swift:69` `registryKey`) both gained `.visit`. Sheet *dispatch* is a dictionary
  registry (`RouteRegistry.swift:33-36`), not a switch, so no third site could break.
- **`CaptureScreenID`** — `CaptureDeepLink.drive`'s switch (`:83-136`) has **no `default:`**, so the
  compiler enforces all 75 ids. `routeWorkScreen` (`:163-190`) has a `default: assertionFailure`,
  and is only ever called from the enumerated Work set. `realm(for:)` (`:200-216`) has
  `default: .camera`, which the three reserved ids fall into — harmless, since they `break`.

**`cycleMode` never lands on `.voice`.** `ViewfinderModel.swift:153-157` reads
`CameraMode.viewfinderSelectable`, and `.voice` is not in it, so no arithmetic over that array can
produce it. The `firstIndex(of: mode) ?? 0` fallback is correct as a defence.

**Reserved ids route to `break`, not to a screen.** `CaptureDeepLink.swift:83-91` — `.v0Visit`,
`.c6Voice`, `.v4VisitReview` share the `break` arm with C1, with a comment saying why. Confirmed
they are *not* in the `routeWorkScreen` arm and *not* in `ALL_SCREENS`.

---

## 2. `applySmartGuess` → the real `HeuristicSmartGuessService` (`4a4da60a7` + `a54316f6a`)

**Verified correct on the C1 path.**

| Check | Result | Evidence |
|---|---|---|
| No `seating` / `Oak / bouclé` literal in the guess path | ✅ | The literals are gone from `ViewfinderModel.applySmartGuess`. Three survivals remain, **all preview/mock fixtures** — see W2-12/W2-13 |
| F-1 guard: never pin a confidence the write didn't take | ✅ | `ViewfinderModel.swift:479-481` — `guard current.provenance(for: suggestion.key) == suggestion.source else { continue }`. I traced `setValue` (`Specimen+Accessors.swift:138-157`): it refuses whenever `existing != .smartGuess`, with no per-source special-casing, so the guard is sound for **every** non-guess source, not just `.manual`. `FieldSuggestion.source` defaults to `.smartGuess` and no non-default suggestion is constructed outside tests |
| Never overwrites a designer edit | ✅ | Enforced by `setValue` itself; the guard above stops the confidence following it |
| Only applies to a specimen still `.local` | ✅ | `ViewfinderModel.swift:473-475` — `current.transferState.phase == .local` |
| Provenance badge only when a source exists | ✅ | `CaptureCardOverlay.swift:62-66` pass `provenance(for:)` unwrapped; `guessRow` (`:111`) takes `ProvenanceSource?` and renders the badge under `if let source` (`:119`). `categoryLabel` (`:130-132`) shows `"—"` for `.unknown` |
| Mock mode wires the real service | ✅ | `AppContainer.swift:125` — `HeuristicSmartGuessService()` in the mock branch too. `RecognitionScreens.swift:81` now passes `container.smartGuess` instead of constructing its own |
| `hasUnconfirmedGuess` is provenance-only, no confidence floor | ✅ | `Specimen+Accessors.swift:131-133` unchanged; `SmartGuessTests.swift:151-160` asserts a 0.92 guess is still unconfirmed |
| S3 recommends Inbox regardless of confidence | ✅ | `S3DestinationScreen.swift:63-70` — the `hasUnconfirmedGuess` ternary is replaced by an unconditional `return .inbox`, with the Flow-6 reason in the comment |
| `SmartGuessKeywords` moved to CaptureKit with tests | ✅ | `CaptureKit/CaptureKit/Recognition/SmartGuessKeywords.swift`; `HeuristicSmartGuessService.swift:51` delegates; `SmartGuessTests.swift:22-72` |

### The conductor's parked items — my judgement on each

| # | Item | Blocker? | Judgement |
|---|---|---|---|
| a | Late write dropped if Save beats the read | **Follow-up (Wave 3)** | Confirmed. Composed with W2-05's main-actor read, the race window is a multi-MB file read plus a Vision pass against a single tap. Behaviour is honest — it records nothing rather than something false — so it is a *delivery* risk, not a lie. **Only device criterion 1 can settle it.** The right call was made |
| b | `.dimensions` F-1-class | **Follow-up** | Confirmed live-in-shape, latent-in-fact. `Specimen+Accessors.swift:153` `break`s on `.dimensions` without writing a value, but `:156` stamps `provenanceRaw` *outside* the switch — so the F-1 read-back guard would **pass** on a value nobody wrote. Unreachable today: `HeuristicSmartGuessService.guess` (`:24-30`) emits only `.category`, `.material`, `.colorway`. A one-line `guard suggestion.key != .dimensions` in `fieldsWorthRecording` closes it. Correctly not fixed in a text-only closing pass |
| c | Keyword shadowing (`"table lamp"` → `.table`, `"tapestry"` → `.plumbing`) | **Follow-up** | Confirmed by hand-tracing the table. Both are real: `"table lamp"` hits `("table", .table)` at index 8 before `("lamp", .lighting)` at index 11; `"tapestry"` contains `"tap"`. Vision's taxonomy does emit compound identifiers, so this fires on real captures. Contained by FC-R12 (nothing auto-applies) and by S3's unconditional Inbox hold, so the cost is a tap, not a wrong record. **The report is right that `everyKeywordInTheTableResolvesToItsOwnCategory` does not cover it** — I verified every one of the 39 table entries resolves to its own category today, which is exactly the space where the defect does *not* bite |
| d | `SmartGuessSheet.swift:71,:103` unconditional badge | **Follow-up** | Confirmed, and **there is a second half the report does not carry** — see W2-01 below |

---

## 3. Deletions (`9021a4364`)

**Verified clean.**

- `LowLightTorchOverlay` — zero references outside its own `#Preview` before deletion; zero after.
  C1's real low-light UI (`ViewfinderNightChip` / `ViewfinderTorchPill` / `ViewfinderLowLightHint`)
  is untouched.
- `FieldPlaceholderScreen` — deleted in the seam commit `13cf6a28f`, per the §5.5 one-commit
  ruling. Zero references.
- **pbxproj regenerated and committed.** I diffed the file lists between `6d91eb1b6` and
  `695addb5f` programmatically:

  ```
  path refs:  main 270  →  wave 274
  only in main: Design/FieldPlaceholderScreen.swift, Features/Resilience/LowLightTorchOverlay.swift
  only in wave: Analytics/CaptureFeatureFlags.swift, Recognition/SmartGuessKeywords.swift,
                CameraModeSeamTests.swift, CaptureFeatureFlagsTests.swift,
                CaptureScreenIDTests.swift, SmartGuessTests.swift
  build-file entries: 540 → 548   (−4 = 2 files × 2 phases, +12 = 6 files × 2 phases)
  targets: 4 → 4 (CaptureKitMocks, CaptureKit, Capture, CaptureTests)
  ```

  **Exactly the intended delta. Nothing else dropped.** Both shared schemes were regenerated with
  the new blueprint identifiers, and only those two schemes exist, so no scheme is left pointing at
  a stale id.

---

## 4. Sweep (`fcc2c8365`)

**Counts reconcile exactly.** Machine-checked, not eyeballed:

```
ALL_SCREENS entries        : 72   (no duplicates)
CaptureScreenID cases      : 75   (no duplicate raw values, no duplicate suffixes)
enum suffixes not in sweep : V0.visit, C6.voice, V4.visit-review   ← the 3 reserved
sweep entries not in enum  : none
suffix-collision check     : no id's sweepSuffix is a tail of any other id's rawValue
```

72 = 75 − 3. The README's arithmetic also reconciles: 33 + 19 + 20 = 72 built, + 3 reserved = 75.

**`CaptureCoordinator.siteScanContextRequested`.** Confirmed consumed exactly once and harmless in
production:

- Declared `CaptureCoordinator.swift:22`
- **Set only** at `CaptureDeepLink.swift:183` — inside `routeWorkScreen`, i.e. only from
  `field://screen/...` or `-CaptureScreen F1.context`. `verificationHarnessAllowed`
  (`CaptureDeepLink.swift:192-198`) gates the whole entry point off in release-with-real-services.
- **Cleared before use** at `SiteScanSetupScreen.swift:131`, then `showContextCapture = true` at
  `:132`, driving the `fullScreenCover` at `:119`.
- The production entry to the same cover is the separate `:238`, which never touches the flag.

The one residual: if the deep link fires and the setup screen never appears, the flag stays armed
and would pop the cover on a later legitimate visit to F1. Unreachable outside the harness.
Informational only.

---

## 5. Copy / hygiene

| Check | Result |
|---|---|
| No "AI" | ✅ Zero hits in added lines across `apps/mobile/Capture` and `docs/design/field-companion`. The only occurrences of the token are in the ledger *asserting* the check |
| "Inbox" strings untouched | ✅ Zero added-or-removed lines contain an `"…Inbox…"` string literal |
| No secrets | ✅ Scanned added lines for `sk_live`, `sbp_`, JWT-shaped tokens, PEM headers, `api_key=`, `password=` — zero |
| Conventional Commits | ✅ All 14 subjects conform (`feat(ios)`, `fix(ios)`, `refactor(ios)`, `docs(ios)`, `test(ios)`, `chore(field-companion)`, `docs(field-companion)`, `fix(field-companion)`) |
| The `merge:`-subject amend happened | ✅ `f41150e37` is `chore(field-companion): merge main's 00531 extension-execute hotfix…`. No `merge:` subject anywhere in range |
| Ledger snapshots present | ✅ `waves/wave-2/{README,progress,rulings-index,device-pass}.md` all tracked |
| Byte-equal to `.superpowers/` | ✅ `progress.md` — `cmp` **identical**. `rulings-index.md` and `device-pass.md` have no `.superpowers/` counterpart (conductor-authored directly under `docs/`), so there is nothing to diverge from |
| Rulings count | ✅ 42 bullets in `rulings-index.md`, matching `695addb5f`'s message |
| No stray files | ✅ Tracked tree clean. `.superpowers/` and `.build/` are gitignored (`.gitignore:106`, `:8`). Branch touches **nothing** outside `apps/mobile/Capture/` and `docs/design/field-companion/` |
| Merge `f41150e37` scope | ✅ Three files, all `supabase/**`. No iOS overlap, as claimed |

---

## Findings

Severity: **Blocker** → must fix before merge · **Major** → fix soon, named owner · **Minor** →
tidy-up · **Info** → recorded, no action implied.

### W2-01 · N5's smart-guess sheet pins a confidence to a value it did not write
**Severity: Major · Confidence: High · Not a blocker**
`apps/mobile/Capture/Capture/Features/Recognition/SmartGuess/SmartGuessSheet.swift:173-189`

This is **the exact defect the wave fixed on the C1 path (F-1), still live on the N5 path** — and
it is a half the wave report's item 13 does not carry. Item 13 flags only the unconditional
`ProvenanceBadge(.smartGuess)` at `:71` and `:103`. The write path has the same disease:

```swift
if !material.isEmpty {
    specimen.setValue(material, for: .material, source: .smartGuess)
    specimen.setConfidence(confidence["Material"] ?? 0, for: .material)   // ← unguarded
}
```

`setValue` silently refuses when the field already carries non-`smartGuess` provenance;
`setConfidence` fires anyway. So a field the designer typed can reach `products.capture_provenance`
as `provenance: "manual"` **plus** a `guesses` entry — the mirror-image defect, verbatim.

It is worse than the C1 case was, because `loadGuess` **back-fills the designer's own value into
the variable it then re-writes**: `:159-160` do `if material.isEmpty { material = specimen.materialNote ?? "" }`,
so the refused write is not a hypothetical collision — it is the common path. The same applies to
`categoryRaw` at `:152` and `colour` at `:160`.

`accept()` (`:194-215`) is correct — it writes only values and uses `promotedSource`.

**Not a merge blocker** because N5 has exactly one presenter repo-wide —
`CaptureDeepLink.swift:96`, the verification harness — which `verificationHarnessAllowed` gates
off in release. It becomes live the moment Wave 3 gives N5 a production entry point.

**Fix (Wave 3, ~4 lines):** apply the same guard the C1 loop uses:
```swift
specimen.setValue(material, for: .material, source: .smartGuess)
guard specimen.provenance(for: .material) == .smartGuess else { … }
specimen.setConfidence(…)
```
This is the strongest argument for owed item 2 (the `Specimen.recordSmartGuess(_:)` extraction):
one shared loop in CaptureKit would have closed C1 and N5 together, and would have made this
finding impossible.

### W2-02 · `.dimensions` defeats the F-1 guard
**Severity: Major (latent) · Confidence: High · Follow-up**
`apps/mobile/Capture/CaptureKit/CaptureKit/Domain/Specimen+Accessors.swift:153,:156`

Confirmed as the report's item 12 describes. `setValue` `break`s on `.dimensions` without writing a
value but stamps `provenanceRaw` and calls `touch()` outside the switch, so
`provenance(for: .dimensions) == .smartGuess` even though nothing was written — and the F-1
read-back guard passes. Unreachable today (`HeuristicSmartGuessService.guess:24-30` emits only
`.category`/`.material`/`.colorway`). One-line fix in `fieldsWorthRecording`.

### W2-03 · Keyword table first-match-wins shadowing
**Severity: Major · Confidence: High · Follow-up**
`apps/mobile/Capture/CaptureKit/CaptureKit/Recognition/SmartGuessKeywords.swift:13-28`

Confirmed by hand-tracing. `"table lamp"`/`"desk lamp"` → `.table`; `"tapestry"` → `.plumbing`.
Pre-existing; this wave is what makes the path fire. The report's own correction is right: the new
`everyKeywordInTheTableResolvesToItsOwnCategory` test pins the table against itself and covers
none of the label space where the defect bites. The real fix is longest-match-wins or a priority
column, not a reorder (which trades one shadow for another).

### W2-04 · The test mirrors the production loop instead of calling it
**Severity: Major · Confidence: High · Wave 3 task-0**
`apps/mobile/Capture/CaptureTests/SmartGuessTests.swift:80-86` vs
`apps/mobile/Capture/Capture/Features/Capture/ViewfinderModel.swift:475-483`

Confirmed line-for-line identical today. The failure mode is "test green, ship broken", which is
the worst a test can have. The report correctly promotes this to the highest-value owed item; I
agree, and W2-01 is the concrete demonstration of what a duplicated loop costs. Remedy is ~8 lines
of pure CaptureKit.

### W2-05 · The media read is deferred but still on the main actor
**Severity: Major · Confidence: High · Follow-up (Wave 3)**
`apps/mobile/Capture/Capture/Features/Capture/ViewfinderModel.swift:465-484`

Confirmed independently. `ViewfinderModel` is `@MainActor`; a plain `Task { }` inherits that
isolation through its synchronous prefix, so `Data(contentsOf:)` runs on the main thread — later
than before, but not off it. The fix as landed is still strictly better than both the brief's shape
and the pre-wave code. Needs a `nonisolated async` read.

### W2-06 · Commit `86e369f10` claims a header edit it did not make
**Severity: Minor · Confidence: High · No action (history is immutable)**

The message opens "Seven of them" and its first named example is `SpeechVoiceNoteService`'s
raw-audio claim. The commit touches **six** files and `SpeechVoiceNoteService.swift` is not among
them — the conductor's own ledger records it correctly at `progress.md:82`
("already gone — Task 4 records 'already true, no edit' and invents nothing"), and it was an
explicitly fenced-out file at `progress.md:198`. Read charitably the sentence is describing a past
cost; read as written it is a claimed fix that was not made, in the wave whose thesis is that no
claim is false. Worth a line in the Wave 3 handoff so nobody later trusts the count.

### W2-07 · The report's `wave-4-plan.md` citation is itself off
**Severity: Minor · Confidence: High · Fix when applying spec corrections**

`wave-2-report.md` §6 (and `wave-2-plan.md:1775`, and `wave-2-plan-review.md:206`) cite
`wave-4-plan.md:192`. The wrong path is actually at **`docs/design/field-companion/plans/wave-4-plan.md:304`**:

```
grep -n 'case visit|…' CaptureKit/CaptureKit/Navigation/CaptureNavigation.swift \
                       CaptureKit/CaptureKit/Navigation/CaptureScreenID.swift
```

`wave-4-plan.md:192` is a table row about SQL test files. The substantive claim is right — the
file is at `CaptureKit/CaptureKit/Support/CaptureScreenID.swift` — only the anchor is wrong.

### W2-08 · `wave-2-report.md` head sha is two commits stale, not one
**Severity: Minor · Confidence: High · Self-mitigating**
`docs/design/field-companion/wave-2-report.md:3,:5-6,:322-324`

Pins `65606a315` and says it "advances by one commit — this fix pass". It advanced by two
(`a5fd7a7e0` + `695addb5f`). The same prose instructs the reader to take the branch tip rather than
the pinned sha, which neutralises the risk entirely.

### W2-09 · Report and index disagree on the ruling count
**Severity: Minor · Confidence: High**
`docs/design/field-companion/wave-2-report.md` says "All 31-plus conductor rulings"; the index
carries **42**. The report was written before the final regeneration in `695addb5f`. "31-plus" is
not false, just uninformative.

### W2-10 · The committed wave-2 docs link to untracked siblings
**Severity: Minor · Confidence: High · Orchestrator decision**

`waves/wave-2/README.md` and `rulings-index.md` point at `../../field-companion-package.md`,
`../../field-companion-rulings.md` and `../../plans/wave-2-plan.md` — **all untracked**. The
conductor's stated reason for tracking the ledger was that "untracked, those pointers dangle the
moment the branch merges"; only half the problem was closed. This is a pre-existing programme
condition (`wave-1-report.md`, `wave-2-plan.md`, the spec, and the rulings file are all untracked
while `wave-1p-plan.md` and `wave-2-report.md` are tracked), so it is not a defect this branch
introduces. It wants a single decision: land the spec + plans + rulings, or accept the dangling
links.

### W2-11 · Fresh line-number citations in comments, the pattern the wave removed elsewhere
**Severity: Minor · Confidence: High**

Commits `5c757d3f2` and `621b521d3` correctly replaced a line citation with a named mechanism,
on the grounds that "a named mechanism survives edits, a line number does not". Three fresh
citations landed anyway:

- `CaptureTests/CameraModeSeamTests.swift:5-6` — `ViewfinderControls.swift:191`,
  `ViewfinderPlaceholder.swift:38`, `CameraPrimingScreen.swift:79`
- `CaptureTests/CaptureScreenIDTests.swift:6` — `RootView.swift:66`
- `CaptureKit/CaptureKit/Support/CaptureScreenID.swift:110` — `RootView.swift:66`

I verified **all four anchors are correct today**. The test-file ones are explicitly marked
"pre-wave state", which is the honest framing. Recorded because the wave set the standard, not
because anything is wrong.

### W2-12 · `StubSmartGuessService` still returns the hardcoded guess
**Severity: Info · Confidence: High**
`apps/mobile/Capture/CaptureKitMocks/CaptureKitMocks.swift:87-94`

Still hands back `.seating@0.72` and `"Oak / bouclé"@0.6`. **Not a production lie:**
`AppContainer` wires `HeuristicSmartGuessService()` in *both* the real and the mock branch
(`:85`, `:125`), and the stub's only reference repo-wide is `SmartGuessSheet.swift:245`, inside
`#if DEBUG` / `#Preview`. The brief's "no `StubSmartGuessService` lie" criterion is met.

### W2-13 · Two `"Oak / bouclé"` fixture literals survive in preview data
**Severity: Info · Confidence: High**
`Capture/Features/Route/RouteSessionUI.swift:304` (inside `enum RoutePreviewData`) and
`Capture/Features/Specimen/SpecimenSheetScreen.swift:360-361` (inside `#Preview`). Preview-only
fixtures; no capture path reaches them.

### W2-14 · The C1 path can only ever record `.category`
**Severity: Info (product) · Confidence: High**
`apps/mobile/Capture/Capture/Features/Capture/ViewfinderModel.swift:471`

`applySmartGuess` calls `guess(image:ocr: [], codes: [])`. `HeuristicSmartGuessService`'s
`materialHint` and `colourHint` (`:59-72`) are OCR-driven, so from the shutter path they can never
fire. The C3 card's Material row is therefore structurally always `"—"`. This is honest, was ruled
deliberately (F-2's "not fixed" half), and is correct for this wave — but combined with W2-05's
race it means the shipped feature is one field, sometimes. Worth saying plainly to Kody so the
device pass is judged against the right expectation.

### W2-15 · `cycleMode`'s `?? 0` fallback skips `.photo`
**Severity: Info · Confidence: High**
`ViewfinderModel.swift:154` — cycling forward *from* an off-list mode yields `all[1]` (`.tag`), not
`all[0]`. Unreachable, since nothing can set `mode` to `.voice`. Cosmetic.

### W2-16 · `CaptureSheet.visit` has no registered builder
**Severity: Info · Confidence: High**
Presenting it would render `MissingScreen("visit")` (`RouteRegistry.swift:34-35`). Zero presenters
exist repo-wide, so `AppContainer.swift:41`'s revised claim that nothing falls back to
`MissingScreen` is still true. Wave 3 registers it.

### W2-17 · `everyScreenIDIsUnique` blind spot; `-CaptureScreen voice` ambiguity
**Severity: Minor · Confidence: High · Follow-up (report items 8 and 14)**
`CaptureTests/CaptureScreenIDTests.swift:18-31`. The test guards full-`sweepSuffix` collisions and
passes cleanly today (I re-derived it: no id's suffix is a tail of another). It does not guard
*partial* suffixes: `-CaptureScreen voice` now matches both `screen.N4.voice` and
`screen.C6.voice`, resolving to `.n4Voice` by declaration order. Harmless while `capture-shots.sh`
passes full suffixes; Wave 3 will want `C6.voice`.

### W2-18 · Device pass blocked for a second consecutive wave
**Severity: Major (risk, not defect) · Confidence: High**
`docs/design/field-companion/waves/wave-2/device-pass.md`. All five criteria recorded "not run",
two with partial simulator evidence. Correctly written down as not-run rather than passed, which is
the right behaviour. Criteria 1 and 2 are the *only* evidence that the wave's headline feature
works. Standing fact (both LiDAR phones wifi-only, no WDA) — needs a USB cable and a person, not an
engineering step.

---

## 6. Spec / plan corrections for the orchestrator to apply

Six, all verified against the code by me independently:

1. **Spec §5.5 — wrong `ContentState` call sites.** `field-companion-package.md:365` names
   `LocalCaptureSyncController` and `CaptureLiveActivityController`. Neither constructs a
   `ContentState`. The three real sites are **`Capture/Services/Sync/LocalCaptureSyncService.swift:184,
   :717, :825`** — app target, not CaptureKit. `CaptureLiveActivityController` only *receives* an
   already-built value (`:35`, `:55`, `:63`). ✅ verified.
   *Root cause worth recording in the spec:* `ContentState` is always built through type inference
   (`.init(queued:…)`), so `grep -rn "ContentState"` finds zero construction sites. Any future task
   that greps a type name to find its constructors will conclude there are none.
2. **Spec §17.4 — screen count off by one.** `field-companion-package.md:1972` says
   `CaptureScreenID.swift`'s header goes to 74. Correct figure is **75** (33 + 19 + 20 + 3), of
   which 72 are built and swept. §17.4 does not count the `f1Context` orphan fix as its own case.
   ✅ verified against the file (75 cases, 72 in `ALL_SCREENS`).
3. **`wave-4-plan.md` — wrong path, and the citation for it is wrong too.** The bad grep is at
   **`:304`**, not `:192` (see W2-07). It should read
   `CaptureKit/CaptureKit/Support/CaptureScreenID.swift`.
4. **`wave-3-plan.md:6884` is now stale.** It expects to edit `CaptureScreenID.swift:4`'s
   `"51 entries"` header. That header now reads 75 entries (rewritten in `13cf6a28f`). Wave 3's
   pre-flight should re-derive it rather than grep for `51`.
5. **`wave-3-plan.md` consumption list is short four names** — `CameraMode.viewfinderSelectable`
   (a *literal*, so Wave 3 appends `.voice` rather than changing a predicate),
   `CaptureScreenID.sweepSuffix`, `CaptureFeatureFlags`,
   `CaptureCoordinator.siteScanContextRequested`. ✅ all four confirmed present in the merged code.
6. **`wave-2-report.md` self-corrections** — the stale head sha (W2-08), the "31-plus rulings"
   figure against an index of 42 (W2-09), and the `wave-4-plan.md:192` anchor (W2-07). Cheap to
   fix if the report is ever amended; harmless if not.

---

## Wave 3 pre-flight items this wave hands forward

Ordered by what costs most if skipped.

1. **Extract `Specimen.recordSmartGuess(_:)` into CaptureKit** and have `ViewfinderModel`, the
   `SmartGuessTests` mirror **and `SmartGuessSheet`** all call it. This is a **task-0 item**, not a
   bullet. It closes W2-04 (test/production drift) and W2-01 (N5's mis-pin) with one ~8-line
   change, and it is why W2-01 exists at all.
2. **Fix `SmartGuessSheet`'s write path and its badges** (W2-01 + report item 13) — both halves,
   **before** N5 gets a production entry point. Today its only presenter is the harness; the
   moment that changes the defect ships.
3. **Settle the smart-guess race on device** — criteria 1 and 2 of the wave-2 device pass. Until
   one photo of a real chair produces a category on the C3 card, the wave's headline feature is
   unproven at every level. Pair with the `nonisolated async` media read (W2-05), which is what
   makes the race winnable.
4. **Get a USB cable to a LiDAR phone.** Two waves of blocked device passes is a programme risk, not
   a wave risk. It wants to be a standing line item with Kody.
5. **Decide the keyword-table repair** (W2-03) — longest-match-wins or an explicit priority column.
   A reorder trades one shadow for another. Add label-space tests (`"table lamp"`, `"desk lamp"`,
   `"tapestry"`), not just table-entry tests.
6. **Close `.dimensions`** (W2-02) — one line in `fieldsWorthRecording`, before any reader emits it.
7. **Append `.voice` to `CameraMode.viewfinderSelectable`** and build C6; register
   `CaptureSheet.visit`'s builder; add `V0.visit`, `C6.voice` (and, in wave 4, `V4.visit-review`) to
   `capture-shots.sh`'s `ALL_SCREENS` as the screens land. Each is a one-token edit by design.
8. **Disambiguate `-CaptureScreen voice`** (W2-17) before Wave 3 wants `C6.voice`, and add the
   final-dot-component assertion to `everyScreenIDIsUnique`.
9. **Apply the six spec/plan corrections above** before Wave 3's plan is executed — items 4 and 5
   in particular are things Wave 3's own pre-flight will otherwise trip on.
10. **Decide the docs-tracking question** (W2-10) — land the spec, rulings and plans, or accept that
    the tracked wave snapshots link to files that are not in the repo.
11. **Not Wave 3's, by ruling, but still open:** Flow 6's Library provenance chip (Wave 1P package
    4-12), §17.3's seven remaining "Inbox" strings, `README.md:1`'s "camera-first" opening (FC-R1
    puts it in Wave 3's IA change), and §17.4's ESCALATE-class SiteScan copy pass — a session with
    Kody, not an engineering step.

---

## Merge command

```bash
cd /Users/kody/Code/patina-merged
git merge --ff-only feat/field-companion-w2      # 6d91eb1b6 → 695addb5f, no merge commit
git push origin main                              # the branch has never been pushed
```

The worktree stays live until the merge lands (2026-08-24 ruling); retire it afterwards per
`patina-parallel-work`.

# Adversarial review — Field Companion Wave 2 implementation plan

**Target:** `docs/design/field-companion/plans/wave-2-plan.md` (1681 lines)
**Reviewed:** 2026-08-24 · read-only against `main` @ `27fdaf130`, `feat/field-companion-w1` @ `7775ced18`
**Authority order applied:** rulings (§"Ratified by Kody — 2026-08-24") → package (`field-companion-package.md` §5.5, §7.2, §7.5, §7.12, §17, Flow 6) → program plan (`field-companion-plan.md` §2, §0.1) → this plan.

Every finding carries a severity and a confidence. Nothing is filtered.

**Verdict: NOT-READY as written.** The plan's shape is sound and unusually well-anchored — I verified roughly sixty file:line citations and all but a handful land exactly. But a literal execution fails at three separate gates (lint, test compile, the wave merge), violates the ratified §5.5 "one commit" requirement, and ships one product decision the spec does not authorize. It becomes READY-WITH-FIXES once the edits in §7 are applied and Kody rules on the confidence floor (F-M1).

---

## 1 · Critical

### F-C1 — Wave 1 has produced none of the four names Wave 2 consumes. The plan has no fallback.
**Severity: critical · Confidence: 0.97**

`feat/field-companion-w1` is at `7775ced18` and its diff against `main` for `apps/mobile/Capture` is 13 files, all Wave 0.5 distribution work (`BuildSettings.xcconfig`, `PrivacyInfo.xcprivacy`, `archive-testflight.sh`, `Info.plist`, a `#if DEBUG` guard on `ResilienceScreens`' previews, +112 appended README lines, +21 `generate_project.rb` lines). Every Wave-1 name in Task 0's *Consumes* block is absent from that branch:

```
git grep -n "isFeatureEnabled|CaptureMediaMime|VoiceRecordingPolicy|func stamped" \
    feat/field-companion-w1 -- apps/mobile/Capture   →  (no output, all four)
```

They are absent from `main` too. Consequences for the plan as written:

- Task 1 Step 5's `CaptureFeatureFlags.init(analytics:)` body is `analytics.isFeatureEnabled($0)` — **does not compile**; `CaptureAnalytics` (`CaptureKit/CaptureKit/Analytics/CaptureAnalytics.swift:8-16`) has exactly `screen`/`event`/`identify`/`identify(_:properties:)`.
- `CaptureFeatureFlagsTests.analyticsBackedFlagsReadTheSeam` cannot pass: `FlaggedAnalytics.isFeatureEnabled` would be an unrelated method, not a protocol witness, so `CaptureFeatureFlags(analytics:)` could not reach it.
- Task 1 Step 7's "repoint the two recorder gate call sites" has nothing to repoint, and its verification grep trivially passes for the wrong reason.

Task 0 is designed to catch this and it will — but it only says "stop and report". The wave then stalls on an external dependency with no stated way forward.

**This is the one finding that is not a plan defect so much as a plan gap:** the honest fallback is already inside Wave 2's own remit. `CaptureAnalytics` is a CaptureKit seam; Task 1 is *the* seam commit. Adding the requirement plus its `{ false }` default there costs four lines and removes the block entirely.

---

## 2 · High

### F-H1 — `AppContainer.init()` crosses `function_body_length` and `--strict` turns that into an error. The plan's stated remedy targets the wrong function.
**Severity: high · Confidence: 0.88**

Measured, not estimated. Running SwiftLint with `function_body_length: warning: 40` against the real tree:

```
AppContainer.swift:64:12   Initializer body … currently spans 57 lines
CaptureDeepLink.swift:69:20 Function body   … currently spans 55 lines
```

`.swiftlint.yml` sets `function_body_length: warning: 60` (verified — the plan's C2 number is correct), and `--strict` promotes warnings to errors. The current tree lints clean (`swiftlint lint --quiet --strict` → no output, exit 0).

- Task 1 Step 7 adds **four** counted code lines to `AppContainer.init()` (two in the `if real` branch after `:74`, two in the `else` branch after `:117`). 57 + 4 = **61 > 60** → `✘ swiftlint`. Task 1 Step 8's "Expected: `✔ build`, `✔ tests`, `✔ lint`" is false.
- Task 1 Step 6 adds **one** counted line to `CaptureDeepLink.route(for:)` — the `.v0Visit, .c6Voice, .v4VisitReview:` continuation — plus three comment lines, which SwiftLint excludes. 55 + 1 = **56**. The function the plan warns about is the one that is safe.

The plan's named remedy ("lift the nested `func withSample(_:)` out to a private static helper") is therefore both unnecessary and aimed at the wrong file.

### F-H2 — `UnconfirmedGuessTests` will not compile: `CaptureStore` is `@MainActor` and the tests are not.
**Severity: high · Confidence: 0.92**

`CaptureStore.swift:34-35`:

```swift
@MainActor
public final class CaptureStore {
```

Every existing test in `CaptureTests/` that touches it is annotated — `CaptureLifecycleTests.swift:62,71,81,94,112,169,188,216,505,575,596,657,695,733,758,799,855,899` are all `@Test @MainActor`, and `ContextCaptureTests.swift:59,81` likewise. All six of Task 2 Step 1's `UnconfirmedGuessTests` are plain `@Test func … throws` calling `try CaptureStore.inMemory()` and `store.newDraft()` from a nonisolated synchronous context. That is an actor-isolation error, not a warning, in the project's Swift 5 language mode (`generate_project.rb:35` → `SWIFT_VERSION = '5.0'`).

`SmartGuessKeywordTests`, `CaptureScreenIDTests`, `CameraModeSeamTests` and `CaptureFeatureFlagsTests` are pure value-type tests and are unaffected.

### F-H3 — Task 6 Step 5's merge cannot fast-forward.
**Severity: high · Confidence: 0.90**

```bash
cd /Users/kody/Code/patina-merged
git add docs/design/field-companion/wave-2-report.md
git commit -m "docs(field-companion): wave 2 report …"
git checkout main
git merge --ff-only feat/field-companion-w2
```

The `cd` is to the **main** checkout. Committing the report there puts a commit on `main` that `feat/field-companion-w2` does not contain, so `--ff-only` fails by construction. And if the report was actually written inside the worktree (Task 6's *Files* block gives a bare `docs/design/field-companion/wave-2-report.md` with no prefix, unlike every other task in the plan, which prefixes worktree paths), then the `git add` in the main checkout fails instead. Either reading is broken.

The plan then says "**If it is not a fast-forward, stop** — someone landed on `main` mid-wave" — which will misdiagnose its own bug as a concurrency incident.

### F-H4 — The §5.5 "one commit" requirement is broken in two places.
**Severity: high · Confidence: 0.85**

Package §5.5 enumerates what the single seam commit must contain, and the list includes items the plan moves out of it:

- *"Deleting `FieldPlaceholderScreen`, which removes a `public` symbol from CaptureKit's framework surface … **recorded here so the removal is a named seam edit, not a silent one**."* The plan puts it in **Task 3**, a separate commit ("refactor(ios): delete two views nothing renders"). The plan's own self-review table records this without flagging it: "§5.5 / §7.12 delete `FieldPlaceholderScreen` as a named seam edit | **3**".
- *"Stale-header cleanup in the same files (see §17.4)."* `AppContainer.swift`'s header is split across two commits: Task 1 rewrites `:9-13`, Task 4 rewrites `:6`. One frozen file, two commits.

Program plan §2's acceptance is explicit: *"Every frozen seam changed exactly once, **in one commit**, with the owner named in the message body."* The owner naming is honoured (Task 1's commit body opens "Foundation owner: Kody"); the one-commit part is not.

---

## 3 · Medium

### F-M1 — The 0.6 confidence floor is a product decision no authority document asks for, and it becomes load-bearing in wave 3.
**Severity: medium (high by wave 3) · Confidence: 0.80**

The plan flags this itself, honestly, in its closing "One interpretation worth flagging". Having checked all three authorities, the interpretation does not hold up as cleanly as the plan claims.

**What the authorities actually say:**

- Package Flow 6 (`field-companion-package.md:527-533`): *"**Wave 2 therefore holds the recommendation at `.inbox` regardless of confidence** until visit kinds exist (wave 3)."*
- Program plan §2 package 2-2 (`field-companion-plan.md:412`): *"**and hold S3's recommendation at `.inbox` regardless of confidence**."*
- Package §7.5 (the C3 card, the surface that renders the guess): mentions no floor, no `hasUnconfirmedGuess`, no threshold. Nor does §7.12 or §17.3, which describe the fix as "delete the two literals, call the real service" — subtraction only.
- Ruling **FC-R12**: *"**Nothing auto-applies at any confidence.** Confidence orders the list and pre-selects in the confirm sheet; it never commits."* That is about structuring suggestions, not this, but it is the program's stated posture on letting a number decide something on the designer's behalf.

The **only** support is program plan §2's acceptance line (`:418`): *"`hasUnconfirmedGuess` is false for a confidently classified photo."* That is the lowest of the three authorities, and it is one sentence in a bullet list.

**Why it matters more than a wave-2 cosmetic.** `wave-3-plan.md:4642`:

```swift
guard state.context?.kind == .sourcing, !hasUnconfirmedGuess else { return .inbox }
return .library
```

Wave 3 lists `Specimen.hasUnconfirmedGuess` in its Interfaces as "(existing)" (`wave-3-plan.md:4566`) — it has no idea Wave 2 changed the meaning. So an unmeasured literal `0.6` written in wave 2 silently becomes the thing that decides whether a sourcing capture **mints a product**. It also flips `RouteSessionUI.swift:184` (`if specimen.hasUnconfirmedGuess { return .guess }`) — the tray row status — on the same number.

**And the number is probably wrong in the direction that makes the branch dead.** `VNClassifyImageRequest` returns low per-label confidences across a ~1300-class multi-label head; the app's own filter is `$0.confidence > 0.1` (`HeuristicSmartGuessService.swift:47`). A 0.6 floor will likely never be cleared in practice, so the "confident read" path ships as dead code that nonetheless reads as a claim. The plan's Task 6 evidence table is exactly the right instinct — but the code ships the number *before* the measurement, in the wave whose title is "nothing the app says about a capture is a lie."

**The smaller, more honest reading exists and the plan missed it.** With the two literals gone, `HeuristicSmartGuessService` called with `ocr: []` (which is what the photo path passes) returns exactly one field: `.category`. When Vision cannot place the label it returns `(.unknown, 0)`, `fieldsWorthRecording` drops it, **nothing is written**, and provenance-only `hasUnconfirmedGuess` is already `false`. So "the app is not asking her to confirm something it never guessed" is achieved by subtraction alone. What provenance-only cannot deliver is the literal phrase "false for a *confidently* classified photo" — and that phrase lives only in the program plan.

### F-M2 — Two stale "51" claims survive the wave, invisible to every census the plan runs.
**Severity: medium · Confidence: 0.95**

A repo-wide sweep for stale counts turns up eight sites. The plan covers six. The two it misses:

- `CaptureKitMocks/CaptureKitMocks.swift:4` — `//  In-memory / mock conformer for every CaptureKit seam, so all 51 screens`
- `Capture/App/DeepLinking/CaptureDeepLink.swift:6` — `//  51-row acceptance matrix). Production entries (E1/E2) also land here.`

Neither is caught by Task 0 Step 5's pattern (`51-screen|51 entries|71-screen|71 entries|all 71|the 71`) nor Task 4 Step 1/Step 5's (`51-screen|51 entries|all 71|the 71|71 screens|71 total`) — "all 51 screens" and "51-row" match none of them. Task 4 Step 5's "Expected: both greps print nothing" will therefore report success while two stale claims stand.

`CaptureDeepLink.swift` is a file **Task 1 already edits**, so §5.5's "stale-header cleanup in the same files" applies to it directly.

### F-M3 — Wave 3 does not know `CameraMode.viewfinderSelectable` exists, and its instruction for the VOICE pill is now wrong.
**Severity: medium · Confidence: 0.90**

`wave-3-plan.md:5228`:

> in the mode selector add the VOICE entry (**the selector already iterates `CameraMode.allCases`; confirm it does** — if it hardcodes four, add `case .voice: "VOICE"` to its label switch)

After Task 1 Step 6, `ViewfinderControls.swift:191` iterates `CameraMode.viewfinderSelectable`, which is neither branch of that instruction. And `wave-3-plan.md:72`'s Wave-2 consumption list is explicit — `CaptureSheet.visit`, `CameraMode.voice`, the four `CaptureScreenID` cases, `AppContainer.smartGuess`/`.featureFlags`, the three `ContentState` fields — and **omits `viewfinderSelectable` entirely**. Wave 3 will either add a label case that never renders, or improvise.

Same class of gap for `CaptureScreenID.sweepSuffix`, `SmartGuessConfidence.confirmedFloor`, `SmartGuess.fieldsWorthRecording`, `Specimen.confidence(for:)`, `CaptureFeatureFlags` (the type, as distinct from `AppContainer.featureFlags`) and `CaptureCoordinator.siteScanContextRequested` — all produced by Wave 2, none named in `wave-3-plan.md:72`. Only `viewfinderSelectable` is a live break; the rest are hand-off hygiene.

### F-M4 — The README:39 replacement is arithmetically self-inconsistent, and two adjacent stale numbers go untouched.
**Severity: medium · Confidence: 0.90**

Current text (`README.md:38-39`): *"Flows 0–7 are the original 33 screens; flows 8–15 are the 18 Work-flow screens added in Phase 2 plus 20 P1 Site Request screens (71 total)."*

The plan's replacement keeps 33 / 18 / 20 and appends *"and the visit-spine ids (75 total; 72 reach a built screen, three are reserved for waves 3–4)."* 33 + 18 + 20 + 3 = **74**, not 75. The fourth new id, `f1Context`, belongs to flow 15, whose count the plan leaves at 18 (`README:12`) and whose table row the plan leaves without an F1 context entry (`README:35`). The edit whose purpose is to stop the README lying introduces a fresh arithmetic inconsistency.

### F-M5 — The plan's 75 diverges from spec §17.4's stated 74 and does not record the divergence.
**Severity: medium · Confidence: 0.90**

`field-companion-package.md:1980`: *"`CaptureScreenID.swift`'s header says '51 entries' (it has 71, and **74** after §5.5)."*

The plan writes **75** into the header. The plan is right — §5.5 lists three new ids *plus* the `screen.F1.context` orphan fix, and that orphan is itself a new enum case — but nothing in the plan says so. A reader checking the header against the spec will read 75 as a new lie in the wave that exists to remove them.

### F-M6 — `FieldCompanionPresentationTests.swift` has no `import Foundation`; the appended test uses `Data` and `JSONDecoder`.
**Severity: medium · Confidence: 0.70**

It is the only file in `CaptureTests/` without it — checked all 19:

```
FieldCompanionPresentationTests.swift:6:import Testing      ← and nothing else
```

Task 1 Step 2 appends `anInFlightActivityPayloadStillDecodesAcrossTheShapeChange`, which calls `Data(inFlight.utf8)` and `JSONDecoder()`. Swift's name lookup does not reliably resolve top-level Foundation types through a transitively-imported framework. Confidence is 0.70 rather than 0.9 only because this occasionally resolves anyway; the fix is one line and costs nothing.

### F-M7 — Task 1 Step 7's repoint is the plan's one under-specified step, and its verification grep is too narrow.
**Severity: medium · Confidence: 0.85**

> Repoint the two recorder gate call sites recorded in Task 0 Step 2 … (**or, where the view holds a model rather than the container, pass `CaptureFeatureFlags` in and call `flags.isEnabled(...)`**).

No literal code, a branching instruction, on files that do not exist yet. The plan's own self-review claims "Every code step carries the literal code" — this one does not. Its check:

```bash
grep -rn "isFeatureEnabled" --include="*.swift" Capture/Features
```

is scoped to `Capture/Features` only. Task 0 Step 2's own census greps the whole tree. If Wave 1 puts a gate in `Capture/Services/` (where `SpeechVoiceNoteService` lives) the check passes while a direct seam read survives.

### F-M8 — Task 4's `AVFoundationCameraService` header rewrite duplicates the paragraph directly below it.
**Severity: medium · Confidence: 0.90**

Lines 10-13 already read: *"Simulator note: `AVCaptureDevice.default(...)` returns nil on the simulator, so the session never starts and `capture()` throws `.unavailable`."* The plan's replacement for `:6-8` says the same thing again — *"the simulator gets MockCameraService because `AVCaptureDevice.default(...)` returns nil there."* Redundancy, in a task about headers that describe the file accurately.

The load-bearing half of the replacement is correct: `AppContainer.swift:104-110` does wire `AVFoundationCameraService()` in the non-simulator branch.

---

## 4 · Low

| # | Finding | Conf. |
|---|---|---|
| F-L1 | **Line-number drift.** `LocalCaptureSyncService.swift:626`/`:738` → actually `:623`/`:743` (`:184` is right). `Specimen+Accessors.swift:129-132` → `hasUnconfirmedGuess` is `:130-133`; the same Files line cites `:159-161` (`setConfidence`), which no step edits. `ViewfinderModel.swift`: `self.companion = container.companion` is `:79` not `:78`; `applySmartGuess` + doc comment is `:410-422` not `:409-423`. `CaptureScreenID.swift` Files line says `:1-9,:73-75` — header is `:1-5`, insertion point is after `:76`. `SpecimenCapturePolicy.swift` Files line says `:15-26`; the switch body is `:19-24` (the step itself is right). `HeuristicSmartGuessService.swift` Files line says `:58-81` but the step also edits `:51`. C1's `generate_project.rb:129,:149` — `:129` correct, `:149` is a blank line (`tests.add_dependency(kit)` is `:148`, `tests.frameworks_build_phase…` is `:153`); this one is inherited verbatim from program plan §0.1 C1. | 0.95 |
| F-L2 | **`capture-shots.sh` line-2 replacement produces "of of".** New line 2 ends `…and save a PNG of`; existing line 3 begins `# of each, using only the simulator`. | 0.90 |
| F-L3 | **`CameraModeSeamTests`' comment will be false by wave 3.** It says "wave 3 replaces this with C6's own landing." Wave 3 does not touch `nextStep(for: .voice)`; it *adds* `SpecimenCapturePolicy.producesPhoto(_:)` and guards `captureSingle()`/`beginMultiShot()` with it (`wave-3-plan.md:4938-4995`). A stale comment authored inside the wave about stale comments. | 0.85 |
| F-L4 | **`cycleMode` gains a silent dead branch.** After Task 1 Step 6, `ViewfinderModel.swift:152-155` is `let all = CameraMode.viewfinderSelectable; guard let index = all.firstIndex(of: mode) else { return }`. `mode` can legitimately become `.voice` — `start()` sets `mode = camera.currentMode` (`:89`) and `select(_:)` accepts any `CameraMode` — at which point the swipe cycle silently stops working. Harmless in wave 2; a trap for wave 3. | 0.75 |
| F-L5 | **`S3DestinationScreen`'s stale header claim spans `:4-5`, not `:4`.** "…recommending from / the record's completeness (any unconfirmed guess → Inbox by default, F-12)." Task 2 Step 6 says "correct the file header's line 4" and supplies three lines. | 0.90 |
| F-L6 | **Task 5 Step 3's F1.context shot has a settle race the plan reads as a routing failure.** The hop chains two awaits inside `CAPTURE_SHOT_SETTLE` (default 1.4 s, `capture-shots.sh:21`): `SiteScanSetupScreen.task` awaits `model.load()` *before* consuming `siteScanContextRequested` (`:127-130`), then the cover's own `.task` awaits `container.camera.start()` (`SiteScanContextCapture.swift:225`). A shot of the setup form may be a timing miss, not a broken hop. | 0.70 |
| F-L7 | **`wave-4-plan.md:192` has the wrong path for a wave-2 file.** It greps `CaptureKit/CaptureKit/Navigation/CaptureScreenID.swift`; the file is at `CaptureKit/CaptureKit/Support/CaptureScreenID.swift`. Out of this plan's scope but it is this plan's artefact. | 0.95 |
| F-L8 | **Not a defect — a correction to the plan's risk model.** `.swiftlint.yml`'s `included:` is `Capture`, `CaptureKit`, `CaptureKitMocks`. `CaptureTests` is **not** linted, so none of the six new test files can trip `--strict`. The whole lint hazard is in `AppContainer.init()` (F-H1). | 0.95 |
| F-L9 | **The plan is more accurate than the spec on ContentState and does not say so.** §5.5's ⚠ names the call sites as "`LocalCaptureSyncController`, `CaptureLiveActivityController`" and says `FieldCompanionPresentationTests` would break. In fact all three constructor sites are in `LocalCaptureSyncService`, `CaptureLiveActivityController` only passes a `ContentState` through (`:35`, `:55`, `:63`), and `grep -rn "ContentState" CaptureTests/` returns nothing today. Worth one line in the wave report so the spec gets corrected rather than quietly diverged from. | 0.95 |
| F-L10 | **Task 0 does not ask what `MockCaptureAnalytics.isFeatureEnabled` returns after Wave 1.** Today the mock implements only `screen`/`event` (`CaptureKitMocks.swift:144-148`), so a `{ false }` protocol default makes `.allOff` behaviourally identical and the harness loses nothing. But if Wave 1 makes the mock answer `true` so previews can see gated surfaces, Task 1 Step 7's `.allOff` silently drops those screens from the sweep — and Task 5's re-baseline would record the reduced count as correct. | 0.60 |

---

## 5 · What checks out

Stating this explicitly, because the plan's accuracy is its main asset and a reviewer should not have to re-derive it.

**Every other cited path, symbol, enum case, script and line anchor is real.** Verified: `CaptureNavigation.swift:59` (`case cullDeck`) and `:79` (`case .cullDeck: return "cull-deck"`); `RouteRegistry.swift:67-86` (`CaptureSheet.registryKey`, exhaustive, no `default`); `CaptureEnums.swift:10-13`; `SpecimenCapturePolicy.swift:19-24`; `CaptureScreenID.swift` = exactly **71** cases, insertion point `:76` correct; `CaptureSyncAttributes.swift:4-6` and `:12-21`; `AppContainer.swift:34`, `:74`, `:117`, `:9-13`, `:6`; `CaptureCoordinator.swift:18`; `CaptureDeepLink.swift:84-86`, `:115`, `:180`, `:202` — and the `route(for:)` switch really is exhaustive over `CaptureScreenID` with no `default`, so the four new ids really must land there; `ViewfinderControls.swift:183`, `:191`; `ViewfinderPlaceholder.swift:38`; `CameraPrimingScreen.swift:79`; `RecognitionScreens.swift:78`; `SiteScanContextCapture.swift:222`, `:224`, and "Reference capture" at `:261`; `SiteScanSetupScreen.swift:90`, `:119-124`, `:127-130`; `S3DestinationScreen.swift:52-57`; `RouteSessionUI.swift:184`; `ViewfinderModel.swift:152`, `:225`, `:271`, `currentSpecimen(id:)` at `:349`; `HeuristicSmartGuessService.swift:51`, `:58-81`; `AppConfiguration.swift:96`, `:118`; `README.md:14/:39/:51/:52/:101/:116/:120`; `capture-shots.sh:2/:11-12/:40/:46` with exactly 71 `ALL_SCREENS` entries; `capture-gate.sh:13-18` and `:27-33`; `.gitignore:7` = `.build/`; `CaptureUITests/` is empty; `RootView.swift:66` is verbatim `CaptureScreenID.allCases.first(where: { $0.rawValue.hasSuffix(raw) })`.

**The seam facts hold.** `generate_project.rb` creates exactly four targets (`:28-30`, `:129`), none a widget — so the ContentState shape change really is free right now. `CaptureTests` links CaptureKit alone (`tests.add_dependency(kit)` `:148`; `tests.frameworks_build_phase` `:153`) and the `CaptureKit` scheme adds it as a test target (`:255-258`), so C1 is right and the plan's CaptureKit-only test placement is the correct shape.

**The suffix-uniqueness test passes as written.** I ran the plan's own predicate over the 71 existing raw values plus the four new ones — `[x for x in all if x.endswith(raw[len("screen."):])] != [raw]` — **zero collisions**.

**The `= nil` defaults do keep the three call sites compiling.** All three use labelled arguments and stop at `lastSpecimenTitle:` (`LocalCaptureSyncService.swift:184`, `:623-628`, `:743-748`). "Do not edit them" is correct.

**The test conformers compile.** `CaptureAnalytics` gives `identify(_:)` and `identify(_:properties:)` default implementations (`CaptureAnalytics.swift:18-25`), so `SilentAnalytics`/`FlaggedAnalytics` implementing only `screen`/`event` is valid — *given* F-C1's `isFeatureEnabled` requirement exists.

**The moved keyword table is byte-identical** to `HeuristicSmartGuessService.keywordTable` (`:66-81`), and every `SmartGuessKeywordTests` expectation resolves against it: `armchair`→`.seating`, `"Coffee Table"`→`.table` (lowercased, `contains("table")`), `"wall sconce"`→`.lighting`, `"area rug"`→`.rug`, `"brass knob"`→`.hardware`, `"chairlift"`→`.seating` (substring, deliberate), `"baseboard"`/`"drywall seam"`/`""`→`nil`. `everyKeywordInTheTableResolves` holds trivially. `fieldsWorthRecording` returns `[.category, .material]` for the 0.81/0.55/0 fixture. `Self.categoryForKeyword` has exactly one caller (`:51`), so the deletion is safe.

**Mock-mode wiring does not threaten harness determinism (review question 4).** Four independent reasons: (a) `capture-shots.sh` drives screens via `-CaptureScreen`, never the shutter, so `applySmartGuess` never runs during a sweep; (b) `RecognitionScreens.swift:78` already constructed the same `HeuristicSmartGuessService()` in mock mode, so `N5.smart-guess` is unchanged; (c) `CaptureFeatureFlags` is fail-closed and nothing in the current tree reads a flag; (d) no existing test can observe `AppContainer` at all — `CaptureTests` links CaptureKit alone. The only residual is F-L10.

**Counts, gates, hygiene.** 4+4+4+2 = **14** new tests in Task 1 and 6+6 = **12** in Task 2, as claimed. Gate commands are quoted verbatim and are a faithful expansion of program plan §2 (`capture-gate.sh all` + `swiftlint --strict`); the device pass matches §2 ("four different real objects, four different categories") plus Flow 6's wall-defect check. C4 pbxproj regeneration appears in exactly the three commits that add or remove `.swift` files. Every `git add` uses explicit pathspecs (C9), and no `git commit -- pathspec` form appears — which matters, since that form drops staged deletions.

**Placeholder scan (review question 6): clean.** No "TBD", no "similar to Task N", no "add appropriate error handling". Every code step but one carries literal code — the exception is F-M7. The two tasks without unit tests (3, 4) say so in place, with the reason, rather than faking a green signal. **Type-name consistency across tasks: clean** — I checked every name in the self-review's list and found no drift.

**§17.4's six stale-doc items are all covered** (`CaptureScreenID` and `AppContainer:88-91` in Task 1; README, `AVFoundationCameraService`, `SpeechVoiceNoteService`, `ResilienceScreens` in Task 4), plus two the spec did not name (`AppConfiguration:96,:118`, `AppContainer:6`) — minus the two in F-M2. `00265_room_scans_project_linkage.sql` and `00258_edge_settings_vault.sql` both exist, so the README migration-credit fix is right. The Task 0 Step 3 premises are all true on `main` today: `FieldPlaceholderScreen` has zero external references, `LowLightTorchOverlay` is referenced only by its own `#Preview` at `:122` and `ResilienceScreens.swift:9`, and `OfflineQueueBanner` has **only** preview references (`:83`, `:84`) — so the plan's conditional wording for Task 4 Step 3 is the branch that will fire unless Wave 1 lands package 1-13. Its replacement targets (`ViewfinderNightChip:88`, `ViewfinderTorchPill:102`, `ViewfinderLowLightHint:124`) all exist.

**Wave 1's README and AppConfiguration edits do not move Task 4's line numbers.** The w1 README diff is a single hunk at `@@ -210,3 +210,115 @@` (pure append), and the w1 AppConfiguration diff starts at `@@ -124,11 +124,25 @@`. Both leave every cited line intact. `ResilienceScreens`' w1 change is a `#if DEBUG` guard at `:306`/end, leaving `:8-10` intact. The one that *does* move is `generate_project.rb` (+21 lines before `:137`), which pushes the CaptureTests target from `:129` to ~`:143` — cosmetic, but it makes C1's citation wrong after the merge.

---

## 6 · Review question 2, answered directly: `viewfinderSelectable` vs. deferring `.voice`

**Deferring the case to wave 3 is not available as "the smaller change" — it is a spec deviation.** §5.5 names `CameraMode.voice` in the wave-2 seam commit by name, and the whole justification for the commit is that the frozen enum gets edited exactly once. Dropping it would also break `wave-3-plan.md:113`, which expects to find `case photo, tag, measure, scan, voice` at its own pre-flight and treats a miss as **STOP, escalate to the seam owner** (`:118`).

**Among the changes that honour §5.5, `viewfinderSelectable` is the smallest honest one.** The alternatives are worse: adding `.voice` to `allCases` and leaving the three `ForEach`es alone ships a fifth pill whose shutter takes a photo — precisely the class of lie the wave exists to remove; filtering inline at each of the three sites (`ViewfinderControls:191`, `ViewfinderPlaceholder:38`, `CameraPrimingScreen:79`) duplicates one rule three ways with no test able to pin it. One computed property, four one-line call-site edits, and a test asserting the exclusion is the right shape.

**Two improvements to it, though:**

1. Define it as the literal `[.photo, .tag, .measure, .scan]` rather than `allCases.filter { $0 != .voice }`. The literal is what `CameraModeSeamTests` already asserts; it survives a future fifth non-selectable mode without silently admitting it; and it makes wave 3's edit a one-token append rather than a predicate rewrite.
2. `SpecimenCapturePolicy.nextStep(for: .voice) == .quickConfirm` is a small new assertion of its own — "shoot in voice mode and you get a quick-confirm card." It is unreachable and the plan says so, but the honest alternative costs nothing: make `SpecimenCaptureNextStep` gain no case and have the `.voice` branch `return .quickConfirm` with the comment *"unreachable — `.voice` is off `viewfinderSelectable`; wave 3 guards the shutter with `producesPhoto(_:)`"*. That is what the plan already writes minus the wrong forward reference (F-L3).

---

## 7 · Exact edits to make

**Blocking — the plan does not execute without these.**

1. **F-C1.** Add to Task 0 Step 1 an explicit fallback, so the wave is not hostage to Wave 1:
   > If `isFeatureEnabled` is absent from `CaptureAnalytics`, **Wave 2 adds it** — it is a CaptureKit seam and Task 1 is the seam commit. Append to the protocol (`CaptureAnalytics.swift:8-16`) `func isFeatureEnabled(_ key: String) -> Bool` and to `public extension CaptureAnalytics` (`:18-25`) `func isFeatureEnabled(_ key: String) -> Bool { false }`. Task 1's Files, Interfaces and commit body gain the file; Task 1 Step 7's repoint becomes "no call sites exist yet — record zero and note it in the report."
2. **F-H1.** Rewrite Task 1 Step 8's lint note:
   > `AppContainer.init()` measures **57** body lines today; these four assignments take it to **61**, over `function_body_length: warning: 60`, which `--strict` errors on. Before adding them, lift the twelve-line Phase-2 factory block (`:91-102`) into a `private static func makeWorkServices(deps: WorkServiceDependencies) -> …` and call it from both branches. Do **not** silence the rule. `CaptureDeepLink.route(for:)` measures 55 and grows to 56 — it needs nothing.
3. **F-H2.** Task 2 Step 1: annotate all six `UnconfirmedGuessTests` as `@Test @MainActor func …` (or mark the struct `@MainActor`). `CaptureStore` is `@MainActor` (`CaptureStore.swift:34-35`) and every existing store-touching test does this.
4. **F-H3.** Rewrite Task 6 Steps 4-5 so the report is authored **and committed inside the worktree**:
   ```bash
   cd /Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w2
   git add docs/design/field-companion/wave-2-report.md
   git commit -m "docs(field-companion): wave 2 report — gates, device pass, measured confidences"
   cd /Users/kody/Code/patina-merged
   git merge --ff-only feat/field-companion-w2
   git push origin main
   git worktree remove .claude/worktrees/field-companion-w2
   ```
   Task 6's Files entry becomes `.claude/worktrees/field-companion-w2/docs/design/field-companion/wave-2-report.md`.
5. **F-H4.** Move the `FieldPlaceholderScreen` deletion — file removal, `generate_project.rb` re-run, pbxproj diff — into **Task 1**, and move the `AppContainer.swift:6` edit from Task 4 into Task 1 Step 7. Task 3 keeps only `LowLightTorchOverlay` and is retitled "delete the preview-only torch overlay". Update the self-review table's §5.5 row to `1`.

**Needs a ruling before it can be written either way.**

6. **F-M1.** Take this to Kody as a two-option question, with the evidence above:
   - **(a) Recommended — leave `hasUnconfirmedGuess` provenance-only in wave 2.** Removing the two literals already delivers "the app never asks her to confirm a guess it did not compute," because an unplaceable label writes nothing at all. Reword program plan §2's acceptance line from *"false for a confidently classified photo"* to *"false for a photo the reader could not place, and for a capture with no guess at all."* Wave 2 then ships **zero** new numbers. Wave 3 takes the confidence question with the device-pass evidence in hand and rules it against `recommendedDestination`, where it actually decides something.
   - **(b) Keep the floor but do not invent its value.** Ship `SmartGuessConfidence.confirmedFloor = 1.0` (nothing clears it — behaviourally identical to (a)), collect the four measurements in Task 6, and let wave 3 set the real number in one place with evidence attached.

   Either way, Task 2's Interfaces block must add a hand-off line: *"`hasUnconfirmedGuess` semantics changed — `wave-3-plan.md:4566` lists it as '(existing)' and `:4642` gates `.library` on it. Wave 3's pre-flight must re-read it."*

**Correctness and hygiene — apply regardless.**

7. **F-M2.** Broaden both censuses to `grep -rnE "\b(51|71)[- ](screen|entries|row|total)|all (51|71)|the (51|71)\b" --include="*.swift" --include="*.md" --include="*.sh" .` and add the two missed lines: `CaptureDeepLink.swift:6` to **Task 1** (a file it already edits, per §5.5), `CaptureKitMocks/CaptureKitMocks.swift:4` to **Task 4**.
8. **F-M3.** Add to Task 6's report template, under *Owed / carried forward*: *"`wave-3-plan.md:72` must gain `CameraMode.viewfinderSelectable`, `CaptureScreenID.sweepSuffix`, `CaptureFeatureFlags`, `SmartGuess.fieldsWorthRecording`, `Specimen.confidence(for:)` and `CaptureCoordinator.siteScanContextRequested`; and `wave-3-plan.md:5228` must be corrected — the mode row iterates `CameraMode.viewfinderSelectable`, not `allCases`, so wave 3's edit is to append `.voice` to that array and nothing else."*
9. **F-M4.** Extend Task 4 Step 4's README edits: `:12` "(18 screens)" → "(19 screens)"; `:35` add `· F1 context` to the Flow 15 row; reword `:39` to "*flows 8–15 are the 19 Work-flow screens added in Phase 2 plus 20 P1 Site Request screens — 72 built — and three reserved visit-spine ids (75 total).*"
10. **F-M5.** Add one line to Task 6's report: *"Spec §17.4 says 74 after §5.5; the correct figure is **75**, because `f1Context` is itself a new case. §17.4's parenthetical is stale — fix at the next spec pass."*
11. **F-M6.** Task 1 Step 2: add `import Foundation` to `FieldCompanionPresentationTests.swift` (line 6, above `import Testing`), and list it in the step.
12. **F-M7.** Task 1 Step 7: widen the check to `grep -rn "isFeatureEnabled" --include="*.swift" Capture/` and state that the only permitted hit is a PostHog conformer. Write the literal edit after Task 0 Step 2 records the call sites, and say so.
13. **F-M8.** Task 4 Step 2: replace `AVFoundationCameraService.swift:6-8` with just — `//  data output. Wired into AppContainer on device (AppContainer.swift:104-110);` / `//  the simulator branch takes MockCameraService instead.` — and leave the existing `:10-13` simulator note to carry the reason.
14. **F-L1.** Correct the drifted anchors: `LocalCaptureSyncService.swift:184,:623,:743`; `Specimen+Accessors.swift:130-133` (drop the `:159-161` citation); `ViewfinderModel.swift` init insert at `:79`, `applySmartGuess` at `:410-422`; `CaptureScreenID.swift:1-5` + insert after `:76`; `SpecimenCapturePolicy.swift:19-24`; `HeuristicSmartGuessService.swift:51,:58-81`; C1 → `generate_project.rb:129,:148` (and note it moves to ~`:143` once Wave 1's +21 lines land).
15. **F-L2.** `capture-shots.sh` line 2 → `# capture-shots.sh — sweep every built screen in the matrix and save a PNG` (no trailing "of").
16. **F-L3.** `CameraModeSeamTests` comment → *"Unreachable from the shutter: `.voice` is off `viewfinderSelectable`, and wave 3 guards `captureSingle()` with `SpecimenCapturePolicy.producesPhoto(_:)` rather than changing this branch."*
17. **F-L4.** Task 1 Step 6: after repointing `ViewfinderModel.swift:152`, add `guard mode != .voice else { return }` at the top of `cycleMode(_:)`, or make the fallback explicit — `let index = all.firstIndex(of: mode) ?? 0`. A silent dead swipe is the wave's own failure mode.
18. **F-L5.** Task 2 Step 6: say "replace the header's lines 4-5", not "line 4".
19. **F-L6.** Task 5 Step 3: add — *"If the shot shows the Site scan setup form, re-run with `CAPTURE_SHOT_SETTLE=3` before concluding the hop did not fire; the cover is two chained awaits deep."*
20. **F-L7.** Note in Task 6's report that `wave-4-plan.md:192` has `CaptureScreenID.swift` under `Navigation/`; it lives in `Support/`.
21. **F-L9.** Add to Task 1's Interfaces or the report: the ContentState construction sites are all three in `LocalCaptureSyncService`; `CaptureLiveActivityController` only forwards; `FieldCompanionPresentationTests` contains no `ContentState` today. §5.5's ⚠ is wrong on all three counts and should be corrected at the next spec pass.
22. **F-L10.** Add a row to Task 0 Step 3: *"`grep -n isFeatureEnabled CaptureKitMocks/CaptureKitMocks.swift` — if Wave 1 made the mock answer `true` for any key so previews/harness can see a gated surface, `.allOff` in Task 1 Step 7 will drop those screens from the sweep. Record the answer; it decides whether mock mode gets `.allOff` or a mock-visible flag source."*

---

## 8 · Verdict

**NOT-READY as written.** Five blocking defects (F-C1, F-H1, F-H2, F-H3, F-H4) mean a literal execution fails at the lint gate, the test-compile gate and the wave merge, and violates the ratified §5.5 "one commit, one named owner" requirement it is built to satisfy. One further item (F-M1) is a product decision the package does not authorize and that becomes load-bearing in wave 3.

This is a strong plan underneath. Its file:line anchoring is better than any wave plan I have reviewed here — I checked roughly sixty citations and found seven off-by-a-few and zero fabricated symbols. Its self-review is honest about the two untestable tasks and it flagged the confidence-floor interpretation itself. The defects are concentrated, enumerable, and all but one are mechanical.

**Apply edits 1–5 and 7–22, get a ruling on 6, and it is READY.**

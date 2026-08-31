# Field Companion Wave 2 — "Nothing the app says about a capture is a lie" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the three remaining places where Patina Field asserts something false about a capture — the hardcoded smart guess, the dead placeholder screens, the stale file headers — and pay the frozen-seam debt in one commit while a `ContentState` shape change is still free.

**Architecture:** One foundation-seam commit edits every frozen surface at once (`CaptureSheet`, `CameraMode`, `CaptureScreenID`, `CaptureSyncAttributes.ContentState`, `AppContainer`) and folds in `FieldPlaceholderScreen`'s deletion, because each of those files carries an explicit "foundation-owner-only" freeze comment and the Live-Activity shape is free to change only until a widget target exists. Everything else in the wave is subtraction: the viewfinder stops stamping a guess it did not compute (no confidence floor ships either), a second dead view (`LowLightTorchOverlay`) leaves the tree, stale file headers stop describing an app that no longer exists, and the screenshot sweep finally covers the non-Pro context screen. No IA change, no portal work, no migration, no flag.

**Tech Stack:** Swift 5 / SwiftUI / SwiftData / ActivityKit / Vision (`VNClassifyImageRequest`), Swift Testing (`import Testing`), `xcodebuild` via `scripts/capture-gate.sh`, SwiftLint 
`--strict`, `scripts/generate_project.rb` (xcodeproj regeneration), `scripts/capture-shots.sh` (simulator screenshot sweep).

**Spec:** `docs/design/field-companion/field-companion-package.md` (§5.5 the frozen seams, §7.2, §7.12 Deleted, §17.2–§17.4 migration path, Flow 6's two ride-along fixes) · program plan `docs/design/field-companion/field-companion-plan.md` §2 and §0.1 · rulings `docs/design/field-companion/field-companion-rulings.md` (FC-R1, FC-R2, FC-R3 ratified 2026-08-24).

## Rulings applied 2026-08-24

Applied against this plan by the orchestrator, after adversarial review (`wave-2-plan-review.md`).

> Ruling: **No confidence floor.** `SmartGuessConfidence.confirmedFloor`/0.6 and the confidence-aware `hasUnconfirmedGuess` are deleted from this plan. The provenance-only reading stays: an unplaceable label writes nothing to `provenanceRaw`, so `hasUnconfirmedGuess` is already false for it. Wave 2 holds S3's recommendation at `.inbox` regardless of confidence, per spec Flow 6 and program plan 2-2. The acceptance criterion is rewritten to the provenance-only reading, and the device pass photographs four real objects and expects four different categories — nothing is measured for re-tuning, because there is no floor to re-tune.

> Ruling: **Task 0 gates on the merged Wave 1, not the branch snapshot this plan was authored against.** `feat/field-companion-w1` is being built now and will land `CaptureMediaMime`, `VoiceRecordingPolicy`, `CaptureRoutingMemory.stamped(onto:)` and the analytics `isFeatureEnabled` seam before wave 2 starts. Task 0 verifies those four names on `main` after the Wave 1 merge; if `isFeatureEnabled` is still absent, Task 1 — the seam commit — adds it itself, as an explicit conditional step with real code.

> Ruling: **`CameraMode.viewfinderSelectable` is the literal `[.photo, .tag, .measure, .scan]`**, not `allCases.filter`, and it is gate-tested. Wave 3 flips it to admit `.voice` when C6 exists.

> Ruling: **§5.5's "one commit" is honoured literally.** `FieldPlaceholderScreen`'s deletion (a named seam edit — a `public` symbol leaves CaptureKit's framework surface) and every `AppContainer.swift` header edit move into Task 1's seam commit. Task 3 keeps only `LowLightTorchOverlay`.

> Ruling: **The review's remaining findings are fixed as specified** — the `AppContainer.init()` `function_body_length` extraction (and the corrected, no-op `route(for:)` lint note), `@MainActor` on the `UnconfirmedGuessTests`, Task 6's merge step rewritten to push-and-report (the orchestrator merges, never the plan), the two missed stale-"51" claims folded into Task 4's census, the README arithmetic corrected to 33+19+20+3=75, `import Foundation` added to `FieldCompanionPresentationTests.swift`, the "of of" typo, and the seven drifted line anchors re-derived from the repo.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Branch + worktree.** Work in `.claude/worktrees/field-companion-w2` on branch `feat/field-companion-w2`. Push the branch at the wave gate; **the orchestrator merges to `main`, never this plan** (ruling 2026-08-24). Never `git stash` — the stash is shared across worktrees.
- **`git add` explicit pathspecs only. Never `git add -A`.** (plan §0.1 C9)
- **C1 — only CaptureKit is unit-testable.** `capture-gate.sh test` runs `-scheme CaptureKit`; `CaptureTests` links CaptureKit alone (`generate_project.rb:129,:148`) and every test file is `@testable import CaptureKit`. **App-target code — `ViewfinderModel`, `AppContainer`, every screen — is NOT unit-testable.** Any logic that needs a test lives in CaptureKit as a pure type; the SwiftUI/AVFoundation/Vision glue stays app-side and is proved by the device pass.
- **C2 — `capture-gate.sh lint` silently no-ops and still exits 0** without swiftlint (`capture-gate.sh:27-33`). A green `all` does not mean lint ran. Run `swiftlint lint --quiet --strict` separately, every time. SwiftLint **is** installed at `/opt/homebrew/bin/swiftlint`; `--strict` promotes warnings to errors, and `function_body_length` has `warning: 60` in `.swiftlint.yml` — so a switch that grows past 60 body lines fails the gate. `.swiftlint.yml`'s `included:` is `Capture`, `CaptureKit`, `CaptureKitMocks` only — `CaptureTests` is **not** linted, so none of this wave's six new test files can trip `--strict`; the entire lint hazard in this plan is `AppContainer.init()`'s `function_body_length` (Task 1 Step 7).
- **C3 — there are no UI tests.** `CaptureUITests/` is an empty directory; `generate_project.rb` creates exactly four targets.
- **C4 — `generate_project.rb` must be re-run and `Capture.xcodeproj/project.pbxproj` re-committed** whenever a `.swift` file is added or removed. `capture-gate.sh` runs it for you; **the pbxproj diff must be in the commit.**
- **C5 — one device pass per wave; a green `capture-gate.sh` never substitutes.** `capture-gate.sh build` is a Simulator compile gate with `CODE_SIGNING_ALLOWED=NO`, and `patina-ios-verification` forbids installing such a build for a walk. The device command is separate: `xcodebuild -project Capture.xcodeproj -scheme Capture -configuration Debug -destination 'platform=iOS,id=<UDID>'` with signing on (team `VP22LXHT7L`, automatic).
- **No backward compatibility is owed inside the app.** Patina Field is not live anywhere (rulings, "Standing facts ruled the same day"). No legacy-decode paths, no schema-version compat shims, no `capture.session-context.v1` migration tests; a fresh install may reset the local store. **One exception, and it is spec-mandated, not compat cruft:** `CaptureSyncAttributes.ContentState`'s new fields are optional so an **in-flight ActivityKit payload** decodes across an app update (spec §5.5).
- **No database work in this wave.** No migration is authored, no number is claimed, `docs/engineering/migration-number-reservations.md` is not touched. Wave 2 is iOS-only.
- **Copy rule (`.agents/skills/patina-brand-voice/SKILL.md`).** Every user-facing string and every code comment a designer could ever read: plain-spoken, concrete, no luxury haze. **Never the word "AI"** — and never lead with algorithm/model/engine mechanics. In this wave that means: the app says what it *did* ("read the photo", "couldn't tell"), never what technology did it.
- **Gate commands, verbatim:**
  ```bash
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh all
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture && swiftlint lint --quiet --strict
  ```

---

## File Structure

**Created**
| Path | Responsibility |
|---|---|
| `apps/mobile/Capture/CaptureKit/CaptureKit/Analytics/CaptureFeatureFlags.swift` | The one named place features read a flag from. Wraps wave 1's `CaptureAnalytics.isFeatureEnabled`; fail-closed. |
| `apps/mobile/Capture/CaptureKit/CaptureKit/Recognition/SmartGuessKeywords.swift` | The Vision-label → `SpecimenCategory` table, moved out of the app target so it is gate-testable (C1). |
| `apps/mobile/Capture/CaptureTests/CaptureScreenIDTests.swift` | Screen-id uniqueness + the harness's suffix-resolution contract. |
| `apps/mobile/Capture/CaptureTests/CameraModeSeamTests.swift` | `.voice` exists as a case and is kept out of the C1 selector until C6 is built. |
| `apps/mobile/Capture/CaptureTests/CaptureFeatureFlagsTests.swift` | Fail-closed flag reader. |
| `apps/mobile/Capture/CaptureTests/SmartGuessTests.swift` | `SmartGuessKeywordTests` + `UnconfirmedGuessTests`. |

**Modified**
| Path | Change |
|---|---|
| `CaptureKit/CaptureKit/Navigation/CaptureNavigation.swift` | `CaptureSheet.visit` |
| `CaptureKit/CaptureKit/Navigation/RouteRegistry.swift` | `registryKey` for `.visit` |
| `CaptureKit/CaptureKit/Analytics/CaptureAnalytics.swift` | **Conditional** (Task 0 fallback) — `isFeatureEnabled` requirement + `{ false }` default, only if Wave 1 has not already landed it |
| `CaptureKit/CaptureKit/Domain/CaptureEnums.swift` | `CameraMode.voice` + `viewfinderSelectable` |
| `CaptureKit/CaptureKit/Domain/SpecimenCapturePolicy.swift` | total over the new case |
| `CaptureKit/CaptureKit/Support/CaptureScreenID.swift` | 4 new ids + `sweepSuffix` + header |
| `CaptureKit/CaptureKit/LiveActivity/CaptureSyncAttributes.swift` | 3 optional `ContentState` fields |
| `CaptureKit/CaptureKit/Recognition/RecognitionServices.swift` | `SmartGuess.fieldsWorthRecording` |
| `CaptureKit/CaptureKit/Design/FieldPlaceholderScreen.swift` | **deleted** |
| `Capture/App/Composition/AppContainer.swift` | `smartGuess` + `featureFlags`; header |
| `Capture/App/Coordinators/CaptureCoordinator.swift` | `siteScanContextRequested` |
| `Capture/App/DeepLinking/CaptureDeepLink.swift` | route the 4 new ids (Task 1); header count (Task 4, F-M2) |
| `Capture/App/Configuration/AppConfiguration.swift` | header counts |
| `Capture/Features/Capture/ViewfinderModel.swift` | real smart guess |
| `Capture/Features/Capture/ViewfinderControls.swift` | selector reads `viewfinderSelectable` |
| `Capture/Features/Root/ViewfinderPlaceholder.swift` | same |
| `Capture/Features/Onboarding/CameraPrimingScreen.swift` | same |
| `Capture/Features/Route/S3DestinationScreen.swift` | hold at `.inbox` |
| `Capture/Features/Recognition/RecognitionScreens.swift` | `container.smartGuess` |
| `Capture/Features/SiteScan/SiteScanContextCapture.swift` | typed screen id |
| `Capture/Features/SiteScan/SiteScanSetupScreen.swift` | harness-driven context cover |
| `Capture/Features/Resilience/LowLightTorchOverlay.swift` | **deleted** |
| `Capture/Features/Resilience/ResilienceScreens.swift` | header |
| `Capture/Services/Camera/AVFoundationCameraService.swift` | header |
| `Capture/Services/Recognition/HeuristicSmartGuessService.swift` | delegates to `SmartGuessKeywords` |
| `Capture/Services/Recognition/SpeechVoiceNoteService.swift` | header (verify-or-fix) |
| `CaptureKitMocks/CaptureKitMocks.swift` | header count (F-M2) |
| `CaptureTests/FieldCompanionPresentationTests.swift` | new `ContentState` shape; `import Foundation` |
| `scripts/capture-shots.sh` | `F1.context` in the sweep + counts |
| `README.md` | screen counts, migration credit, non-existent targets |
| `Capture.xcodeproj/project.pbxproj` | regenerated (C4) |

---

### Task 0 — Pre-flight re-verification against the merged Wave 1

**Why this task exists.** This plan was written on 2026-08-24 while `feat/field-companion-w1` was still an empty worktree — every Wave-1 name below comes from the program plan's §8 *Interfaces* blocks, not from merged code. **Ruling 2026-08-24: Wave 1 is being built now on `feat/field-companion-w1` and is expected to land all four names on `main` before wave 2 starts.** Task 0 gates on the *merged* Wave 1 — run its commands against `main` after `feat/field-companion-w1` has landed there, not against the branch or a stale snapshot. Wave 2 consumes four of those names. Re-check them before writing a line, and do not begin the worktree (Step 6) until the merge has happened.

**Files:** none — this task produces a decision, not a diff. **There is no commit.**

**Interfaces:**
- Consumes (from Wave 1, must exist on `main` before Task 1 starts):
  - `CaptureAnalytics.isFeatureEnabled(_ key: String) -> Bool` with a `false`-returning default in the protocol extension
  - `CaptureMediaMime.forFilename(_:) -> String` / `CaptureMediaMime.bucketAllowed: Set<String>`
  - `VoiceRecordingPolicy.segmentRotationSeconds` / `.maxNoteSeconds` / `.maxSegments` / `.segmentFilename(noteID:index:)` / `.shouldRotate(elapsedInSegment:)` / `.shouldEnd(totalElapsed:segmentCount:)`
  - `CaptureRoutingMemory.stamped(onto venue: VenueStamp) -> VenueStamp`
  - Two recorder gate call sites reading `isFeatureEnabled("field-companion-voice")` (Wave 1 Task 3.6: `VoiceNoteSheet`'s mic and `SiteScanContextModel.toggleVoice()`)
- Produces: a recorded go/no-go plus any name corrections, applied inline to this plan before Task 1.

- [ ] **Step 1: Confirm Wave 1 is merged and read its actual seam names**

```bash
cd /Users/kody/Code/patina-merged
git log --oneline -15 main -- apps/mobile/Capture
grep -n "isFeatureEnabled" apps/mobile/Capture/CaptureKit/CaptureKit/Analytics/CaptureAnalytics.swift
sed -n '1,40p' apps/mobile/Capture/CaptureKit/CaptureKit/Sync/CaptureMediaMime.swift
sed -n '1,40p' apps/mobile/Capture/CaptureKit/CaptureKit/Recognition/VoiceRecordingPolicy.swift
grep -n "func stamped" apps/mobile/Capture/CaptureKit/CaptureKit/Session/CaptureSessionContext.swift
```

Expected: `isFeatureEnabled` present as a protocol requirement **and** as a `{ false }` default in `public extension CaptureAnalytics`; the two new CaptureKit files exist with the signatures above; `stamped(onto:)` exists.

**If any name differs** (different file path, different label, `featureFlags` already on `AppContainer`, a different flag key than `"field-companion-voice"`), edit this plan's Interfaces blocks and code snippets to the merged names **before** starting Task 1, and note the correction in the wave report. Do not proceed with a name this file invented.

**If `isFeatureEnabled` is absent from `CaptureAnalytics` entirely** (checked above and it is, as of this writing — Wave 1 has not yet landed it on `main`), Wave 2 is not hostage to it: `CaptureAnalytics` is a CaptureKit seam and Task 1 is *the* seam commit, so Task 1 adds it there. Append to the protocol (`CaptureKit/CaptureKit/Analytics/CaptureAnalytics.swift:8-15`):

```swift
public protocol CaptureAnalytics: Sendable {
    func screen(_ name: String, _ properties: [String: String])
    func event(_ name: String, _ properties: [String: String])
    func identify(_ userID: String)
    func identify(_ userID: String, properties: [String: String])
    /// Remote feature flags. Additive (wave 2): existing conformers keep
    /// compiling via the `{ false }` default below.
    func isFeatureEnabled(_ key: String) -> Bool
}
```

and to `public extension CaptureAnalytics` (`:18-25`):

```swift
    /// Fail-closed default — a conformer that cannot answer says no.
    func isFeatureEnabled(_ key: String) -> Bool { false }
```

If Wave 1 lands first and adds its own `isFeatureEnabled`, this step is a no-op — record "already present, no edit" in the wave report instead. Either way, Task 1's Files, Interfaces and commit body gain `CaptureAnalytics.swift`, and Step 7's "repoint the two recorder gate call sites" becomes "no call sites exist yet — record zero and note it in the report" if Wave 1 has not landed the recorder gates either.

Also record for the wave report: **verify that `wave-3-plan.md`'s claim that the mode selector iterates `CameraMode.allCases` is updated by the Wave 3 plan's own fixer** — after this wave the selector reads `CameraMode.viewfinderSelectable`, a literal array, not `allCases`. Do not edit `wave-3-plan.md` yourself; this plan only checks and reports.

- [ ] **Step 2: Find the recorder's flag call sites, whatever shape they took**

```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture
grep -rn "isFeatureEnabled" --include="*.swift" .
```

Expected: the PostHog conformer plus **exactly two** feature call sites. Record their file:line — Task 1 Step 7 repoints them to `container.featureFlags.isEnabled(...)`, and it must repoint the ones that are actually there, not the ones this plan predicted.

- [ ] **Step 3: Confirm the two facts Wave 2's subtraction rests on**

```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture
grep -rn "FieldPlaceholderScreen" --include="*.swift" . | grep -v "Design/FieldPlaceholderScreen.swift"
grep -rn "LowLightTorchOverlay" --include="*.swift" .
grep -rn "OfflineQueueBanner" --include="*.swift" .
grep -n "isFeatureEnabled" CaptureKitMocks/CaptureKitMocks.swift
```

Expected: `FieldPlaceholderScreen` → **zero** lines. `LowLightTorchOverlay` → only its own file, its own `#Preview` (`:122`), and the `ResilienceScreens.swift:9` comment. `OfflineQueueBanner` → **at least one real render site on C1** (Wave 1 package 1-13). If the banner still has only preview references, Wave 1 package 1-13 did not land — say so in the report; Task 4's `ResilienceScreens.swift` header rewrite must then describe the banner as still unrendered rather than claiming C1 renders it. `MockCaptureAnalytics` → today (checked, `CaptureKitMocks.swift:144-148`) it implements only `screen`/`event`, no `isFeatureEnabled` override, so it falls through to the `{ false }` default and Task 1 Step 7's `.allOff` in mock mode drops nothing a mock could otherwise show. **If Wave 1 gave the mock its own `isFeatureEnabled` that answers `true`** (so previews/harness can see a gated surface), record that here — `.allOff` would then silently drop those screens from Task 5's sweep, and the sweep count would need to be re-baselined against that, not against this plan's assumption.

- [ ] **Step 4: Check whether Wave 1 already replaced `SpeechVoiceNoteService.swift:7`**

```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture
sed -n '1,12p' Capture/Services/Recognition/SpeechVoiceNoteService.swift
```

Wave 1's Task 8.1 rewrites that header, and the program plan's §2 package 2-4 also claims it — they overlap. Expected after Wave 1: the line *"The raw audio file is always kept alongside the text."* is **gone**. If it is gone, Task 4 records "already true, no edit" for this file and does not invent an edit. If it is still there, Task 4 replaces it with the wording in Task 4 Step 3.

- [ ] **Step 5: Record the baselines Task 5 re-baselines against**

```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture
grep -c "^    case " CaptureKit/CaptureKit/Support/CaptureScreenID.swift
grep -rn "51-screen\|51 entries\|71-screen\|all 71\|the 71" --include="*.swift" --include="*.sh" --include="*.md" .
```

Expected today: `71` cases; stale counts in `CaptureScreenID.swift:4` ("51 entries") and `AppContainer.swift:6` (both fixed by Task 1), plus `AppConfiguration.swift:96,:118`, `CaptureKitMocks.swift:4`, `CaptureDeepLink.swift:6`, `capture-shots.sh:2,:11`, `README.md:12,:14,:39,:51,:116,:120` (fixed by Tasks 4 and 5). After this wave the true numbers are **75 ids, 72 of them sweepable, 3 reserved for waves 3–4**. Write the observed baseline into the wave report; every count edit in Tasks 1, 4 and 5 is checked against it.

- [ ] **Step 6: Create the wave worktree**

```bash
cd /Users/kody/Code/patina-merged
git worktree add .claude/worktrees/field-companion-w2 -b feat/field-companion-w2 main
cd .claude/worktrees/field-companion-w2/apps/mobile/Capture && scripts/capture-gate.sh all
```

Expected: `✔ build`, `✔ tests` on an unmodified checkout. A red baseline means Wave 1 landed broken — stop and report; do not start Task 1 on top of it.

**Model hint:** Sonnet — mechanical verification, but every downstream task depends on reading the merged names correctly rather than confirming the plan's guesses.

---

### Task 1 — The foundation-seam commit (package 2-1)

Spec §5.5: *"One commit, one named owner, at the top of wave 2."* `CaptureNavigation.swift:4-6` says changing a case is a foundation-owner-only edit; `AppContainer.swift:13` says "FROZEN for the waves"; `CaptureSyncAttributes.swift:6` says a `ContentState` shape change breaks both targets. The Live-Activity shape is free to change **only until a widget target exists** — `generate_project.rb` creates exactly four targets today, and none is a widget. Do it now or never cheaply again. **Ruling 2026-08-24 folds two more things into this one commit that an earlier draft split out:** deleting `FieldPlaceholderScreen` — spec §5.5 lists it explicitly, because it is a `public` symbol leaving CaptureKit's framework surface — and every `AppContainer.swift` header edit, not just the freeze paragraph.

**Files:**
- Create: `apps/mobile/Capture/CaptureKit/CaptureKit/Analytics/CaptureFeatureFlags.swift`
- Create: `apps/mobile/Capture/CaptureTests/CaptureScreenIDTests.swift`
- Create: `apps/mobile/Capture/CaptureTests/CameraModeSeamTests.swift`
- Create: `apps/mobile/Capture/CaptureTests/CaptureFeatureFlagsTests.swift`
- Delete: `apps/mobile/Capture/CaptureKit/CaptureKit/Design/FieldPlaceholderScreen.swift`
- Modify: `apps/mobile/Capture/CaptureKit/CaptureKit/Navigation/CaptureNavigation.swift:44-80`
- Modify: `apps/mobile/Capture/CaptureKit/CaptureKit/Navigation/RouteRegistry.swift:67-86`
- Modify: `apps/mobile/Capture/CaptureKit/CaptureKit/Domain/CaptureEnums.swift:10-13`
- Modify: `apps/mobile/Capture/CaptureKit/CaptureKit/Domain/SpecimenCapturePolicy.swift:19-24`
- Modify: `apps/mobile/Capture/CaptureKit/CaptureKit/Support/CaptureScreenID.swift:1-5,:76`
- Modify: `apps/mobile/Capture/CaptureKit/CaptureKit/LiveActivity/CaptureSyncAttributes.swift:11-21`
- Modify (conditional, Task 0 fallback): `apps/mobile/Capture/CaptureKit/CaptureKit/Analytics/CaptureAnalytics.swift:8-25`
- Modify: `apps/mobile/Capture/Capture/App/Composition/AppContainer.swift:6,:9-13,:26-138`
- Modify: `apps/mobile/Capture/Capture/App/Coordinators/CaptureCoordinator.swift:13-25`
- Modify: `apps/mobile/Capture/Capture/App/DeepLinking/CaptureDeepLink.swift:84-86,:156-182,:196-212`
- Modify: `apps/mobile/Capture/Capture/Features/Capture/ViewfinderControls.swift:191`
- Modify: `apps/mobile/Capture/Capture/Features/Capture/ViewfinderModel.swift:152`
- Modify: `apps/mobile/Capture/Capture/Features/Root/ViewfinderPlaceholder.swift:38`
- Modify: `apps/mobile/Capture/Capture/Features/Onboarding/CameraPrimingScreen.swift:79`
- Modify: `apps/mobile/Capture/Capture/Features/Recognition/RecognitionScreens.swift:78`
- Modify: `apps/mobile/Capture/Capture/Features/SiteScan/SiteScanContextCapture.swift:222,:224`
- Modify: `apps/mobile/Capture/Capture/Features/SiteScan/SiteScanSetupScreen.swift:90,:119-124,:127-130`
- Test: `apps/mobile/Capture/CaptureTests/FieldCompanionPresentationTests.swift` (append)

**Interfaces:**
- Consumes: `CaptureAnalytics.isFeatureEnabled(_ key: String) -> Bool` (Wave 1, or added here per Task 0's fallback if Wave 1 has not landed it); `SmartGuessService.guess(image:ocr:codes:) async -> SmartGuess` (`RecognitionServices.swift:99-101`); `HeuristicSmartGuessService.init()` (`HeuristicSmartGuessService.swift:17`); `CaptureStore.inMemory() throws -> CaptureStore`.
- Removes: `public struct FieldPlaceholderScreen` (CaptureKit) — zero in-repo references; folded into this commit per §5.5, not left for Task 3.
- Correction to spec §5.5's ⚠ (worth a line in the wave report, not an edit here): it names the `ContentState` call sites as "`LocalCaptureSyncController`, `CaptureLiveActivityController`". In the repo today, all three construction sites (`.init(queued:...)`) are in `LocalCaptureSyncService` (`:184`, `:623`, `:743`); `CaptureLiveActivityController` only receives an already-built `ContentState` as a parameter to `start`/`update`/`end` (`:35`, `:55`, `:63`) and never constructs one. `grep -rn "ContentState" CaptureTests/` also returns nothing today, so §5.5's claim that `FieldCompanionPresentationTests` "would break" describes no test that exists yet — Step 2 below is the one that adds it. This plan's own citations are the accurate ones; §5.5 is stale on this point and should be corrected at the next spec pass.
- Produces, and every later task and wave uses exactly these names:
  ```swift
  // CaptureKit/CaptureKit/Navigation/CaptureNavigation.swift
  public enum CaptureSheet { case visit }                     // id "visit"

  // CaptureKit/CaptureKit/Navigation/RouteRegistry.swift
  public extension CaptureSheet { var registryKey: String }   // .visit -> "visit"

  // CaptureKit/CaptureKit/Domain/CaptureEnums.swift
  public enum CameraMode: String, Codable, CaseIterable, Sendable {
      case photo, tag, measure, scan, voice
  }
  public extension CameraMode {
      static var viewfinderSelectable: [CameraMode] { get }
  }

  // CaptureKit/CaptureKit/Support/CaptureScreenID.swift
  public enum CaptureScreenID: String, CaseIterable, Sendable {
      case c6Voice       = "screen.C6.voice"
      case f1Context     = "screen.F1.context"
      case v0Visit       = "screen.V0.visit"
      case v4VisitReview = "screen.V4.visit-review"
  }
  public extension CaptureScreenID { var sweepSuffix: String { get } }

  // CaptureKit/CaptureKit/LiveActivity/CaptureSyncAttributes.swift
  public struct CaptureSyncAttributes: ActivityAttributes {
      public struct ContentState: Codable, Hashable {
          public var visitLabel: String?
          public var elapsedSeconds: Int?
          public var captureCount: Int?
          public init(queued: Int, uploading: Int, failed: Int,
                      lastSpecimenTitle: String? = nil,
                      visitLabel: String? = nil,
                      elapsedSeconds: Int? = nil,
                      captureCount: Int? = nil)
      }
  }

  // CaptureKit/CaptureKit/Analytics/CaptureFeatureFlags.swift            (NEW)
  public struct CaptureFeatureFlags: Sendable {
      public init(source: @escaping @Sendable (String) -> Bool)
      public init(analytics: any CaptureAnalytics)
      public static let allOff: CaptureFeatureFlags
      public func isEnabled(_ key: String) -> Bool
  }

  // Capture/App/Composition/AppContainer.swift
  public final class AppContainer {
      public let smartGuess: any SmartGuessService
      public let featureFlags: CaptureFeatureFlags
  }

  // Capture/App/Coordinators/CaptureCoordinator.swift
  public final class CaptureCoordinator {
      public var siteScanContextRequested: Bool
  }
  ```

- [ ] **Step 1: Write the failing seam tests, part A — screen ids and camera mode**

Create `apps/mobile/Capture/CaptureTests/CaptureScreenIDTests.swift`:

```swift
//  CaptureScreenIDTests.swift
//  CaptureTests
//
//  CaptureScreenID is the harness's whole vocabulary: capture-shots.sh, the
//  `-CaptureScreen <suffix>` launch flag and CaptureDeepLink all key off it, and
//  the launch flag resolves by SUFFIX (RootView.swift:66 —
//  `allCases.first(where: { $0.rawValue.hasSuffix(raw) })`). So a new id that is
//  a suffix of an older one would silently drive the wrong screen, and the id
//  SiteScanContextScreen has been setting by hand ("screen.F1.context") has
//  never been in the enum at all, which is why it has never appeared in a sweep.

import Foundation
import Testing
@testable import CaptureKit

struct CaptureScreenIDTests {

    @Test func everyScreenIDIsUnique() {
        let raws = CaptureScreenID.allCases.map(\.rawValue)
        #expect(Set(raws).count == raws.count)

        // The launch flag matches on the suffix, so one id's sweep suffix must
        // never be a tail of another id's raw value.
        for id in CaptureScreenID.allCases {
            let matches = CaptureScreenID.allCases.filter {
                $0.rawValue.hasSuffix(id.sweepSuffix)
            }
            #expect(matches == [id],
                    "\(id.sweepSuffix) also resolves \(matches.map(\.rawValue))")
        }
    }

    @Test func contextScreenHasAnID() {
        #expect(CaptureScreenID(rawValue: "screen.F1.context") == .f1Context)
        #expect(CaptureScreenID.f1Context.sweepSuffix == "F1.context")
        #expect(CaptureScreenID.f1Context != .f1ScanSetup)
    }

    @Test func theVisitSpineIdsAreReservedNow() {
        #expect(CaptureScreenID.v0Visit.rawValue == "screen.V0.visit")
        #expect(CaptureScreenID.c6Voice.rawValue == "screen.C6.voice")
        #expect(CaptureScreenID.v4VisitReview.rawValue == "screen.V4.visit-review")
    }

    @Test func sweepSuffixStripsExactlyTheScreenPrefix() {
        #expect(CaptureScreenID.c1Viewfinder.sweepSuffix == "C1.viewfinder")
        #expect(CaptureScreenID.sr20GuestReturned.sweepSuffix == "SR20.guest-returned")
    }
}
```

Create `apps/mobile/Capture/CaptureTests/CameraModeSeamTests.swift`:

```swift
//  CameraModeSeamTests.swift
//  CaptureTests
//
//  CameraMode is CaseIterable and three views render `ForEach(CameraMode.allCases)`
//  (ViewfinderControls.swift:191, ViewfinderPlaceholder.swift:38,
//  CameraPrimingScreen.swift:79). Adding `.voice` to allCases would therefore put
//  a fifth VOICE pill in the C1 selector whose shutter takes a photo — which is
//  precisely the class of lie this wave exists to remove. The case lands now
//  because the enum is a frozen seam edited once; the pill waits for C6 (wave 3).

import Foundation
import Testing
@testable import CaptureKit

struct CameraModeSeamTests {

    @Test func voiceIsACaseSoTheSeamIsEditedOnlyOnce() {
        #expect(CameraMode(rawValue: "voice") == .voice)
        #expect(CameraMode.allCases.contains(.voice))
    }

    @Test func voiceIsNotOfferedInTheViewfinderUntilC6Exists() {
        #expect(CameraMode.viewfinderSelectable.contains(.voice) == false)
        #expect(CameraMode.viewfinderSelectable == [.photo, .tag, .measure, .scan])
    }

    @Test func everyModeStillHasANextStep() {
        #expect(SpecimenCapturePolicy.nextStep(for: .photo) == .quickConfirm)
        #expect(SpecimenCapturePolicy.nextStep(for: .tag) == .tagOCR)
        #expect(SpecimenCapturePolicy.nextStep(for: .scan) == .codeScan)
        #expect(SpecimenCapturePolicy.nextStep(for: .measure) == .measure)
        // Unreachable from the shutter: `.voice` is off `viewfinderSelectable`,
        // and wave 3 guards `captureSingle()` with
        // `SpecimenCapturePolicy.producesPhoto(_:)` rather than changing this
        // branch — this assertion still holds after wave 3.
        #expect(SpecimenCapturePolicy.nextStep(for: .voice) == .quickConfirm)
    }

    @Test func theVisitDoorIsASheetWithAStableRegistryKey() {
        #expect(CaptureSheet.visit.id == "visit")
        #expect(CaptureSheet.visit.registryKey == "visit")
    }
}
```

- [ ] **Step 2: Write the failing seam tests, part B — flags and the Live-Activity shape**

Create `apps/mobile/Capture/CaptureTests/CaptureFeatureFlagsTests.swift`:

```swift
//  CaptureFeatureFlagsTests.swift
//  CaptureTests
//
//  Wave 1 put isFeatureEnabled on the CaptureAnalytics seam and gated the voice
//  recorder on it directly. That works and it means a feature has to hold an
//  analytics object to ask a yes/no question. AppContainer.featureFlags is the
//  one named reader; it stays FAIL-CLOSED, because FC-R11's consent exposure
//  needs an off-switch that costs no build.

import Foundation
import Testing
@testable import CaptureKit

private struct SilentAnalytics: CaptureAnalytics {
    func screen(_ name: String, _ properties: [String: String]) {}
    func event(_ name: String, _ properties: [String: String]) {}
}

private struct FlaggedAnalytics: CaptureAnalytics {
    let enabled: Set<String>
    func screen(_ name: String, _ properties: [String: String]) {}
    func event(_ name: String, _ properties: [String: String]) {}
    func isFeatureEnabled(_ key: String) -> Bool { enabled.contains(key) }
}

struct CaptureFeatureFlagsTests {

    @Test func allOffAnswersFalseForEveryKey() {
        #expect(CaptureFeatureFlags.allOff.isEnabled("field-companion-voice") == false)
        #expect(CaptureFeatureFlags.allOff.isEnabled("anything") == false)
    }

    @Test func analyticsBackedFlagsAreFailClosedWhenNothingCanAnswer() {
        let flags = CaptureFeatureFlags(analytics: SilentAnalytics())
        #expect(flags.isEnabled("field-companion-voice") == false)
    }

    @Test func analyticsBackedFlagsReadTheSeam() {
        let flags = CaptureFeatureFlags(analytics:
            FlaggedAnalytics(enabled: ["field-companion-voice"]))
        #expect(flags.isEnabled("field-companion-voice"))
        #expect(flags.isEnabled("something-else") == false)
    }

    @Test func anEmptyKeyIsNeverEnabled() {
        let flags = CaptureFeatureFlags(source: { _ in true })
        #expect(flags.isEnabled("") == false)
        #expect(flags.isEnabled("real-key"))
    }
}
```

Append to `apps/mobile/Capture/CaptureTests/FieldCompanionPresentationTests.swift`, inside `struct FieldCompanionPresentationTests`, after the last `@Test`:

```swift
    // MARK: - CaptureSyncAttributes.ContentState (foundation seam, wave 2)

    @Test func syncContentStateCarriesVisitFactsAndDefaultsThemToNil() {
        let bare = CaptureSyncAttributes.ContentState(queued: 3, uploading: 1, failed: 0)
        #expect(bare.visitLabel == nil)
        #expect(bare.elapsedSeconds == nil)
        #expect(bare.captureCount == nil)

        let full = CaptureSyncAttributes.ContentState(
            queued: 0, uploading: 0, failed: 0,
            lastSpecimenTitle: "Brass sconce",
            visitLabel: "Maple St · Living",
            elapsedSeconds: 1_412,
            captureCount: 9)
        #expect(full.lastSpecimenTitle == "Brass sconce")
        #expect(full.visitLabel == "Maple St · Living")
        #expect(full.elapsedSeconds == 1_412)
        #expect(full.captureCount == 9)
    }

    @Test func anInFlightActivityPayloadStillDecodesAcrossTheShapeChange() throws {
        // Spec §5.5: optionality is what makes an Activity started by the build
        // before this one decode in the build after it.
        let inFlight = #"{"queued":2,"uploading":1,"failed":0,"lastSpecimenTitle":"Oak bench"}"#
        let state = try JSONDecoder().decode(
            CaptureSyncAttributes.ContentState.self,
            from: Data(inFlight.utf8))
        #expect(state.queued == 2)
        #expect(state.uploading == 1)
        #expect(state.lastSpecimenTitle == "Oak bench")
        #expect(state.visitLabel == nil)
        #expect(state.captureCount == nil)
    }
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh test`

Expected: FAIL, compilation errors in the new test files —
`value of type 'CaptureScreenID' has no member 'sweepSuffix'`,
`type 'CaptureScreenID' has no member 'f1Context'`,
`type 'CameraMode' has no member 'voice'`,
`type 'CameraMode' has no member 'viewfinderSelectable'`,
`type 'CaptureSheet' has no member 'visit'`,
`cannot find 'CaptureFeatureFlags' in scope`,
`extra arguments at positions #5, #6, #7 in call` (the `ContentState` initializer).

- [ ] **Step 4: Edit the three frozen CaptureKit enums**

In `CaptureKit/CaptureKit/Navigation/CaptureNavigation.swift`, add to `CaptureSheet` after `case cullDeck` (line 59):

```swift

    // ── Field Companion — the visit spine ──
    case visit                              // V0 — the door (wave 3 builds it)
```

and to its `id` switch, after `case .cullDeck: return "cull-deck"`:

```swift
        case .visit: return "visit"
```

In `CaptureKit/CaptureKit/Navigation/RouteRegistry.swift`, add to `CaptureSheet.registryKey`'s switch, after `case .cullDeck: return "cullDeck"`:

```swift
        case .visit: return "visit"
```

In `CaptureKit/CaptureKit/Domain/CaptureEnums.swift`, replace lines 10-13:

```swift
/// The ways the viewfinder can read a thing (C1 mode selector), plus `voice`.
/// `voice` is a RESERVED case: it exists so this frozen enum is edited exactly
/// once, and it is deliberately kept out of `viewfinderSelectable` until wave 3
/// builds C6 — a VOICE pill whose shutter takes a photo would be a new lie in
/// the wave that removes the old ones.
public enum CameraMode: String, Codable, CaseIterable, Sendable {
    case photo, tag, measure, scan, voice
}

public extension CameraMode {
    /// The modes C1 actually offers, in display order — a literal, not a
    /// predicate over `allCases`. A future non-selectable case can't silently
    /// admit itself here the way a filter would; adding one is Wave 3's own
    /// one-token edit, not a rule to re-derive. Wave 3 appends `.voice` when
    /// C6 exists.
    static var viewfinderSelectable: [CameraMode] {
        [.photo, .tag, .measure, .scan]
    }
}
```

In `CaptureKit/CaptureKit/Domain/SpecimenCapturePolicy.swift`, replace the switch body (lines 19-24):

```swift
        switch mode {
        case .photo: return .quickConfirm
        case .tag: return .tagOCR
        case .scan: return .codeScan
        case .measure: return .measure
        // Unreachable from the shutter: `.voice` is off `viewfinderSelectable`.
        // Wave 3 guards captureSingle() with SpecimenCapturePolicy.producesPhoto(_:)
        // rather than changing this branch.
        case .voice: return .quickConfirm
        }
```

In `CaptureKit/CaptureKit/Support/CaptureScreenID.swift`, replace the header (lines 1-5):

```swift
//  CaptureScreenID.swift
//  CaptureKit
//
//  Frozen per-screen accessibility identifiers (75 entries) — the deterministic
//  handles XCUITest, capture-shots.sh and MobAI use to drive and assert every
//  screen. 72 of them reach a built screen today; v0Visit, c6Voice and
//  v4VisitReview are reserved ids for the visit spine (waves 3–4) and are held
//  out of the sweep until the screens behind them exist.
```

Add after `case f4ScanUpload = "screen.F4.scan-upload"` (line 76):

```swift
    case f1Context            = "screen.F1.context"
    // Flow 17 — the visit spine (Field Companion). Reserved: waves 3–4.
    case v0Visit              = "screen.V0.visit"
    case c6Voice              = "screen.C6.voice"
    case v4VisitReview        = "screen.V4.visit-review"
```

and append at the end of the file, after the enum's closing brace:

```swift

public extension CaptureScreenID {
    /// What `capture-shots.sh` and `-CaptureScreen <suffix>` pass, e.g.
    /// `"F1.context"`. The launch flag resolves by suffix (RootView.swift:66),
    /// so `CaptureScreenIDTests.everyScreenIDIsUnique` guards it.
    var sweepSuffix: String {
        String(rawValue.dropFirst("screen.".count))
    }
}
```

- [ ] **Step 5: Add `CaptureFeatureFlags` and widen `ContentState`**

Create `CaptureKit/CaptureKit/Analytics/CaptureFeatureFlags.swift`:

```swift
//  CaptureFeatureFlags.swift
//  CaptureKit
//
//  The one named place a feature reads a remote flag from. Wave 1 put
//  `isFeatureEnabled` on the CaptureAnalytics seam and gated the voice recorder
//  on it directly; this wraps that seam so a feature never has to hold an
//  analytics object to ask a yes/no question. FAIL-CLOSED throughout: anything
//  that cannot answer answers `false`, so a surface that needs an off-switch
//  (FC-R11's recording consent) has one that costs no build.

import Foundation

public struct CaptureFeatureFlags: Sendable {
    private let source: @Sendable (String) -> Bool

    public init(source: @escaping @Sendable (String) -> Bool) {
        self.source = source
    }

    /// Reads the wave-1 `CaptureAnalytics.isFeatureEnabled` seam.
    public init(analytics: any CaptureAnalytics) {
        self.init(source: { analytics.isFeatureEnabled($0) })
    }

    /// Every key is off — the honest answer when there is no flag source.
    public static let allOff = CaptureFeatureFlags(source: { _ in false })

    public func isEnabled(_ key: String) -> Bool {
        guard !key.isEmpty else { return false }
        return source(key)
    }
}
```

In `CaptureKit/CaptureKit/LiveActivity/CaptureSyncAttributes.swift`, replace lines 4-6 of the header and the whole `ContentState` (lines 12-21):

```swift
//  Shared ActivityKit attributes for the offline-sync Live Activity (R4/U1).
//  MUST live in CaptureKit: the app starts and updates it; a widget extension
//  will render it. FROZEN — a ContentState shape change breaks both, and it is
//  free ONLY while no widget target exists. Wave 2 spends that once (spec §5.5)
//  so wave 5 can render the visit without another shape change.
```

```swift
    public struct ContentState: Codable, Hashable {
        public var queued: Int
        public var uploading: Int
        public var failed: Int
        public var lastSpecimenTitle: String?
        /// Visit facts. Wave 5 renders them; the shape lands now because it is
        /// free only until a widget target exists. Optional is also what lets an
        /// Activity started by the previous build decode in this one.
        public var visitLabel: String?
        public var elapsedSeconds: Int?
        public var captureCount: Int?
        public init(queued: Int, uploading: Int, failed: Int,
                    lastSpecimenTitle: String? = nil,
                    visitLabel: String? = nil,
                    elapsedSeconds: Int? = nil,
                    captureCount: Int? = nil) {
            self.queued = queued; self.uploading = uploading
            self.failed = failed; self.lastSpecimenTitle = lastSpecimenTitle
            self.visitLabel = visitLabel; self.elapsedSeconds = elapsedSeconds
            self.captureCount = captureCount
        }
    }
```

The three existing construction sites — `LocalCaptureSyncService.swift:184`, `:623`, `:743` — all use labelled arguments and stop at `lastSpecimenTitle:`, so the `= nil` defaults keep them compiling untouched. **Do not edit them.**

- [ ] **Step 6: Fix the app-target compile fallout**

`CaptureDeepLink.route(for:)`'s switch is exhaustive over `CaptureScreenID` with no `default`, so the four new ids must land there. In `Capture/App/DeepLinking/CaptureDeepLink.swift`, replace the first case group (lines 84-86):

```swift
        case .c1Viewfinder, .c2Framing, .c3Specimen, .c4MultiShot,
             .e1AppIcon, .e2SystemEntry, .r1LowLight,
             // Reserved ids: V0/C6 are wave 3, V4 is wave 4. They have no
             // destination yet, so the harness stays on C1 rather than
             // screenshotting a screen that does not exist.
             .v0Visit, .c6Voice, .v4VisitReview:
            break
```

and add `.f1Context` to the Work group (line 115), leaving the line count unchanged:

```swift
             .f1ScanSetup, .f1Context, .f2SiteScan, .f3ScanReview, .f4ScanUpload:
```

In the same file, add an explicit case to `routeWorkScreen` before its `default:` (line 180):

```swift
        case .f1Context:
            coordinator.siteScanContextRequested = true
            coordinator.navigate(to: .siteScanSetup)
```

and add `.f1Context` to `realm(for:)`'s Work list (line 202), again on the existing line:

```swift
             .f1ScanSetup, .f1Context, .f2SiteScan, .f3ScanReview, .f4ScanUpload,
```

In `Capture/App/Coordinators/CaptureCoordinator.swift`, add after `public var onboardingStep: Int?` (line 18):

```swift
    /// The `-CaptureScreen F1.context` harness hop. `SiteScanContextScreen` is a
    /// fullScreenCover owned by SiteScanSetupScreen, not a route, so the
    /// harness asks for it here and the setup screen consumes the request once.
    public var siteScanContextRequested = false
```

In `Capture/Features/SiteScan/SiteScanSetupScreen.swift`, add to the existing `.task` block (lines 127-130), after `await model.load()` (line 129):

```swift
            if coordinator.siteScanContextRequested {
                coordinator.siteScanContextRequested = false
                showContextCapture = true
            }
```

In `Capture/Features/SiteScan/SiteScanContextCapture.swift`, replace the two hardcoded strings (lines 222 and 224):

```swift
        .accessibilityIdentifier(CaptureScreenID.f1Context.rawValue)
```
```swift
            container.analytics.screen(CaptureScreenID.f1Context.rawValue)
```

Point the three mode rows and the swipe cycle at `viewfinderSelectable`:

- `Capture/Features/Capture/ViewfinderControls.swift:191` → `ForEach(CameraMode.viewfinderSelectable, id: \.self) { item in`
- `Capture/Features/Root/ViewfinderPlaceholder.swift:38` → `ForEach(CameraMode.viewfinderSelectable, id: \.self) { mode in`
- `Capture/Features/Onboarding/CameraPrimingScreen.swift:79` → `ForEach(CameraMode.viewfinderSelectable, id: \.self) { mode in`
- `Capture/Features/Capture/ViewfinderModel.swift:152` → `let all = CameraMode.viewfinderSelectable`

`cycleMode(_:)` (`ViewfinderModel.swift:151-156`) then reads:

```swift
    func cycleMode(_ direction: Int) async {
        let all = CameraMode.viewfinderSelectable
        guard let index = all.firstIndex(of: mode) else { return }
        let next = all[(index + direction + all.count) % all.count]
        await select(next)
    }
```

`mode` can legitimately hold `.voice` — `start()` sets `mode = camera.currentMode` (`:89`) and `select(_:)` accepts any `CameraMode` — at which point `all.firstIndex(of: mode)` is `nil` and the swipe cycle silently stops responding, with no error and no signal to the designer. Harmless today (nothing sets `mode` to `.voice` in wave 2), but a silent dead branch is exactly the failure mode this wave exists to remove, so fix it now rather than leave it for wave 3 to discover. Replace the `guard` line:

```swift
        let index = all.firstIndex(of: mode) ?? 0
```

(drops the `guard`/`return` — cycling from an off-selector mode now falls back to the first selectable mode instead of doing nothing.)

Also update the section marker above the selector, `ViewfinderControls.swift:183`:

```swift
// MARK: - Mode selector (C1, PHOTO · TAG · MEASURE · SCAN — `.voice` waits for C6)
```

- [ ] **Step 7: Give `AppContainer` its two new seams and repoint the existing consumers**

In `Capture/App/Composition/AppContainer.swift`, add after `public let analytics: any CaptureAnalytics` (line 34):

```swift
    /// N5's real reader — the same Vision-backed service on device and in the
    /// simulator (VNClassifyImageRequest runs on the iphonesimulator SDK and
    /// simply yields `.unknown` on an empty frame), so no surface anywhere gets
    /// a guess nothing computed.
    public let smartGuess: any SmartGuessService
    /// Remote flags, fail-closed. `.allOff` in mock mode: the harness and the
    /// previews must never light a gated surface.
    public let featureFlags: CaptureFeatureFlags
```

In the `if real {` branch, after `self.analytics = analytics` (line 74):

```swift
            self.smartGuess = HeuristicSmartGuessService()
            self.featureFlags = CaptureFeatureFlags(analytics: analytics)
```

In the `else {` branch, after `self.analytics = analytics` (line 117):

```swift
            self.smartGuess = HeuristicSmartGuessService()
            self.featureFlags = .allOff
```

**Lint budget — do this before running the gate.** `AppContainer.init()` measures **57** body lines today; these four assignments (two per branch) take it to **61**, over `.swiftlint.yml`'s `function_body_length: warning: 60`, which `--strict` turns into a hard failure. The block that has to shrink is the real branch's twelve-line Phase-2 factory block (`AppContainer.swift:91-102`) — not `CaptureDeepLink.route(for:)`, which measures 55 today and grows to 56 with Step 6's own edit, nine lines under the ceiling and needing no remedy.

Extract the factory block into a private static helper. Replace lines 91-102 —

```swift
            let workDeps = WorkServiceDependencies(client: client, session: session, store: store)
            self.projects = ProjectsServiceFactory.make(deps: workDeps)
            self.leads = LeadsServiceFactory.make(deps: workDeps)
            self.decisions = DecisionsServiceFactory.make(deps: workDeps)
            self.messaging = MessagesServiceFactory.make(deps: workDeps)
            self.receiving = ReceivingServiceFactory.make(deps: workDeps)
            self.portalAuth = QRApproveServiceFactory.make(deps: workDeps)
            self.siteScan = SiteScanServiceFactory.make(deps: workDeps)
            let siteRequests = SiteRequestServiceFactory.make(deps: workDeps)
            self.siteRequests = siteRequests
            self.guestSiteRequests = siteRequests
            self.siteRequestOutboxDrainer = SiteRequestOutboxDrainer(store: store, remote: siteRequests)
```

— with:

```swift
            let workDeps = WorkServiceDependencies(client: client, session: session, store: store)
            (self.projects, self.leads, self.decisions, self.messaging, self.receiving,
             self.portalAuth, self.siteScan, self.siteRequests, self.siteRequestOutboxDrainer) =
                Self.makeWorkServices(deps: workDeps)
            self.guestSiteRequests = self.siteRequests
```

and add the helper as a new private static method, right after `init()`'s closing brace and before `identifyRestoredSession` (matching that method's own placement style):

```swift
    /// Everything wave-agent factories build off `WorkServiceDependencies`,
    /// bundled into one call so `init()` stays under `function_body_length`.
    /// Real mode only — mock mode wires `CaptureKitMocks` conformers directly
    /// and has no `WorkServiceDependencies` to build (no client to give it).
    private static func makeWorkServices(deps: WorkServiceDependencies) -> (
        projects: any ProjectsService,
        leads: any LeadsService,
        decisions: any DecisionsReadService,
        messaging: any MessagingService,
        receiving: any ReceivingService,
        portalAuth: any PortalAuthApprovalService,
        siteScan: any SiteScanService,
        siteRequests: SupabaseSiteRequestService,
        siteRequestOutboxDrainer: SiteRequestOutboxDrainer
    ) {
        let siteRequests = SiteRequestServiceFactory.make(deps: deps)
        return (
            ProjectsServiceFactory.make(deps: deps),
            LeadsServiceFactory.make(deps: deps),
            DecisionsServiceFactory.make(deps: deps),
            MessagesServiceFactory.make(deps: deps),
            ReceivingServiceFactory.make(deps: deps),
            QRApproveServiceFactory.make(deps: deps),
            SiteScanServiceFactory.make(deps: deps),
            siteRequests,
            SiteRequestOutboxDrainer(store: deps.store, remote: siteRequests)
        )
    }
```

This takes `init()`'s real branch from 12 lines to 4 and adds a 20-line helper outside the function body SwiftLint measures — net effect on `init()`'s own body: **57 − 8 + 4 = 53** lines, nine under the ceiling with room for later waves.

Replace the header's stale freeze paragraph (lines 9-13) — §17.4 records that all eight Phase-2 factories return real Supabase concretes, not mocks:

```swift
//  Phase 2 designer/pro seams (projects/leads/decisions/messaging/receiving/
//  portalAuth/siteScan): mock mode wires the CaptureKitMocks conformers; real
//  mode calls each flow's own `<Flow>ServiceFactory.make(deps:)`, and every one
//  of the eight now returns a real Supabase concrete. Field Companion wave 2
//  added `smartGuess` and `featureFlags` as the last two composition seams; the
//  rest of this file stays foundation-owner-only.
```

Also replace line 6, folded into this commit per ruling 2026-08-24 (it was Task 4's edit in an earlier draft — every `AppContainer.swift` header line lands in the one seam commit, not split across two):

```swift
//     store + InMemoryCaptureSyncService + no-op analytics — keeps the screen
```

In `Capture/Features/Recognition/RecognitionScreens.swift:78`, replace the ad-hoc construction:

```swift
                smartGuess: container.smartGuess,
```

Write this edit **from Task 0 Step 2's recorded file:line output**, not from a guess at where the call sites live — repoint the ones that are actually there. Two shapes are possible and both repoint the same way: `analytics.isFeatureEnabled("field-companion-voice")` → `container.featureFlags.isEnabled("field-companion-voice")` where the view holds the container directly; or, where the view holds a model that itself holds `analytics` rather than the container, give that model a `flags: CaptureFeatureFlags` seam instead (constructed from `container.featureFlags` at the model's init site) and call `flags.isEnabled("field-companion-voice")`. Verify none is left — scoped to the whole app target, not just `Capture/Features`, because `SpeechVoiceNoteService` and other recorder-adjacent code live under `Capture/Services`:

```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture
grep -rn "isFeatureEnabled" --include="*.swift" Capture/
```
Expected: the PostHog conformer's own implementation (`PostHogCaptureAnalytics.swift`, if Wave 1 gave it one) is the only permitted hit — every *call site* reads `container.featureFlags.isEnabled(...)` or a model's own `flags.isEnabled(...)`, never `analytics.isFeatureEnabled(...)` directly.

- [ ] **Step 8: Delete `FieldPlaceholderScreen` — the last piece of the one-commit requirement**

Spec §5.5 lists this deletion as part of the same seam commit, because it removes a `public` symbol from CaptureKit's framework surface — a named seam edit, not a silent one.

```bash
cd /Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w2/apps/mobile/Capture
grep -rn "FieldPlaceholderScreen" --include="*.swift" .
```

Expected: only its own file, `CaptureKit/CaptureKit/Design/FieldPlaceholderScreen.swift`. **If a real call site shows up, stop** — a referenced view is not dead code, and this step's premise is wrong; report it instead of deleting.

```bash
rm CaptureKit/CaptureKit/Design/FieldPlaceholderScreen.swift
```

- [ ] **Step 9: Run the gate and the linter**

```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh all
cd /Users/kody/Code/patina-merged/apps/mobile/Capture && swiftlint lint --quiet --strict
grep -rn "FieldPlaceholderScreen" --include="*.swift" .
```

Expected: `✔ build`, `✔ tests`, `✔ lint` — 14 new tests pass, and the census grep prints nothing (C4 — `capture-gate.sh` re-runs `generate_project.rb`, so the pbxproj diff for the deletion is already on disk, ready for the `git add` in the commit below). Do **not** silence `function_body_length` if it still fires — re-check the extraction in Step 7 first; `CaptureDeepLink.route(for:)` needs no remedy (see Step 7's lint-budget note).

- [ ] **Step 10: Commit**

```bash
cd /Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w2
git add apps/mobile/Capture/CaptureKit/CaptureKit/Navigation/CaptureNavigation.swift \
        apps/mobile/Capture/CaptureKit/CaptureKit/Navigation/RouteRegistry.swift \
        apps/mobile/Capture/CaptureKit/CaptureKit/Domain/CaptureEnums.swift \
        apps/mobile/Capture/CaptureKit/CaptureKit/Domain/SpecimenCapturePolicy.swift \
        apps/mobile/Capture/CaptureKit/CaptureKit/Support/CaptureScreenID.swift \
        apps/mobile/Capture/CaptureKit/CaptureKit/LiveActivity/CaptureSyncAttributes.swift \
        apps/mobile/Capture/CaptureKit/CaptureKit/Analytics/CaptureFeatureFlags.swift \
        apps/mobile/Capture/CaptureKit/CaptureKit/Analytics/CaptureAnalytics.swift \
        apps/mobile/Capture/CaptureKit/CaptureKit/Design/FieldPlaceholderScreen.swift \
        apps/mobile/Capture/Capture/App/Composition/AppContainer.swift \
        apps/mobile/Capture/Capture/App/Coordinators/CaptureCoordinator.swift \
        apps/mobile/Capture/Capture/App/DeepLinking/CaptureDeepLink.swift \
        apps/mobile/Capture/Capture/Features/Capture/ViewfinderControls.swift \
        apps/mobile/Capture/Capture/Features/Capture/ViewfinderModel.swift \
        apps/mobile/Capture/Capture/Features/Root/ViewfinderPlaceholder.swift \
        apps/mobile/Capture/Capture/Features/Onboarding/CameraPrimingScreen.swift \
        apps/mobile/Capture/Capture/Features/Recognition/RecognitionScreens.swift \
        apps/mobile/Capture/Capture/Features/SiteScan/SiteScanContextCapture.swift \
        apps/mobile/Capture/Capture/Features/SiteScan/SiteScanSetupScreen.swift \
        apps/mobile/Capture/CaptureTests/CaptureScreenIDTests.swift \
        apps/mobile/Capture/CaptureTests/CameraModeSeamTests.swift \
        apps/mobile/Capture/CaptureTests/CaptureFeatureFlagsTests.swift \
        apps/mobile/Capture/CaptureTests/FieldCompanionPresentationTests.swift \
        apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
```
Note: `git add` on `CaptureAnalytics.swift` is only meaningful if Task 0's fallback edited it; `git add` on a path with no changes is a harmless no-op. `git add` on the deleted `FieldPlaceholderScreen.swift` stages the removal.
```bash
git commit -m "feat(ios): edit every frozen Field seam once, in one commit

Foundation owner: Kody (Field Companion wave 2, spec §5.5).

CaptureNavigation, CaptureEnums, CaptureScreenID, AppContainer and
CaptureSyncAttributes each carry an explicit foundation-owner-only freeze
comment, and the Live-Activity ContentState shape is free to change only while
no widget target exists — generate_project.rb builds exactly four targets, none
of them a widget. So all of it lands together: CaptureSheet.visit, CameraMode
.voice, the three visit-spine screen ids, the F1.context id SiteScanContextScreen
has been setting by hand since it shipped, three optional ContentState fields,
AppContainer's last two composition seams, and FieldPlaceholderScreen's deletion
— a public symbol leaving CaptureKit's framework surface, so it is recorded here
as a named seam edit rather than a silent one (spec §5.5), not split into a
second commit.

.voice is a reserved case and stays off CameraMode.viewfinderSelectable — a
literal array, not a filter over allCases — until wave 3 builds C6: allCases
still feeds three mode rows and a VOICE pill whose shutter takes a photo would
be a new lie in the wave that removes the old ones.

featureFlags reads CaptureAnalytics.isFeatureEnabled (wave 1's, or added here if
wave 1 had not yet landed it) and is .allOff in mock mode, so the harness and
the previews cannot light a gated surface.

AppContainer.init()'s real-mode Phase-2 factory block moved into a private
static makeWorkServices(deps:) so the two new composition seams fit under
function_body_length: 60."
```

**Model hint:** Opus — five frozen files, one exhaustive switch that must not grow past the lint ceiling, a shape change that is cheap exactly once, and a lint-budget extraction that must actually compile.

---

### Task 2 — The viewfinder stops shipping a guess it did not compute (package 2-2)

`ViewfinderModel.applySmartGuess` (`:410-422`) stamps **every** photo `category='seating'` @0.72 and `material="Oak / bouclé"` @0.6 with `ProvenanceSource.smartGuess`. Those ride `payload.guesses` + `payload.provenance` into `products.capture_provenance`, and because `hasUnconfirmedGuess` is `provenanceRaw.values.contains("smartGuess")` they make it **always true** — so S3 has recommended Inbox for every capture ever taken (`S3DestinationScreen.swift:52-57`). The real reader has been built and reachable only behind the N5 sheet the photo path never opens.

⚠ **Removing the two literals flips S3's default toward Library for the one case that must not flip.** **Ruling 2026-08-24: wave 2 ships no confidence floor.** `hasUnconfirmedGuess` is not touched by this task — it stays exactly what it is today, `provenanceRaw.values.contains("smartGuess")`, provenance-only. Most real photos still get at least one `smartGuess`-sourced field from the real reader, so `hasUnconfirmedGuess` stays true for them, same as before. But a photo the reader cannot place at all — a damaged baseboard, a drywall seam — now records **nothing**, because `fieldsWorthRecording` drops an unplaceable label rather than writing `.unknown` dressed up as an answer. Nothing written means no `smartGuess` provenance means `hasUnconfirmedGuess` is false — which is exactly what `S3DestinationScreen.swift:52-57`'s `hasUnconfirmedGuess ? .inbox : .library` treats as *safe to mint*. Spec Flow 6: wave 2 therefore **holds the recommendation at `.inbox` regardless of confidence** until visit kinds exist, at which point wave 3 gates Library on `kind == 'sourcing'`. The two changes ship together or the wave ships a regression.

**Files:**
- Create: `apps/mobile/Capture/CaptureKit/CaptureKit/Recognition/SmartGuessKeywords.swift`
- Create: `apps/mobile/Capture/CaptureTests/SmartGuessTests.swift`
- Modify: `apps/mobile/Capture/CaptureKit/CaptureKit/Recognition/RecognitionServices.swift:91-98`
- Modify: `apps/mobile/Capture/Capture/Services/Recognition/HeuristicSmartGuessService.swift:51,:58-81`
- Modify: `apps/mobile/Capture/Capture/Features/Capture/ViewfinderModel.swift:14-30,:70-80,:225,:271,:410-422`
- Modify: `apps/mobile/Capture/Capture/Features/Route/S3DestinationScreen.swift:52-57`

`CaptureKit/CaptureKit/Domain/Specimen+Accessors.swift` is **not** in this list. An earlier draft made `hasUnconfirmedGuess` confidence-aware against a `SmartGuessConfidence.confirmedFloor`; ruling 2026-08-24 deletes that floor and leaves this file untouched — the provenance-only reading it already has is exactly what wave 2 needs.

**Interfaces:**
- Consumes: `AppContainer.smartGuess: any SmartGuessService` (Task 1); `SmartGuessService.guess(image:ocr:codes:) async -> SmartGuess`; `CaptureImage.init(data:width:height:)`; `CaptureStore.mediaURL(for:) -> URL`; `Specimen.primaryPhoto: CapturePhoto?`; `Specimen.setValue(_:for:source:)`; `Specimen.setConfidence(_:for:)`; `Specimen.hasUnconfirmedGuess: Bool` (existing, provenance-only, unchanged).
- Produces:
  ```swift
  // CaptureKit/CaptureKit/Recognition/SmartGuessKeywords.swift               (NEW)
  public enum SmartGuessKeywords {
      public static let table: [(keyword: String, category: SpecimenCategory)]
      public static func category(forVisionLabel label: String) -> SpecimenCategory?
  }

  // CaptureKit/CaptureKit/Recognition/RecognitionServices.swift
  public extension SmartGuess {
      var fieldsWorthRecording: [FieldSuggestion] { get }
  }
  ```

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/Capture/CaptureTests/SmartGuessTests.swift`:

```swift
//  SmartGuessTests.swift
//  CaptureTests
//
//  Two contracts the viewfinder's smart guess rests on, both moved into
//  CaptureKit so capture-gate.sh can see them (C1 — CaptureTests links
//  CaptureKit alone, and HeuristicSmartGuessService is app-side):
//
//  1. The Vision-label → category table. The Vision call itself is
//     device-verified; the mapping is pure and belongs under the gate.
//  2. What counts as an UNCONFIRMED guess. Until now every capture carried a
//     hardcoded seating@0.72, so hasUnconfirmedGuess was always true and S3
//     recommended Inbox for every capture ever taken. hasUnconfirmedGuess
//     itself does not change in this wave (ruling 2026-08-24: no confidence
//     floor) — it is still provenance-only. What changes is that a label the
//     reader cannot place now writes nothing at all, so there is genuinely
//     nothing left to confirm; a real guess, however confident, still is.

import Foundation
import Testing
@testable import CaptureKit

struct SmartGuessKeywordTests {

    @Test func visionLabelsMapToTheCategoryTheyName() {
        #expect(SmartGuessKeywords.category(forVisionLabel: "armchair") == .seating)
        #expect(SmartGuessKeywords.category(forVisionLabel: "Coffee Table") == .table)
        #expect(SmartGuessKeywords.category(forVisionLabel: "wall sconce") == .lighting)
        #expect(SmartGuessKeywords.category(forVisionLabel: "area rug") == .rug)
        #expect(SmartGuessKeywords.category(forVisionLabel: "brass knob") == .hardware)
    }

    @Test func anUnknownLabelMapsToNothingRatherThanAGuess() {
        #expect(SmartGuessKeywords.category(forVisionLabel: "baseboard") == nil)
        #expect(SmartGuessKeywords.category(forVisionLabel: "") == nil)
        #expect(SmartGuessKeywords.category(forVisionLabel: "drywall seam") == nil)
    }

    @Test func matchingIsCaseInsensitiveAndSubstringBased() {
        #expect(SmartGuessKeywords.category(forVisionLabel: "OAK DINING CHAIR") == .seating)
        #expect(SmartGuessKeywords.category(forVisionLabel: "chairlift") == .seating)
    }

    @Test func everyKeywordInTheTableResolves() {
        for entry in SmartGuessKeywords.table {
            #expect(SmartGuessKeywords.category(forVisionLabel: entry.keyword) != nil,
                    "\(entry.keyword) does not resolve through its own table")
        }
    }

    @Test func anUnknownCategoryIsNeverWorthRecording() {
        let blank = SmartGuess(category: .unknown, categoryConfidence: 0, fields: [
            FieldSuggestion(key: .category, value: SpecimenCategory.unknown.rawValue,
                            confidence: 0)
        ])
        #expect(blank.fieldsWorthRecording.isEmpty)
    }

    @Test func aRealReadIsWorthRecording() {
        let read = SmartGuess(category: .seating, categoryConfidence: 0.81, fields: [
            FieldSuggestion(key: .category, value: SpecimenCategory.seating.rawValue,
                            confidence: 0.81),
            FieldSuggestion(key: .material, value: "Oak", confidence: 0.55),
            FieldSuggestion(key: .colorway, value: "Ecru", confidence: 0)
        ])
        let keys = read.fieldsWorthRecording.map(\.key)
        #expect(keys == [.category, .material])
    }
}

struct UnconfirmedGuessTests {

    @Test @MainActor func aCaptureWithNoGuessHasNothingToConfirm() throws {
        let store = try CaptureStore.inMemory()
        let s = store.newDraft()
        #expect(s.hasUnconfirmedGuess == false)
    }

    @Test @MainActor func anUnplaceableLabelWritesNothingSoThereIsNothingToConfirm() throws {
        // The wall-defect case (spec Flow 6). fieldsWorthRecording drops an
        // unplaceable label, so nothing ever reaches setValue/setConfidence —
        // provenance never carries smartGuess, and there is nothing to confirm.
        let blank = SmartGuess(category: .unknown, categoryConfidence: 0, fields: [
            FieldSuggestion(key: .category, value: SpecimenCategory.unknown.rawValue,
                            confidence: 0)
        ])
        #expect(blank.fieldsWorthRecording.isEmpty)

        let store = try CaptureStore.inMemory()
        let s = store.newDraft()
        #expect(s.hasUnconfirmedGuess == false)
    }

    @Test @MainActor func aShakyGuessIsUnconfirmed() throws {
        let store = try CaptureStore.inMemory()
        let s = store.newDraft()
        s.setValue(SpecimenCategory.textile.rawValue, for: .category, source: .smartGuess)
        s.setConfidence(0.31, for: .category)
        #expect(s.hasUnconfirmedGuess)
    }

    @Test @MainActor func aConfidentGuessIsStillUnconfirmed() throws {
        // No confidence floor (ruling 2026-08-24): a confident read still needs
        // her to confirm it, exactly like a shaky one. Confidence orders the
        // list and pre-selects in the confirm sheet; it never commits (FC-R12).
        let store = try CaptureStore.inMemory()
        let s = store.newDraft()
        s.setValue(SpecimenCategory.seating.rawValue, for: .category, source: .smartGuess)
        s.setConfidence(0.92, for: .category)
        #expect(s.hasUnconfirmedGuess)
    }

    @Test @MainActor func aGuessWithNoRecordedConfidenceIsStillUnconfirmed() throws {
        let store = try CaptureStore.inMemory()
        let s = store.newDraft()
        s.setValue("Walnut", for: .material, source: .smartGuess)
        #expect(s.hasUnconfirmedGuess)
    }

    @Test @MainActor func aTypedValueIsNeverAGuessHoweverConfident() throws {
        let store = try CaptureStore.inMemory()
        let s = store.newDraft()
        s.setValue("Lostine armchair", for: .title, source: .manual)
        s.setConfidence(0.1, for: .title)
        #expect(s.hasUnconfirmedGuess == false)
    }
}
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh test`

Expected: FAIL, compilation errors —
`cannot find 'SmartGuessKeywords' in scope`,
`value of type 'SmartGuess' has no member 'fieldsWorthRecording'`.

- [ ] **Step 3: Move the keyword table into CaptureKit**

Create `CaptureKit/CaptureKit/Recognition/SmartGuessKeywords.swift`:

```swift
//  SmartGuessKeywords.swift
//  CaptureKit
//
//  The Vision-label → SpecimenCategory mapping, lifted out of the app target so
//  it runs under capture-gate.sh (CaptureTests links CaptureKit alone). The
//  Vision request that produces the labels stays app-side and is device-verified;
//  this table is pure and is the part that quietly rots.

import Foundation

public enum SmartGuessKeywords {

    public static let table: [(keyword: String, category: SpecimenCategory)] = [
        ("armchair", .seating), ("chair", .seating), ("sofa", .seating), ("couch", .seating),
        ("stool", .seating), ("bench", .seating), ("seat", .seating),
        ("table", .table), ("desk", .table), ("nightstand", .table),
        ("lamp", .lighting), ("light", .lighting), ("chandelier", .lighting), ("sconce", .lighting),
        ("cabinet", .storage), ("shelf", .storage), ("bookcase", .storage), ("dresser", .storage),
        ("wardrobe", .storage), ("credenza", .storage),
        ("rug", .rug), ("carpet", .rug),
        ("curtain", .textile), ("fabric", .textile), ("textile", .textile), ("pillow", .textile),
        ("cushion", .textile), ("drapery", .textile),
        ("vase", .decor), ("bowl", .decor), ("sculpture", .decor), ("mirror", .decor),
        ("painting", .art), ("artwork", .art), ("print", .art),
        ("faucet", .plumbing), ("sink", .plumbing), ("tap", .plumbing),
        ("tile", .tile),
        ("knob", .hardware), ("handle", .hardware), ("hinge", .hardware)
    ]

    /// First table entry whose keyword appears in the label, or nil. Nil means
    /// "we could not tell" — never `.unknown` dressed up as an answer.
    public static func category(forVisionLabel label: String) -> SpecimenCategory? {
        let id = label.lowercased()
        for entry in table where id.contains(entry.keyword) {
            return entry.category
        }
        return nil
    }
}
```

In `Capture/Services/Recognition/HeuristicSmartGuessService.swift`, delete `categoryForKeyword` and `keywordTable` (lines 58-81) and replace the call at line 51 with:

```swift
            if let category = SmartGuessKeywords.category(forVisionLabel: obs.identifier) {
```

- [ ] **Step 4: Add the recording filter — no confidence floor**

In `CaptureKit/CaptureKit/Recognition/RecognitionServices.swift`, add after the `SmartGuess` struct (line 98):

```swift

public extension SmartGuess {
    /// The suggestions worth writing onto a record. Drops `.unknown` (which
    /// means "could not tell", not "is unknown") and anything the reader had no
    /// confidence in at all — so a capture never carries a guess nothing
    /// computed. Confidence orders and pre-selects; per ruling 2026-08-24 it
    /// never gates what gets recorded or what counts as confirmed (FC-R12:
    /// nothing auto-applies at any confidence).
    var fieldsWorthRecording: [FieldSuggestion] {
        fields.filter { suggestion in
            guard suggestion.confidence > 0 else { return false }
            guard !suggestion.value.isEmpty else { return false }
            if suggestion.key == .category,
               suggestion.value == SpecimenCategory.unknown.rawValue { return false }
            return true
        }
    }
}
```

`CaptureKit/CaptureKit/Domain/Specimen+Accessors.swift` is **not edited**. Its `hasUnconfirmedGuess` stays exactly `provenanceRaw.values.contains("smartGuess")` — provenance-only, no confidence floor, no new `confidence(for:)` getter. That is the whole point of the ruling: subtraction alone (an unplaceable label writes nothing) already delivers "the app never asks her to confirm something it never guessed."

- [ ] **Step 5: Call the real reader from the viewfinder**

In `Capture/Features/Capture/ViewfinderModel.swift`, add to the seams block after `private let sessionContext: CaptureSessionContextStore` (line 24):

```swift
    private let smartGuess: any SmartGuessService
```

and in `init(container:coordinator:)`, after `self.companion = container.companion` (line 79):

```swift
        self.smartGuess = container.smartGuess
```

Replace `applySmartGuess(to:)` and its doc comment (lines 410-422):

```swift
    /// Read the frame we just took and record what it says — the real reader,
    /// not a placeholder. It runs off the shutter path so the C3 card appears at
    /// once and fills in when the read lands; `setValue` still refuses to let a
    /// guess clobber anything a tag, a scan, a measure or the designer set.
    private func applySmartGuess(to draft: Specimen) {
        guard let photo = draft.primaryPhoto,
              let data = try? Data(contentsOf: store.mediaURL(for: photo.filename)),
              !data.isEmpty else { return }
        let image = CaptureImage(data: data, width: photo.width, height: photo.height)
        let draftID = draft.id
        Task { [weak self] in
            guard let self else { return }
            let guess = await self.smartGuess.guess(image: image, ocr: [], codes: [])
            let recordable = guess.fieldsWorthRecording
            guard !recordable.isEmpty,
                  let current = self.currentSpecimen(id: draftID) else { return }
            for suggestion in recordable {
                current.setValue(suggestion.value, for: suggestion.key, source: suggestion.source)
                current.setConfidence(suggestion.confidence, for: suggestion.key)
            }
            try? self.store.save()
        }
    }
```

Both call sites (`:225` in `captureSingle()`, `:271` in `endMultiShot()`) stay exactly as they are — `applySmartGuess(to:)` is still synchronous to its callers and now returns before the read finishes.

- [ ] **Step 6: Hold S3's recommendation at Inbox**

In `Capture/Features/Route/S3DestinationScreen.swift`, replace `recommended` (lines 52-57):

```swift
    private var recommended: CaptureDestination {
        if specimen.destination == .library || specimen.destination == .inbox {
            return specimen.destination
        }
        // Held at Inbox on purpose (spec Flow 6), regardless of confidence — no
        // confidence floor ships in wave 2. The hardcoded guess used to make
        // hasUnconfirmedGuess always true; with a real reader, a photo the
        // reader cannot place at all now records nothing, which reads as
        // confirmed and would recommend Library — mint a product — for a photo
        // of a damaged baseboard. Wave 3 gates Library on a sourcing visit, and
        // this line goes away with it.
        return .inbox
    }
```

Also correct the file header's lines 4-5 (the claim spans both — "recommending from / the record's completeness" — not just line 4), which now describe something the file no longer does:

```swift
//  S3 · Destination. Makes the catch-vs-keep decision explicit. The recommendation
//  is held at Inbox until wave 3's visit kinds can tell a sourcing day from a
//  site walk (spec Flow 6, F-12).
```

- [ ] **Step 7: Run the gate and the linter**

```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh all
cd /Users/kody/Code/patina-merged/apps/mobile/Capture && swiftlint lint --quiet --strict
```

Expected: `✔ build`, `✔ tests`, `✔ lint` — 12 new tests pass (6 `SmartGuessKeywordTests` + 6 `UnconfirmedGuessTests`). `RouteSessionUI.swift:184`'s `.guess` tray badge needs no edit — it already reads `hasUnconfirmedGuess`, which this task leaves untouched; the badge simply starts reflecting the real reader's provenance instead of the two retired literals.

- [ ] **Step 8: Commit**

```bash
cd /Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w2
git add apps/mobile/Capture/CaptureKit/CaptureKit/Recognition/SmartGuessKeywords.swift \
        apps/mobile/Capture/CaptureKit/CaptureKit/Recognition/RecognitionServices.swift \
        apps/mobile/Capture/Capture/Services/Recognition/HeuristicSmartGuessService.swift \
        apps/mobile/Capture/Capture/Features/Capture/ViewfinderModel.swift \
        apps/mobile/Capture/Capture/Features/Route/S3DestinationScreen.swift \
        apps/mobile/Capture/CaptureTests/SmartGuessTests.swift \
        apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
git commit -m "fix(ios): no capture ships a guess the app did not compute

applySmartGuess stamped every photo seating@0.72 and 'Oak / bouclé'@0.6 with
smartGuess provenance. Those two literals rode payload.guesses and
payload.provenance into products.capture_provenance, and because
hasUnconfirmedGuess only asked whether any field carried smartGuess provenance,
they made it always true — so S3 has recommended Inbox for every capture ever
taken. The real reader was already built and reachable only behind the N5 sheet
the photo path never opens.

The read now runs off the shutter path, so the card still appears at once and
fills in when the answer lands, and a label the table cannot place records
nothing rather than recording 'unknown'. hasUnconfirmedGuess is untouched —
still provenance-only, no confidence floor (ruling 2026-08-24) — so a confident
read still needs her to confirm it, same as a shaky one.

Subtraction alone still flips S3's default toward Library for the one case that
must not flip: a photo the reader cannot place at all now records nothing,
which reads as confirmed. So the recommendation is held at Inbox regardless of
confidence until wave 3's visit kinds can tell a sourcing day from a site walk
(spec Flow 6)."
```

**Model hint:** Opus — a shipped-provenance change whose blast radius reaches S3 and the tray badge; the first attempt has to be right.

---

### Task 3 — Delete the preview-only torch overlay (package 2-3)

Spec §7.12: `LowLightTorchOverlay` is preview-only dead code; C1's real low-light UI is `ViewfinderNightChip` / `ViewfinderTorchPill` / `ViewfinderLowLightHint`. *"Delete or wire; do not leave it ambiguous."* **`FieldPlaceholderScreen`'s deletion moved into Task 1's seam commit** (ruling 2026-08-24, §5.5's "one commit" requirement) — this task now handles only the one file.

**Files:**
- Delete: `apps/mobile/Capture/Capture/Features/Resilience/LowLightTorchOverlay.swift`
- Modify: `apps/mobile/Capture/Capture.xcodeproj/project.pbxproj` (regenerated, C4)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. One symbol leaves the tree — `struct LowLightTorchOverlay` (app target). No later task or wave may reference it.

⚠ **There is no unit test for a deletion.** `CaptureTests` cannot assert the absence of a type, and it is a SwiftUI view in a target the gate cannot exercise (C3). The executable check is the reference census below plus the build; that is stated here rather than dressed up as a test.

- [ ] **Step 1: Record the reference census before deleting**

```bash
cd /Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w2/apps/mobile/Capture
grep -rn "LowLightTorchOverlay" --include="*.swift" .
```

Expected before: only its own file (`:1`, `:15`, `:122` — the `#Preview`) and the comment at `Capture/Features/Resilience/ResilienceScreens.swift:9`.

**If it shows a real call site, stop.** A referenced view is not dead code, and this task's premise is wrong; report it instead of deleting.

- [ ] **Step 2: Delete the file and regenerate the project**

```bash
cd /Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w2/apps/mobile/Capture
rm Capture/Features/Resilience/LowLightTorchOverlay.swift
ruby scripts/generate_project.rb
```

Expected: the script prints its usual summary and `git status --short` shows the deletion plus a modified `Capture.xcodeproj/project.pbxproj` (C4 — the pbxproj diff must be in the commit).

- [ ] **Step 3: Re-run the census and the gate**

```bash
cd /Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w2/apps/mobile/Capture
grep -rn "LowLightTorchOverlay" --include="*.swift" .
scripts/capture-gate.sh all
swiftlint lint --quiet --strict
```

Expected: the grep prints **only** `Capture/Features/Resilience/ResilienceScreens.swift:9` — that comment is Task 4's line, deliberately left for it. Then `✔ build`, `✔ tests`, `✔ lint`.

- [ ] **Step 4: Commit**

```bash
cd /Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w2
git add apps/mobile/Capture/Capture/Features/Resilience/LowLightTorchOverlay.swift \
        apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
git commit -m "refactor(ios): delete the preview-only torch overlay

LowLightTorchOverlay is referenced only by its own #Preview. C1's real
low-light UI is ViewfinderNightChip / ViewfinderTorchPill /
ViewfinderLowLightHint. The spec's instruction was delete or wire, do not
leave it ambiguous."
```

**Model hint:** Haiku — one deletion, one regeneration, one census.

---

### Task 4 — File headers stop describing an app that no longer exists (package 2-4)

Spec §17.4 names them. These are not cosmetic: `SpeechVoiceNoteService.swift:7`'s claim that the raw audio is always kept **is the reason two discovery reports got the audio wrong**. `AppContainer.swift`'s stale header lines moved into Task 1's seam commit (ruling 2026-08-24, §5.5's "one commit") — this task does not touch that file. Two more headers join this task's census that an earlier draft's grep pattern missed entirely: `CaptureKitMocks.swift:4` ("all 51 screens") and `CaptureDeepLink.swift:6` ("51-row acceptance matrix") — neither `51-screen`, `51 entries`, `all 71` nor `the 71` matches either string.

**Files:**
- Modify: `apps/mobile/Capture/CaptureKit/CaptureKit/Support/CaptureScreenID.swift` (verify only — Task 1 already rewrote it)
- Modify: `apps/mobile/Capture/Capture/App/Configuration/AppConfiguration.swift:96,:118`
- Modify: `apps/mobile/Capture/Capture/Services/Camera/AVFoundationCameraService.swift:6-8`
- Modify: `apps/mobile/Capture/Capture/Services/Recognition/SpeechVoiceNoteService.swift:7` (verify-or-fix — see Task 0 Step 4)
- Modify: `apps/mobile/Capture/Capture/Features/Resilience/ResilienceScreens.swift:8-10`
- Modify: `apps/mobile/Capture/CaptureKitMocks/CaptureKitMocks.swift:4`
- Modify: `apps/mobile/Capture/Capture/App/DeepLinking/CaptureDeepLink.swift:6`
- Modify: `apps/mobile/Capture/README.md:12,:14,:35,:38-39,:51,:52,:101,:116,:120`

**Interfaces:**
- Consumes: `CaptureScreenID` (75 cases, Task 1); the fact that `LowLightTorchOverlay` no longer exists (Task 3).
- Produces: nothing executable. **Task 4 must run after Tasks 1 and 3** — every number and every claim it writes is only true once those have landed.

⚠ **No unit test.** These are comments and a README. The executable check is the census grep plus a green gate; stated here rather than faked.

- [ ] **Step 1: Census the stale claims**

```bash
cd /Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w2/apps/mobile/Capture
grep -rnE "\b51[- ](screen|entries|row)|all 51|the 51|71-screen|71 entries|all 71|the 71|71 screens|71 total" --include="*.swift" --include="*.md" .
grep -n "NOT wired into AppContainer yet" Capture/Services/Camera/AVFoundationCameraService.swift
grep -n "always kept alongside the text" Capture/Services/Recognition/SpeechVoiceNoteService.swift
grep -n "LowLightTorchOverlay / OfflineQueueBanner" Capture/Features/Resilience/ResilienceScreens.swift
grep -n "00258\|CaptureShareExtension\|CaptureWidgets" README.md
```

Expected: `CaptureScreenID.swift` and `AppContainer.swift` no longer appear (Task 1 fixed both — if either does, Task 1 was applied incompletely; fix it there, not here); `AppConfiguration.swift:96,:118`, `CaptureKitMocks.swift:4` ("all 51 screens") and `CaptureDeepLink.swift:6` ("51-row acceptance matrix") still say 51; README says 71 in five places, credits `00258`, and lists two directories that do not exist; `AVFoundationCameraService.swift:6` still says the camera is not wired; `ResilienceScreens.swift:9` still names a deleted view. `SpeechVoiceNoteService.swift:7` may already be clean — Task 0 Step 4 recorded which.

- [ ] **Step 2: Fix the screen-count claims and the camera claim**

`Capture/App/Configuration/AppConfiguration.swift`, line 96 (inside the `runsRealServices` doc comment):

```swift
    /// `-CaptureForceReal`. This keeps the screen harness, capture-run.sh,
```

line 118:

```swift
    /// verification of the screen matrix), e.g. `-CaptureScreen T1.settings`.
```

(Both drop the number rather than restating it — the count moves every wave, and `CaptureScreenID.swift` is the one place it is worth keeping accurate.)

`CaptureKitMocks/CaptureKitMocks.swift`, replace line 4:

```swift
//  In-memory / mock conformer for every CaptureKit seam, so every screen
```

`Capture/App/DeepLinking/CaptureDeepLink.swift`, replace line 6:

```swift
//  full acceptance matrix). Production entries (E1/E2) also land here.
```

`Capture/Services/Camera/AVFoundationCameraService.swift`, replace lines 6-8. Keep it short — the *why* (the simulator's `AVCaptureDevice.default(...)` returning nil) is already stated correctly two lines below, at `:10-13`, and restating it here would be the same duplication this task exists to remove elsewhere:

```swift
//  data output. Wired into AppContainer on device (AppContainer.swift:104-110);
//  the simulator branch takes MockCameraService instead.
```

- [ ] **Step 3: Fix the two claims that misled a reader**

`Capture/Services/Recognition/SpeechVoiceNoteService.swift`, line 7 — **only if Task 0 Step 4 found the old claim still present.** If Wave 1's Task 8.1 already replaced it, record "already true, no edit" in the wave report and skip this edit entirely. Otherwise replace:

```swift
//  transcript-entry fallback. The audio IS the record and the transcript is a
//  reading of it: the .m4a is written from the same engine tap that feeds
//  recognition, and a failed audio open or write is non-fatal — the note ships
//  transcript-only rather than blocking.
```

`Capture/Features/Resilience/ResilienceScreens.swift`, replace lines 8-10:

```swift
//  Registers ONLY `.photoImport`. OfflineQueueBanner is a composable overlay the
//  C1 viewfinder renders, not a registered screen; `.ocr` (R2) and `.syncStatus`
//  (U1) belong to Teams C/F.
```

⚠ If Task 0 Step 3 found that Wave 1 package 1-13 did **not** land and `OfflineQueueBanner` still has only preview references, write instead:

```swift
//  Registers ONLY `.photoImport`. OfflineQueueBanner is a composable overlay
//  nothing renders yet — wave 1 package 1-13 puts it on C1; `.ocr` (R2) and
//  `.syncStatus` (U1) belong to Teams C/F.
```

- [ ] **Step 4: Fix the README**

`apps/mobile/Capture/README.md`:

- line 12: `attaches a scan to a project. The 8 Work flows (19 screens) sit alongside`
- line 14: `harness, one set of dev-loop scripts drives all 75.`
- line 35: `| 15 | Pro site-scan | F1 scan-setup · F1 context · F2 site-scan · F3 scan-review · F4 scan-upload |`
- lines 38-39: `Flows 0–7 are the original 33 screens; flows 8–15 are the 19 Work-flow` / `screens added in Phase 2 plus 20 P1 Site Request screens — 72 built — and three reserved visit-spine ids (75 total). Screen ids are defined once, in` (33 + 19 + 20 + 3 = 75, recounted from the real `CaptureScreenID` after Task 1: 71 existing cases + `f1Context` folding into the Work-flow count + the 3 reserved visit-spine ids)
- line 51: `- **`Capture/`** — the app target (Features/ per flow).`
- line 52: **delete the line entirely** — `CaptureShareExtension/` and `CaptureWidgets/` do not exist; `generate_project.rb` creates exactly four targets (CaptureKit, CaptureKitMocks, Capture, CaptureTests).
- line 101: `Migration `00265_room_scans_project_linkage.sql` adds the Work flows' site-scan` (`00258` is `edge_settings_vault`)
- line 116: `scripts/capture-run.sh C5.specimen-sheet  # jump straight to any built screen`
- line 120: `scripts/capture-shots.sh                  # all 72 built screens`

- [ ] **Step 5: Re-run the census and the gate**

```bash
cd /Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w2/apps/mobile/Capture
grep -rnE "\b51[- ](screen|entries|row)|all 51|the 51|71-screen|71 entries|all 71|the 71|71 screens|71 total|00258|CaptureShareExtension|CaptureWidgets" --include="*.swift" --include="*.md" .
grep -rn "always kept alongside the text\|NOT wired into AppContainer yet\|LowLightTorchOverlay" --include="*.swift" .
scripts/capture-gate.sh all
swiftlint lint --quiet --strict
```

Expected: both greps print nothing. Then `✔ build`, `✔ tests`, `✔ lint`.

- [ ] **Step 6: Commit**

```bash
cd /Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w2
git add apps/mobile/Capture/Capture/App/Configuration/AppConfiguration.swift \
        apps/mobile/Capture/Capture/Services/Camera/AVFoundationCameraService.swift \
        apps/mobile/Capture/Capture/Services/Recognition/SpeechVoiceNoteService.swift \
        apps/mobile/Capture/Capture/Features/Resilience/ResilienceScreens.swift \
        apps/mobile/Capture/CaptureKitMocks/CaptureKitMocks.swift \
        apps/mobile/Capture/Capture/App/DeepLinking/CaptureDeepLink.swift \
        apps/mobile/Capture/README.md
git commit -m "docs(ios): file headers stop describing an app that no longer exists

Seven of them, several named in spec §17.4, and two had a cost. The claim that
SpeechVoiceNoteService always keeps the raw audio is why two discovery reports
concluded audio was already leaving the device when nothing had ever written a
file. AVFoundationCameraService said it was not wired into AppContainer, which
it has been since the camera work landed.

The rest: the screen counts (51 in AppConfiguration, CaptureKitMocks and
CaptureDeepLink; 71 in README's five places), a README crediting 00258 for
scan-project linkage when that is 00265 and 00258 is edge_settings_vault, a
README listing a share extension and a widget target that do not exist, and a
Resilience header naming a view this wave deleted.

AppContainer's own stale header lines already landed in Task 1's seam commit —
not repeated here."
```

**Model hint:** Haiku — mechanical text edits, but every claim must be checked against the code before it is rewritten, not assumed.

---

### Task 5 — Re-baseline the screenshot sweep (package 2-5)

`screen.F1.context` has never appeared in a `capture-shots.sh` sweep or the `-CaptureScreen` harness: `SiteScanContextScreen` set the string by hand and it was not an enum case. Task 1 made it one and gave it a harness hop. This task puts it in the sweep and proves it renders — the wave's acceptance criterion *"a screenshot sweep includes the non-Pro context screen."*

**Files:**
- Modify: `apps/mobile/Capture/scripts/capture-shots.sh:2,:11,:12,:40,:46`

**Interfaces:**
- Consumes: `CaptureScreenID.f1Context` and its `routeWorkScreen` hop via `CaptureCoordinator.siteScanContextRequested` (Task 1).
- Produces: nothing executable. `ALL_SCREENS` gains exactly one entry, `F1.context`; the three reserved ids stay out until the screens behind them exist.

- [ ] **Step 1: Confirm the sweep is blind to the context screen today**

```bash
cd /Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w2/apps/mobile/Capture
scripts/capture-shots.sh F1
```

Expected: `→ sweeping 1 screen(s)` and exactly one file, `F1.scan-setup.png`. The context screen is invisible to the sweep — that is the failure this task fixes.

- [ ] **Step 2: Add `F1.context` to the sweep and correct the counts**

In `scripts/capture-shots.sh`, replace line 2 (line 3, `# of each, using only the simulator...`, already reads correctly after this — the fix is not to end line 2 with a dangling "of"):

```bash
# capture-shots.sh — sweep every built screen in the matrix and save a PNG
```

replace lines 11-12:

```bash
#   scripts/capture-shots.sh                      # all 72 built screens
#   scripts/capture-shots.sh C5 N1 S3             # only the given screens (prefix match)
```

and replace line 40 inside `ALL_SCREENS`:

```bash
  F1.scan-setup F1.context F2.site-scan F3.scan-review F4.scan-upload
```

Then add, immediately after the closing `)` of `ALL_SCREENS` (line 46):

```bash
# Not swept: V0.visit, C6.voice and V4.visit-review. Their CaptureScreenID cases
# exist (the enum is a frozen seam edited once, wave 2) but the screens behind
# them are waves 3–4. Sweeping them would produce a PNG of C1 filed under
# another screen's name, which is worse than a gap.
```

- [ ] **Step 3: Run the sweep and confirm the context screen actually renders**

```bash
cd /Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w2/apps/mobile/Capture
scripts/capture-shots.sh F1
ls -l .build/shots/F1.context.png
```

Expected: `→ sweeping 2 screen(s)`, both `✔` lines, and `F1.context.png` present with a non-trivial size (a blank frame is a few KB; a rendered one is tens of KB). **Open it.** It must show the *Reference capture* header over the scan backdrop — not the *Site scan* setup form, which would mean the `siteScanContextRequested` hop did not fire.

⚠ **A shot of the setup form may be a timing miss, not a broken hop, before you conclude the hop failed.** The route to this screen chains two awaits inside the sweep's settle window (`CAPTURE_SHOT_SETTLE`, default 1.4s — `capture-shots.sh:21`): `SiteScanSetupScreen`'s `.task` awaits `model.load()` before it consumes `siteScanContextRequested` (`:127-130`), then the cover's own `.task` awaits `container.camera.start()` (`SiteScanContextCapture.swift:225`) before it renders. If the shot shows the setup form, re-run with `CAPTURE_SHOT_SETTLE=3 scripts/capture-shots.sh F1` before concluding the hop did not fire.

- [ ] **Step 4: Run the whole sweep once, as the wave's re-baseline**

```bash
cd /Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w2/apps/mobile/Capture
scripts/capture-shots.sh
ls .build/shots/*.png | wc -l
```

Expected: `→ sweeping 72 screen(s)` and `72`. `.build/` is gitignored (`apps/mobile/Capture/.gitignore:7`), so no PNG is committed — the evidence is this count plus the `F1.context.png` reading, recorded in the wave report.

- [ ] **Step 5: Run the gate and the linter**

```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh all
cd /Users/kody/Code/patina-merged/apps/mobile/Capture && swiftlint lint --quiet --strict
```

Expected: `✔ build`, `✔ tests`, `✔ lint`.

- [ ] **Step 6: Commit**

```bash
cd /Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w2
git add apps/mobile/Capture/scripts/capture-shots.sh
git commit -m "test(ios): the sweep finally covers the non-Pro context screen

SiteScanContextScreen set 'screen.F1.context' as a literal and it was never a
CaptureScreenID case, so it appeared in no sweep and no -CaptureScreen run since
the day it shipped — on a device with no LiDAR it is the whole reference-capture
surface. It is an enum case now, the harness hops to it through the setup
screen's fullScreenCover, and the sweep is 72 built screens.

V0.visit, C6.voice and V4.visit-review stay out. Their ids exist because the
enum is a frozen seam edited once; the screens are waves 3-4, and a PNG of C1
filed under another screen's name is worse than a gap."
```

**Model hint:** Sonnet — a shell edit plus a simulator run whose output has to be looked at, not just counted.

---

### Task 6 — Wave gate, device pass, and the wave report

Per plan §2 *Gates / device pass / rollout* and standing constraint C5: a green `capture-gate.sh` is a Simulator compile-and-unit-test signal, nothing more. Vision classification, the camera, and the recorder are all Simulator-fallback surfaces.

**Files:**
- Create: `docs/design/field-companion/wave-2-report.md`

**Interfaces:**
- Consumes: everything Tasks 1–5 produced.
- Produces: the wave report `docs/design/field-companion/wave-2-report.md`, and the pushed branch `feat/field-companion-w2` — **the orchestrator merges to `main`, never this plan** (ruling 2026-08-24).

- [ ] **Step 1: Run the full gate on the finished branch**

```bash
cd /Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w2/apps/mobile/Capture
scripts/capture-gate.sh all
swiftlint lint --quiet --strict ; echo "lint exit=$?"
```

Expected: `✔ build`, `✔ tests`, `✔ lint`, `lint exit=0`. **Record that swiftlint actually ran** — C2: a green `all` alone does not prove it did.

- [ ] **Step 2: Build and install a signed Debug build on a physical device**

```bash
cd /Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w2/apps/mobile/Capture
xcrun xctrace list devices
ruby scripts/generate_project.rb
xcodebuild -project Capture.xcodeproj -scheme Capture -configuration Debug \
  -destination 'platform=iOS,id=<UDID>'
```

Expected: BUILD SUCCEEDED and the app on the phone. **Never install a `capture-gate.sh build` product** — it is `CODE_SIGNING_ALLOWED=NO` and `patina-ios-verification` forbids walking one.

- [ ] **Step 3: Walk the wave's five device steps**

1. **Photograph four different real objects** — a chair, a table lamp, a rug, a cabinet pull. Expect **four different categories** on the C3 card, each arriving a beat after the card, each badged as a read. None of them may be `seating` for all four, and none may say `Oak / bouclé` unless the label actually said so.
2. **Photograph a wall defect** (a damaged baseboard, a drywall seam). Expect: **no category is recorded at all** — the table cannot place it, so nothing is written — and opening S3 recommends **Inbox**, never Library (spec Flow 6).
3. **Open the C1 mode row.** Expect **four** pills — PHOTO · TAG · MEASURE · SCAN. **No VOICE pill.** Swipe through the modes and confirm the cycle never lands on a fifth.
4. **Trigger a sync with something queued** and confirm the offline-sync Live Activity still starts, updates and ends — the `ContentState` gained three fields and the three call sites were not touched.
5. **On a device with no LiDAR** (or with the LiDAR path unavailable), open Site scan → the reference-capture cover. Confirm the screen renders and, in PostHog, that a `screen` event for `screen.F1.context` arrives — the id is typed now, and wave 1's build-time key means it should land from a device install.

Record each result — pass, fail, or not-run-and-why — in the report. A step that could not be run is written down as not run, never as passed.

- [ ] **Step 4: Write the wave report**

Create `docs/design/field-companion/wave-2-report.md` with, at minimum:

```markdown
# Field Companion · Wave 2 report — "Nothing the app says about a capture is a lie"

**Branch:** `feat/field-companion-w2` · **Pushed, awaiting orchestrator merge** · **merge-base with main:** <sha> · **branch head:** <sha>
**Gates:** `capture-gate.sh all` <result> · `swiftlint lint --quiet --strict` <result, exit code>

## Task 0 — pre-flight against merged Wave 1
| Wave-1 name | Found as | Notes |
|---|---|---|
| `CaptureAnalytics.isFeatureEnabled` | | already on main / added here (Task 1 fallback) |
| `CaptureMediaMime.forFilename` / `.bucketAllowed` | | |
| `VoiceRecordingPolicy.*` | | |
| `CaptureRoutingMemory.stamped(onto:)` | | |
| recorder flag call sites | | file:line, or "none — no call sites yet" |
| `SpeechVoiceNoteService.swift:7` | already true / fixed here | |
| `OfflineQueueBanner` rendered on C1 | yes / no | decides Task 4 Step 3's wording |
| `wave-3-plan.md`'s `allCases` claim | not this plan's to fix | flag for the Wave 3 plan's own pre-flight — the selector now reads `CameraMode.viewfinderSelectable`, a literal, not `allCases` |

## What landed
- Frozen seams + FieldPlaceholderScreen deletion, one commit: <sha>
- Real smart guess + S3 hold (no confidence floor): <sha>
- Deletion (LowLightTorchOverlay): <sha>
- Headers: <sha>
- Sweep: <sha>

## Acceptance
| Criterion (plan §2, reworded 2026-08-24 to the provenance-only reading) | Evidence |
|---|---|
| No capture ships a guess it did not compute | device step 1 + step 2 |
| `hasUnconfirmedGuess` is false for a photo the reader could not place, and for a capture with no guess at all — no confidence floor ships in wave 2 | `UnconfirmedGuessTests` + device step 2 |
| A screenshot sweep includes the non-Pro context screen | `F1.context.png`, <bytes> |
| Every frozen seam — including `FieldPlaceholderScreen`'s deletion and every `AppContainer.swift` header line — changed exactly once, in one commit, owner named | <sha> |

## Device pass
<five steps, each pass / fail / not run and why>

## Owed / carried forward
- The `.voice` mode pill, `CaptureSheet.visit`'s registry entry, and the V0/C6/V4 sweep entries — waves 3–4.
- `wave-3-plan.md` needs `CameraMode.viewfinderSelectable`, `CaptureScreenID.sweepSuffix`, `CaptureFeatureFlags` and `CaptureCoordinator.siteScanContextRequested` added to its own Wave-2-consumption list, and its mode-selector step corrected from "confirm the selector iterates `allCases`" to "append `.voice` to `viewfinderSelectable`" — flagged here, fixed by the Wave 3 plan's own fixer, not by this plan.
- The ESCALATE-class copy pass on the SiteScan coach/anchor/context surfaces (spec §17.4) — a named brand-voice line item with Kody, not in this wave.
- Spec §17.4 (`field-companion-package.md:1972`) says `CaptureScreenID.swift`'s header goes to 74 entries after §5.5; the correct figure is **75**, because the `f1Context` orphan fix is itself a new case §17.4 does not count separately. §17.4's parenthetical is stale — fix at the next spec pass, not here.
- `wave-4-plan.md:192` greps for `CaptureKit/CaptureKit/Navigation/CaptureScreenID.swift`; the file lives at `CaptureKit/CaptureKit/Support/CaptureScreenID.swift`. Out of this plan's scope (a different wave's plan file) but flagged here since this plan is where the file's real location is authoritative.
```

- [ ] **Step 5: Push the branch and report — the orchestrator merges**

```bash
cd /Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w2
git add docs/design/field-companion/wave-2-report.md
git commit -m "docs(field-companion): wave 2 report — gates, device pass"
git push origin feat/field-companion-w2
git merge-base main feat/field-companion-w2
git rev-parse feat/field-companion-w2
```

Record the merge-base sha and the branch head sha (the two command outputs above) in the wave report's header line, and in the final report to the orchestrator. **This plan does not merge to `main` and does not remove the worktree** — ruling 2026-08-24: the orchestrator merges, and the worktree stays live until that merge lands, in case a rebase is needed.

**Model hint:** Opus — the report is where an unrun device step has to be written down as unrun, and the merge-base/head handoff has to be exact for the orchestrator to merge cleanly.

---

## Self-review

**Spec coverage.**

| Spec / plan requirement | Task |
|---|---|
| §5.5 `CaptureSheet.visit` | 1 |
| §5.5 `CameraMode.voice` | 1 (+ `viewfinderSelectable`, so the case does not ship a dead pill) |
| §5.5 `CaptureScreenID` + `v0Visit`/`c6Voice`/`v4VisitReview` | 1 |
| §5.5 the orphan `screen.F1.context` | 1 (enum case + harness hop), 5 (sweep) |
| §5.5 `AppContainer` gains `smartGuess` + `featureFlags` | 1 |
| §5.5 `ContentState` gains `visitLabel`/`elapsedSeconds`/`captureCount`, `= nil` defaults | 1 |
| §5.5 one commit, one named owner | 1 (owner in the commit body) |
| §5.5 / §7.12 delete `FieldPlaceholderScreen` as a named seam edit | 1 (moved from an earlier draft's Task 3, ruling 2026-08-24: §5.5's "one commit") |
| §7.12 delete-or-wire `LowLightTorchOverlay` | 3 |
| §7.12 delete the two literals in `applySmartGuess` | 2 |
| Flow 6 fix 1 — the real `HeuristicSmartGuessService`, S3 held at `.inbox` regardless of confidence | 2 |
| Flow 6 device check — wall defect must not recommend Library | 6, step 2 |
| §17.3 `applySmartGuess`'s two literals retired | 2 |
| §17.4 stale headers (`CaptureScreenID`, README, `AVFoundationCameraService`, `AppContainer`, `SpeechVoiceNoteService`, `ResilienceScreens`) plus two more the census now catches (`CaptureKitMocks`, `CaptureDeepLink`) | 1 (`CaptureScreenID` verify, `AppContainer` fully), 4 (the rest) |
| plan §2 package 2-5 sweep re-baseline | 5 |
| plan §2 tests: `SmartGuessKeywordTests`, `CaptureScreenIDTests.everyScreenIDIsUnique`/`.contextScreenHasAnID`, `FieldCompanionPresentationTests` extended | 2, 1, 1 |
| plan §2 gates + device pass + no flag + rollback = prior build | 6 |
| Brief's Task 0 pre-flight against merged Wave 1 | 0 |
| Ruling 2026-08-24: no confidence floor | 2 (`SmartGuessConfidence` deleted, `Specimen+Accessors.swift` untouched) |
| Ruling 2026-08-24: `viewfinderSelectable` is a literal, not a filter | 1 |

**Not covered here, deliberately, with the reason:**
- **Flow 6 fix 2 — the Library provenance chip** (`products.capture_source` read by the portal). Plan §1.4 assigns it to **Wave 1P package 4-12**; it is portal work, and §2 states wave 2 has "still no portal work."
- **§17.3's remaining seven "Inbox" strings** (`S3DestinationScreen:77`, `S1AssignVenueScreen:306,:333`, `SiteScanSetupScreen:154`, `SettingsScreen:34`, `S4SavedTerminalScreen:170`, `LocalCaptureSyncService:38`). §17.3 makes them "an explicit wave-3 line item, not a footnote."
- **§17.4's nine-file ESCALATE copy pass.** The spec calls it "a brand-voice pass with Kody as a wave line item" — a session with a person, not an engineering step. Carried in Task 6's report as owed.
- **`README.md:1`'s "camera-first" opening.** FC-R1 ruled Today is home; §7.1 and §5.3 put that in wave 3. Rewriting the README's premise before the app matches it would be a new false claim.

**Placeholder scan.** No "TBD", no "similar to Task N", no "add appropriate error handling". Every code step carries the literal code. Two tasks (3, 4) have no unit test and say so, in place, with the C1/C3 reason — a deletion and a comment are not unit-testable in a target the gate cannot exercise, and pretending otherwise would be the kind of green signal `patina-verification` exists to catch.

**Type consistency.** Names used identically in every task: `CaptureFeatureFlags` / `.isEnabled(_:)` / `.allOff` (T1 → T1 Step 7 → report), `CameraMode.viewfinderSelectable` — a literal `[.photo, .tag, .measure, .scan]`, not a filter (T1 → T1 Step 6 → T6 device step 3), `CaptureScreenID.f1Context` / `.sweepSuffix` (T1 → T4 → T5), `SmartGuessKeywords.category(forVisionLabel:)` / `.table` (T2), `SmartGuess.fieldsWorthRecording` (T2), `Specimen.hasUnconfirmedGuess` — untouched, provenance-only throughout (T2 → T6's acceptance table), `CaptureCoordinator.siteScanContextRequested` (T1 → T5 Step 3), `AppContainer.smartGuess` / `.featureFlags` (T1 → T2 Step 5). `SmartGuessConfidence` and `Specimen.confidence(for:)` do not appear anywhere — ruling 2026-08-24 deleted the confidence floor before this plan was executed, so there was never a name to keep consistent.

**Ruling resolves the confidence-floor question the earlier draft flagged.** An earlier draft of this plan noted that plan §2's acceptance line — *"`hasUnconfirmedGuess` is false for a confidently classified photo"* — could not be literally true under the provenance-only `hasUnconfirmedGuess` `main` ships today, and proposed making it confidence-aware to reconcile the two. Kody's ruling (2026-08-24) took the other branch: leave `hasUnconfirmedGuess` alone, and reword the acceptance criterion instead (Task 6's report template above). Subtraction alone — an unplaceable label writes nothing — already delivers what the wave needs: nothing is asked of her that the app never guessed. No number ships in wave 2 to get wrong or to re-tune.

# D5 — Reusable Substrate in Patina (Client App) & Shared iOS Code

Scope: `apps/mobile/Patina` (client app, 364 Swift files) and everything under
`apps/mobile` that either app links. Read-only research; no files modified
outside this report.

All paths below are relative to `/Users/kody/Code/patina-merged` unless
given in full.

---

## 1. Is there ANY code shared between Patina and Patina Field today?

**Yes — one real shared package, plus a shared wire-format spec that each app
implements independently (not shared code), plus a design *pattern* (not
code) that was ported by hand.**

### 1a. `PatinaDesignKit` — a genuine shared Swift package (compiled, linked by both apps)

- Location: `apps/mobile/PatinaDesignKit/` (own `Package.swift`, tracked in
  git — `git ls-files` confirms, not a build artifact).
- Listed as a member of the shared workspace:
  `apps/mobile/Mobile.xcworkspace/contents.xcworkspacedata` references three
  projects: `Capture/Capture.xcodeproj`, `Patina/Patina.xcodeproj`, and
  `PatinaDesignKit` (the package itself).
- `apps/mobile/PatinaDesignKit/Package.swift` header comment states its
  purpose explicitly: *"Consumed by BOTH iOS apps: Patina (client) links it
  directly from Patina.xcodeproj; Patina Field links it into the Capture app
  target and the embedded CaptureKit framework via
  scripts/generate_project.rb."* Library product type is `.dynamic`
  deliberately, to avoid duplicate-symbol issues from being linked into two
  targets in the Capture side (app + CaptureKit framework).
- Confirmed wiring: `apps/mobile/Capture/Capture.xcodeproj/project.pbxproj`
  references `PatinaDesignKit` 15×; `apps/mobile/Patina/Patina.xcodeproj/project.pbxproj`
  references it 10×. `apps/mobile/Capture/scripts/generate_project.rb:192-232`
  wires `relative_path: '../PatinaDesignKit', product: 'PatinaDesignKit'`
  into both the Capture app target and the CaptureKit framework target.
- Platform floor is deliberately pinned to iOS 17.6 in `Package.swift`
  because that's Patina's `IPHONEOS_DEPLOYMENT_TARGET` (Capture's generator
  pins 18.0; the package floor must be ≤ both consumers).
- Contents (`apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/`):
  - `Tokens/`: `PatinaColors.swift`, `PatinaTypography.swift`,
    `PatinaSpacing.swift`, `PatinaShadows.swift`, `PatinaGradients.swift`,
    `TimeOfDay.swift`, `PatinaCompanionMotion.swift`.
  - `Components/`: `PatinaButton.swift`, `PatinaCard.swift`,
    `PatinaTextField.swift`, `PatinaAsyncImage.swift`, `PatinaEmptyState.swift`,
    `PatinaSheetHeader.swift`, `PatinaStatusBadge.swift`, `MatchPill.swift`,
    `FilterChip.swift`, `MonoLabel.swift`, `ClayBackground.swift`,
    `StrataMarkView.swift`.
  - `Support/`: `HapticManager.swift`, `PatinaFonts.swift`.
  - `Resources/Fonts/`: DM Mono, Inter, Playfair Display TTFs (both apps'
    bundled fonts are the same physical files, vendored once here).
  - Package rule stated in the `Package.swift` header comment: *"SwiftUI/UIKit/CoreText
    ONLY. Never import Supabase, PostHog, or any other SDK here — this package
    must stay a pure design layer."*
- Git history of the package (`git log --oneline -- apps/mobile/PatinaDesignKit`):
  `6a62d3fa1 feat(ios): create PatinaDesignKit shared Swift package (R27 Wave 0)`
  → `2a9ef02db feat(ios): adopt PatinaDesignKit in the Patina app` →
  `f897983bc fix(ios): extract StudioIdentityLine to its own file, tokenize
  monogram font` → `b7c7b557b feat(ios): add Field companion foundations` →
  `8f8bb0a70 fix(ios): refine companion scan and sync behavior`.
- **How Patina consumes it without hundreds of `import` lines**: a single
  re-export shim, `apps/mobile/Patina/Patina/Design/DesignKitReexport.swift`:
  ```swift
  // R27 Wave 0: the design tokens + portable components moved to the shared
  // local package `apps/mobile/PatinaDesignKit` (consumed by both iOS apps).
  // Re-exporting the module here keeps every existing call site compiling
  // without adding `import PatinaDesignKit` to hundreds of files.
  @_exported import PatinaDesignKit
  ```
  Confirmed no local re-definitions remain: `grep` for
  `struct/enum PatinaColors` or `PatinaTypography` inside
  `apps/mobile/Patina/Patina` returns nothing — the migration is complete on
  the Patina side, not a partial/duplicated fork.
- **Usage is genuinely live in both apps** — `StrataMarkView`/`PatinaColors`
  used across Patina (`Design/Animations/BreathingAnimation.swift:100`,
  `Features/DesignServices/MatchIntroductionView.swift:155`,
  `Features/Authentication/Views/AuthenticationView.swift:101`, etc.) and
  `PatinaCompanionMotion`/`StrataMarkView` were extended specifically to
  support Field's own Companion surface (§1b).
- **Notable asymmetry**: `HapticManager` (in `PatinaDesignKit/Support/`) is
  used pervasively throughout Patina (18+ call sites: `App/Coordinators/AppCoordinator.swift`,
  `Design/Gestures/*.swift`, `Features/QRAuth/Services/QRAuthService.swift`,
  `Features/ARPlacement/Services/ARPlacementManager.swift`, etc.) but **zero**
  call sites in Capture (`grep -rln "HapticManager" apps/mobile/Capture` →
  empty). Capture instead has its own
  `apps/mobile/Capture/Capture/Features/Capture/CaptureHaptics.swift` calling
  `UIImpactFeedbackGenerator` directly. So the package is linked by both apps
  but not uniformly *adopted* — Field still owns its own haptics wrapper even
  though the shared one is one import away.

### 1b. `FieldCompanionHearthView` — a hand-ported pattern, not shared code

Commit `b7c7b557b feat(ios): add Field companion foundations` (2026-07-29)
explicitly ported Patina's "Companion Hearth" presentation contracts into
Field as new, separate Field-side types, while extending the *shared*
package to carry the common motion tokens:
- New Field-only files: `apps/mobile/Capture/CaptureKit/CaptureKit/Companion/FieldCompanionController.swift`,
  `.../Companion/FieldCompanionPresentation.swift`,
  `apps/mobile/Capture/Capture/Features/Companion/FieldCompanionHearthView.swift`,
  `apps/mobile/Capture/CaptureTests/FieldCompanionPresentationTests.swift`.
- Shared-package additions in the same commit: `PatinaCompanionMotion.swift`
  (new, +36 lines) and an extension to `StrataMarkView.swift` (+50/-4) to
  make its accessibility role host-configurable — i.e., the motion timing
  and the Strata mark itself moved into the shared layer, but the
  presentation state machine (hidden/collapsed/progress/expanded) and the
  Hearth view itself are **independent Field-side implementations**, not
  imports of Patina's `Features/Companion/*`.
- Field's `AppContainer` (`apps/mobile/Capture/Capture/App/Composition/AppContainer.swift:35-38`)
  instantiates its own `FieldCompanionController(initialPresentation: .hidden(reason: .cameraActive), defaultHint: "Next steps")`
  — a parallel, not shared, object graph from Patina's `CompanionViewModel`/`AppCoordinator.isCompanionExpanded`.
- Follow-on commits `4844290b0 feat(ios): connect Field companion
  throughline` and `f90d4013a merge(ios): preserve Field companion
  continuity` (both 2026-07-29) wired this into Capture's `RootView` and
  `WorkDashboardScreen` — entirely inside the Capture app tree.

**Conclusion for Q1**: real, compiled, cross-app code sharing exists (the
design-token/component layer). Behavioral/business logic (scan pipeline,
sync, auth, companion state machine, messaging, DI) is **not** shared code
today — where the two apps converge (Companion Hearth, scan bundle format)
they do it via a shared *spec* or a hand-ported *pattern*, each app owning
its own Swift types.

### 1c. Shared spec, independently implemented: the scan bundle wire format

- `docs/design/field-capture/capture-bundle-spec-v1.md` and
  `scripts/validate_capture_bundle.py` are the actual shared contract (not
  Swift code) between Patina's on-disk bundle and Field's.
- `apps/mobile/Patina/Patina/Features/Walk/Models/ScanManifest.swift:1-70`
  documents this directly: `scanBundleSchemaVersion = 3`; the doc comment
  states Field's `FieldScanManifest`
  (`apps/mobile/Capture/CaptureKit/CaptureKit/SiteScan/FieldScanManifest.swift`)
  "documents itself as a strict SUPERSET of this type" — same
  `schemaVersion = 3`, with Field adding an `instrument` layer
  (`session`, `anchors`, `scorecard`, `poseGraphSummary`, `unverified`,
  `checksumAlgorithm`, `bundleSpecVersion`) that Patina's type also carries
  as seven **Optional** fields so a client bundle can hold a Field-produced
  manifest without loss, and (per `ScanManifest+Instrument.swift`) so a
  client scan can now populate them itself at SEAL.
  `validate_capture_bundle.py §10.2` requires all seven in
  `REQUIRED_TOP_LEVEL_KEYS` — a client scan omitting them is rejected with a
  non-retryable `SCHEMA_VIOLATION`.
- This is a deliberate, well-documented convergence of *format*, achieved by
  **two independent Codable types** (Patina's `ScanManifest` uses `UUID`/`Date`
  for inherited keys and `String` for the instrument-layer's own fields;
  Field's uses `String` throughout) kept in sync by the spec doc + validator
  script, not by a shared Swift module. There is no `import CaptureKit` in
  Patina or vice versa for this type.

### 1d. Symlinks / copied files

- `find apps/mobile -type l` (excluding build artifacts) finds exactly one
  symlink in the whole tree: `apps/mobile/Patina/.claude/agents/reviewer.md`
  — an agent-tooling file, unrelated to app code.
- No other copy-paste-shared Swift files were found between the two app
  trees (Capture's uploader, QR flow, and voice-note service are
  independent implementations — see §2).

---

## 2. Inventory of portable capabilities in Patina

Legend for recommendation: **Share** = extract into a shared package
(PatinaDesignKit or a new one) so both apps import one implementation;
**Port** = re-implement in Field's own idiom (protocol+DI), following
Patina's logic/lessons but not literally sharing the file; **N/A** = nothing
to port (capability doesn't exist in Patina).

### 2.1 ScanManifest v3 + ScanBundleWriter

- Files: `apps/mobile/Patina/Patina/Features/Walk/Models/ScanManifest.swift`
  (main type + extensive doc comments), `ScanManifest+Instrument.swift`,
  `apps/mobile/Patina/Patina/Features/Walk/Services/ScanBundleWriter.swift`
  (499 lines) + `ScanBundleWriter+Reading.swift` (42 lines).
- What it does: on-disk bundle owner under
  `Application Support/Scans/{scanId}/` — writes `manifest.json`, accepts
  artifact files from exporters (`SceneMeshExporter`, `WorldMapExporter`,
  `PosedPhotoService`), appends photo records as they arrive, finalizes by
  recomputing sizes and (optionally) sha256s. `@MainActor`, singleton-per-scan
  (constructed per `scanId`, not a global singleton).
- Dependencies: `Foundation`, `CryptoKit`, `UIKit`, `os.log`. No Supabase, no
  SwiftData directly (persistence of the *reference* to a bundle is a
  separate `RoomScanPackage` SwiftData model in `Core/Models/RoomScanPackage.swift`).
- Already a documented cross-app superset relationship (§1c) — Field's
  `FieldScanManifest` is independently implemented but wire-compatible.
- **Recommendation**: **Share the manifest schema types** (or at minimum the
  `ArtifactKind` enum and the 7 instrument-layer keys) by extracting a
  `PatinaScanBundleKit` package analogous to `PatinaDesignKit` — this would
  retire the "two Codable types kept in sync by spec doc + validator script"
  pattern and remove an entire class of drift risk the code's own comments
  flag as deliberate but fragile. `ScanBundleWriter` itself is app-specific
  enough (Application Support paths, `RoomScanPackage` SwiftData ties) that
  it should stay **Port**, not Share. Effort: **L** (the manifest doc
  comments show this asymmetry was already reasoned through once; a shared
  module means resolving the UUID/Date-vs-String type divergence the doc
  explains is currently load-bearing on Patina's side via
  `RoomScanPackage.scanId`/`createdAt` SwiftData predicates).

### 2.2 BackgroundScanUploader (x-metadata sha256 lesson)

- File: `apps/mobile/Patina/Patina/Services/Sync/BackgroundScanUploader.swift`
  (495 lines) + `BackgroundScanUploader+Integrity.swift` (79 lines).
- What it does / the lesson (from the file's own doc comment,
  lines 1-31): background `URLSession` uploader for large scan artifacts.
  POSTs to `<supabaseUrl>/storage/v1/object/room-scans/<path>` with the
  custom object metadata carried in a **base64(JSON) `x-metadata` request
  header** — documented as "the channel Storage actually persists into
  `user_metadata` for a raw-body upload. Raw `x-amz-meta-*` headers are
  dropped (land in `user_metadata = {}`), which silently broke every ≥5 MB
  artifact's integrity check." Also: `URLSessionConfiguration.background` for
  resume-safe transfer, ~2 Hz progress throttling, 408/429/5xx → exponential
  backoff (max 3 attempts), post-2xx sha256 verification by GETting
  `storage/v1/object/info/authenticated/...` and reading `metadata.sha256`.
- Dependencies: `Foundation`, `OSLog`, `Supabase`.
- **This exact lesson has already been independently re-learned/re-applied
  in Field**, not shared: `apps/mobile/Capture/Capture/Features/SiteScan/FieldBackgroundScanUploader.swift`
  (344 lines) also reads/writes the `x-metadata` header (confirmed:
  `grep -n "x-metadata"` hits at lines 18, 171, 178, 218 of that file) and
  documents the same "PUT against a missing object 400s" nuance. The two
  uploaders are **separately written, similar-sized (495 vs 344 lines)
  implementations of the same lesson** — not a shared file.
- **Recommendation**: **Share.** This is the single highest-value
  candidate in the whole inventory: identical Supabase Storage API
  quirk, identical retry/backoff shape, identical integrity-check
  approach, independently implemented twice already (proof the lesson is
  real and durable) but with real drift risk (two 400+-line files that
  must be kept in sync by hand whenever Supabase Storage's metadata
  behavior needs another workaround). Effort: **M** — the artifact-path
  and descriptor shapes differ per app (`room-scans` bucket vs Field's
  `capture-media/<uid>/<clientToken>/`), so extraction needs a small
  descriptor abstraction, but the uploader's control flow is otherwise
  app-agnostic.

### 2.3 RoomScanSyncService

- Files: `apps/mobile/Patina/Patina/Services/Sync/RoomScanSyncService.swift`
  (963 lines) + `RoomScanSyncService+AdvancedBundle.swift` (1001 lines, so
  ~2000 lines total) + `ScanSyncQueue.swift`, `ArtifactUploader.swift`,
  `ArtifactUploader+UploadPlan.swift`, `ScanUploadShadowLeg.swift`,
  `UploadDiagnosticsLog.swift`, `ScanBucketMime.swift`,
  `MediaUploadIntentClient.swift`, `Models/RoomScanSyncDTOs.swift`,
  `Models/RoomScanV2DTOs.swift`, `Models/RoomScanRPCParams.swift`.
- What it does: `@MainActor` singleton (`RoomScanSyncService.shared`),
  `configure(modelContext:)`-injected with the app's SwiftData
  `ModelContext` (wired in `PatinaApp.swift` init). Drives per-artifact
  uploads from a `ScanManifest`, talks to Supabase RPCs for commit, tracks
  a "shadow leg" of parallel upload paths.
- Dependencies: SwiftData (`ModelContext`), Supabase RPCs, `BackgroundScanUploader`.
- **Recommendation**: **Port**, not share, as a monolithic file — at ~2000
  lines it's deeply entangled with Patina's specific RPC names/DTOs and
  singleton-configure lifecycle. But its *shape* (manifest → per-artifact
  upload plan → shadow-leg comparison → commit RPC) is a good reference
  design for any Field-side equivalent that needs the same robustness.
  Effort: **L** to extract anything reusable; **S** to just read it as a
  design reference during a Field build.

### 2.4 ScanRecoveryService / ScanDiskBudget

- Files: `apps/mobile/Patina/Patina/Core/Persistence/ScanRecoveryService.swift`
  (444 lines), `Core/Persistence/ScanDiskBudget.swift` (221 lines).
- What they do:
  - `ScanRecoveryService`: runs at launch, scans SwiftData for
    `RoomScanPackage` rows that never reached synced state, classifies each
    against what's actually on disk, returns recovery candidates. The file's
    own header states **"THE ONE RULE"**: it may only delete bytes it has
    proven are not the user's (orphaned row with no on-disk dir, or a
    zero-byte dir) — everything else is a capture the user walked and it
    stays. A manifest that fails to decode is explicitly **NOT** treated as
    proof; such bundles are **quarantined** (`.quarantined` status on
    `RoomScanPackage`), kept on disk, marked, logged, excluded from
    pipelines — never deleted.
  - `ScanDiskBudget`: enforces a disk-space ceiling for locally-stored scan
    bundles, evicts oldest fully-synced bundles first, never touches
    unsynced packages, exempt packages, or the in-progress scan; also
    exposes a preflight-space check.
- **⚠ Correction to prior project memory**: `MEMORY.md`'s iOS section
  states *"ScanRecoveryService deletes bundle+row on decode failure"* as a
  live trap. Reading the current file shows this was **fixed** — the doc
  comment (lines 10-30) explicitly narrates the bug ("Before it, the
  `catch` around the manifest decode deleted bundle + row, and the decoder
  it used was a bare `JSONDecoder()` while `ScanBundleWriter` writes
  `dateEncodingStrategy = .iso8601` — so `createdAt` mismatched on EVERY
  real manifest") and the correction ("the read now goes through the
  writer's own `ScanBundleWriter.readManifest`... a failed read no longer
  destroys anything"). Any Field work relying on that memory line should
  treat it as **stale** — verify against this file's current state, not the
  memory note.
- Dependencies: `Foundation`, `SwiftData`, `os`.
- **Recommendation**: **Port.** The *policy* ("proof-of-not-the-user's
  before delete", "decode failure ≠ proof", "quarantine don't destroy",
  "budget evicts synced-oldest-first, never touches unsynced/exempt/active")
  is exactly the kind of hard-won correctness lesson a Field-side scan
  cache (if one grows disk-budget needs) should copy — but the
  implementation is tied to `RoomScanPackage`/SwiftData predicates specific
  to Patina. Effort: **S–M** to port the policy to a Field-specific type if
  Field ever needs local disk-budget management for its own captures.

### 2.5 StyleConversation — does it have voice input / speech?

- Files: `apps/mobile/Patina/Patina/Features/StyleConversation/` (12 files:
  `StyleConversationViewModel.swift`, `ContemplativePauseView.swift`,
  `VisualResonanceView.swift`, `InvestmentPerspectiveView.swift`,
  `MaterialConnectionView.swift`, `StyleConversationContainerView.swift`,
  `LifestyleRealityView.swift`, `PriorityView.swift`, plus
  `Shared/Components/*`).
- **No voice input.** A repo-wide grep for `import Speech`,
  `SFSpeechRecognizer`, `SFSpeechRecognitionTask`, or `AVAudioRecorder`
  inside `apps/mobile/Patina` returns **zero matches** anywhere in the app,
  tests, or UI tests. `StyleConversation` is a text/tap-driven quiz-like
  flow (pills, swatches, continue buttons) — no audio capture code exists.
- **Recommendation**: **N/A** to port from Patina — there's nothing there.
  See §2.8 for where Patina's *speech-recognition intent* actually lives
  (declared but unbuilt), and note that Field already has a working
  implementation Patina could learn from in the other direction (§2.8).

### 2.6 WhisperState / WhisperBarView — what "whisper" means here

- Files: `apps/mobile/Patina/Patina/Features/RoomScan/Shared/Models/WhisperState.swift`,
  `Features/RoomScan/Shared/Components/WhisperBarView.swift`.
- **"Whisper" is not voice/audio at all.** Per the file headers: *"Progress-driven
  state for the Whisper Bar (Quiet Conversation PRD §4.2). Maps scan progress
  to evolving guide text, sub-text, and haptic cues."* `WhisperBarView` is
  *"The Quiet Conversation's signature UI element — a single-line italic
  guide bar that sits anchored to the bottom of the scan view. Replaces
  progress ribbons, coaching overlays, percentage indicators, and state
  labels with one warm sentence in Playfair Display italic."* `WhisperState`
  is a pure `Equatable` struct (progress float → text/subtext/haptic/band),
  no audio, no Speech framework — it's an ambient on-screen coaching-copy
  system for the room-scan flow, driven by `CompanionPresentationState`
  (shared with the Companion Hearth's `.progress` case, per
  `WhisperBarView.swift` importing `CompanionPresentationState`).
- **Recommendation**: **Share the pattern, not necessarily the code.** If
  Field wants ambient progress-driven coaching text during a site scan
  (distinct from its existing coach/QA scorecard system per prior project
  memory), `WhisperState`'s band/threshold model is a clean, small,
  dependency-free reference (`Foundation` only) worth copying almost
  verbatim. Effort: **S**.

### 2.7 Messaging (ThreadDetailView)

- Files: `apps/mobile/Patina/Patina/Features/Messaging/CommsDates.swift`,
  `ViewModels/MessagingViewModel.swift`, `Views/ThreadDetailView.swift`,
  `Views/ThreadListView.swift`, `Services/MessagingRealtimeService.swift`.
- What it does: `MessagingRealtimeService` subscribes to Supabase Realtime
  postgres-changes on `public.comms_messages` filtered by `thread_id`,
  yielding `RemoteCommsMessage` rows into an `AsyncStream`; RLS gates row
  visibility so no client-side participant check is needed. One instance per
  open `ThreadDetailView`.
- Dependencies: `Foundation`, `Supabase` (`SupabaseClientManager.shared.client`
  by default, injectable).
- **Recommendation**: **Port** (or **Share** if Field's own messaging need
  is literally the same `comms_messages` table/thread model — worth
  confirming against Field Coordination's SMS conversations, which per
  project memory are a *separate* system (Twilio 10DLC + `project_parties`),
  not this one). If Field needs to read/write the same `comms_messages`
  threads a designer sees in the portal, this realtime subscription pattern
  (constructor-injectable client, lock-guarded channel teardown) is directly
  reusable logic. Effort: **S** to port the pattern; **M** if genuinely
  sharing the same Supabase table across apps introduces RLS/schema
  questions requiring backend involvement.

### 2.8 QRAuth

- Files: `apps/mobile/Patina/Patina/Features/QRAuth/` (8 files:
  `QRApprovalViewModel.swift`, `QRScannerViewModel.swift`,
  `DevicePairModels.swift`, `QRAuthModels.swift`, `QRScannerView.swift`,
  `QRApprovalView.swift`, `QRAuthService.swift`, `BiometricService.swift`).
- What it does: `QRAuthService.shared` (singleton, `@Observable`,
  `@MainActor`) handles QR parsing, biometric confirmation via
  `BiometricService.shared`, and server verification against
  `AuthService.shared`. Per `MEMORY.md`, Field QR login is a *separate*
  server-side flow ("Field QR login ONLY via Account → Connect Patina
  Field") and Capture has its **own independent implementation**:
  `apps/mobile/Capture/Capture/Features/QRApprove/` (`QRApproveScreen.swift`,
  `QRApproveServiceFactory.swift`, `QRApproveScreens.swift`,
  `QRScanScreen.swift`) using Field's factory/protocol DI pattern, not
  Patina's singleton.
- Dependencies: `Foundation`, `UIKit`, `Supabase`.
- **Recommendation**: **N/A to port as code** — Field already solved this
  independently in its own idiom, and the two flows serve different
  directions (Patina scans a portal-shown QR to approve web sign-in; Field's
  `field://login` deep-link flow is a different mechanism per project
  memory). Worth a design-language pass only (shared visual chrome via
  PatinaDesignKit), not a logic port. Effort: **N/A**.

### 2.9 DesignRequest flow

- Files: `apps/mobile/Patina/Patina/Services/DesignServices/DesignRequestCoordinator.swift`,
  `Core/Models/DesignRequestDraft.swift`, `Core/Models/SubmittedDesignRequest.swift`,
  `Features/DesignServices/DesignRequestFlowView.swift` (+`+Steps.swift`),
  `Features/DesignServices/DesignRequestStatusView.swift`/`StatusCard.swift`/`ResumeBanner.swift`,
  `Features/DesignServices/ScanPickerView.swift`, plus the "Match Ceremony"
  UI (`MatchIntroductionView.swift`, `MatchBookedHero.swift`, etc.).
- What it does (from `DesignRequestCoordinator.swift`'s header): owns the
  design-request draft lifecycle and the **explicit, user-initiated
  upload→submit sequence** — "the ONLY place scan bytes leave the phone for
  a design request", and the atomic `submit_design_request` RPC "only ever
  fires from `send()` (a user tap) — never automatically, even on resume."
  `DesignRequestDraft` is a SwiftData row (invariant: at most one active
  draft at a time; a resume-or-discard prompt guards a second). Per project
  memory, this pairs with the designer-side `submit_design_request`/
  `claim_design_request` pipeline (00285–00288) surfaced on Desk.
- Dependencies: `Foundation`, `Observation`, `SwiftData`.
- **Recommendation**: **Port the pattern, not the code.** The
  consent-gated, resumable, atomic-RPC-at-the-end pattern (draft →
  sequential per-scan upload with explicit intent → single atomic commit
  RPC, never auto-fired) is exactly the shape a Field-side "submit this
  capture/request into the project flow" feature should copy — it directly
  answers the program's "lands in the right place with minimal friction and
  explicit control" goal. The SwiftData row type and RPC are Patina-specific
  (client submitting a request *to* a designer) whereas Field's field
  companion would be the designer/trades side, so no literal code reuse
  applies. Effort: **S** to read/copy the pattern; the target
  implementation is new work regardless.

### 2.10 Design tokens / theme / components (Hero design language)

Already covered fully in §1a (`PatinaDesignKit`) — this is the one capability
that's already **Shared** (not just recommended). Notable design-token file
worth flagging: `apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/TimeOfDay.swift`
and `PatinaGradients.swift` back Patina's "Hero" ambient/time-of-day theming
(`CompanionVoice.greeting(for:isReturning:)` branches on `TimeOfDay` — dawn/
morning/day/afternoon/etc.) — already available to Field for free via the
shared package, unused by Field today (no `TimeOfDay` hits under
`apps/mobile/Capture`).

### 2.11 Haptics

- `HapticManager` (in `PatinaDesignKit/Support/HapticManager.swift`) is
  already shared code, pervasively used in Patina, but **not adopted** by
  Field (§1a). **Recommendation**: **Share is already done** — the
  remaining work is a Field-side *adoption* pass swapping
  `CaptureHaptics.swift`'s direct `UIImpactFeedbackGenerator` calls for the
  shared manager, which is Field-side cleanup, not a Patina-substrate task.
  Effort: **S** (Field-side only).

### 2.12 PostHog wiring

- File: `apps/mobile/Patina/Patina/Services/Analytics/PostHogService.swift`
  (singleton, `PostHogService.shared.initialize()` called from
  `PatinaApp.swift`, skipped in UI-test mode). Companion analytics
  (`CompanionAnalytics.swift`), room-scan/"walk" analytics
  (`WalkAnalytics.swift`), dwell/interaction tracking
  (`DwellTracker.swift`, `InteractionTracker.swift`), and a daily-room batch
  queue also live in `Services/Analytics/`.
- **Recommendation**: **Port the pattern** (singleton init + skip-on-UI-test
  convention), not the code — Field has its own `CaptureAnalytics` protocol
  seam (per `AppContainer.swift`'s `analytics: any CaptureAnalytics`) which
  is architecturally different (protocol/DI vs. Patina's singleton) and
  already exists; no gap to fill here. Effort: **N/A**.

### 2.13 Offline/sync queue (SyncQueueItem)

- File: `apps/mobile/Patina/Patina/Services/Sync/SyncQueueItem.swift`
  (248 lines). `@Model` SwiftData class — persistent queue item for room
  scan uploads with `SyncQueueStatus` (pending/syncing/synced/failed) and
  `SyncOperationType` (roomScan/styleSignals/room/roomFeatures). Notably
  carries a **deprecated v1 field**: `usdzData: Data?` marked
  `@available(*, deprecated, message: "v1 USDZ-blob sync path. New scans use
  RoomScanPackage.bundlePath — see v2/v3 pipeline.")` — evidence of a live
  schema-migration history worth knowing about before copying this type
  verbatim.
- **Recommendation**: **Port the pattern** (persistent, restart-surviving
  outbox with typed status/operation enums) — Field's own outbox
  (`SiteRequestOutboxDrainer`, referenced in `AppContainer.swift`, and the
  App-Group-backed `CaptureStore` per prior project memory) is already a
  separate, App-Group-aware implementation; no direct code-sharing
  opportunity, but the status/retry vocabulary is a reasonable reference.
  Effort: **N/A** (already exists, separately, in Field).

### 2.14 Photo capture + thumbnails

- Relevant files: `Features/Walk/Services/PosedPhotoService.swift`,
  `Features/Walk/Services/RoomCaptureBundleAdapter.swift`,
  `Features/Walk/Models/ScanManifest.swift` (PhotoEntry type),
  `Services/Sharing/ScanSharingService.swift`, thumbnail data on
  `SyncQueueItem.thumbnailData`.
- **Recommendation**: **Port.** Tied closely to the RoomPlan/ARKit walk
  pipeline (§2.1), not separable as a standalone reusable unit without
  pulling in the whole `Features/Walk/` tree. Effort: **L** if attempting a
  literal extraction; treat as reference material instead.

### 2.15 AVAudioRecorder / Speech framework usage — cross-app comparison

- **Patina: none built**, despite the Info.plist *declaring* the intent
  (see §4) — `NSMicrophoneUsageDescription` = "Patina uses the microphone so
  you can speak with the Companion instead of typing" and
  `NSSpeechRecognitionUsageDescription` = "Patina uses speech recognition to
  turn your spoken requests into Companion conversations" are both present
  in `apps/mobile/Patina/Patina/Info.plist`, but zero Swift files import
  `Speech` or use `AVAudioRecorder`/`AVAudioEngine`. This is a
  **declared-but-unbuilt** capability — permission strings exist for a
  Companion voice-input feature that was never implemented (or was removed
  without cleaning up the plist).
- **Field: already built.** `apps/mobile/Capture/Capture/Services/Recognition/SpeechVoiceNoteService.swift`
  (113 lines) is a working `SFSpeechRecognizer` + `AVAudioEngine`
  implementation, conforming to a `VoiceNoteService` protocol defined in
  `apps/mobile/Capture/CaptureKit/CaptureKit/Recognition/RecognitionServices.swift`.
  Its own header comment: *"N4 — live, on-device voice transcription via
  SFSpeechRecognizer + AVAudioEngine. Speech/AVFoundation compile on the
  iphonesimulator SDK; mic capture is flaky there, so any thrown error
  (incl. simulator) flips the N4 sheet to its manual transcript-entry
  fallback. The raw audio file is always kept alongside the text."* Writes
  the raw audio file into the **App Group** media directory
  (`CaptureStore.mediaDirectory()`) when `mediaDirectory` is non-nil, else
  transcript-only. Paired UI: `apps/mobile/Capture/Capture/Features/Recognition/Voice/VoiceNoteSheet.swift`.
  Confirmed via `git log -S "NSSpeechRecognitionUsageDescription"` that the
  Patina pbxproj history search returned nothing informative — the plist
  strings' provenance wasn't traceable via this quick search; treat as an
  open question (§ Open Questions).
- **Recommendation for the program**: **inverted from the task's framing —
  Field is the donor here, not Patina.** If the program wants voice notes
  with transcription in Patina too (the program goal explicitly calls this
  out), the `VoiceNoteService` protocol + `SpeechVoiceNoteService`
  implementation in Field is the thing to extract into a shared package (or
  port into Patina fresh) — not the reverse. Patina's own plist strings
  suggest this was *intended* for the Companion conversation flow at some
  point but never shipped. Effort: **M** to extract `VoiceNoteService` +
  `SpeechVoiceNoteService` into a shared package (it currently depends only
  on `Foundation`, `AVFoundation`, `Speech`, and one `CaptureKit` import for
  the protocol itself, which would need to move too or be
  duplicated/genericized); **S** to just port a copy into Patina directly
  without extracting a shared module first.

---

## 3. Architectural divergences between the two apps

| Axis | Patina (client) | Patina Field (Capture) |
|---|---|---|
| **DI / composition root** | No composition root object. Feature services are `static let shared` singletons (`AuthService.shared`, `QRAuthService.shared`, `PostHogService.shared`, `RoomScanSyncService.shared`, `PersistenceController.shared`, `HapticManager.shared`) constructed lazily and referenced directly from view models. Navigation state lives in `AppCoordinator` (`@Observable`, `Coordinator` protocol, `App/Coordinators/`). | `AppContainer` (`apps/mobile/Capture/Capture/App/Composition/AppContainer.swift`) is an explicit `@Observable` composition root holding `any XService` existentials (`camera: any CameraService`, `sync: any CaptureSyncService`, `session: any SessionProviding`, `location: any LocationService`, `analytics: any CaptureAnalytics`, plus Phase-2 seams `projects`/`leads`/`decisions`/`messaging`/`receiving`/`portalAuth`/`siteScan`/`siteRequests`/`guestSiteRequests`). Branches on `AppConfiguration.runsRealServices`: all-mock (simulator default) wires `CaptureKitMocks` conformers; real mode calls each flow's own `<Flow>ServiceFactory.make(deps:)`. File is explicitly "FROZEN for the waves" per its own header comment. |
| **Testability implication** | Singletons are not swappable for tests without runtime flags baked into the singleton itself (e.g., `AppSettings.shared`, `PatinaApp.isUITesting`). | Every real service has a protocol + a mock conformer (`CaptureKitMocks` target exists solely for this), so tests/previews/simulator runs get full-app mock coverage "unchanged" (per `AppContainer.swift` header) regardless of feature work landing elsewhere. |
| **Persistence** | SwiftData via `PersistenceController.shared` (`Core/Persistence/PersistenceController.swift`) — private `init()`, `fatalError` on `ModelContainer` construction failure, **no App Group** (schema: `TableItemModel`, `RoomModel`, `SavedItem`, `StylePreferenceModel`, `SyncQueueItem`, `RoomScanPackage`, `DesignRequestDraft`, `SubmittedDesignRequest`). | SwiftData via `CaptureStore` (`apps/mobile/Capture/CaptureKit/CaptureKit/Persistence/CaptureStore.swift`) — **constructor-injected** (`public init(container: ModelContainer)`), lives in the **App Group container** (`group.cloud.patina.field`) "so the Share and Widget extensions read/write the same DB and the same on-disk media directory" (file header), and has a documented resilient-fallback path (`CaptureStore.resilient`, tries progressively degraded `ModelContainer` configs rather than a hard `fatalError`). |
| **Auth service** | `AuthService.shared` (`Features`-adjacent `Services/Auth/AuthService.swift`) — concrete `@Observable` singleton wrapping Supabase `Session`/`User` directly; `currentUserId`/`isAuthenticated` computed straight off `session`. | `SessionProviding` protocol (`apps/mobile/Capture/CaptureKit/CaptureKit/Session/SessionProviding.swift`) with `SupabaseSessionService` (`apps/mobile/Capture/Capture/Services/Session/SupabaseSessionService.swift`) as the real conformer — injected into `AppContainer`, mockable. Both ultimately wrap Supabase Auth (no NextAuth, per repo-wide convention), but the seam shape differs. |
| **Navigation** | Custom `Coordinator` protocol + `AppCoordinator` owning a `NavigationPath` mirrored by a parallel `screenStack: [AppRoute]` array (`App/Coordinators/AppCoordinator.swift`) — needed because `NavigationPath` is opaque and pops must restore `currentScreen` + companion context (documented as "R11"). Single `.sheet(item:)` driver replacing five booleans (documented as "PT-3-8/PT-0-5"). | `RootView` + a `ScreenRegistry` (`apps/mobile/Capture/Capture/App/Composition/ScreenRegistry.swift`) — a registry/factory pattern rather than a coordinator+mirrored-stack pattern (confirmed distinct file/pattern name; not examined line-by-line in this pass — flagged for a closer look if navigation code needs to be shared). |
| **Reactive framework** | `@Observable` (Observation framework) throughout — `AuthService`, `AppCoordinator`, `QRAuthService`, view models. | Also `@Observable` (`AppContainer`) — **not** a divergence; both apps are on the same (modern) reactive framework, which lowers the cost of any future service-sharing work. |
| **Design system adoption** | Fully migrated — zero local re-definitions of `PatinaColors`/`PatinaTypography` remain; single `@_exported import` shim. | Package is linked but only partially adopted (haptics not used — see §2.11); worth a Field-side audit of what else is linked-but-unused. |
| **Bundle IDs / product namespace** | `cloud.patina.app` (main), `com.middlewesetstudio.PatinaTests`/`PatinaUITests` (note: test bundle IDs carry a typo — "middlewesetstudio" not "middlewest" — harmless but real, `apps/mobile/Patina/Patina.xcodeproj/project.pbxproj:605,627`). | `cloud.patina.field` (main), `cloud.patina.field.tests`, `cloud.patina.field.capturekit`, `cloud.patina.field.capturekitmocks` — a proper sub-bundle-ID-per-module scheme reflecting the multi-target (app + framework + mocks + share extension + widgets) structure Patina doesn't have. |

**Net assessment**: the two apps share a modern SwiftUI/Observation
foundation and one real compiled package (design tokens), which makes
*visual* consistency cheap. But Patina has no formal DI seam at all — every
service is a directly-referenced singleton — while Field's entire app is
built around protocol-seamed, factory-injected, mock-first services. Porting
any *service-level* logic (not just view code) from Patina into a shared
package means either (a) accepting Patina's singleton shape wherever it's
reused, which fights Field's DI/testability model, or (b) refactoring the
extracted logic behind a protocol first — extra work not reflected in the
per-capability effort estimates above unless called out.

---

## 4. Info.plist permissions and entitlements

### 4.1 Patina (client app)

Two overlapping sources are both live (`GENERATE_INFOPLIST_FILE = YES` *and*
an explicit `INFOPLIST_FILE = Patina/Info.plist` — Xcode merges both; where a
key appears in both, this is worth resolving before trusting either as
authoritative documentation of what ships).

- **`apps/mobile/Patina/Patina/Info.plist`** (the file):
  - `NSFaceIDUsageDescription` = "Patina uses Face ID to securely confirm
    sign-in requests from the web"
  - `NSCameraUsageDescription` = "Patina uses the camera to scan QR codes
    for secure sign-in and to capture your rooms"
  - `NSMicrophoneUsageDescription` = "Patina uses the microphone so you can
    speak with the Companion instead of typing"
  - `NSSpeechRecognitionUsageDescription` = "Patina uses speech recognition
    to turn your spoken requests into Companion conversations"
  - `NSPhotoLibraryAddUsageDescription` = "Patina saves AR previews and room
    captures to your photo library when you ask"
  - `CFBundleURLTypes` — custom URL scheme `patina` (`com.patina.app` type
    name)
- **`INFOPLIST_KEY_*` build settings** (`Patina.xcodeproj/project.pbxproj`,
  found via `grep -o 'INFOPLIST_KEY_...Usage...Description'`):
  - `NSCameraUsageDescription` = "Patina uses your camera to walk through
    your space together and visualize furniture in your room." **(different
    text than the plist file's camera string above — a real duplicate/conflict, not just redundancy)**
  - `NSMicrophoneUsageDescription` = "Have a voice conversation with Patina
    about your space and style." **(different text than the plist file's mic string)**
  - `NSMotionUsageDescription` = "Patina uses motion data to detect when
    your device is steady for capturing the best room photos." (not present
    in the plist file at all — build-setting-only key)
  - `NSPhotoLibraryUsageDescription` = "Save room designs and furniture
    visualizations to your photo library." (note: this is the *read*
    permission key, distinct from the plist file's `NSPhotoLibraryAddUsageDescription`
    *add-only* key — both exist, asking for different privilege levels)
  - `NSSpeechRecognitionUsageDescription` = "Speak naturally with Patina
    instead of typing." **(different text than the plist file's speech string)**
- **Entitlements** (`apps/mobile/Patina/Patina/Patina.entitlements`):
  - `aps-environment` = `development` (push notifications)
  - `com.apple.developer.applesignin` = `["Default"]`
  - **No App Group entitlement.** No `com.apple.security.application-groups` key at all.
  - No `com.apple.developer.associated-domains` (Field has one; Patina doesn't).
- **No `UIBackgroundModes`** found in either the plist file or the pbxproj
  for Patina (searched both; zero hits). Not necessarily a bug —
  `URLSessionConfiguration.background` transfers don't require a
  `UIBackgroundModes` entry — but worth knowing before assuming background
  scan upload has any special background-mode privilege declared.

### 4.2 Patina Field (Capture)

- **`INFOPLIST_KEY_*` build settings** (`Capture.xcodeproj/project.pbxproj`):
  - `NSCameraUsageDescription` = "Patina Field uses the camera to
    photograph products and read their labels, barcodes, and dimensions."
  - `NSFaceIDUsageDescription` = "Unlock Patina Field with Face ID."
  - `NSLocationWhenInUseUsageDescription` = "Stamps each capture with the
    venue where you found it." **(Patina has no location permission at all — a real capability gap for any field-companion work needing venue/site geotagging in the client app.)**
  - `NSMicrophoneUsageDescription` = "Used to record a quick voice note
    about a piece."
  - `NSMotionUsageDescription` = "Shows a level guide for square, steady
    captures."
  - `NSPhotoLibraryAddUsageDescription` = "Saves captures to your photo
    library."
  - `NSPhotoLibraryUsageDescription` = "Import existing photos into a
    capture when the camera is unavailable."
  - `NSSpeechRecognitionUsageDescription` = "Transcribes your voice notes
    on-device."
- **Entitlements** (`apps/mobile/Capture/Capture/Capture.entitlements`):
  - `com.apple.security.application-groups` = `["group.cloud.patina.field"]`
    — **the App Group Patina does not have.**
  - `com.apple.developer.applesignin` = `["Default"]`
  - `com.apple.developer.associated-domains` = `["applinks:client.patina.cloud"]`
    — universal-links into the **client** portal domain from the Field app
    (worth noting: this points at `client.patina.cloud`, i.e. Field already
    has an associated-domain hook toward the client-facing side).
- No `UIBackgroundModes` found for Capture either (searched both plist and
  pbxproj; zero hits) — consistent with Patina, and consistent with
  background `URLSession` not requiring the key.

### 4.3 Cross-app permission comparison (summary)

| Permission | Patina | Field |
|---|---|---|
| Camera | ✅ (two conflicting description strings — see 4.1) | ✅ |
| Microphone | ✅ (declared, unbuilt — §2.15) | ✅ (built) |
| Speech recognition | ✅ (declared, unbuilt — §2.15) | ✅ (built) |
| Motion | ✅ | ✅ |
| Photo library (read) | ✅ (build-setting only) | ✅ |
| Photo library (add) | ✅ (plist file) | ✅ |
| Face ID | ✅ (plist file only, no INFOPLIST_KEY mirror) | ✅ |
| Location (when-in-use) | ❌ none | ✅ |
| App Group | ❌ none | ✅ `group.cloud.patina.field` |
| Associated domains | ❌ none | ✅ `applinks:client.patina.cloud` |
| Push (`aps-environment`) | ✅ `development` | ❌ not present in `Capture.entitlements` (confirmed absent, not just unsearched) |

**Implication for the program**: because Patina has no App Group today, any
field-companion capability that wants to share on-disk media or a SwiftData
store with Patina Field (the way Field's Share/Widget extensions already do
with the main Field app) would need Patina to adopt an App Group first — a
prerequisite not yet in place, and not something this read-only pass can
assess the cost of (provisioning-profile / entitlement-request work,
out of scope for a code inventory).

---

## Summary for the orchestrator

- **Real shared code exists**: `PatinaDesignKit` (tokens, components, fonts,
  haptics) is a genuine compiled Swift package linked by both apps via the
  shared `Mobile.xcworkspace`, fully adopted on Patina's side, partially
  adopted on Field's side (haptics not picked up despite being linked).
- **Everything else that "looks shared" isn't code-shared**: the scan
  bundle format (v3/superset), the Companion Hearth presentation contract,
  and the x-metadata sha256 upload lesson are each independently
  implemented twice, kept aligned by a spec doc, a hand-port commit, or
  convergent-but-separate engineering — not by one shared module.
- **Best concrete extraction candidates**, ranked by value/effort: (1)
  `BackgroundScanUploader`'s x-metadata sha256 pattern (M, already proven
  twice, currently drifting-risk duplicated code); (2) `ScanManifest`'s
  wire-format types (L, already documented as a deliberate superset
  relationship, would retire the spec-doc-as-source-of-truth pattern); (3)
  `WhisperState`'s progress-band model (S, small, dependency-free).
  `VoiceNoteService`/`SpeechVoiceNoteService` is the standout in the
  **opposite direction** — Field has it built, Patina has only declared
  intent (unused Info.plist strings) — so if the program wants voice notes
  in Patina too, Field is the donor.
- **Architecture divergence is real and non-trivial**: Patina has zero
  formal DI (concrete `.shared` singletons everywhere); Field is built
  entirely around protocol-seamed, mock-first, factory-injected services.
  Any service-logic sharing (not just design-layer sharing) has to cross
  this seam, which is real work not captured in a naive "just extract the
  file" effort estimate.
- **Permissions/entitlements**: Patina has no App Group, no location
  permission, and no associated domains — all present in Field. Patina's
  own Info.plist has an internal duplicate/conflict (camera, microphone,
  speech-recognition, and Face ID all differently described between the
  checked-in `Info.plist` file and the `INFOPLIST_KEY_*` build settings)
  worth a cleanup pass regardless of the field-companion program.

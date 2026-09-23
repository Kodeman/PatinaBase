# Patina (client iOS app) — codebase survey

**Target:** `/Users/kody/Code/patina-merged/apps/mobile/Patina`
**Date:** 2026-09-23 · read-only pass, no files under the app modified.
**Label key:** `[E]` evidence (read in a file, cited) · `[I]` inference (concluded from evidence) · `[A]` assumption (could not confirm).

Scale: 1,655 `.swift` files in the target dir; 479 under `Patina/Patina/` (app sources), 260 test files in `PatinaTests/` carrying 2,735 `@Test` cases, 3 UI-test files carrying 10 `func test` methods. `[E]` (file counts via `find`/`grep`). 674 commits touched `apps/mobile/Patina` in the last 60 days `[E]` (`git log --since="60 days ago"`), so this is the actively-worked surface, not an archive.

---

## 1. Audience & purpose

**Who uses it: a homeowner who is a *designer's client*.** `[E]`

- `apps/mobile/Patina/CLAUDE.md:7` — "This is the **client-only** app: designer and trades functionality lives in the sibling app, `apps/mobile/Capture` ("Patina Field")".
- `apps/mobile/Patina/Patina/ContentView.swift:236` — "The client home surface. Patina is a client-only app, so every signed-in user lands on the DailyRoom."
- App Store category is shopping: `Patina.xcodeproj/project.pbxproj:678` `INFOPLIST_KEY_LSApplicationCategoryType = "public.app-category.shopping"`. `[E]`

**Auth model.** Supabase Auth (GoTrue) only, via `Services/Auth/AuthService.swift:15` (`AuthService.shared`, `session: Session?`). Providers are *discovered at runtime*, not hard-coded: `Services/Auth/AuthProviderCatalog.swift:23` declares `apple / google / email`, and `:38` sets the fallback to `[.apple, .email]` because "Google has never been configured on Strata" (`AuthProviderCatalog.swift:8-11`). `[E]` A password fallback sheet and a passwordless email-code sheet are both wired in `ContentView.swift:66-77`. `[E]`

**Guest mode is first-class.** `Services/Auth/GuestSessionStore.swift:21` persists `patina.guest.optedIn`; `AppCoordinator.swift:98` seeds `guestModeOptIn` from it, and `derivePhase()` (`AppCoordinator.swift:480-497`) returns `.auth` only when *not* signed in **and** not opted into guest. `[E]` So an unauthenticated person can reach the whole browsing/room surface. Guests compose a design request freely and hit auth only at send: `Features/DesignServices/DesignRequestFlowView.swift:6` — "Guests compose freely; auth is required only to start uploading." `[E]`

**What it reads/writes.** Supabase PostgREST + Storage + Realtime + Edge Functions, all pointed at Strata by default (`Services/API/APIConfiguration.swift:44-51`, literal `https://bkvcixdmuyejfzcijpdg.supabase.co`; `.local` switches to `127.0.0.1:54321`). `[E]` Domain surface written/read includes: rooms + room scans (`room_scans`, `room-scans` bucket), saved items/boards, style profile, design requests (`submit_design_request` RPC), decisions, proposals, invoices (Stripe Checkout), orders (fulfillment + direct), messaging threads, documents, notifications. `[E]` (see §3).

**Conclusion `[I]`:** the app is the homeowner-facing half of a designer-led project — a place to capture rooms, browse/save pieces, hire a studio, then approve, sign, pay and track what the studio does. It is *not* a designer tool and not a general marketplace app.

---

## 2. Navigation & screen inventory

### Root chain `[E]`

`PatinaApp.swift:11` (`@main`) → `ContentView.swift:23` switches on `coordinator.phase`:

| phase | root view | file |
|---|---|---|
| `.launching` | `SplashView` | `ContentView.swift:27` |
| `.auth` | `AuthScreenView` (+ 2 sheets) | `ContentView.swift:39` |
| `.onboarding` | `OnboardingFlowHost` | `ContentView.swift:80` |
| `.main` | `HouseFirstRoot` **or** `legacyMainContent` | `ContentView.swift:159-162` |

`PatinaApp.init()` runs, in order: `PatinaFonts.registerAll()` → PostHog init (skipped in DEBUG, `AppConfiguration.swift:49`) → `FeatureFlags.shared.resolveAtLaunch()` → `AppCoordinator()` → `RoomScanSyncService.configure(modelContext:)` (`PatinaApp.swift:73-99`). `[E]`

**Two roots ship side by side.** `AppCoordinator` resolves `house-first` *once* in `init` and holds it in a `let` (`AppCoordinator.swift:166`, `ContentView.swift:150-157`). `house-first` defaults **true** (`Core/State/FeatureFlags.swift:85`). `[E]` So the four-tab root is the shipped root and `legacyMainContent` (`ContentView.swift:166`) is the kill-switch path. The route dispatcher is duplicated verbatim in both (`HouseFirstRoot.swift:196-200` comment says so explicitly: "This copy dies with the flag-off root, one release from now"). `[I]` ~250 lines of exact-duplicate navigation code is live maintenance debt.

### The four tabs `[E]` (`Features/Navigation/PatinaTab.swift:16-21`, `HouseFirstRoot.swift:139-150`)

| tab | bar word | canonical name | root view |
|---|---|---|---|
| `.today` | Today | Today | `DailyRoomView` |
| `.spaces` | Spaces | Your Spaces | `SpacesTabRoot` → `YourSpacesView` |
| `.pieces` | Pieces | Browse pieces | `PiecesTabRoot` → `RecommendationsView` |
| `.studio` | Studio | Your Studio | `StudioTabRoot` → `ProfileView`/`StudioHubView` |

Plus a fifth non-tab slot holding the Companion (`HouseFirstRoot.swift:174-193`).

**The tab bar is hand-rolled, not `TabView`.** `Features/Navigation/PatinaTabBar.swift:7` — "It is hand-rolled rather than a `TabView` because the fifth slot holds the Companion's Strata mark, which is not a tab." Tabs are a `ZStack` + `.opacity` + `.allowsHitTesting` (`HouseFirstRoot.swift:96-108`). The only native `TabView` in the app is the onboarding carousel (`Features/Onboarding/Views/OnboardingFlowView.swift:74`). `[E]`

### `AppRoute` — 30 destinations `[E]` (`App/Coordinators/Coordinator.swift:52-120`)

`heroFrame · yourSpaces · roomProject · roomSettings · crossRoom · manualRoomEntry · roomSavedItems · emergence · roomEmergence · table · pieceDetail · scanFlow(reason:) · styleQuiz · styleResult · arPlacement · profile · studio · notifications · designerConsultation · designRequests · projectList · projectDetail · decisionList · decisionDetail · threadList · threadDetail · proposalList · proposalDetail · invoiceList · invoiceDetail · budget · documentList · orderList · orderDetail`

Six modal sheets ride a single `.sheet(item:)` driver (`AppCoordinator.PresentedSheet`): `settings · qr · auth · designServices · newRoom · moveItem` (`ContentView.swift:104-135`). `[E]`

### Feature surfaces under `Features/` (36 dirs, by Swift-file count) `[E]`

Walk 50 · RoomScan 33 · Rooms 21 · Home 19 · Decisions 19 · Companion 19 · DesignServices 14 · Help 13 · StyleConversation 12 · Purchase 12 · Shared 9 · Proposals 9 · QRAuth 8 · Invoices 8 · Projects 7 · Profile 6 · Orders 6 · Navigation 6 · Messaging 6 · FirstLaunch 6 · Collections 6 · Authentication 6 · StyleQuiz 5 · Notifications 5 · Recommendations 3 · ProductDetail 3 · Documents 3 · Conversation 3 · Budget 3 · ARPlacement 3 · StyleReveal 2 · Settings 2 · Money 2 · Account 2 · Splash 1 · Onboarding 1.

### Live vs dead / vestigial

**Live** — every `AppRoute` case resolves to a real destination; `Coordinator.swift:42-48` states the old `EmptyView()` arms were removed (PT-3-6). `[E]`

**Confirmed dead code** (zero references outside their own file, including previews-only): `[E]`

| symbol | file | status |
|---|---|---|
| `ScanUploadBadgeView` | `Features/RoomScan/Shared/Components/ScanUploadProgressView.swift:168` | 0 references anywhere |
| `AddedToRoomToast` | `Features/Home/Views/AddedToRoomToast.swift:8` | only its own `#Preview` (`:54-55`) |
| `DesignRequestResumeBanner` | `Features/DesignServices/DesignRequestResumeBanner.swift:16` | only its own `#Preview` (`:88`). The launch code that sets the draft signal (`PatinaApp.swift:159-166`) is live, but `DailyRoomView.swift:514` consumes it as a Next-Move input instead — the banner view is orphaned. |
| `CompanionVoice` (whole file, ~200 lines of canned copy) | `Features/Companion/Services/CompanionVoice.swift:14` | only `static let shared` self-reference |
| `DwellTracker` | `Services/Analytics/DwellTracker.swift:18` | 0 external refs — nothing calls `viewportEnter/Exit` |
| `InteractionTracker` | `Services/Analytics/InteractionTracker.swift:10` | 0 external refs (views call `ProductAPIClient.trackInteraction` directly instead) |
| `DailyRoomTelemetry` | `Services/Analytics/DailyRoomTelemetry.swift` | 0 external refs |
| `DailyRoomBatchQueue` | `Services/Analytics/DailyRoomBatchQueue.swift:14` | only reached from the dead `DwellTracker` (`:90`, `:117`) |
| `AppConfiguration.enableVoiceInput` / `.enableARFeatures` | `App/Configuration/AppConfiguration.swift:54,58` | 0 call sites; both hard-coded `true` |

**Vestigial config:** the Info.plist declares microphone + speech-recognition purpose strings (`project.pbxproj:681,685`) but **no file in the app imports `Speech`, `AVAudioEngine` or `AVSpeechSynthesizer`** — `AVFoundation` appears only in `PosedPhotoService`, `ScanWalkView`, `QRScannerViewModel/View`, `CameraPermissionService`. `[E]` `[I]` Those two strings are dead weight and an App Review liability.

**Feature flags — only three exist** (`Core/State/FeatureFlags.swift:69-71, 84-88`): `[E]`

| flag | default | note |
|---|---|---|
| `house-first` | **true** | picks the four-tab root |
| `direct-orders` | false | gates the in-app Buy path (`ProductDetailView.swift:88`) |
| `house-widget` | false | gates the home-screen widget's data + in-app promotion |

One more flag is read straight from PostHog and is not in the enum: `onboarding_walk_first` (`Features/FirstLaunch/Views/OnboardingFlowHost.swift:62`). `[E]`

**TODOs:** exactly one in the entire app source — `Features/RoomScan/Shared/Services/AestheteEngineService.swift:189` ("implement once services/aesthete-engine/ (FastAPI) is deployed"). `[E]` `[I]` This codebase does not leave TODO breadcrumbs; dead code is the signal, not comments.

---

## 3. Main user journeys (end-to-end)

### J1 — First launch → account → first room `[E]`

`PatinaApp.swift:102` → `ContentView.swift:27` `SplashView` → `AppCoordinator.derivePhase()` (`:480`) → `.auth` → `AuthScreenView` (`Features/Authentication/Views/AuthScreenView.swift`) offering Apple / email code / password / "Look around first" → on guest opt-in or sign-in, `.onboarding` → `OnboardingFlowHost.swift:72-124`:

- **quiz-first (default):** `OnboardingFlowView` carousel → `StyleQuizView` (5 questions, `Features/StyleQuiz/Views/StyleQuizView.swift:42-50`) → `StyleResultView` → `.main`.
- **walk-first (PostHog `onboarding_walk_first`):** `CameraPermissionView` primer → `QuietConversationFlowHost` scan → `.main`.

Completion is `AppSettings.hasCompletedOnboarding` (`OnboardingFlowHost.swift:18-22`). Skip exists on both the carousel and the quiz (`:87-90`, `:112`). `[E]`

### J2 — Scan a room (the deepest journey) `[E]`

Entry: `AppRoute.scanFlow(reason:)` → `QuietConversationFlowHost` (`Features/RoomScan/Views/QuietConversationFlowHost.swift:17`), which owns an 8-step internal state machine (`:71-80`): `initial → threshold → fallback → savedConfirmation → softLanding → conversation → reveal → floorPlan`, plus a `.fullScreenCover` review step (`:39-42`).

Files in the chain:
`QuietConversationFlowHost.swift` → `ScanThresholdView` → `ScanWalkView` / `RoomCaptureViewRepresentable` → `ScanViewModel` → `Features/Walk/Services/RoomCaptureService.swift` (RoomPlan/ARKit façade) → `ScanBundleWriter` → `ScanReviewView` (hero pick, captions, reorder) → `RoomUploadService.holdLocally()` → `ScanSavedConfirmationView` → `SoftLandingView` → (`StyleConversationContainerView` if refining) → `RevealView` / `ScanFloorPlanPreviewView`.

Non-LiDAR devices branch at `QuietConversationFlowHost.swift:187` (`RoomCaptureService.isSupported`) into `ScanFallbackEntryView` (manual dimensions, `Features/RoomScan/Views/ScanFallbackEntryView.swift:19`). `[E]`

**Nothing uploads here.** `Features/RoomScan/Shared/Services/RoomUploadService.swift:5-14` — "In the local-until-request pipeline NO scan bytes leave the phone at scan time — the review-complete handoff seals the bundle and parks it in `.heldLocal`." `[E]`

### J3 — Hire a studio (the money door opens) `[E]`

`AppCoordinator.PresentedSheet.designServices` → `Features/DesignServices/DesignRequestFlowView.swift:19` with steps `pickScans → details → review → sending → success` (`:7-10`). `ScanPickerView.swift:29` filters to `.heldLocal || .synced` packages. On "Send", `DesignRequestCoordinator` uploads the held bundles with `intent: .userRequested` and then calls the atomic `submit_design_request` RPC. Status afterwards lives at `AppRoute.designRequests(focusLeadId:)` → `DesignRequestStatusView`, with a designer-introduction/booking ceremony (`MatchIntroductionView`, `MatchBookingModel`, `AddToCalendarButton`). `[E]`

### J4 — Approve / sign / pay (the studio rail) `[E]`

`StudioTabRoot` → `ProfileView` + `Features/Profile/Views/StudioHubView.swift:11`, which groups work by state across **seven sources** (`StudioHubView.swift:40` checks `viewModel.failedSources.count == 7`). From there:

- **Decision:** `DecisionListView` → `DecisionDetailView` → `DecisionsAPIClient.selectOption` (`Core/Network/DecisionsAPIClient.swift:439`) / `approveSignoff` (`:474`); project-level approval in `ProjectApprovalScreen`. Commitment acts are **press-and-hold**, not tap (`Features/Shared/Views/HoldToActButton.swift:26-33`, 0.9 s).
- **Proposal:** `ProposalListView` → `ProposalDetailView` → e-sign (`ProposalSignActCopy`, `ProposalSignTerms`).
- **Invoice:** `InvoiceListView` → `InvoiceDetailView` → `InvoicesAPIClient.startCheckout` (`Services/API/InvoicesAPIClient.swift:257`) invoking the `create-checkout-session` edge function → hosted Stripe Checkout in `SFSafariViewController` (`Features/Invoices/Views/SafariView.swift:28`).
- **Order tracking:** `OrderedListView` / `OrderDetailView` over a merged rail of `fulfillment_orders` + `direct_orders` (`Coordinator.swift:114-120`, `Features/Orders/ViewModels/OrdersService.swift:82`).
- **Documents:** `DocumentListView` + `DocumentQuickLook` (QuickLook).
- **Messaging:** `ThreadListView` → `ThreadDetailView`, with Supabase Realtime subscription (`Features/Messaging/ViewModels/MessagingViewModel.swift:316-446`, optimistic append + id dedupe).

### J5 — Discover and buy a piece `[E]`

`PiecesTabRoot` → `RecommendationsView` (fed by the `get_recommendations` RPC, `Core/Network/ProductAPIClient.swift:46`) → `ProductDetailView` → three acts resolved by `Features/Purchase/PieceAct.swift:151`: save to a room, **ask the designer** (`AskDesignerSheet` / `AskAboutPieceSheet`), or **buy** — the last gated by `FeatureFlags.direct-orders` (`ProductDetailView.swift:88`) *and* by a seven-question client-side mirror of the server's refusal rules (`Features/Purchase/BuyabilityGate.swift:47-60`). Buy → `DirectOrdersAPIClient.create_direct_order` → Stripe Checkout in `SFSafariViewController` (`DirectOrdersAPIClient.swift:11`, `:79`). An AR try-on hangs off `ProductDetailView.swift:612` → `AppRoute.arPlacement`.

### J6 (secondary) — Ambient QR sign-in for the web portal `[E]`

`PresentedSheet.qr` → `QRScannerView` → `QRAuthService` + `BiometricService` (Face ID; usage string at `project.pbxproj:680`) → `QRApprovalView`. This is the phone approving a *desktop* portal session.

---

## 4. Room capture / scan pipeline

**Frameworks:** RoomPlan + ARKit + Vision + CoreImage/Accelerate + Metal. `[E]`
`Features/Walk/Services/RoomCaptureService.swift:20-26` imports `RoomPlan`, `ARKit`, `simd`; `Features/ARPlacement/Services/ARPlacementManager.swift:9-10` imports `RealityKit` + `ARKit`.

**Architecture.** `RoomCaptureService` (976 lines) is a façade over three collaborators (`RoomCaptureService.swift:8-14`): `RoomCaptureSessionDriver` (session lifecycle), `RoomCaptureAnalyzer` (coverage/quality/completion), `RoomCaptureBundleAdapter` (disk IO). It owns `RoomCaptureSessionDelegate` + `ARSessionDelegate`. `[E]`

**Live analysis during a walk `[E]`:**
- `CoverageAnalyzer` / `QualityMonitor` / `CompletionAnalyzer` publish `coverageResult`, `qualityMetrics`, `completionStatus` (`RoomCaptureService.swift:50-57`).
- `FrameCaptureService` + `FrameScoringEngine` (an `actor`, `Features/Walk/Services/FrameScoringEngine.swift:17`) score every candidate frame on **sharpness** (Laplacian variance, thresholds 500/100 at `:26-28`), **brightness** histogram (`:31-32`), **composition**, **stability** (gyro, `:35-36`), and **optical flow** via `VNGenerateOpticalFlowRequest` (`:270-271`) for motion-blur rejection. GPU-accelerated through a Metal-backed `CIContext` (`:45-48`).
- `PosedPhotoService` (auto sampler + user shutter), `DepthFrameRecorder` (~1 Hz `sceneDepth`, gated on `supportsFrameSemantics(.sceneDepth)`, `RoomCaptureService.swift:76-88`), `WorldMapExporter`, `SceneMeshExporter`, `LumaProbe`, `ThermalPeakRecorder`.

**The instrument layer** — 16 files under `Features/Walk/Instrument/`, ported from Patina Field: `[E]`
- `KeyframeGate.swift:9-11` — auto-fire a keyframe on ≥0.5 m translation **or** ≥15° rotation since the last fired one, plus a sharpness threshold and a debounce.
- `AnchorGate.swift:11-14` — a session may close with <3 typed anchors, but the Room File is then stamped `unverified`; the `< 3` rule is defined once and propagated to manifest + validator.
- `ScorecardEvaluator.swift:28-30` — red < 60% coverage, amber < 85%, amber sharp-frame ratio < 0.5; an unobserved *structural* surface (a skipped wall/floor/ceiling) forces a non-green verdict and names the gap.
- `SurfaceCoverageTracker`, `SurfaceSynthesis`, `CoverageCoachRules`, `DepthBinFormat`, `CaptureTimebase`, `CaptureSinkRegistry` (one timestamp per sample, broadcast to all sinks — `RoomCaptureService.swift:100`).
- These are deliberately `nonisolated` because the project sets `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` and a main-actor-bound gate at frame rate would be wrong (`KeyframeGate.swift:18-23`). `[E]`

**`ScanBundleWriter` + `ScanManifest`.** `[E]`
- Bundle lives at `Application Support/Scans/{scanId}/` (`apps/mobile/Patina/CLAUDE.md:44-48`).
- **`scanBundleSchemaVersion = 3`** — `Features/Walk/Models/ScanManifest.swift:28`. v3 is additive over v2; every new field is optional or defaulted so a v2 manifest still decodes (`:13-21`).
- Artifact kinds (`ScanManifest.swift:418-456`): `usdz · capturedRoomJson · worldMap · mesh · depthArchive · heroThumbnail · bundleArchive · coverageHeatmap · depthIndex · photoThumbnails · annotations · bundleManifest · photosManifest · keyframesArchive · keyframeIndex · keyframeSummary`.
- The manifest is a strict **superset of Field's** `FieldScanManifest` — it carries `bundleSpecVersion · unverified · checksumAlgorithm · session · anchors · scorecard · poseGraphSummary` (`ScanManifest.swift:30-55`), all Optional until seal. Omitting them made client scans park permanently at ingest on `SCHEMA_VIOLATION` (`:49-54`) — a real, documented outage class.
- Three write paths: `writeArtifact` (bytes), `importArtifact` (move a file in), `registerExistingArtifact` (stat in place, for the 30 MB keyframe tar) — `ScanBundleWriter.swift:110, 134, 182`.

**Sync to Supabase.** `[E]`
- `Services/Sync/RoomScanSyncService.swift:25` is a façade over `ArtifactUploader` (Storage pushes) + `ScanSyncQueue` (NWPathMonitor + queue) + DTOs.
- Objects land in the **private** `room-scans` bucket; the DB column stores the **plain bucket key**, not a public URL (`Services/Sync/ArtifactUploader.swift:157-174`) — `confirm-scan-bundle` and `parse-room-scan` read it that way.
- `BackgroundScanUploader.swift:19` builds a background-`URLSession` POST to `storage/v1/object/room-scans/<path>` and verifies via `storage/v1/object/info/authenticated/...` (`:476`).
- MIME allow-list mirrored from Field in `Services/Sync/ScanBucketMime.swift:38`; a mismatch means `mark_scan_upload_complete` never fires and the scan never reaches `ready` (`:18`).
- Status machine `RoomScanPackageStatus` (`Core/Models/RoomScanPackage.swift:15-46`): `pending · syncing · synced · failed · heldLocal · quarantined`.
- Disk ceiling: 3 GB / 20 bundles, hard-stop at 500 MB free, advisory at 1 GB (`Core/Persistence/ScanDiskBudget.swift:41-45`). Eviction is oldest-synced-first and never touches unsynced bundles (`:17-18`).
- Crash recovery: `ScanRecoveryService.scanForRecoverableSessions` at launch (`PatinaApp.swift:150`); `heldLocal` bundles are intentionally preserved (`ScanRecoveryService.swift:123`).

---

## 5. Existing AI / ML

There is **no Core ML model, no `.mlmodel`/`.mlpackage`, and no `import CoreML` anywhere in the app.** The only Apple ML framework imported is `Vision`, in exactly one file. `[E]` (`grep -rn '^import (CoreML|Vision|Speech|NaturalLanguage|CreateML|SoundAnalysis|VisionKit|Translation|FoundationModels|ImagePlayground)'` → one hit).

| # | Surface | Mechanism | Evidence |
|---|---|---|---|
| 1 | **Frame quality / hero-frame selection** | On-device **Vision + CoreImage heuristics** — `VNGenerateOpticalFlowRequest` for motion blur, Laplacian variance for sharpness, histogram for brightness, gyro for stability. No learned model. | `Features/Walk/Services/FrameScoringEngine.swift:13, 26-40, 270-271` |
| 2 | **Scan coverage coaching / QA verdict** | Pure deterministic rules ported from Field: coverage %, sharp-frame ratio, tracking health, anchor count → green/amber/red + named gaps. | `Features/Walk/Instrument/ScorecardEvaluator.swift:24-40`; `CoverageCoachRules.swift`; `RoomCoverageCoach.swift` |
| 3 | **Keyframe selection** | Pose-delta + sharpness + debounce gate. No model. | `Features/Walk/Instrument/KeyframeGate.swift:9-11` |
| 4 | **Style quiz → aesthetic profile** | **On-device pure-Swift scoring.** `LocalAestheteEngine` builds a weighted 4-D vector (warmth/complexity/formality/era) from Q1–Q5 and nearest-neighbours it against `NamedAesthetics.all`; confidence is the margin over the runner-up. It even sleeps 0.2–0.4 s so the "Contemplative Pause" has something to pause on (`:42-50`). | `Features/RoomScan/Shared/Services/AestheteEngineService.swift:38-120` |
| 5 | **Style quiz → server profile** | `process_style_quiz` RPC. | `Core/Network/ProductAPIClient.swift:244-245` |
| 6 | **Recommendations / match scores** | **Server-side SQL.** `get_recommendations` RPC → shim over `get_aesthete_matches`; returns a 0–100 `match_score`. Real embeddings (nomic-embed-text/vision-v1.5, 768-d int8 ONNX) live in `services/aesthete-inference`, behind the DB — the app never calls it. | `Core/Network/ProductAPIClient.swift:37-46`; `supabase/migrations/00246_aesthete_quiz_bridge.sql:277, 305`; `services/aesthete-inference/README.md:3-6` |
| 7 | **Companion quick actions** | Edge function `companion-context` — **deterministic TypeScript**, no model (`supabase/functions/companion-context/index.ts:1-2`). **Fetched but never rendered** — see friction F1. | `Services/Companion/CompanionAPIClient.swift:67-71`; `CompanionViewModel.swift:39, 188-196` |
| 8 | **Companion conversation** | Edge function `companion-message` → **Anthropic API, `claude-sonnet-4-20250514`**, with a canned-fallback path when `CLAUDE_API_KEY` is unset. Client wiring exists (`CompanionService.sendMessage`, `CompanionViewModel.sendUserMessage`). **No UI reaches it** — see F1. | `supabase/functions/companion-message/index.ts:232, 244-252`; `Services/Companion/CompanionService.swift:53`; `CompanionViewModel.swift:303` |
| 9 | **Natural-language intent** | Hand-written keyword/needle matching over lowercased, apostrophe-normalised text. Not NL/ML. One caller (`AppCoordinator.swift:893`). | `Features/Companion/Services/IntentDetector.swift:29-60` |
| 10 | **Behavioural signal collection** (feeds the engine's `T_behavioral` term server-side) | `trackInteraction` calls from ProductDetail/Recommendations/ARPlacement view models are live; the *dwell/batch* layer is dead. | live: `ProductDetailViewModel.swift:85,152,218,228`; dead: `DwellTracker.swift`, `InteractionTracker.swift` (0 external refs) |

`[I]` The app's own "intelligence" is entirely heuristic and deterministic. The one genuine LLM in the product is server-side and currently unreachable from the client UI. This matches the brand rule in `CLAUDE.md` ("Designer-Taught Intelligence — never 'AI'").

---

## 6. Architecture & dependencies

**SPM (from `Patina.xcodeproj/project.pbxproj`) `[E]`:**

| package | version | products linked |
|---|---|---|
| `supabase/supabase-swift` (`:905-910`) | ≥ **2.5.1** | `Supabase, Auth, Functions, PostgREST, Realtime, Storage` (`:936-961`) |
| `PostHog/posthog-ios` (`:897-902`) | ≥ **3.48.0** | `PostHog` |
| `SimplyDanny/SwiftLintPlugins` (`:913-918`) | ≥ **0.63.2** | build-tool plugin |
| `../PatinaDesignKit` (`:889-893`, local) | — | `PatinaDesignKit` (app + widget) |

Three dependencies total. No Alamofire, no Firebase, no Lottie, no Kingfisher. `[E]`

**Design system:** it **consumes `PatinaDesignKit`** and re-exports it so call sites need no import (`Patina/Design/DesignKitReexport.swift:10` `@_exported import PatinaDesignKit`). The kit holds Tokens (`PatinaColors, PatinaTypography, PatinaSpacing, PatinaShadows, PatinaGradients, PatinaCompanionMotion, TimeOfDay`), 13 Components, and Support (`HapticManager`, `PatinaFonts`). The app keeps a thin local `Design/` for app-specific bits only: `Components/` (6), `Accessibility/AccessibleHitTarget`, `Animations/`, `Gestures/` (`CompanionPullGesture`, `HoldGesture`, `LingerGesture`), `PatinaLog`. `[E]` The kit is `.dynamic` on purpose because both apps and Capture's embedded framework link it (`PatinaDesignKit/Package.swift:23-27`), and its platform floor is **iOS 17.6** (`:30-33`) — a stale comment there still claims the app deploys to 17.6.

**Concurrency:** Swift language mode **5** with `SWIFT_APPROACHABLE_CONCURRENCY = YES` and `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` on the app target (`project.pbxproj:703-707`). `[E]` So everything is main-actor by default; hot paths opt out explicitly with `nonisolated` (`KeyframeGate.swift:18-23`, `ScanManifest.swift:88`) and true background work uses `actor` (`FrameScoringEngine`, `DwellTracker`, `InteractionTracker`, `DailyRoomBatchQueue`). State is Observation-era: `@Observable` + `@State` + custom `@Entry` environment values, not `ObservableObject`. `[E]`

**Persistence — three tiers `[E]`:**
1. **SwiftData** (`PersistenceController.swift:12`, `PatinaSchema.swift:24-39`), versioned `PatinaSchemaV1 (1,0,0)` with a `SchemaMigrationPlan` whose `stages` is still `[]` (`:50`). Nine models: `TableItemModel, RoomModel, SavedItem, StylePreferenceModel, SyncQueueItem, RoomScanPackage, DesignRequestDraft, SubmittedDesignRequest, BoardModel`. The open path is crash-proof by design — three attempts (as-is → fresh store with the bad one moved aside → in-memory), no `fatalError` (`PersistenceController.swift:62-70`), with a user-facing `localStoreRecoveryNotice()` on the next launch (`PatinaApp.swift:110`).
2. **Files on disk** — scan bundles under `Application Support/Scans/{scanId}/`.
3. **UserDefaults / App Group `group.cloud.patina.app`** (`FeatureFlags.swift:251`) — flags mirror, widget snapshot, last-seen, guest opt-in, tour state, appearance, cellular opt-in.

**Widget:** `PatinaWidget` target, `StaticConfiguration`, four families `systemSmall/.systemMedium/.accessoryRectangular/.accessoryCircular` (`PatinaWidget/HouseWidget.swift:25`), fed by `RecordSnapshotStore` through the App Group and gated on `house-widget` (`Core/Persistence/RecordSnapshotStore.swift:90`). `[E]`

**Absent system integrations `[E]`** (grep returned nothing): App Intents, `AppShortcutsProvider`, Siri/`INIntent`, Live Activities / ActivityKit, Control Widgets, Core Spotlight, `NSUserActivity` / Handoff, Translation, Writing Tools, Image Playground, Foundation Models.

---

## 7. Deployment target & Swift version

- **`IPHONEOS_DEPLOYMENT_TARGET = 26.0`** on every configuration of every target — app, widget, tests, UI tests (`project.pbxproj:494, 524, 597, 655, 690, 737, 767, 788`). `[E]`
- **`SWIFT_VERSION = 5.0`** (language mode 5, not 6) across all targets (`project.pbxproj:509, 539, 707, 754, 774, 795, 814, 833`). `[E]`
- `SWIFT_APPROACHABLE_CONCURRENCY = YES`, `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, `SWIFT_UPCOMING_FEATURE_MEMBER_IMPORT_VISIBILITY = YES` (`:703-708`). `[E]`
- `PRODUCT_BUNDLE_IDENTIFIER = cloud.patina.app` (`:695`); widget `cloud.patina.app.widget` (`:500`). Portrait-only, status bar hidden (`:688-689`). `[E]`

**The real floor is muddled.** `[E]` `#available` checks still guard as if the floor were lower:
- `Features/ProductDetail/Views/ProductDetailBlocks.swift:214-218` — "`#available` because `.glassEffect` is iOS 26.0+ **while the app still deploys to iOS 18**".
- `Features/ARPlacement/Views/ARPlacementView.swift:235-241` and `Features/Companion/Views/CompanionOverlay.swift:1199-1207` — both say "on our **26.2** target the glass path is always taken; the `.ultraThinMaterial` arm is a compile-floor fallback only", blaming *module* availability inference on `public` views.
- `PatinaDesignKit/Package.swift:30-33` still pins the package floor at **iOS 17.6** and its comment asserts the app target is 17.6.
- `apps/mobile/Patina/CLAUDE.md:63` says "Target: iOS 18+, optimized for iOS 26.5".
- `Features/Walk/Services/ScanBundleWriter.swift:101` still carries `if #available(iOS 14.0, *)`, and `Services/Analytics/PostHogService.swift:88` an `iOS 14.5` check.

`[I]` The build floor is 26.0; the source tree still reasons as if it were 17.6/18, and the DesignKit floor is what actually forces the `#available` dance on `public` views.

**iOS 26 APIs already adopted `[E]`:** `.glassEffect(.regular, in:)` (Liquid Glass) in exactly four files — `ProductDetailBlocks.swift:219`, `ProductDetailView.swift`, `ARPlacementView.swift:242, 253`, `CompanionOverlay.swift:1208`. Nothing else: no `GlassEffectContainer`, no `.buttonStyle(.glass)`, no `backgroundExtensionEffect`, no `scrollEdgeEffect`, no `tabBarMinimizeBehavior`, no `symbolColorRenderingMode`. `[E]` `[I]` Because the tab bar is hand-rolled (`PatinaTabBar.swift:7`), none of the iOS 26 tab-bar affordances are available to it at all.

---

## 8. Accessibility

**Counts across `Patina/Patina/` `[E]`:**

| modifier | occurrences | files |
|---|---|---|
| `accessibilityIdentifier` | 269 | — |
| `accessibilityLabel` | 154 | 80 of 479 |
| `accessibilityElement` | 79 | — |
| `accessibilityHidden` | 60 | — |
| `accessibilityHint` | 54 | — |
| `dynamicTypeSize` | 54 | 18 |
| `accessibilityAddTraits` | 31 | — |
| `reduceMotion` / `accessibilityReduceMotion` | 146 (25 files use the env value) | — |
| `accessibilityValue` | 15 | — |
| `UIAccessibility.post` / announcements | 8 | — |
| `ScaledMetric` | 6 | — |
| `reduceTransparency` / `differentiateWithoutColor` | **0** | — |
| `accessibleHitTarget(...)` (the app's own 44 pt helper) | **3** call sites | — |

Against **393** `Button(`/`Button {` sites. `[I]` Label coverage is real but partial — roughly 154 labels for 393 buttons, concentrated in 80 of 479 files.

**Where it is genuinely strong `[E]`:**
- **Dynamic Type is structural.** Every type token is `Font.custom(..., relativeTo:)` (`PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaTypography.swift:21-77`), so text scales by default. `PatinaTests/DynamicTypeLayoutTests.swift:24-34` pins a layout policy: the Today header splits into two rows above `.accessibility1` because at XXXL the greeting read "Good / afternoo / n." and at AX-XXXL "Go / od / aft / er / no / on."
- **Contrast is tested, not asserted.** `PatinaTests/ContrastTests.swift:6-13` enforces ≥4.5:1 body, ≥3:1 meta, ≥4.5:1 filled-button label, in **both** appearances, measuring resolved tokens (`PatinaContrast`), not hex literals.
- **Reduce Motion is honoured with judgement, not blanket-disabled.** `HoldToActButton.swift:19-21`: "Reduced motion removes the INK, never the deliberation — a reader who asked for less movement did not ask to sign faster."
- **The hold gesture has a real VoiceOver path.** `HoldToActButton.swift:15-17` — a sustained drag is not performable under VoiceOver, so `HoldableModifier` exposes an `Activate` action, and the completion haptic is the non-visual confirmation.
- **Modal correctness.** The expanded Companion panel sets `accessibilityHidden` on the whole stack behind it (`ContentView.swift:196-200`, `HouseFirstRoot.swift:68`) after a device-confirmed bug where VoiceOver walked past the open panel.
- **Live scan announcements.** `ScanWalkView.swift:124-127` posts `.announcement` on whisper-text change; `:242` labels the lost-tracking state; `ScanHUDView.swift:75` labels the HUD.
- Dedicated a11y test files exist: `ContrastTests`, `DynamicTypeLayoutTests`, `TapTargetTests`, `ChromeReachTests`, `PermissionStringTests`, `SelectedStateTests`. `[E]`

**Gaps `[E]`:**
- `accessibleHitTarget` was built as "additive foundation (PT-2-1) — call sites adopt it in later waves" (`Design/Accessibility/AccessibleHitTarget.swift:9`) and has **3 adopters**.
- **Zero** handling of `reduceTransparency` — notable now that Liquid Glass is in four surfaces.
- **Zero** handling of `differentiateWithoutColor`.
- Only 6 `ScaledMetric` uses, so fixed-point chrome (the 49 pt tab-bar row, `PatinaTabBar.swift:25`) does not scale with text.
- The hand-rolled tab bar has to re-implement everything `TabView` gives free — traits, selection, labels — by hand (`PatinaTabBar.swift:9-12`). `[I]` One missed modifier there is a whole-app navigation regression for VoiceOver.

---

## 9. Friction — evidenced places a user struggles, stalls, or loses work

**F1 — The Companion promises a conversation the UI cannot hold. `[E]`**
`CompanionViewModel` exposes `conversationMessages`, `isThinking`, `errorMessage`, `sendUserMessage`, `retryLastMessage`, `loadConversationHistory` (`:47-53, 303, 414, 433`). `CompanionOverlay` — the only view that constructs it (`:41`) — calls exactly **one** method: `viewModel.updateContext(...)` at `:522, :525, :550`. No `TextField`, no message list. `apiQuickActions` is fetched from `companion-context` (`CompanionViewModel.swift:188-196`) and is read by **no view**. `[I]` The app makes an authenticated network round-trip per screen change and throws the answer away; the Claude-backed `companion-message` function, the guest-invite copy, the retry affordance, and `ConversationStorageService` are all unreachable. That is the single largest gap between what is built and what ships.

**F2 — Cold launch is slow, and its failure mode is a blank screen with a deadline. `[E]`**
`Core/State/LaunchWatchdog.swift:25` sets an 8 s stall deadline; `:40` surfaces a line at 6.5 s: "We couldn't reach Patina — try again." `:9-12` records the cause: `isAuthStateReady` is set only from inside the `for await` over `authStateChanges`, and a failing keychain read means the stream never yields — "the splash is where the app ends. A tester cannot describe that beyond 'it never opened'." Splash floor is 0.6 s when auth is unresolved (`:59-60`), down from an unconditional 1.5 s on top of ~1 s init and a 0.5 s crossfade (`:52-56`). `[I]` Fixed, but the failure class is real and the recovery is still "try again".

**F3 — Everything in the Studio rail is online-only. `[E]`**
`PatinaSchemaV1.models` (`PatinaSchema.swift:26-38`) contains no invoice, decision, proposal, thread, document or order model. Each list view renders `isLoading → PatinaErrorState(retry)` with nothing cached: `InvoiceListView.swift:57-61`, `DecisionListView.swift:53-57`, `ThreadListView.swift:71-75`, `DocumentListView.swift:62-66`, `ProposalListView.swift:48-52`, `OrderedListView.swift:50-55`. `[I]` Offline or on a bad connection, a homeowner sees six identical "try that again" cards and cannot read an invoice she already opened this morning. Contrast with rooms/scans/badges, which *do* have offline stories (`BadgeCountService.swift:175-189` even dates a stale count).

**F4 — The scan flow strands people mid-movement. `[E]`**
`QuietConversationFlowHost.swift:82-93`: the host is mounted with `.toolbar(.hidden, for: .navigationBar)`, "so there is no system chevron by construction and the interactive pop is dead with it. Round one gated this on `.fallback || .initial`, which left the style, reveal, soft-landing, floor-plan and threshold steps exactly as described — no back, no cancel, nothing of their own." Now every step but `.savedConfirmation` draws a "Not now" button (`:96-115`). `[I]` Fixed late; the shape (one host owning 8 steps with hidden chrome) makes it easy to reintroduce.

**F5 — A held scan can be silently invisible to the studio. `[E]`**
`RoomUploadService.swift:5-9` — nothing uploads at scan time; bytes leave only inside the design-request flow. `ScanPickerView.swift:29` shows only `.heldLocal || .synced`. `[I]` A person who scans four rooms and never opens the design-request sheet has four rooms nobody else can see, with no in-app statement that this is so beyond the permission primer copy (`CameraPermissionService.swift:21-23`).

**F6 — Cellular is off by default for scans. `[E]`**
`RoomScanSyncService.cellularOptInKey` defaults false (`:28-33`); the toggle lives in Settings → Preferences ("Upload scans on cellular", `SettingsView.swift:172`). `[I]` Someone who sends a design request on LTE sees "Saved — waiting for a connection" (`DesignRequestFlowView.swift:299`) and has to find a Settings toggle to proceed.

**F7 — Permission strings promise features that do not exist. `[E]`**
`project.pbxproj:681` microphone — "Have a voice conversation with Patina about your space and style." `:685` speech recognition — "Speak naturally with Patina instead of typing." No `Speech` / `AVAudioEngine` import exists anywhere. `[I]` Either dead strings to remove or a promise to build.

**F8 — The default-values trap, already paid for once. `[E]`**
`ScanFallbackEntryView.swift:25-30`: length/width were seeded `"18"` / `"14"` — "developer defaults that rendered as if typed, with the clay 'valid' stroke, and left 'Continue to Style Discovery' enabled on arrival. The fastest path through the screen wrote a room measuring 18 × 14 ft that the person never entered, and the room carried it as measured fact." `[I]` Non-LiDAR users are the ones who hit this, i.e. the cheapest devices.

**F9 — Sign-in errors cross surfaces and move buttons. `[E]`**
`AuthService.swift:44-53`: "'Invalid login credentials' typed into the password SHEET rendered on the auth ROOT after Cancel, pushed the button stack down 33 pt, and the mis-tap at the remembered position dropped the tester into a guest flow they could not get out of." Fixed via `errorScope` (`:54, 62`), and the guest trap has a door now (`GuestSessionStore.swift:48-50`).

**F10 — Deep links and pushes are quietly dropped, or land on the wrong account. `[E]`**
`AppCoordinator.swift:108-112` — a link tapped before sign-in is held with the line "We'll open what you tapped once you're in." `DeepLinkHandler.swift:22-24` — the queue is on disk with a 15-minute life, and `AppCoordinator.swift:127-133` had to add a clear-on-session-end because "account A's tap could drain into account B's first `.main`". APNs taps are in-memory only and do not survive the process (`DeepLinkHandler.swift:26-29`).

**F11 — Duplicate navigation dispatcher. `[E]`**
`HouseFirstRoot.swift:196-200` — "A verbatim second copy of `ContentView`'s dispatcher… This copy dies with the flag-off root, one release from now." `[I]` Two exhaustive switches over 30 routes must be edited in lockstep.

**F12 — Chat-room hygiene for network chatter. `[E]`**
`PatinaTests/CompanionRequestGateTests.swift:7-12`: `companion-context` fired **four times in two seconds at launch for one screen**, from three `CompanionOverlay` call sites. Gated now via `QuickActionsGate` — but §F1 means all four calls were discarded anyway.

**F13 — Dead telemetry means the recommendation loop is half-open. `[E]`**
`DwellTracker` / `InteractionTracker` / `DailyRoomBatchQueue` / `DailyRoomTelemetry` have zero external callers. The server's aesthete engine computes a `T_behavioral` term from the interactions stream (`supabase/migrations/00245_aesthete_behavior_stats.sql:47`). Discrete `trackInteraction` calls do fire (`ProductDetailViewModel.swift:85,152,218,228`; `RecommendationsViewModel.swift:167,236,280`), but no dwell/attention signal is collected. `[I]` The "designer-taught" loop is missing its most informative input.

**F14 — Nothing scales the chrome with text. `[E]`** 6 `ScaledMetric` uses; the tab-bar row is a hard 49 pt (`PatinaTabBar.swift:25`). `[I]` At AX sizes the four tab words compete for a fixed 49 pt band with no icon fallback (the bar draws no icons by design, `PatinaTab.swift:46-48`).

**F15 — Liquid Glass with no transparency escape hatch. `[E]`** Four `glassEffect` surfaces, zero `reduceTransparency` reads. `[I]` A user who has asked the system for less transparency gets glass anyway on the product action bar, both AR control clusters, and the Companion pill.

---

## 10. Offline / camera / voice / hands-busy

**Offline — partial and uneven. `[E]`**
- A real `NWPathMonitor` lives in `Services/Sync/ScanSyncQueue.swift:78`, tracking `isExpensive` (`:98-117`) and re-firing the queue on an unmetered transition.
- Scan uploads have a **persistent** SwiftData queue (`SyncQueueItem` in the schema), a background `URLSession` with `waitsForConnectivity = true` (`BackgroundScanUploader.swift:138`), launch-time resume (`PatinaApp.swift:171-180`), foreground retry (`PatinaApp.swift:224-226`) and crash recovery.
- Rooms are created locally first and sync later (`RoomCreationCoordinator.swift:135`), with tombstones for deletes that failed offline (`RoomTombstones.swift:15`).
- The design-request flow states offline plainly and changes its own verb: `DesignRequestFlowView+Steps.swift:144-153` renders an "You're offline" card and the primary button becomes **"Save request"** instead of "Send request".
- Studio badge counts keep a stale floor and date it rather than flashing zero (`BadgeCountService.swift:139, 175-189, 292`).
- **But** foreground URLSessions set `waitsForConnectivity = false` (`Core/Network/SupabaseClient.swift:69`, `PatinaURLSession.swift:61`), there is **no `URLCache` configuration anywhere**, and none of the Studio rails persist (F3).

**Camera. `[E]`** A purpose-built primer precedes the system prompt, with copy that states the local-first pipeline verbatim (`CameraPermissionService.swift:17-24`) and a `CameraPermissionPolicy` mapping granted/denied/notDetermined → scan / explanation / manual entry (`:32-43`). Denial has a real alternative ("Enter room details instead", `:22`). Non-LiDAR devices branch to manual entry (`QuietConversationFlowHost.swift:187`). `RoomPlanUnsupportedView` exists for the unsupported case (`RoomCaptureViewRepresentable.swift:101`). Camera is also used for QR portal sign-in (`QRScannerViewModel.swift:45`).

**Voice — none. `[E]`** No `Speech`, no `AVAudioEngine`, no `AVSpeechSynthesizer`, no dictation affordance. `AppConfiguration.enableVoiceInput` returns `true` and has zero call sites (`AppConfiguration.swift:54`). "CompanionVoice" is brand-tone copy templates, entirely unreferenced (`Features/Companion/Services/CompanionVoice.swift:14`). Only 18 `textContentType`/`submitLabel`/`keyboardType` uses across the app. `[I]` A person walking a room with a phone held out has no spoken input path at all.

**Hands-busy — partly considered, by haptics rather than by voice. `[E]`**
- `HapticManager` is used at 58 sites; `sensoryFeedback` at 6. Haptics have a user toggle (`SettingsView.swift:162-171`).
- The scan HUD speaks: whisper text is announced to VoiceOver as it changes (`ScanWalkView.swift:124-127`), and coverage coaching is continuous during the walk (`RoomCaptureService.swift:89-90`, `RoomCoverageCoach`).
- Three custom gestures exist for low-attention interaction: `CompanionPullGesture`, `HoldGesture`, `LingerGesture` (`Design/Gestures/`).
- Deliberation acts are 0.9 s holds rather than taps (`HoldToActButton.swift:26`).
- `[I]` But the actual hands-busy moment — walking a room, phone up, one hand — is served only by on-screen text and haptics. No audio guidance, no spoken coaching, no voice capture of a room note.

---

## Appendix — quick reference

- Entry point: `/Users/kody/Code/patina-merged/apps/mobile/Patina/Patina/PatinaApp.swift`
- Root switch: `/Users/kody/Code/patina-merged/apps/mobile/Patina/Patina/ContentView.swift:23`
- Coordinator: `/Users/kody/Code/patina-merged/apps/mobile/Patina/Patina/App/Coordinators/AppCoordinator.swift` (1,017 lines)
- Routes: `/Users/kody/Code/patina-merged/apps/mobile/Patina/Patina/App/Coordinators/Coordinator.swift:52`
- Shipped root: `/Users/kody/Code/patina-merged/apps/mobile/Patina/Patina/Features/Navigation/HouseFirstRoot.swift`
- Flags: `/Users/kody/Code/patina-merged/apps/mobile/Patina/Patina/Core/State/FeatureFlags.swift:69`
- Scan manifest (v3): `/Users/kody/Code/patina-merged/apps/mobile/Patina/Patina/Features/Walk/Models/ScanManifest.swift:28`
- Capture façade: `/Users/kody/Code/patina-merged/apps/mobile/Patina/Patina/Features/Walk/Services/RoomCaptureService.swift`
- Sync façade: `/Users/kody/Code/patina-merged/apps/mobile/Patina/Patina/Services/Sync/RoomScanSyncService.swift`
- On-device style scoring: `/Users/kody/Code/patina-merged/apps/mobile/Patina/Patina/Features/RoomScan/Shared/Services/AestheteEngineService.swift:38`
- Design system: `/Users/kody/Code/patina-merged/apps/mobile/PatinaDesignKit/Package.swift`
- Build settings: `/Users/kody/Code/patina-merged/apps/mobile/Patina/Patina.xcodeproj/project.pbxproj:690` (deployment target), `:707` (Swift version)

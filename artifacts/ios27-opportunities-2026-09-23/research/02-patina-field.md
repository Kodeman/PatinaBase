# Patina Field (Capture) — codebase evaluation

Read-only evaluation, 2026-09-23. Root: `/Users/kody/Code/patina-merged/apps/mobile/Capture`.
Target `Capture`, bundle `cloud.patina.field`, display name "Patina Field", scheme `field://`.

Every claim below is labeled **EVIDENCE** (read in a file, cited `path:line`), **INFERENCE**
(concluded from evidence), or **ASSUMPTION** (could not confirm without building/running).

Sizes (EVIDENCE, `find`/`wc`): app target 158 Swift files / 39,084 lines · `CaptureKit` 114 files /
17,729 lines · `CaptureKitMocks` 4 files / 1,295 lines · tests 52 files / 15,020 lines.

---

## 1 · Audience & purpose

**EVIDENCE — it is not a consumer capture app.** The sign-in path forbids account creation:
`SupabaseSessionService.sendEmailCode` calls `signInWithOTP(email:shouldCreateUser: false)` with the
comment *"Patina Field is invite-only for designers/trades, who are provisioned (auth user +
organization membership) through the portal. The app must never mint a brand-new auth user"*
(`Capture/Services/Session/SupabaseSessionService.swift:182-201`).

**EVIDENCE — four ways in.**
1. **Sign in with Apple** — native `ASAuthorizationController` → `signInWithIdToken(provider:.apple)`
   (`SupabaseSessionService.swift:166-180`; entitlement `com.apple.developer.applesignin`,
   `Capture/Capture.entitlements`).
2. **Email 6-digit one-time code** — `signInWithOTP` then `verifyOTP(type:.email)`
   (`SupabaseSessionService.swift:182-226`).
3. **Portal QR handoff** — the signed-in designer portal renders `field://login?v=1&th=<token_hash>`;
   Field exchanges the GoTrue magic-link hash via `verifyOTP(tokenHash:type:.magiclink)`
   (`SupabaseSessionService.swift:234-247`; driver `Capture/App/DeepLinking/PortalLoginController.swift`,
   scanner `Capture/Features/Auth/PortalLoginScanSheet.swift`).
4. **Zero-install guest** — an HTTPS universal link `https://client.patina.cloud/field/{opaque-token}`
   enters a *tokenless* guest realm with no Supabase JWT at all
   (`Capture/App/DeepLinking/CaptureDeepLink.swift:25-33`; associated domain
   `applinks:client.patina.cloud`, `Capture/Capture.entitlements`).

**EVIDENCE — "workspace" == `organizations.id`.** `CaptureWorkspace` is documented as
"A workspace the signed-in user can save captures into (== organizations.id)"
(`SupabaseSessionService.swift:19-23`), resolved from
`organization_members → organizations(id,name)` filtered to `status = 'active'`
(`SupabaseSessionService.swift:432-449`). Multi-org users pick one in O2; the choice persists
per-user in the App Group `UserDefaults` (`SupabaseSessionService.swift:473-505`).

**EVIDENCE — roles are decorative, not a gate.** `roles` comes from `user_roles → roles(domain)` and
is commented *"Domain roles (e.g. ["designer"]) — informational only, no hard gate"*
(`SupabaseSessionService.swift:46-48`, fetch at `:418-430`). Nothing branches on it: the analytics
identify call hard-codes `"role": "designer"` (`Capture/App/Composition/AppContainer.swift:290`).
**INFERENCE:** authorization is entirely server-side RLS, not client role logic.

**EVIDENCE — the real role vocabulary lives in the People room, per *project*, not per user.**
`FieldRosterSeat` carries `kindWord` ("sub", "gc", "receiver"), `trade`, `stageWord`
("On the job" / "Awarded" / "No response" / "Off the job"), `reachWord` ("Account" / "Field link" /
"On paper") and `consentWord` ("Texting" / "Invited" / "Opted out" / "Not asked")
(`CaptureKit/CaptureKit/Work/PeopleRoomService.swift:49-95`), banded into
`thisWeek / later / bidding / done` (`:26-40`).

**EVIDENCE — purpose, in the app's own first screen:** *"Capture in the room. Showrooms, markets,
fabric houses — keep what you find, structured and located, even with no signal."*
(`Capture/Features/Onboarding/WelcomeScreen.swift:28-33`).

**INFERENCE — two distinct audiences in one binary:** (a) the signed-in studio person (designer or
trade with an org membership) who gets the full two-realm app; (b) an **unauthenticated guest**
(a sub, a GC, a homeowner's contractor) who arrives via a texted `/field/{token}` link and sees only
SR13–SR20. The guest realm short-circuits the whole app shell
(`Capture/Features/Root/RootView.swift:468-472`: `if let accessToken = coordinator.guestAccessToken { GuestSiteRequestRootView(...) }`).

---

## 2 · Screen inventory — BUILT vs REACHABLE

**EVIDENCE — the canonical list has 79 cases**, not the 78 its own header claims
(`CaptureKit/CaptureKit/Support/CaptureScreenID.swift`; `grep -c "    case [a-z]"` = 79). The header
also says *"v4VisitReview is the one remaining reserved id, held out of the sweep until the screen
behind it exists (wave 4)"* — **this is stale**: `V4VisitReviewScreen` exists
(`Capture/Features/Session/V4VisitReviewScreen.swift:26`), is registered
(`Capture/App/Composition/ScreenRegistry.swift:18`) and is routed
(`Capture/App/DeepLinking/CaptureDeepLink.swift:91-93`). `scripts/capture-shots.sh:49-57` still
excludes it from the sweep.

### 2.1 Built and reachable by tapping (real signed-in app)

| Group | IDs | Entry point (EVIDENCE) |
|---|---|---|
| Onboarding | O1–O4 | phase-driven when `ownerState == .signedOut/.needsWorkspace` (`RootView.swift:474-497`) |
| Camera home | C1 (+C2/C3/C4 as states of C1) | realm root when `realm == .camera` (`RootView.swift:499-507`) |
| C5 specimen sheet | C5 | `ViewfinderModel.swift:394, 453` and every N-sheet's "save" |
| C6 voice | C6 | a **mode** of C1, not a route (`ViewfinderScreen.swift:68-70`; `CameraMode.viewfinderSelectable` `CaptureEnums.swift:27-29`) |
| Enrich | N1, N2, N3, N4 | mode selector → `ViewfinderModel.swift:351-355` |
| Smart guess | N5 | `ViewfinderModel` / card flow → registrar `RecognitionScreens.swift:89-102` |
| Route & save | S1–S5 | `ViewfinderModel.swift:411-453`, `S1AssignVenueScreen.swift:174,383`, `S3DestinationScreen.swift:200` |
| Visit spine | V0, V1, V2, V3, V4 | V0 from the C1 chip (`ViewfinderScreen.swift:93,209`) and Today (`WorkDashboardScreen.swift:51`); V4 from V1 (`V1SessionTrayScreen.swift:408`) |
| Hours | H1 | Browse tile (`WorkDashboardScreen.swift:420`) + expanded Companion (`RootView.swift:271`) |
| Work home | W1 | realm root (`RootView.swift:505`) |
| Browse | P1, P2, L1, L2, D1, D2, M1, M2, G1 | Browse grid `WorkDashboardScreen.swift:365-400` |
| Receiving sheet | G2, G3 | `ArrivingPOsScreen.swift:90` |
| Site scan | F1, F1-context, F2, F3, F4 | Browse tile "Site scan" → `.siteScanSetup` → `SiteScanSetupScreen.swift:312` |
| Site requests | SR01–SR12 | `ProjectDetailScreen.swift:111` "Open Site" |
| Guest | SR13–SR20 | universal link only (`CaptureDeepLink.swift:25-33`) |
| People | PR1, PR2, PR3 | `ProjectDetailScreen.swift:132` "Everyone on this job"; PR2/PR3 from `ProjectRosterScreen.swift:197,301` |
| Sync / Library | U1, U2 | U1 from Work attention (`WorkDashboardScreen.swift:308`); U2 from S4/S5 (`S4SavedTerminalScreen.swift:64`, `S5InboxTerminalScreen.swift:66`) |
| Resilience | R1, R2, R4 | R1 = low-light state of C1; R2 = `TagOCRSheet.swift:38` fallback phase; R4 = the U1 screen |

### 2.2 BUILT BUT NOT REACHABLE by tapping — the significant finding

**EVIDENCE.** Exhaustive grep for in-app navigation (`grep -rn "navigate(to: \.settings\|\.account\|\.qrScan\|present(\.photoImport" Capture`) returns **only** `CaptureDeepLink.swift`:

- **T1 Settings** (`Capture/Features/Settings/SettingsScreen.swift`, ~350 lines, registered at
  `SystemSurfaceScreens.swift:40`) — only caller: `CaptureDeepLink.swift:119`.
- **T2 Account** (`Capture/Features/Account/AccountScreen.swift`, registered at
  `SystemSurfaceScreens.swift:48`) — only caller: `CaptureDeepLink.swift:120`.
- **Q1 QR scan / Q2 QR approve** (`Capture/Features/QRApprove/`, real biometric-gated portal-login
  approval against `POST /api/auth/qr/verify`) — only caller: `CaptureDeepLink.swift:238-239`.
  The Q1 file's own comment even asserts *"A signed-out user can't reach Q1, which lives behind
  Work"* (`QRScanScreen.swift:25-28`) — **there is no such affordance in `WorkDashboardScreen`.**
- **R3/E3 photo import** (`Capture/Features/Resilience/ResilienceScreens.swift`, `PhotosPicker`
  fallback, ~300 lines) — only caller: `CaptureDeepLink.swift:107`. The camera-denied state on C1
  offers **only** "Open Settings" and never this sheet
  (`ViewfinderScreen.swift:291-318`).

**EVIDENCE — and the deep link is disabled in production.** `CaptureDeepLink.verificationHarnessAllowed`
is `#if DEBUG true #else !AppConfiguration.runsRealServices #endif`
(`CaptureDeepLink.swift:250-256`), and `runsRealServices` is `true` on any physical device
(`AppConfiguration.swift:101-108`).

**INFERENCE — in a Release/TestFlight build on a device, a signed-in designer with a valid workspace
cannot reach Settings, Account, sign-out, workspace-switch, the QR portal-login approver, or the
photo-import fallback at all.** Sign-out exists only at `AccountScreen.swift:265` and in the O2
"no workspace" dead end (`RootView.swift:492`), so a signed-in user with a workspace has no exit.

**EVIDENCE — E2/E3 have no host.** `CaptureWidgets/` and `CaptureShareExtension/` are **empty
directories** (`find CaptureWidgets CaptureShareExtension -mindepth 1` → 0 files) and
`scripts/generate_project.rb` creates exactly five targets: CaptureKit, CaptureKitMocks, Capture,
CaptureTests, CaptureUITests (`generate_project.rb:27-29, 159, 173`). `Capture.xcodeproj/project.pbxproj`
confirms the same five `productName` entries.

**EVIDENCE — Live Activity is dead code.** `CaptureLiveActivityController` calls
`Activity.request(...)` (`Capture/Services/LiveActivity/CaptureLiveActivityController.swift:43-47`),
but `NSSupportsLiveActivities` appears nowhere in `Capture/Info.plist` or `generate_project.rb`
(grep across `*.plist` + `*.rb` → 0 hits), and there is no widget-extension target to render
`CaptureSyncAttributes`. **INFERENCE:** `areActivitiesEnabled` is false and every call is a no-op in
shipping builds.

**Tally (INFERENCE from the above):** of 79 screen ids, ~71 are reachable through the real UI
(counting C2/C3/E1/R1 as states of C1); **6 built screens (T1, T2, Q1, Q2, R3, E3) are reachable
only via a harness path that Release builds refuse**, and 2 (E2 system entry, E3 share sheet) have
no extension host at all.

---

## 3 · Navigation architecture

**EVIDENCE — two peer "realms", each with its own `NavigationStack`.**
`FieldRealm { camera, work }` (`CaptureKit/CaptureKit/Navigation/FieldRealmHistory.swift:9-12`);
`FieldRealmHistory` keeps `cameraPath` and `workPath` independently so crossing never flattens
either (`:14-50`). `RootView.realmShell` switches between the two
(`Capture/Features/Root/RootView.swift:293-312`).

**EVIDENCE — the state machine.** `CapturePhase { launching, auth, permissionPriming, ready }`
(`CaptureKit/CaptureKit/Navigation/CaptureNavigation.swift:11-16`), driven by
`CaptureSessionOwnerState { loading, signedOut, needsWorkspace, ready(owner) }` observed in
`RootView.observeOwnerState` (`RootView.swift:378-431`). An owner change calls
`invalidateOwnerBoundUI()` which resets the coordinator, both realm paths, the visit context store
and the companion (`RootView.swift:433-446`).

**EVIDENCE — routes are registered, not switched.** `RouteRegistry` is a string-keyed builder map
(`CaptureKit/CaptureKit/Navigation/RouteRegistry.swift:11-37`); every feature ships one registrar and
`ScreenRegistry.registerAll` is the single integration seam, 18 lines
(`Capture/App/Composition/ScreenRegistry.swift:13-36`). An unregistered route renders a visible
`MissingScreen` "Not wired" placeholder (`RouteRegistry.swift:94-105`) — **INFERENCE:** this is a
good failure mode; I found no route/sheet case without a registrar.

**EVIDENCE — "home" is Today, not the camera.** `FieldLaunchPolicy.todayIsHome = true`
(`CaptureKit/CaptureKit/Navigation/FieldLaunchPolicy.swift:35`); `destination(visitState:)` returns
`.viewfinder` only when a visit is `.active`, otherwise `.today`, unless a `field://capture` deep
link asked for the camera (`:37-49`). Applied in `RootView.applyLaunchDestination`
(`RootView.swift:352-376`), which resets to the realm root and emits `field.launch`.

**EVIDENCE — one collapsible "Field Companion" strip** rides `safeAreaInset(edge:.bottom)` across
the whole app (`RootView.swift:56-58`), with a placement policy that hides it on the camera root, on
sheets, on the QR scanner and on the People room (*"the People room is a studio surface and carries
no engagement chrome"*, `RootView.swift:185-191`).

**EVIDENCE — 25 routes + 17 sheets.** `CaptureRoute` has 25 cases including three *composite* cases
that carry a `CaptureScreenID` to pick the face: `.site(screen:projectID:requestID:)` for SR01–SR20,
`.people(screen:projectID:personID:)` for PR1–PR3, and `.visitReview(visitID:)`
(`CaptureNavigation.swift:19-54`). `CaptureSheet` has 17 (`:57-105`).

---

## 4 · Main user journeys (end-to-end, with files)

**J1 · Capture a specimen (the core loop).**
C1 `ViewfinderScreen` → shutter tap → `ViewfinderModel.captureSingle` freezes a card
(`Capture/Features/Capture/ViewfinderModel.swift`, `CaptureCardOverlay.swift`) → optional enrich
(N1 OCR / N2 code / N3 measure / N4 voice / N5 smart guess, all sheets over C1) → "Save" writes a
SwiftData `Specimen` and calls `sync.enqueue` → `LocalCaptureSyncService.enqueue` stamps `.queued`
and never blocks (`Capture/Services/Sync/LocalCaptureSyncService.swift:109-135`) → `drain` uploads
each artifact to the `capture-media` bucket and calls `commit_field_capture`
(`:141-208`, `Capture/Services/Sync/SupabaseCaptureGateway.swift:40-57`) → terminal S4 (saved to
library) or S5 (parked) (`ViewfinderModel.swift:437-443`). A hold on the shutter rolls C4 multi-shot
into one specimen (`ViewfinderScreen.swift:80-82`).

**J2 · Run a site scan (LiDAR).**
Browse "Site scan" tile (`WorkDashboardScreen.swift:397-403`) → F1 `SiteScanSetupScreen` →
`.siteScan(projectID:projectRoomID:)` → `SiteScanHostScreen` hosts F2/F3/F4 →
`SupabaseSiteScanService.startSession()` builds `RoomPlanScanSession`, which drives a **shared**
`ARSession` owned by `SharedARCaptureRig` running `ARWorldTrackingConfiguration` with
`sceneReconstruction = .mesh` and `[.smoothedSceneDepth, .sceneDepth]`
(`Capture/Features/SiteScan/SharedARCaptureRig.swift:1-40`,
`RoomPlanScanSession.swift:1-70`). Four streams, one clock: USDZ + parametric JSON from RoomPlan,
`mesh.ply`, `depth/`, posed photos. Upload is resumable via `ScanUploadRecord` (@Model) +
`FieldBackgroundScanUploader` on a background `URLSession`
(`Capture/Features/SiteScan/FieldBackgroundScanUploader.swift:1-50`), finished with the
`confirm-scan-bundle` edge function (`SupabaseSiteScanService.swift:554-556`).
**EVIDENCE:** non-LiDAR devices get *context capture* (photos + notes) instead and the copy must
never call it a scan (`CaptureKit/CaptureKit/Support/FieldCopyAudit.swift:26-38`).

**J3 · Receive goods.**
Browse "Receiving" → G1 `ArrivingPOsScreen` reads `purchase_orders`
(`SupabaseReceivingService.swift:58-73`) → tap opens the `.receivingInspection(poID:)` sheet
(`ArrivingPOsScreen.swift:90`) → G2 photos + notes, each photo uploaded immediately and retriable
per-photo (`ReceivingInspectionViewModel.swift:1-11, 26-46`) through the **media service**
3-step PAR flow (`ReceivingMediaUploadClient.swift:1-15`) → G3 outcome → `submitInspection`
inserts `receiving_inspections`, best-effort-syncs `purchase_orders`, and inserts `damage_claims`
with a compensating delete on failure (`SupabaseReceivingService.swift:88-145`).

**J4 · Handle a lead.**
Browse "Leads" → L1 `LeadListScreen` → L2 `LeadDetailScreen`. **EVIDENCE — read-only:**
`LeadsService` declares exactly `listOpenLeads()` and `leadDetail(id:)`
(`CaptureKit/CaptureKit/Work/LeadsService.swift:44-45`). There is no claim, no stage change, no
reply. Same for Decisions (`DecisionsReadService.swift:88-90`) and Projects
(`ProjectsService.swift:144-146`). **INFERENCE:** Field is read-mostly for the Work realm; the only
Work-realm writes are messages, receiving inspections, hours, People-room notices/links, and site
requests.

**J5 · Approve a QR portal login.**
Q1 `QRScanScreen` reuses the VisionKit `DataScannerView` host (`QRScanScreen.swift:1-12`) → parses
`patina://auth?session=<64-hex>&exp=<unix>` → Q2 `.qrApprove(payload:)` gates on Face ID / Touch ID
via `LocalAuthentication`, falling back to passcode, then `POST {portal}/api/auth/qr/verify` with
the Supabase JWT (`SupabasePortalAuthApprovalService.swift:1-45`).
**EVIDENCE:** no in-app entry point (§2.2).

**J6 · Site request (the guest loop).**
Designer: P2 → "Open Site" → SR01 hub → SR02 composer → SR03 item config → SR04 assign & send,
which calls the authenticated `site-request-dispatch` edge function that performs the SMS send
server-side (`SiteRequestContract.swift:30-34`). Sub receives a link →
`https://client.patina.cloud/field/{token}` → `coordinator.enterGuestRequest`
(`CaptureDeepLink.swift:25-33`) → SR13 landing → SR14 checklist → SR15 measure / SR16 photo →
SR17 queue → SR18 receipt → SR19 done. All guest calls go through the **unauthenticated**
`site-request-guest` edge function with the opaque token in the body, never a JWT
(`SupabaseSiteRequestService.swift:257-317`). Designer then reviews SR06–SR09 and approves via
`site_request_approve_item`.

**J7 · Log an hour that is not a visit.**
Browse "Hours" tile or the expanded Companion → H1 `LogTimeSheet` (a *sheet*, deliberately, so it
returns you to what you were doing — `CaptureNavigation.swift:75-79`) → durable
`TimeEntryOutboxRecord` → `TimeEntryOutboxDrainer` → `log_time` RPC
(`Capture/Services/Sync/SupabaseFieldWriteGateway.swift:71-85`).

---

## 5 · Mock vs real — quantified

**EVIDENCE — the switch.** `AppConfiguration.runsRealServices`
(`Capture/App/Configuration/AppConfiguration.swift:101-108`):
```
if useMocks || isUITest { return false }
#if targetEnvironment(simulator)  return args.contains("-CaptureForceReal")
#else                              return true
#endif
```
So: **physical device = real; Simulator = all-mock unless `-CaptureForceReal`.**
`useMocks` is `-CaptureUseMocks` or `--uitesting` (`:83-86`).

**EVIDENCE — the seam architecture.** `AppContainer` is the single composition root and branches
once on `real` (`Capture/App/Composition/AppContainer.swift:143-219`). Every dependency is
protocol-typed (`any ProjectsService`, etc., `:34-72`); real mode calls per-flow
`<Flow>ServiceFactory.make(deps: WorkServiceDependencies)` (`:268-281`); mock mode wires
`CaptureKitMocks` conformers directly (`:194-219`). `CaptureKit` is SDK-free by design — the
generator links `supabase-swift` and `posthog-ios` to the **app target only**
(`scripts/generate_project.rb:214-242`).

**EVIDENCE — how much is really implemented.** 31 protocols declared in `CaptureKit`
(`grep "^public protocol"`). Concrete Supabase/Apple implementations, by line count:

| Seam | Real concrete (LOC) | Mock (module) |
|---|---|---|
| `SessionProviding` | `SupabaseSessionService` **552** | `MockSessionProviding` 24 |
| `CaptureSyncService` | `LocalCaptureSyncService` **1187** | `InMemoryCaptureSyncService` 16 (all no-ops) |
| `SiteScanService` | `SupabaseSiteScanService` **1375** (+`RoomPlanScanSession`, `SharedARCaptureRig`, 5 recorders) | `MockSiteScanService` |
| `SiteRequestService` + `GuestSiteRequestService` | `SupabaseSiteRequestService` **1241** | `MockSiteRequestService` |
| `PeopleRoomService` | `SupabasePeopleRoomService` **449** | `MockPeopleRoomService` |
| `MessagingService` | `SupabaseMessagingService` **402** (incl. Realtime) | `MockMessagingService` |
| `ProjectsService` | `SupabaseProjectsService` **397** | `MockProjectsService` |
| `PortalAuthApprovalService` | `SupabasePortalAuthApprovalService` **286** | `MockPortalAuthApprovalService` |
| `ReceivingService` | `SupabaseReceivingService` **273** | `MockReceivingService` |
| `DecisionsReadService` | `SupabaseDecisionsReadService` **239** | `MockDecisionsReadService` |
| `FieldHoursService` | `SupabaseFieldHoursService` **166** | `MockFieldHoursService` |
| `LeadsService` | `SupabaseLeadsService` **131** | `MockLeadsService` |
| Margin/Punch/TimeEntry gateways | `SupabaseFieldWriteGateway` **101** | none (drainers are `nil` in mock) |
| `CaptureProjectCreating` | `SupabaseProjectCreator` **91** | `nil` |
| `WorkspaceAuthorizing` | `SupabaseWorkspaceAuthorizer` **42** | `StubWorkspaceAuthorizer` |
| `CaptureAnalytics` | `PostHogCaptureAnalytics` | `MockCaptureAnalytics` (no-op) |
| `CameraService` | `AVFoundationCameraService` (**device only**) | `MockCameraService` |
| `LocationService` | `CoreLocationService` (**device only**) | `MockLocationService` |

**EVIDENCE — recognition is real in BOTH modes.** `RecognitionScreens.register` constructs
`VisionTagOCRService()`, `DataScannerCodeService()`, `ARKitMeasureService()` and
`SpeechVoiceNoteService(...)` unconditionally (`Capture/Features/Recognition/RecognitionScreens.swift:25,
38, 51, 64`), and `AppContainer` wires `HeuristicSmartGuessService()` on **both** branches
(`AppContainer.swift:155, 197`). The mock recognition types are referenced only from `#Preview`
blocks (`TagOCRSheet.swift:258`, `MeasureSheet.swift:228`, `VoiceNoteSheet.swift:504`,
`SmartGuessSheet.swift:314`); `MockCodeScanService` has **zero** references in the app target.

**EVIDENCE — the backend actually exists.** The app touches **37 distinct tables**, **9 RPCs** and
**1 edge function invoke** plus 2 direct-HTTP edge functions. Every RPC resolves to a real migration
in this repo: `commit_field_capture` (`supabase/migrations/00530_…`), `route_field_capture` (`00235`),
`place_product_in_project` (`00445`), `mark_scan_upload_complete` (`00082`), `log_time` (`00608`),
`create_field_link` (`00284`), `record_notice` (`00635`), `identity_consent_evidence` (`00626`),
`rpc_mark_thread_read` (`00103`), and the eight `site_request_*` RPCs (`00374`). The four edge
functions `confirm-scan-bundle`, `site-request-guest`, `site-request-dispatch`,
`site-request-media-maintenance` all exist under `supabase/functions/`.

**INFERENCE — this is not a mock-shell app.** Every one of the 15 server-backed seams has a
production Supabase/HTTP concrete, and the production targets exist. The mock layer's job is to keep
the Simulator, the `#Preview` bodies, the `capture-shots.sh` screenshot sweep, and XCUITest running
without a network — **not** to stand in for unwritten backends.

**EVIDENCE — but the mocks ship.** `generate_project.rb:205-212` embeds **both** `CaptureKit` and
`CaptureKitMocks` frameworks into the app bundle, and `CaptureDeepLink.swift:10` imports
`CaptureKitMocks` unconditionally (not behind `#if DEBUG`) for `WorkFixtures`. All fixture reads are
guarded by `runsRealServices` or `#Preview`, but the fixture data and every mock conformer are in
the shipped binary.

---

## 6 · Existing AI / ML

All on-device, all **legacy Objective-C-era Vision API** — no Core ML model, no `NaturalLanguage`,
no `FoundationModels`, no `Translation`, no `ImagePlayground` (`grep "^import <fw>"` counts: Vision 3,
VisionKit 1, Speech 1, ARKit 11, RoomPlan 5, CoreML **0**, NaturalLanguage **0**, SoundAnalysis **0**,
CreateML **0**, FoundationModels **0**).

| Surface | Framework / API | On-device? | EVIDENCE |
|---|---|---|---|
| **N1 tag OCR** | `Vision` `VNRecognizeTextRequest`, `.accurate`, `usesLanguageCorrection = true` | Yes | `Capture/Services/Recognition/VisionTagOCRService.swift:22-40`. Field heuristics tag lines as price/sku/maker (`:46-64`) |
| **N5 smart guess** | `Vision` `VNClassifyImageRequest`, top labels > 0.1 confidence | Yes | `Capture/Services/Recognition/HeuristicSmartGuessService.swift:37-56` |
| — its taxonomy | a hand-written **~45-keyword** table → 16 `SpecimenCategory` cases, whole-word, head-noun-wins matching | pure Swift, in `CaptureKit` so it is unit-tested | `CaptureKit/CaptureKit/Recognition/SmartGuessKeywords.swift:13-50` |
| **N2 code scan** | `VisionKit` `DataScannerViewController` | Yes | `Capture/Features/Recognition/Code/DataScannerView.swift:11-50`. Catalog lookup is a **2-entry local stub, no network** (`DataScannerCodeService.swift:29-45`) |
| **N3 measure** | `ARKit` `ARWorldTrackingConfiguration` | Yes, device-only | `Capture/Services/Recognition/ARKitMeasureService.swift:13-33`; manual mm entry always available |
| **N4 / C6 voice** | `Speech` `SFSpeechRecognizer` + `AVAudioEngine`, `requiresOnDeviceRecognition` set from `supportsOnDeviceRecognition` | **Sometimes** — falls back to Apple's servers where on-device is unsupported | `Capture/Services/Recognition/SpeechVoiceNoteService.swift:76, 314-315`; the usage string says so out loud (`generate_project.rb:110-116`) |
| — recorder | recognizer rotated every `segmentRotationSeconds` while the `.m4a` stays continuous; recognition is a *bonus on top of* the recording, never a precondition | — | `SpeechVoiceNoteService.swift:1-38` |
| **Site-scan geometry** | `RoomPlan` `RoomCaptureView(frame:arSession:)` on a shared session; `sceneReconstruction = .mesh`; smoothed depth | Yes, LiDAR-only | `SharedARCaptureRig.swift:20-40` |
| — quality heuristics | `Sharpness.varianceOfLaplacian` over a decimated luma grid; `CoverageScorecard` / `ScorecardEvaluator`; `FieldCoverageCoach` | pure Swift | `Capture/Features/SiteScan/LumaProbe.swift`, `CaptureKit/CaptureKit/SiteScan/Sharpness.swift`, `CoverageScorecard.swift` |
| **"Designer-taught" filing suggestion** | **no ML** — a proximity + venue-name heuristic over remembered filings (150 m radius, ≥3 filings for a centroid) | Yes, offline | `CaptureKit/CaptureKit/Work/CaptureSuggestionEngine.swift:35-70` |

**EVIDENCE — a hard brand constraint on all of this:**
`FieldCopyAudit.forbiddenWords = ["inbox", "ai"]`, whole-word case-insensitive
(`CaptureKit/CaptureKit/Support/FieldCopyAudit.swift:17-24`), enforced by a grep sweep in
`scripts/capture-gate.sh:36-60` rooted at both `Capture/` and `CaptureKit/`. *"nothing a designer
reads ever says 'AI'."*

**EVIDENCE — two locale/vocabulary limits.** `SFSpeechRecognizer(locale: Locale(identifier: "en-US"))`
is hard-coded (`SpeechVoiceNoteService.swift:76`); `VNRecognizeTextRequest` sets no
`recognitionLanguages`. **INFERENCE:** English only, and the OCR runs Vision's default language set.

**INFERENCE — the adoption gap.** Deployment target is iOS 18.0 yet the code uses only pre-iOS-18
Vision request classes; `grep "@available(iOS"` across both targets returns **zero** hits, and zero
iOS 26 APIs (`glassEffect`, `SpeechAnalyzer`/`SpeechTranscriber`, `RecognizeTextRequest`,
`ClassifyImageRequest`, `FoundationModels`, `scrollEdgeEffect`, `navigationSubtitle`,
`backgroundExtensionEffect`) appear anywhere.

---

## 7 · Offline & sync

**EVIDENCE — offline is a first-class design constraint, not an afterthought.** *"The door MUST work
offline: never an empty list, never a spinner, never a disabled control"*
(`CaptureKit/CaptureKit/Work/CaptureProjectCache.swift:5-6`).

**Five independent durable queues**, all SwiftData `@Model`s in one App Group store
(`CaptureStore.schema`, `CaptureKit/CaptureKit/Persistence/CaptureStore.swift:79-87`):

| Queue | Model | Drainer | Resumed from |
|---|---|---|---|
| captures | `Specimen` + `CapturePhoto` + `CaptureMeasurement` | `LocalCaptureSyncService.drain()` | `RootView.reconcileQueues` (`RootView.swift:448-473`) |
| scan artifacts | `ScanUploadRecord` | `SupabaseSiteScanService.reconcilePendingUploads()` + background `URLSession` | same + `handleEventsForBackgroundURLSession` (`CaptureApp.swift:39-48`) |
| visit close | `FieldVisitCloseRecord` | `VisitCloseOutboxDrainer` | same |
| hours | `TimeEntryOutboxRecord` | `TimeEntryOutboxDrainer` | same |
| guest deliveries | `SiteRequestOutboxRecord` | `SiteRequestOutboxDrainer` | **only** a 5-second foreground poll while the guest screen is open (`SiteRequestScreens.swift:1159-1172`) |

**EVIDENCE — the capture path.** `enqueue` only touches the local outbox and never blocks
(`LocalCaptureSyncService.swift:109-135`). `commit` uploads to `capture-media` with
`upsert: true` so a retry overwrites the same object, then calls `commit_field_capture`, idempotent
on `p_client_capture_id` (`SupabaseCaptureGateway.swift:38-57`). Failures are classified: `.notAuthenticated`
and `.remoteUnavailable` are `isDeferrable` and leave the row queued with **no retry penalty and no
failure badge** (`LocalCaptureSyncService.swift:47-52`).

**EVIDENCE — conflict handling is idempotency, not merge.** Client-minted UUIDs are the idempotency
key everywhere: `margin_notes` / `project_tasks` inserts collide on the primary key (23505) and the
orchestrator reads that as "already written" (`SupabaseFieldWriteGateway.swift:14-17`); `log_time` is
`ON CONFLICT (id) DO NOTHING` + read-back (`:75-82`); `existingPlacement(for:)` probes
`project_ffe_specs.routing_source->>captureId` before replaying a placement
(`SupabaseCaptureGateway.swift:69-97`). **INFERENCE:** there is no last-writer-wins merge and no
server→client conflict UI; the design is "never write twice, never lose the local copy".

**EVIDENCE — a committed row is never demoted.** `enqueue` refuses to re-stamp `.queued` on a
specimen with a confirmed receipt, because its local media has been swept and the re-run would end
`.rejected` on a capture the server accepted (`LocalCaptureSyncService.swift:112-124`).

**EVIDENCE — local media has a lifecycle.** `MediaRetentionPolicy.softCapBytes = 512 MB`; the sweep
deletes oldest-first **only among already-receipted files**, never anything un-receipted
(`CaptureKit/CaptureKit/Persistence/MediaRetentionPolicy.swift:13-19`), run at the end of a
successful drain (`LocalCaptureSyncService.swift:203-206`).

**EVIDENCE — the store degrades honestly.** `CaptureStore.resilient(persistent:)` walks on-disk rungs
(App Group → Application Support) and only then falls to memory, reporting
`persistence`, `didResetIncompatibleStore`, `deferredUntilUnlock` and per-rung failures
(`CaptureStore.swift:36-72`). `AppContainer.reportStoreOpen` emits `store.reset_incompatible` and
`store.in_memory_fallback` — *"a degraded store must never be silent"* (`AppContainer.swift:221-245`).
It handles pre-first-unlock background relaunch (`AppContainer.swift:99-107`).

**EVIDENCE — reachability only wakes the camera.** `FieldReachability` (`NWPathMonitor`) is
instantiated in exactly one place: `ViewfinderScreen.swift:19`, started at `:135-139` with
`model.drainOnReconnect()`. Its own header says drains previously fired *"only on enqueue, on launch
reconciliation, and on a manual Retry all"*
(`Capture/Services/Resilience/FieldReachability.swift:4-7`).
**INFERENCE:** regaining signal while on Today, a project, the People room or a site-request screen
does **not** trigger any drain; you must return to C1, relaunch, or pull-to-refresh.

**EVIDENCE — what is *not* cached.** Only two read caches exist: `CaptureProjectCache` (SwiftData —
project names, two room lanes, filing coordinates) and `PeopleRoomCache` (per-project JSON files,
with queued writes for `recordNotice` and `mintFieldLink` —
`CaptureKit/CaptureKit/Work/PeopleRoomCache.swift:1-18`). `WorkDashboardModel` has **no** cache: each
of `loadProjects/loadLeads/loadDecisions/loadThreads/loadReceiving` goes straight to the network and
on failure sets `.error("… couldn't load")` (`Capture/Features/Work/WorkDashboardModel.swift:185-232`).
`myHours` likewise returns `[]` on failure and the section simply disappears
(`WorkDashboardScreen.swift:145-151`).
**INFERENCE:** with no signal, the app's *home screen* shows five red retry rows and no work.

**EVIDENCE — the visit model tolerates a dead day.** `CaptureVisitPolicy` encodes a 30-minute
"still here?" confirm, a 12-hour auto-end, and no resume across a calendar day
(`CaptureKit/CaptureKit/Session/CaptureVisitPolicy.swift:1-30`); expiry is reaped by whichever
surface notices first and emits exactly once (`RootView.swift:530-546`).

---

## 8 · Architecture & dependencies

- **Three modules** (EVIDENCE, `generate_project.rb:27-29`): `CaptureKit` (framework — domain types,
  pure policy, seams, design tokens, **no SDKs**), `CaptureKitMocks` (framework), `Capture` (app —
  all SwiftUI screens, all SDK use).
- **Generated project** (EVIDENCE): `Capture.xcodeproj` is produced by
  `scripts/generate_project.rb`, which globs `**/*.swift` and calls `predictabilize_uuids` twice so a
  regen on an unchanged tree leaves `git status` clean (`:283-296`). Adding a file requires a regen
  and a committed pbxproj diff. `git status apps/mobile/Capture` is currently clean.
- **Remote SPM** (EVIDENCE, `generate_project.rb:236-242`): `supabase-swift` ≥ 2.40.0 and
  `posthog-ios` ≥ 3.48.0, **app target only**.
- **Local SPM** (EVIDENCE, `:283-285`): `../PatinaDesignKit` linked into **both** app and
  `CaptureKit` (dynamic product, embedded once).
- **Persistence** (EVIDENCE): SwiftData. 8 `@Model` types — `Specimen`, `CapturePhoto`,
  `CaptureMeasurement`, `CaptureProjectRef`, `ScanUploadRecord`, `SiteRequestOutboxRecord`,
  `FieldVisitCloseRecord`, `TimeEntryOutboxRecord` (`CaptureStore.swift:79-87`), in the
  `group.cloud.patina.field` App Group container (`:98-107`). Plus `UserDefaults` in the same group
  and a Keychain store for the guest token (`KeychainGuestAccessTokenStore.swift`).
- **Concurrency** (EVIDENCE): `SWIFT_VERSION = '5.0'` (`generate_project.rb:35`), and
  `SWIFT_STRICT_CONCURRENCY` appears **0 times** in the pbxproj. Style is heavily MainActor-bound:
  191 `@MainActor`, 33 `@Observable`, 224 `@State`, 137 `Task {`, 25 `async let`. **Zero** `actor`
  declarations; 17 `@unchecked Sendable` and 4 `nonisolated(unsafe)` carry the off-MainActor work
  (notably `SpeechVoiceNoteService`, which documents four threads behind `OSAllocatedUnfairLock`,
  `SpeechVoiceNoteService.swift:29-38`). **INFERENCE:** Swift 6 language mode has not been adopted;
  the 17 `@unchecked Sendable` sites are where it would bite first.
- **Tests** (EVIDENCE): 51 files in `CaptureTests` (~15 k lines) linking `CaptureKit` + `CaptureKitMocks`
  with **no app host** (`generate_project.rb:159-166, 192-201`) — so `ViewfinderModel`,
  `LocalCaptureSyncService`, `SpeechVoiceNoteService` and every screen are **not unit-testable**.
  `CaptureUITests` exists but contains exactly one file, `PeopleRoomUITests.swift`.
  `capture-gate.sh test` runs `-scheme CaptureKit` only (`capture-gate.sh:21-27`); `lint` silently
  no-ops and exits 0 when swiftlint is absent (`:28-35`).
- **Screenshot harness** (EVIDENCE): `scripts/capture-shots.sh` sweeps 72 named screens via
  `-CaptureScreen <suffix>` + `simctl` screenshot.

---

## 9 · Deployment target & Swift version

- **EVIDENCE:** `DEPLOYMENT = '18.0'` (`scripts/generate_project.rb:17`), applied to every target.
- **EVIDENCE:** `SWIFT_VERSION = '5.0'` (`:35`).
- **EVIDENCE:** `TARGETED_DEVICE_FAMILY = '1,2'` (iPhone **and iPad**) with
  `UISupportedInterfaceOrientations = UIInterfaceOrientationPortrait` and
  `UIRequiresFullScreen = YES` (`:37, 99-104`) — the comment explains the ITMS-90474 workaround.
- **EVIDENCE:** `MARKETING_VERSION = '0.1'`, `CURRENT_PROJECT_VERSION = '6'` with an in-file warning
  that TestFlight build 5 is already uploaded (`:87-88`).
- **EVIDENCE:** `DEVELOPMENT_TEAM = 'VP22LXHT7L'`, automatic signing (`:42`).
- **EVIDENCE — iOS 26 API adoption: none.** Zero `@available(iOS …)` annotations across both
  targets; zero hits for `glassEffect`, `scrollEdgeEffect`, `SpeechAnalyzer`, `SpeechTranscriber`,
  `FoundationModels`, `RecognizeTextRequest`, `ClassifyImageRequest`, `backgroundExtensionEffect`,
  `navigationSubtitle`, `tabBarMinimizeBehavior`. The only forward-looking note is a comment:
  *"Optimized for iOS 26.5 on a 15/17-Pro-class LiDAR iPhone"*
  (`Capture/Features/SiteScan/SharedARCaptureRig.swift:38-39`).
- **EVIDENCE — App Intents: none.** `grep "AppIntent\|AppShortcut\|ControlWidget\|CameraCaptureIntent"`
  → 0 hits. The Settings "Action Button" row is cosmetic: tapping "Rebind" just opens iOS Settings
  (`Capture/Features/Settings/SettingsScreen.swift:189-201`).
- **EVIDENCE — privacy manifest present** (`Capture/PrivacyInfo.xcprivacy`, tracking `false`,
  UserID + ProductInteraction collected for analytics), shipped via the Resources phase
  (`generate_project.rb:153-158`).

---

## 10 · Design tokens

**EVIDENCE — both.** `CaptureKit/CaptureKit/Design/` holds the app's semantic token layer, and every
token re-points at `PatinaDesignKit`:

- `CaptureColor.swift:16-70` — `verdigris = PatinaColors.clay`, `paper = PatinaColors.Background.primary`,
  `ink = PatinaColors.Text.primary`, etc. The header records the R28 "flip": legacy Capture names
  survive as aliases so *"~230 call sites keep compiling"*, and *"Raw hex is banned outside this file
  by the SwiftLint token ratchet"*.
- `CaptureType.swift:14-35` — Playfair Display (display serif) / Inter (body) / DM Mono (eyebrow),
  the faces vendored by `PatinaDesignKit` and registered process-wide at launch
  (`Capture/App/CaptureApp.swift:18-23`, `PatinaFonts.registerAll()`).
- Other design files: `Color+Hex.swift`, `FieldVerbControls.swift`, `ProvenanceBadge.swift`,
  `SpecimenFieldRow.swift`.
- `PatinaDesignKit` itself (`apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/`) ships 13
  components (`PatinaButton`, `PatinaCard`, `PatinaEmptyState`, `PatinaSheetHeader`, `FilterChip`,
  `PatinaStatusBadge`, `StrataMarkView`, …) and 9 vendored `.ttf` faces.

**EVIDENCE — the ratchet.** `.swiftlint.yml` custom rules `raw_hex_color` (`Color(hex: 0x`) and
`untokenized_font` (`Font.custom(`) are `severity: warning`, excluded only under `.*/Design/.*`;
`capture-gate.sh lint` runs `swiftlint --strict`, which promotes warnings to errors
(`apps/mobile/Capture/.swiftlint.yml:13-27`, `scripts/capture-gate.sh:29`).

**EVIDENCE — direct `PatinaDesignKit` imports in feature code: 13 files** (e.g. `V0VisitSheet.swift`,
`LogTimeSheet.swift`, `V4VisitReviewScreen.swift`, `FieldCompanionHearthView.swift`).
**INFERENCE:** the newest surfaces reach past `CaptureColor`/`CaptureType` straight to the shared kit,
so the token layer is now a partial abstraction rather than a strict one.

**EVIDENCE — dark mode.** Tokens are dynamic (`CaptureColor.swift:38-56` uses `dynamic(light:dark:)`
and `PatinaColors.Text.*` roles), but the camera realm pins light:
`.environment(\.colorScheme, .light)` on C1 with the comment *"Camera chrome is deliberately dark …
pin light so the dynamic tokens keep their designed values instead of inverting under system dark
mode"* (`ViewfinderScreen.swift:111-115`).

---

## 11 · Accessibility

Raw counts across `Capture/` + `CaptureKit/` (EVIDENCE, grep):

| API | Count |
|---|---|
| `accessibilityIdentifier` | **157** |
| `accessibilityLabel` | **93** |
| `accessibilityElement` | 37 |
| `accessibilityHint` | **22** |
| `dynamicTypeSize` (env read) | 18 |
| `accessibilityAddTraits` | 12 |
| `accessibilityReduceMotion` | 9 |
| `accessibilityValue` | **8** |
| `minHeight: 44` | **45** (+ 8 explicit 44×44 frames) |
| `UIAccessibility.post(.announcement)` | **1** (`FieldCompanionHearthView.swift:440`) |
| `accessibilityElementsHidden` | **0** |
| `accessibilitySortPriority` | **0** |
| `accessibilityReduceTransparency` | **0** |
| `accessibilityDifferentiateWithoutColor` | **0** |
| `accessibilityRespondsToUserInteraction` | **0** |

129 view files in `Capture/Features/`.

**EVIDENCE — strengths.** Every screen carries a stable `accessibilityIdentifier` keyed off
`CaptureScreenID` (checked exhaustively: the only ids never applied to a view are `e1AppIcon`,
`e2SystemEntry`, `c2Framing`, `c3Specimen`, `r1LowLight` — all *states* of C1, not screens).
Dynamic Type at accessibility sizes genuinely re-lays-out: the Work header switches from HStack to
VStack and the Browse grid from adaptive-columns to a single column
(`WorkDashboardScreen.swift:163-176, 358-364`). Reduce Motion is honored on the onboarding
transition (`OnboardingFlowView.swift:66`), the capture-card animation
(`ViewfinderScreen.swift:118-123, 187`) and the Work content animation
(`WorkDashboardScreen.swift:138-141`). Labels are composed, not decorative — e.g.
`"Visit: \(chip.primary), \(chip.secondary)"` (`ViewfinderControls.swift:71`),
`"Multi-shot, \(count) angles. Release to keep."` (`:300`). The most recent commits are explicitly
accessibility fixes: *"W5 r2 — name the People room's five inputs for VoiceOver"* (`9fb8ee308`),
*"44pt tap targets on five People-room controls"* (`76abe1683`), *"the dead zone in the site-access
card, the mint result screen's 44pt floor, and dimmed disabled rows"* (`dda070a32`).

**EVIDENCE — gaps.** Only 8 `accessibilityValue` calls across ~129 view files, so live values
(queue depth, coverage percentage, upload progress, hour totals) are mostly spoken as part of a
label or not at all. One announcement in the whole app, and it is the Companion's progress milestone
— nothing announces "capture saved", "sync complete", "back online", or a drain failure. No
`accessibilityElementsHidden`, so purely decorative chrome (framing guides, level readout, gradient
backdrops) is not systematically hidden from VoiceOver — the framing guides are
`.allowsHitTesting(false)` (`ViewfinderScreen.swift:56`) but that is not an a11y hide. Zero handling
of Reduce Transparency or Differentiate Without Color, while several states are signalled by color
alone (the provenance badge maps six sources to three colors,
`CaptureColor.swift:64-70`; the three Work attention sections differ by accent color,
`WorkDashboardScreen.swift:82-102`). The live camera preview is a `UIViewRepresentable`
(`CameraPreviewView.swift`) with no accessibility description of what is in frame.

---

## 12 · Friction — evidenced

**F1 · Settings, Account and sign-out are unreachable in a shipping build.** See §2.2. A designer who
signs into the wrong workspace, or wants to change units/haptics/default-project, has no path.
EVIDENCE: `SettingsScreen`/`AccountScreen` have no caller outside `CaptureDeepLink.swift:119-120`,
and `verificationHarnessAllowed` is `false` in Release on device (`CaptureDeepLink.swift:250-256`).

**F2 · No signal = an empty home.** Today is home (`FieldLaunchPolicy.swift:35`), and Today's five
network sections have no cache — each renders `"… couldn't load"` with a Retry button
(`WorkDashboardModel.swift:185-232`, rendered `WorkDashboardScreen.swift:313-351`). On a basement
job site the first thing the app shows is five failures. The *capture* path is genuinely offline-safe;
the *home* path is not.

**F3 · Regained signal does not drain unless you are on the camera.** `FieldReachability` is wired
into `ViewfinderScreen` alone (`ViewfinderScreen.swift:19, 135-139`). EVIDENCE + INFERENCE: walking
out of a dead zone while reading the People room or a site request leaves every queue parked until
relaunch or a manual retry.

**F4 · Camera is a single fixed lens with no focus, exposure or zoom control.**
`AVCaptureDevice.default(.builtInWideAngleCamera, …)` is the only device requested
(`AVFoundationCameraService.swift:180`), and `grep` for `focusPointOfInterest`,
`exposurePointOfInterest`, `videoZoomFactor`, `maxPhotoDimensions`, `photoQualityPrioritization`,
`builtInUltraWide`/`Dual`/`Triple` returns **zero hits**. INFERENCE: no macro for a fabric weave or a
hardware knob, no tap-to-focus on a spec label behind glass, no exposure compensation for a
backlit window wall, and photos are captured at the default (not maximum) dimensions.

**F5 · The primary one-handed controls sit in the two hardest corners.** C1's top bar puts the
realm-switch button and the visit chip in a leading `VStack` (top-**left**) and the torch pill in a
trailing one (top-**right**) (`ViewfinderScreen.swift:203-219`). Shutter (78 pt) and tray handle
(46 pt) are correctly at the bottom (`ViewfinderControls.swift:237-275`), but switching to Today,
changing the visit, or toggling the torch all require a reach across a gloved hand.

**F6 · Torch is binary-per-tap, and the low-light hint appears *above* the shutter.**
`setTorch` supports off/auto/on (`AVFoundationCameraService.swift:206-215`) but there is no
brightness control; the `ViewfinderLowLightHint` row inserts itself into the bottom stack above the
mode selector (`ViewfinderScreen.swift:224-227`), **shifting the shutter down** exactly when the
light is worst. INFERENCE: a moving shutter under a gloved thumb in a dark mechanical room.

**F7 · Status bar hidden during capture.** `.statusBarHidden(true)` on C1
(`ViewfinderScreen.swift:172`). INFERENCE: on a long outdoor walk-through you lose battery and signal
indicators on the one screen you live in.

**F8 · Portrait-only, on iPhone *and* iPad.** `UISupportedInterfaceOrientations = Portrait` +
`UIRequiresFullScreen = YES` with `TARGETED_DEVICE_FAMILY = 1,2`
(`generate_project.rb:37, 99-104`). INFERENCE: a wide elevation, a long run of cabinetry, or an iPad
used on a job-site cart cannot be framed landscape.

**F9 · Outdoor legibility is unaddressed.** Camera chrome is pinned to light-mode tokens
(`ViewfinderScreen.swift:113`); chips sit on `.black.opacity(0.38–0.4)` capsules
(`ViewfinderControls.swift:196, 270`); the low-light hint is driven by a luma probe but there is no
sunlight/high-brightness path, no Increase Contrast handling
(`accessibilityReduceTransparency` = 0 hits, `accessibilityDifferentiateWithoutColor` = 0 hits).

**F10 · Haptics are allocated per call, never prepared.** `CaptureHaptics.impact/selection/success`
construct a fresh `UIFeedbackGenerator` on every invocation with no `prepare()`
(`Capture/Features/Capture/CaptureHaptics.swift:17-38`). INFERENCE: first-tap latency on the shutter
confirmation — the one feedback a gloved user relies on because they cannot see the screen edge.

**F11 · No hardware shutter of any kind.** No volume-button capture, no Action Button intent, no
Camera Control (`grep AppIntent|AppShortcut|CameraCaptureIntent` → 0 hits). The Settings row that
says "Action Button · Capture" only deep-links to iOS Settings
(`SettingsScreen.swift:189-201`). INFERENCE: the row promises a binding the app cannot provide.

**F12 · Voice transcription is en-US-only and may leave the device.**
`SFSpeechRecognizer(locale: Locale(identifier: "en-US"))` (`SpeechVoiceNoteService.swift:76`);
`requiresOnDeviceRecognition` follows `supportsOnDeviceRecognition` (`:314-315`), and the usage
string admits *"otherwise the recording is transcribed by Apple"* (`generate_project.rb:112-116`).
The header notes `isAvailable` goes false *"exactly where the audio matters most — a locale that
needs the server, on a site with no signal"* (`SpeechVoiceNoteService.swift:19-22`).

**F13 · The barcode catalog is a two-row stub.** `DataScannerCodeService.catalogTitle` looks a GTIN up
in a hard-coded dictionary of two entries and returns "Linked catalog item" for any URL
(`DataScannerCodeService.swift:29-45`). INFERENCE: N2 scans a tag and, in practice, tells the designer
nothing about the product.

**F14 · Leads, Decisions and Projects are read-only in the field.** `LeadsService` exposes only
`listOpenLeads`/`leadDetail` (`LeadsService.swift:44-45`); `DecisionsReadService` only
`listPending`/`decisionDetail` (`:88-90`); `ProjectsService` only `listProjects`/`projectDetail`
(`:144-146`). INFERENCE: seeing a lead on site and being unable to claim, stage or reply to it is a
dead end that sends the user to a laptop.

**F15 · The camera-denied state has no recovery path.** Only "Open Settings"
(`ViewfinderScreen.swift:291-318`), even though a full `PhotosPicker` import sheet exists and is
registered (`ResilienceScreens.swift:293-300`). INFERENCE: the built fallback is orphaned.

**F16 · The guest outbox only drains while the guest screen is open**, via a 5-second `Task.sleep`
poll (`SiteRequestScreens.swift:1159-1172`) — it is absent from `RootView.reconcileQueues`
(`RootView.swift:448-473`, which resumes sync, siteScan, visitClose and timeEntry). INFERENCE: a sub
who measures a closet with no signal and backgrounds the app has their delivery parked until they
re-open the link.

**F17 · Documented, unfixed upload hazard.** *"there is no per-artifact continuation watchdog. If an
adopted/in-flight task neither completes nor re-delivers a terminal event, the awaiting `upload()`
continuation for that kind never resolves"*
(`Capture/Features/SiteScan/FieldBackgroundScanUploader.swift:27-31`). The same file flags
background continuation, airplane-mode resume and the 500 MB unattended path as
**DEVICE-VERIFICATION-OWED** (`:12-14`).

**F18 · App-target code is structurally untestable.** `CaptureTests` links `CaptureKit` +
`CaptureKitMocks` with no app host (`generate_project.rb:159-166`), so the 1187-line sync service,
the 781-line `ViewfinderModel` and every screen have zero automated coverage; one XCUITest file
exists. `capture-gate.sh lint` exits 0 when swiftlint is missing (`capture-gate.sh:28-35`).

**F19 · Stale in-repo documentation.** `CaptureScreenID.swift`'s header says 78 entries and calls
`v4VisitReview` reserved — there are 79 and V4 ships. `scripts/capture-shots.sh:49-57` still excludes
V4 from the sweep. `docs/design/field-companion/field-companion-plan.md` §0.1 C3 asserts *"There are
no UI tests. `CaptureUITests/` is an empty directory"* and *"exactly four targets"* — both now false.

**F20 · Mock fixtures ship in the production binary.** `generate_project.rb:205-212` embeds
`CaptureKitMocks` into the app; `CaptureDeepLink.swift:10` imports it unconditionally. Usage is
guarded by `runsRealServices`, but the code and fixture data are in the shipped `.app`.

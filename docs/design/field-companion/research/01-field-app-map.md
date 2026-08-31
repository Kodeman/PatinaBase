# D1 — Patina Field (iOS) deep map

**Scope:** everything under `/Users/kody/Code/patina-merged/apps/mobile/Capture`
(242 Swift files, ~47,842 lines). Read-only survey, 2026-08-24.
Every claim below is cited to a file (and line where useful). Statements I could
not confirm from code are marked **(inference)**.

**Targets that actually exist** (`scripts/generate_project.rb:28-30,129`):
`CaptureKit` (framework), `CaptureKitMocks` (framework), `Capture` (app),
`CaptureTests` (unit-test bundle). Bundle id `cloud.patina.field`
(`generate_project.rb:69`), team `VP22LXHT7L` (`:42`), deployment via a
**generated** `Capture.xcodeproj` — `project.pbxproj` is never hand-edited
(`README.md`, "Build").

> **`CaptureShareExtension/` and `CaptureWidgets/` are EMPTY directories.**
> `find CaptureShareExtension CaptureWidgets -type f` returns nothing;
> `grep -c "CaptureShareExtension\|CaptureWidgets" Capture.xcodeproj/project.pbxproj`
> returns `0`; `generate_project.rb` declares no such targets. The README's
> "`CaptureShareExtension/`, `CaptureWidgets/` — Team F (Phase 1)" line
> (`README.md`, Architecture) is **aspirational, not shipped**.
> `CaptureUITests/` is also empty — there are **no UI tests**.

---

## 1. Screen inventory

Screen ids are frozen in one enum:
`CaptureKit/CaptureKit/Support/CaptureScreenID.swift` — **71 cases**
(the file's own header comment still says "51 entries" — stale).
Every screen sets `.accessibilityIdentifier(CaptureScreenID.<x>.rawValue)`.

Composition: `Capture/App/Composition/AppContainer.swift` branches once on
`AppConfiguration.runsRealServices` (`Capture/App/Configuration/AppConfiguration.swift:100-110`):
**mock** on Simulator (unless `-CaptureForceReal`), under `-CaptureUseMocks`,
`--uitesting`, or `-CaptureUITest`; **real** on a physical device.
Camera + Location stay mocked even in real mode when on Simulator
(`AppContainer.swift:107-113`).

**Every Phase-2 `<Flow>ServiceFactory` now returns a REAL Supabase concrete** —
the "freeze leaves these returning the mock" comment in `AppContainer.swift:88-91`
is stale. Verified: `ProjectsServiceFactory`, `LeadsServiceFactory`,
`DecisionsServiceFactory`, `MessagesServiceFactory`, `ReceivingServiceFactory`,
`QRApproveServiceFactory`, `SiteScanServiceFactory` (each a one-line file under
`Capture/Features/<Flow>/`), plus `SiteRequestServiceFactory`
(`Capture/Features/SiteRequests/SupabaseSiteRequestService.swift:319`).

| id | screen | file | purpose | entry point | real vs mock | placeholder copy? |
|---|---|---|---|---|---|---|
| **O1** | Welcome | `Features/Onboarding/WelcomeScreen.swift` | first-run promise, "Get started" / "I already have an account" | `RootView.rootContent` phase `.auth`, step 0 | phase screen; `StubWorkspaceAuthorizer` in mock | no |
| **O2** | Connect & pick workspace | `Features/Auth/ConnectWorkspaceScreen.swift` (574 ln) | Sign in with Apple (native `ASAuthorizationController` + nonce) **or** 6-digit email OTP; then pick org | onboarding step 1 | `SupabaseWorkspaceAuthorizer` (real) / `StubWorkspaceAuthorizer` (mock). Real mode seeds **empty** workspace list (`RootView.swift:386`) | no |
| **O3** | Camera priming | `Features/Onboarding/CameraPrimingScreen.swift` | in-app primer before the system camera prompt | step 2 | view-only (integrator owns `AVCaptureDevice` request) | no |
| **O4** | Ready | `Features/Onboarding/ReadyScreen.swift` | confirms setup, teaches Action Button / Control Center | step 3 | view-only | no |
| **E1** | App-icon entry | *(no screen; `CaptureDeepLink` case → viewfinder)* | production cold entry | `field://capture` / app icon | n/a | n/a |
| **E2** | System entry | *(same)* | Action Button / Control Center entry | `CaptureDeepLink.swift:81-83` | n/a | n/a |
| **E3** | Share sheet | *reuses `.photoImport`* (`Features/Resilience/ResilienceScreens.swift`) | share-import finisher | `CaptureDeepLink` `.e3ShareSheet → present(.photoImport)` | PhotosUI | no |
| **C1** | Viewfinder (**camera-realm root**) | `Features/Capture/ViewfinderScreen.swift` + `ViewfinderModel.swift` (434 ln) | live camera, 4 modes (photo/tag/measure/scan), level guides, torch, venue chip, WORK pill, session tray | root of `.camera` realm | `AVFoundationCameraService` on device, `MockCameraService` on sim | no |
| **C2** | Framing guides | `Features/Capture/ViewfinderFramingGuides.swift` | grid + level overlay inside C1 | in-viewfinder state | n/a | no |
| **C3** | Quick-confirm card | `Features/Capture/CaptureCardOverlay.swift` | post-shutter paper card: guessed category+material, Save / Add detail / swipe-down | transient overlay in C1 | n/a | no |
| **C4** | Multi-shot | `ViewfinderControls.swift` (`ViewfinderMultiShotOverlay`) | hold-shutter burst → one specimen | in-viewfinder state | n/a | no |
| **C5** | Specimen sheet | `Features/Specimen/SpecimenSheetScreen.swift` (374 ln) | full editable record + 4 enrichment buttons + Save→S3 | sheet `.specimenSheet(id)` | store-backed | no |
| **N1** | Tag OCR | `Features/Recognition/Tag/TagOCRSheet.swift` + `TagOCRScanner.swift` | Vision text → vendor/SKU/price | sheet `.ocr(id)` | `VisionTagOCRService` (real, both) | no |
| **N2** | Code scan | `Features/Recognition/Code/CodeScanSheet.swift` + `DataScannerView.swift` | DataScanner barcode/QR → typed `ScannedCode` | sheet `.code(id)` | `DataScannerCodeService` — parse is real, **catalog lookup is a 2-entry local stub, no network** (`Services/Recognition/DataScannerCodeService.swift:28-45`) | no |
| **N3** | Measure | `Features/Recognition/Measure/MeasureSheet.swift` + `ARMeasureView.swift` | ARKit measure + manual fallback | sheet `.measure(id)` | `ARKitMeasureService` | no |
| **N4** | Voice note | `Features/Recognition/Voice/VoiceNoteSheet.swift` | hold-to-talk live transcript → note | sheet `.voice(id)` | `SpeechVoiceNoteService` (real) / `MockVoiceNoteService` | no — but see §4 (audio never written) |
| **N5** | Smart guess | `Features/Recognition/SmartGuess/SmartGuessSheet.swift` | Vision `VNClassifyImageRequest` category + OCR-derived material/colour | sheet `.smartGuessCard(id)` | `HeuristicSmartGuessService` (real Vision) / `StubSmartGuessService` | no |
| **R1** | Low light | `Features/Resilience/LowLightTorchOverlay.swift` | torch nudge overlay | ⚠ **never rendered** — the component is referenced only by its own `#Preview` (`:122`). C1's actual low-light UI is `ViewfinderNightChip` + `ViewfinderTorchPill` + `ViewfinderLowLightHint` in `ViewfinderControls.swift` | n/a | no |
| **R2** | OCR fallback | *reuses N1* | manual entry when OCR fails | `.ocr(id)` | n/a | no |
| **R3** | Camera denied | `Features/Resilience/ResilienceScreens.swift` (`.photoImport`) | "Camera is off for Patina Field" + Photos import | sheet `.photoImport` | PhotosUI | no |
| **R4** | Offline | `Features/Resilience/OfflineQueueBanner.swift` + U1 | "No signal · saving on device · N queued" banner | ⚠ **never rendered** — referenced only by its own `#Preview` (`:83-84`). The `-CaptureScreen r4.offline` harness routes to U1 instead | n/a | no |
| **S1** | Assign & venue | `Features/Route/S1AssignVenueScreen.swift` (490 ln) | project / project-room / **FF&E schedule slot** / shelf + editable venue label | ⚠ only from **V1 footer "Route all N"** (`V1SessionTrayScreen.swift:126`), **S2** (`S2CreateProjectScreen.swift:172`), or the deep-link harness | `ProjectsService` + `LocationService` | no |
| **S2** | Create project | `Features/Route/S2CreateProjectScreen.swift` | inline project creation | sheet from S1's project menu | `SupabaseProjectCreator` (real `projects` insert) / nil in mock | no |
| **S3** | Destination | `Features/Route/S3DestinationScreen.swift` | Library vs Inbox; **the only caller of `sync.route()`** | from C3 Save, C5 Save, S1 Continue | `CaptureSyncService` | no |
| **S4** | Saved terminal | `Features/Route/S4SavedTerminalScreen.swift` | library-landing confirmation | after S3 → library | n/a | no |
| **S5** | Inbox terminal | `Features/Route/S5InboxTerminalScreen.swift` | inbox-landing confirmation | after S3 → inbox | n/a | no |
| **V1** | Session tray | `Features/Session/V1SessionTrayScreen.swift` | this visit's captures + "Review each" / "Route all N" | swipe-up / tray handle in C1 (`ViewfinderModel.openSessionTray`) | store | no |
| **V2** | Cull deck | `Features/Session/V2CullDeckScreen.swift` | keep/discard swipe deck (only `.local` transfers, `CaptureRouteSafetyPolicy.canCull`) | sheet `.cullDeck` from V1 | store + sync | no |
| **V3** | Specimen detail | `Features/Session/V3SpecimenDetailScreen.swift` | read/edit one record with provenance badges | route `.specimen(id)` from V1/V2/U1/U2/Work | store | no |
| **U1** | Sync status | `Features/SystemEntry/SyncStatusScreen.swift` (732 ln) | outbox rows + live `SyncSnapshot`, Retry all/Pause, **also lists durable scan uploads** | route `.syncStatus` (Work tile, R4) | `CaptureSyncService` + `SiteScanService` | no |
| **U2** | Library search | `Features/Library/LibrarySearchScreen.swift` | **local-store** search only (`store.search`) — scope chips All / This project / Saved here; dedupe warning | route `.librarySearch` | store only — **no server library search** | no |
| **T1** | Settings | `Features/Settings/SettingsScreen.swift` | `CapturePrefs` in the App-Group defaults: default project & save, units, Action Button rebind, haptics, hold sensitivity, Wi-Fi-only large photos; **DEBUG-only** raster-fixture diagnostics | route `.settings` | UserDefaults(App Group) | no |
| **T2** | Account | `Features/Account/AccountScreen.swift` | identity, active workspace switch, unsynced count, sign-out warning, "Open Work" | route `.account` | `SessionProviding` + store | no |
| **W1** | Work dashboard (**work-realm root**) | `Features/Work/WorkDashboardScreen.swift` (669 ln) + `WorkDashboardModel.swift` | "Needs you / Waiting on others / Moving today" attention sections + 6 Browse tiles | root of `.work` realm | 5 concurrent list calls + local store | no |
| **P1** | Project list | `Features/Projects/ProjectListScreen.swift` | RLS-scoped projects, newest first | Browse tile / `.projectList` | `SupabaseProjectsService` | no |
| **P2** | Project detail | `Features/Projects/ProjectDetailScreen.swift` | header, **"Open Site" → SR01**, phases, milestones, FF&E, rooms | row tap / `.project(id)` | real | no |
| **L1** | Lead list | `Features/Leads/LeadListScreen.swift` | open leads, read-only | Browse tile | `SupabaseLeadsService` (`leads`) | no |
| **L2** | Lead detail | `Features/Leads/LeadDetailScreen.swift` | one lead, read-only. **No room/scan attach** — `leads.room_scan_id` exists but `FieldLead` has no field for it (file header) | row tap | real | no |
| **D1** | Decision list | `Features/Decisions/DecisionListScreen.swift` | pending client decisions, soonest-due first, **read-only** | Browse tile | `SupabaseDecisionsReadService` (`client_decisions`) | no |
| **D2** | Decision detail | `Features/Decisions/DecisionDetailScreen.swift` | options + audit trail, read-only | row tap | real | no |
| **M1** | Inbox | `Features/Messages/InboxScreen.swift` | `comms_threads` list | Browse tile | `SupabaseMessagingService` | no |
| **M2** | Thread | `Features/Messages/ThreadScreen.swift` | history + composer, optimistic send, Realtime tail | row tap | real; **Realtime membership unverified** (see §4) | no |
| **G1** | Arriving POs | `Features/Receiving/ArrivingPOsScreen.swift` | in-flight `purchase_orders` | Browse tile | `SupabaseReceivingService` | no |
| **G2** | Inspection | `Features/Receiving/ReceivingInspectionScreen.swift` | photos + notes (**PhotosPicker only, no live camera**) | sheet `.receivingInspection(poID:)` | real + `ReceivingMediaUploadClient` | no |
| **G3** | Outcome | *same file, step 2* | outcome + submit (`receiving_inspections`, `damage_claims`) | internal step | real | no |
| **Q1** | QR scan | `Features/QRApprove/QRScanScreen.swift` | scans the **designer-portal** sign-in QR (`patina://auth?session=…`) | `.qrScan` | `DataScannerView` | no |
| **Q2** | QR approve | `Features/QRApprove/QRApproveScreen.swift` (448 ln) | Face ID gate → `POST {portal}/api/auth/qr/verify` | sheet `.qrApprove(payload)` | `SupabasePortalAuthApprovalService` | no |
| **F1** | Scan setup | `Features/SiteScan/SiteScanSetupScreen.swift` | project + optional room picker + scan name | Browse tile "Site scan" → `.siteScanSetup` | `SupabaseSiteScanService.ownableProjects()` (narrower than `listProjects()`) | no |
| **F2** | Site scan | `Features/SiteScan/SiteScanHostScreen.swift` (500 ln) | live RoomPlan + coach + anchors + context-capture pills | `.siteScan(projectID:projectRoomID:)` step 1 | `RoomPlanScanSession` / `MockScanSession` | ⚠ **YES** — see §6 |
| **F3** | Scan review | `Features/SiteScan/SiteScanReviewUploadViews.swift` | bundle summary, editable room name, Retake / Continue | step 2 | n/a | ⚠ partly |
| **F4** | Scan upload | *same file* | destination + upload progress + Retry / Finish later | step 3 | `SupabaseSiteScanService.upload` | ⚠ partly |
| **F1.context** | Reference capture (non-Pro) | `Features/SiteScan/SiteScanContextCapture.swift:250-280` (`screen.F1.context` — **not in `CaptureScreenID`**) | non-LiDAR path: photos + voice notes → Inbox, "never labeled a scan" | when `RoomCaptureSession.isSupported == false` | real camera | ⚠ **YES — 3 ESCALATE strings** |
| **SR01–SR12** | Site-request designer loop | `Features/SiteRequests/SiteRequestScreens.swift` (1,567 ln, one `SiteRequestScreen` view switching on `screen`) | SR01 hub · SR02 composer · SR03 item config · SR04 assign+send · SR05 tracker · SR06 review inbox · SR07 measure review · SR08 photo review · SR09 approval · SR10 binder rooms · SR11 binder detail · SR12 binder history | P2 "Open Site" → `.site(screen:projectID:requestID:)` | `SupabaseSiteRequestService` (8 RPCs + `site-request-dispatch`) | no |
| **SR13–SR20** | Site-request guest loop | *same file* | SR13 landing · SR14 checklist · SR15 measure · SR16 photo · SR17 queue · SR18 receipt · SR19 done · SR20 returned | **universal link** `https://client.patina.cloud/field/{token}` → `coordinator.enterGuestRequest` | `site-request-guest` edge fn + `SiteRequestOutboxRecord` | no |

---

## 2. Navigation / IA model

### Two realms, two stacks
`CaptureKit/CaptureKit/Navigation/FieldRealmHistory.swift` defines
`FieldRealm { camera, work }` with **independent `[CaptureRoute]` stacks**.
`CaptureCoordinator` (`Capture/App/Coordinators/CaptureCoordinator.swift`) owns
one `FieldRealmHistory`; `RootView.realmNavigation(_:)` renders a
`NavigationStack` bound to the active realm's path
(`Capture/Features/Root/RootView.swift:236-247`). Crossing realms **never**
flattens the other realm's history (`switchRealm` only dismisses the sheet).

- **camera root** = `.viewfinder` (C1). **work root** = `.work` (W1).
- `coordinator.navigate(to: .work)` is a compatibility shim that calls
  `switchRealm(.work)` — Work is never *pushed* (`CaptureCoordinator.swift:60-67`).

### The WORK pill
`ViewfinderWorkButton` (`Features/Capture/ViewfinderControls.swift:63-82`,
a11y id `field.realm.work`), rendered **top-left of the viewfinder** above the
venue chip (`ViewfinderScreen.swift:104-107`). It calls
`ViewfinderModel.openWork()` (`ViewfinderModel.swift:177-183`) which stops the
AV session, fires `work.open`, then `switchRealm(.work)`.
The return trip is `cameraRealmButton` in the W1 header
(`WorkDashboardScreen.swift:120+`).

### Phases, not tabs
`CapturePhase { launching, auth, permissionPriming, ready }`
(`CaptureNavigation.swift`). `RootView` resolves the phase from
`session.ownerState` (`RootView.swift:317-372`); a fail-closed
`needsWorkspace` / `loading` returns to O1–O4. There is **no tab bar**; the only
persistent chrome is the **Field Companion** hearth strip pinned as a bottom
`safeAreaInset` (`RootView.swift:41-45`, `Features/Companion/FieldCompanionHearthView.swift`,
state machine in `CaptureKit/Companion/`). It is hidden on the live viewfinder,
in modals, and on Q1; feature-owned on `.siteScan` / `.syncStatus`
(`RootView.swift:132-166`).

### Sheets
`CaptureSheet` (15 cases) is a single `.sheet(item:)` on the root
(`RootView.swift:46-48`) resolved through `RouteRegistry`. One sheet at a time —
enrichment sheets chain by *replacing* the presented sheet
(e.g. `VoiceNoteSheet.attach()` → `coordinator.present(.specimenSheet(id))`).

### Deep links (`Capture/App/DeepLinking/CaptureDeepLink.swift`)
- `field://capture` (or no host) → camera realm, reset.
- `field://login?v=1&th=<token_hash>` → `PortalLoginController` (portal→Field QR sign-in).
- `field://screen/<id>` → drives any of the 71 screens. **Gated**: allowed in DEBUG,
  otherwise only when `!runsRealServices` (`CaptureDeepLink.swift:196-202`).
- `https://client.patina.cloud/field/{token}` (universal link, entitlement
  `applinks:client.patina.cloud` in `Capture/Capture.entitlements`) → guest
  site-request realm; the token must pass
  `SiteRequestAccessToken.isNativeSiteRequestToken` (namespace guard against
  legacy field-coordination links).
- URL scheme `field` declared in `Capture/Info.plist`.

### Share extension / widgets
**Do not exist** (see banner above). E3 "share sheet" is only the in-app
`.photoImport` sheet. There is no Live-Activity *widget* target either — the
`ActivityKit` attributes live in `CaptureKit/LiveActivity/CaptureSyncAttributes.swift`
and are driven by `Capture/Services/LiveActivity/CaptureLiveActivityController.swift`,
but with no widget-extension target **(inference: the Live Activity cannot
actually render)**.

---

## 3. Domain + persistence

### SwiftData schema — `CaptureKit/CaptureKit/Persistence/CaptureStore.swift:37-43`
```
Specimen · CapturePhoto · CaptureMeasurement · CaptureProjectRef
ScanUploadRecord · SiteRequestOutboxRecord
```

- **`Specimen`** (`Domain/Specimen.swift`) — the capture record. Key fields:
  `clientToken` (device-stable idempotency key == backend `client_capture_id`,
  never regenerated), `ownerUserID`/`ownerWorkspaceID` (immutable creation-time
  stamp), `captureSessionID` (visit scope), scalar fields, `materials/colors/styleTags`,
  `voiceTranscript/voicePartialTranscript/voiceAudioFilename/voiceDurationSeconds`,
  `scannedCodes`, `provenanceRaw: [String:String]`, `guessConfidenceRaw: [String:Double]`,
  `venue: VenueStamp?`, `destinationRaw`, `statusRaw`, `lifecycleRaw`,
  `remoteId`, `committedProductId`, `uploadProgress`, and the additive
  `placement*` columns (FF&E routing).
- **`VenueStamp`** (`Domain/VenueStamp.swift`) — GPS + placemark + `projectId` /
  `projectName` / `projectRoomId` / `room` / `shelf`. **This is where the
  project association lives on a specimen.**
- **`CaptureEnums.swift`** — `CameraMode{photo,tag,measure,scan}`,
  `SpecimenCategory` (16), `FieldKey` (10), `ProvenanceSource` (8),
  `CaptureDestination{undecided,library,inbox}`, `CaptureStatus` (6),
  `MeasurementAxis`, `MeasureSource`.
- **`ScanUploadRecord`** — durable, resumable site-scan upload state keyed by the
  **container-independent** bundle relative path (`SiteScanBundleHome.relativeKey`),
  holding `scanID`/`roomID`/owner/`artifacts: [ScanArtifactUploadState]`/`receiptID`.
- **`SiteRequestOutboxRecord`** — guest delivery queue with an explicit
  `canTransition` state machine (`queued→uploading→awaitingReceipt→delivered`),
  SHA-256 checksum, exponential backoff (`retryDelay`, capped 3600 s), and
  **terminal** reasons classified from HTTP status by
  `SiteRequestFailureClassifier` (401/404/409/400/413/422 = terminal).

### App-Group store
`appGroupID = "group.cloud.patina.field"` (`CaptureStore.swift:47`, and
`Capture/Capture.entitlements`). `CaptureStore.resilient(persistent:)` walks a
**three-step ladder** — App-Group container → default Application-Support
container → in-memory — logging each fallback and never `try!`-ing
(`CaptureStore.swift:75-115`). Media files live in
`<AppGroup>/CaptureMedia/` (`mediaDirectory()`, `:495`).
UserDefaults for the session also use the App-Group suite
(`SupabaseSessionService.swift:96`).

### Owner scoping (multi-account safety)
`CaptureOwnerIdentity(userID:workspaceID:)` normalizes to lowercase/trimmed and
is `nil` unless **both** are present. Every list/lookup has an owner-scoped
overload (`store.outbox(owner:)`, `store.session(visitID:owner:)`,
`store.specimen(id:owner:)`, `store.scanUploadRecords(owner:)`). Legacy rows with
`nil` owner are **quarantined**, never claimed. `CaptureOwnerProjectionPolicy`
(`CaptureKit/Session/CaptureOwnerProjection.swift`) decides
`.globalFixtures` (mock) / `.owner(_)` / `.unavailable` (fail-closed in real mode).

### Visit scope
`CaptureSessionContextStore` / `CaptureSessionContext`
(`CaptureKit/Session/CaptureSessionContext.swift`) — a visit id + routing memory
(`destination`, `projectID`, `projectName`, `projectRoomID`, `room`, `shelf`),
resumed while the same identity is active and **within a 4-hour inactivity
window** (`CaptureSessionContextPolicy.inactivityWindow`). Reset on any owner
change (`RootView.invalidateOwnerBoundUI`).

### Outbox / sync model
- Wire envelope: `CaptureKit/Sync/FieldCapturePayload.swift` — **camelCase keys ARE
  the contract** for migration `00235`'s `->>` / `#>>` readers (`title, notes,
  category, measurements{width,height,depth,unit}, tag{vendorName,sku,priceTradeCents,
  priceRetailCents,vendorId}, barcode, attributes{materials,colors,finish,styleTags},
  guesses, voice{audioPath,transcript,partialTranscript,durationSeconds},
  photos[]{path,publicUrl,isPrimary,isDuplicate,width,height,order,captureMode},
  thumbnailUrl, venue{lat,lng,accuracyM,label,placeId,capturedAt,timezone},
  provenance, device, schemaVersion`). `schemaVersion = 1`.
- Storage path: `CaptureKit/Sync/CaptureMediaPath.folder(userID:clientToken:)` —
  **both segments lowercased** to match `auth.uid()::text` in the `capture-media`
  RLS policy (migration `00234`). This is the one place the folder string is built.
- Concrete: `Capture/Services/Sync/LocalCaptureSyncService.swift` (750 ln) +
  `Capture/Services/Sync/SupabaseCaptureGateway.swift`.
  - `enqueue()` never touches the network; it marks `.queued`, saves, then
    schedules a drain when a gateway exists.
  - `drain()` is **per-owner serialized** (`activeDrainTasks[owner]`) and
    revalidates `activeOwner == owner` at every await boundary.
  - `commit()` = upload each not-yet-uploaded photo + the voice file to
    `capture-media` (upsert ⇒ idempotent replay) → `commit_field_capture` RPC
    (idempotent on `p_client_capture_id`) → apply receipt.
  - Failure taxonomy: `LocalSyncError.isDeferrable` (notAuthenticated /
    remoteUnavailable) leaves the record **queued with no retry penalty**;
    `isRejected` (destinationRequired / remoteRejected) and
    `CaptureMediaAvailabilityError` mark it **rejected** (review-gated, excluded
    from bulk drain).
  - **Receipt discipline:** `CaptureTransferPhase.complete` is impossible without
    a non-empty `receiptID` (`ScanUploadRecord.applyTransferState`,
    `CaptureRouteSafetyPolicy.confirmedDestination`).
- **Project placement** is an independently retryable second step on the same
  record (`performProjectPlacementIfNeeded` → `ProjectPlacementOrchestrator` →
  lookup-before-write on `project_ffe_specs.routing_source->>captureId`, then
  `place_product_in_project` RPC). No second outbox.

### What survives relaunch
Everything persisted in the App-Group SwiftData store: drafts, queued/failed
specimens, media files, `CaptureProjectRef`s, `ScanUploadRecord`s (same `scanID`
reused → no orphan `room_scans` rows), `SiteRequestOutboxRecord`s, the guest
access token (Keychain, `KeychainGuestAccessTokenStore`), and the per-user active
workspace (App-Group UserDefaults). Site-scan artifact uploads survive
suspension/kill via a **background `URLSession`** with
`sessionSendsLaunchEvents` and the `CaptureAppDelegate` completion-handler seam
(`CaptureApp.swift:41-52`, `FieldBackgroundScanUploader`); orphaned completions
are replayed onto the durable record (`SupabaseSiteScanService.persistOrphanCompletion`).
Reconciliation runs from `RootView.reconcileQueues` **after** readiness, so an
offline launch is never blocked (`RootView.swift:295-315`).
**Not** persisted: the in-memory `CaptureSessionContext` beyond its store, and
anything in mock mode (in-memory container).

---

## 4. Services

### Auth — `Capture/Services/Session/SupabaseSessionService.swift` (552 ln)
- One `SupabaseClient` (`Services/Supabase/SupabaseClientProvider.swift`) shared by
  session, sync gateway, all Work services, and project creation.
- Two native sign-ins, no browser: **Apple** (`signInWithIdToken`, nonce via
  `CaptureKit/Support/SignInNonce.swift`) and **email OTP**
  (`signInWithOTP(shouldCreateUser: false)` → `verifyOTP(type: .email)`).
  `shouldCreateUser:false` is deliberate — Field is invite-only (`:186-196`).
- **Portal QR sign-in**: `signInWithPortalToken(tokenHash:)` →
  `verifyOTP(tokenHash:, type: .magiclink)` (`:239-247`), driven by
  `PortalLoginController` from `field://login`. Edge function `field-login-token`
  exists server-side.
- Hydration: **membership is the security gate** —
  `organization_members → organizations(id,name)` filtered `status = active`
  resolves `workspaces`; `profiles.display_name/full_name` and
  `user_roles → roles.domain` are *informational decoration* hydrated afterwards
  (`performHydration`, `:365-388`). A **failed** query stays `.loading`
  (fail-closed), not `signedOut`. `hydrateAfterSignIn` retries 4× / 250 ms to
  beat the JWT-propagation race.
- Active workspace persisted **per user id** in the App-Group defaults; the
  legacy global keys are deleted on every init (`:96-99`) so a stale workspace can
  never leak across accounts.
- `ownerState` drives everything: `.loading / .signedOut / .needsWorkspace / .ready(owner)`.
- **QR approval (the other direction)** —
  `Features/QRApprove/SupabasePortalAuthApprovalService.swift`: parses
  `patina://auth?session=<64-hex>&exp=…`, gates on `LAContext` Face ID (passcode
  fallback), then `POST {portalBaseURL}/api/auth/qr/verify` with the Supabase JWT.
  Not PostgREST — a bespoke Next.js route.

### Camera — `Capture/Services/Camera/AVFoundationCameraService.swift`
Real `AVCaptureSession` + photo output + CoreMotion level + mean-luma low-light
read. Its header comment "NOT wired into AppContainer yet" is **stale** —
`AppContainer.swift:111-112` wires it on non-simulator. Simulator uses
`MockCameraService`.

### Recognition
| seam | concrete | reality |
|---|---|---|
| `TagOCRService` | `VisionTagOCRService` | real Vision |
| `CodeScanService` | `DataScannerCodeService` | real parse; **catalog lookup = 2-row local dictionary, explicitly "no network"** |
| `MeasureService` | `ARKitMeasureService` | real ARKit + manual |
| `VoiceNoteService` | `SpeechVoiceNoteService` | see below |
| `SmartGuessService` | `HeuristicSmartGuessService` | real `VNClassifyImageRequest` + keyword table + OCR-derived material/colour |

### **The voice path today** — exactly what happens
`Capture/Services/Recognition/SpeechVoiceNoteService.swift`:
1. `requestAuthorization()` — `SFSpeechRecognizer.requestAuthorization` **and**
   `AVAudioApplication.requestRecordPermission`.
2. `startLiveTranscription()` — **on-device-capable `SFSpeechRecognizer(locale:"en-US")`**
   over an `AVAudioEngine` input tap, `AVAudioSession(.record, .measurement)`,
   `shouldReportPartialResults = true`, streaming `TranscriptChunk`s.
   *(Note: `requiresOnDeviceRecognition` is **never set**, so recognition may go
   to Apple's servers — the file header says "on-device", the code does not
   enforce it.)*
3. `finish()` — stops the engine, ends audio, returns
   `VoiceNoteResult(transcript:, audioFilename: audioFilename, durationSeconds:)`.

> **⚠ THE AUDIO IS NEVER WRITTEN.** `private var audioFilename: String?`
> (`:23`) is **only ever read** (`:107`) — no assignment exists anywhere in the
> repo. `private let mediaDirectory: URL?` (`:22`) is stored in `init` and
> **never used**. Verified by
> `grep -rn "audioFilename\|mediaDirectory" --include=*.swift`.
> So on the real device the voice path is **transcript-only**;
> `Specimen.voiceAudioFilename` is always `nil`
> (`VoiceNoteSheet.swift:205` assigns `result?.audioFilename`), the payload's
> `voice.audioPath` is always absent, and `LocalCaptureSyncService.uploadMedia`
> never uploads an audio file. The `voiceDurationSeconds` and transcript **do**
> persist and ship.

**Where the transcript goes** (`VoiceNoteSheet.attach()`, `:200-212`):
`specimen.voiceTranscript = text`, `specimen.voiceDurationSeconds`, **and**
`specimen.setValue(text, for: .note, source: .voice)` — i.e. the transcript is
*also* written into the specimen's `note` field with `ProvenanceSource.voice`.
It then rides `FieldCapturePayload.notes` + `voice.transcript` into
`commit_field_capture`. The sheet falls back to a plain `TextEditor`
("Type the note") whenever authorization fails or the recognizer throws —
which is always on the Simulator.

Mid-scan voice (`SiteScanContextCapture.stopVoice`, `:117-146`) uses the same
service and enqueues a **separate Inbox specimen** via
`ContextCaptureService.enqueueVoice` — again with `audioFilename: nil`.

### Site scan
- **`SharedARCaptureRig`** — the single owner of one custom
  `ARWorldTrackingConfiguration` `ARSession` (scene mesh + smoothed depth), handed
  to RoomPlan via `RoomCaptureView(frame:arSession:)`. "Four streams, one clock"
  (`CaptureTimebase`, `CaptureCadence`).
- **Recorders** (all `CaptureFrameSink`s on the shared session):
  `FieldSceneMeshRecorder` → `mesh.ply` (serialized **once at finish**, on the
  calling thread, because ARKit recycles the mesh buffers);
  `FieldDepthRecorder` → `depth/<frame>.bin` + `depth/depth_index.ndjson` (~1 Hz);
  `FieldKeyframeRecorder` → full-res HEIC + depth + intrinsics + pose, fired on
  ≥0.5 m / ≥15° motion, sharpness-gated, target 200–400/room;
  `FieldPosedPhotoService` → JPEG + 256 px thumb every 2 s, hard-capped, →
  `room_scan_images` (a **separate lane** from keyframes).
- **`FieldCoverageCoach`** → live `CoverageSnapshot` + end-of-scan `Scorecard`
  (`scorecard.json`). Parametric per-surface coverage (walls/floor/ceiling/openings),
  **not** Metal mesh painting.
- **Anchors** — `AnchorCapturing` / `AnchorGate` / `AnchorMeasurementParser`;
  <3 anchors ⇒ the bundle is stamped **UNVERIFIED** (`FieldManifestAssembler`).
- **`ContextCaptureService`** (`CaptureKit/SiteScan/ContextCaptureService.swift`) —
  mid-scan detail photo / voice note → a `Specimen` routed `.inbox` through the
  **existing** outbox. Spatial address rides
  `ContextCaptureProvenance` (`siteScanContext.source|scanId|projectId|projectRoomId|cameraPose|capturedAt`)
  in `Specimen.provenanceRaw` → `field_captures.provenance`. **The `project_id`
  column is deliberately not persisted for inbox rows** — the durable association
  is provenance-only, and `SiteScan.projectRoomID` is a `public.rooms` id
  (incompatible with `field_captures.project_room_id → project_rooms(id)`).
- **Bundle assembler / upload** — `ScanUploadDescriptor.all` is the **11-artifact
  v1 set** in stable upload order: `scan.usdz`, `captured_room.json`, `mesh.ply`,
  `manifest.json`, `depth/depth_index.ndjson`, `scorecard.json`, `anchors.json`,
  `keyframes/keyframe_index.ndjson`, `keyframes/keyframe_summary.json`,
  `depth.tar`, `keyframes.tar`. Transport Content-Types are constrained to the
  bucket allow-list (`ScanBucketMime`), asserted by a drift-guard test.
  Object key = `{folder}/{userId}/{roomId}/{filename}` (`RoomScanStoragePath`),
  bucket `room-scans`.
- **`SupabaseSiteScanService`** (1,375 ln) upload sequence:
  reserve durable record → `validatedUserID` → `ensureRoom` (upsert `rooms` when
  no room was picked) → upsert `room_scans` `status='processing'` (with dims /
  floor_area / coverage from the live session) → tar the heavy dirs →
  `FieldManifestAssembler.refreshArtifacts` → per-artifact background upload
  (skipping already-`uploaded`) → `merge_scan_artifact_sha256` RPC per artifact →
  PATCH the URL columns + `scan_schema_version = 3` → **`confirm-scan-bundle`
  edge function** → best-effort posed-photo upload + one batched
  `room_scan_images` upsert → `persistCompletedScanUploadRecord(receiptID:)` →
  delete the local bundle.
  **`ScanConfirmPolicy`**: only an *unreachable* confirm (transport/5xx) falls
  back to the `mark_scan_upload_complete` RPC; a 4xx (e.g. 409) marks the record
  `.rejected` and surfaces retry rather than marking a broken bundle ready.
- **R2 shadow leg** (`FieldScanUploadShadowLeg` + `MediaUploadIntentClient`) is
  **dormant in every committed build** — `AppConfiguration.edgeAPIURL` has no
  production default by design (`AppConfiguration.swift:44-73`).

### Media-service upload client
`Capture/Features/Receiving/ReceivingMediaUploadClient.swift` — the 3-step
NestJS media protocol: `POST {media}/v1/media/upload` (intent → PAR URL) →
`PUT <parUrl>` → `POST {media}/v1/media/upload/<id>/confirm`, Supabase JWT
bearer, always JPEG re-encoded at 0.85. Base URL
`https://media.patina.cloud` (`AppConfiguration.mediaBaseURL`).
**Used only by Receiving (G2)** — the capture and scan paths never touch it.

### PostHog
`Capture/Services/Analytics/PostHogCaptureAnalytics.swift` — one-shot setup from
`AppConfiguration.postHogAPIKey` (Secrets → `POSTHOG_API_KEY` env → empty).
Empty key ⇒ SDK never initialised, every call a no-op. `captureScreenViews=false`
(manual `screen()`), `register(["surface": "field-ios"])`. Identify fires once
after auth resolves with `["role":"designer","platform":"ios"]`
(`AppContainer.identifyRestoredSession`).

### Messaging Realtime caveat
`SupabaseMessagingService.observeMessages` (`:145`) notes that
`comms_messages`' membership in the `supabase_realtime` publication is
**deployment-level and unverified in migrations** — M2 therefore also
optimistically appends on send and re-fetches on foreground/appear.

---

## 5. End-to-end flows

### (a) Product/specimen capture at a market → server side
1. C1 `photo` mode, shutter **tap** → `ViewfinderModel.pressEnded → captureSingle()`
   (`ViewfinderModel.swift:187-232`).
2. `makeDraft()` — new `Specimen` stamped with owner + `captureSessionID` +
   the auto GPS `VenueStamp` + **the visit's remembered routing**
   (`destination`, `projectID`, `projectName`, `room`, `shelf`).
3. `captureFrame()` — HEIC written to `<AppGroup>/CaptureMedia/<uuid>.heic`,
   a `CapturePhoto` attached.
4. `applySmartGuess()` — ⚠ **hardcoded stub**: always
   `category = "seating"` @ 0.72 and `material = "Oak / bouclé"` @ 0.6
   (`ViewfinderModel.swift:409-419`). These land in `guessConfidenceRaw` +
   `provenanceRaw` and ship in `payload.guesses` / `payload.provenance`.
   (The *real* Vision guess only runs in the N5 sheet, which the photo path
   never opens.)
5. `SpecimenCapturePolicy.nextStep(for: .photo)` → `.quickConfirm` → **C3 card**.
   (`tag`→N1, `scan`→N2, `measure`→N3 instead.)
6. C3 **Save** → `saveFromCard()`: if `destination == .undecided` → present **S3**;
   otherwise `sync.route(id, to:)` directly and jump to **S4/S5**.
7. **S3** is the only `sync.route()` caller. Not-yet-committed records just take
   the destination locally and `enqueue()`.
8. `LocalCaptureSyncService.commit()` → photos upsert-uploaded to
   `capture-media/<uid>/<clientToken>/<file>` → `commit_field_capture`
   RPC with `p_destination`, `p_payload`, `p_project_id`, `p_project_room_id`,
   `p_shelf`, `p_organization_id`.
9. **Server** (`supabase/migrations/00235_commit_field_capture_rpc.sql`):
   - always inserts a `field_captures` row (idempotent on `client_capture_id`);
   - `p_destination = 'inbox'` → `status = 'inbox'`, **no product minted**;
   - `p_destination = 'library'` → **`INSERT INTO products`** (+ `project_products`
     when a project is set), `field_captures.status = 'saved'`; on any failure it
     falls back to `status = 'inbox'` (the safe harbor).
10. `applyCommitResult` trusts **server truth only**: `status == "saved"` ⇒
    library/`lifecycle=saved`; anything else ⇒ inbox.
11. If the record carries a `placement*` target and a `productID` came back,
    `place_product_in_project` runs as a separately retryable step →
    `project_ffe_items` / `project_ffe_specs`.

**So:** Library ⇒ `field_captures` + `products` (+ optional FF&E line).
Inbox ⇒ `field_captures` only.

### (b) Site scan → Room File
1. W1 Browse tile "Site scan" → **F1** (`.siteScanSetup`).
2. F1 picker = `SupabaseSiteScanService.ownableProjects()` — `projects` filtered
   `studio_id = workspace` AND (`designer_id = me` OR `created_by = me`), which
   mirrors the `room_scans_guard_routing` BEFORE-INSERT guard exactly (so F1 can't
   offer a project that would fail at upload). Optional `public.rooms` pick + a name.
3. Start → `.siteScan(projectID:projectRoomID:)`; the name rides a separate
   `SiteScanHandoff` (the frozen route can't carry it).
4. **F2** — `RoomPlanScanSession` on the shared rig; coach overlay + anchor capture
   + the mid-scan context pills. Non-LiDAR devices get `SiteScanContextScreen`
   instead (`SiteScanEntryMode.forDevice`).
5. `finish()` → local bundle dir under `SiteScanBundleHome` +
   `FieldScanResult(localBundleURL:roomName:areaLabel:owner:scorecard:)`.
6. **F3** review (editable name, artifact sizes, verdict) → **F4** upload
   (the full sequence in §4). Bundle bytes are only deleted after a
   receipt-backed `persistCompletedScanUploadRecord`.
7. Server: `room_scans` row (status `processing` → `ready` via
   `confirm-scan-bundle` / `mark_scan_upload_complete`), artifact URL columns,
   `scan_schema_version = 3`, `room_scan_images` rows, then the
   `services/scan-pipeline` worker. The designer portal renders it as **Room File**
   (feature flag `room-file`) — *outside this survey's scope*.
8. Project linkage lives in `supabase/migrations/00265_room_scans_project_linkage.sql`
   — **the README's claim that this is migration `00258` is stale**
   (`00258_edge_settings_vault.sql` is unrelated).

### (c) Voice note today
See §4. Summary: hold the mic → live `SFSpeechRecognizer` transcript → "Attach
note" writes `voiceTranscript` **and** `note` (provenance `.voice`) → C5 sheet →
S3 → `commit_field_capture` (`payload.notes` + `payload.voice.transcript` +
`voice.durationSeconds`). **No audio file is ever produced or uploaded.**
Simulator always falls to the typed-note fallback.

### (d) How a capture gets associated with a project / room
Three mechanisms, and they are **not equivalent**:

1. **`VenueStamp.projectId` / `.projectRoomId` / `.room` / `.shelf`** — set in
   **S1** (`S1AssignVenueScreen.persistRouting`, `:363-405`), carried into
   `CaptureRoutingContext` → `p_project_id` / `p_project_room_id` / `p_shelf`
   on the commit RPC. Only meaningful for the **library** path — the inbox branch
   of `00235` does not persist those columns.
2. **`Specimen.placement*`** — the S1 "FF&E schedule" menu
   (`No line` / `Create a new line` / `Fill an empty slot`), driving
   `place_product_in_project` post-commit.
3. **`provenanceRaw["siteScanContext.projectId"/"projectRoomId"]`** — the
   *only* durable association for mid-scan context captures
   (`ContextCaptureProvenance`), which the portal Inbox must reconcile.

**Reachability problem:** S1 (`.assignVenue`) is presented from exactly three
places (`grep "present(.assignVenue"`): the V1 tray footer's "Route all N"
(`V1SessionTrayScreen.swift:126`), S2 after creating a project
(`S2CreateProjectScreen.swift:172`), and the deep-link harness. **Neither C3 nor
C5 can reach it** — C5's Save goes straight to S3 (`SpecimenSheetScreen.swift:157`),
and C3's Save goes to S3 or straight to route. So the normal capture path offers
**no project picker at all**; a capture inherits a project only from the visit's
`CaptureRoutingMemory`, which is itself only ever populated by a prior S1 pass.

Also: **"Route all N" routes only the first item** —
`if let first = items.first { coordinator.present(.assignVenue(first.id)) }`.
The bulk contract exists (`CaptureSyncService.routeAll`, tested in
`CaptureLifecycleTests.sendAllUsesThePerRecordRouteContract`) but the tray does
not call it.

### (e) Work flows — tables and RPCs
| flow | screens | data path |
|---|---|---|
| **W** Work | W1 | 5 concurrent list calls + `store.outbox()` + `siteScan.pendingUploads()`, folded by `FieldAttentionBuilder` (`CaptureKit/Work/FieldAttention.swift`, 425 ln) into Needs-you / Waiting / Moving-today. Each source fails independently with its own Retry. |
| **P** Projects | P1, P2 | `SupabaseProjectsService`: `projects`, `project_phases`, `project_payment_milestones`, `project_ffe_items`, `project_rooms`, **and `rooms`** (two different room concepts — FF&E labels vs the ids scans attach to). Read-only. |
| **L** Leads | L1, L2 | `SupabaseLeadsService`: `leads` (list + detail). Read-only. |
| **D** Decisions | D1, D2 | `SupabaseDecisionsReadService`: `client_decisions`, `client_decision_options`. **Read-only by design** — selection is the client app's write path. |
| **M** Messages | M1, M2 | `SupabaseMessagingService`: `comms_threads`, `comms_messages`, `profiles`; RPC `rpc_mark_thread_read`; Realtime `postgres_changes` INSERT on `comms_messages`. **Write:** `send()`. |
| **G** Receiving | G1, G2, G3 | `SupabaseReceivingService`: read `purchase_orders`; **write** `receiving_inspections` (+ compensating delete on failure), `damage_claims`, and two `purchase_orders` status updates. Photos via the **media service** (`ReceivingMediaUploadClient`). |
| **Q** QR approve | Q1, Q2 | No PostgREST. `patina://auth` parse → LocalAuthentication → `POST {portal}/api/auth/qr/verify` with the Supabase JWT (schema seeded by `00033_qr_auth_sessions.sql`). |
| **F** Site scan | F1–F4 | `projects` (ownable filter), `rooms` upsert, `room_scans` upsert/patch, `room_scan_images` upsert, storage bucket `room-scans`; RPCs `merge_scan_artifact_sha256`, `mark_scan_upload_complete`; edge fn `confirm-scan-bundle`. |
| **SR** Site requests | SR01–SR20 | Designer RPCs `site_request_create_draft`, `_revise_item`, `_send`, `_resend`, `_revoke_access`, `_approve_item`, `_redo_item`, `_close`; reads `site_requests`, `site_request_items`, `site_request_events`, `project_rooms`, `project_parties`, `site_binder_entries`. Edge fns **`site-request-dispatch`** (authenticated, does the SMS send) and **`site-request-guest`** (opaque-token guest actions `bootstrap` / `upload-intent` / `receipt` / `deliver`). Migrations `00374`, `00375`, `00470`, `00471`. |

---

## 6. Ledger — exists / partial / stubbed / mock-only

**No `TODO` or `FIXME` markers exist anywhere in the app source.** The
placeholder debt is instead marked with a bespoke **`ESCALATE`** convention.

### EXISTS (real, wired end-to-end in real mode)
Auth (Apple + email OTP + portal-QR sign-in + QR approval), workspace hydration
& switching, owner-scoped local store, capture → `capture-media` → `commit_field_capture`,
route/re-route (`route_field_capture`), FF&E placement, the full instrumented
site-scan rig + 11-artifact bundle + resumable background upload + confirm,
posed photos → `room_scan_images`, all 8 Work flows (P/L/D/M/G/Q/F/SR),
the guest site-request loop with a durable receipt-gated outbox, PostHog,
Live-Activity *controller*.

### PARTIAL
- **Voice**: transcript ships; **audio file never written or uploaded**
  (`SpeechVoiceNoteService.swift:23,107`). `Specimen.voiceAudioFilename`,
  `payload.voice.audioPath`, and the mime map's audio branches
  (`LocalCaptureSyncService.mimeType`, m4a/mp4/aac/wav) are dead code today.
- **N5 in the capture path**: the viewfinder's `applySmartGuess` is a fixed
  literal (`seating` / `Oak / bouclé`) — the real `HeuristicSmartGuessService`
  only runs behind the N5 sheet.
- **U2 Library search** searches the **local SwiftData store only** — there is no
  server-side library/dedupe query. From a market this means the dedupe promise
  only covers what this device captured.
- **"Route all N"** routes one record (above).
- **Live Activity**: attributes + controller exist; **no widget-extension target**
  to render them **(inference)**.
- **Realtime tail** on M2 depends on an unverified publication membership
  (self-documented at `SupabaseMessagingService.swift:136-144`).
- **Non-Pro context screen** uses id `screen.F1.context`, which is **not** a
  `CaptureScreenID` case — it is invisible to `capture-shots.sh` and the harness.

### STUBBED (honest local stand-ins, no network)
- `DataScannerCodeService.catalogTitle` — 2 hardcoded GTINs.
- `ViewfinderModel.flagNearDuplicates` — "same pixel dimensions" heuristic.
- `StubWorkspaceAuthorizer` (mock only).

### MOCK-ONLY
Everything under `CaptureKitMocks/` when `runsRealServices == false`:
`MockCameraService`, `MockLocationService`, `MockSessionProviding`,
`InMemoryCaptureSyncService`, `MockCaptureAnalytics`, and the 7 Work mocks +
`MockScanSession` + `MockSiteScanService`. Fixture ids in `WorkFixtures` /
`SiteRequestFixtures` are what the `-CaptureScreen` harness resolves detail
screens to. `MockFailure` launch args (`-CaptureMockFailUpload`,
`-CaptureMockFailProjects`) drive error states on the Simulator.

### DEAD (compiled, never reached at runtime)
Verified by grepping every reference outside `#Preview` blocks and the test target:
- **`OfflineQueueBanner`** (`Features/Resilience/OfflineQueueBanner.swift`) — R4's
  "No signal · saving on device · N queued" banner is referenced only at `:83-84`,
  inside its own `#Preview`. **The offline state has no persistent on-camera
  affordance**; the only offline surface is U1, reached deliberately.
- **`LowLightTorchOverlay`** (`Features/Resilience/LowLightTorchOverlay.swift:122`) —
  same: preview-only. (Low light *is* surfaced on C1, but through
  `ViewfinderNightChip` / `ViewfinderTorchPill` / `ViewfinderLowLightHint`
  in `ViewfinderControls.swift`, not this component.)
- **`FieldPlaceholderScreen`** (`CaptureKit/Design/FieldPlaceholderScreen.swift`) —
  the Phase-2 freeze placeholder; zero references now that every wave shipped.
- Audio-mime branches in `LocalCaptureSyncService.mimeType` (m4a/mp4/aac/wav) —
  unreachable while no audio file is ever produced (§4).

### DOES NOT EXIST
`CaptureShareExtension/` (empty), `CaptureWidgets/` (empty), `CaptureUITests/` (empty).

### ESCALATE-class placeholder copy (all user-facing, flagged for Kody)
| file | what |
|---|---|
| `Features/SiteScan/SiteScanCoachViews.swift` | header: "ALL user-facing strings here are ESCALATE-class PLACEHOLDERS"; `"UNVERIFIED"` stamp (`:75`), `"Before you leave"` (`:92`); `SurfaceLabeler` humanizer (`:124`), warning copy (`:137`), verdict headline (`:147`) |
| `Features/SiteScan/SiteScanAnchorViews.swift` | header: same; `"span N"` labels (`:55`), the whole panel block (`:168-207`), `"Check the value"` (`:246`) |
| `Features/SiteScan/SiteScanContextCapture.swift` | header: same; `"Reference capture"` (`:261`), `"Photos & notes for this room"` (`:264`), `"This device has no LiDAR, so this isn't a scan — these land in your Inbox."` (`:267`) |
| `Features/SiteScan/FieldCoverageCoach.swift:189` | surface labels "relative + ESCALATE placeholders" |
| `CaptureKit/SiteScan/CaptureSurface.swift:14,44` | `displayLabel` is ESCALATE wording |
| `CaptureKit/SiteScan/CoverageScorecard.swift:55,74` | gap `phrase` is ESCALATE wording |
| `CaptureKit/SiteScan/ScorecardEvaluator.swift:13,73,81,85` | gap wording + compass-bearing naming are placeholders |
| `CaptureKit/SiteScan/AnchorGate.swift:42,53,136` | long/short heuristic + its copy are ESCALATE-class |
| `CaptureKit/SiteScan/AnchorRecord.swift:39` | ESCALATE placeholder labels |

Also stale-doc debt: `CaptureScreenID.swift` header says 51 (it's 71);
`README.md` says migration `00258` for scan-project linkage (it's `00265`) and
lists Share/Widget targets that don't exist;
`AVFoundationCameraService.swift:6` says "NOT wired into AppContainer yet" (it is).

---

## 7. Tests

**20 files, 284 `@Test` cases**, all in the `CaptureTests` unit-test bundle
(no XCUITests). Run via the **CaptureKit scheme** (`scripts/capture-gate.sh`).

| suite file | covers |
|---|---|
| `AnchorTests.swift` | feet/inches grammar incl. smart quotes, anchor record round-trip, <3-anchor UNVERIFIED gate, span classification, coach recipe progression |
| `AuthFlowTests.swift` | `SignInNonce` SHA-256 vector, email validation/normalization, 6-digit sanitizer, `EmailOTPMachine` state machine |
| `CaptureCoreTests.swift` | `CaptureTimebase`, `CaptureCadence` (incl. regressed timestamps), depth-bin flag bit layout, `CaptureSinkRegistry` broadcast order, motion trigger, `KeyframeGate` debounce, `Sharpness` |
| `CaptureLifecycleTests.swift` (935 ln) | the whole `CaptureLifecycle` machine, provenance (guess never overwrites confirmed), visit-scoped queries, **owner-projection fail-closed rules**, owner-transition tracker, transfer lifecycle (receiptless completion rejected), route-safety policy, session-context policy incl. the 4-hour window, bulk route contract, durable scan transfers + sweep protection |
| `CaptureMediaPathTests.swift` | lowercase folder from uppercase UUIDs; `RoomScanStoragePath.storedReference` round trip |
| `ContextCaptureTests.swift` | entry-mode gating, provenance round-trip with/without pose, foreign-map rejection, photo/voice enqueue → inbox outbox, owner stamping |
| `CoverageScorecardTests.swift` | cone/distance/dwell observation rules, verdict boundaries, duplicate-bearing wall keys, rekey preserving dwell, scorecard Codable shape |
| `FieldCapturePayloadTests.swift` | **every wire key path** vs. the 00235 reader; minimal payload; provenance/guesses pass-through; measurement collapse |
| `FieldCompanionPresentationTests.swift` | progress clamping/accessibility, reducer normalization, milestone announcements |
| `FieldExperienceTests.swift` | `FieldRealmHistory` (independent stacks), `FieldAttentionBuilder` priority/recency/dedupe/day-boundary |
| `FieldPosedPhotoTests.swift` | `FieldPhotoGate` interval + cap + inactive, photo storage-path shape/case, `room_scan_images` DTO mapping, stable image ids, sidecar round-trip |
| `FieldRasterEncodingTests.swift` (1,116 ln) | the I92/R118 keyframe raster fixture — byte-for-byte reproduction, per-profile marker/intrinsic derivation, HEIC identity-rotation contract |
| `FieldScanUploadShadowLegTests.swift` | shadow-leg isolation (never affects the primary), **dormancy when no `EDGE_API_URL`**, descriptor contract |
| `ManifestTests.swift` | streaming SHA-256, manifest assembly + UNVERIFIED, deterministic encoding, deterministic tar + independent ustar reader round-trip |
| `MediaUploadIntentClientTests.swift` | the 3-step edge upload against a `URLProtocol` stub: happy path, PUT headers, 409 re-PUT, already-verified short-circuit, 401 refresh-and-retry, 404 |
| `PortalLoginTests.swift` | `field://login` token parse (version/host/scheme/ordering/garbage) + same-vs-different-account resolution |
| `ProjectPlacementTests.swift` | exact `place_product_in_project` argument keys, response-loss replay finds the prior placement, distinct project selections |
| `SiteRequestTests.swift` | imperial 1/16" quantization, SHA-256 stability, **outbox requires a server receipt**, receipt evidence must match request/item/version, backoff, terminal classification, draft builder, lifecycle gating, idempotent enqueue, guest-token namespace, signed capabilities never enter durable encoding |
| `UploadStateTests.swift` | resume set, completion gate, retry budget, **every upload Content-Type is bucket-legal** (the M2 MIME drift guard), container-independent relative key, owner in transfer keys, required-artifact gate, orphan-sweep protection, rejected work needs review |

### The gate — `scripts/capture-gate.sh`
```
generate → xcodebuild build -scheme Capture -sdk iphonesimulator (CODE_SIGNING_ALLOWED=NO)
generate → xcodebuild test  -scheme CaptureKit -sdk iphonesimulator
swiftlint lint --quiet --strict   (skipped with a message if swiftlint is absent)
```
Default sim `iPhone 17`, overridable via `CAPTURE_SIM`. Two companion scripts:
`capture-run.sh [<screen>]` (generate → build → boot → install → launch, optional
`-CaptureScreen`) and `capture-shots.sh [prefixes…]` (screenshot sweep of all 71,
terminating between shots because `-CaptureScreen` is read at launch).

### What a device pass has historically required (from the code's own notes)
- **Signing team on the `Capture` target** — the generator builds simulator
  artifacts with `CODE_SIGNING_ALLOWED=NO`; a device build needs the team
  (README, "On-device"). *Project memory adds: never install a
  `CODE_SIGNING_ALLOWED=NO` build for a walk.*
- **blitz-iphone `setup_device <udid>`** (WebDriverAgent, 1–3 min), then always
  pass an **explicit UDID** — `booted` returns an empty tree when a phone and a
  simulator are both present (README "Gotcha").
- **Device-only surfaces**: camera, ARKit measure, DataScanner, Speech,
  Live Activity, RoomPlan. The Simulator renders fallbacks.
- **`FieldBackgroundScanUploader.swift:13-15` explicitly says
  "DEVICE-VERIFICATION-OWED"** — background continuation, airplane-mode resume,
  and the 500 MB unattended path can only be proven on hardware.
- The **R118 raster fixture** runbook (`docs/design/field-capture/p2-r118-capture-resolution-fixture-runbook.md`)
  needs a Debug device build, `FIELD_DEVICE_UDID` exported, three exported
  artifacts AirDropped together, and a hash cross-check against a real scan's
  `keyframes/keyframe_index.ndjson`.
- App-Group entitlement must be provisioned or the store silently degrades to
  Application-Support / in-memory (`CaptureStore.resilient`).

---

## 8. Pain points & opportunities for "capture on the move"

### Tap count today: photo + voice note into a project
Assuming the app is open on C1 in `photo` mode and the visit has **no** remembered
project:

| # | action | file |
|---|---|---|
| 1 | shutter tap → C3 card | `ViewfinderModel.pressEnded` |
| 2 | "Add detail" → C5 sheet | `CaptureCardOverlay` → `.specimenSheet` |
| 3 | "Voice" enrichment button → N4 | `SpecimenSheetScreen:110-120` |
| — | hold mic, speak, release (gesture) | `VoiceNoteSheet.micButton` |
| 4 | "Attach note" → back to C5 | `VoiceNoteSheet.attach` |
| 5 | "Save" → S3 | `SpecimenSheetScreen.save` |
| 6 | choose Library / Inbox → S4/S5 | `S3DestinationScreen.choose` |
| 7 | dismiss terminal | S4/S5 |

**≈7 taps + 1 press-and-hold — and the capture still has no project.**
Attaching one requires leaving to V1 → "Route all N" → S1 → project menu →
(project detail fetch) → room menu → FF&E menu → "Choose destination" → S3 again:
**another ~6 taps and a network round-trip**, and it re-routes only one record.
On the *second* capture of the same visit the routing memory shortens this to
1 tap (C3 "Save to library" routes immediately), but only if S1 ran once first.

### Structural pain points
1. **No project picker in the fast path.** S1 is orphaned from C3/C5 (§5d). The
   single most important piece of "lands in the right place in the project flow"
   context is behind a screen the capture flow cannot reach.
2. **Voice is text-only.** No audio artifact is retained, so nothing can be
   re-transcribed, played back in the portal, or improved by a better model later.
   The seam (`VoiceNoteResult.audioFilename`, `payload.voice.audioPath`,
   the m4a/aac mime branches, migration `00235`'s reader) is **already built and
   waiting** — only the writer is missing. This is the cheapest high-value fix
   in the app.
3. **Voice is a sheet, not a mode.** N4 requires a specimen to exist first
   (`.voice(UUID)`), so a bare "walk-and-talk" note with no photo is impossible
   from C1. The only sheet-free voice entry is *inside a running site scan*
   (`SiteScanContextControls`).
4. **Inbox captures lose their columns.** `commit_field_capture`'s inbox branch
   doesn't persist `project_id`/`project_room_id`; context captures rely on
   provenance keys the portal must reconcile
   (`ContextCaptureProvenance` routing note). Anything routed to Inbox from the
   field is therefore weakly attached.
5. **`applySmartGuess` ships a lie.** Every photo capture is stamped
   `category=seating (0.72)` and `material="Oak / bouclé" (0.6)` with
   `ProvenanceSource.smartGuess`, and those values propagate to `products` on the
   library path. It also drives S3's "Recommended" hint via
   `hasUnconfirmedGuess`, so **every** capture is recommended to Inbox.
6. **Two "project room" concepts collide.** `project_rooms` (FF&E labels, what S1
   picks) vs `public.rooms` (what site scans attach to, what F1 picks) — noted in
   both `ProjectDetailScreen.swift` and `ContextCaptureProvenance.swift`.
   Any unified "put this in this room" affordance has to reconcile them.
7. **Library search is device-local.** The dedupe promise ("is this already in my
   library?") only covers this phone's own captures.
8. **Receiving photos use PhotosPicker, not the camera.** G2's v1 path is
   library-only — on a loading dock that is the wrong instrument.
9. **No share-extension / widget / Action-Button surface actually exists.**
   O4 teaches the Action Button; the entitlement-level support for it isn't in
   the tree. `field://capture` is the only external entry.
10. **Bulk operations are missing at the UI layer** despite existing at the
    contract layer (`routeAll`). A market visit produces N specimens and the tray
    can route one.
11. **Companion is decorative.** `FieldCompanionHearthView`'s only actions are
    "Open Work" / "Open Camera" (`RootView.handleCompanionAction`). It is the
    obvious place for a one-tap "attach the last capture to <project>".

### Offline gaps
Genuinely strong: enqueue never touches the network, drains are owner-serialized
and deferrable, media lives in the App Group, receipts gate every completion,
and scan uploads survive kill. The gaps are **contextual, not transactional**:
- S1's project/room/FF&E pickers need `projectsService.projectDetail(id:)`.
  Offline they degrade to a warning banner
  ("Project rooms are unavailable offline. This capture can still go to Library
  or Inbox.") and the FF&E menu is disabled — so **the offline capture is exactly
  the one that can't be placed**. Only locally-cached `CaptureProjectRef`s
  (created inline via S2) appear in the project menu.
- **The R4 offline banner is dead code** (see the ledger). Nothing on the camera
  surface tells the designer she is offline and queuing; she has to open U1.
- The site-scan **shadow leg** is dormant, so R2 is not a fallback path.
- The **guest** site-request loop is the *only* flow with a proper receipt-gated,
  backoff-driven, terminal-classified delivery outbox
  (`SiteRequestOutboxRecord`); the ordinary capture outbox has no scheduled
  backoff — it drains on enqueue, on reconcile at launch, and on manual "Retry all".
  There is **no connectivity observer** anywhere in the app
  (no `NWPathMonitor` reference exists), so "back online" never auto-triggers a drain.

### Opportunities (concrete, grounded in existing seams)
- **Write the audio file** in `SpeechVoiceNoteService.finish()` into the already-injected
  `mediaDirectory` and return its filename — the entire upload/commit/portal chain
  already handles it.
- **Put a project chip in C3/C5** bound to `CaptureRoutingMemory`, with a menu that
  presents `.assignVenue` — one tap, and S1 stops being orphaned.
- **Promote voice to a C1 mode** (a 5th `CameraMode`, or a long-press on the WORK
  pill) that mints a photo-less draft and opens N4 — the `ContextCaptureService`
  pattern proves a media-less specimen commits fine.
- **Replace `applySmartGuess`'s literals** with `HeuristicSmartGuessService` (already
  real, already Simulator-safe) so provenance stops shipping fiction.
- **Wire `routeAll`** into the V1 tray footer.
- **Add an `NWPathMonitor`** → `sync.drain()` + `siteScan.resumePendingUploads(retryFailures:false)`
  on regained connectivity.
- **Give the Companion a real action slot** — it already reduces typed
  `FieldCompanionAction`s and is pinned on every non-camera screen.

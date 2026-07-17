# Capture OS Support Matrix — "The Instrument"

Field Capture P1 · item 3 deliverable (SC-05/SC-17 "OS churn" mitigation)
Issued 2026-07-17 · Companion: `field-capture-p1-package.md`, `patina-field-capture-architecture.html` (SC-07), `capture-bundle-spec-v1.md`
Source of truth in code: header block of `apps/mobile/Capture/Capture/Features/SiteScan/SharedARCaptureRig.swift`

The Field capture rig runs one custom `ARWorldTrackingConfiguration`-driven `ARSession`
shared with RoomPlan (the iOS 17 `RoomCaptureView(frame:arSession:)` pattern). Because the
RoomPlan framework has been essentially frozen since iOS 17 and shipped live-capture
regressions on iOS 26, the supported surface is **pinned** here and asserted by a
device-run capture-rig integration test (OWED — see the item-3 device AC).

## Supported surface

| Axis | Requirement | Gate in code |
|---|---|---|
| Deployment floor | **iOS 18.0** | `IPHONEOS_DEPLOYMENT_TARGET` (Capture target, `generate_project.rb`) |
| Optimized target | iOS 26.5, LiDAR **Pro-line** iPhone (15 Pro / 17 Pro class) | — (device AC) |
| Device posture | **LiDAR required to scan** (R2: non-Pro gets context capture, never a scan) | `RoomCaptureSession.isSupported` → `SupabaseSiteScanService.isSupported` |
| Shared-session init | `RoomCaptureView(frame:arSession:)` — iOS 17+ | app-side; verified against Apple RoomPlan docs (2026-07): "RoomPlan preserves all of the AR session's settings" |
| Scene mesh | `ARWorldTrackingConfiguration.sceneReconstruction = .mesh` | `supportsSceneReconstruction(.mesh)` |
| Smoothed depth | `.frameSemantics ⊇ {.smoothedSceneDepth}` | `supportsFrameSemantics(.smoothedSceneDepth)`; depth recorder falls back to `.sceneDepth` |
| Swift / concurrency | Swift 5 mode (project setting); `nonisolated` delegates hop to `@MainActor` | — |

Every capability above is **capability-gated**: a device that lacks scene-mesh or smoothed
depth simply omits that frame semantic, and the recorders persist whatever the session
yields. A non-LiDAR device never reaches the rig at all.

## iOS 26 RoomCaptureView regression — handling stance

The deck (SC-05 line 307, SC-17 line 618) flags that RoomPlan is unchanged since iOS 17 and
that **iOS 26 shipped `RoomCaptureView` capture regressions**. The stance is **structural, not
a per-OS code branch**:

1. **We own the ARSession.** Scene mesh + smoothed depth are captured directly off ARKit via
   our own session delegate, so they do **not** depend on `RoomCaptureView` vending them. A
   `RoomCaptureView` regression degrades the live *visualization* and the RoomPlan parametric
   graph, not the raw depth/mesh evidence streams.
2. **Recorders are resilient + best-effort.** They persist whatever the session yields
   (smoothed *or* plain `sceneDepth`; whatever mesh anchors arrive) and never block the AR
   frame pump or the core USDZ/JSON export. A partial RoomPlan regression still leaves usable
   evidence in the bundle.
3. **The matrix is the contract a CI/device integration test asserts.** On the pinned target
   OS, a 10-minute session must yield non-zero depth frames + mesh vertices + live parametric
   updates without thermal shutdown. That test is device-only and **OWED** (no automated room
   walk is possible off-device).

We deliberately do **not** special-case iOS 26 in code — pinning the matrix and verifying on
device is the mitigation; a version fork would rot as the framework moves.

## Streams & shared clock (SC-07)

All streams share one coordinate frame (the shared ARSession world frame) and one clock
(`CaptureTimebase` — seconds since session start):

| Stream | Recorder | On disk (bundle spec §4) | Cadence |
|---|---|---|---|
| Parametric graph | RoomPlan `RoomCaptureSessionDelegate` (coverage/instructions inline) | `captured_room.json`, `scan.usdz` | live |
| Scene mesh | `FieldSceneMeshRecorder` (`CaptureMeshSink`) | `mesh.ply` | once at finish (after AR pause; buffers stable) |
| Smoothed depth + confidence | `FieldDepthRecorder` (`CaptureFrameSink`) | `depth/depth_<ts>.bin` + `depth/depth_index.ndjson` | ~1 Hz |
| Posed photos | `FieldPosedPhotoService` (`CaptureFrameSink`, migrated) | `photos/` + `photos_metadata.json` | 2 s (unchanged) |

Recorder seams (`CaptureFrameSink` / `CaptureMeshSink` / `CaptureRoomUpdateSink`) let items
4–6 (keyframe recorder, coach/QA, anchor entry) register without touching the session plumbing.

//  SharedARCaptureRig.swift
//  Capture · Wave F (Pro site-scan) · Field Capture P1 · item 3 — "The Instrument"
//
//  The shared-ARSession capture core (SC-07: "four streams, one clock"). ONE custom
//  `ARWorldTrackingConfiguration`-driven `ARSession` is created and RUN here, then
//  handed to RoomPlan via `RoomCaptureView(frame:arSession:)` (the iOS 17 shared-
//  session pattern — Apple docs: "RoomPlan preserves all of the AR session's
//  settings"). Because WE own the configuration, we can turn on scene-mesh
//  reconstruction and smoothed per-frame depth that RoomPlan's own default session
//  does not guarantee — while RoomPlan rides the same session for the parametric
//  graph, the live coaching instructions, and the RoomBuilder post-process. Every
//  stream therefore shares one coordinate frame and one clock (`CaptureTimebase`).
//
//  This type is the ONLY place that talks to the ARSession. It is the
//  `ARSessionDelegate`; it fans each sample out through `CaptureSinkRegistry`
//  (CaptureKit) to the recorder seams (`CaptureRecorderSeams.swift`). Items 4–6
//  register sinks; they never touch this plumbing. Item 3 registers the depth
//  recorder, the scene-mesh recorder, and the migrated posed-photo lane.
//
//  ─────────────────────────────────────────────────────────────────────────────
//  OS SUPPORT MATRIX (pinned — SC-05/SC-17 "OS churn"; also
//  docs/design/field-capture/capture-os-support-matrix.md)
//
//    • Deployment floor            iOS 18.0 (Capture target IPHONEOS_DEPLOYMENT_TARGET).
//    • RoomPlan / RoomCaptureView  Requires iOS 17+ AND a LiDAR device. Gated by
//                                  `RoomCaptureSession.isSupported` upstream
//                                  (`SupabaseSiteScanService.isSupported`); a
//                                  non-LiDAR device never reaches this rig (R2:
//                                  non-Pro gets context capture, never a scan).
//    • init(frame:arSession:)      iOS 17+. Verified against Apple RoomPlan docs
//                                  (2026-07): the shared-session initializer keeps
//                                  the running session's settings.
//    • Scene mesh                  `ARWorldTrackingConfiguration.sceneReconstruction
//                                  = .mesh`, gated by `supportsSceneReconstruction`.
//    • Smoothed depth              `.frameSemantics = [.smoothedSceneDepth,
//                                  .sceneDepth]`, each gated by
//                                  `supportsFrameSemantics`. Depth recorder falls
//                                  back smoothed → sceneDepth if smoothed is absent.
//    • Optimized for               iOS 26.5 on a 15/17-Pro-class LiDAR iPhone.
//
//  iOS 26 RoomCaptureView REGRESSION STANCE (deck SC-05 line 307, SC-17 line 618:
//  "iOS 26 shipped RoomCaptureView regressions → pinned OS support matrix +
//  capture-rig integration tests"): RoomPlan has been essentially frozen since
//  iOS 17, and iOS 26 introduced live-capture regressions in `RoomCaptureView`.
//  Item 3's mitigation is structural, not a per-OS branch:
//    (a) We drive our OWN ARSession, so scene-mesh + depth evidence is captured
//        directly off ARKit and does NOT depend on RoomCaptureView vending it —
//        a RoomCaptureView regression degrades the live *visualization* and the
//        parametric graph, not the raw depth/mesh streams.
//    (b) The recorders are best-effort and resilient: they persist whatever the
//        session yields (smoothed OR plain sceneDepth; whatever mesh anchors
//        arrive), so a partial RoomPlan regression still leaves usable evidence.
//    (c) The pinned matrix above is the contract a capture-rig integration test
//        (device-run, OWED — see item-3 AC) asserts against: on the target OS,
//        a 10-minute session yields non-zero depth frames + mesh vertices + live
//        parametric updates without thermal shutdown.
//  We deliberately do NOT special-case iOS 26 in code — pinning the matrix and
//  verifying on device is the stance; a code fork would rot.
//  ─────────────────────────────────────────────────────────────────────────────

import Foundation
import CaptureKit
import os.log

#if canImport(ARKit)
import ARKit
#if canImport(RoomPlan)
import RoomPlan
#endif

@MainActor
final class SharedARCaptureRig: NSObject {

    /// The one custom session every stream rides. Created (not run) at init so
    /// `RoomCaptureView(frame:arSession:)` can be built against it; RUN in
    /// `startRecording` with the mesh + depth configuration below.
    let arSession = ARSession()

    /// The shared clock. Set when recording starts; every sink is handed the
    /// same `timestampSeconds` per sample so all streams agree on t = 0.
    private(set) var timebase = CaptureTimebase()

    // Recorder seams (CaptureKit fan-out). Items 4–6 register here.
    private let frameSinks = CaptureSinkRegistry<CaptureFrameSink>()
    private let meshSinks = CaptureSinkRegistry<CaptureMeshSink>()
    #if canImport(RoomPlan)
    private let roomUpdateSinks = CaptureSinkRegistry<CaptureRoomUpdateSink>()
    #endif

    // Item-3/4 recorders (rig-owned so it can finalize them on stop).
    private var depthRecorder: FieldDepthRecorder?
    private var meshRecorder: FieldSceneMeshRecorder?
    private var keyframeRecorder: FieldKeyframeRecorder?
    // Item-5 coach + QA gate.
    private var coverageCoach: FieldCoverageCoach?
    /// The end-of-scan scorecard, built at `stopRecording` (nil until then).
    private(set) var lastScorecard: Scorecard?

    private var isRecording = false
    private let logger = Logger(subsystem: "cloud.patina.field", category: "CaptureRig")

    // MARK: - Configuration

    /// Build the shared world-tracking configuration: mesh reconstruction +
    /// smoothed/scene depth, each capability-gated so a device that lacks one
    /// simply omits it (the recorders tolerate absence). Plane detection matches
    /// what RoomPlan expects when it attaches to the session.
    ///
    /// `static` and non-private (R118) so the DEBUG raster-fixture profile
    /// resolver can read the capture resolution off the SAME configuration
    /// production runs, instead of restating it. Note what this method does NOT
    /// do: it never assigns `videoFormat`, so ARKit picks the device's default
    /// format for these semantics and `frame.camera.imageResolution` is a
    /// runtime, device-dependent value. Uses no instance state; behaviour is
    /// unchanged from the pre-R118 instance method.
    static func makeConfiguration() -> ARWorldTrackingConfiguration {
        let config = ARWorldTrackingConfiguration()
        config.worldAlignment = .gravity
        config.planeDetection = [.horizontal, .vertical]

        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
            config.sceneReconstruction = .mesh
        }

        var semantics: ARConfiguration.FrameSemantics = []
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth) {
            semantics.insert(.smoothedSceneDepth)
        }
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
            semantics.insert(.sceneDepth)
        }
        config.frameSemantics = semantics
        return config
    }

    // MARK: - Lifecycle

    /// Begin recording into `bundleDir`. Creates + registers the depth and mesh
    /// recorders and RUNS the shared ARSession with the mesh/depth configuration.
    /// Called BEFORE `RoomCaptureView(frame:arSession:)` is built, per the
    /// documented shared-session contract (the session must be running first).
    /// Does NOT claim the ARSession delegate yet — that happens in
    /// `assumeFrameDelegate()` after RoomPlan's `captureSession.run(...)`, mirroring
    /// the proven ordering in the client app and the prior posed-photo lane.
    func startRecording(bundleDir: URL?, startDate: Date = Date()) {
        guard !isRecording else { return }
        isRecording = true
        timebase = CaptureTimebase(start: startDate)

        // Best-effort recorders — attached only when a bundle dir exists; each
        // self-disables if its own subdir can't be made, so the core scan is
        // never blocked (item 3, point 6; mirrors the posed-photo lane's idiom).
        if let bundleDir {
            let depth = FieldDepthRecorder(bundleDir: bundleDir, timebase: timebase)
            depthRecorder = depth
            frameSinks.add(depth)

            let mesh = FieldSceneMeshRecorder(bundleDir: bundleDir)
            meshRecorder = mesh
            meshSinks.add(mesh)

            let keyframes = FieldKeyframeRecorder(bundleDir: bundleDir, timebase: timebase)
            keyframeRecorder = keyframes
            frameSinks.add(keyframes)

            let coach = FieldCoverageCoach(bundleDir: bundleDir)
            coverageCoach = coach
            frameSinks.add(coach)
            #if canImport(RoomPlan)
            roomUpdateSinks.add(coach)
            #endif
        }

        arSession.run(Self.makeConfiguration())
        logger.log("Capture rig recording started; config semantics/mesh applied best-effort.")
    }

    /// Claim the ARSession delegate so frames + mesh anchors begin flowing to the
    /// sinks. Called AFTER RoomPlan's `captureSession.run(...)` so RoomPlan cannot
    /// overwrite the delegate out from under us (the same after-run ordering the
    /// prior code used for posed photos).
    func assumeFrameDelegate() {
        arSession.delegate = self
    }

    /// Register an additional frame sink (item 3 uses this for the posed-photo
    /// lane; items 4–5 for keyframes/coach).
    func addFrameSink(_ sink: CaptureFrameSink) { frameSinks.add(sink) }

    /// Register a mesh sink (items 5/coach).
    func addMeshSink(_ sink: CaptureMeshSink) { meshSinks.add(sink) }

    #if canImport(RoomPlan)
    /// Register a room-update sink (items 5/6).
    func addRoomUpdateSink(_ sink: CaptureRoomUpdateSink) { roomUpdateSinks.add(sink) }

    /// Fan a live RoomPlan parametric-graph update out to the room-update sinks,
    /// stamped on the shared clock. Called by `RoomPlanScanSession`'s
    /// `RoomCaptureSessionDelegate` (which owns the coverage heuristic inline).
    func deliverRoomUpdate(_ room: CapturedRoom, at date: Date = Date()) {
        let t = timebase.seconds(at: date)
        roomUpdateSinks.broadcast { $0.capture(room: room, timestampSeconds: t) }
    }
    #endif

    /// Finalize recording: flush + finalize the depth and mesh recorders (final
    /// `mesh.ply`, drain pending depth writes) and pause the ARSession. Idempotent.
    /// `anchorCount` (item 6) feeds the scorecard's UNVERIFIED framing.
    func stopRecording(anchorCount: Int = 0) {
        guard isRecording else { return }
        isRecording = false
        arSession.pause()
        depthRecorder?.finish()
        meshRecorder?.finish()
        keyframeRecorder?.finish()
        // Build + persist the QA scorecard from the coach + keyframe metrics + the
        // real anchor count (item 6 — drives the UNVERIFIED framing on the card).
        lastScorecard = coverageCoach?.finalize(
            sharpFrameRatio: keyframeRecorder?.sharpFrameRatio ?? 1.0,
            anchorCount: anchorCount)
    }

    /// The current live coverage snapshot for the F2 coach (nil if no coach).
    func coverageSnapshot() -> CoverageSnapshot? { coverageCoach?.snapshot() }

    /// Quiesce the depth lane (A4 — during anchor entry the scene is static). The
    /// keyframe + coach lanes stay live and the ARSession keeps running for raycasts.
    func setDepthPaused(_ paused: Bool) { depthRecorder?.setPaused(paused) }

    /// Coarse capture metrics for telemetry / the manifest (item 3 surfaces
    /// these; item 13 populates `scan_pipeline_events` from them).
    struct Metrics {
        var depthFramesWritten = 0
        var meshWritten = false
        var meshVertexCount = 0
        var keyframesFired = 0
        var keyframesBlurRejected = 0
        var keyframesRawBlurFailures = 0
        var keyframesEncodeDropped = 0
    }

    var metrics: Metrics {
        Metrics(
            depthFramesWritten: depthRecorder?.framesWritten ?? 0,
            meshWritten: meshRecorder?.didWriteMesh ?? false,
            meshVertexCount: meshRecorder?.vertexCount ?? 0,
            keyframesFired: keyframeRecorder?.fired ?? 0,
            keyframesBlurRejected: keyframeRecorder?.blurRejected ?? 0,
            keyframesRawBlurFailures: keyframeRecorder?.rawBlurFailures ?? 0,
            keyframesEncodeDropped: keyframeRecorder?.encodeDropped ?? 0
        )
    }
}

// MARK: - ARSessionDelegate (the single fan-out point)
//
// `nonisolated` + a MainActor hop mirrors the client `RoomCaptureService` and the
// prior posed-photo lane: ARKit fires these off the main actor; hopping both
// retains the ARFrame past the callback and lets the @MainActor sinks read it. The
// shared timestamp is computed ONCE here and handed to every sink.

extension SharedARCaptureRig: ARSessionDelegate {

    nonisolated func session(_ session: ARSession, didUpdate frame: ARFrame) {
        Task { @MainActor in
            let t = self.timebase.seconds(at: Date())
            self.frameSinks.broadcast { $0.capture(frame: frame, timestampSeconds: t) }
        }
    }

    nonisolated func session(_ session: ARSession, didAdd anchors: [ARAnchor]) {
        let meshes = anchors.compactMap { $0 as? ARMeshAnchor }
        guard !meshes.isEmpty else { return }
        Task { @MainActor in
            let t = self.timebase.seconds(at: Date())
            self.meshSinks.broadcast { $0.capture(meshAnchors: meshes, change: .added, timestampSeconds: t) }
        }
    }

    nonisolated func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) {
        let meshes = anchors.compactMap { $0 as? ARMeshAnchor }
        guard !meshes.isEmpty else { return }
        Task { @MainActor in
            let t = self.timebase.seconds(at: Date())
            self.meshSinks.broadcast { $0.capture(meshAnchors: meshes, change: .updated, timestampSeconds: t) }
        }
    }

    nonisolated func session(_ session: ARSession, didRemove anchors: [ARAnchor]) {
        let meshes = anchors.compactMap { $0 as? ARMeshAnchor }
        guard !meshes.isEmpty else { return }
        Task { @MainActor in
            let t = self.timebase.seconds(at: Date())
            self.meshSinks.broadcast { $0.capture(meshAnchors: meshes, change: .removed, timestampSeconds: t) }
        }
    }

    nonisolated func session(_ session: ARSession, didFailWithError error: Error) {
        Task { @MainActor in
            self.logger.error("Shared ARSession failed: \(error.localizedDescription)")
        }
    }
}
#endif

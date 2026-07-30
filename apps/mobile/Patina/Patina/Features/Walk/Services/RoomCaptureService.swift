//
//  RoomCaptureService.swift
//  Patina
//
//  Service wrapping Apple's RoomPlan framework for room scanning.
//  Handles RoomCaptureSession and emits detected features.
//
//  PT-6-2: this type is now a thin FAÇADE composing three collaborators —
//    • RoomCaptureSessionDriver  — RoomPlan view + RoomCaptureSession/ARSession
//                                  lifecycle (create / run / stop)
//    • RoomCaptureAnalyzer       — coverage / quality / completion metrics +
//                                  pure-geometry helpers
//    • RoomCaptureBundleAdapter  — writes captured data into the on-disk bundle
//  The public API (consumed by RoomCaptureViewRepresentable / ScanViewModel)
//  is unchanged; the service owns the @Observable state, the
//  RoomCaptureSessionDelegate + ARSessionDelegate conformances, and feature
//  emission, delegating mechanics/analysis/IO to the collaborators.
//

import Foundation
import CoreGraphics
import UIKit
import RoomPlan
import ARKit
import Observation
import simd

/// Service for capturing room data using RoomPlan
@MainActor
@Observable
public final class RoomCaptureService: NSObject {

    // MARK: - Published State

    public private(set) var isScanning = false
    public private(set) var scanProgress: Float = 0
    public private(set) var capturedRoom: CapturedRoom?
    public private(set) var detectedFeatures: [DetectedFeature] = []
    public private(set) var errorMessage: String?

    /// Non-nil when the current RoomPlan or ARKit session has failed in a
    /// non-recoverable way (e.g. `RSError` drift detection, ARKit world-
    /// tracking failure). Consumers (ScanViewModel) surface this to the user
    /// with a retry/cancel affordance; cleared by `retryAfterFailure()`.
    public private(set) var sessionFailure: (any Error)?

    // MARK: - Analysis Results (NEW)

    /// Current coverage analysis result
    public private(set) var coverageResult: CoverageAnalyzer.CoverageResult?

    /// Current quality metrics
    public private(set) var qualityMetrics: QualityMonitor.QualityMetrics?

    /// Current completion status
    public private(set) var completionStatus: CompletionAnalyzer.CompletionStatus?

    // MARK: - Hero Frame Capture

    /// Service for capturing and selecting hero frames
    public let frameCaptureService = FrameCaptureService()

    /// The selected hero frame after scan completes
    public private(set) var heroFrame: CapturedFrame?

    // MARK: - Advanced Scan Bundle (v2)

    /// On-disk bundle writer for the current scan (v2 advanced pipeline).
    /// Created lazily on startCapture; nil before the first scan.
    public private(set) var bundleWriter: ScanBundleWriter?

    /// Posed-photo service — auto sampler + user shutter. Runs alongside the
    /// existing FrameCaptureService; both read ARFrames from the same session.
    public private(set) var posedPhotoService: PosedPhotoService?

    /// Records sampled sceneDepth frames into the bundle's `depth/` directory
    /// at ~1 Hz while a scan is live. Nil unless the device supports scene
    /// depth AND `highFidelityDepthEnabled` is true.
    public private(set) var depthRecorder: DepthFrameRecorder?

    /// The scan id for the current bundle (matches `room_scans.id` once uploaded).
    public private(set) var currentScanId: UUID?

    /// Whether the user opted into high-fidelity depth capture for this scan.
    /// Defaults to true — gated at `startCapture` by
    /// `ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth)` so
    /// non-LiDAR devices quietly fall back to false without failing the scan.
    public var highFidelityDepthEnabled: Bool = true

    /// Latest coaching hint from CoverageAnalyzer, refreshed as mesh
    /// anchors flow in. The view layer observes this to render a directional
    /// cue toward under-covered areas.
    public private(set) var coachingHint: CoverageAnalyzer.CoachingHint?

    // MARK: - Instrument lane (ported capture substrate)
    //
    // The instrument substrate (`Features/Walk/Instrument/`) observes the scan
    // through the recorder seams in `CaptureRecorderSeams.swift` and nothing
    // else. This service is the single fan-out point: it computes the shared
    // clock ONCE per sample and broadcasts to every registered sink, so no sink
    // recomputes the clock and all instrument streams agree on t = 0.
    //
    // ⚠ THE COVERAGE RULE. This lane produces a SECOND coverage figure
    // (`SurfaceCoverageTracker.coveragePct` — per-surface dwell). It is
    // instrument-internal and feeds only `ScorecardEvaluator`.
    // `CoverageAnalyzer.overallCoverage` — i.e. `scanProgress` below — remains
    // the ONLY coverage number the UI and analytics see. See the header of
    // `RoomCoverageCoach.swift`.

    /// The one clock for this scan. Re-based at every `startCapture`.
    private(set) var captureTimebase = CaptureTimebase()

    /// Per-ARFrame sinks (instrument lane only — the three pre-existing lanes
    /// keep their inline calls; see `CaptureRecorderSeams.swift`).
    private let frameSinks = CaptureSinkRegistry<CaptureFrameSink>()

    /// Live RoomPlan parametric-graph sinks.
    private let roomUpdateSinks = CaptureSinkRegistry<CaptureRoomUpdateSink>()

    /// Per-surface dwell coach + QA gate. Nil outside a scan.
    private(set) var coverageCoach: RoomCoverageCoach?

    /// Keyframe gate + counters. DECISION LANE ONLY — writes no images and no
    /// bundle bytes; see `KeyframeTelemetryRecorder.swift`.
    private(set) var keyframeRecorder: KeyframeTelemetryRecorder?

    /// The end-of-scan QA scorecard, built when the session ends. IN MEMORY
    /// ONLY — deliberately not persisted to `scorecard.json` or
    /// `manifest.scorecard`; see `RoomCoverageCoach.swift` for the two blockers.
    private(set) var instrumentScorecard: Scorecard?

    /// Counts which ARFrame streams this session actually vends. Diagnostic
    /// only — see `CaptureStreamProbe.swift` for why an app that rides
    /// RoomPlan's default session cannot otherwise tell.
    private(set) var streamProbe: CaptureStreamProbe?

    /// Live instrument coverage state (checklist + machine warnings). Nil
    /// outside a scan. INSTRUMENT-INTERNAL — read the coverage rule above
    /// before rendering any part of it.
    func instrumentCoverageSnapshot() -> CoverageSnapshot? { coverageCoach?.snapshot() }

    // MARK: - Callbacks

    /// Called when a new feature is detected during scanning
    public var onFeatureDetected: ((DetectedFeature) -> Void)?

    /// Called when scan progress updates
    public var onProgressUpdate: ((Float) -> Void)?

    /// Called when scanning completes
    public var onScanComplete: ((CapturedRoom) -> Void)?

    /// Called when an error occurs
    public var onError: ((Error) -> Void)?

    /// Called when completion status changes (NEW)
    public var onCompletionStatusChanged: ((CompletionAnalyzer.CompletionStatus) -> Void)?

    /// Called when hero frame is selected
    public var onHeroFrameSelected: ((CapturedFrame) -> Void)?

    // MARK: - RoomPlan Components

    /// Drives the RoomPlan view + RoomCaptureSession/ARSession lifecycle.
    private var sessionDriver: RoomCaptureSessionDriver!

    /// Access to the capture session (from the view)
    public var captureSession: RoomCaptureSession? {
        sessionDriver.captureSession
    }

    // MARK: - Collaborators (NEW)

    /// Coverage / quality / completion metrics + pure-geometry helpers.
    private let analyzer = RoomCaptureAnalyzer()

    /// Writes captured scan data into the on-disk bundle.
    private let bundleAdapter = RoomCaptureBundleAdapter()

    // MARK: - Internal State

    private var scanStartTime: Date?
    private var processedObjectIds: Set<UUID> = []
    private var lastFeatureTime: Date = .distantPast
    private var hasAutoCompleted = false

    /// Accumulated ARMeshAnchors keyed by identifier. Built up via the
    /// ARSessionDelegate `didAdd`/`didUpdate` callbacks so we have real
    /// mesh geometry at scan end (by which point the session has usually
    /// cleared `currentFrame.anchors`).
    private var meshAnchors: [UUID: ARMeshAnchor] = [:]

    // MARK: - Multi-Image Selection

    /// Timestamps when each feature category was first detected (for image correlation)
    private var featureDetectionTimestamps: [FeatureCategory: Date] = [:]

    /// Engine for selecting diverse images from candidates
    private let multiImageSelectionEngine = MultiImageSelectionEngine()

    /// The selected image collection after scan completes
    public private(set) var imageCollection: RoomImageCollection?

    // MARK: - Constants

    private enum Constants {
        static let minimumFeatureInterval: TimeInterval = 8.0 // 8s between features per spec
        static let progressUpdateInterval: TimeInterval = 0.5
        static let completionThreshold: Float = 0.85
    }

    // MARK: - Initialization

    public override init() {
        super.init()
        // The driver creates the RoomCaptureView and wires `self` as the
        // RoomCaptureSession + ARSession delegate. (PT-6-7: the view is now
        // created at `.zero`; the embedding container sizes it.)
        sessionDriver = RoomCaptureSessionDriver(delegate: self)
    }

    // MARK: - Public Methods

    /// Check if RoomPlan is supported on this device
    public static var isSupported: Bool {
        RoomCaptureSession.isSupported
    }

    /// Get the RoomCaptureView for embedding in SwiftUI
    public func getRoomCaptureView() -> RoomCaptureView {
        sessionDriver.getRoomCaptureView()
    }

    /// Start room capture session
    public func startCapture(scanId: UUID = UUID(), roomLocalId: UUID? = nil, roomName: String = "Room") {
        guard !isScanning else { return }

        // Reset state
        scanProgress = 0
        capturedRoom = nil
        detectedFeatures = []
        errorMessage = nil
        processedObjectIds = []
        scanStartTime = Date()
        hasAutoCompleted = false
        coverageResult = nil
        qualityMetrics = nil
        completionStatus = nil
        heroFrame = nil
        imageCollection = nil
        featureDetectionTimestamps = [:]

        // Reset analyzers
        Task {
            await analyzer.reset()
        }

        // Drop any anchors from a previous run.
        meshAnchors.removeAll()
        coachingHint = nil

        // Re-base the instrument lane: one clock, fresh sinks, fresh recorders.
        // Registered BEFORE `sessionDriver.run()` so no sample can arrive at an
        // empty registry.
        captureTimebase = CaptureTimebase(start: scanStartTime ?? Date())
        frameSinks.removeAll()
        roomUpdateSinks.removeAll()
        instrumentScorecard = nil

        let coach = RoomCoverageCoach()
        coverageCoach = coach
        frameSinks.add(coach)
        roomUpdateSinks.add(coach)

        let keyframes = KeyframeTelemetryRecorder()
        keyframeRecorder = keyframes
        frameSinks.add(keyframes)

        let probe = CaptureStreamProbe()
        streamProbe = probe
        frameSinks.add(probe)

        // High-fidelity depth gate: only keep the flag set if the running
        // device advertises sceneDepth. Non-LiDAR devices silently continue
        // without depth rather than failing the whole scan.
        if highFidelityDepthEnabled,
           !ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
            highFidelityDepthEnabled = false
        }

        // Build the advanced scan bundle + posed-photo service for this run.
        currentScanId = scanId
        do {
            let writer = try ScanBundleWriter(
                scanId: scanId,
                roomLocalId: roomLocalId,
                roomName: roomName,
                capture: ScanManifest.CaptureInfo(
                    highFidelityDepthEnabled: highFidelityDepthEnabled,
                    autoPhotoInterval: 2.0
                )
            )
            self.bundleWriter = writer
            let posed = PosedPhotoService(bundle: writer)
            posed.autoInterval = 2.0
            posed.start(at: scanStartTime ?? Date())
            self.posedPhotoService = posed

            // Depth recorder — best-effort. If it fails to create we just
            // skip high-fidelity depth capture for this scan.
            if highFidelityDepthEnabled {
                self.depthRecorder = try? DepthFrameRecorder(
                    bundleURL: writer.bundleURL,
                    scanStartedAt: scanStartTime ?? Date(),
                    sampleInterval: 1.0
                )
            } else {
                self.depthRecorder = nil
            }

            PatinaLog.scan.debug("[RoomCaptureService] v2 scan bundle initialized at \(writer.bundleURL.path)")
        } catch {
            // v2-only scan path: if the on-disk bundle cannot be prepared the
            // scan is aborted outright instead of silently falling back to the
            // v1 USDZ-only pipeline. The legacy fields remain as stored
            // properties so historical RoomModel rows still hydrate, but we
            // never create a new scan without a bundle.
            PatinaLog.scan.error("[RoomCaptureService] ScanBundleWriter init failed: \(error.localizedDescription) — aborting scan")
            self.bundleWriter = nil
            self.posedPhotoService = nil
            self.depthRecorder = nil
            let message = "Unable to prepare scan workspace — please free up some storage or restart the app."
            self.errorMessage = message
            self.onError?(error)
            return
        }

        // Start hero frame capture (legacy, still useful for in-memory scoring)
        frameCaptureService.startCapture()

        // Configure and start the session from the view (wires the ARSession
        // delegate for frame capture).
        guard sessionDriver.run() else {
            errorMessage = "Capture view not initialized"
            return
        }

        isScanning = true

        // Track scan start
        WalkAnalytics.shared.trackRoomScanStarted(roomType: "living_room")
    }

    /// Request that the next ARFrame be captured as a full-resolution user photo.
    public func captureUserPhoto() {
        posedPhotoService?.requestUserShutter()
    }

    /// Stop room capture session
    public func stopCapture() {
        guard isScanning else { return }

        // Stop frame capture
        frameCaptureService.stopCapture()
        posedPhotoService?.stop()

        sessionDriver.stop()
        isScanning = false
    }

    /// Recover from a `sessionFailure` by tearing down whatever is left of the
    /// failed session and starting a brand-new one with a fresh scanId. Called
    /// from the UI's "Try again" affordance on the session-lost overlay. The
    /// previous bundle (if any) is left on disk for `ScanRecoveryService` to
    /// reap on next launch — not deleted synchronously because the user might
    /// still want to recover it via a different code path.
    public func retryAfterFailure() {
        // Force-stop anything still running. `stopCapture` early-returns if
        // `isScanning == false`, but on a hard failure we want to make sure
        // both AR/RoomPlan + frame/photo services are released.
        frameCaptureService.stopCapture()
        posedPhotoService?.stop()
        sessionDriver.stop()
        isScanning = false
        sessionFailure = nil
        errorMessage = nil
        scanProgress = 0
        capturedRoom = nil
        detectedFeatures = []
        currentScanId = nil
        bundleWriter = nil
        meshAnchors.removeAll()

        // Release the instrument lane. `startCapture` re-registers, but a
        // hard failure can sit here for a while and a stale scorecard/snapshot
        // from the dead session must not be readable in the meantime.
        frameSinks.removeAll()
        roomUpdateSinks.removeAll()
        coverageCoach = nil
        keyframeRecorder = nil
        streamProbe = nil
        instrumentScorecard = nil

        // Start a fresh capture with a new scanId.
        startCapture()
    }

    /// Process the captured room and generate FirstWalkRoomData.
    ///
    /// Reuses `currentScanId` (set in `startCapture`) as `FirstWalkRoomData.roomId`
    /// so the on-disk bundle, the SwiftData `RoomScanPackage`, the remote
    /// `room_scans.id`, and the payload the sync service PATCHes all agree.
    public func processRoom() -> FirstWalkRoomData? {
        guard let room = capturedRoom else { return nil }

        let dimensions = analyzer.extractDimensions(from: room)
        let scanDuration = scanStartTime.map { Date().timeIntervalSince($0) } ?? 0

        return FirstWalkRoomData(
            roomId: currentScanId ?? UUID(),
            roomName: "Living Room",
            dimensions: dimensions,
            detectedFeatures: detectedFeatures,
            scanDuration: scanDuration,
            coveragePercentage: scanProgress,
            heroFrameData: heroFrame?.imageData,
            heroFrameScore: heroFrame?.totalScore,
            candidateFrameCount: frameCaptureService.captureCount,
            imageCollection: imageCollection
        )
    }

    /// Select and finalize the hero frame and multi-image collection (call after scan completes)
    public func finalizeHeroFrame() async -> CapturedFrame? {
        // Get all candidate frames before they're cleared
        let candidates = frameCaptureService.candidateFrames

        // Score all frames
        let scoredFrames = await frameCaptureService.scoringEngine.scoreFrames(candidates)

        // Select multi-image collection using the selection engine
        let collection = await multiImageSelectionEngine.selectImages(
            from: scoredFrames,
            detectedFeatures: detectedFeatures,
            featureTimestamps: featureDetectionTimestamps
        )
        self.imageCollection = collection

        // Set the hero frame from the collection (for backward compatibility)
        let heroFrame = collection.heroImage?.frame
        self.heroFrame = heroFrame

        if let frame = heroFrame {
            self.onHeroFrameSelected?(frame)
        }

        // Clear candidate frames to free memory
        frameCaptureService.clearCandidates()

        return heroFrame
    }

    /// Export the captured room as USDZ data
    /// - Returns: USDZ file data, or nil if export fails
    public func exportUSDZ() async -> Data? {
        await bundleAdapter.exportUSDZ(capturedRoom: capturedRoom)
    }

    /// Export CapturedRoom as JSON (authoritative geometry —
    /// walls/doors/windows/openings/objects with transforms and dimensions).
    /// Written to the current bundle as the `.capturedRoomJson` artifact.
    ///
    /// `CapturedRoom` is `Codable` (iOS 17+), so we encode it directly.
    /// The older `room.export(to:exportOptions:.parametric)` path only
    /// writes USDA — not JSON — and rejects a `.json` extension.
    @discardableResult
    public func exportCapturedRoomJSON() async -> ScanManifest.Artifact? {
        await bundleAdapter.exportCapturedRoomJSON(capturedRoom: capturedRoom, writer: bundleWriter)
    }

    /// Export the beautified USDZ into the current bundle as the `.usdz` artifact.
    @discardableResult
    public func exportUSDZToBundle() async -> ScanManifest.Artifact? {
        await bundleAdapter.exportUSDZToBundle(capturedRoom: capturedRoom, writer: bundleWriter)
    }

    /// Get the current quality grade
    public func getCurrentQualityGrade() async -> QualityMonitor.QualityGrade {
        await analyzer.finalQualityGrade()
    }

    /// Check if the scan can be completed now
    public func canComplete() async -> Bool {
        await analyzer.canComplete()
    }

    // MARK: - Private Methods

    private func processDetectedObjects(from room: CapturedRoom) {
        let now = Date()

        // Process windows
        for window in room.windows {
            guard !processedObjectIds.contains(window.identifier) else { continue }
            processedObjectIds.insert(window.identifier)

            let isLarge = window.dimensions.x * window.dimensions.y > 1.5 // > 1.5 sq meters
            // Confidence is an enum: .low, .medium, .high
            let confidenceValue: Float = switch window.confidence {
                case .high: 1.0
                case .medium: 0.8
                case .low: 0.6
                @unknown default: 0.7
            }
            let feature = DetectedFeature(
                category: isLarge ? .largeWindow : .window,
                confidence: confidenceValue
            )

            emitFeatureIfReady(feature, at: now)
        }

        // Process doors
        for door in room.doors {
            guard !processedObjectIds.contains(door.identifier) else { continue }
            processedObjectIds.insert(door.identifier)
            // Doors don't trigger narration per spec
        }

        // Process objects (furniture, etc.)
        for object in room.objects {
            guard !processedObjectIds.contains(object.identifier) else { continue }
            processedObjectIds.insert(object.identifier)

            if let feature = analyzer.mapObjectToFeature(object) {
                emitFeatureIfReady(feature, at: now)
            }
        }

        // Check ceiling height
        let dimensions = analyzer.extractDimensions(from: room)
        if dimensions.height > 2.74 && !detectedFeatures.contains(where: { $0.category == .tallCeiling }) {
            let feature = DetectedFeature(category: .tallCeiling, value: dimensions.height)
            emitFeatureIfReady(feature, at: now)
        }

        // Check for open area
        if dimensions.area > 25 && !detectedFeatures.contains(where: { $0.category == .openArea }) {
            let feature = DetectedFeature(category: .openArea, value: dimensions.area)
            emitFeatureIfReady(feature, at: now)
        }

        // Check for multiple windows
        if room.windows.count > 1 && !detectedFeatures.contains(where: {
            $0.category == .window || $0.category == .largeWindow
        }) {
            // Already handled individual windows above
        }
    }

    /// Close the instrument lane: build the QA scorecard from the coach's dwell
    /// state + the keyframe lane's sharp-frame ratio, and log what the session
    /// actually vended.
    ///
    /// The scorecard is held IN MEMORY on `instrumentScorecard` and goes no
    /// further. It is NOT written to `scorecard.json` and NOT assigned to
    /// `manifest.scorecard`, because `ScanRecoveryService` deletes a bundle and
    /// its row when `manifest.json` fails to decode — so the first producer of
    /// instrument fields turns any future unrecognized enum value into deleted
    /// user data. That guard has to be made lenient first. See the header of
    /// `RoomCoverageCoach.swift`.
    ///
    /// Idempotent: safe if the session ends more than once.
    private func finalizeInstrumentLane() {
        guard let coach = coverageCoach else { return }
        let scorecard = coach.finalize(
            sharpFrameRatio: keyframeRecorder?.sharpFrameRatio ?? 1.0,
            // Anchor entry is not wired in this app; `AnchorGate.isUnverified(0)`
            // is true, which is the honest answer for a scan with no anchors.
            anchorCount: 0
        )
        instrumentScorecard = scorecard
        #if DEBUG
        if let probe = streamProbe {
            PatinaLog.scan.debug(probe.summaryLine(meshAnchorCount: meshAnchors.count))
        }
        let fired = keyframeRecorder?.telemetry.fired ?? 0
        PatinaLog.scan.debug(
            "[Instrument] verdict=\(scorecard.verdict.rawValue) surfaces=\(scorecard.surfaceChecklist.count) coveragePct=\(scorecard.coveragePct) keyframesFired=\(fired)"
        )
        #endif
    }

    private func emitFeatureIfReady(_ feature: DetectedFeature, at time: Date) {
        // Enforce minimum interval between features
        guard time.timeIntervalSince(lastFeatureTime) >= Constants.minimumFeatureInterval else {
            return
        }

        // Don't emit duplicates
        guard !detectedFeatures.contains(where: { $0.category == feature.category }) else {
            return
        }

        lastFeatureTime = time
        detectedFeatures.append(feature)

        // Record feature detection timestamp for multi-image correlation
        if featureDetectionTimestamps[feature.category] == nil {
            featureDetectionTimestamps[feature.category] = time
        }

        // Track feature detection
        WalkAnalytics.shared.trackFeatureDetected(
            featureCategory: String(describing: feature.category),
            confidence: Double(feature.confidence)
        )

        onFeatureDetected?(feature)
    }
}

// MARK: - RoomCaptureSessionDelegate

extension RoomCaptureService: RoomCaptureSessionDelegate {

    nonisolated public func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
        Task { @MainActor in
            // Cache the in-progress CapturedRoom so ScanViewModel.completeScan
            // (which runs before the session is stopped) can read dimensions
            // without waiting for the final didEndWith / RoomBuilder pass.
            self.capturedRoom = room

            // Run the coverage → quality → completion pipeline. Ambient
            // lighting + motion are folded in so low-light / shaky-pan scans
            // can't auto-complete prematurely.
            let result = await self.analyzer.analyze(
                room: room,
                frame: session.arSession.currentFrame
            )

            // Apply coverage to observable state + progress.
            self.coverageResult = result.coverage
            self.scanProgress = result.coverage.overallCoverage
            self.onProgressUpdate?(result.coverage.overallCoverage)

            // Apply quality metrics.
            self.qualityMetrics = result.quality

            // Only update if status changed
            if self.completionStatus?.recommendation != result.completion.recommendation {
                self.completionStatus = result.completion
                self.onCompletionStatusChanged?(result.completion)
            } else {
                self.completionStatus = result.completion
            }

            // Process detected objects for narration
            self.processDetectedObjects(from: room)

            // Instrument lane: rebuild the tracked surface set from the live
            // parametric graph. This is the ONLY input `SurfaceCoverageTracker`
            // has — without it the coverage scorecard has logic and no data.
            let instrumentTimestamp = self.captureTimebase.seconds(at: Date())
            self.roomUpdateSinks.broadcast { $0.capture(room: room, timestampSeconds: instrumentTimestamp) }
        }
    }

    nonisolated public func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: Error?) {
        Task { @MainActor in
            self.isScanning = false

            // Stop frame capture
            self.frameCaptureService.stopCapture()
            self.posedPhotoService?.stop()

            // Close the instrument lane FIRST, and before the error early-return
            // below — a session that ended badly is exactly the one whose
            // scorecard is worth having.
            self.finalizeInstrumentLane()

            let scanId = self.bundleWriter?.scanId

            if let error = error {
                self.errorMessage = error.localizedDescription
                self.sessionFailure = error
                #if DEBUG
                PatinaLog.scan.error("[RoomCaptureService] capture session ended with error: \(error.localizedDescription)")
                #endif
                UploadDiagnosticsLog.shared.log(
                    event: "capture.session_failed",
                    scanId: scanId,
                    error: error.localizedDescription
                )
                self.onError?(error)
                return
            }

            // Build the final CapturedRoom with one retry. A RoomBuilder
            // failure used to abort the whole flow (the 2026-05-12 producer-
            // side bug): freezeBundleArtifacts was inside the same do-block
            // and got skipped, leaving manifest.artifacts empty and every
            // structural file (usdz, captured_room, world_map, mesh) missing
            // from the bundle. Now we attempt RoomBuilder, log the outcome,
            // and ALWAYS continue to freezeBundleArtifacts — the world map /
            // mesh / depth / coverage / photos paths don't depend on
            // `capturedRoom` and should still land.
            var finalRoom: CapturedRoom?
            var roomBuildError: Error?
            for attempt in 1...2 {
                do {
                    let roomBuilder = RoomBuilder(options: [.beautifyObjects])
                    finalRoom = try await roomBuilder.capturedRoom(from: data)
                    break
                } catch {
                    roomBuildError = error
                    UploadDiagnosticsLog.shared.log(
                        event: "capture.room_build_attempt_failed",
                        scanId: scanId,
                        error: error.localizedDescription,
                        extra: ["attempt": String(attempt)]
                    )
                    if attempt == 1 {
                        try? await Task.sleep(nanoseconds: 500_000_000)
                    }
                }
            }

            if let finalRoom = finalRoom {
                self.capturedRoom = finalRoom
                self.scanProgress = 1.0
                self.processDetectedObjects(from: finalRoom)
                _ = await self.finalizeHeroFrame()
                UploadDiagnosticsLog.shared.log(
                    event: "capture.room_built",
                    scanId: scanId,
                    extra: [
                        "walls": String(finalRoom.walls.count),
                        "objects": String(finalRoom.objects.count)
                    ]
                )
            } else {
                // RoomBuilder unrecoverable — but we keep going so the
                // bundle gets whatever the AR session and depth recorder
                // produced. Without `capturedRoom`, USDZ + captured_room
                // JSON will self-skip; mesh / world_map / depth / coverage /
                // photos still apply.
                let message = roomBuildError?.localizedDescription ?? "RoomBuilder returned nil"
                self.errorMessage = "RoomBuilder failed: \(message)"
                self.sessionFailure = roomBuildError
                UploadDiagnosticsLog.shared.log(
                    event: "capture.room_build_failed",
                    scanId: scanId,
                    error: message
                )
                #if DEBUG
                PatinaLog.scan.error("[RoomCaptureService] RoomBuilder failed after retry: \(message) — continuing with partial freeze")
                #endif
            }

            // Always freeze whatever artifacts we have. The manifest will
            // be sealed later by finalizeBundleAfterReview; what we miss
            // here stays missing, but at least mesh / depth / world_map /
            // coverage / photos are persisted.
            await self.freezeBundleArtifacts(arSession: session.arSession)

            // Telemetry uses whatever progress we have. Quality grade is
            // still meaningful from optical/coverage analyzers.
            let scanDuration = self.scanStartTime.map { Date().timeIntervalSince($0) } ?? 0
            let qualityGrade = await self.analyzer.finalQualityGrade()
            WalkAnalytics.shared.trackRoomScanCompleted(
                roomType: "living_room",
                scanDuration: scanDuration,
                objectsDetected: self.detectedFeatures.count,
                coveragePercentage: Double(self.scanProgress),
                qualityGrade: String(describing: qualityGrade)
            )

            // Notify downstream. With a successful RoomBuilder, the room is
            // passed; otherwise, surface the producer error so callers can
            // decide whether to present an explicit failure UI.
            if let finalRoom = finalRoom {
                self.onScanComplete?(finalRoom)
            } else if let roomBuildError = roomBuildError {
                self.onError?(roomBuildError)
            }
        }
    }

    /// Freeze the on-disk scan bundle via `RoomCaptureBundleAdapter`. Does NOT
    /// seal the manifest — that's the job of `finalizeBundleAfterReview(...)`.
    @MainActor
    private func freezeBundleArtifacts(arSession: ARSession) async {
        guard let writer = bundleWriter else {
            UploadDiagnosticsLog.shared.log(event: "freeze.no_writer")
            return
        }
        await bundleAdapter.freezeBundleArtifacts(
            RoomCaptureBundleAdapter.FreezeContext(
                writer: writer,
                arSession: arSession,
                capturedRoom: capturedRoom,
                analyzer: analyzer,
                meshAnchors: Array(meshAnchors.values),
                depthRecorder: depthRecorder,
                posedPhotoService: posedPhotoService,
                qualityMetrics: qualityMetrics
            )
        )
    }

    /// Apply user-supplied review data (annotations, hero selection, photo
    /// ordering, per-photo captions) and seal the scan bundle manifest.
    /// Called by the review step. Legacy callers that skip review can invoke
    /// it with empty inputs to seal the bundle as-is.
    @MainActor
    public func finalizeBundleAfterReview(
        annotations: ScanManifest.Annotations,
        heroPhotoId: UUID? = nil,
        reorderedPhotoIds: [UUID] = [],
        photoAnnotations: [UUID: String] = [:]
    ) async throws {
        guard let writer = bundleWriter else { return }

        // Steps 1–3 (persist annotations, apply hero/reorder/captions, seal
        // the manifest) live in the bundle adapter.
        try bundleAdapter.applyReviewAndSeal(
            writer: writer,
            annotations: annotations,
            heroPhotoId: heroPhotoId,
            reorderedPhotoIds: reorderedPhotoIds,
            photoAnnotations: photoAnnotations
        )

        // 4. Fire the legacy onScanComplete callback so downstream
        //    coordinators (ScanCompletionCoordinator, etc.) can proceed.
        if let room = capturedRoom {
            onScanComplete?(room)
        }
    }

    nonisolated public func captureSession(_ session: RoomCaptureSession, didProvide instruction: RoomCaptureSession.Instruction) {
        Task { @MainActor in
            // Could use these instructions to guide the user
            // For now, we handle guidance through narration system
        }
    }

    nonisolated public func captureSession(_ session: RoomCaptureSession, didStartWith configuration: RoomCaptureSession.Configuration) {
        Task { @MainActor in
            self.isScanning = true
            self.scanStartTime = Date()
        }
    }
}

// MARK: - ARSessionDelegate (Hero Frame Capture)

extension RoomCaptureService: ARSessionDelegate {

    nonisolated public func session(_ session: ARSession, didUpdate frame: ARFrame) {
        Task { @MainActor in
            // Capture frames at regular intervals during scanning
            guard self.isScanning else { return }

            await self.frameCaptureService.captureFrame(from: frame)

            // Feed the same ARFrame to the v2 posed photo service so auto
            // samples + user shutters are written to disk with full pose
            // metadata. No-op if posedPhotoService is nil (bundle failed).
            self.posedPhotoService?.consume(frame: frame)

            // Sample scene-depth frames into the bundle at ~1 Hz. The
            // recorder self-throttles on `sampleInterval`, so calling it
            // every AR frame is fine. Correlate to the most-recent posed
            // photo if it was emitted within ±0.15s of this frame.
            if let recorder = self.depthRecorder {
                let scanStart = self.scanStartTime ?? Date()
                let nowRel = Date().timeIntervalSince(scanStart)
                var associatedPhotoId: UUID?
                if let lastPhoto = self.posedPhotoService?.emittedPhotos.last,
                   abs(nowRel - lastPhoto.timestampSeconds) <= 0.15 {
                    associatedPhotoId = lastPhoto.id
                }
                recorder.consume(frame: frame, associatedPhotoId: associatedPhotoId)
            }

            // Instrument lane. The shared-clock timestamp is computed ONCE here
            // and handed to every sink — no sink recomputes the clock, so all
            // instrument streams agree on t = 0. Sinks must return quickly;
            // they run inside the AR frame pump like the lanes above.
            let instrumentTimestamp = self.captureTimebase.seconds(at: Date())
            self.frameSinks.broadcast { $0.capture(frame: frame, timestampSeconds: instrumentTimestamp) }
        }
    }

    nonisolated public func session(_ session: ARSession, didAdd anchors: [ARAnchor]) {
        let newMeshes = anchors.compactMap { $0 as? ARMeshAnchor }
        guard !newMeshes.isEmpty else { return }
        // Anchor origins in world space — cheap centroid approximation that
        // avoids iterating anchor.geometry.vertices on the main actor.
        let centroids: [SIMD3<Float>] = newMeshes.map { anchor in
            let c = anchor.transform.columns.3
            return SIMD3<Float>(c.x, c.y, c.z)
        }
        Task { @MainActor in
            for anchor in newMeshes {
                self.meshAnchors[anchor.identifier] = anchor
            }
            let hint = await self.analyzer.ingestMeshAnchorCentroids(centroids)
            self.coachingHint = hint
        }
    }

    nonisolated public func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) {
        let updatedMeshes = anchors.compactMap { $0 as? ARMeshAnchor }
        guard !updatedMeshes.isEmpty else { return }
        let centroids: [SIMD3<Float>] = updatedMeshes.map { anchor in
            let c = anchor.transform.columns.3
            return SIMD3<Float>(c.x, c.y, c.z)
        }
        Task { @MainActor in
            for anchor in updatedMeshes {
                self.meshAnchors[anchor.identifier] = anchor
            }
            let hint = await self.analyzer.ingestMeshAnchorCentroids(centroids)
            self.coachingHint = hint
        }
    }

    nonisolated public func session(_ session: ARSession, didRemove anchors: [ARAnchor]) {
        let removed = anchors.compactMap { $0 as? ARMeshAnchor }
        guard !removed.isEmpty else { return }
        Task { @MainActor in
            for anchor in removed {
                self.meshAnchors.removeValue(forKey: anchor.identifier)
            }
        }
    }

    /// ARKit world-tracking failure (e.g. sensor unavailable, world map
    /// invalidated). RoomPlan's `captureSession(_:didEndWith:error:)` will
    /// usually fire shortly after this with the same root cause; we surface
    /// `sessionFailure` here so the UI can react before RoomPlan winds down.
    nonisolated public func session(_ session: ARSession, didFailWithError error: Error) {
        Task { @MainActor in
            #if DEBUG
            PatinaLog.scan.error("[RoomCaptureService] AR session failed: \(error.localizedDescription)")
            #endif
            self.errorMessage = error.localizedDescription
            self.sessionFailure = error
        }
    }

    /// AR session interrupted (e.g. phone locked, app backgrounded).
    /// We do NOT mark this as a `sessionFailure` because the system will
    /// usually call `sessionInterruptionEnded(_:)` and tracking resumes.
    nonisolated public func sessionWasInterrupted(_ session: ARSession) {
        #if DEBUG
        PatinaLog.scan.debug("[RoomCaptureService] AR session interrupted")
        #endif
    }

    nonisolated public func sessionInterruptionEnded(_ session: ARSession) {
        #if DEBUG
        PatinaLog.scan.debug("[RoomCaptureService] AR session interruption ended")
        #endif
    }
}

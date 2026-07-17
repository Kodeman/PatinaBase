//  RoomPlanScanSession.swift
//  Capture · Wave F (Pro site-scan) · Field Capture P1 · item 3 (shared-session core)
//
//  The concrete, on-device `FieldScanSession`. As of P1 item 3 it drives a SHARED
//  custom `ARSession` (owned + configured by `SharedARCaptureRig`) instead of letting
//  RoomPlan own its own session: the rig runs an `ARWorldTrackingConfiguration` with
//  scene-mesh reconstruction + smoothed depth, then this driver builds
//  `RoomCaptureView(frame:arSession:)` on that running session (the iOS 17 shared-
//  session pattern — Apple docs: "RoomPlan preserves all of the AR session's
//  settings"). RoomPlan still owns the live 3D visualization, the RoomBuilder post-
//  process, the coverage heuristic, and the coaching instructions — all unchanged —
//  while the rig records the parallel evidence streams (SC-07 "four streams, one
//  clock"): scene mesh → `mesh.ply`, smoothed depth → `depth/`, and the posed-photo
//  lane (now a `CaptureFrameSink`, migrated off the raw ARSessionDelegate).
//
//  The two ALWAYS-present core artifacts are unchanged: a USDZ and the CapturedRoom
//  parametric JSON, exported at finish. The rig's depth/mesh land in the SAME bundle
//  dir alongside `photos/`; assembling the full manifest + resumable upload of the
//  new artifacts is item 8, deliberately NOT done here (item 3 records to disk only).
//
//  Only ever instantiated by `SupabaseSiteScanService` (real mode, LiDAR device).
//  The simulator / preview / `-CaptureScreen` harness runs `MockScanSession`
//  (CaptureKitMocks) instead, so this RoomPlan/ARKit code never executes there — it
//  only has to COMPILE for the simulator, which it does (RoomPlan/ARKit link on the
//  sim; `RoomCaptureSession.isSupported` returns false so this class is never built
//  live there).
//
//  Coverage heuristic (see `coverage(for:)`): unchanged from the pre-item-3 driver —
//  a COARSE 0…1 proxy from how much structure RoomPlan has locked in. It keeps
//  working because `RoomCaptureSessionDelegate` still fires `didUpdate`/`didProvide`
//  when RoomPlan rides a shared session (device-verify — see item-3 AC).

import Foundation
import SwiftUI
import CaptureKit
#if canImport(RoomPlan)
import RoomPlan
import ARKit
import UIKit
import simd
import os.log
import CoreImage
import CoreVideo
import ImageIO
import UniformTypeIdentifiers

@MainActor
final class RoomPlanScanSession: NSObject, FieldScanSession {

    /// The shared-ARSession capture core (item 3). Owns + configures + runs the
    /// `ARSession`; is its delegate; fans frames/mesh out to the recorders.
    private let rig = SharedARCaptureRig()

    /// Stable client scan-session id for context-capture provenance correlation
    /// (item 7) — the remote scan id isn't minted until upload.
    let scanSessionId = UUID().uuidString.lowercased()

    /// The RoomPlan view F2 embeds. Built on the rig's running session in `start()`
    /// (RoomCaptureView requires an already-running ARSession), so it is nil until
    /// the F2 view host calls `start()`.
    private(set) var roomCaptureView: RoomCaptureView?

    // Event plumbing — a single stream the F2 screen consumes.
    private let eventStream: AsyncStream<FieldScanEvent>
    private let eventContinuation: AsyncStream<FieldScanEvent>.Continuation
    var events: AsyncStream<FieldScanEvent> { eventStream }

    // finish() parks here until RoomBuilder presents the processed room.
    private var finishContinuation: CheckedContinuation<CapturedRoom, Error>?
    private var didResumeFinish = false
    private var started = false

    // Derived metrics the uploader reads back for the room_scans row (best-effort).
    private(set) var lastCoverage: Double = 0
    private(set) var floorAreaSqm: Double?
    private(set) var dimensionsMeters: SIMD3<Double>?

    // Posed-photo lane (I76) — now a `CaptureFrameSink` (item 3) fed by the rig,
    // rather than tapping the ARSessionDelegate directly. Behavior unchanged.
    private let posedPhotos = FieldPosedPhotoService()

    /// The export bundle dir — created at `start()` so depth/mesh/photos stream
    /// into it live, and reused by `exportBundle` for usdz/json/sidecar.
    private var bundleDir: URL?

    // Typed anchors (item 6). Collected during the anchor-entry step (session still
    // alive) and persisted to `anchors.json` at finish; the count drives UNVERIFIED.
    private(set) var anchors: [AnchorRecord] = []
    private var pendingAnchorEndpoints: [SIMD3<Float>] = []

    private let logger = Logger(subsystem: "cloud.patina.field", category: "SiteScan")

    override init() {
        let made = AsyncStream.makeStream(of: FieldScanEvent.self)
        eventStream = made.stream
        eventContinuation = made.continuation
        super.init()
        // View + delegate wiring is deferred to `start()`: the shared session must
        // be running before `RoomCaptureView(frame:arSession:)` is created.
    }

    // `RoomCaptureViewDelegate` vestigially refines `NSCoding`; this driver is
    // never archived, so satisfy it with no-op stubs.
    nonisolated required init?(coder: NSCoder) { nil }
    nonisolated func encode(with coder: NSCoder) {}

    /// Begin the live scan. Idempotent — the F2 view host calls this when the
    /// RoomCaptureView appears (RoomPlan wants `run` tied to view appearance).
    func start() {
        guard !started else { return }
        started = true
        eventContinuation.yield(.status("Scanning — walk the room slowly"))

        // Best-effort shared bundle dir. On success the rig records depth/mesh and
        // the posed lane samples into `photos/`; on failure the shared session
        // still runs so RoomPlan can scan, and `exportBundle` mints a dir later.
        let dir = try? makeBundleDir()
        bundleDir = dir

        // Run the shared ARSession (mesh + smoothed depth) + attach depth/mesh
        // recorders. This must happen BEFORE building the RoomCaptureView.
        rig.startRecording(bundleDir: dir, startDate: Date())

        // Migrate the posed-photo lane onto the rig's frame sink (best-effort).
        if let dir {
            let photosDir = dir.appendingPathComponent(RoomScanStoragePath.Folder.photos, isDirectory: true)
            if (try? FileManager.default.createDirectory(at: photosDir, withIntermediateDirectories: true)) != nil {
                rig.addFrameSink(posedPhotos)
                posedPhotos.start(photosDir: photosDir, at: rig.timebase.start)
            } else {
                logger.error("Posed-photo dir prep failed — photos disabled for this scan.")
            }
        }

        // Build the RoomCaptureView on the shared, running session and wire RoomPlan.
        let view = RoomCaptureView(frame: .zero, arSession: rig.arSession)
        view.captureSession.delegate = self       // RoomCaptureSessionDelegate (coverage/instructions)
        view.delegate = self                       // RoomCaptureViewDelegate (RoomBuilder post-process)
        roomCaptureView = view
        view.captureSession.run(configuration: RoomCaptureSession.Configuration())

        // Claim the ARSession delegate AFTER RoomPlan's run so RoomPlan can't
        // overwrite it out from under the rig (the proven ordering).
        rig.assumeFrameDelegate()
    }

    private func makeBundleDir() throws -> URL {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
            .appendingPathComponent("site-scan-\(UUID().uuidString.lowercased())", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// Stop scanning, let RoomPlan build the final room, export the two artifacts.
    func finish() async throws -> FieldScanResult {
        // Stop posed sampling; let RoomPlan finalize (RoomBuilder) on the shared
        // session, THEN tear the rig down (final mesh.ply + depth drain, pause AR).
        posedPhotos.stop()
        let room = try await withCheckedThrowingContinuation { cont in
            finishContinuation = cont
            roomCaptureView?.captureSession.stop()   // → captureView(shouldPresent:) → didPresent
        }
        rig.stopRecording(anchorCount: anchors.count)
        eventContinuation.finish()

        let dims = Self.estimateDimensions(from: room)
        dimensionsMeters = dims
        floorAreaSqm = dims.map { $0.x * $0.z }

        let bundleURL = try exportBundle(room)
        return FieldScanResult(localBundleURL: bundleURL,
                               roomName: nil,
                               areaLabel: floorAreaSqm.map(Self.areaLabel),
                               scorecard: rig.lastScorecard)
    }

    func cancel() {
        // Stop RoomPlan first, then tear the rig down (pause AR + finalize), so
        // the RoomCaptureSession is never stopped on an already-paused session.
        posedPhotos.stop()
        roomCaptureView?.captureSession.stop()
        rig.stopRecording()
        eventContinuation.finish()
        if !didResumeFinish {
            didResumeFinish = true
            finishContinuation?.resume(throwing: SiteScanError.cancelled)
            finishContinuation = nil
        }
    }

    // MARK: - Export (USDZ + CapturedRoom JSON → temp bundle dir)

    private func exportBundle(_ room: CapturedRoom) throws -> URL {
        // Reuse the dir created at `start()` (where photos/depth/mesh streamed
        // live); fall back to a fresh dir only if bundle-dir setup never ran.
        let dir = try bundleDir ?? makeBundleDir()

        let usdzURL = dir.appendingPathComponent(RoomScanStoragePath.Filename.usdz)
        do {
            // A `.usdz` extension makes RoomPlan write a compressed USDZ archive;
            // `.parametric` keeps the room model (walls/openings/objects), not a mesh.
            try room.export(to: usdzURL, exportOptions: .parametric)
        } catch {
            throw SiteScanError.exportFailed("USDZ export failed: \(error.localizedDescription)")
        }

        let jsonURL = dir.appendingPathComponent(RoomScanStoragePath.Filename.capturedRoom)
        do {
            // CapturedRoom is Codable (iOS 17+) — authoritative parametric geometry.
            let data = try JSONEncoder().encode(room)
            try data.write(to: jsonURL, options: .atomic)
        } catch {
            throw SiteScanError.exportFailed("CapturedRoom JSON export failed: \(error.localizedDescription)")
        }

        // Posed-photo sidecar — STRICTLY best-effort. The two core artifacts above
        // are already written; a sidecar failure must not fail the export.
        writePhotosSidecar(into: dir)
        writeAnchorsSidecar(into: dir)
        // Manifest LAST — after every sidecar/artifact is on disk (item 8).
        writeManifest(into: dir)
        return dir
    }

    /// Assemble + write `manifest.json` (item 8). Best-effort — the bundle's core
    /// artifacts are already written; a manifest failure just means the uploader/
    /// server can't read the inventory (logged).
    private func writeManifest(into dir: URL) {
        let m = rig.metrics
        let start = rig.timebase.start
        let now = Date()
        let iso = ISO8601DateFormatter()
        let bundle = Bundle.main
        let inputs = FieldManifestAssembler.Inputs(
            scanId: scanSessionId,
            roomName: floorAreaSqm.map(Self.areaLabel) ?? "Room",
            createdAt: iso.string(from: start),
            completedAt: iso.string(from: now),
            anchors: anchors,
            scorecard: rig.lastScorecard ?? Self.emptyScorecard,
            device: .init(model: UIDevice.current.model,
                          osVersion: UIDevice.current.systemVersion,
                          hasLidar: RoomCaptureSession.isSupported,
                          roomPlanVersion: "1.0"),
            capture: .init(highFidelityDepthEnabled: true, autoPhotoInterval: 2.0),
            session: .init(sessionId: scanSessionId,
                           appVersion: bundle.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0",
                           appBuild: bundle.infoDictionary?["CFBundleVersion"] as? String ?? "0",
                           startedAt: iso.string(from: start), endedAt: iso.string(from: now),
                           captureDurationSeconds: Int(now.timeIntervalSince(start)),
                           arWorldTrackingConfig: "shared-roomcapture",
                           thermalPeak: Self.thermalLabel(ProcessInfo.processInfo.thermalState)),
            poseGraphSummary: .init(keyframeCount: m.keyframesFired, nodeCount: m.keyframesFired,
                                    edgeCount: 0, loopClosures: 0, meanTranslationDriftPct: 0.3,
                                    blurRejectedCount: m.keyframesBlurRejected,
                                    rawBlurFailures: m.keyframesRawBlurFailures,
                                    encodeDropped: m.keyframesEncodeDropped),
            captureEnvironment: .init(sceneDepthFrameCount: m.depthFramesWritten,
                                      coverageHeatmapPresent: false),
            annotations: .init(),
            photos: posedPhotos.capturedEntries)
        do {
            try FieldManifestAssembler.assemble(bundleDir: dir, inputs: inputs)
        } catch {
            logger.error("Manifest assembly failed (scan still exports): \(error.localizedDescription)")
        }
    }

    private static let emptyScorecard = Scorecard(
        coveragePct: 0, sharpFrameRatio: 0, trackingHealth: .poor, anchorCount: 0,
        verdict: .red, surfaceChecklist: [], namedGaps: [])

    private static func thermalLabel(_ state: ProcessInfo.ThermalState) -> String {
        switch state {
        case .nominal: return "nominal"
        case .fair: return "fair"
        case .serious: return "serious"
        case .critical: return "critical"
        @unknown default: return "nominal"
        }
    }

    /// Serialise the typed anchors to `anchors.json` (a mirror of manifest.anchors;
    /// item 8 folds it in + derives UNVERIFIED via `AnchorGate.isUnverified`).
    /// No-op when no anchors were entered. Log-only on failure.
    private func writeAnchorsSidecar(into dir: URL) {
        guard !anchors.isEmpty else { return }
        do {
            let data = try JSONEncoder().encode(anchors)
            try data.write(to: dir.appendingPathComponent("anchors.json"), options: .atomic)
        } catch {
            logger.error("Anchors sidecar write failed (scan still exports): \(error.localizedDescription)")
        }
    }

    /// Serialise the captured `[FieldPhotoEntry]` to `photos_metadata.json`
    /// alongside `photos/`. No-op when nothing was captured. Log-only on failure.
    private func writePhotosSidecar(into dir: URL) {
        let entries = posedPhotos.capturedEntries
        guard !entries.isEmpty else { return }
        do {
            let data = try JSONEncoder().encode(entries)
            try data.write(to: dir.appendingPathComponent(RoomScanStoragePath.Filename.photosMetadata),
                           options: .atomic)
        } catch {
            logger.error("Posed-photo sidecar write failed (scan still exports): \(error.localizedDescription)")
        }
    }

    // MARK: - Coverage heuristic + dimension estimate

    /// COARSE 0…1 proxy for "how much room structure RoomPlan has locked in".
    /// A closed room has ≥4 walls, so walls carry 70% of the bar; the remaining
    /// 30% ramps with detected openings + objects. NOT a surface-area measurement.
    private func coverage(for room: CapturedRoom) -> Double {
        let wallShare = min(1.0, Double(room.walls.count) / 4.0) * 0.7
        let detail = room.doors.count + room.windows.count + room.openings.count + room.objects.count
        let detailShare = min(1.0, Double(detail) / 6.0) * 0.3
        return min(1.0, wallShare + detailShare)
    }

    /// Axis-aligned footprint from wall centers (x = width, z = depth, y = height).
    /// Coarse — ignores wall thickness — and nil below two walls where it is
    /// meaningless. Used only for the room_scans metadata columns + the area label.
    private static func estimateDimensions(from room: CapturedRoom) -> SIMD3<Double>? {
        let walls = room.walls
        guard walls.count >= 2 else { return nil }
        var minX = Float.greatestFiniteMagnitude, maxX = -Float.greatestFiniteMagnitude
        var minZ = Float.greatestFiniteMagnitude, maxZ = -Float.greatestFiniteMagnitude
        var maxHeight: Float = 0
        for wall in walls {
            let c = wall.transform.columns.3
            minX = min(minX, c.x); maxX = max(maxX, c.x)
            minZ = min(minZ, c.z); maxZ = max(maxZ, c.z)
            maxHeight = max(maxHeight, wall.dimensions.y)
        }
        let width = Double(maxX - minX), depth = Double(maxZ - minZ)
        guard width > 0.1, depth > 0.1 else { return nil }
        return SIMD3<Double>(width, Double(maxHeight), depth)
    }

    /// Metric footprint → an imperial "sq ft" label (US-designer context).
    static func areaLabel(_ sqm: Double) -> String {
        "\(Int((sqm * 10.7639).rounded())) sq ft"
    }
}

// MARK: - RoomPlan delegate
//
// Conformance to BOTH RoomCaptureViewDelegate (the RoomBuilder post-process
// callbacks) and RoomCaptureSessionDelegate (live coverage/coaching). Note the
// ARSessionDelegate is NO LONGER here — as of item 3 the rig owns the ARSession
// and its delegate; this driver only observes RoomPlan's own delegates. The
// `nonisolated` + MainActor hop mirrors the reference RoomCaptureService.

extension RoomPlanScanSession: RoomCaptureViewDelegate, RoomCaptureSessionDelegate {

    // ── Live scan telemetry (RoomCaptureSessionDelegate, inherited) ──
    nonisolated func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
        Task { @MainActor in
            let value = self.coverage(for: room)
            self.lastCoverage = value
            self.eventContinuation.yield(.coverage(value))
            // Fan the live parametric graph out to the rig's room-update sinks
            // (item 5's coach rebuilds its surfaces here) on the shared clock, then
            // surface the coach's live checklist/warnings to F2 on this cadence.
            self.rig.deliverRoomUpdate(room)
            if let coverage = self.rig.coverageSnapshot() {
                self.eventContinuation.yield(.coverageUpdate(coverage))
            }
        }
    }

    nonisolated func captureSession(_ session: RoomCaptureSession,
                                    didProvide instruction: RoomCaptureSession.Instruction) {
        let line = RoomPlanScanSession.status(for: instruction)
        Task { @MainActor in self.eventContinuation.yield(.status(line)) }
    }

    /// Map RoomPlan's coaching instruction to a human-readable F2 status line.
    nonisolated static func status(for instruction: RoomCaptureSession.Instruction) -> String {
        switch instruction {
        case .moveCloseToWall:  return "Move closer to the wall"
        case .moveAwayFromWall: return "Step back from the wall"
        case .slowDown:         return "Slow down"
        case .turnOnLight:      return "Too dark — turn on a light"
        case .normal:           return "Looking good — keep scanning"
        case .lowTexture:       return "Low detail here — pan slowly"
        @unknown default:       return "Keep scanning"
        }
    }

    // ── RoomBuilder post-process → finish() (RoomCaptureViewDelegate) ──

    /// Let the view run its built-in RoomBuilder pass on the raw data.
    nonisolated func captureView(shouldPresent roomDataForProcessing: CapturedRoomData,
                                 error: Error?) -> Bool {
        true
    }

    /// The processed room (or a producer error) — the single completion point
    /// `finish()` is awaiting.
    nonisolated func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        Task { @MainActor in
            guard !self.didResumeFinish else { return }
            self.didResumeFinish = true
            if let error {
                self.finishContinuation?.resume(
                    throwing: SiteScanError.processingFailed(error.localizedDescription))
            } else {
                self.finishContinuation?.resume(returning: processedResult)
            }
            self.finishContinuation = nil
        }
    }
}

// MARK: - AnchorCapturing (item 6 — raycast the SHARED session, no second ARView)

extension RoomPlanScanSession: AnchorCapturing {

    var capturedAnchors: [AnchorRecord] { anchors }
    var pendingEndpoints: [SIMD3<Float>] { pendingAnchorEndpoints }

    var pendingSpanMeters: Double? {
        guard pendingAnchorEndpoints.count == 2 else { return nil }
        return Double(simd_distance(pendingAnchorEndpoints[0], pendingAnchorEndpoints[1]))
    }

    @discardableResult
    func tapAnchorPoint(screenPoint: CGPoint, viewport: CGSize) -> Bool {
        guard let point = raycastWorldPoint(screenPoint: screenPoint, viewport: viewport) else { return false }
        if pendingAnchorEndpoints.count >= 2 { pendingAnchorEndpoints.removeAll() }
        pendingAnchorEndpoints.append(point)
        return true
    }

    @discardableResult
    func commitAnchor(measuredValueMillimetres: Int, label: String) -> AnchorRecord? {
        guard pendingAnchorEndpoints.count == 2, measuredValueMillimetres > 0 else { return nil }
        let a = pendingAnchorEndpoints[0], b = pendingAnchorEndpoints[1]
        let record = AnchorRecord(
            id: UUID().uuidString.lowercased(),
            index: anchors.count,
            label: label,
            spanKind: AnchorGate.autoSpanKind(dx: Double(b.x - a.x), dy: Double(b.y - a.y), dz: Double(b.z - a.z)),
            entryMethod: .typed,
            endpointA: .init(x: Double(a.x), y: Double(a.y), z: Double(a.z)),
            endpointB: .init(x: Double(b.x), y: Double(b.y), z: Double(b.z)),
            modelSpanMeters: Double(simd_distance(a, b)),
            measuredValueMm: measuredValueMillimetres)
        anchors.append(record)
        pendingAnchorEndpoints.removeAll()
        return record
    }

    func clearPendingAnchor() { pendingAnchorEndpoints.removeAll() }

    func beginAnchoringPhase() {
        rig.setDepthPaused(true)   // static scene — stop depth waste
        posedPhotos.stop()         // protect the 60-cap from photos of the user typing
        // Keyframe lane stays live: deliberate framing near a span is high-value.
    }

    /// Raycast the SHARED rig ARSession from a screen tap by manual unprojection —
    /// NOT a second ARView. Derives the interface orientation dynamically (A3) so a
    /// rotated device projects correctly; the viewport (from the tap layer's
    /// GeometryReader) is already in the same orientation's coordinates. Targets
    /// estimated + existing planes (walls/floor RoomPlan detects). Failure modes: no
    /// plane hit (textureless / low confidence / glass) → nil, user re-taps.
    private func raycastWorldPoint(screenPoint: CGPoint, viewport: CGSize) -> SIMD3<Float>? {
        guard let frame = rig.arSession.currentFrame,
              let query = Self.raycastQuery(screenPoint: screenPoint, viewport: viewport,
                                            frame: frame, orientation: Self.currentInterfaceOrientation())
        else { return nil }
        guard let result = rig.arSession.raycast(query).first else { return nil }
        let t = result.worldTransform.columns.3
        return SIMD3<Float>(t.x, t.y, t.z)
    }

    /// The active window scene's interface orientation (defaults to portrait — the
    /// scan chrome's design orientation — if none is resolvable).
    private static func currentInterfaceOrientation() -> UIInterfaceOrientation {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }?
            .interfaceOrientation ?? .portrait
    }

    private static func raycastQuery(screenPoint: CGPoint, viewport: CGSize, frame: ARFrame,
                                     orientation: UIInterfaceOrientation) -> ARRaycastQuery? {
        guard viewport.width > 0, viewport.height > 0 else { return nil }
        let camera = frame.camera
        let view = camera.viewMatrix(for: orientation)
        let projection = camera.projectionMatrix(for: orientation, viewportSize: viewport, zNear: 0.001, zFar: 1000)
        let inverseVP = simd_inverse(projection * view)
        let clipX = Float(2 * screenPoint.x / viewport.width - 1)
        let clipY = Float(1 - 2 * screenPoint.y / viewport.height)   // flip Y (UIKit → NDC)
        let near = inverseVP * SIMD4<Float>(clipX, clipY, 0, 1)
        let far = inverseVP * SIMD4<Float>(clipX, clipY, 1, 1)
        guard near.w != 0, far.w != 0 else { return nil }
        let nearWorld = SIMD3<Float>(near.x, near.y, near.z) / near.w
        let farWorld = SIMD3<Float>(far.x, far.y, far.z) / far.w
        let direction = simd_normalize(farWorld - nearWorld)
        return ARRaycastQuery(origin: nearWorld, direction: direction, allowing: .estimatedPlane, alignment: .any)
    }
}

// MARK: - ContextCapturing (item 7 — detail photo + pose from the live session)

extension RoomPlanScanSession: ContextCapturing {

    func captureContextFrame() -> ContextFrameSnapshot? {
        guard let frame = rig.arSession.currentFrame else { return nil }
        let ciImage = CIImage(cvPixelBuffer: frame.capturedImage).oriented(.right)
        guard let cgImage = Self.contextCIContext.createCGImage(ciImage, from: ciImage.extent),
              let data = Self.encodeContextJPEG(cgImage) else { return nil }
        return ContextFrameSnapshot(imageData: data, width: cgImage.width, height: cgImage.height,
                                    poseRowMajor: Self.rowMajorDouble(frame.camera.transform),
                                    filenameExtension: "jpg")
    }

    private static let contextCIContext = CIContext(options: [.useSoftwareRenderer: false])

    private static func encodeContextJPEG(_ cgImage: CGImage) -> Data? {
        let mutable = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(
            mutable, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(dest, cgImage,
                                   [kCGImageDestinationLossyCompressionQuality: 0.8] as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { return nil }
        return mutable as Data
    }

    private static func rowMajorDouble(_ m: simd_float4x4) -> [Double] {
        [
            Double(m.columns.0.x), Double(m.columns.1.x), Double(m.columns.2.x), Double(m.columns.3.x),
            Double(m.columns.0.y), Double(m.columns.1.y), Double(m.columns.2.y), Double(m.columns.3.y),
            Double(m.columns.0.z), Double(m.columns.1.z), Double(m.columns.2.z), Double(m.columns.3.z),
            Double(m.columns.0.w), Double(m.columns.1.w), Double(m.columns.2.w), Double(m.columns.3.w)
        ]
    }
}

// MARK: - SwiftUI host for the live RoomPlan view (F2, device only)

/// Embeds the session's `RoomCaptureView` and ties `start()` to view appearance.
struct RoomCaptureViewContainer: UIViewRepresentable {
    let session: RoomPlanScanSession

    func makeUIView(context: Context) -> RoomCaptureView {
        // RoomPlan wants `run` when the view is on screen — start here, once.
        // start() builds + returns the RoomCaptureView on the shared session.
        session.start()
        return session.roomCaptureView ?? RoomCaptureView(frame: .zero)
    }

    func updateUIView(_ uiView: RoomCaptureView, context: Context) {}
}
#endif

/// Errors surfaced by the site-scan session + upload. Available on every target
/// (the concrete session above is device-only, but the screens reference these).
enum SiteScanError: LocalizedError {
    case unsupported
    case cancelled
    case notAuthenticated
    case processingFailed(String)
    case exportFailed(String)
    /// Residual case for `SupabaseSiteScanService.upload()`: 00258's
    /// `room_scans_guard_routing` rejected the project linkage (`user_id` isn't
    /// the project's `designer_id`/`created_by`). F1 now pre-filters its picker
    /// to guard-ownable projects, so this should only fire if ownership changed
    /// after F1 loaded, or a deep link routed straight into `.siteScan` — surface
    /// the real cause instead of the raw trigger message.
    case foreignProjectOwner

    var errorDescription: String? {
        switch self {
        case .unsupported:      return "This device can't run a room scan (LiDAR required)."
        case .cancelled:        return "Scan cancelled."
        case .notAuthenticated: return "You're signed out — sign in to upload this scan."
        case .processingFailed(let m): return m
        case .exportFailed(let m):     return m
        case .foreignProjectOwner: return "This project belongs to another designer."
        }
    }
}

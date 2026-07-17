//  RoomPlanScanSession.swift
//  Capture · Wave F (Pro site-scan) · Room View PHOTOS (I76)
//
//  The concrete, on-device `FieldScanSession` — a thin driver over Apple's
//  RoomPlan `RoomCaptureView` (which owns the `RoomCaptureSession` + the built-in
//  RoomBuilder post-process pass). It exports the two ALWAYS-present artifacts the
//  F pipeline ships — a USDZ and the CapturedRoom parametric JSON — to a temp
//  bundle dir, PLUS a best-effort posed-photo lane (I76): while the scan runs it
//  samples the RoomPlan `ARSession` into auto JPEG photos + 256px thumbs under
//  `photos/`, then writes a `photos_metadata.json` sidecar at export.
//
//  Photos NEVER block the core artifacts: the two core exports always run; the
//  photo lane is wrapped so a failure just yields a scan with no photos (an
//  absent sidecar ⇒ the uploader sees zero photos). Still NOT ported from the
//  client app's v3 pipeline: depth archives, world maps, NDJSON manifests, hero
//  pickers, quality scoring and coverage heatmaps.
//
//  Only ever instantiated by `SupabaseSiteScanService` (real mode, LiDAR device).
//  The simulator / preview / `-CaptureScreen` harness runs `MockScanSession`
//  (CaptureKitMocks) instead, so this RoomPlan code never executes there — it only
//  has to COMPILE for the simulator, which it does (the RoomPlan framework links
//  on the sim; `RoomCaptureSession.isSupported` just returns false).
//
//  Coverage heuristic (see `coverage(for:)`): RoomPlan does not vend a 0…1 room
//  coverage, and the reference app's CoverageAnalyzer is a whole subsystem we do
//  NOT port for v1. Instead we derive a COARSE proxy from how much *structure*
//  RoomPlan has locked in (walls dominate; doors/windows/objects nudge it) so the
//  F2 meter climbs sensibly as the user walks the room. It is an honest progress
//  cue, not a true surface-area measurement — documented as such.

import Foundation
import SwiftUI
import CaptureKit
#if canImport(RoomPlan)
import RoomPlan
import ARKit
import UIKit
import simd
import os.log

@MainActor
final class RoomPlanScanSession: NSObject, FieldScanSession {

    /// The RoomPlan view F2 embeds. Owns the live `RoomCaptureSession`.
    let roomCaptureView: RoomCaptureView

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

    // Posed-photo lane (I76). The service samples the RoomPlan ARSession into
    // JPEGs under `bundleDir/photos/` while the scan runs; the sidecar is written
    // at export. Both are best-effort and NEVER block the two core artifacts.
    private let posedPhotos = FieldPosedPhotoService()
    /// The export bundle dir — created up front (at `start()`) so posed photos
    /// can be written live, and reused by `exportBundle` for usdz/json/sidecar.
    private var bundleDir: URL?
    private let logger = Logger(subsystem: "cloud.patina.field", category: "SiteScan")

    override init() {
        roomCaptureView = RoomCaptureView(frame: .zero)
        let made = AsyncStream.makeStream(of: FieldScanEvent.self)
        eventStream = made.stream
        eventContinuation = made.continuation
        super.init()
        roomCaptureView.captureSession.delegate = self
        roomCaptureView.delegate = self
    }

    // `RoomCaptureViewDelegate` vestigially refines `NSCoding`; this driver is
    // never archived, so satisfy it with no-op stubs (nonisolated to match the
    // delegate callbacks below and the protocol's nonisolated requirements).
    nonisolated required init?(coder: NSCoder) { nil }
    nonisolated func encode(with coder: NSCoder) {}

    /// Begin the live scan. Idempotent — the F2 view host calls this when the
    /// RoomCaptureView appears (RoomPlan wants `run` tied to view appearance).
    func start() {
        guard !started else { return }
        started = true
        eventContinuation.yield(.status("Scanning — walk the room slowly"))
        roomCaptureView.captureSession.run(configuration: RoomCaptureSession.Configuration())
        // RoomPlan does NOT claim `ARSessionDelegate` (it owns the RoomCapture-
        // Session + RoomCaptureView delegates, wired in init) — so we can take
        // the ARSession delegate for posed-photo frame taps. Set it AFTER
        // `run(...)`, once the session's ARSession is live, mirroring the
        // reference `RoomCaptureSessionDriver.run()`.
        roomCaptureView.captureSession.arSession.delegate = self
        // Best-effort: prepare the bundle + `photos/` dir and begin sampling. A
        // failure here means no photos this scan, but the core scan proceeds.
        startPosedPhotoCapture()
    }

    /// Create the export bundle dir + its `photos/` subdir and begin auto-
    /// sampling. Log-only on failure — the scan must never be blocked by photos.
    private func startPosedPhotoCapture() {
        do {
            let dir = try makeBundleDir()
            let photosDir = dir.appendingPathComponent(RoomScanStoragePath.Folder.photos, isDirectory: true)
            try FileManager.default.createDirectory(at: photosDir, withIntermediateDirectories: true)
            bundleDir = dir
            posedPhotos.start(photosDir: photosDir)
        } catch {
            logger.error("Posed-photo capture disabled for this scan: \(error.localizedDescription)")
        }
    }

    private func makeBundleDir() throws -> URL {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
            .appendingPathComponent("site-scan-\(UUID().uuidString.lowercased())", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// Stop scanning, let RoomPlan build the final room, export the two artifacts.
    func finish() async throws -> FieldScanResult {
        // Stop sampling before we tear the session down and build the sidecar.
        posedPhotos.stop()
        let room = try await withCheckedThrowingContinuation { cont in
            finishContinuation = cont
            roomCaptureView.captureSession.stop()   // → captureView(shouldPresent:) → didPresent
        }
        eventContinuation.finish()

        let dims = Self.estimateDimensions(from: room)
        dimensionsMeters = dims
        floorAreaSqm = dims.map { $0.x * $0.z }

        let bundleURL = try exportBundle(room)
        return FieldScanResult(localBundleURL: bundleURL,
                               roomName: nil,
                               areaLabel: floorAreaSqm.map(Self.areaLabel))
    }

    func cancel() {
        posedPhotos.stop()
        roomCaptureView.captureSession.stop()
        eventContinuation.finish()
        if !didResumeFinish {
            didResumeFinish = true
            finishContinuation?.resume(throwing: SiteScanError.cancelled)
            finishContinuation = nil
        }
    }

    // MARK: - Export (USDZ + CapturedRoom JSON → temp bundle dir)

    private func exportBundle(_ room: CapturedRoom) throws -> URL {
        // Reuse the dir created at `start()` (where `photos/` was written live);
        // fall back to a fresh dir only if posed-photo setup never ran.
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
        // are already written; a sidecar failure must not fail the export. An
        // absent sidecar simply means the uploader sees zero photos.
        writePhotosSidecar(into: dir)
        return dir
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
// callbacks) and RoomCaptureSessionDelegate (live coverage/coaching) — the view
// delegate does not refine the session delegate, so both are declared here so all
// four callbacks live under a single extension. Session-delegate methods not
// implemented here use RoomPlan's default (empty) implementations.
// `nonisolated` + a MainActor hop mirrors the reference RoomCaptureService (the
// RoomPlan delegates are not MainActor-isolated).

extension RoomPlanScanSession: RoomCaptureViewDelegate, RoomCaptureSessionDelegate {

    // ── Live scan telemetry (RoomCaptureSessionDelegate, inherited) ──
    nonisolated func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
        Task { @MainActor in
            let value = self.coverage(for: room)
            self.lastCoverage = value
            self.eventContinuation.yield(.coverage(value))
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

// MARK: - ARSessionDelegate (posed-photo frame taps)
//
// RoomPlan does not implement `ARSessionDelegate` on its RoomCaptureSession, so
// we own it for the posed-photo lane. `nonisolated` + a MainActor hop mirrors the
// reference `RoomCaptureService`: the delegate fires off the main actor, and the
// hop both retains the ARFrame past this callback and lets the @MainActor service
// snapshot it. `consume(frame:)` self-gates via `FieldPhotoGate`, so feeding every
// frame is fine — most are dropped by the 2.0s interval.

extension RoomPlanScanSession: ARSessionDelegate {
    nonisolated func session(_ session: ARSession, didUpdate frame: ARFrame) {
        Task { @MainActor in
            self.posedPhotos.consume(frame: frame)
        }
    }
}

// MARK: - SwiftUI host for the live RoomPlan view (F2, device only)

/// Embeds the session's `RoomCaptureView` and ties `start()` to view appearance.
struct RoomCaptureViewContainer: UIViewRepresentable {
    let session: RoomPlanScanSession

    func makeUIView(context: Context) -> RoomCaptureView {
        // RoomPlan wants `run` when the view is on screen — start here, once.
        session.start()
        return session.roomCaptureView
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

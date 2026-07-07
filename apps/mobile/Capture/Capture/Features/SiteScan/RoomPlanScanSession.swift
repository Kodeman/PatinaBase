//  RoomPlanScanSession.swift
//  Capture · Wave F (Pro site-scan)
//
//  The concrete, on-device `FieldScanSession` — a thin driver over Apple's
//  RoomPlan `RoomCaptureView` (which owns the `RoomCaptureSession` + the built-in
//  RoomBuilder post-process pass). v1-MINIMAL by design: it exports only the two
//  artifacts the F pipeline ships — a USDZ and the CapturedRoom parametric JSON —
//  to a temp bundle dir. No depth archives, world maps, posed photos or coverage
//  heatmaps (that is the client app's v3 pipeline; deliberately not ported).
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
    }

    /// Stop scanning, let RoomPlan build the final room, export the two artifacts.
    func finish() async throws -> FieldScanResult {
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
        let dir = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
            .appendingPathComponent("site-scan-\(UUID().uuidString.lowercased())", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

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
        return dir
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

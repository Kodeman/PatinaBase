//  FieldDepthRecorder.swift
//  Capture · Wave F (Pro site-scan) · Field Capture P1 · item 3
//
//  Streams smoothed per-frame depth (with confidence) off the shared ARSession to
//  the capture bundle's `depth/` directory, on the shared clock. A `CaptureFrameSink`
//  fed by `SharedARCaptureRig`. Field port of the client app's `DepthFrameRecorder`
//  (`apps/mobile/Patina/.../Walk/Services/DepthFrameRecorder.swift`), adapted to:
//    • the Field capture-bundle spec §4 layout — `depth/<frame>.bin` +
//      `depth/depth_index.ndjson` (the client wrote PNG pairs; the Field bundle
//      spec canonicalizes on a compact `.bin`, blessed code-only per the package's
//      authority note "file naming inside the bundle");
//    • the shared `CaptureTimebase` (one clock) and `CaptureCadence.depth` (~1 Hz);
//    • `smoothedSceneDepth` first, falling back to `sceneDepth` — item 3 asks for
//      smoothed depth, but a session that only vends plain sceneDepth (e.g. if a
//      RoomPlan attach reset the frame semantics) still records usable evidence.
//
//  Budget + frame-pump discipline (item 3, point 6): the per-frame decision and a
//  cheap pixel-buffer snapshot run on the MainActor; ALL encoding + file IO hops to
//  a serial background queue (`DepthBundleWriter`, confined to its own queue), so
//  the AR frame pump is never stalled. Throttled to ~1 Hz so a 10-minute session
//  stays well inside the 300–600 MB bundle budget.
//
//  ── `.bin` on-disk format (little-endian) ──────────────────────────────────────
//    magic     : 4 bytes  "PFD1"  (Patina Field Depth v1)
//    version   : UInt16   = 1
//    flags     : UInt16   bit0 = smoothed source, bit1 = confidence plane present
//    width     : UInt32
//    height    : UInt32
//    depth[]   : width*height × UInt16  — millimetres, row-major
//                (0 = invalid/NaN/≤0; clamped to UInt16.max ≈ 65.5 m)
//    conf[]    : width*height × UInt8   — ARConfidenceLevel raw (0/1/2), row-major
//                (present iff flags bit1)
//  The index NDJSON carries the pose, intrinsics, both clocks, and the flags so a
//  server-side reader parses `.bin` without guessing (item 9 ingest).

import Foundation
import CaptureKit
import os.log

#if canImport(ARKit)
import ARKit
import CoreVideo
import simd

/// Immutable per-frame snapshot handed from the MainActor sink to the background
/// writer. The CVPixelBuffers are ref-counted; moving the snapshot into the writer
/// retains them past the ARKit frame's recycle.
private struct DepthSnapshot: @unchecked Sendable {
    let depthMap: CVPixelBuffer
    let confidenceMap: CVPixelBuffer?
    let cameraTransform: simd_float4x4
    let intrinsics: simd_float3x3
    let imageResolution: CGSize
    let timestampSeconds: TimeInterval
    let frameTimestamp: TimeInterval
    let smoothed: Bool
}

/// One line of `depth/depth_index.ndjson` (file scope to keep nesting shallow).
private struct DepthIndexEntry: Codable {
    let depthPath: String        // "depth/depth_<ts>.bin"
    let timestampSeconds: Double // shared clock (seconds since session start)
    let frameTimestamp: Double   // raw ARFrame.timestamp (monotonic) for sub-frame alignment
    let cameraTransform: [Double] // row-major 4x4, length 16
    let intrinsics: Intrinsics
    let width: Int
    let height: Int
    let smoothed: Bool
    let hasConfidence: Bool
    let depthFormat: String      // "u16mm+u8conf"

    struct Intrinsics: Codable {
        let fx: Double, fy: Double, cx: Double, cy: Double
        let imageWidth: Int, imageHeight: Int
    }
}

@MainActor
final class FieldDepthRecorder: CaptureFrameSink {

    private let timebase: CaptureTimebase
    private let cadence: CaptureCadence
    /// Nil when `depth/` could not be prepared — capture() then no-ops (best-effort).
    private let writer: DepthBundleWriter?

    /// Accepted-for-persistence frame count (MainActor-only; telemetry).
    private(set) var framesWritten = 0

    /// Throttle state — compared on the monotonic `ARFrame.timestamp`.
    private var lastSampleTimestamp: TimeInterval?

    private let logger = Logger(subsystem: "cloud.patina.field", category: "DepthRecorder")

    /// Best-effort: a failure to prepare `depth/` disables this stream for the
    /// scan (capture() no-ops) — the core scan is never blocked.
    init(bundleDir: URL, timebase: CaptureTimebase, cadence: CaptureCadence = .depth) {
        self.timebase = timebase
        self.cadence = cadence
        self.writer = DepthBundleWriter(bundleDir: bundleDir)
        if writer == nil {
            logger.error("Depth recording disabled: could not create depth/ dir.")
        }
    }

    // MARK: - CaptureFrameSink

    func capture(frame: ARFrame, timestampSeconds: TimeInterval) {
        guard let writer else { return }
        // Prefer smoothed depth (item 3); fall back to plain sceneDepth.
        let smoothed = frame.smoothedSceneDepth != nil
        guard let depth = frame.smoothedSceneDepth ?? frame.sceneDepth else { return }

        let frameTimestamp = frame.timestamp
        guard cadence.shouldSample(now: frameTimestamp, last: lastSampleTimestamp) else { return }
        lastSampleTimestamp = frameTimestamp
        framesWritten += 1

        writer.enqueue(DepthSnapshot(
            depthMap: depth.depthMap,
            confidenceMap: depth.confidenceMap,
            cameraTransform: frame.camera.transform,
            intrinsics: frame.camera.intrinsics,
            imageResolution: frame.camera.imageResolution,
            timestampSeconds: timestampSeconds,
            frameTimestamp: frameTimestamp,
            smoothed: smoothed
        ))
    }

    /// Drain pending writes and close the index handle. Idempotent.
    func finish() {
        writer?.finish()
    }
}

// MARK: - Background writer (queue-confined; not MainActor)
//
// All mutable IO state (the index `FileHandle`) lives here and is only ever
// touched on `ioQueue`, so the type is safely `@unchecked Sendable`.

private final class DepthBundleWriter: @unchecked Sendable {

    private let depthDir: URL
    private let indexURL: URL
    private let ioQueue = DispatchQueue(label: "cloud.patina.field.depth.io", qos: .utility)
    private var indexHandle: FileHandle?   // touched only on ioQueue
    private let logger = Logger(subsystem: "cloud.patina.field", category: "DepthRecorder")

    init?(bundleDir: URL) {
        let dir = bundleDir.appendingPathComponent("depth", isDirectory: true)
        let index = dir.appendingPathComponent("depth_index.ndjson", isDirectory: false)
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            if !FileManager.default.fileExists(atPath: index.path) {
                FileManager.default.createFile(atPath: index.path, contents: nil)
            }
        } catch {
            return nil
        }
        self.depthDir = dir
        self.indexURL = index
    }

    func enqueue(_ snap: DepthSnapshot) {
        ioQueue.async { [self] in write(snap) }
    }

    func finish() {
        ioQueue.sync {
            if let indexHandle {
                try? indexHandle.close()
                self.indexHandle = nil
            }
        }
    }

    // MARK: - On the io queue

    private func write(_ snap: DepthSnapshot) {
        // Shared encoder (used by the keyframe lane too); `hasConfidence` comes
        // from whether a confidence plane was actually packed, so the index field
        // and the `.bin` header flag stay in lockstep (I2).
        guard let encoded = DepthBinEncoder.encode(depthMap: snap.depthMap,
                                                    confidenceMap: snap.confidenceMap,
                                                    smoothed: snap.smoothed) else {
            logger.error("Depth frame encode failed")
            return
        }

        // Filename key from the MONOTONIC frame timestamp (not wall-clock task
        // time) so two accepted frames can never collide to one file (K3, symmetric
        // with the keyframe lane). At 1 Hz cadence frame timestamps are ≥1 s apart,
        // so no sequence counter is needed here; the index body keeps the shared
        // clock's `timestampSeconds`.
        let tsKey = String(format: "%013.3f", snap.frameTimestamp).replacingOccurrences(of: ".", with: "_")
        let filename = "depth_\(tsKey).bin"
        do {
            try encoded.data.write(to: depthDir.appendingPathComponent(filename), options: .atomic)
        } catch {
            logger.error("Depth frame write failed: \(error.localizedDescription)")
            return
        }

        let entry = DepthIndexEntry(
            depthPath: "depth/\(filename)",
            timestampSeconds: snap.timestampSeconds,
            frameTimestamp: snap.frameTimestamp,
            cameraTransform: Self.rowMajor(snap.cameraTransform),
            intrinsics: .init(
                fx: Double(snap.intrinsics.columns.0.x),
                fy: Double(snap.intrinsics.columns.1.y),
                cx: Double(snap.intrinsics.columns.2.x),
                cy: Double(snap.intrinsics.columns.2.y),
                imageWidth: Int(snap.imageResolution.width),
                imageHeight: Int(snap.imageResolution.height)
            ),
            width: encoded.width, height: encoded.height,
            smoothed: snap.smoothed,
            hasConfidence: encoded.hasConfidence,
            depthFormat: "u16mm+u8conf"
        )
        appendIndex(entry)
    }

    private func appendIndex(_ entry: DepthIndexEntry) {
        guard let line = try? JSONEncoder().encode(entry) else { return }
        if indexHandle == nil {
            indexHandle = try? FileHandle(forWritingTo: indexURL)
            _ = try? indexHandle?.seekToEnd()
        }
        guard let indexHandle else { return }
        indexHandle.write(line)
        indexHandle.write(Data([0x0A]))
    }

    /// Row-major flatten (translation at 3, 7, 11) — matches the posed-photo lane
    /// and the client `DepthFrameRecorder`, so all pose arrays share one layout.
    private static func rowMajor(_ m: simd_float4x4) -> [Double] {
        [
            Double(m.columns.0.x), Double(m.columns.1.x), Double(m.columns.2.x), Double(m.columns.3.x),
            Double(m.columns.0.y), Double(m.columns.1.y), Double(m.columns.2.y), Double(m.columns.3.y),
            Double(m.columns.0.z), Double(m.columns.1.z), Double(m.columns.2.z), Double(m.columns.3.z),
            Double(m.columns.0.w), Double(m.columns.1.w), Double(m.columns.2.w), Double(m.columns.3.w)
        ]
    }
}
#endif

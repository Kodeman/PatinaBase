//  FieldKeyframeRecorder.swift
//  Capture · Wave F (Pro site-scan) · Field Capture P1 · item 4 — keyframe recorder
//
//  The accuracy-pipeline keyframe lane: auto-fires a full-res HEIC + per-keyframe
//  depth + intrinsics + pose when the camera has moved ≥ ~0.5 m OR rotated ≥ 15°
//  since the last keyframe (SC-07), sharpness-gated. A `CaptureFrameSink` fed by
//  `SharedARCaptureRig`. Target 200–400 keyframes on a typical room; the
//  blur-rejection ratio is recorded for the manifest.
//
//  DISTINCT from `FieldPosedPhotoService` (guidance #6): that lane is the CONTEXT
//  photo lane — JPEG, 60-cap, 2 s interval, → `room_scan_images`. This is the
//  accuracy lane — HEIC + depth, motion-triggered, sharpness-gated, → SfM/pose
//  refinement. They share nothing and never merge.
//
//  Directory (BLESSABLE CALL — logged): keyframes land in their own `keyframes/`
//  directory, reviving the deck's original name. The bundle spec (B-3) maps the
//  deck's `keyframes/` → `photos/`, but that mapping reflects the CLIENT v3 world
//  where posed photos ARE the full-res keyframes; in Field the posed lane was
//  trimmed to a JPEG context lane, so the item-4 accuracy keyframes need a distinct
//  home. Naming inside the bundle is a code-only call per the package authority
//  note. Item 8 folds `keyframes/` counts into `poseGraphSummary` (keyframeCount /
//  blurRejectedCount) and `scorecard.sharpFrameRatio`, and adds a keyframe artifact
//  kind.
//
//  Frame-pump discipline (item 3 C1 lesson + guidance #3): the sink callback does
//  cheap work on the MainActor — pose delta, debounce, and a variance-of-Laplacian
//  sharpness score on a DECIMATED luma grid (only on motion-triggered frames, so
//  sparse) — then snapshots the ARFrame's (ref-counted) pixel/depth buffers + pose
//  and hands the HEIC + depth encode to a background queue. This is the proven
//  posed-photo retention pattern (ARFrame CVPixelBuffers are ref-counted, unlike the
//  recycled mesh-anchor GPU buffers that forced item-3's mesh to serialize at end).
//  A max-in-flight guard drops + counts a keyframe if the encoder falls behind — a
//  dropped keyframe beats a starved frame pool.

import Foundation
import CaptureKit
import os.log

#if canImport(ARKit)
import ARKit
import CoreImage
import CoreVideo
import ImageIO
import UniformTypeIdentifiers
import simd

@MainActor
final class FieldKeyframeRecorder: CaptureFrameSink {

    private let gate: KeyframeGate
    private let timebase: CaptureTimebase
    private let summaryURL: URL
    private let writer: KeyframeBundleWriter?

    // MainActor-only decision + telemetry state.
    private var lastFiredPose: [Float]?
    private var lastEvaluation: TimeInterval?
    private var inFlight = 0
    private(set) var fired = 0
    private(set) var blurRejected = 0
    private(set) var encodeDropped = 0

    /// Drop + count once this many keyframe encodes are queued but not yet written.
    private let maxInFlight = 4
    /// Budget safety valve (silent stop, like the posed 60-cap). Target is 200–400;
    /// this bounds worst-case bundle size on an unusually long/slow scan.
    private let maxKeyframes = 500

    private let logger = Logger(subsystem: "cloud.patina.field", category: "KeyframeRecorder")

    init(bundleDir: URL, timebase: CaptureTimebase, gate: KeyframeGate = .standard) {
        self.gate = gate
        self.timebase = timebase
        self.summaryURL = bundleDir.appendingPathComponent("keyframes/keyframe_summary.json", isDirectory: false)
        self.writer = KeyframeBundleWriter(bundleDir: bundleDir)
        if writer == nil { logger.error("Keyframe recording disabled: could not create keyframes/ dir.") }
    }

    /// Blur-rejection ratio over evaluated frames (rejected / (fired + rejected)).
    var blurRejectionRatio: Double {
        let evaluated = fired + blurRejected
        return evaluated > 0 ? Double(blurRejected) / Double(evaluated) : 0
    }

    // MARK: - CaptureFrameSink

    func capture(frame: ARFrame, timestampSeconds: TimeInterval) {
        guard let writer, fired < maxKeyframes else { return }

        // 1. Motion trigger vs the last FIRED pose (cheap; first keyframe always).
        let pose = Self.rowMajorFloat(frame.camera.transform)
        guard gate.motionTriggered(from: lastFiredPose, to: pose) else { return }

        // 2. Debounce the (pricier) sharpness evaluation on the monotonic clock.
        let frameTimestamp = frame.timestamp
        guard gate.shouldEvaluate(now: frameTimestamp, lastEvaluation: lastEvaluation) else { return }
        lastEvaluation = frameTimestamp

        // 3. Sharpness on a decimated luma grid (cheap, sparse).
        guard let grid = Self.decimatedLuma(frame.capturedImage) else { return }
        let score = Sharpness.varianceOfLaplacian(luma: grid.samples, width: grid.width, height: grid.height)
        guard gate.isSharp(score) else {
            // Motion-triggered but blurred — reject, DON'T advance lastFiredPose, so
            // the next frame at ~this pose is re-evaluated for a sharp capture.
            blurRejected += 1
            return
        }

        // 4. Max-in-flight guard — drop if the encoder is behind (starved pool > lost frame).
        guard inFlight < maxInFlight else {
            encodeDropped += 1
            return
        }

        // 5. Fire: advance pose, snapshot the (ref-counted) buffers + pose, encode on bg.
        fired += 1
        lastFiredPose = pose
        inFlight += 1
        let depth = frame.smoothedSceneDepth ?? frame.sceneDepth
        let snapshot = KeyframeSnapshot(
            pixelBuffer: frame.capturedImage,
            depthMap: depth?.depthMap,
            confidenceMap: depth?.confidenceMap,
            smoothedDepth: frame.smoothedSceneDepth != nil,
            cameraTransform: frame.camera.transform,
            intrinsics: frame.camera.intrinsics,
            imageResolution: frame.camera.imageResolution,
            timestampSeconds: timestampSeconds,
            frameTimestamp: frameTimestamp,
            sharpness: score
        )
        writer.enqueue(snapshot) { [weak self] in
            Task { @MainActor in self?.decrementInFlight() }
        }
    }

    private func decrementInFlight() {
        if inFlight > 0 { inFlight -= 1 }
    }

    /// Drain pending encodes, close the index, and write the count summary. Called
    /// by `SharedARCaptureRig.stopRecording()` after the ARSession is paused.
    func finish() {
        guard let writer else { return }
        writer.finish()
        writeSummary()
    }

    private func writeSummary() {
        let summary = KeyframeSummary(
            fired: fired,
            blurRejected: blurRejected,
            encodeDropped: encodeDropped,
            blurRejectionRatio: blurRejectionRatio
        )
        guard let data = try? JSONEncoder().encode(summary) else { return }
        try? data.write(to: summaryURL, options: .atomic)
    }

    private struct KeyframeSummary: Codable {
        let fired: Int
        let blurRejected: Int
        let encodeDropped: Int
        let blurRejectionRatio: Double
    }

    // MARK: - Pose + luma helpers (MainActor, cheap)

    /// Row-major flatten (translation at 3, 7, 11) — matches the other index lanes.
    private static func rowMajorFloat(_ m: simd_float4x4) -> [Float] {
        [
            m.columns.0.x, m.columns.1.x, m.columns.2.x, m.columns.3.x,
            m.columns.0.y, m.columns.1.y, m.columns.2.y, m.columns.3.y,
            m.columns.0.z, m.columns.1.z, m.columns.2.z, m.columns.3.z,
            m.columns.0.w, m.columns.1.w, m.columns.2.w, m.columns.3.w
        ]
    }

    /// A decimated single-channel luma grid.
    private struct LumaGrid {
        let samples: [UInt8]
        let width: Int
        let height: Int
    }

    /// Decimate the ARFrame's Y (luma) plane to ~`targetWidth` wide for a cheap
    /// sharpness estimate. Nearest-sample decimation — a coarse proxy (documented),
    /// enough to separate sharp from blurred without touching the full-res image.
    private static func decimatedLuma(_ pixelBuffer: CVPixelBuffer, targetWidth: Int = 160) -> LumaGrid? {
        guard CVPixelBufferGetPlaneCount(pixelBuffer) >= 1 else { return nil }
        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0) else { return nil }
        let w = CVPixelBufferGetWidthOfPlane(pixelBuffer, 0)
        let h = CVPixelBufferGetHeightOfPlane(pixelBuffer, 0)
        let stride = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
        let step = max(1, w / targetWidth)
        let outW = w / step
        let outH = h / step
        guard outW >= 3, outH >= 3 else { return nil }
        let ptr = base.assumingMemoryBound(to: UInt8.self)
        var samples = [UInt8](repeating: 0, count: outW * outH)
        for oy in 0..<outH {
            let srcRow = (oy * step) * stride
            for ox in 0..<outW {
                samples[oy * outW + ox] = ptr[srcRow + ox * step]
            }
        }
        return LumaGrid(samples: samples, width: outW, height: outH)
    }
}

// MARK: - Snapshot handed to the background writer

/// The ref-counted buffers + metadata for one keyframe. `@unchecked Sendable`: the
/// CVPixelBuffers are ref-counted and retained by this value past the ARKit frame's
/// recycle (the proven posed-photo pattern; ARFrame image/depth buffers are NOT the
/// recycled mesh-anchor GPU buffers item-3 had to serialize at end).
private struct KeyframeSnapshot: @unchecked Sendable {
    let pixelBuffer: CVPixelBuffer
    let depthMap: CVPixelBuffer?
    let confidenceMap: CVPixelBuffer?
    let smoothedDepth: Bool
    let cameraTransform: simd_float4x4
    let intrinsics: simd_float3x3
    let imageResolution: CGSize
    let timestampSeconds: TimeInterval
    let frameTimestamp: TimeInterval
    let sharpness: Double
}

// MARK: - Background writer (queue-confined; not MainActor)

/// One line of `keyframes/keyframe_index.ndjson` (file scope to keep nesting
/// shallow). Bin/HEIC are written BEFORE the index line, so the index never
/// references a missing file.
private struct KeyframeIndexEntry: Codable {
    let heicPath: String
    let depthPath: String?
    let timestampSeconds: Double
    let frameTimestamp: Double
    let cameraTransform: [Double]  // row-major 4x4
    let intrinsics: Intrinsics
    let sharpness: Double
    let width: Int
    let height: Int
    let hasDepth: Bool
    let smoothedDepth: Bool

    struct Intrinsics: Codable {
        let fx: Double, fy: Double, cx: Double, cy: Double
        let imageWidth: Int, imageHeight: Int
    }
}

private final class KeyframeBundleWriter: @unchecked Sendable {

    private let keyframesDir: URL
    private let indexURL: URL
    private let ioQueue = DispatchQueue(label: "cloud.patina.field.keyframe.io", qos: .utility)
    private var indexHandle: FileHandle?
    private let ciContext = CIContext(options: [.useSoftwareRenderer: false])
    /// HEIC quality. 0.75 — HEIC at this quality is ~half a JPEG's bytes for the
    /// same look, keeping 200–400 full-res keyframes inside the 300–600 MB budget.
    private let heicQuality: CGFloat = 0.75
    private let logger = Logger(subsystem: "cloud.patina.field", category: "KeyframeRecorder")

    init?(bundleDir: URL) {
        let dir = bundleDir.appendingPathComponent("keyframes", isDirectory: true)
        let index = dir.appendingPathComponent("keyframe_index.ndjson", isDirectory: false)
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            if !FileManager.default.fileExists(atPath: index.path) {
                FileManager.default.createFile(atPath: index.path, contents: nil)
            }
        } catch {
            return nil
        }
        self.keyframesDir = dir
        self.indexURL = index
    }

    func enqueue(_ snap: KeyframeSnapshot, onComplete: @escaping @Sendable () -> Void) {
        ioQueue.async { [self] in
            write(snap)
            onComplete()
        }
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

    private func write(_ snap: KeyframeSnapshot) {
        let tsKey = String(format: "%09.3f", snap.timestampSeconds).replacingOccurrences(of: ".", with: "_")
        let heicName = "keyframe_\(tsKey).heic"

        // Full-res HEIC (bin/HEIC BEFORE the index line).
        let ciImage = CIImage(cvPixelBuffer: snap.pixelBuffer).oriented(.right)
        guard let cgImage = ciContext.createCGImage(ciImage, from: ciImage.extent),
              let heicData = encodeHEIC(cgImage) else {
            logger.error("Keyframe HEIC encode failed")
            return
        }
        do {
            try heicData.write(to: keyframesDir.appendingPathComponent(heicName), options: .atomic)
        } catch {
            logger.error("Keyframe HEIC write failed: \(error.localizedDescription)")
            return
        }

        // Per-keyframe depth sidecar (shared `.bin` wire contract). Best-effort.
        var depthPath: String?
        if let depthMap = snap.depthMap,
           let encoded = DepthBinEncoder.encode(depthMap: depthMap,
                                                 confidenceMap: snap.confidenceMap,
                                                 smoothed: snap.smoothedDepth) {
            let binName = "keyframe_\(tsKey).bin"
            if (try? encoded.data.write(to: keyframesDir.appendingPathComponent(binName), options: .atomic)) != nil {
                depthPath = "keyframes/\(binName)"
            }
        }

        let entry = KeyframeIndexEntry(
            heicPath: "keyframes/\(heicName)",
            depthPath: depthPath,
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
            sharpness: snap.sharpness,
            width: cgImage.width,
            height: cgImage.height,
            hasDepth: depthPath != nil,
            smoothedDepth: snap.smoothedDepth
        )
        appendIndex(entry)
    }

    private func encodeHEIC(_ cgImage: CGImage) -> Data? {
        let mutable = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(
            mutable, UTType.heic.identifier as CFString, 1, nil
        ) else { return nil }
        let options: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: heicQuality]
        CGImageDestinationAddImage(dest, cgImage, options as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { return nil }
        return mutable as Data
    }

    private func appendIndex(_ entry: KeyframeIndexEntry) {
        guard let line = try? JSONEncoder().encode(entry) else { return }
        if indexHandle == nil {
            indexHandle = try? FileHandle(forWritingTo: indexURL)
            _ = try? indexHandle?.seekToEnd()
        }
        guard let indexHandle else { return }
        indexHandle.write(line)
        indexHandle.write(Data([0x0A]))
    }

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

//
//  KeyframeBundleWriter.swift
//  Patina
//
//  The ENCODE + DISK half of the dense-frame keyframe lane (Rendered Room v2),
//  ported from Patina Field's `KeyframeBundleWriter`
//  (apps/mobile/Capture/Capture/Features/SiteScan/FieldKeyframeRecorder.swift).
//  `KeyframeTelemetryRecorder` runs the DECISION lane (motion trigger, debounce,
//  sharpness gate via `KeyframeSequencer`); this class is the encoder that lane
//  releases its in-flight slot for, exactly as the recorder's file header
//  predicted ("when the encode lane is wired, that counter starts moving and
//  nothing else about the sequence changes").
//
//  ── The wire contract this file exists to satisfy, FIELD-FOR-FIELD ───────────
//  Each `keyframe_index.ndjson` line is consumed by
//  `services/scan-modal/.../core/transforms.py::parse_keyframe_index`, which
//  reads exactly:
//      heicPath                       ← the bundle-relative RGB path
//      width, height                  ← the ENCODED (portrait) HEIC extent
//      cameraTransform                ← row-major flat-16, translation at 3/7/11
//      intrinsics.{fx,fy,cx,cy}       ← native sensor frame
//      intrinsics.imageWidth/Height   ← native LANDSCAPE resolution
//      timestampSeconds
//  The pixels are written `.oriented(.right)` (portrait) while the intrinsics are
//  recorded in the unrotated landscape frame — so the pixels are the 90°-CW
//  rotation of the intrinsics frame and the server's `needs_right_rotation`
//  correction fires (its check: `(width,height) == (intr.imageHeight,
//  intr.imageWidth)`). This mirrors `PosedPhotoService.encodeAndWrite` exactly,
//  which is why the keyframe HEIC reuses `PosedPhotoService.encodeHEIC`.
//
//  RGB-ONLY, by design for this lane. Field also writes a per-keyframe depth
//  `.bin` sidecar; the client already ships depth separately as `depth.zip`
//  (`DepthFrameRecorder`), and the splat contract above is RGB-only
//  (`parse_keyframe_index` never reads depth), so `depthPath`/`hasDepth` stay
//  nil/false here. The index-line SHAPE still matches Field's `KeyframeIndexEntry`
//  so a bundle from either app decodes the same way.
//

import Foundation
import CoreImage
import CoreVideo
import simd
import os.log

/// The ref-counted buffer + pose for one fired keyframe, handed to the writer.
/// `@unchecked Sendable`: the CVPixelBuffer is ref-counted and retained by this
/// value past the ARKit frame's recycle — the proven posed-photo pattern.
struct KeyframeSnapshot: @unchecked Sendable {
    let pixelBuffer: CVPixelBuffer
    let cameraTransform: simd_float4x4
    let intrinsics: simd_float3x3
    let imageResolution: CGSize   // native LANDSCAPE resolution
    let timestampSeconds: TimeInterval
    let frameTimestamp: TimeInterval
    let sharpness: Double
}

/// One line of `keyframes/keyframe_index.ndjson`. Field's `KeyframeIndexEntry`,
/// verbatim in field NAMES so both apps' indexes decode identically and
/// `parse_keyframe_index` reads the fields it needs.
private struct KeyframeIndexEntry: Codable {
    let heicPath: String
    let depthPath: String?        // nil here — RGB-only lane (see file header)
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

/// Queue-confined encoder + index writer. Not `@MainActor`: all file IO runs on
/// `ioQueue`, and the owning recorder hops results back to the main actor.
final class KeyframeBundleWriter: @unchecked Sendable {

    /// Absolute URL of the bundle's `keyframes/` directory.
    let keyframesDirectoryURL: URL
    /// Absolute URL of `keyframes/keyframe_index.ndjson`.
    let indexURL: URL
    /// Absolute URL of `keyframes/keyframe_summary.json`.
    let summaryURL: URL

    /// Manifest-relative dir + index paths (for artifact registration at freeze).
    static let directoryName = "keyframes"
    static let indexRelativePath = "keyframes/keyframe_index.ndjson"
    static let summaryRelativePath = "keyframes/keyframe_summary.json"
    static let archiveRelativePath = "keyframes.tar"

    /// HEIC compression quality (matches `PosedPhotoService.heicQuality`).
    private let heicQuality: CGFloat = 0.82

    /// Count of keyframe HEICs successfully written (queue-confined).
    private var _framesWritten = 0
    /// Thread-safe snapshot of the write count.
    var framesWritten: Int { ioQueue.sync { _framesWritten } }

    private let ioQueue = DispatchQueue(label: "com.patina.keyframe-writer.io", qos: .utility)
    private var indexHandle: FileHandle?
    /// Serial write counter (queue-confined) — the collision-proof half of the
    /// filename key, so two fires close in frame-time never overwrite one file.
    private var sequence = 0
    private let ciContext = CIContext(options: [.useSoftwareRenderer: false])
    private let logger = Logger(subsystem: "com.patina.app", category: "KeyframeWriter")

    /// Create the `keyframes/` directory + empty index. Returns nil if the
    /// directory cannot be created — the caller then runs the decision lane
    /// without an encoder, exactly as before this file existed.
    init?(bundleURL: URL) {
        let dir = bundleURL.appendingPathComponent(Self.directoryName, isDirectory: true)
        let index = dir.appendingPathComponent("keyframe_index.ndjson", isDirectory: false)
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            if !FileManager.default.fileExists(atPath: index.path) {
                FileManager.default.createFile(atPath: index.path, contents: nil)
            }
        } catch {
            return nil
        }
        self.keyframesDirectoryURL = dir
        self.indexURL = index
        self.summaryURL = dir.appendingPathComponent("keyframe_summary.json", isDirectory: false)
    }

    /// Encode + write one keyframe on the io queue, then call `onComplete` (which
    /// the recorder uses to release the sequencer's in-flight slot).
    func enqueue(_ snap: KeyframeSnapshot, onComplete: @escaping @Sendable () -> Void) {
        ioQueue.async { [self] in
            write(snap)
            onComplete()
        }
    }

    /// Drain pending encodes and close the index handle. Idempotent.
    func finish() {
        ioQueue.sync {
            if let indexHandle {
                try? indexHandle.close()
                self.indexHandle = nil
            }
        }
    }

    /// Write the count summary. Called by the recorder at finish with its
    /// telemetry. Best-effort — a missing summary is not fatal to ingest.
    func writeSummary(fired: Int, blurRejected: Int, rawBlurFailures: Int,
                      encodeDropped: Int, blurRejectionRatio: Double) {
        struct Summary: Codable {
            let fired: Int
            let blurRejected: Int
            let rawBlurFailures: Int
            let encodeDropped: Int
            let blurRejectionRatio: Double
        }
        let summary = Summary(fired: fired, blurRejected: blurRejected,
                              rawBlurFailures: rawBlurFailures,
                              encodeDropped: encodeDropped,
                              blurRejectionRatio: blurRejectionRatio)
        guard let data = try? JSONEncoder().encode(summary) else { return }
        try? data.write(to: summaryURL, options: .atomic)
    }

    /// The keyframe HEIC files on disk, in stable name order — the tar input.
    func heicFiles() -> [URL] {
        let contents = (try? FileManager.default.contentsOfDirectory(
            at: keyframesDirectoryURL,
            includingPropertiesForKeys: nil
        )) ?? []
        return contents
            .filter { $0.pathExtension.lowercased() == "heic" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
    }

    // MARK: - On the io queue

    private func write(_ snap: KeyframeSnapshot) {
        // Portrait orientation matches `PosedPhotoService.encodeAndWrite` so the
        // stored pixels are the 90°-CW rotation of the intrinsics frame and the
        // server's `needs_right_rotation` correction fires.
        let ciImage = CIImage(cvPixelBuffer: snap.pixelBuffer).oriented(.right)
        guard let cgImage = ciContext.createCGImage(ciImage, from: ciImage.extent) else {
            logger.error("Keyframe CGImage render failed")
            return
        }
        // HEIC, with the same JPEG fallback the posed-photo lane uses. The file
        // KEEPS its `.heic` name on the fallback (PosedPhotoService does the
        // same): the server transcodes through PIL, which reads the bytes by
        // content, not extension, so a JPEG-under-.heic still decodes.
        guard let heic = PosedPhotoService.encodeHEIC(cgImage: cgImage, quality: heicQuality)
            ?? PosedPhotoService.encodeJPEG(cgImage: cgImage, quality: heicQuality) else {
            logger.error("Keyframe HEIC/JPEG encode failed")
            return
        }

        // Filename key from the MONOTONIC frame timestamp + a serial sequence,
        // NOT wall-clock task time (K3): two fires close in frame-time could
        // round to the same key under a stall and overwrite one file.
        sequence += 1
        let frameKey = String(format: "%013.3f", snap.frameTimestamp).replacingOccurrences(of: ".", with: "_")
        let heicName = "keyframe_\(String(format: "%06d", sequence))_\(frameKey).heic"

        // HEIC BEFORE the index line, so the index never references a missing file.
        do {
            try heic.write(to: keyframesDirectoryURL.appendingPathComponent(heicName), options: .atomic)
        } catch {
            logger.error("Keyframe HEIC write failed: \(error.localizedDescription)")
            return
        }

        let entry = KeyframeIndexEntry(
            heicPath: "keyframes/\(heicName)",
            depthPath: nil,
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
            width: Int(ciImage.extent.width),
            height: Int(ciImage.extent.height),
            hasDepth: false,
            smoothedDepth: false
        )
        appendIndex(entry)
        _framesWritten += 1
    }

    private func appendIndex(_ entry: KeyframeIndexEntry) {
        // Synthesized encoder omits nil Optionals (depthPath) via encodeIfPresent.
        guard let line = try? JSONEncoder().encode(entry) else { return }
        if indexHandle == nil {
            indexHandle = try? FileHandle(forWritingTo: indexURL)
            _ = try? indexHandle?.seekToEnd()
        }
        guard let indexHandle else { return }
        indexHandle.write(line)
        indexHandle.write(Data([0x0A]))
    }

    /// Row-major flatten (translation at 3/7/11) — matches every other index
    /// lane (`DepthFrameRecorder`, `PosedPhotoService`) and Field's recorder.
    static func rowMajor(_ m: simd_float4x4) -> [Double] {
        [
            Double(m.columns.0.x), Double(m.columns.1.x), Double(m.columns.2.x), Double(m.columns.3.x),
            Double(m.columns.0.y), Double(m.columns.1.y), Double(m.columns.2.y), Double(m.columns.3.y),
            Double(m.columns.0.z), Double(m.columns.1.z), Double(m.columns.2.z), Double(m.columns.3.z),
            Double(m.columns.0.w), Double(m.columns.1.w), Double(m.columns.2.w), Double(m.columns.3.w)
        ]
    }
}

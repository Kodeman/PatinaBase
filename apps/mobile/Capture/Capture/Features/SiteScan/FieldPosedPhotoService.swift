//  FieldPosedPhotoService.swift
//  Capture · Wave F (Pro site-scan) · Room View PHOTOS (I76)
//
//  Samples the live RoomPlan `ARSession` into posed JPEG photos while a Field
//  site-scan runs. This is the Field port of the client app's
//  `Features/Walk/Services/PosedPhotoService.swift`, TRIMMED to the v1 lane
//  locked in I76/I82:
//
//    • AUTO-interval capture ONLY (every `FieldPhotoGate.autoInterval` s). No
//      shutter path, no hero/feature kinds, no quality scoring — not ported.
//    • JPEG (browser-native), ~0.8 quality — NOT HEIC (Field photos are exempt
//      from the server HEIC sweep by mime predicate).
//    • HARD cap at `FieldPhotoGate.maxPhotos`, SILENT stop.
//    • a 256px JPEG thumbnail per photo (thumbnail failure NEVER drops the photo).
//
//  Encoding + file writes run on a background queue so the ARKit frame pump (and
//  the live RoomPlan preview) is never stalled by a capture. Only cheap
//  bookkeeping (last-capture time, count, entry accumulation) runs on the main
//  actor. Each captured photo appends a `FieldPhotoEntry` (CaptureKit) — the
//  session drains these into the `photos_metadata.json` sidecar at export, and
//  the uploader turns them into `room_scan_images` rows AFTER the scan is ready.
//
//  The per-frame decision is delegated to `FieldPhotoGate.shouldCapture(...)`
//  (CaptureKit, pure + unit-tested) so the live sampler can't drift from the
//  tested matrix.

import Foundation
import CaptureKit

#if canImport(ARKit)
import ARKit
import CoreImage
import ImageIO
import UIKit
import UniformTypeIdentifiers
import simd
import os.log

@MainActor
final class FieldPosedPhotoService {

    // MARK: - Main-actor bookkeeping

    private(set) var count = 0
    private var isActive = false
    private var startTime = Date()
    private var lastCapture: Date?
    private var photosDir: URL?
    private var entries: [FieldPhotoEntry] = []

    /// The posed-photo records captured so far — drained into the sidecar at
    /// export time. Best-effort: an encode still in flight when this is read is
    /// simply absent (single-attempt v1).
    var capturedEntries: [FieldPhotoEntry] { entries }

    // MARK: - Encoding

    /// JPEG quality (0…1). ~0.8 per I76.
    private let jpegQuality: CGFloat = 0.8
    /// GPU-backed CIContext — safe to share across threads.
    private let ciContext = CIContext(options: [.useSoftwareRenderer: false])
    private let encodeQueue = DispatchQueue(
        label: "cloud.patina.field.posed-photo.encode",
        qos: .utility
    )
    private let logger = Logger(subsystem: "cloud.patina.field", category: "PosedPhoto")

    // MARK: - Lifecycle

    /// Begin sampling into `photosDir` (which must already exist). Resets all
    /// counters — one call per scan.
    func start(photosDir: URL, at date: Date = Date()) {
        self.photosDir = photosDir
        isActive = true
        startTime = date
        lastCapture = nil
        count = 0
        entries.removeAll()
    }

    /// Stop sampling. In-flight encodes may still append their entry shortly
    /// after; no new frame is captured once this returns.
    func stop() {
        isActive = false
    }

    /// Called from `RoomPlanScanSession`'s `ARSessionDelegate` (already hopped to
    /// the main actor). Cheap on-actor work only: decide via `FieldPhotoGate`,
    /// snapshot the pose + pixel buffer, then hand encoding to the background
    /// queue (ARKit may recycle the frame after this scope).
    func consume(frame: ARFrame) {
        let now = Date()
        guard FieldPhotoGate.shouldCapture(now: now, lastCapture: lastCapture,
                                           count: count, isActive: isActive),
              let photosDir else { return }
        lastCapture = now
        count += 1

        let snapshot = FrameSnapshot(
            pixelBuffer: frame.capturedImage,
            cameraTransform: frame.camera.transform,
            intrinsics: frame.camera.intrinsics,
            imageResolution: frame.camera.imageResolution,
            eulerAngles: frame.camera.eulerAngles,
            lightEstimate: frame.lightEstimate.map { Double($0.ambientIntensity) },
            timestampSeconds: now.timeIntervalSince(startTime),
            capturedAt: now,
            jpegQuality: jpegQuality,
            photosDir: photosDir
        )

        // The CVPixelBuffer is ref-counted; moving the snapshot into a @Sendable
        // closure keeps it alive past the ARKit scope.
        encodeQueue.async { [weak self] in
            self?.encodeAndWrite(snapshot: snapshot)
        }
    }

    // MARK: - Background encode

    private nonisolated struct FrameSnapshot: @unchecked Sendable {
        let pixelBuffer: CVPixelBuffer
        let cameraTransform: simd_float4x4
        let intrinsics: simd_float3x3
        let imageResolution: CGSize
        let eulerAngles: SIMD3<Float>
        let lightEstimate: Double?
        let timestampSeconds: TimeInterval
        let capturedAt: Date
        let jpegQuality: CGFloat
        let photosDir: URL
    }

    private nonisolated func encodeAndWrite(snapshot: FrameSnapshot) {
        let ciImage = CIImage(cvPixelBuffer: snapshot.pixelBuffer)
            .oriented(.right) // portrait
        guard let cgImage = ciContext.createCGImage(ciImage, from: ciImage.extent) else {
            logger.error("Failed to create CGImage from ARFrame")
            return
        }
        guard let imageData = Self.encodeJPEG(cgImage: cgImage, quality: snapshot.jpegQuality) else {
            logger.error("Failed to encode posed photo JPEG")
            return
        }

        let filename = String(format: "auto_%06.2f.jpg", snapshot.timestampSeconds)
            .replacingOccurrences(of: " ", with: "0")
        let fileURL = snapshot.photosDir.appendingPathComponent(filename)
        do {
            try imageData.write(to: fileURL, options: .atomic)
        } catch {
            logger.error("Failed to write posed photo: \(error.localizedDescription)")
            return
        }

        // Best-effort 256px JPEG thumbnail — a failure here does NOT drop the
        // main photo (thumbnailFilename just stays nil).
        let thumbFilename = Self.writeThumbnail(
            ciImage: ciImage,
            mainFilename: filename,
            photosDir: snapshot.photosDir,
            ciContext: ciContext,
            logger: logger
        )

        let iso = ISO8601DateFormatter()
        let entry = FieldPhotoEntry(
            filename: filename,
            thumbnailFilename: thumbFilename,
            cameraTransform: Self.rowMajor(snapshot.cameraTransform),
            cameraIntrinsics: FieldPhotoEntry.Intrinsics(
                fx: Double(snapshot.intrinsics.columns.0.x),
                fy: Double(snapshot.intrinsics.columns.1.y),
                cx: Double(snapshot.intrinsics.columns.2.x),
                cy: Double(snapshot.intrinsics.columns.2.y),
                width: Int(snapshot.imageResolution.width),
                height: Int(snapshot.imageResolution.height)
            ),
            eulerAngles: [Double(snapshot.eulerAngles.x),
                          Double(snapshot.eulerAngles.y),
                          Double(snapshot.eulerAngles.z)],
            lightEstimateLumens: snapshot.lightEstimate,
            timestampSeconds: snapshot.timestampSeconds,
            capturedAt: iso.string(from: snapshot.capturedAt),
            width: Int(ciImage.extent.width),
            height: Int(ciImage.extent.height),
            fileSizeBytes: imageData.count
        )

        Task { @MainActor [weak self] in
            self?.entries.append(entry)
        }
    }

    /// Produce + write a 256px JPEG thumbnail next to the main JPEG. Returns the
    /// thumbnail filename on success; nil on any failure (the caller still
    /// records the main photo). Filename is `thumb_<mainStem>.jpg`.
    private nonisolated static func writeThumbnail(
        ciImage: CIImage,
        mainFilename: String,
        photosDir: URL,
        ciContext: CIContext,
        logger: Logger
    ) -> String? {
        let extent = ciImage.extent
        let maxSide = max(extent.width, extent.height)
        guard maxSide > 0 else {
            logger.debug("Thumbnail skipped: empty CIImage extent")
            return nil
        }
        let scale = min(1.0, 256.0 / maxSide)
        let scaled = scale < 1.0
            ? ciImage.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
            : ciImage

        guard let thumbCG = ciContext.createCGImage(scaled, from: scaled.extent) else {
            logger.debug("Thumbnail skipped: CIContext render failed")
            return nil
        }

        let mutable = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(
            mutable, UTType.jpeg.identifier as CFString, 1, nil
        ) else {
            logger.debug("Thumbnail skipped: CGImageDestination create failed")
            return nil
        }
        let options: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: 0.7]
        CGImageDestinationAddImage(dest, thumbCG, options as CFDictionary)
        guard CGImageDestinationFinalize(dest) else {
            logger.debug("Thumbnail skipped: JPEG finalize failed")
            return nil
        }

        let stem = (mainFilename as NSString).deletingPathExtension
        let thumbFilename = "thumb_\(stem).jpg"
        do {
            try (mutable as Data).write(to: photosDir.appendingPathComponent(thumbFilename), options: .atomic)
        } catch {
            logger.debug("Thumbnail skipped: write failed — \(error.localizedDescription)")
            return nil
        }
        return thumbFilename
    }

    private nonisolated static func encodeJPEG(cgImage: CGImage, quality: CGFloat) -> Data? {
        let mutable = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(
            mutable, UTType.jpeg.identifier as CFString, 1, nil
        ) else { return nil }
        let options: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: quality]
        CGImageDestinationAddImage(dest, cgImage, options as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { return nil }
        return mutable as Data
    }

    /// simd stores column-major; flatten row-major for a stable on-disk layout
    /// (translation lands at indices 3, 7, 11).
    private nonisolated static func rowMajor(_ m: simd_float4x4) -> [Double] {
        [
            Double(m.columns.0.x), Double(m.columns.1.x), Double(m.columns.2.x), Double(m.columns.3.x),
            Double(m.columns.0.y), Double(m.columns.1.y), Double(m.columns.2.y), Double(m.columns.3.y),
            Double(m.columns.0.z), Double(m.columns.1.z), Double(m.columns.2.z), Double(m.columns.3.z),
            Double(m.columns.0.w), Double(m.columns.1.w), Double(m.columns.2.w), Double(m.columns.3.w)
        ]
    }
}
#endif

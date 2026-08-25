//
//  PosedPhotoService.swift
//  Patina
//
//  Samples ARFrames into HEIC photos tagged with the full camera pose
//  (transform + intrinsics + euler angles + light estimate). Runs two
//  paths against the same ARSession:
//
//    * an auto sampler fires every `autoPhotoInterval` seconds while the
//      scan is live;
//    * a manual shutter path writes the next available ARFrame at the
//      user's tap.
//
//  HEIC encoding + file writes happen on a background queue so the
//  ARKit frame pump (and therefore the live camera preview) is never
//  stalled by a capture. Only light bookkeeping (last-capture timestamp,
//  @Published counters) runs on the main actor.
//

import Foundation
import ARKit
import Observation
import UIKit
import CoreImage
import ImageIO
import UniformTypeIdentifiers
import AVFoundation
import MobileCoreServices
import simd
import os.log

@MainActor
@Observable
public final class PosedPhotoService: NSObject {

    // MARK: - Published state

    public private(set) var isActive = false
    public private(set) var autoCount: Int = 0
    public private(set) var userShutterCount: Int = 0

    // MARK: - Config

    /// Minimum spacing between auto samples.
    public var autoInterval: TimeInterval = 2.0

    /// HEIC compression quality (0-1).
    public var heicQuality: CGFloat = 0.82

    // MARK: - Private

    private let bundle: ScanBundleWriter
    private let ciContext: CIContext
    private let logger = Logger(subsystem: "com.patina.app", category: "PosedPhoto")
    private let encodeQueue = DispatchQueue(
        label: "com.patina.posed-photo.encode",
        qos: .utility
    )

    private var startTime: Date = Date()
    private var lastAutoCaptureTime: Date?
    private var pendingUserShutter: Bool = false

    /// Buffered photo metadata entries emitted this session — exposed so
    /// RoomCaptureService can feed them into scoring at scan end.
    public private(set) var emittedPhotos: [ScanManifest.PhotoEntry] = []

    // MARK: - Init

    public init(bundle: ScanBundleWriter) {
        self.bundle = bundle
        // GPU-backed CIContext — safe to share across threads.
        self.ciContext = CIContext(options: [.useSoftwareRenderer: false])
        super.init()
    }

    // MARK: - Lifecycle

    public func start(at date: Date = Date()) {
        isActive = true
        startTime = date
        lastAutoCaptureTime = nil
        autoCount = 0
        userShutterCount = 0
        emittedPhotos.removeAll()
    }

    public func stop() {
        isActive = false
        pendingUserShutter = false
    }

    /// Called from the ARSessionDelegate inside RoomCaptureService.
    ///
    /// Runs on the main actor (delegate callbacks already hop here) but
    /// only does cheap work: decide whether to capture, snapshot the
    /// pose + pixel buffer, and hand the rest off to a background queue.
    public func consume(frame: ARFrame) {
        guard isActive else { return }

        let now = Date()
        let dueForAuto: Bool = {
            guard let last = lastAutoCaptureTime else { return true }
            return now.timeIntervalSince(last) >= autoInterval
        }()

        let kind: ScanManifest.PhotoKind
        let isFullResolution: Bool

        if pendingUserShutter {
            pendingUserShutter = false
            kind = .user
            isFullResolution = true
            userShutterCount += 1
        } else if dueForAuto {
            lastAutoCaptureTime = now
            kind = .auto
            isFullResolution = false
            autoCount += 1
        } else {
            return
        }

        // Snapshot everything we need on-actor so the background task
        // doesn't touch the frame (ARKit may recycle it after this scope).
        let snapshot = FrameSnapshot(
            pixelBuffer: frame.capturedImage,
            cameraTransform: frame.camera.transform,
            intrinsics: frame.camera.intrinsics,
            imageResolution: frame.camera.imageResolution,
            eulerAngles: frame.camera.eulerAngles,
            lightEstimate: frame.lightEstimate.map { Double($0.ambientIntensity) },
            capturedAt: now,
            timestampSeconds: now.timeIntervalSince(startTime),
            kind: kind,
            isFullResolution: isFullResolution,
            heicQuality: heicQuality
        )

        // Retain the pixel buffer — CVPixelBufferRef is ref-counted; moving
        // it into a @Sendable closure keeps it alive past the ARKit scope.
        encodeQueue.async { [weak self] in
            self?.encodeAndWrite(snapshot: snapshot)
        }
    }

    /// Request that the next consumed frame be written as a user shutter
    /// capture. Idempotent — the flag clears on the next frame regardless.
    public func requestUserShutter() {
        pendingUserShutter = true
    }

    // MARK: - Background encode

    private nonisolated struct FrameSnapshot: @unchecked Sendable {
        let pixelBuffer: CVPixelBuffer
        let cameraTransform: simd_float4x4
        let intrinsics: simd_float3x3
        let imageResolution: CGSize
        let eulerAngles: SIMD3<Float>
        let lightEstimate: Double?
        let capturedAt: Date
        let timestampSeconds: TimeInterval
        let kind: ScanManifest.PhotoKind
        let isFullResolution: Bool
        let heicQuality: CGFloat
    }

    private nonisolated func encodeAndWrite(snapshot: FrameSnapshot) {
        let ciImage = CIImage(cvPixelBuffer: snapshot.pixelBuffer)
            .oriented(.right) // portrait
        guard let cgImage = ciContext.createCGImage(ciImage, from: ciImage.extent) else {
            logger.error("Failed to create CGImage from ARFrame")
            return
        }

        let imageData = Self.encodeHEIC(cgImage: cgImage, quality: snapshot.heicQuality)
            ?? Self.encodeJPEG(cgImage: cgImage, quality: snapshot.heicQuality)
        guard let imageData else {
            logger.error("Failed to encode posed photo")
            return
        }

        let filename: String
        switch snapshot.kind {
        case .user:
            filename = String(format: "user_%06.2f.heic", snapshot.timestampSeconds)
                .replacingOccurrences(of: " ", with: "0")
        case .auto:
            filename = String(format: "auto_%06.2f.heic", snapshot.timestampSeconds)
                .replacingOccurrences(of: " ", with: "0")
        case .hero:
            filename = "hero.heic"
        case .feature:
            filename = String(format: "feature_%06.2f.heic", snapshot.timestampSeconds)
                .replacingOccurrences(of: " ", with: "0")
        }

        // Best-effort 256px JPEG thumbnail. Captured on the same encode
        // queue so we never block the ARKit pump. Failures here do NOT
        // abort the main photo — the HEIC must still be recorded.
        let thumbResult = Self.encodeThumbnail(
            ciImage: ciImage,
            mainFilename: filename,
            photosURL: bundle.photosURL,
            ciContext: ciContext,
            logger: logger
        )

        let entry = ScanManifest.PhotoEntry(
            relativePath: "photos/\(filename)",
            kind: snapshot.kind,
            capturedAt: snapshot.capturedAt,
            timestampSeconds: snapshot.timestampSeconds,
            mimeType: "image/heic",
            sizeBytes: imageData.count,
            width: Int(ciImage.extent.width),
            height: Int(ciImage.extent.height),
            isFullResolution: snapshot.isFullResolution,
            cameraTransform: Self.rowMajor(snapshot.cameraTransform),
            cameraIntrinsics: ScanManifest.Intrinsics(
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
            thumbnailRelativePath: thumbResult?.relativePath,
            thumbnailSizeBytes: thumbResult?.sizeBytes
        )

        // Hop back to the main actor (which owns the bundle writer) to
        // persist the entry + manifest update.
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try self.bundle.appendPhoto(entry, imageData: imageData)
                self.emittedPhotos.append(entry)
            } catch {
                self.logger.error("Failed to append photo: \(error.localizedDescription)")
            }
        }
    }

    /// Produce + write a small JPEG thumbnail next to the main HEIC.
    /// Returns the manifest-relative path and on-disk size on success; nil
    /// on any failure (the caller must still record the main photo).
    private nonisolated static func encodeThumbnail(
        ciImage: CIImage,
        mainFilename: String,
        photosURL: URL,
        ciContext: CIContext,
        logger: Logger
    ) -> (relativePath: String, sizeBytes: Int)? {
        let extent = ciImage.extent
        let maxSide = max(extent.width, extent.height)
        guard maxSide > 0 else {
            logger.debug("Thumbnail skipped: empty CIImage extent")
            return nil
        }
        let scale = min(1.0, 256.0 / maxSide)
        let scaled: CIImage
        if scale < 1.0 {
            scaled = ciImage.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        } else {
            scaled = ciImage
        }

        guard let thumbCG = ciContext.createCGImage(scaled, from: scaled.extent) else {
            logger.debug("Thumbnail skipped: CIContext render failed")
            return nil
        }

        let mutable = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(
            mutable,
            UTType.jpeg.identifier as CFString,
            1,
            nil
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
        let jpegData = mutable as Data

        // Derive thumb filename: strip any extension, prepend thumb_, add .jpg.
        let stem = (mainFilename as NSString).deletingPathExtension
        let thumbFilename = "thumb_\(stem).jpg"
        let thumbURL = photosURL.appendingPathComponent(thumbFilename)

        do {
            try jpegData.write(to: thumbURL, options: .atomic)
        } catch {
            logger.debug("Thumbnail skipped: write failed — \(error.localizedDescription)")
            return nil
        }

        return ("photos/\(thumbFilename)", jpegData.count)
    }

    // MARK: - Encoding

    /// HEIC-encode a CGImage. Internal (not private) so the keyframe lane
    /// (`KeyframeBundleWriter`) reuses the exact same encoder the posed-photo
    /// lane uses, rather than a second copy that could drift.
    nonisolated static func encodeHEIC(cgImage: CGImage, quality: CGFloat) -> Data? {
        let mutable = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(
            mutable,
            AVFileType.heic as CFString,
            1,
            nil
        ) else { return nil }
        let options: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: quality]
        CGImageDestinationAddImage(dest, cgImage, options as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { return nil }
        return mutable as Data
    }

    /// Internal (see `encodeHEIC`) — the keyframe lane reuses the same JPEG
    /// fallback so a HEIC-encode failure degrades identically in both lanes.
    nonisolated static func encodeJPEG(cgImage: CGImage, quality: CGFloat) -> Data? {
        let mutable = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(
            mutable,
            kUTTypeJPEG,
            1,
            nil
        ) else { return nil }
        let options: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: quality]
        CGImageDestinationAddImage(dest, cgImage, options as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { return nil }
        return mutable as Data
    }

    // MARK: - Helpers

    private nonisolated static func rowMajor(_ m: simd_float4x4) -> [Double] {
        // simd stores column-major; flatten row-major for a stable on-disk layout.
        return [
            Double(m.columns.0.x), Double(m.columns.1.x), Double(m.columns.2.x), Double(m.columns.3.x),
            Double(m.columns.0.y), Double(m.columns.1.y), Double(m.columns.2.y), Double(m.columns.3.y),
            Double(m.columns.0.z), Double(m.columns.1.z), Double(m.columns.2.z), Double(m.columns.3.z),
            Double(m.columns.0.w), Double(m.columns.1.w), Double(m.columns.2.w), Double(m.columns.3.w)
        ]
    }
}

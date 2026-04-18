import ARKit
import CoreImage
import CoreVideo
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Records sampled ARKit sceneDepth frames into the scan bundle at ~1 Hz.
///
/// Writes pairs `depth_<ts>.png` (16-bit grayscale; depthMap meters × 1000,
/// clamped to UInt16.max) and `conf_<ts>.png` (8-bit raw `ARConfidenceLevel`)
/// into `<bundleURL>/depth/`, and tail-appends one NDJSON line per frame to
/// `<bundleURL>/depth/depth_index.ndjson` describing the pose, intrinsics,
/// timestamp, and the associated PhotoEntry id (if provided by the caller).
///
/// Does NOT zip the directory — RoomCaptureService handles that at finalize.
public final class DepthFrameRecorder {

    public struct FrameEntry: Codable, Equatable, Sendable {
        public let depthPath: String        // "depth/depth_<ts>.png"
        public let confPath: String         // "depth/conf_<ts>.png"
        public let timestampSeconds: Double // seconds since scan start
        public let associatedPhotoId: UUID? // nearest posed photo (within ±0.15s)
        public let cameraTransform: [Double] // row-major 4x4, length 16
        public let intrinsics: Intrinsics
        public let width: Int
        public let height: Int

        public struct Intrinsics: Codable, Equatable, Sendable {
            public let fx: Double
            public let fy: Double
            public let cx: Double
            public let cy: Double
            public let imageWidth: Int
            public let imageHeight: Int
        }
    }

    /// Absolute URL of the bundle's `depth/` directory. Created if missing.
    public let depthDirectoryURL: URL
    /// Absolute URL of `depth/depth_index.ndjson`. Created if missing.
    public let indexURL: URL

    /// Minimum seconds between consecutive frames kept. Default 1.0 ( ~= 1 Hz ).
    public let sampleInterval: TimeInterval

    /// Scan start time. Used to compute `timestampSeconds` in each entry.
    public let scanStartedAt: Date

    /// Count of frames written so far (for CaptureEnvironment.sceneDepthFrameCount).
    public private(set) var framesWritten: Int = 0

    /// Last ARFrame.timestamp we wrote (not scan-start-relative). Internal for throttling.
    private var lastSampleTimestamp: TimeInterval = -1
    /// Serial queue for file IO.
    private let ioQueue = DispatchQueue(label: "com.patina.depth-recorder.io", qos: .userInitiated)
    /// Handle onto the index NDJSON.
    private var indexHandle: FileHandle?

    public init(bundleURL: URL, scanStartedAt: Date = Date(), sampleInterval: TimeInterval = 1.0) throws {
        self.depthDirectoryURL = bundleURL.appendingPathComponent("depth", isDirectory: true)
        self.indexURL = depthDirectoryURL.appendingPathComponent("depth_index.ndjson", isDirectory: false)
        self.scanStartedAt = scanStartedAt
        self.sampleInterval = sampleInterval

        try FileManager.default.createDirectory(at: depthDirectoryURL, withIntermediateDirectories: true)
        if !FileManager.default.fileExists(atPath: indexURL.path) {
            FileManager.default.createFile(atPath: indexURL.path, contents: nil)
        }
    }

    deinit {
        try? indexHandle?.close()
    }

    /// Submit an ARFrame to be considered. Sampler drops it if the last write is younger than sampleInterval.
    /// - Parameters:
    ///   - frame: current ARFrame (must have sceneDepth non-nil for anything to happen)
    ///   - associatedPhotoId: optional — the posed-photo id matched within ±0.15s at the call site.
    public func consume(frame: ARFrame, associatedPhotoId: UUID? = nil) {
        guard let depth = frame.sceneDepth else { return }
        let now = frame.timestamp
        if lastSampleTimestamp >= 0, now - lastSampleTimestamp < sampleInterval { return }
        lastSampleTimestamp = now

        // Clone pixel buffers (they're recycled by ARKit; retain content before dispatch).
        let depthMap = depth.depthMap
        let confidenceMap = depth.confidenceMap
        let camera = frame.camera
        let transform = camera.transform
        let intrinsics = camera.intrinsics
        let imageRes = camera.imageResolution
        let tsSeconds = Date().timeIntervalSince(scanStartedAt)  // wall-clock relative

        ioQueue.async { [weak self] in
            guard let self else { return }
            self.writeFrame(
                depthMap: depthMap,
                confidenceMap: confidenceMap,
                cameraTransform: transform,
                intrinsics: intrinsics,
                imageResolution: imageRes,
                scanRelativeTimestamp: tsSeconds,
                associatedPhotoId: associatedPhotoId
            )
        }
    }

    /// Idempotent flush / close. Safe to call multiple times. Wave-3 calls it from finalize.
    public func finishSession() {
        ioQueue.sync { }  // drain pending writes
        if let handle = indexHandle {
            try? handle.close()
            indexHandle = nil
        }
    }

    // MARK: - Private

    private func writeFrame(
        depthMap: CVPixelBuffer,
        confidenceMap: CVPixelBuffer?,
        cameraTransform: simd_float4x4,
        intrinsics: simd_float3x3,
        imageResolution: CGSize,
        scanRelativeTimestamp: TimeInterval,
        associatedPhotoId: UUID?
    ) {
        let tsKey = String(format: "%.3f", scanRelativeTimestamp).replacingOccurrences(of: ".", with: "_")
        let depthFilename = "depth_\(tsKey).png"
        let confFilename = "conf_\(tsKey).png"
        let depthURL = depthDirectoryURL.appendingPathComponent(depthFilename)
        let confURL = depthDirectoryURL.appendingPathComponent(confFilename)

        let depthWidth = CVPixelBufferGetWidth(depthMap)
        let depthHeight = CVPixelBufferGetHeight(depthMap)

        do {
            try writeDepthPNG16(pixelBuffer: depthMap, to: depthURL)
            if let conf = confidenceMap {
                try writeConfidencePNG8(pixelBuffer: conf, to: confURL)
            }

            // Row-major flatten — matches PosedPhotoService.rowMajor(_:) convention.
            let transformArr: [Double] = [
                Double(cameraTransform.columns.0.x), Double(cameraTransform.columns.1.x), Double(cameraTransform.columns.2.x), Double(cameraTransform.columns.3.x),
                Double(cameraTransform.columns.0.y), Double(cameraTransform.columns.1.y), Double(cameraTransform.columns.2.y), Double(cameraTransform.columns.3.y),
                Double(cameraTransform.columns.0.z), Double(cameraTransform.columns.1.z), Double(cameraTransform.columns.2.z), Double(cameraTransform.columns.3.z),
                Double(cameraTransform.columns.0.w), Double(cameraTransform.columns.1.w), Double(cameraTransform.columns.2.w), Double(cameraTransform.columns.3.w)
            ]

            let entry = FrameEntry(
                depthPath: "depth/\(depthFilename)",
                confPath: "depth/\(confFilename)",
                timestampSeconds: scanRelativeTimestamp,
                associatedPhotoId: associatedPhotoId,
                cameraTransform: transformArr,
                intrinsics: .init(
                    fx: Double(intrinsics.columns.0.x),
                    fy: Double(intrinsics.columns.1.y),
                    cx: Double(intrinsics.columns.2.x),
                    cy: Double(intrinsics.columns.2.y),
                    imageWidth: Int(imageResolution.width),
                    imageHeight: Int(imageResolution.height)
                ),
                width: depthWidth,
                height: depthHeight
            )

            let encoder = JSONEncoder()
            encoder.outputFormatting = []  // one line, no pretty
            let data = try encoder.encode(entry)
            appendLine(data: data)

            framesWritten += 1
        } catch {
            // Deliberately swallow — depth recording is best-effort.
        }
    }

    private func appendLine(data: Data) {
        if indexHandle == nil {
            indexHandle = try? FileHandle(forWritingTo: indexURL)
            _ = try? indexHandle?.seekToEnd()
        }
        guard let handle = indexHandle else { return }
        handle.write(data)
        handle.write(Data([0x0A]))  // LF
    }

    /// Convert a Float32 depthMap (values in meters) into a 16-bit grayscale PNG.
    /// Per-pixel: value_u16 = min(max(depth_m * 1000.0, 0), Float(UInt16.max))
    private func writeDepthPNG16(pixelBuffer: CVPixelBuffer, to url: URL) throws {
        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

        let w = CVPixelBufferGetWidth(pixelBuffer)
        let h = CVPixelBufferGetHeight(pixelBuffer)
        let stride = CVPixelBufferGetBytesPerRow(pixelBuffer)
        guard let base = CVPixelBufferGetBaseAddress(pixelBuffer) else {
            throw NSError(domain: "DepthFrameRecorder", code: 1, userInfo: [NSLocalizedDescriptionKey: "depthMap base address nil"])
        }
        var pixels = [UInt16](repeating: 0, count: w * h)
        for y in 0..<h {
            let row = base.advanced(by: y * stride).assumingMemoryBound(to: Float32.self)
            for x in 0..<w {
                let meters = row[x]
                let scaled = meters * 1000.0
                let clamped: UInt16
                if scaled.isNaN || scaled <= 0 {
                    clamped = 0
                } else if scaled >= Float(UInt16.max) {
                    clamped = UInt16.max
                } else {
                    clamped = UInt16(scaled)
                }
                pixels[y * w + x] = clamped
            }
        }

        // Assemble CGImage from raw 16-bit grayscale pixels.
        let colorSpace = CGColorSpaceCreateDeviceGray()
        let bitmapInfo: UInt32 = CGBitmapInfo.byteOrder16Little.rawValue | CGImageAlphaInfo.none.rawValue
        let dataProvider = CGDataProvider(data: Data(bytes: &pixels, count: pixels.count * 2) as CFData)
        guard let provider = dataProvider,
              let cg = CGImage(
                width: w, height: h,
                bitsPerComponent: 16, bitsPerPixel: 16,
                bytesPerRow: w * 2,
                space: colorSpace,
                bitmapInfo: CGBitmapInfo(rawValue: bitmapInfo),
                provider: provider, decode: nil, shouldInterpolate: false,
                intent: .defaultIntent
              ) else {
            throw NSError(domain: "DepthFrameRecorder", code: 2, userInfo: [NSLocalizedDescriptionKey: "CGImage creation failed"])
        }
        try writePNG(cg, to: url)
    }

    /// Convert an 8-bit confidence buffer (ARConfidenceLevel raw values 0/1/2) into a grayscale PNG.
    private func writeConfidencePNG8(pixelBuffer: CVPixelBuffer, to url: URL) throws {
        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

        let w = CVPixelBufferGetWidth(pixelBuffer)
        let h = CVPixelBufferGetHeight(pixelBuffer)
        let stride = CVPixelBufferGetBytesPerRow(pixelBuffer)
        guard let base = CVPixelBufferGetBaseAddress(pixelBuffer) else {
            throw NSError(domain: "DepthFrameRecorder", code: 3, userInfo: [NSLocalizedDescriptionKey: "confidence base address nil"])
        }
        var pixels = [UInt8](repeating: 0, count: w * h)
        for y in 0..<h {
            let row = base.advanced(by: y * stride).assumingMemoryBound(to: UInt8.self)
            for x in 0..<w {
                pixels[y * w + x] = row[x]
            }
        }

        let colorSpace = CGColorSpaceCreateDeviceGray()
        let bitmapInfo: UInt32 = CGImageAlphaInfo.none.rawValue
        let dataProvider = CGDataProvider(data: Data(bytes: &pixels, count: pixels.count) as CFData)
        guard let provider = dataProvider,
              let cg = CGImage(
                width: w, height: h,
                bitsPerComponent: 8, bitsPerPixel: 8,
                bytesPerRow: w,
                space: colorSpace,
                bitmapInfo: CGBitmapInfo(rawValue: bitmapInfo),
                provider: provider, decode: nil, shouldInterpolate: false,
                intent: .defaultIntent
              ) else {
            throw NSError(domain: "DepthFrameRecorder", code: 4, userInfo: [NSLocalizedDescriptionKey: "CGImage creation failed"])
        }
        try writePNG(cg, to: url)
    }

    private func writePNG(_ image: CGImage, to url: URL) throws {
        guard let destination = CGImageDestinationCreateWithURL(
            url as CFURL,
            UTType.png.identifier as CFString,
            1, nil
        ) else {
            throw NSError(domain: "DepthFrameRecorder", code: 5, userInfo: [NSLocalizedDescriptionKey: "CGImageDestination failed"])
        }
        CGImageDestinationAddImage(destination, image, nil)
        if !CGImageDestinationFinalize(destination) {
            throw NSError(domain: "DepthFrameRecorder", code: 6, userInfo: [NSLocalizedDescriptionKey: "PNG finalize failed"])
        }
    }
}

//  FieldRasterFixtureExporter.swift
//  CaptureKit
//
//  DEBUG-only physical-device evidence generator for the Field/Core Image raster
//  contract. It never ships in a Release build and never touches scan storage.
//
//  R118 (2026-07-28) — THE FIXTURE IS EMITTED AT THE CAPTURE PROFILE, NOT AT A
//  PINNED SIZE. Until R118 this exporter synthesized at a hard-coded 640x360,
//  while production writes a full-resolution HEIC (`FieldKeyframeRecorder`)
//  through an encoder that passes `cgImage.width`/`cgImage.height` straight out
//  (`FieldRasterEncoder`). Nothing on the capture path downscales, so the
//  qualified profile and the shipped profile were never the same profile.
//
//  The capture profile is NOT a constant and must never become one again. The
//  Field rig (`SharedARCaptureRig.makeConfiguration()`) never assigns
//  `ARConfiguration.videoFormat`, so ARKit selects the device's default format
//  for that configuration; `frame.camera.imageResolution` is therefore a
//  runtime property of the device and the enabled frame semantics. `export`
//  requires an explicit `CaptureProfile` carrying that resolution AND the
//  provenance of how it was determined, so a receipt taken against this fixture
//  says which profile it qualified. `referenceProfile` reproduces the pre-R118
//  640x360 design byte-for-byte and exists ONLY as a unit-test anchor — it
//  declares `deviceModel == CaptureProfile.referenceDeviceModel` so a
//  qualification harness can refuse it.

#if DEBUG

import CoreImage
import CoreVideo
import Foundation

public enum FieldRasterFixtureError: Error, LocalizedError {
    case pixelBufferCreation(OSStatus)
    case pixelBufferBaseAddress
    case heicEncoding
    case unsupportedCaptureProfile(String)

    public var errorDescription: String? {
        switch self {
        case .pixelBufferCreation(let status):
            return "Could not create the fixture pixel buffer (Core Video status \(status))."
        case .pixelBufferBaseAddress:
            return "Could not access the fixture pixel buffer bytes."
        case .heicEncoding:
            return "The production Field HEIC encoder rejected the fixture raster."
        case .unsupportedCaptureProfile(let reason):
            return "Unsupported capture profile: \(reason)"
        }
    }
}

public enum FieldRasterFixtureExporter {
    public static let fixtureID = "field-core-image-raster-v1"

    /// Bumped 1 -> 2 by R118: the manifest now declares the capture profile it
    /// was emitted at, and its markers are derived from that profile rather
    /// than pinned to 640x360.
    public static let manifestSchemaVersion = 2

    public static var nativeRasterFileName: String { "\(fixtureID)-native.bgra" }
    public static var encodedRasterFileName: String { "\(fixtureID).heic" }
    public static var manifestFileName: String { "\(fixtureID).json" }

    /// The 640x360 design every marker position and size is derived from. This
    /// is a DRAWING reference, not a capture profile — production never
    /// captures at this size (see the R118 note above).
    public static let referenceWidth = 640
    public static let referenceHeight = 360

    // MARK: - Capture-profile bounds
    //
    // "Constrained rather than merely variable" (R118, obligation 1). A profile
    // outside these bounds is refused before a byte is drawn.

    /// No smaller than the reference design in either axis — below that the
    /// scaled markers stop being safely larger than the qualifier's radius-2
    /// colour probe.
    public static let minimumNativeWidth = referenceWidth
    public static let minimumNativeHeight = referenceHeight
    /// 2^24 pixels = 64 MiB of 32BGRA. The largest still-transferable single
    /// fixture; well above any ARKit world-tracking format.
    public static let maximumNativePixels = 16_777_216

    public struct Point: Codable, Equatable, Sendable {
        public let x: Int
        public let y: Int

        public init(x: Int, y: Int) {
            self.x = x
            self.y = y
        }
    }

    public struct Intrinsics: Codable, Equatable, Sendable {
        public let fx: Double
        public let fy: Double
        public let cx: Double
        public let cy: Double
        public let imageWidth: Int
        public let imageHeight: Int

        public init(fx: Double, fy: Double, cx: Double, cy: Double, imageWidth: Int, imageHeight: Int) {
            self.fx = fx
            self.fy = fy
            self.cx = cx
            self.cy = cy
            self.imageWidth = imageWidth
            self.imageHeight = imageHeight
        }
    }

    /// The physical capture profile this fixture was emitted at, plus how that
    /// resolution was established. The provenance is the point: a bare pair of
    /// integers is what let the qualified profile drift from the shipped one.
    public struct CaptureProfile: Codable, Equatable, Sendable {
        /// Reserved `deviceModel` for `referenceProfile`. A qualification
        /// harness should refuse a fixture carrying it.
        public static let referenceDeviceModel = "reference-design"

        /// Native (landscape) width of the ARKit captured image, in pixels —
        /// i.e. `frame.camera.imageResolution.width`.
        public let nativeWidth: Int
        /// Native (landscape) height of the ARKit captured image, in pixels.
        public let nativeHeight: Int
        /// How `nativeWidth`/`nativeHeight` were determined, in enough detail to
        /// re-derive them (which API, on which configuration).
        public let resolutionSource: String
        /// `utsname.machine` of the emitting device, e.g. `iPhone18,3`.
        public let deviceModel: String
        /// OS build the fixture was emitted under, e.g. `iOS 26.5`.
        public let systemVersion: String
        /// The selected ARKit video format, e.g. `1920x1440@60 wide-angle`.
        public let videoFormat: String

        public init(
            nativeWidth: Int,
            nativeHeight: Int,
            resolutionSource: String,
            deviceModel: String,
            systemVersion: String,
            videoFormat: String
        ) {
            self.nativeWidth = nativeWidth
            self.nativeHeight = nativeHeight
            self.resolutionSource = resolutionSource
            self.deviceModel = deviceModel
            self.systemVersion = systemVersion
            self.videoFormat = videoFormat
        }
    }

    /// Reproduces the pre-R118 640x360 fixture byte-for-byte. TESTS ONLY — it
    /// is not a capture profile and its `deviceModel` says so.
    public static let referenceProfile = CaptureProfile(
        nativeWidth: referenceWidth,
        nativeHeight: referenceHeight,
        resolutionSource: "reference drawing design; NOT a physical capture profile",
        deviceModel: CaptureProfile.referenceDeviceModel,
        systemVersion: "none",
        videoFormat: "none"
    )

    public struct Marker: Codable, Equatable, Sendable {
        public let id: String
        public let role: String
        public let shape: String
        public let rgbaHex: String
        public let nativeCoordinate: Point
        public let expectedEncodedCoordinate: Point
    }

    public struct NativeRaster: Codable, Equatable, Sendable {
        public let fileName: String
        public let width: Int
        public let height: Int
        public let rowBytes: Int
        public let pixelFormat: String
        public let sha256: String
    }

    public struct EncodedRaster: Codable, Equatable, Sendable {
        public let fileName: String
        public let width: Int
        public let height: Int
        public let mimeType: String
        public let sha256: String
    }

    public struct Manifest: Codable, Equatable, Sendable {
        public let schemaVersion: Int
        public let fixtureID: String
        public let captureProfile: CaptureProfile
        public let encodingPipeline: String
        public let orientation: String
        public let markerCoordinateConvention: String
        public let nativeRaster: NativeRaster
        public let encodedRaster: EncodedRaster
        public let nativeIntrinsics: Intrinsics
        public let expectedEncodedIntrinsics: Intrinsics
        public let markers: [Marker]
    }

    public struct Export {
        public let manifest: Manifest
        public let nativeRasterURL: URL
        public let heicURL: URL
        public let manifestURL: URL
        public let manifestSHA256: String

        public var artifactURLs: [URL] {
            [heicURL, manifestURL, nativeRasterURL]
        }
    }

    // MARK: - Drawing primitives

    private struct RGBA: Equatable {
        let r: UInt8
        let g: UInt8
        let b: UInt8
        let a: UInt8

        /// `#RRGGBBAA`. The manifest's `rgbaHex` is the single source of truth
        /// for a marker's colour — the drawn pixels are derived from it, so the
        /// two can never disagree.
        init?(hex: String) {
            guard hex.hasPrefix("#"), hex.count == 9,
                  let value = UInt32(hex.dropFirst(), radix: 16) else { return nil }
            r = UInt8((value >> 24) & 0xFF)
            g = UInt8((value >> 16) & 0xFF)
            b = UInt8((value >> 8) & 0xFF)
            a = UInt8(value & 0xFF)
        }

        init(r: UInt8, g: UInt8, b: UInt8, a: UInt8) {
            self.r = r
            self.g = g
            self.b = b
            self.a = a
        }
    }

    private static let backgroundColor = RGBA(r: 30, g: 35, b: 43, a: 255)
    private static let asymmetryBarColor = RGBA(r: 238, g: 118, b: 38, a: 255)

    private struct RasterCanvas {
        let width: Int
        let height: Int
        private(set) var bytes: [UInt8]

        init(width: Int, height: Int, background: RGBA) {
            self.width = width
            self.height = height
            let count = width * height * 4
            var storage = [UInt8](repeating: 0, count: count)
            // Unsafe buffer: at capture resolution this is millions of pixels
            // and the DEBUG build has no optimizer to remove bounds checks.
            storage.withUnsafeMutableBufferPointer { buffer in
                guard let base = buffer.baseAddress else { return }
                for offset in stride(from: 0, to: count, by: 4) {
                    base[offset] = background.b
                    base[offset + 1] = background.g
                    base[offset + 2] = background.r
                    base[offset + 3] = background.a
                }
            }
            self.bytes = storage
        }

        mutating func fillRect(center: Point, halfWidth: Int, halfHeight: Int, color: RGBA) {
            for y in (center.y - halfHeight)...(center.y + halfHeight) {
                for x in (center.x - halfWidth)...(center.x + halfWidth) {
                    setPixel(x: x, y: y, color: color)
                }
            }
        }

        mutating func drawCross(center: Point, halfSize: Int, thickness: Int, color: RGBA) {
            for y in (center.y - halfSize)...(center.y + halfSize) {
                for x in (center.x - halfSize)...(center.x + halfSize)
                    where abs(x - center.x) <= thickness || abs(y - center.y) <= thickness {
                    setPixel(x: x, y: y, color: color)
                }
            }
        }

        mutating func drawDiamond(center: Point, radius: Int, color: RGBA) {
            for y in (center.y - radius)...(center.y + radius) {
                for x in (center.x - radius)...(center.x + radius)
                    where abs(x - center.x) + abs(y - center.y) <= radius {
                    setPixel(x: x, y: y, color: color)
                }
            }
        }

        private mutating func setPixel(x: Int, y: Int, color: RGBA) {
            guard x >= 0, x < width, y >= 0, y < height else { return }
            let offset = ((y * width) + x) * 4
            bytes[offset] = color.b
            bytes[offset + 1] = color.g
            bytes[offset + 2] = color.r
            bytes[offset + 3] = color.a
        }
    }

    // MARK: - Profile-derived layout
    //
    // Every position and size below is derived from the 640x360 reference
    // design by exact integer arithmetic, so the layout is reproducible from
    // the declared profile alone — a Linux qualifier can recompute the whole
    // expected marker set from `captureProfile.nativeWidth/nativeHeight`
    // without trusting the manifest's marker list.
    //
    //   scaled(v, num, den) = round-half-up(v * num / den)
    //   sizeNumerator       = min(W * 360, H * 640)   sizeDenominator = 230400
    //   sizes    -> scaled(referenceSize, sizeNumerator, sizeDenominator)
    //   x        -> scaled(referenceX, W, 640)
    //   y        -> scaled(referenceY, H, 360)
    //   corners  -> flush: (half, half), (W-1-half, half),
    //                      (half, H-1-half), (W-1-half, H-1-half)
    //
    // At W=640, H=360 every expression reduces to the pre-R118 constant, so the
    // reference profile re-emits the I92 fixture byte-for-byte.

    private enum MarkerShape {
        /// Corner index 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right.
        case corner(Int)
        case cross
        case diamond
    }

    private struct MarkerBlueprint {
        let id: String
        let role: String
        let rgbaHex: String
        let shape: MarkerShape
    }

    private static let markerBlueprints: [MarkerBlueprint] = [
        .init(id: "corner-top-left", role: "corner", rgbaHex: "#FF2020FF", shape: .corner(0)),
        .init(id: "corner-top-right", role: "corner", rgbaHex: "#20E060FF", shape: .corner(1)),
        .init(id: "corner-bottom-left", role: "corner", rgbaHex: "#2060FFFF", shape: .corner(2)),
        .init(id: "corner-bottom-right", role: "corner", rgbaHex: "#FFE020FF", shape: .corner(3)),
        .init(id: "fiducial-magenta", role: "off-centre-fiducial", rgbaHex: "#F020E0FF", shape: .cross),
        .init(id: "fiducial-cyan", role: "off-centre-fiducial", rgbaHex: "#20E8F0FF", shape: .diamond)
    ]

    private struct ResolvedMarker {
        let blueprint: MarkerBlueprint
        let center: Point
        let shapeDescription: String
        let color: RGBA
    }

    /// Every profile-derived position and extent, before markers are named.
    private struct Geometry {
        let corners: [Point]
        let cornerHalf: Int
        let crossCenter: Point
        let crossHalfSize: Int
        let crossThickness: Int
        let diamondCenter: Point
        let diamondRadius: Int
        let barCenter: Point
        let barHalfWidth: Int
        let barHalfHeight: Int
    }

    private struct Layout {
        let width: Int
        let height: Int
        let geometry: Geometry
        let markers: [ResolvedMarker]
    }

    /// Round-half-up `value * numerator / denominator` in exact integer math.
    private static func scaled(_ value: Int, _ numerator: Int, _ denominator: Int) -> Int {
        (2 * value * numerator + denominator) / (2 * denominator)
    }

    /// Marker centres and their profile-derived shape descriptors. Extracted
    /// from `makeLayout` so each stays readable.
    private static func resolveMarkers(_ geometry: Geometry) throws -> [ResolvedMarker] {
        try markerBlueprints.map { blueprint in
            guard let color = RGBA(hex: blueprint.rgbaHex) else {
                throw FieldRasterFixtureError.unsupportedCaptureProfile(
                    "marker \(blueprint.id) has a malformed rgbaHex"
                )
            }
            switch blueprint.shape {
            case .corner(let index):
                return ResolvedMarker(
                    blueprint: blueprint,
                    center: geometry.corners[index],
                    shapeDescription: "square-\(2 * geometry.cornerHalf + 1)",
                    color: color
                )
            case .cross:
                return ResolvedMarker(
                    blueprint: blueprint,
                    center: geometry.crossCenter,
                    shapeDescription: "cross-\(2 * geometry.crossHalfSize + 1)-thickness-\(2 * geometry.crossThickness + 1)",
                    color: color
                )
            case .diamond:
                return ResolvedMarker(
                    blueprint: blueprint,
                    center: geometry.diamondCenter,
                    shapeDescription: "diamond-radius-\(geometry.diamondRadius)",
                    color: color
                )
            }
        }
    }

    private static func makeLayout(width: Int, height: Int) throws -> Layout {
        let sizeNumerator = min(width * referenceHeight, height * referenceWidth)
        let sizeDenominator = referenceWidth * referenceHeight
        func size(_ reference: Int) -> Int { scaled(reference, sizeNumerator, sizeDenominator) }
        func px(_ reference: Int) -> Int { scaled(reference, width, referenceWidth) }
        func py(_ reference: Int) -> Int { scaled(reference, height, referenceHeight) }
        func clamped(_ point: Point, halfX: Int, halfY: Int) -> Point {
            Point(
                x: min(max(point.x, halfX), width - 1 - halfX),
                y: min(max(point.y, halfY), height - 1 - halfY)
            )
        }

        let cornerHalf = size(27)
        let crossHalfSize = size(22)
        let crossThickness = size(6)
        let diamondRadius = size(21)
        let barHalfWidth = size(8)
        let barHalfHeight = size(74)

        let corners = [
            Point(x: cornerHalf, y: cornerHalf),
            Point(x: width - 1 - cornerHalf, y: cornerHalf),
            Point(x: cornerHalf, y: height - 1 - cornerHalf),
            Point(x: width - 1 - cornerHalf, y: height - 1 - cornerHalf)
        ]
        let crossCenter = clamped(
            Point(x: px(173), y: py(91)),
            halfX: crossHalfSize,
            halfY: crossHalfSize
        )
        let diamondCenter = clamped(
            Point(x: px(487), y: py(271)),
            halfX: diamondRadius,
            halfY: diamondRadius
        )
        let barCenter = clamped(
            Point(x: px(101), y: py(225)),
            halfX: barHalfWidth,
            halfY: barHalfHeight
        )

        let geometry = Geometry(
            corners: corners,
            cornerHalf: cornerHalf,
            crossCenter: crossCenter,
            crossHalfSize: crossHalfSize,
            crossThickness: crossThickness,
            diamondCenter: diamondCenter,
            diamondRadius: diamondRadius,
            barCenter: barCenter,
            barHalfWidth: barHalfWidth,
            barHalfHeight: barHalfHeight
        )
        return Layout(
            width: width,
            height: height,
            geometry: geometry,
            markers: try resolveMarkers(geometry)
        )
    }

    // MARK: - Synthetic intrinsics
    //
    // Synthetic, not measured: their job is to make the clockwise intrinsics map
    // (fx',fy',cx',cy') = (fy, fx, H-cy, cx) falsifiable. Focal lengths scale
    // with the horizontal scale (constant pixel aspect); the principal point
    // scales per-axis. At the reference profile these are the pre-R118 values.

    private static let referenceFx = 512.5
    private static let referenceFy = 509.25
    private static let referenceCx = 301.25
    private static let referenceCy = 154.75

    private static func nativeIntrinsics(width: Int, height: Int) -> Intrinsics {
        let horizontal = Double(width) / Double(referenceWidth)
        let vertical = Double(height) / Double(referenceHeight)
        return Intrinsics(
            fx: referenceFx * horizontal,
            fy: referenceFy * horizontal,
            cx: referenceCx * horizontal,
            cy: referenceCy * vertical,
            imageWidth: width,
            imageHeight: height
        )
    }

    private static func rotatedIntrinsics(from native: Intrinsics) -> Intrinsics {
        Intrinsics(
            fx: native.fy,
            fy: native.fx,
            cx: Double(native.imageHeight) - native.cy,
            cy: native.cx,
            imageWidth: native.imageHeight,
            imageHeight: native.imageWidth
        )
    }

    // MARK: - Export

    public static func export(
        to directory: URL,
        profile: CaptureProfile,
        using ciContext: CIContext = CIContext(options: [.useSoftwareRenderer: false])
    ) throws -> Export {
        try validate(profile)
        let width = profile.nativeWidth
        let height = profile.nativeHeight
        let layout = try makeLayout(width: width, height: height)

        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        let nativeURL = directory.appendingPathComponent(nativeRasterFileName, isDirectory: false)
        let heicURL = directory.appendingPathComponent(encodedRasterFileName, isDirectory: false)
        let manifestURL = directory.appendingPathComponent(manifestFileName, isDirectory: false)

        let (pixelBuffer, nativeBytes) = try makeNativeRaster(layout: layout)
        guard let encoded = FieldRasterEncoder.encodeHEIC(
            pixelBuffer: pixelBuffer,
            using: ciContext
        ) else {
            throw FieldRasterFixtureError.heicEncoding
        }

        try nativeBytes.write(to: nativeURL, options: .atomic)
        try encoded.data.write(to: heicURL, options: .atomic)

        let manifest = makeManifest(
            profile: profile,
            layout: layout,
            nativeBytes: nativeBytes,
            encoded: encoded
        )
        let manifestData = try encodeManifest(manifest)
        try manifestData.write(to: manifestURL, options: .atomic)

        return Export(
            manifest: manifest,
            nativeRasterURL: nativeURL,
            heicURL: heicURL,
            manifestURL: manifestURL,
            manifestSHA256: BundleChecksum.sha256(of: manifestData)
        )
    }

    /// Bounds the profile so the emitted size is constrained, not merely
    /// variable (R118, obligation 1).
    private static func validate(_ profile: CaptureProfile) throws {
        let width = profile.nativeWidth
        let height = profile.nativeHeight
        guard width >= minimumNativeWidth, height >= minimumNativeHeight else {
            throw FieldRasterFixtureError.unsupportedCaptureProfile(
                "\(width)x\(height) is below the \(minimumNativeWidth)x\(minimumNativeHeight) floor"
            )
        }
        guard width > height else {
            throw FieldRasterFixtureError.unsupportedCaptureProfile(
                "\(width)x\(height) is not landscape; ARKit's capturedImage is always landscape"
            )
        }
        guard width * height <= maximumNativePixels else {
            throw FieldRasterFixtureError.unsupportedCaptureProfile(
                "\(width)x\(height) exceeds the \(maximumNativePixels)-pixel ceiling"
            )
        }
        guard !profile.deviceModel.isEmpty,
              !profile.resolutionSource.isEmpty,
              !profile.videoFormat.isEmpty else {
            throw FieldRasterFixtureError.unsupportedCaptureProfile(
                "the profile must carry its device model, resolution source, and video format"
            )
        }
    }

    /// `(x,y) -> (H-1-y, x)`: the physical clockwise quarter turn Core Image's
    /// `.oriented(.right)` applies. Valid at any profile.
    private static func clockwise(_ point: Point, nativeHeight: Int) -> Point {
        Point(x: nativeHeight - 1 - point.y, y: point.x)
    }

    private static func makeManifest(
        profile: CaptureProfile,
        layout: Layout,
        nativeBytes: Data,
        encoded: FieldEncodedRaster
    ) -> Manifest {
        let markers = layout.markers.map { resolved in
            Marker(
                id: resolved.blueprint.id,
                role: resolved.blueprint.role,
                shape: resolved.shapeDescription,
                rgbaHex: resolved.blueprint.rgbaHex,
                nativeCoordinate: resolved.center,
                expectedEncodedCoordinate: clockwise(resolved.center, nativeHeight: layout.height)
            )
        }
        let native = nativeIntrinsics(width: layout.width, height: layout.height)
        return Manifest(
            schemaVersion: manifestSchemaVersion,
            fixtureID: fixtureID,
            captureProfile: profile,
            encodingPipeline: "CVPixelBuffer(32BGRA) -> CIImage(cvPixelBuffer:) -> oriented(.right) -> CGImage -> HEIC(quality=0.75)",
            orientation: "CGImagePropertyOrientation.right (physical 90-degree clockwise raster)",
            markerCoordinateConvention: "integer pixel centres from top-left; expected encoded (x,y)=(nativeHeight-1-y,x)",
            nativeRaster: NativeRaster(
                fileName: nativeRasterFileName,
                width: layout.width,
                height: layout.height,
                rowBytes: layout.width * 4,
                pixelFormat: "32BGRA, tightly packed, top-left row first",
                sha256: BundleChecksum.sha256(of: nativeBytes)
            ),
            encodedRaster: EncodedRaster(
                fileName: encodedRasterFileName,
                width: encoded.width,
                height: encoded.height,
                mimeType: "image/heic",
                sha256: BundleChecksum.sha256(of: encoded.data)
            ),
            nativeIntrinsics: native,
            expectedEncodedIntrinsics: rotatedIntrinsics(from: native),
            markers: markers
        )
    }

    private static func encodeManifest(_ manifest: Manifest) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        var data = try encoder.encode(manifest)
        data.append(0x0A)
        return data
    }

    private static func makeNativeRaster(layout: Layout) throws -> (CVPixelBuffer, Data) {
        let bytes = makeNativeBytes(layout: layout)
        return (try makePixelBuffer(copying: bytes, layout: layout), bytes)
    }

    /// Draw order is load-bearing: background, asymmetry bar, four corners,
    /// cross, diamond. It is the pre-R118 order, so the reference profile
    /// reproduces the I92 bytes exactly.
    private static func makeNativeBytes(layout: Layout) -> Data {
        var canvas = RasterCanvas(
            width: layout.width,
            height: layout.height,
            background: backgroundColor
        )
        canvas.fillRect(
            center: layout.geometry.barCenter,
            halfWidth: layout.geometry.barHalfWidth,
            halfHeight: layout.geometry.barHalfHeight,
            color: asymmetryBarColor
        )
        for marker in layout.markers {
            switch marker.blueprint.shape {
            case .corner:
                canvas.fillRect(
                    center: marker.center,
                    halfWidth: layout.geometry.cornerHalf,
                    halfHeight: layout.geometry.cornerHalf,
                    color: marker.color
                )
            case .cross:
                canvas.drawCross(
                    center: marker.center,
                    halfSize: layout.geometry.crossHalfSize,
                    thickness: layout.geometry.crossThickness,
                    color: marker.color
                )
            case .diamond:
                canvas.drawDiamond(
                    center: marker.center,
                    radius: layout.geometry.diamondRadius,
                    color: marker.color
                )
            }
        }
        return Data(canvas.bytes)
    }

    private static func makePixelBuffer(copying bytes: Data, layout: Layout) throws -> CVPixelBuffer {
        var pixelBuffer: CVPixelBuffer?
        let attributes: [CFString: Any] = [
            kCVPixelBufferCGImageCompatibilityKey: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey: true,
            kCVPixelBufferIOSurfacePropertiesKey: [:]
        ]
        let status = CVPixelBufferCreate(
            kCFAllocatorDefault,
            layout.width,
            layout.height,
            kCVPixelFormatType_32BGRA,
            attributes as CFDictionary,
            &pixelBuffer
        )
        guard status == kCVReturnSuccess, let pixelBuffer else {
            throw FieldRasterFixtureError.pixelBufferCreation(status)
        }

        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }
        guard let destination = CVPixelBufferGetBaseAddress(pixelBuffer) else {
            throw FieldRasterFixtureError.pixelBufferBaseAddress
        }
        let destinationRowBytes = CVPixelBufferGetBytesPerRow(pixelBuffer)
        let sourceRowBytes = layout.width * 4
        bytes.withUnsafeBytes { source in
            guard let sourceBase = source.baseAddress else { return }
            for row in 0..<layout.height {
                memcpy(
                    destination.advanced(by: row * destinationRowBytes),
                    sourceBase.advanced(by: row * sourceRowBytes),
                    sourceRowBytes
                )
            }
        }
        return pixelBuffer
    }
}

#endif

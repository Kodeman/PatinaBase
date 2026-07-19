//  FieldRasterFixtureExporter.swift
//  CaptureKit
//
//  DEBUG-only physical-device evidence generator for the Field/Core Image raster
//  contract. It never ships in a Release build and never touches scan storage.

#if DEBUG

import CoreImage
import CoreVideo
import Foundation

public enum FieldRasterFixtureError: Error, LocalizedError {
    case pixelBufferCreation(OSStatus)
    case pixelBufferBaseAddress
    case heicEncoding

    public var errorDescription: String? {
        switch self {
        case .pixelBufferCreation(let status):
            return "Could not create the fixture pixel buffer (Core Video status \(status))."
        case .pixelBufferBaseAddress:
            return "Could not access the fixture pixel buffer bytes."
        case .heicEncoding:
            return "The production Field HEIC encoder rejected the fixture raster."
        }
    }
}

public enum FieldRasterFixtureExporter {
    public static let fixtureID = "field-core-image-raster-v1"
    public static let nativeWidth = 640
    public static let nativeHeight = 360

    public struct Point: Codable, Equatable {
        public let x: Int
        public let y: Int
    }

    public struct Intrinsics: Codable, Equatable {
        public let fx: Double
        public let fy: Double
        public let cx: Double
        public let cy: Double
        public let imageWidth: Int
        public let imageHeight: Int
    }

    public struct Marker: Codable, Equatable {
        public let id: String
        public let role: String
        public let shape: String
        public let rgbaHex: String
        public let nativeCoordinate: Point
        public let expectedEncodedCoordinate: Point
    }

    public struct NativeRaster: Codable, Equatable {
        public let fileName: String
        public let width: Int
        public let height: Int
        public let rowBytes: Int
        public let pixelFormat: String
        public let sha256: String
    }

    public struct EncodedRaster: Codable, Equatable {
        public let fileName: String
        public let width: Int
        public let height: Int
        public let mimeType: String
        public let sha256: String
    }

    public struct Manifest: Codable, Equatable {
        public let schemaVersion: Int
        public let fixtureID: String
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

    private struct RGBA {
        let r: UInt8
        let g: UInt8
        let b: UInt8
        let a: UInt8
    }

    private struct MarkerDefinition {
        let id: String
        let role: String
        let shape: String
        let rgbaHex: String
        let nativeCoordinate: Point
    }

    private struct RasterCanvas {
        let width: Int
        let height: Int
        private(set) var bytes: [UInt8]

        init(width: Int, height: Int, background: RGBA) {
            self.width = width
            self.height = height
            self.bytes = [UInt8](repeating: 0, count: width * height * 4)
            for offset in stride(from: 0, to: bytes.count, by: 4) {
                bytes[offset] = background.b
                bytes[offset + 1] = background.g
                bytes[offset + 2] = background.r
                bytes[offset + 3] = background.a
            }
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
            let offset = ((y * width) + x) * 4
            bytes[offset] = color.b
            bytes[offset + 1] = color.g
            bytes[offset + 2] = color.r
            bytes[offset + 3] = color.a
        }
    }

    private static let nativeIntrinsics = Intrinsics(
        fx: 512.5,
        fy: 509.25,
        cx: 301.25,
        cy: 154.75,
        imageWidth: nativeWidth,
        imageHeight: nativeHeight
    )

    private static let markerDefinitions: [MarkerDefinition] = [
        .init(id: "corner-top-left", role: "corner", shape: "square-55",
              rgbaHex: "#FF2020FF", nativeCoordinate: Point(x: 27, y: 27)),
        .init(id: "corner-top-right", role: "corner", shape: "square-55",
              rgbaHex: "#20E060FF", nativeCoordinate: Point(x: 612, y: 27)),
        .init(id: "corner-bottom-left", role: "corner", shape: "square-55",
              rgbaHex: "#2060FFFF", nativeCoordinate: Point(x: 27, y: 332)),
        .init(id: "corner-bottom-right", role: "corner", shape: "square-55",
              rgbaHex: "#FFE020FF", nativeCoordinate: Point(x: 612, y: 332)),
        .init(id: "fiducial-magenta", role: "off-centre-fiducial",
              shape: "cross-45-thickness-13", rgbaHex: "#F020E0FF",
              nativeCoordinate: Point(x: 173, y: 91)),
        .init(id: "fiducial-cyan", role: "off-centre-fiducial",
              shape: "diamond-radius-21", rgbaHex: "#20E8F0FF",
              nativeCoordinate: Point(x: 487, y: 271))
    ]

    public static func export(
        to directory: URL,
        using ciContext: CIContext = CIContext(options: [.useSoftwareRenderer: false])
    ) throws -> Export {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        let nativeFileName = "\(fixtureID)-native.bgra"
        let heicFileName = "\(fixtureID).heic"
        let manifestFileName = "\(fixtureID).json"
        let nativeURL = directory.appendingPathComponent(nativeFileName, isDirectory: false)
        let heicURL = directory.appendingPathComponent(heicFileName, isDirectory: false)
        let manifestURL = directory.appendingPathComponent(manifestFileName, isDirectory: false)

        let (pixelBuffer, nativeBytes) = try makeNativeRaster()
        guard let encoded = FieldRasterEncoder.encodeHEIC(
            pixelBuffer: pixelBuffer,
            using: ciContext
        ) else {
            throw FieldRasterFixtureError.heicEncoding
        }

        try nativeBytes.write(to: nativeURL, options: .atomic)
        try encoded.data.write(to: heicURL, options: .atomic)

        let manifest = makeManifest(
            nativeFileName: nativeFileName,
            nativeBytes: nativeBytes,
            heicFileName: heicFileName,
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

    private static func clockwise(_ point: Point) -> Point {
        Point(x: nativeHeight - 1 - point.y, y: point.x)
    }

    private static func makeManifest(
        nativeFileName: String,
        nativeBytes: Data,
        heicFileName: String,
        encoded: FieldEncodedRaster
    ) -> Manifest {
        let markers = markerDefinitions.map { definition in
            Marker(
                id: definition.id,
                role: definition.role,
                shape: definition.shape,
                rgbaHex: definition.rgbaHex,
                nativeCoordinate: definition.nativeCoordinate,
                expectedEncodedCoordinate: clockwise(definition.nativeCoordinate)
            )
        }
        return Manifest(
            schemaVersion: 1,
            fixtureID: fixtureID,
            encodingPipeline: "CVPixelBuffer(32BGRA) -> CIImage(cvPixelBuffer:) -> oriented(.right) -> CGImage -> HEIC(quality=0.75)",
            orientation: "CGImagePropertyOrientation.right (physical 90-degree clockwise raster)",
            markerCoordinateConvention: "integer pixel centres from top-left; expected encoded (x,y)=(nativeHeight-1-y,x)",
            nativeRaster: NativeRaster(
                fileName: nativeFileName,
                width: nativeWidth,
                height: nativeHeight,
                rowBytes: nativeWidth * 4,
                pixelFormat: "32BGRA, tightly packed, top-left row first",
                sha256: BundleChecksum.sha256(of: nativeBytes)
            ),
            encodedRaster: EncodedRaster(
                fileName: heicFileName,
                width: encoded.width,
                height: encoded.height,
                mimeType: "image/heic",
                sha256: BundleChecksum.sha256(of: encoded.data)
            ),
            nativeIntrinsics: nativeIntrinsics,
            expectedEncodedIntrinsics: rotatedIntrinsics,
            markers: markers
        )
    }

    private static var rotatedIntrinsics: Intrinsics {
        Intrinsics(
            fx: nativeIntrinsics.fy,
            fy: nativeIntrinsics.fx,
            cx: Double(nativeHeight) - nativeIntrinsics.cy,
            cy: nativeIntrinsics.cx,
            imageWidth: nativeHeight,
            imageHeight: nativeWidth
        )
    }

    private static func encodeManifest(_ manifest: Manifest) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        var data = try encoder.encode(manifest)
        data.append(0x0A)
        return data
    }

    private static func makeNativeRaster() throws -> (CVPixelBuffer, Data) {
        let bytes = makeNativeBytes()
        return (try makePixelBuffer(copying: bytes), bytes)
    }

    private static func makeNativeBytes() -> Data {
        var canvas = RasterCanvas(
            width: nativeWidth,
            height: nativeHeight,
            background: RGBA(r: 30, g: 35, b: 43, a: 255)
        )
        canvas.fillRect(center: Point(x: 101, y: 225), halfWidth: 8, halfHeight: 74,
                        color: RGBA(r: 238, g: 118, b: 38, a: 255))
        canvas.fillRect(center: Point(x: 27, y: 27), halfWidth: 27, halfHeight: 27,
                        color: RGBA(r: 255, g: 32, b: 32, a: 255))
        canvas.fillRect(center: Point(x: 612, y: 27), halfWidth: 27, halfHeight: 27,
                        color: RGBA(r: 32, g: 224, b: 96, a: 255))
        canvas.fillRect(center: Point(x: 27, y: 332), halfWidth: 27, halfHeight: 27,
                        color: RGBA(r: 32, g: 96, b: 255, a: 255))
        canvas.fillRect(center: Point(x: 612, y: 332), halfWidth: 27, halfHeight: 27,
                        color: RGBA(r: 255, g: 224, b: 32, a: 255))
        canvas.drawCross(center: Point(x: 173, y: 91), halfSize: 22, thickness: 6,
                         color: RGBA(r: 240, g: 32, b: 224, a: 255))
        canvas.drawDiamond(center: Point(x: 487, y: 271), radius: 21,
                           color: RGBA(r: 32, g: 232, b: 240, a: 255))
        return Data(canvas.bytes)
    }

    private static func makePixelBuffer(copying bytes: Data) throws -> CVPixelBuffer {
        var pixelBuffer: CVPixelBuffer?
        let attributes: [CFString: Any] = [
            kCVPixelBufferCGImageCompatibilityKey: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey: true,
            kCVPixelBufferIOSurfacePropertiesKey: [:]
        ]
        let status = CVPixelBufferCreate(
            kCFAllocatorDefault,
            nativeWidth,
            nativeHeight,
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
        bytes.withUnsafeBytes { source in
            guard let sourceBase = source.baseAddress else { return }
            for row in 0..<nativeHeight {
                memcpy(
                    destination.advanced(by: row * destinationRowBytes),
                    sourceBase.advanced(by: row * nativeWidth * 4),
                    nativeWidth * 4
                )
            }
        }
        return pixelBuffer
    }
}

#endif

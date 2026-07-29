//  FieldRasterEncodingTests.swift
//  CaptureTests
//
//  Simulator-level contract tests for the shared production Field raster encoder
//  and its DEBUG-only physical-device evidence fixture.

#if DEBUG

import CoreGraphics
import Foundation
import ImageIO
import Testing
@testable import CaptureKit

struct FieldRasterEncodingTests {
    @Test func fixtureExportsDimensionsIntrinsicsMarkersAndHashes() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }

        let output = try FieldRasterFixtureExporter.export(to: directory)
        let manifestData = try Data(contentsOf: output.manifestURL)
        let manifest = try JSONDecoder().decode(
            FieldRasterFixtureExporter.Manifest.self,
            from: manifestData
        )

        #expect(manifest == output.manifest)
        #expect(manifest.fixtureID == "field-core-image-raster-v1")
        #expect(manifest.nativeRaster.width == 640)
        #expect(manifest.nativeRaster.height == 360)
        #expect(manifest.nativeRaster.rowBytes == 2_560)
        #expect(manifest.encodedRaster.width == 360)
        #expect(manifest.encodedRaster.height == 640)
        #expect(manifest.nativeIntrinsics == .init(
            fx: 512.5,
            fy: 509.25,
            cx: 301.25,
            cy: 154.75,
            imageWidth: 640,
            imageHeight: 360
        ))
        #expect(manifest.expectedEncodedIntrinsics == .init(
            fx: 509.25,
            fy: 512.5,
            cx: 205.25,
            cy: 301.25,
            imageWidth: 360,
            imageHeight: 640
        ))
        #expect(manifest.markers.count == 6)
        #expect(manifest.markers.filter { $0.role == "corner" }.count == 4)
        #expect(manifest.markers.filter { $0.role == "off-centre-fiducial" }.count == 2)

        let nativeData = try Data(contentsOf: output.nativeRasterURL)
        let heicData = try Data(contentsOf: output.heicURL)
        #expect(FieldRasterEncoder.heicQuality == 0.75)
        #expect(manifest.nativeRaster.sha256
                == "6e9dea45e81d4905a912e8921221fa82b074b834f8efe76cc419ae3e82176690")
        #expect(manifest.nativeRaster.sha256 == BundleChecksum.sha256(of: nativeData))
        #expect(manifest.encodedRaster.sha256 == BundleChecksum.sha256(of: heicData))
        #expect(output.manifestSHA256 == BundleChecksum.sha256(of: manifestData))
    }

    @Test func productionPipelinePhysicallyRotatesEveryAsymmetricMarkerClockwise() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let output = try FieldRasterFixtureExporter.export(to: directory)
        let image = try #require(decodedImage(at: output.heicURL))
        #expect(image.width == output.manifest.encodedRaster.width)
        #expect(image.height == output.manifest.encodedRaster.height)

        let rgba = try normalizedRGBA(image)
        for marker in output.manifest.markers {
            let actual = averageColor(
                rgba,
                width: image.width,
                height: image.height,
                around: marker.expectedEncodedCoordinate,
                radius: 2
            )
            let expected = try rgbaBytes(marker.rgbaHex)
            #expect(abs(Int(actual.r) - Int(expected.r)) <= 48, "red mismatch for \(marker.id)")
            #expect(abs(Int(actual.g) - Int(expected.g)) <= 48, "green mismatch for \(marker.id)")
            #expect(abs(Int(actual.b) - Int(expected.b)) <= 48, "blue mismatch for \(marker.id)")
        }
    }

    @Test func fixtureDefinitionAndEncodingAreRepeatableWithinOneRuntime() throws {
        let firstDirectory = try temporaryDirectory()
        let secondDirectory = try temporaryDirectory()
        defer {
            try? FileManager.default.removeItem(at: firstDirectory)
            try? FileManager.default.removeItem(at: secondDirectory)
        }

        let first = try FieldRasterFixtureExporter.export(to: firstDirectory)
        let second = try FieldRasterFixtureExporter.export(to: secondDirectory)
        #expect(first.manifest == second.manifest)
        #expect(try Data(contentsOf: first.nativeRasterURL) == Data(contentsOf: second.nativeRasterURL))
        #expect(try Data(contentsOf: first.heicURL) == Data(contentsOf: second.heicURL))
        #expect(try Data(contentsOf: first.manifestURL) == Data(contentsOf: second.manifestURL))
    }

    private struct RGBA {
        let r: UInt8
        let g: UInt8
        let b: UInt8
        let a: UInt8
    }

    private func temporaryDirectory() throws -> URL {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    private func decodedImage(at url: URL) -> CGImage? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(source, 0, nil)
    }

    private func normalizedRGBA(_ image: CGImage) throws -> [UInt8] {
        let width = image.width
        let height = image.height
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        let rendered = bytes.withUnsafeMutableBytes { storage -> Bool in
            guard let base = storage.baseAddress,
                  let context = CGContext(
                    data: base,
                    width: width,
                    height: height,
                    bitsPerComponent: 8,
                    bytesPerRow: width * 4,
                    space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
                  ) else {
                return false
            }
            context.interpolationQuality = .none
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        guard rendered else { throw FieldRasterFixtureError.pixelBufferBaseAddress }
        return bytes
    }

    private func averageColor(
        _ bytes: [UInt8],
        width: Int,
        height: Int,
        around point: FieldRasterFixtureExporter.Point,
        radius: Int
    ) -> RGBA {
        var r = 0, g = 0, b = 0, a = 0, samples = 0
        for y in max(0, point.y - radius)...min(height - 1, point.y + radius) {
            for x in max(0, point.x - radius)...min(width - 1, point.x + radius) {
                let offset = ((y * width) + x) * 4
                r += Int(bytes[offset])
                g += Int(bytes[offset + 1])
                b += Int(bytes[offset + 2])
                a += Int(bytes[offset + 3])
                samples += 1
            }
        }
        return RGBA(
            r: UInt8(r / samples),
            g: UInt8(g / samples),
            b: UInt8(b / samples),
            a: UInt8(a / samples)
        )
    }

    private func rgbaBytes(_ hex: String) throws -> RGBA {
        let value = try #require(UInt32(hex.dropFirst(), radix: 16))
        return RGBA(
            r: UInt8((value >> 24) & 0xFF),
            g: UInt8((value >> 16) & 0xFF),
            b: UInt8((value >> 8) & 0xFF),
            a: UInt8(value & 0xFF)
        )
    }
}

#endif

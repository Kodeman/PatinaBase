//  FieldRasterEncoder.swift
//  CaptureKit
//
//  The single Field keyframe raster contract. Production capture and the
//  physical-device qualification fixture both pass through this exact path.

import CoreGraphics
import CoreImage
import CoreVideo
import Foundation
import ImageIO
import UniformTypeIdentifiers

public struct FieldEncodedRaster: Equatable {
    public let data: Data
    public let width: Int
    public let height: Int

    public init(data: Data, width: Int, height: Int) {
        self.data = data
        self.width = width
        self.height = height
    }
}

public enum FieldRasterEncoder {
    /// Locked to the production keyframe quality used by the Field v3 bundle.
    public static let heicQuality: CGFloat = 0.75

    /// Exact production raster path: native CVPixelBuffer -> Core Image clockwise
    /// orientation -> physical CGImage raster -> lossy HEIC bytes.
    public static func encodeHEIC(
        pixelBuffer: CVPixelBuffer,
        using ciContext: CIContext
    ) -> FieldEncodedRaster? {
        let ciImage = CIImage(cvPixelBuffer: pixelBuffer).oriented(.right)
        guard let cgImage = ciContext.createCGImage(ciImage, from: ciImage.extent),
              let data = encodeHEIC(cgImage) else {
            return nil
        }
        return FieldEncodedRaster(data: data, width: cgImage.width, height: cgImage.height)
    }

    private static func encodeHEIC(_ cgImage: CGImage) -> Data? {
        let mutable = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(
            mutable,
            UTType.heic.identifier as CFString,
            1,
            nil
        ) else {
            return nil
        }
        let options: [CFString: Any] = [
            kCGImageDestinationLossyCompressionQuality: heicQuality
        ]
        CGImageDestinationAddImage(destination, cgImage, options as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return mutable as Data
    }
}

//  DepthBinEncoder.swift
//  Capture · Wave F (Pro site-scan) · Field Capture P1 · item 3/4
//
//  The single CVPixelBuffer → `.bin` depth encoder, shared by BOTH the item-3 depth
//  STREAM recorder (`FieldDepthRecorder`, ~1 Hz over the whole scan) and the item-4
//  KEYFRAME recorder (`FieldKeyframeRecorder`, one depth sidecar per sharp
//  keyframe). One implementation, one wire contract — the header is `DepthBinFormat`
//  (CaptureKit), so a server reader parses both lanes identically (guidance #4: "no
//  format fork"). Pure functions over CVPixelBuffers; the header magic/version/flags
//  live in CaptureKit and are unit-tested there.
//
//  `.bin` layout (little-endian): see `DepthBinFormat`. `hasConfidence` in the
//  returned value is derived from whether a confidence plane was ACTUALLY packed
//  (nil on a resolution mismatch), so a caller's index field and the header flag can
//  never disagree (the I2 lockstep, preserved by construction here).

import Foundation

#if canImport(ARKit)
import CoreVideo
import CaptureKit

enum DepthBinEncoder {

    struct Encoded {
        let data: Data
        let hasConfidence: Bool
        let width: Int
        let height: Int
    }

    /// Pack a depth map (+ optional confidence) into the `.bin` byte layout.
    /// Returns nil only if the depth map has no base address / zero size.
    static func encode(depthMap: CVPixelBuffer, confidenceMap: CVPixelBuffer?, smoothed: Bool) -> Encoded? {
        let width = CVPixelBufferGetWidth(depthMap)
        let height = CVPixelBufferGetHeight(depthMap)
        guard width > 0, height > 0, let depthPlane = packDepth(depthMap, width: width, height: height) else {
            return nil
        }
        let confPlane = confidenceMap.flatMap { packConfidence($0, width: width, height: height) }

        var data = Data()
        data.append(contentsOf: Array(DepthBinFormat.magic.utf8))
        appendLE(&data, DepthBinFormat.version)
        appendLE(&data, DepthBinFormat.flags(smoothed: smoothed, hasConfidence: confPlane != nil))
        appendLE(&data, UInt32(width))
        appendLE(&data, UInt32(height))
        depthPlane.withUnsafeBytes { data.append(contentsOf: $0) }
        if let confPlane { data.append(contentsOf: confPlane) }

        return Encoded(data: data, hasConfidence: confPlane != nil, width: width, height: height)
    }

    // MARK: - Plane packing

    /// Depth plane (Float32 metres) → row-major UInt16 millimetres.
    private static func packDepth(_ depthMap: CVPixelBuffer, width: Int, height: Int) -> [UInt16]? {
        CVPixelBufferLockBaseAddress(depthMap, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(depthMap, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(depthMap) else { return nil }
        let stride = CVPixelBufferGetBytesPerRow(depthMap)
        var out = [UInt16](repeating: 0, count: width * height)
        for y in 0..<height {
            let row = base.advanced(by: y * stride).assumingMemoryBound(to: Float32.self)
            for x in 0..<width { out[y * width + x] = millimetres(row[x]) }
        }
        return out
    }

    /// Metres → clamped UInt16 millimetres (0 = invalid/NaN/≤0; cap at ~65.5 m).
    private static func millimetres(_ meters: Float) -> UInt16 {
        let mm = meters * 1000.0
        if mm.isNaN || mm <= 0 { return 0 }
        if mm >= Float(UInt16.max) { return .max }
        return UInt16(mm)
    }

    /// Confidence plane (UInt8 ARConfidenceLevel raw) → row-major UInt8, or nil if
    /// its resolution doesn't match the depth plane.
    private static func packConfidence(_ confidenceMap: CVPixelBuffer, width: Int, height: Int) -> [UInt8]? {
        CVPixelBufferLockBaseAddress(confidenceMap, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(confidenceMap, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(confidenceMap),
              CVPixelBufferGetWidth(confidenceMap) == width,
              CVPixelBufferGetHeight(confidenceMap) == height else { return nil }
        let stride = CVPixelBufferGetBytesPerRow(confidenceMap)
        var out = [UInt8](repeating: 0, count: width * height)
        for y in 0..<height {
            let row = base.advanced(by: y * stride).assumingMemoryBound(to: UInt8.self)
            for x in 0..<width { out[y * width + x] = row[x] }
        }
        return out
    }

    private static func appendLE(_ data: inout Data, _ value: UInt16) {
        withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) }
    }
    private static func appendLE(_ data: inout Data, _ value: UInt32) {
        withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) }
    }
}
#endif

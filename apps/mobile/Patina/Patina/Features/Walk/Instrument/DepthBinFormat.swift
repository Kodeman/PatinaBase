//
//  DepthBinFormat.swift
//  Patina
//
//  PORTED FROM Patina Field:
//    - apps/mobile/Capture/CaptureKit/CaptureKit/SiteScan/DepthBinFormat.swift
//      (magic / version / flag bits — carried verbatim)
//    - apps/mobile/Capture/Capture/Features/SiteScan/DepthBinEncoder.swift
//      (the byte layout + the metres→millimetres quantization — see
//      `DepthBinEncoder` below; the CVPixelBuffer access did NOT come across)
//
//  The wire contract for the depth `.bin` file's fixed header. Pure Foundation, no
//  ARKit/CoreVideo — so an on-device writer and any future reader share ONE
//  definition of the magic/version/flags, and the flag byte is unit-testable.
//
//  Header layout (little-endian), followed by the depth + optional confidence planes:
//    magic   : 4 bytes  "PFD1"
//    version : UInt16   = 1
//    flags   : UInt16   bit0 = smoothed source, bit1 = confidence plane present
//    width   : UInt32
//    height  : UInt32
//
//  The `flags` field is the single source of truth for whether a confidence plane
//  follows; the writer derives BOTH this flag AND the index NDJSON's
//  `hasConfidence` field from the same packed-plane result, so they can never
//  disagree (a resolution-mismatched confidence map drops the plane AND clears the
//  flag AND clears the index field in lockstep).
//
//  ISOLATION: `nonisolated` — see the note in `KeyframeGate.swift`.
//

import Foundation

nonisolated public enum DepthBinFormat {

    /// File magic ("Patina Field Depth v1"). Kept as "PFD1" verbatim: the
    /// scan-pipeline reader parses both apps' bins with one parser, so forking the
    /// magic for the client app would fork the format.
    public static let magic = "PFD1"
    /// Header version.
    public static let version: UInt16 = 1
    /// Depth was sourced from `smoothedSceneDepth` (vs plain `sceneDepth`).
    public static let smoothedFlag: UInt16 = 0x0001
    /// A confidence plane follows the depth plane.
    public static let confidenceFlag: UInt16 = 0x0002
    /// Bytes in the fixed header: 4 magic + 2 version + 2 flags + 4 width + 4 height.
    public static let headerByteCount = 16

    /// Compose the header flag field. `hasConfidence` MUST be derived from whether a
    /// confidence plane was actually packed (not merely whether the source map was
    /// present), so the flag and the index field stay in lockstep.
    public static func flags(smoothed: Bool, hasConfidence: Bool) -> UInt16 {
        var value: UInt16 = 0
        if smoothed { value |= DepthBinFormat.smoothedFlag }
        if hasConfidence { value |= DepthBinFormat.confidenceFlag }
        return value
    }
}

// MARK: - Pure encoder

/// The pure half of Field's `DepthBinEncoder` (app target, `#if canImport(ARKit)`).
///
/// Field's encoder locks two `CVPixelBuffer`s, walks them by `bytesPerRow`, and
/// packs the result. The buffer access CANNOT be expressed without CoreVideo and
/// stays in the later wiring wave. What lives here is everything downstream of the
/// pixel read: the metres→UInt16-millimetre quantization (including its NaN/≤0 and
/// overflow clamps), the confidence-plane resolution check, and the exact
/// little-endian byte layout.
nonisolated public enum DepthBinEncoder {

    /// One encoded depth `.bin` payload.
    public struct Encoded: Sendable, Equatable {
        public let data: Data
        /// TRUE only when a confidence plane was actually packed — this is the value
        /// callers must mirror into the index NDJSON's `hasConfidence`.
        public let hasConfidence: Bool
        public let width: Int
        public let height: Int

        public init(data: Data, hasConfidence: Bool, width: Int, height: Int) {
            self.data = data
            self.hasConfidence = hasConfidence
            self.width = width
            self.height = height
        }
    }

    /// Metres → clamped UInt16 millimetres (0 = invalid/NaN/≤0; cap at ~65.5 m).
    /// Carried verbatim from DepthBinEncoder.swift lines 71–76.
    public static func millimetres(_ meters: Float) -> UInt16 {
        let millis = meters * 1000.0
        if millis.isNaN || millis <= 0 { return 0 }
        if millis >= Float(UInt16.max) { return .max }
        return UInt16(millis)
    }

    /// Quantize a row-major Float32 depth plane (metres) to row-major UInt16
    /// millimetres. `nil` for a zero-size or undersized plane.
    public static func packDepth(depthMeters: [Float], width: Int, height: Int) -> [UInt16]? {
        guard width > 0, height > 0, depthMeters.count >= width * height else { return nil }
        var out = [UInt16](repeating: 0, count: width * height)
        for index in 0..<(width * height) {
            out[index] = DepthBinEncoder.millimetres(depthMeters[index])
        }
        return out
    }

    /// Assemble the `.bin` bytes. `confidence` is dropped (and the header flag
    /// cleared) when its element count does not match the depth plane — the same
    /// resolution-mismatch rule Field applies against the CVPixelBuffer dimensions,
    /// preserving the flag/index lockstep by construction.
    /// Returns `nil` only when the depth plane is empty or undersized.
    public static func encode(depthMeters: [Float],
                              confidence: [UInt8]?,
                              width: Int,
                              height: Int,
                              smoothed: Bool) -> Encoded? {
        guard let depthPlane = DepthBinEncoder.packDepth(depthMeters: depthMeters,
                                                         width: width,
                                                         height: height) else { return nil }
        let confidencePlane: [UInt8]? = {
            guard let confidence, confidence.count == width * height else { return nil }
            return confidence
        }()

        var data = Data()
        data.append(contentsOf: Array(DepthBinFormat.magic.utf8))
        DepthBinEncoder.appendLE(&data, DepthBinFormat.version)
        DepthBinEncoder.appendLE(&data, DepthBinFormat.flags(smoothed: smoothed,
                                                             hasConfidence: confidencePlane != nil))
        DepthBinEncoder.appendLE(&data, UInt32(width))
        DepthBinEncoder.appendLE(&data, UInt32(height))
        depthPlane.withUnsafeBytes { data.append(contentsOf: $0) }
        if let confidencePlane { data.append(contentsOf: confidencePlane) }

        return Encoded(data: data,
                       hasConfidence: confidencePlane != nil,
                       width: width,
                       height: height)
    }

    private static func appendLE(_ data: inout Data, _ value: UInt16) {
        withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) }
    }

    private static func appendLE(_ data: inout Data, _ value: UInt32) {
        withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) }
    }
}

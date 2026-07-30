//
//  InstrumentDepthBinTests.swift
//  PatinaTests
//
//  Pins the depth `.bin` wire contract ported from Patina Field
//  (CaptureKit/SiteScan/DepthBinFormat.swift + Capture/Features/SiteScan/
//  DepthBinEncoder.swift). The scan-pipeline reader parses BOTH apps' bins with one
//  parser, so every byte asserted here is a cross-repo contract, not an internal
//  detail.
//

import Testing
import Foundation
@testable import Patina

struct InstrumentDepthBinTests {

    // MARK: - Header constants

    @Test
    func headerConstantsAreCarriedAcrossByValue() {
        #expect(DepthBinFormat.magic == "PFD1")
        #expect(DepthBinFormat.version == 1)
        #expect(DepthBinFormat.smoothedFlag == 0x0001)
        #expect(DepthBinFormat.confidenceFlag == 0x0002)
        #expect(DepthBinFormat.headerByteCount == 16)
    }

    @Test
    func flagBitsCoverTheFullMatrix() {
        #expect(DepthBinFormat.flags(smoothed: false, hasConfidence: false) == 0x0000)
        #expect(DepthBinFormat.flags(smoothed: true, hasConfidence: false) == 0x0001)
        #expect(DepthBinFormat.flags(smoothed: false, hasConfidence: true) == 0x0002)
        #expect(DepthBinFormat.flags(smoothed: true, hasConfidence: true) == 0x0003)
    }

    // MARK: - Metre → millimetre quantization

    @Test
    func millimetreQuantizationIsPinnedIncludingItsClamps() {
        #expect(DepthBinEncoder.millimetres(1.0) == 1000)
        #expect(DepthBinEncoder.millimetres(0.5) == 500)
        #expect(DepthBinEncoder.millimetres(2.5) == 2500)
        // Truncation, not rounding: 1.2349 m ⇒ 1234 mm.
        #expect(DepthBinEncoder.millimetres(1.2349) == 1234)
        // 0 is the INVALID sentinel — zero, negative and NaN all collapse to it.
        #expect(DepthBinEncoder.millimetres(0) == 0)
        #expect(DepthBinEncoder.millimetres(-3.2) == 0)
        #expect(DepthBinEncoder.millimetres(.nan) == 0)
        // Saturates rather than overflowing at ~65.5 m.
        #expect(DepthBinEncoder.millimetres(100.0) == UInt16.max)
        #expect(DepthBinEncoder.millimetres(.infinity) == UInt16.max)
    }

    // MARK: - Byte layout

    @Test
    func encodedHeaderMatchesTheLittleEndianLayout() {
        let depth = [Float](repeating: 2.0, count: 6)   // 3×2, all 2000 mm
        guard let encoded = DepthBinEncoder.encode(depthMeters: depth, confidence: nil,
                                                   width: 3, height: 2, smoothed: true) else {
            Issue.record("encode returned nil for a valid plane")
            return
        }
        let bytes = [UInt8](encoded.data)
        #expect(bytes.count == 16 + 3 * 2 * 2)          // header + UInt16 depth plane
        #expect(Array(bytes[0..<4]) == Array("PFD1".utf8))
        #expect(Array(bytes[4..<6]) == [0x01, 0x00])     // version 1, LE
        #expect(Array(bytes[6..<8]) == [0x01, 0x00])     // flags: smoothed only
        #expect(Array(bytes[8..<12]) == [0x03, 0x00, 0x00, 0x00])   // width 3, LE
        #expect(Array(bytes[12..<16]) == [0x02, 0x00, 0x00, 0x00])  // height 2, LE
        // First depth sample: 2000 mm = 0x07D0 little-endian.
        #expect(Array(bytes[16..<18]) == [0xD0, 0x07])
        #expect(encoded.hasConfidence == false)
        #expect(encoded.width == 3)
        #expect(encoded.height == 2)
    }

    @Test
    func aConfidencePlaneAppendsAfterTheDepthPlaneAndSetsTheFlag() {
        let depth = [Float](repeating: 1.0, count: 4)
        let confidence: [UInt8] = [0, 1, 2, 1]
        guard let encoded = DepthBinEncoder.encode(depthMeters: depth, confidence: confidence,
                                                   width: 2, height: 2, smoothed: false) else {
            Issue.record("encode returned nil for a valid plane")
            return
        }
        let bytes = [UInt8](encoded.data)
        #expect(bytes.count == 16 + 4 * 2 + 4)
        #expect(Array(bytes[6..<8]) == [0x02, 0x00])     // confidence flag only
        #expect(Array(bytes.suffix(4)) == confidence)
        #expect(encoded.hasConfidence)
    }

    @Test
    func aMismatchedConfidencePlaneIsDroppedAndTheFlagIsClearedInLockstep() {
        // The whole point of the I2 lockstep: the header flag and the value callers
        // mirror into the index NDJSON must never disagree.
        let depth = [Float](repeating: 1.0, count: 4)
        let wrongSize: [UInt8] = [0, 1, 2]               // 3 ≠ 2×2
        guard let encoded = DepthBinEncoder.encode(depthMeters: depth, confidence: wrongSize,
                                                   width: 2, height: 2, smoothed: true) else {
            Issue.record("encode returned nil for a valid plane")
            return
        }
        let bytes = [UInt8](encoded.data)
        #expect(encoded.hasConfidence == false)
        #expect(Array(bytes[6..<8]) == [0x01, 0x00])     // smoothed only — no bit1
        #expect(bytes.count == 16 + 4 * 2)               // no trailing plane
    }

    @Test
    func packDepthQuantizesEveryElement() {
        let packed = DepthBinEncoder.packDepth(depthMeters: [0.001, 1.5, -1, .nan],
                                               width: 2, height: 2)
        #expect(packed == [1, 1500, 0, 0])
    }

    @Test
    func encodeRejectsAnEmptyOrUndersizedPlane() {
        #expect(DepthBinEncoder.encode(depthMeters: [], confidence: nil,
                                       width: 0, height: 0, smoothed: false) == nil)
        #expect(DepthBinEncoder.encode(depthMeters: [1.0, 2.0], confidence: nil,
                                       width: 3, height: 3, smoothed: false) == nil)
    }
}

//  AnchorTests.swift
//  CaptureTests
//
//  Pure-logic contracts for typed anchor entry (Field Capture P1 · item 6): the
//  ft-in → mm parser grammar, the UNVERIFIED soft-gate rule, span-kind
//  auto-classification, and the AnchorRecord Codable shape (pins anchors.json /
//  scan_anchors). No ARKit — CaptureTests → CaptureKit seam.

import Foundation
import Testing
@testable import CaptureKit

struct AnchorTests {

    // MARK: - Measurement parser (ft-in grammar → integer mm)

    @Test func parsesFeetInchesGrammar() {
        #expect(AnchorMeasurementParser.parseMillimetres("12'") == 3658)          // 12 ft
        #expect(AnchorMeasurementParser.parseMillimetres("10' 6\"") == 3200)      // ft + in
        #expect(AnchorMeasurementParser.parseMillimetres("42\"") == 1067)         // inches only
        #expect(AnchorMeasurementParser.parseMillimetres("3.5") == 1067)          // bare ⇒ decimal feet
        #expect(AnchorMeasurementParser.parseMillimetres("3 1/2\"") == 89)        // whole + fraction inches
        #expect(AnchorMeasurementParser.parseMillimetres("1/2\"") == 13)          // fraction inches
    }

    @Test func acceptsSmartQuotesFromKeyboard() {
        // iOS smart-punctuation turns 13' 2" into 13’ 2” (curly) — must parse the same.
        #expect(AnchorMeasurementParser.parseMillimetres("13\u{2019} 2\u{201D}")
                == AnchorMeasurementParser.parseMillimetres("13' 2\""))
        #expect(AnchorMeasurementParser.parseMillimetres("13\u{2019} 2\u{201D}") == 4013)
        // Prime / double-prime marks too.
        #expect(AnchorMeasurementParser.parseMillimetres("8\u{2032} 6\u{2033}")
                == AnchorMeasurementParser.parseMillimetres("8' 6\""))
    }

    @Test func rejectsUnparseableOrNonPositive() {
        #expect(AnchorMeasurementParser.parseMillimetres("") == nil)
        #expect(AnchorMeasurementParser.parseMillimetres("   ") == nil)
        #expect(AnchorMeasurementParser.parseMillimetres("abc") == nil)
        #expect(AnchorMeasurementParser.parseMillimetres("0") == nil)             // mm 0 → nil
        #expect(AnchorMeasurementParser.parseMillimetres("12' x\"") == nil)
    }

    // MARK: - Soft gate + span classification

    @Test func unverifiedBelowThreeAnchors() {
        #expect(AnchorGate.requiredAnchors == 3)
        #expect(AnchorGate.isUnverified(anchorCount: 0))
        #expect(AnchorGate.isUnverified(anchorCount: 2))
        #expect(!AnchorGate.isUnverified(anchorCount: 3))
        #expect(!AnchorGate.isUnverified(anchorCount: 5))
    }

    @Test func spanKindAutoClassification() {
        // Horizontal run → span.
        #expect(AnchorGate.autoSpanKind(dx: 4, dy: 0.02, dz: 0) == .span)
        // Vertical ceiling height → height.
        #expect(AnchorGate.autoSpanKind(dx: 0.02, dy: 2.4, dz: 0.02) == .height)
        // Diagonal that is mostly horizontal → span.
        #expect(AnchorGate.autoSpanKind(dx: 3, dy: 1, dz: 3) == .span)
    }

    // MARK: - AnchorRecord Codable shape (pins anchors.json / scan_anchors)

    @Test func anchorRecordRoundTripAndKeyShape() throws {
        let record = AnchorRecord(
            id: "aaaaaaaa-0000-0000-0000-000000000001", index: 0, label: "north wall run",
            spanKind: .span, entryMethod: .typed,
            endpointA: .init(x: 0.021, y: 0.004, z: -1.883),
            endpointB: .init(x: 4.402, y: 0.006, z: -1.871),
            modelSpanMeters: 4.381, measuredValueMm: 4394)

        let data = try JSONEncoder().encode(record)
        #expect(try JSONDecoder().decode(AnchorRecord.self, from: data) == record)

        let dict = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(Set(dict.keys) == Set([
            "id", "index", "label", "spanKind", "entryMethod",
            "endpointA", "endpointB", "modelSpanMeters", "measuredValueMm"
        ]))
        #expect(dict["spanKind"] as? String == "span")
        #expect(dict["entryMethod"] as? String == "typed")
        #expect(dict["measuredValueMm"] as? Int == 4394)
        let a = try #require(dict["endpointA"] as? [String: Any])
        #expect(Set(a.keys) == Set(["x", "y", "z"]))
    }

    @Test func anchorArrayRoundTripsForSidecar() throws {
        let a = AnchorRecord(id: "1", index: 0, label: "a", spanKind: .span, entryMethod: .typed,
                             endpointA: .init(x: 0, y: 0, z: 0), endpointB: .init(x: 1, y: 0, z: 0),
                             modelSpanMeters: 1, measuredValueMm: 1000)
        let b = AnchorRecord(id: "2", index: 1, label: "b", spanKind: .height, entryMethod: .typed,
                             endpointA: .init(x: 0, y: 0, z: 0), endpointB: .init(x: 0, y: 2.4, z: 0),
                             modelSpanMeters: 2.4, measuredValueMm: 2440)
        let data = try JSONEncoder().encode([a, b])
        #expect(try JSONDecoder().decode([AnchorRecord].self, from: data) == [a, b])
    }
}

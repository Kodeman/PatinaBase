//
//  InstrumentAnchorTests.swift
//  PatinaTests
//
//  Pins the anchor lane ported from Patina Field (CaptureKit/SiteScan/
//  AnchorRecord.swift, AnchorGate.swift, AnchorMeasurementParser.swift).
//
//  The `client_anchor_id` casing test is the load-bearing one: the id is a
//  server-side idempotency key stored as an opaque lowercased string, and Swift's
//  `UUID.uuidString` is UPPERCASE — so a round-trip through `UUID` anywhere in the
//  chain turns a retry into a duplicate row.
//

import Testing
import Foundation
@testable import Patina

struct InstrumentAnchorRecordTests {

    private static func record(id: String = AnchorRecord.newClientAnchorID(),
                               index: Int = 0,
                               spanKind: AnchorRecord.SpanKind = .span,
                               modelSpanMeters: Double = 3.4,
                               measuredValueMm: Int = 3400) -> AnchorRecord {
        AnchorRecord(id: id, index: index, label: "north wall run",
                     spanKind: spanKind, entryMethod: .typed,
                     endpointA: .init(x: 0, y: 0, z: 0),
                     endpointB: .init(x: 3.4, y: 0, z: 0),
                     modelSpanMeters: modelSpanMeters,
                     measuredValueMm: measuredValueMm)
    }

    // MARK: - The idempotency key

    @Test
    func mintedClientAnchorIdsAreLowercasedUuids() {
        for _ in 0..<32 {
            let id = AnchorRecord.newClientAnchorID()
            #expect(id == id.lowercased())
            #expect(id.count == 36)
            // Still a well-formed UUID — lowercasing must not have mangled it.
            #expect(UUID(uuidString: id) != nil)
        }
    }

    @Test
    func aUuidRoundTripWouldBreakIdempotency() {
        // This is the trap the `String` id exists to avoid: `UUID.uuidString` is
        // uppercase, so re-deriving the key upper-cases it and the server sees a
        // NEW anchor instead of a retry of the same one.
        let minted = AnchorRecord.newClientAnchorID()
        let roundTripped = UUID(uuidString: minted)?.uuidString
        #expect(roundTripped != nil)
        #expect(roundTripped != minted)                      // the silent break
        #expect(roundTripped == minted.uppercased())         // …and exactly how
    }

    @Test
    func mintedIdsAreDistinct() {
        let ids = Set((0..<64).map { _ in AnchorRecord.newClientAnchorID() })
        #expect(ids.count == 64)
    }

    // MARK: - Codable shape (capture-bundle spec §3.3 / scan_anchors)

    @Test
    func encodedKeysMatchTheBundleSpec() throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(Self.record(id: "abc-123", index: 2, spanKind: .height))
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            Issue.record("anchor did not encode to a JSON object")
            return
        }
        #expect(Set(object.keys) == [
            "id", "index", "label", "spanKind", "entryMethod",
            "endpointA", "endpointB", "modelSpanMeters", "measuredValueMm"
        ])
        #expect(object["spanKind"] as? String == "height")
        #expect(object["entryMethod"] as? String == "typed")
        #expect(object["id"] as? String == "abc-123")
        guard let endpointB = object["endpointB"] as? [String: Any] else {
            Issue.record("endpointB did not encode to a JSON object")
            return
        }
        #expect(Set(endpointB.keys) == ["x", "y", "z"])
    }

    @Test
    func recordSurvivesARoundTripWithItsCasingIntact() throws {
        let original = Self.record(id: "a1b2c3d4-0000-4000-8000-abcdefabcdef")
        let decoded = try JSONDecoder().decode(AnchorRecord.self,
                                               from: JSONEncoder().encode(original))
        #expect(decoded == original)
        #expect(decoded.id == decoded.id.lowercased())
    }

    @Test
    func spanKindRawValuesAreWireContracts() {
        #expect(AnchorRecord.SpanKind.span.rawValue == "span")
        #expect(AnchorRecord.SpanKind.height.rawValue == "height")
        #expect(AnchorRecord.EntryMethod.typed.rawValue == "typed")
    }
}

// MARK: - Gate + coach

struct InstrumentAnchorGateTests {

    private static func anchor(spanKind: AnchorRecord.SpanKind,
                               modelSpanMeters: Double) -> AnchorRecord {
        AnchorRecord(id: AnchorRecord.newClientAnchorID(), index: 0, label: "x",
                     spanKind: spanKind, entryMethod: .typed,
                     endpointA: .init(x: 0, y: 0, z: 0),
                     endpointB: .init(x: modelSpanMeters, y: 0, z: 0),
                     modelSpanMeters: modelSpanMeters, measuredValueMm: 1000)
    }

    @Test
    func unverifiedRuleIsThreeAnchors() {
        #expect(AnchorGate.requiredAnchors == 3)
        #expect(AnchorGate.isUnverified(anchorCount: 0))
        #expect(AnchorGate.isUnverified(anchorCount: 2))
        #expect(!AnchorGate.isUnverified(anchorCount: 3))
        #expect(!AnchorGate.isUnverified(anchorCount: 9))
    }

    @Test
    func spanKindFollowsTheDominantAxis() {
        // Mostly vertical ⇒ ceiling height.
        #expect(AnchorGate.autoSpanKind(dx: 0.1, dy: 2.4, dz: 0.1) == .height)
        // Mostly horizontal ⇒ span (including a diagonal across two axes).
        #expect(AnchorGate.autoSpanKind(dx: 3.0, dy: 0.2, dz: 0.0) == .span)
        #expect(AnchorGate.autoSpanKind(dx: 2.0, dy: 0.0, dz: 2.0) == .span)
        // Sign-independent.
        #expect(AnchorGate.autoSpanKind(dx: 0, dy: -2.4, dz: 0) == .height)
        // Exactly equal ⇒ span (the comparison is strictly `>`).
        #expect(AnchorGate.autoSpanKind(dx: 1.0, dy: 1.0, dz: 0.0) == .span)
    }

    @Test
    func coachConstantsAreCarriedAcrossByValue() {
        #expect(AnchorCoach.shortSpanCeilingMeters == 2.5)
        #expect(AnchorCoach.halfRoomFraction == 0.5)
        #expect(AnchorCoach.targetLongSpans == 2)
        #expect(AnchorCoach.targetHeights == 1)
    }

    @Test
    func spanLengthUsesTheAbsoluteFloorWhenTheRoomIsUnknown() {
        #expect(AnchorCoach.classifySpan(lengthMeters: 2.49,
                                         roomLargerPlanDimensionMeters: nil) == .short)
        // Exactly 2.5 m classifies LONG — the boundary is exclusive.
        #expect(AnchorCoach.classifySpan(lengthMeters: 2.5,
                                         roomLargerPlanDimensionMeters: nil) == .long)
    }

    @Test
    func spanLengthAlsoAppliesTheHalfRoomFloor() {
        // A 3 m span in an 8 m room is under half the room ⇒ SHORT despite clearing
        // the absolute floor.
        #expect(AnchorCoach.classifySpan(lengthMeters: 3.0,
                                         roomLargerPlanDimensionMeters: 8.0) == .short)
        // Exactly half ⇒ LONG (exclusive boundary again).
        #expect(AnchorCoach.classifySpan(lengthMeters: 4.0,
                                         roomLargerPlanDimensionMeters: 8.0) == .long)
        // A non-positive room dimension falls back to the absolute floor alone.
        #expect(AnchorCoach.classifySpan(lengthMeters: 3.0,
                                         roomLargerPlanDimensionMeters: 0) == .long)
    }

    @Test
    func summariseCountsLongSpansAndHeightsOnly() {
        let anchors = [
            Self.anchor(spanKind: .span, modelSpanMeters: 1.0),    // short — counts for neither
            Self.anchor(spanKind: .span, modelSpanMeters: 4.2),    // long
            Self.anchor(spanKind: .span, modelSpanMeters: 5.0),    // long
            Self.anchor(spanKind: .height, modelSpanMeters: 2.4)   // height (never "short")
        ]
        let progress = AnchorCoach.summarize(anchors: anchors, roomLargerPlanDimensionMeters: nil)
        #expect(progress == AnchorCoach.Progress(longSpanCount: 2, heightCount: 1))
        #expect(progress.meetsRecipe)
    }

    @Test
    func aShortHeightStillCountsAsAHeight() {
        // A 1.0 m `.height` is below the short-span floor but heights are exempt.
        let progress = AnchorCoach.summarize(
            anchors: [Self.anchor(spanKind: .height, modelSpanMeters: 1.0)],
            roomLargerPlanDimensionMeters: 12.0)
        #expect(progress.heightCount == 1)
        #expect(progress.longSpanCount == 0)
    }

    @Test
    func nextStepAndRecipeStepWalkTheRecipe() {
        let none = AnchorCoach.Progress(longSpanCount: 0, heightCount: 0)
        let oneLong = AnchorCoach.Progress(longSpanCount: 1, heightCount: 0)
        let twoLong = AnchorCoach.Progress(longSpanCount: 2, heightCount: 0)
        let done = AnchorCoach.Progress(longSpanCount: 2, heightCount: 1)

        #expect(AnchorCoach.nextStep(for: none) == .addLongSpan)
        #expect(AnchorCoach.nextStep(for: oneLong) == .addLongSpan)
        #expect(AnchorCoach.nextStep(for: twoLong) == .addHeight)
        #expect(AnchorCoach.nextStep(for: done) == .complete)

        #expect(AnchorCoach.recipeStep(for: none) == 1)
        #expect(AnchorCoach.recipeStep(for: oneLong) == 2)
        #expect(AnchorCoach.recipeStep(for: twoLong) == 3)
        #expect(AnchorCoach.recipeStep(for: done) == 3)
        // Over-capture stays capped at 3 rather than reading "anchor 7 of 3".
        #expect(AnchorCoach.recipeStep(for: AnchorCoach.Progress(longSpanCount: 5, heightCount: 4)) == 3)

        #expect(!none.meetsRecipe)
        #expect(!twoLong.meetsRecipe)
        #expect(done.meetsRecipe)
    }
}

// MARK: - Measurement parsing

struct InstrumentAnchorMeasurementParserTests {

    @Test
    func feetAndInchesParseToExactMillimetres() {
        // 12 ft 3½ in = 12×304.8 + 3.5×25.4 = 3746.5 ⇒ 3747 (round half away from zero).
        #expect(AnchorMeasurementParser.parseMillimetres("12' 3 1/2\"") == 3747)
        #expect(AnchorMeasurementParser.parseMillimetres("10' 6\"") == 3200)
        #expect(AnchorMeasurementParser.parseMillimetres("12'") == 3658)
        #expect(AnchorMeasurementParser.parseMillimetres("8'") == 2438)
    }

    @Test
    func inchOnlyFormsParse() {
        #expect(AnchorMeasurementParser.parseMillimetres("42 1/2\"") == 1080)
        #expect(AnchorMeasurementParser.parseMillimetres("3.5\"") == 89)
        #expect(AnchorMeasurementParser.parseMillimetres("1/2\"") == 13)
    }

    @Test
    func aBareNumberIsDecimalFeet() {
        // ⚠ Ported faithfully and flagged: a bare number is FEET, not inches.
        #expect(AnchorMeasurementParser.parseMillimetres("12.5") == 3810)
        #expect(AnchorMeasurementParser.parseMillimetres("1") == 305)
    }

    @Test
    func smartQuotesParseTheSameAsStraightMarks() {
        #expect(AnchorMeasurementParser.parseMillimetres("12\u{2019} 3 1/2\u{201D}") == 3747)
        #expect(AnchorMeasurementParser.parseMillimetres("12\u{2032} 3 1/2\u{2033}") == 3747)
        #expect(AnchorMeasurementParser.parseMillimetres("42 1/2\u{201D}") == 1080)
    }

    @Test
    func unparseableAndNonPositiveInputsReturnNil() {
        #expect(AnchorMeasurementParser.parseMillimetres("") == nil)
        #expect(AnchorMeasurementParser.parseMillimetres("   ") == nil)
        #expect(AnchorMeasurementParser.parseMillimetres("about ten feet") == nil)
        #expect(AnchorMeasurementParser.parseMillimetres("0") == nil)
        #expect(AnchorMeasurementParser.parseMillimetres("-4") == nil)
        #expect(AnchorMeasurementParser.parseMillimetres("12' banana") == nil)
        #expect(AnchorMeasurementParser.parseMillimetres("1/0\"") == nil)
    }

    @Test
    func theThirtyMetreSanityCapIsInclusive() {
        #expect(AnchorMeasurementParser.maxReasonableMillimetres == 30_000)
        // 98.4 ft = 29 992 mm — just under the cap, accepted.
        #expect(AnchorMeasurementParser.parseMillimetres("98.4") == 29_992)
        // 120 ft = 36 576 mm — a missed foot mark, rejected.
        #expect(AnchorMeasurementParser.parseMillimetres("120") == nil)
    }
}

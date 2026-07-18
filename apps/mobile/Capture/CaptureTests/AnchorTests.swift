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

    @Test func noSpaceCompoundAndUpperBound() {
        // No-space compound must match the spaced form (A2).
        #expect(AnchorMeasurementParser.parseMillimetres("12'6\"") == 3810)
        #expect(AnchorMeasurementParser.parseMillimetres("12'6\"")
                == AnchorMeasurementParser.parseMillimetres("12' 6\""))
        #expect(AnchorMeasurementParser.parseMillimetres("12'3.5\"")
                == AnchorMeasurementParser.parseMillimetres("12' 3.5\""))
        // Upper sanity bound: > 30 m rejected (A2).
        #expect(AnchorMeasurementParser.maxReasonableMillimetres == 30_000)
        #expect(AnchorMeasurementParser.parseMillimetres("98'") == 29870)         // ~29.9 m OK
        #expect(AnchorMeasurementParser.parseMillimetres("99'") == nil)           // ~30.2 m rejected
        #expect(AnchorMeasurementParser.parseMillimetres("200'") == nil)          // typo (missed foot mark)
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

// MARK: - Anchor coach (M4 · item 4 — SC-08 accuracy-recipe nudge, soft gate R108.5)

struct AnchorCoachTests {

    private func span(_ meters: Double) -> AnchorRecord {
        AnchorRecord(id: UUID().uuidString.lowercased(), index: 0, label: "s",
                     spanKind: .span, entryMethod: .typed,
                     endpointA: .init(x: 0, y: 0, z: 0), endpointB: .init(x: meters, y: 0, z: 0),
                     modelSpanMeters: meters, measuredValueMm: Int(meters * 1000))
    }
    private func height(_ meters: Double) -> AnchorRecord {
        AnchorRecord(id: UUID().uuidString.lowercased(), index: 0, label: "h",
                     spanKind: .height, entryMethod: .typed,
                     endpointA: .init(x: 0, y: 0, z: 0), endpointB: .init(x: 0, y: meters, z: 0),
                     modelSpanMeters: meters, measuredValueMm: Int(meters * 1000))
    }
    private func progress(_ anchors: [AnchorRecord], room: Double? = nil) -> AnchorCoach.Progress {
        AnchorCoach.summarize(anchors: anchors, roomLargerPlanDimensionMeters: room)
    }

    // MARK: Classification boundaries

    @Test func classifiesShortByAbsoluteFloor() {
        #expect(AnchorCoach.shortSpanCeilingMeters == 2.5)
        // Absolute floor, no room dimension. Boundary is EXCLUSIVE: exactly 2.5 m is LONG.
        #expect(AnchorCoach.classifySpan(lengthMeters: 2.49, roomLargerPlanDimensionMeters: nil) == .short)
        #expect(AnchorCoach.classifySpan(lengthMeters: 2.5, roomLargerPlanDimensionMeters: nil) == .long)
        #expect(AnchorCoach.classifySpan(lengthMeters: 4.0, roomLargerPlanDimensionMeters: nil) == .long)
    }

    @Test func classifiesShortByHalfRoom() {
        // Room 8 m across ⇒ half = 4 m. A 3 m span clears the absolute floor but is
        // < half-room ⇒ SHORT; exactly half-room ⇒ LONG (exclusive boundary).
        #expect(AnchorCoach.classifySpan(lengthMeters: 3.0, roomLargerPlanDimensionMeters: 8.0) == .short)
        #expect(AnchorCoach.classifySpan(lengthMeters: 4.0, roomLargerPlanDimensionMeters: 8.0) == .long)
        #expect(AnchorCoach.classifySpan(lengthMeters: 5.0, roomLargerPlanDimensionMeters: 8.0) == .long)
        // A ≤ 0 room dimension is ignored — absolute floor only.
        #expect(AnchorCoach.classifySpan(lengthMeters: 3.0, roomLargerPlanDimensionMeters: 0) == .long)
    }

    // MARK: Recipe detection (≥2 long + 1 height)

    @Test func summarizeCountsLongSpansAndHeights() {
        // long, short (excluded), height, long
        let p = progress([span(4.0), span(2.0), height(2.4), span(5.0)])
        #expect(p.longSpanCount == 2)
        #expect(p.heightCount == 1)
        #expect(p.meetsRecipe)
    }

    @Test func meetsRecipeNeedsTwoLongPlusHeight() {
        #expect(!progress([span(4), span(4)]).meetsRecipe)                 // no height
        #expect(!progress([span(4), height(2.4)]).meetsRecipe)            // only one long
        #expect(!progress([span(2), span(2), height(2.4)]).meetsRecipe)   // both spans short
        #expect(progress([span(4), span(4), height(2.4)]).meetsRecipe)    // recipe met
    }

    // MARK: Prompt-sequence progression

    @Test func nextStepProgression() {
        #expect(AnchorCoach.nextStep(for: progress([])) == .addLongSpan)
        #expect(AnchorCoach.nextStep(for: progress([span(4)])) == .addLongSpan)
        #expect(AnchorCoach.nextStep(for: progress([span(4), span(4)])) == .addHeight)
        #expect(AnchorCoach.nextStep(for: progress([span(4), span(4), height(2.4)])) == .complete)
        // A short span does NOT advance the long-span requirement.
        #expect(AnchorCoach.nextStep(for: progress([span(2), span(2)])) == .addLongSpan)
    }

    @Test func progressPromptStrings() {
        #expect(AnchorCoach.progressPrompt(for: progress([]))
                == "Anchor 1 of 3 — add a long span — a full wall or a diagonal")
        #expect(AnchorCoach.progressPrompt(for: progress([span(4)]))
                == "Anchor 2 of 3 — add another long span")
        #expect(AnchorCoach.progressPrompt(for: progress([span(4), span(4)]))
                == "Anchor 3 of 3 — add a ceiling height")
        #expect(AnchorCoach.progressPrompt(for: progress([span(4), span(4), height(2.4)]))
                == "Accuracy recipe met — two long spans and a ceiling height")
        #expect(AnchorCoach.shortSpanNudge == "Longer spans pin accuracy — try a full wall or a diagonal")
    }

    // MARK: Soft gate — meeting the recipe is NEVER required to finish (R108.5)

    @Test func recipeIsAdvisoryNotAGate() {
        // Three SHORT spans clear the anchor gate (≥ 3 ⇒ not unverified) yet miss the
        // recipe — completion is still allowed; the coach adds no gate of its own.
        let shorties = [span(2), span(2), span(2)]
        #expect(!AnchorGate.isUnverified(anchorCount: shorties.count))
        #expect(!progress(shorties).meetsRecipe)
        // And a set that DOES meet the recipe is likewise not unverified — the two
        // signals are independent, neither blocks finishing.
        let recipe = [span(4), span(4), height(2.4)]
        #expect(progress(recipe).meetsRecipe)
        #expect(!AnchorGate.isUnverified(anchorCount: recipe.count))
    }
}

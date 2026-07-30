//
//  InstrumentScorecardTests.swift
//  PatinaTests
//
//  Pins the QA verdict + gap naming + coach rules ported from Patina Field
//  (CaptureKit/SiteScan/CoverageScorecard.swift, ScorecardEvaluator.swift and
//  Capture/Features/SiteScan/FieldCoverageCoach.swift).
//
//  The headline acceptance criterion: deliberately skipping one wall must produce a
//  non-green verdict that NAMES that wall.
//

import Testing
import Foundation
@testable import Patina

struct InstrumentScorecardEvaluatorTests {

    private static func coverage(_ key: String,
                                 kind: CaptureSurface.Kind = .wall,
                                 label: String? = nil,
                                 observed: Bool) -> SurfaceCoverage {
        SurfaceCoverage(
            surface: CaptureSurface(id: key, kind: kind, center: .init(0, 0, 0),
                                    normal: .init(0, 0, 1), checklistKey: key,
                                    displayLabel: label ?? key),
            observed: observed,
            dwellSeconds: observed ? 2 : 0)
    }

    /// Four walls + floor + ceiling, all observed.
    private static func fullRoom() -> [SurfaceCoverage] {
        [coverage("wall:north", observed: true),
         coverage("wall:south", observed: true),
         coverage("wall:east", observed: true),
         coverage("wall:west", observed: true),
         coverage("floor", kind: .floor, observed: true),
         coverage("ceiling", kind: .ceiling, observed: true)]
    }

    @Test
    func verdictThresholdsAreCarriedAcrossByValue() {
        #expect(ScorecardEvaluator.redCoveragePct == 60)
        #expect(ScorecardEvaluator.amberCoveragePct == 85)
        #expect(ScorecardEvaluator.amberSharpRatio == 0.5)
    }

    @Test
    func aCleanScanIsGreen() {
        let card = ScorecardEvaluator.make(coverage: Self.fullRoom(), sharpFrameRatio: 0.9,
                                           trackingHealth: .good, anchorCount: 3)
        #expect(card.verdict == .green)
        #expect(card.coveragePct == 100)
        #expect(card.namedGaps.isEmpty)
        #expect(card.surfaceChecklist.count == 6)
        #expect(card.surfaceChecklist.allSatisfy(\.covered))
        #expect(card.anchorCount == 3)
    }

    @Test
    func skippingOneWallIsRedAndNamesThatWall() {
        var room = Self.fullRoom()
        room[2] = Self.coverage("wall:east", label: "East wall", observed: false)
        let card = ScorecardEvaluator.make(coverage: room, sharpFrameRatio: 0.9,
                                           trackingHealth: .good, anchorCount: 3)
        #expect(card.verdict == .red)                 // structural gap is the hard gate
        #expect(card.coveragePct == 83)               // 5 of 6, rounded
        #expect(card.namedGaps.map(\.surface) == ["wall:east"])
        #expect(card.namedGaps.first?.phrase == "East wall not fully captured")
        // The checklist still carries the row, marked uncovered.
        #expect(card.surfaceChecklist.first { $0.surface == "wall:east" }?.covered == false)
    }

    @Test
    func structuralGapsLeadTheWalkMeToTheGapList() {
        let room = [
            Self.coverage("opening:1", kind: .opening, observed: false),
            Self.coverage("opening:2", kind: .opening, observed: false),
            Self.coverage("wall:north", observed: false),
            Self.coverage("floor", kind: .floor, observed: true)
        ]
        let card = ScorecardEvaluator.make(coverage: room, sharpFrameRatio: 1.0,
                                           trackingHealth: .good, anchorCount: 0)
        #expect(card.namedGaps.first?.surface == "wall:north")
        #expect(card.namedGaps.count == 3)
    }

    @Test
    func anUnobservedOpeningAloneCanStillBeGreen() {
        // 19 of 20 surfaces observed and the miss is a non-structural opening: 95%,
        // no structural gap ⇒ still green, but the gap is still NAMED.
        var room = (0..<19).map { Self.coverage("wall:\($0)", observed: true) }
        room.append(Self.coverage("opening:1", kind: .opening, observed: false))
        let card = ScorecardEvaluator.make(coverage: room, sharpFrameRatio: 1.0,
                                           trackingHealth: .good, anchorCount: 3)
        #expect(card.coveragePct == 95)
        #expect(card.verdict == .green)
        #expect(card.namedGaps.map(\.surface) == ["opening:1"])
    }

    @Test
    func verdictCoverageBoundariesAreExclusiveOnRedAndAmber() {
        func verdict(_ pct: Int) -> Scorecard.Verdict {
            ScorecardEvaluator.verdict(coveragePct: pct, sharpFrameRatio: 1.0,
                                       trackingHealth: .good, unseenStructural: false)
        }
        #expect(verdict(59) == .red)
        #expect(verdict(60) == .amber)    // 60 is NOT < 60
        #expect(verdict(84) == .amber)
        #expect(verdict(85) == .green)    // 85 is NOT < 85
    }

    @Test
    func lowSharpnessAndDegradedTrackingDowngradeIndependently() {
        func verdict(sharp: Double, health: Scorecard.TrackingHealth) -> Scorecard.Verdict {
            ScorecardEvaluator.verdict(coveragePct: 100, sharpFrameRatio: sharp,
                                       trackingHealth: health, unseenStructural: false)
        }
        #expect(verdict(sharp: 0.5, health: .good) == .green)     // boundary is exclusive
        #expect(verdict(sharp: 0.49, health: .good) == .amber)
        #expect(verdict(sharp: 1.0, health: .fair) == .amber)
        #expect(verdict(sharp: 1.0, health: .poor) == .red)
        // A structural gap outranks perfect everything else.
        #expect(ScorecardEvaluator.verdict(coveragePct: 100, sharpFrameRatio: 1.0,
                                           trackingHealth: .good, unseenStructural: true) == .red)
    }

    @Test
    func anEmptyCoverageSetScoresZeroPercentAndReadsRed() {
        let card = ScorecardEvaluator.make(coverage: [], sharpFrameRatio: 1.0,
                                           trackingHealth: .good, anchorCount: 0)
        #expect(card.coveragePct == 0)
        #expect(card.verdict == .red)
        #expect(card.namedGaps.isEmpty)
    }

    @Test
    func scorecardJsonKeysAndEnumValuesAreWireContracts() throws {
        let card = ScorecardEvaluator.make(coverage: Self.fullRoom(), sharpFrameRatio: 0.9,
                                           trackingHealth: .fair, anchorCount: 2)
        let data = try JSONEncoder().encode(card)
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            Issue.record("scorecard did not encode to a JSON object")
            return
        }
        #expect(Set(object.keys) == [
            "coveragePct", "sharpFrameRatio", "trackingHealth",
            "anchorCount", "verdict", "surfaceChecklist", "namedGaps"
        ])
        #expect(object["trackingHealth"] as? String == "fair")
        #expect(object["verdict"] as? String == "amber")
        #expect(Scorecard.Verdict.green.rawValue == "green")
        #expect(Scorecard.Verdict.amber.rawValue == "amber")
        #expect(Scorecard.Verdict.red.rawValue == "red")
        #expect(Scorecard.TrackingHealth.good.rawValue == "good")
        #expect(Scorecard.TrackingHealth.poor.rawValue == "poor")
        #expect(try JSONDecoder().decode(Scorecard.self, from: data) == card)
    }

    @Test
    func coachWarningRawValuesAndOrderAreStable() {
        #expect(CoachWarning.allCases.map(\.rawValue)
                == ["moveSlower", "holdSteady", "tooDark", "tooFar"])
    }
}

struct InstrumentCoverageCoachRulesTests {

    @Test
    func coachThresholdsAreCarriedAcrossByValue() {
        #expect(CoverageCoachRules.motionSpeedLimit == 1.5)
        #expect(CoverageCoachRules.darkAmbientLumens == 120)
        #expect(CoverageCoachRules.farDistanceMeters == 4.0)
        #expect(CoverageCoachRules.blurProbeInterval == 0.2)
        #expect(CoverageCoachRules.blurStreakToWarn == 3)
        #expect(CoverageCoachRules.coachSharpnessFloor == 8.0)
        #expect(CoverageCoachRules.poorTrackingFraction == 0.25)
        #expect(CoverageCoachRules.fairTrackingFraction == 0.05)
        #expect(CoverageCoachRules.maxFrameDeltaSeconds == 1.0)
        // The coach floor must stay strictly below the keyframe gate's threshold —
        // the coach is meant to nag BEFORE the gate starts rejecting silently.
        #expect(CoverageCoachRules.coachSharpnessFloor < KeyframeGate.standard.sharpnessThreshold)
    }

    @Test
    func frameDeltaWindowIsExclusiveAtBothEnds() {
        #expect(!CoverageCoachRules.acceptsFrameDelta(0))
        #expect(!CoverageCoachRules.acceptsFrameDelta(-0.016))
        #expect(CoverageCoachRules.acceptsFrameDelta(0.0166))
        #expect(CoverageCoachRules.acceptsFrameDelta(0.999))
        #expect(!CoverageCoachRules.acceptsFrameDelta(1.0))   // a stall, not dwell
        #expect(!CoverageCoachRules.acceptsFrameDelta(30))
    }

    @Test
    func trackingHealthBucketsByDegradedFraction() {
        #expect(CoverageCoachRules.trackingHealth(degradedSeconds: 0, totalSeconds: 0) == .good)
        #expect(CoverageCoachRules.trackingHealth(degradedSeconds: 0, totalSeconds: 100) == .good)
        #expect(CoverageCoachRules.trackingHealth(degradedSeconds: 4.9, totalSeconds: 100) == .good)
        #expect(CoverageCoachRules.trackingHealth(degradedSeconds: 5, totalSeconds: 100) == .fair)
        #expect(CoverageCoachRules.trackingHealth(degradedSeconds: 24.9, totalSeconds: 100) == .fair)
        #expect(CoverageCoachRules.trackingHealth(degradedSeconds: 25, totalSeconds: 100) == .poor)
        #expect(CoverageCoachRules.trackingHealth(degradedSeconds: 100, totalSeconds: 100) == .poor)
    }

    @Test
    func blurStreakCountsConsecutiveFailuresAndResetsOnAPass() {
        var streak = 0
        streak = CoverageCoachRules.advanceBlurStreak(streak, score: 7.9)
        #expect(streak == 1)
        streak = CoverageCoachRules.advanceBlurStreak(streak, score: 0)
        #expect(streak == 2)
        // Exactly at the floor is a PASS (the comparison is `<`) and resets.
        streak = CoverageCoachRules.advanceBlurStreak(streak, score: 8.0)
        #expect(streak == 0)
    }

    @Test
    func blurProbeIsThrottled() {
        #expect(CoverageCoachRules.shouldProbeBlur(now: 0, lastProbe: nil))
        #expect(!CoverageCoachRules.shouldProbeBlur(now: 10.19, lastProbe: 10.0))
        #expect(CoverageCoachRules.shouldProbeBlur(now: 10.2, lastProbe: 10.0))
    }

    @Test
    func nearestSurfaceDistanceIsNilWithoutSurfaces() {
        #expect(CoverageCoachRules.nearestSurfaceDistance(cameraPosition: .init(0, 0, 0),
                                                          surfaces: []) == nil)
    }

    @Test
    func nearestSurfaceDistanceUsesTheClosestCentre() {
        let surfaces = [
            CaptureSurface(id: "far", kind: .wall, center: .init(0, 0, -9), normal: .init(0, 0, 1),
                           checklistKey: "far", displayLabel: "Far"),
            CaptureSurface(id: "near", kind: .wall, center: .init(3, 4, 0), normal: .init(0, 0, 1),
                           checklistKey: "near", displayLabel: "Near")
        ]
        let distance = CoverageCoachRules.nearestSurfaceDistance(cameraPosition: .init(0, 0, 0),
                                                                 surfaces: surfaces)
        #expect(abs((distance ?? 0) - 5.0) < 1e-5)   // 3-4-5
    }

    @Test
    func warningsAreRaisedOnStrictlyExceedingEachThreshold() {
        #expect(CoverageCoachRules.warnings(speedMetersPerSecond: 1.5, ambientIntensity: 120,
                                            nearestSurfaceDistance: 4.0,
                                            consecutiveBlurProbes: 2).isEmpty)
        #expect(CoverageCoachRules.warnings(speedMetersPerSecond: 1.51, ambientIntensity: nil,
                                            nearestSurfaceDistance: nil,
                                            consecutiveBlurProbes: 0) == [.moveSlower])
        #expect(CoverageCoachRules.warnings(speedMetersPerSecond: nil, ambientIntensity: 119.9,
                                            nearestSurfaceDistance: nil,
                                            consecutiveBlurProbes: 0) == [.tooDark])
        #expect(CoverageCoachRules.warnings(speedMetersPerSecond: nil, ambientIntensity: nil,
                                            nearestSurfaceDistance: 4.01,
                                            consecutiveBlurProbes: 0) == [.tooFar])
        #expect(CoverageCoachRules.warnings(speedMetersPerSecond: nil, ambientIntensity: nil,
                                            nearestSurfaceDistance: nil,
                                            consecutiveBlurProbes: 3) == [.holdSteady])
    }

    @Test
    func warningsComeBackInAllCasesOrder() {
        // Raised in a scrambled conceptual order; emitted in declaration order so the
        // coach UI never reshuffles between frames.
        let raised = CoverageCoachRules.warnings(speedMetersPerSecond: 9,
                                                 ambientIntensity: 1,
                                                 nearestSurfaceDistance: 40,
                                                 consecutiveBlurProbes: 12)
        #expect(raised == [.moveSlower, .holdSteady, .tooDark, .tooFar])
    }

    @Test
    func missingSignalsRaiseNoWarnings() {
        #expect(CoverageCoachRules.warnings(speedMetersPerSecond: nil, ambientIntensity: nil,
                                            nearestSurfaceDistance: nil,
                                            consecutiveBlurProbes: 0).isEmpty)
    }
}

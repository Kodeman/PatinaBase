//
//  ScorecardEvaluator.swift
//  Patina
//
//  PORTED VERBATIM FROM Patina Field:
//    apps/mobile/Capture/CaptureKit/CaptureKit/SiteScan/ScorecardEvaluator.swift
//
//  Pure verdict + gap-naming for the QA gate. Turns the coverage tracker's
//  per-surface state + the scan's sharp-frame ratio + tracking health + anchor count
//  into a `Scorecard` with a green/amber/red verdict and named gaps. The acceptance
//  criterion lives here: an unobserved STRUCTURAL surface (a skipped
//  wall/floor/ceiling) forces a non-green verdict and appears in `namedGaps`, so
//  "deliberately skipping one wall produces a non-green verdict naming that wall" is
//  satisfied by pure logic and unit-tested on synthetic rooms.
//
//  Thresholds are code-only calls, carried across from Field unchanged and pinned by
//  value in `InstrumentCoverageTests`. Gap WORDING is placeholder copy.
//
//  ISOLATION: `nonisolated` — see the note in `KeyframeGate.swift`.
//

import Foundation

nonisolated public enum ScorecardEvaluator {

    // Verdict thresholds. A missed structural surface is the hard gate.
    // Values carried across from Field's ScorecardEvaluator (private there;
    // exposed here so the pinning test can assert them by value).
    public static let redCoveragePct = 60
    public static let amberCoveragePct = 85
    public static let amberSharpRatio = 0.5

    /// Assemble the full scorecard from the coverage state + scan metrics.
    public static func make(coverage: [SurfaceCoverage],
                            sharpFrameRatio: Double,
                            trackingHealth: Scorecard.TrackingHealth,
                            anchorCount: Int) -> Scorecard {
        let checklist = coverage.map {
            SurfaceStatus(surface: $0.surface.checklistKey, covered: $0.observed)
        }
        let total = coverage.count
        let observed = coverage.filter { $0.observed }.count
        let coveragePct = total > 0 ? Int((Double(observed) / Double(total) * 100).rounded()) : 0

        let unobserved = coverage.filter { !$0.observed }.map { $0.surface }
        let unseenStructural = unobserved.contains { $0.isStructural }
        // Structural gaps first so the "walk me to the gap" list leads with a wall.
        // Each gap carries the UNIQUE surface key, never just the phrase.
        let namedGaps = unobserved
            .sorted { ($0.isStructural ? 0 : 1) < ($1.isStructural ? 0 : 1) }
            .map { ScorecardGap(surface: $0.checklistKey, phrase: ScorecardEvaluator.gapPhrase(for: $0)) }

        let verdict = ScorecardEvaluator.verdict(coveragePct: coveragePct,
                                                 sharpFrameRatio: sharpFrameRatio,
                                                 trackingHealth: trackingHealth,
                                                 unseenStructural: unseenStructural)

        return Scorecard(coveragePct: coveragePct,
                         sharpFrameRatio: sharpFrameRatio,
                         trackingHealth: trackingHealth,
                         anchorCount: anchorCount,
                         verdict: verdict,
                         surfaceChecklist: checklist,
                         namedGaps: namedGaps)
    }

    /// The verdict rule. A missed structural surface OR very low coverage OR poor
    /// tracking is RED; middling coverage / low sharpness / fair tracking is AMBER;
    /// otherwise GREEN.
    public static func verdict(coveragePct: Int,
                               sharpFrameRatio: Double,
                               trackingHealth: Scorecard.TrackingHealth,
                               unseenStructural: Bool) -> Scorecard.Verdict {
        if unseenStructural || coveragePct < ScorecardEvaluator.redCoveragePct || trackingHealth == .poor {
            return .red
        }
        if coveragePct < ScorecardEvaluator.amberCoveragePct
            || sharpFrameRatio < ScorecardEvaluator.amberSharpRatio
            || trackingHealth == .fair {
            return .amber
        }
        return .green
    }

    /// Placeholder wording for a gap.
    public static func gapPhrase(for surface: CaptureSurface) -> String {
        "\(surface.displayLabel) not fully captured"
    }
}

/// Relative-bearing naming for surfaces. There is NO compass in RoomPlan, so the
/// cardinal words are a RELATIVE bearing (dominant horizontal axis of the surface
/// vs the room centroid) and are placeholders.
nonisolated public enum SurfaceLabeler {

    /// One of "north"/"south"/"east"/"west" from the dominant horizontal offset of
    /// `center` from `centroid` (x → east/west, z → south/north). Placeholder.
    public static func bearing(center: SIMD3<Float>, centroid: SIMD3<Float>) -> String {
        let dx = center.x - centroid.x
        let dz = center.z - centroid.z
        if abs(dx) >= abs(dz) {
            return dx >= 0 ? "east" : "west"
        }
        return dz >= 0 ? "south" : "north"
    }
}

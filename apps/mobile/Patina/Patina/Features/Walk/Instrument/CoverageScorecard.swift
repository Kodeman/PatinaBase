//
//  CoverageScorecard.swift
//  Patina
//
//  PORTED VERBATIM FROM Patina Field:
//    apps/mobile/Capture/CaptureKit/CaptureKit/SiteScan/CoverageScorecard.swift
//
//  The QA scorecard model plus the live coach snapshot the coach UI renders. Pure
//  Codable so the scorecard persists into the bundle (`scorecard.json`) matching the
//  capture-bundle spec §3.4 shape.
//
//  Spec §3.4 shape: `coveragePct`, `sharpFrameRatio`, `trackingHealth`,
//  `anchorCount`, `verdict`, `surfaceChecklist[{surface, covered}]`. Field adds one
//  field beyond the spec — `namedGaps` (the "walk me to the gap" list) — a logged
//  spec-delta carried across here so both apps write the same JSON; it is additive,
//  so a spec reader ignoring it still validates.
//
//  All raw values are WIRE CONTRACTS (`scorecard.json`, and the server-side
//  validator). Renaming a case renames a JSON value.
//
//  ISOLATION: `nonisolated` — see the note in `KeyframeGate.swift`.
//

import Foundation

/// One row of the surface checklist (spec §3.4).
nonisolated public struct SurfaceStatus: Codable, Sendable, Equatable {
    public let surface: String   // checklist key, e.g. "wall:north"
    public let covered: Bool
    public init(surface: String, covered: Bool) {
        self.surface = surface
        self.covered = covered
    }
}

/// A live on-site warning ("motion-speed and blur warnings; exposure guidance;
/// distance nudges"). User-facing copy lives in the UI layer; these are the machine
/// reasons. `allCases` ORDER IS LOAD-BEARING — it is the display order the coach
/// snapshot emits (see `CoverageCoachRules.warnings`).
nonisolated public enum CoachWarning: String, Codable, Sendable, CaseIterable {
    case moveSlower          // motion-speed too high
    case holdSteady          // blur streak
    case tooDark             // low light
    case tooFar              // > ~4 m from the nearest surface
}

/// The live coverage state the coach renders (checklist + warnings + %).
nonisolated public struct CoverageSnapshot: Codable, Sendable, Equatable {
    public let coveragePct: Int
    public let checklist: [SurfaceStatus]
    public let warnings: [CoachWarning]
    public init(coveragePct: Int, checklist: [SurfaceStatus], warnings: [CoachWarning]) {
        self.coveragePct = coveragePct
        self.checklist = checklist
        self.warnings = warnings
    }
}

/// One named gap for the "walk me to the gap" list. Carries the UNIQUE surface
/// checklist key so the UI keys on identity, never on the (possibly duplicate)
/// phrase string.
nonisolated public struct ScorecardGap: Codable, Sendable, Equatable {
    public let surface: String   // unique checklist key, e.g. "wall:north-2"
    public let phrase: String    // placeholder wording
    public init(surface: String, phrase: String) {
        self.surface = surface
        self.phrase = phrase
    }
}

/// The end-of-scan QA scorecard (spec §3.4 + `namedGaps`).
nonisolated public struct Scorecard: Codable, Sendable, Equatable {

    public enum Verdict: String, Codable, Sendable { case green, amber, red }
    public enum TrackingHealth: String, Codable, Sendable { case good, fair, poor }

    public let coveragePct: Int
    public let sharpFrameRatio: Double
    public let trackingHealth: TrackingHealth
    public let anchorCount: Int
    public let verdict: Verdict
    public let surfaceChecklist: [SurfaceStatus]
    /// Unobserved-surface gaps (surface id + placeholder phrase). Additive beyond
    /// spec §3.4 — logged spec-delta.
    public let namedGaps: [ScorecardGap]

    public init(coveragePct: Int, sharpFrameRatio: Double, trackingHealth: TrackingHealth,
                anchorCount: Int, verdict: Verdict, surfaceChecklist: [SurfaceStatus],
                namedGaps: [ScorecardGap]) {
        self.coveragePct = coveragePct
        self.sharpFrameRatio = sharpFrameRatio
        self.trackingHealth = trackingHealth
        self.anchorCount = anchorCount
        self.verdict = verdict
        self.surfaceChecklist = surfaceChecklist
        self.namedGaps = namedGaps
    }
}

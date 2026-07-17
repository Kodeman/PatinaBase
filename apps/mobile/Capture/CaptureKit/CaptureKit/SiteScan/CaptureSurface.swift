//  CaptureSurface.swift
//  CaptureKit
//
//  A pure, ARKit-free representation of one room surface the coach/QA gate tracks
//  (Field Capture P1 · item 5, deck SC-09 "per-surface checklist: walls, ceiling,
//  floor, each opening"). The app-target glue derives these from the live
//  RoomPlan `CapturedRoom` (walls / floors / synthesized ceiling / openings) and
//  feeds them to the pure `SurfaceCoverageTracker`, so the coverage logic is
//  testable with synthetic surfaces + camera poses (no RoomPlan, no device).
//
//  `id` is the STABLE tracking key (a RoomPlan surface UUID, or "floor"/"ceiling")
//  so accumulated dwell survives the graph re-emitting each update. `checklistKey`
//  and `displayLabel` are the scorecard/coach naming — `displayLabel` is
//  ESCALATE-class placeholder wording (flagged for Kody's review).

import Foundation

public struct CaptureSurface: Sendable, Equatable {

    public enum Kind: String, Sendable, Codable {
        case wall, floor, ceiling, opening

        /// Structural surfaces gate the verdict harder than openings (a missed wall
        /// is a red; a missed opening is at most amber).
        public var isStructural: Bool { self == .wall || self == .floor || self == .ceiling }
    }

    /// Stable tracking id (RoomPlan surface UUID string, or "floor"/"ceiling").
    public let id: String
    public let kind: Kind
    /// World-space center (metres, ARKit frame).
    public let center: SIMD3<Float>
    /// World-space outward normal (unit-ish; used for facing checks / bearing).
    public let normal: SIMD3<Float>
    /// Manifest checklist key, e.g. "wall:north", "floor", "ceiling", "opening:1".
    public let checklistKey: String
    /// User-facing name — ESCALATE placeholder wording (e.g. "North wall").
    public let displayLabel: String

    public init(id: String, kind: Kind, center: SIMD3<Float>, normal: SIMD3<Float>,
                checklistKey: String, displayLabel: String) {
        self.id = id
        self.kind = kind
        self.center = center
        self.normal = normal
        self.checklistKey = checklistKey
        self.displayLabel = displayLabel
    }

    public var isStructural: Bool { kind.isStructural }
}

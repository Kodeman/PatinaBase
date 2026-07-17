//  AnchorRecord.swift
//  CaptureKit
//
//  One typed ground-truth anchor (Field Capture P1 · item 6, deck SC-08, R108.1).
//  The Codable shape matches the capture-bundle spec §3.3 (camelCase) and lands in
//  `scan_anchors` (00341): `client_anchor_id` = `id`, `endpoint_a/b` jsonb `{x,y,z}`
//  in model-space metres (ARKit world frame), `measured_value_mm` integer, plus
//  `span_kind`/`entry_method`. P1 is typed-only (R1); the endpoints are the two taps
//  on the live model and the value is the tape/laser truth the designer typed.
//
//  Persisted as `anchors.json` (an array of these) in the bundle; item 8 folds it
//  into `manifest.anchors`. Pure Foundation — the parser/gate/classifier that build
//  and validate it are unit-tested with no ARKit.

import Foundation

public struct AnchorRecord: Codable, Sendable, Equatable {

    /// What the span measures. Extensible (P2 may add corner/diag) — matches the
    /// `scan_anchors.span_kind` CHECK.
    public enum SpanKind: String, Codable, Sendable { case span, height }
    /// Entry transport. P1: typed only (R1).
    public enum EntryMethod: String, Codable, Sendable { case typed }

    /// A model-space point, metres, ARKit world frame.
    public struct Point3: Codable, Sendable, Equatable {
        public let x: Double
        public let y: Double
        public let z: Double
        public init(x: Double, y: Double, z: Double) {
            self.x = x; self.y = y; self.z = z
        }
    }

    /// `client_anchor_id` — device-stable idempotency key (lowercased UUID).
    public let id: String
    /// Capture order within the session.
    public let index: Int
    /// ESCALATE placeholder label, e.g. "north wall run", "ceiling height".
    public let label: String
    public let spanKind: SpanKind
    public let entryMethod: EntryMethod
    public let endpointA: Point3
    public let endpointB: Point3
    /// Captured tap-to-tap distance, metres (for the scale residual).
    public let modelSpanMeters: Double
    /// Typed ground truth, integer millimetres (> 0, R-h).
    public let measuredValueMm: Int

    public init(id: String, index: Int, label: String, spanKind: SpanKind,
                entryMethod: EntryMethod, endpointA: Point3, endpointB: Point3,
                modelSpanMeters: Double, measuredValueMm: Int) {
        self.id = id
        self.index = index
        self.label = label
        self.spanKind = spanKind
        self.entryMethod = entryMethod
        self.endpointA = endpointA
        self.endpointB = endpointB
        self.modelSpanMeters = modelSpanMeters
        self.measuredValueMm = measuredValueMm
    }
}

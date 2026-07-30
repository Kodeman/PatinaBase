//
//  AnchorRecord.swift
//  Patina
//
//  PORTED FROM Patina Field:
//    - apps/mobile/Capture/CaptureKit/CaptureKit/SiteScan/AnchorRecord.swift
//      (the Codable shape — carried verbatim)
//    - apps/mobile/Capture/Capture/Features/SiteScan/RoomPlanScanSession.swift:454
//      and CaptureKitMocks/WorkMocks.swift:345 — where Field mints the id as
//      `UUID().uuidString.lowercased()`. Centralized here as
//      `newClientAnchorID()`; see the idempotency note below.
//
//  One typed ground-truth anchor. The Codable shape matches the capture-bundle
//  spec §3.3 (camelCase) and lands in `scan_anchors` (migration 00341):
//  `client_anchor_id` = `id`, `endpoint_a/b` jsonb `{x,y,z}` in model-space metres
//  (ARKit world frame), `measured_value_mm` integer, plus `span_kind`/`entry_method`.
//  The endpoints are two taps on the live model; the value is the tape/laser truth
//  the user typed.
//
//  ⚠ `client_anchor_id` IS AN IDEMPOTENCY KEY AND IS WRITTEN LOWERCASED.
//  It is deliberately a `String`, NOT a `UUID`. Swift's `UUID.uuidString` emits
//  UPPERCASE, so any round-trip through `UUID` — `UUID(uuidString: id)!.uuidString`
//  — silently upper-cases the key. The server matches it as an opaque string, so an
//  upper-cased retry inserts a DUPLICATE anchor row instead of being deduplicated.
//  Mint ids only via `newClientAnchorID()`, never by touching `UUID` downstream.
//
//  ISOLATION: `nonisolated` — see the note in `KeyframeGate.swift`.
//

import Foundation

nonisolated public struct AnchorRecord: Codable, Sendable, Equatable {

    /// What the span measures. Extensible — matches the `scan_anchors.span_kind`
    /// CHECK constraint.
    public enum SpanKind: String, Codable, Sendable { case span, height }
    /// Entry transport. Typed only today.
    public enum EntryMethod: String, Codable, Sendable { case typed }

    /// A model-space point, metres, ARKit world frame.
    public struct Point3: Codable, Sendable, Equatable {
        public let x: Double
        public let y: Double
        public let z: Double
        public init(x: Double, y: Double, z: Double) {
            self.x = x
            self.y = y
            self.z = z
        }
    }

    /// `client_anchor_id` — device-stable idempotency key, LOWERCASED UUID string.
    /// See the file header: never round-trip this through `UUID`.
    public let id: String
    /// Capture order within the session.
    public let index: Int
    /// Human label, e.g. "north wall run", "ceiling height".
    public let label: String
    public let spanKind: SpanKind
    public let entryMethod: EntryMethod
    public let endpointA: Point3
    public let endpointB: Point3
    /// Captured tap-to-tap distance, metres (for the scale residual).
    public let modelSpanMeters: Double
    /// Typed ground truth, integer millimetres (> 0).
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

    /// Mint a fresh `client_anchor_id`.
    ///
    /// ADDITIVE TO FIELD (behaviour identical): Field open-codes
    /// `UUID().uuidString.lowercased()` at each call site. Centralizing it is the
    /// whole defence against the upper-case idempotency break described in the file
    /// header — a call site that forgets `.lowercased()` produces a key that never
    /// deduplicates, and nothing fails loudly at the time.
    public static func newClientAnchorID() -> String {
        UUID().uuidString.lowercased()
    }
}

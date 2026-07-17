//  AnchorGate.swift
//  CaptureKit
//
//  The soft anchor gate (Field Capture P1 · item 6, R108.5) + span-kind
//  auto-classification. A session may close with fewer than three anchors — that is
//  allowed — but the Room File is then stamped UNVERIFIED. The `< 3` rule is defined
//  ONCE here and re-asserted everywhere (device scorecard, the item-8 manifest, the
//  validator §10 `unverified == (anchors.length < 3)`), so the flag "propagates
//  untouched" — never recomputed differently.

import Foundation

public enum AnchorGate {

    /// Anchors required for a VERIFIED session (deck SC-08: two long spans + one
    /// ceiling height).
    public static let requiredAnchors = 3

    /// A session with fewer than `requiredAnchors` is UNVERIFIED. Single source of
    /// the rule (spec §6 / validator §10).
    public static func isUnverified(anchorCount: Int) -> Bool {
        anchorCount < requiredAnchors
    }

    /// Auto-classify a span from its endpoint delta: a mostly-vertical span is a
    /// ceiling `height`, otherwise a horizontal `span`. User-overridable in the UI.
    public static func autoSpanKind(dx: Double, dy: Double, dz: Double) -> AnchorRecord.SpanKind {
        let horizontal = (dx * dx + dz * dz).squareRoot()
        return abs(dy) > horizontal ? .height : .span
    }
}

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

// MARK: - Anchor coach (M4 · item 4 — soft accuracy-recipe nudge, R108.5)

/// Advisory-only coach that steers the designer toward SC-08's accuracy recipe —
/// **two LONG spans + one ceiling height** — during typed anchor entry. It is a
/// NUDGE, never a blocker: `AnchorGate.isUnverified` (< 3 anchors) remains the sole
/// accuracy gate; this layer only tells the user what would make the room more
/// accurate. `meetsRecipe` is exposed for the UI, but a session may finish without
/// meeting it.
///
/// ── Blessed long/short heuristic (ESCALATE-class — pilot may retune) ──
/// A committed `.span` is SHORT when EITHER guard trips:
///   • absolute floor:   length  <  `shortSpanCeilingMeters` (2.5 m), OR
///   • relative floor:   length  <  `halfRoomFraction` (0.5) × the room's larger
///                        plan dimension (width|depth), when that dimension is known.
/// Otherwise it is LONG. Boundaries are exclusive: a span exactly at 2.5 m, or
/// exactly at half the room, classifies LONG. The room dimension is passed in as
/// plain metres so this logic carries NO RoomPlan dependency (the UI reads it from
/// the live `CapturedRoom` and hands it in); a nil/≤0 room dimension falls back to
/// the absolute floor alone. `.height` anchors are never "short spans".
///
/// ── ESCALATE-class placeholder copy (single source; catalogued for Kody's M4
///    review — wording is designer-visible) ──
///   • `shortSpanNudge`           = "Longer spans pin accuracy — try a full wall or a diagonal"
///   • `nextActionText` clauses   = "Add a long span — a full wall or a diagonal"
///                                  / "Add another long span"
///                                  / "Add a ceiling height"
///                                  / "Two long spans and a ceiling height — recipe met"
///   • `progressPrompt` (w/ count)= "Anchor N of 3 — add a long span — a full wall or a diagonal"
///                                  / "Anchor N of 3 — add another long span"
///                                  / "Anchor 3 of 3 — add a ceiling height"
///                                  / "Accuracy recipe met — two long spans and a ceiling height"
public enum AnchorCoach {

    /// Absolute short-span floor (metres). A span shorter than this is SHORT
    /// regardless of room size. Blessable — pilot may retune.
    public static let shortSpanCeilingMeters = 2.5
    /// Relative short-span floor as a fraction of the room's larger plan dimension.
    /// A span shorter than `halfRoomFraction × roomDim` is SHORT. Blessable.
    public static let halfRoomFraction = 0.5

    /// SC-08 recipe target: ≥ this many LONG spans …
    public static let targetLongSpans = 2
    /// … and ≥ this many ceiling HEIGHT anchors.
    public static let targetHeights = 1

    public enum SpanLength: String, Sendable, Equatable { case short, long }

    /// Classify a committed span by length against the blessed heuristic above.
    /// `roomLargerPlanDimensionMeters` is the greater of the room's plan width/depth
    /// in metres (nil ⇒ skip the relative floor).
    public static func classifySpan(lengthMeters: Double,
                                    roomLargerPlanDimensionMeters: Double?) -> SpanLength {
        if lengthMeters < shortSpanCeilingMeters { return .short }
        if let room = roomLargerPlanDimensionMeters, room > 0,
           lengthMeters < room * halfRoomFraction {
            return .short
        }
        return .long
    }

    /// The captured set, reduced to the two counts the recipe cares about.
    public struct Progress: Sendable, Equatable {
        public let longSpanCount: Int
        public let heightCount: Int
        public init(longSpanCount: Int, heightCount: Int) {
            self.longSpanCount = longSpanCount
            self.heightCount = heightCount
        }
        /// The SOFT recipe check: ≥2 long spans + ≥1 height. Advisory only — NOT a
        /// completion gate (R108.5).
        public var meetsRecipe: Bool {
            longSpanCount >= AnchorCoach.targetLongSpans && heightCount >= AnchorCoach.targetHeights
        }
    }

    /// Count LONG spans + HEIGHT anchors across the committed set. SHORT spans count
    /// toward neither (they are why the coach nudges).
    public static func summarize(anchors: [AnchorRecord],
                                 roomLargerPlanDimensionMeters: Double?) -> Progress {
        var longSpans = 0, heights = 0
        for anchor in anchors {
            switch anchor.spanKind {
            case .height:
                heights += 1
            case .span:
                if classifySpan(lengthMeters: anchor.modelSpanMeters,
                                roomLargerPlanDimensionMeters: roomLargerPlanDimensionMeters) == .long {
                    longSpans += 1
                }
            }
        }
        return Progress(longSpanCount: longSpans, heightCount: heights)
    }

    /// The single next thing that moves the set toward the recipe.
    public enum NextStep: Sendable, Equatable { case addLongSpan, addHeight, complete }

    public static func nextStep(for progress: Progress) -> NextStep {
        if progress.longSpanCount < targetLongSpans { return .addLongSpan }
        if progress.heightCount < targetHeights { return .addHeight }
        return .complete
    }

    // MARK: ESCALATE placeholder copy (single source — see catalogue above)

    /// Transient nudge shown right after a SHORT span is committed.
    public static let shortSpanNudge = "Longer spans pin accuracy — try a full wall or a diagonal"

    /// Count-free guidance clause (the UI pairs it with its own "Anchor N of 3").
    public static func nextActionText(for progress: Progress) -> String {
        switch nextStep(for: progress) {
        case .addLongSpan:
            return progress.longSpanCount == 0
                ? "Add a long span — a full wall or a diagonal"
                : "Add another long span"
        case .addHeight:
            return "Add a ceiling height"
        case .complete:
            return "Two long spans and a ceiling height — recipe met"
        }
    }

    /// Full progress prompt including the recipe step count (for the a11y label /
    /// standalone use). 1-based recipe step, capped at 3.
    public static func progressPrompt(for progress: Progress) -> String {
        switch nextStep(for: progress) {
        case .addLongSpan:
            let verb = progress.longSpanCount == 0
                ? "add a long span — a full wall or a diagonal"
                : "add another long span"
            return "Anchor \(recipeStep(for: progress)) of 3 — \(verb)"
        case .addHeight:
            return "Anchor 3 of 3 — add a ceiling height"
        case .complete:
            return "Accuracy recipe met — two long spans and a ceiling height"
        }
    }

    /// 1-based position within the 3-anchor recipe (2 long + 1 height), capped at 3.
    public static func recipeStep(for progress: Progress) -> Int {
        let toward = min(progress.longSpanCount, targetLongSpans) + min(progress.heightCount, targetHeights)
        return min(toward + 1, 3)
    }
}

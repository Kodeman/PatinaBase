//
//  AnchorGate.swift
//  Patina
//
//  PORTED FROM Patina Field:
//    apps/mobile/Capture/CaptureKit/CaptureKit/SiteScan/AnchorGate.swift
//
//  The soft anchor gate + span-kind auto-classification + the accuracy-recipe
//  coach's DECISION half.
//
//  A session may close with fewer than three anchors — that is allowed — but the
//  Room File is then stamped UNVERIFIED. The `< 3` rule is defined ONCE here and
//  re-asserted everywhere (device scorecard, manifest, validator §10
//  `unverified == (anchors.length < 3)`), so the flag "propagates untouched" and is
//  never recomputed differently.
//
//  NOT PORTED (deliberate): Field's `AnchorCoach` copy constants
//  (`shortSpanNudge`, `nextActionText`, `progressPrompt`) are ESCALATE-class
//  designer-facing placeholder wording written for the Field audience. Patina's
//  user-facing copy is glossary-governed and belongs in the client app's own copy
//  layer, so only the machine decisions came across. `NextStep` / `Progress` /
//  `recipeStep` are here; the sentences are not.
//
//  ISOLATION: `nonisolated` — see the note in `KeyframeGate.swift`.
//

import Foundation

nonisolated public enum AnchorGate {

    /// Anchors required for a VERIFIED session (Field deck SC-08: two long spans
    /// plus one ceiling height).
    public static let requiredAnchors = 3

    /// A session with fewer than `requiredAnchors` is UNVERIFIED. Single source of
    /// the rule (bundle spec §6 / validator §10).
    public static func isUnverified(anchorCount: Int) -> Bool {
        anchorCount < AnchorGate.requiredAnchors
    }

    /// Auto-classify a span from its endpoint delta: a mostly-vertical span is a
    /// ceiling `height`, otherwise a horizontal `span`. User-overridable in the UI.
    public static func autoSpanKind(dx: Double, dy: Double, dz: Double) -> AnchorRecord.SpanKind {
        let horizontal = (dx * dx + dz * dz).squareRoot()
        return abs(dy) > horizontal ? .height : .span
    }
}

// MARK: - Anchor coach (decision half only)

/// Advisory-only coach that steers the user toward the accuracy recipe —
/// **two LONG spans + one ceiling height**. It is a NUDGE, never a blocker:
/// `AnchorGate.isUnverified` (< 3 anchors) remains the sole accuracy gate; this
/// layer only says what would make the room more accurate. `meetsRecipe` is exposed
/// for the UI, but a session may finish without meeting it.
///
/// ── Blessed long/short heuristic (Field ESCALATE-class — pilot may retune) ──
/// A committed `.span` is SHORT when EITHER guard trips:
///   • absolute floor:   length  <  `shortSpanCeilingMeters` (2.5 m), OR
///   • relative floor:   length  <  `halfRoomFraction` (0.5) × the room's larger
///                        plan dimension (width|depth), when that dimension is known.
/// Otherwise it is LONG. Boundaries are exclusive: a span exactly at 2.5 m, or
/// exactly at half the room, classifies LONG. The room dimension is passed in as
/// plain metres so this logic carries NO RoomPlan dependency; a nil/≤0 room
/// dimension falls back to the absolute floor alone. `.height` anchors are never
/// "short spans".
nonisolated public enum AnchorCoach {

    /// Absolute short-span floor (metres). A span shorter than this is SHORT
    /// regardless of room size.
    public static let shortSpanCeilingMeters = 2.5
    /// Relative short-span floor as a fraction of the room's larger plan dimension.
    /// A span shorter than `halfRoomFraction × roomDim` is SHORT.
    public static let halfRoomFraction = 0.5

    /// Recipe target: ≥ this many LONG spans …
    public static let targetLongSpans = 2
    /// … and ≥ this many ceiling HEIGHT anchors.
    public static let targetHeights = 1

    public enum SpanLength: String, Sendable, Equatable { case short, long }

    /// Classify a committed span by length against the heuristic above.
    /// `roomLargerPlanDimensionMeters` is the greater of the room's plan
    /// width/depth in metres (nil ⇒ skip the relative floor).
    public static func classifySpan(lengthMeters: Double,
                                    roomLargerPlanDimensionMeters: Double?) -> SpanLength {
        if lengthMeters < AnchorCoach.shortSpanCeilingMeters { return .short }
        if let room = roomLargerPlanDimensionMeters, room > 0,
           lengthMeters < room * AnchorCoach.halfRoomFraction {
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
        /// completion gate.
        public var meetsRecipe: Bool {
            longSpanCount >= AnchorCoach.targetLongSpans && heightCount >= AnchorCoach.targetHeights
        }
    }

    /// Count LONG spans + HEIGHT anchors across the committed set. SHORT spans
    /// count toward neither (they are why the coach nudges).
    public static func summarize(anchors: [AnchorRecord],
                                 roomLargerPlanDimensionMeters: Double?) -> Progress {
        var longSpans = 0
        var heights = 0
        for anchor in anchors {
            switch anchor.spanKind {
            case .height:
                heights += 1
            case .span:
                if AnchorCoach.classifySpan(lengthMeters: anchor.modelSpanMeters,
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
        if progress.longSpanCount < AnchorCoach.targetLongSpans { return .addLongSpan }
        if progress.heightCount < AnchorCoach.targetHeights { return .addHeight }
        return .complete
    }

    /// 1-based position within the 3-anchor recipe (2 long + 1 height), capped at 3.
    public static func recipeStep(for progress: Progress) -> Int {
        let toward = min(progress.longSpanCount, AnchorCoach.targetLongSpans)
            + min(progress.heightCount, AnchorCoach.targetHeights)
        return min(toward + 1, 3)
    }
}

//  FieldVisitTelemetry.swift
//  CaptureKit
//
//  Spec §14. Field had never sent a single analytics event before wave 1, so
//  every tap count and target in this program is unfalsifiable without these.
//  The names and property keys ARE the contract — a dashboard reads them.
//
//  suggestion_confidence is deliberately absent from every property bag:
//  Principle 4 forbids the number on a designer surface, and a telemetry
//  property is exactly how one gets there.

import Foundation

/// The five numbers §14's `visit.end` carries. A value rather than five
/// parameters: the app-side reader that fills it is shared by every close site,
/// so the five travel together or they disagree.
public struct FieldVisitCounts: Equatable, Sendable {
    public let duration: TimeInterval
    public let captures: Int
    public let notes: Int
    public let scans: Int
    public let unplaced: Int

    public init(duration: TimeInterval, captures: Int, notes: Int,
                scans: Int, unplaced: Int) {
        self.duration = duration
        self.captures = captures
        self.notes = notes
        self.scans = scans
        self.unplaced = unplaced
    }
}

public enum FieldVisitTelemetry {
    public typealias Event = (name: String, properties: [String: String])

    public static func visitStart(kind: FieldVisitKind, kit: FieldVisitKit?,
                                  offline: Bool) -> Event {
        ("visit.start", ["kind": kind.rawValue,
                         "kit": kit?.rawValue ?? "none",
                         "offline": offline ? "true" : "false"])
    }

    /// FC-R21 part 3: `reason` is not optional. `visit.start` and `visit.end`
    /// only pair if every close emits, and a dashboard that cannot tell an
    /// explicit End from a visit that died in her pocket cannot read either.
    /// `duration_min` is WALL time from `startedAt` to the close, never
    /// idle-adjusted, whatever the reason.
    public static func visitEnd(_ counts: FieldVisitCounts,
                                reason: FieldVisitEndReason) -> Event {
        ("visit.end", ["duration_min": String(Int((counts.duration / 60).rounded())),
                       "captures": String(counts.captures),
                       "notes": String(counts.notes),
                       "scans": String(counts.scans),
                       "unplaced": String(counts.unplaced),
                       "reason": reason.rawValue])
    }

    public static func stalePrompt(answer: String) -> Event {
        ("visit.stale_prompt", ["answer": answer])
    }

    public static func suggestionShown(_ suggestion: CaptureSuggestion) -> Event {
        ("suggestion.shown", ["basis": suggestion.basis.rawValue])
    }

    public static func suggestionAccepted(_ suggestion: CaptureSuggestion) -> Event {
        ("suggestion.accepted", ["basis": suggestion.basis.rawValue])
    }

    /// Same event as `suggestionAccepted(_:)`, from the basis alone — for a
    /// caller (V1SessionTrayScreen) that has a `Specimen`, not a fresh
    /// `CaptureSuggestion`, and must not read `suggestionConfidence` just to
    /// build one: that number is CaptureKit-internal (Principle 4) and this
    /// signature is how a view-layer call site stays off that path entirely.
    public static func suggestionAccepted(basis: FieldSuggestionBasis) -> Event {
        ("suggestion.accepted", ["basis": basis.rawValue])
    }

    /// FC-R21 part 2: WHICH route emitted it. A capture born unplaced and filed
    /// later from the tray is the flow the visit spine exists to enable, and it
    /// emitted nothing at all — so the placed/unplaced ratio was biased against
    /// exactly that flow and a dashboard reading it would conclude the feature
    /// was not working.
    public enum PlacementSource: String, Sendable {
        /// C3's card commit or S3's destination choice — placed as it was taken.
        case capture
        /// Filed later, from V1's tray. A second, deliberate event about the
        /// same capture: it is the TRANSITION being counted, not the capture.
        case tray
    }

    public static func capturePlaced(basis: String, hasRoom: Bool,
                                     source: PlacementSource) -> Event {
        ("capture.placed", ["basis": basis,
                            "has_room": hasRoom ? "true" : "false",
                            "source": source.rawValue])
    }

    public static func captureUnplaced(source: PlacementSource) -> Event {
        ("capture.unplaced", ["source": source.rawValue])
    }

    /// FC-R21 part 1: the ONE predicate. Which of the pair fires is
    /// `Specimen.isUnplaced` AFTER the action, and no emitter may decide it for
    /// itself — `ViewfinderModel` read `isUnplaced` while `S3DestinationScreen`
    /// read `venue.projectId != nil`, so a Library capture with no project
    /// emitted opposite events depending on which route committed it and the
    /// placed/unplaced ratio meant two different things at once. Library owes
    /// no project, so such a capture is PLACED; only a destination that owes one
    /// and lacks one is unplaced.
    ///
    /// `has_room` is the ID lane (FC-R5): `project_rooms.id` is what reaches
    /// `field_captures.project_room_id`, and a typed room name can exist with
    /// no id.
    @MainActor
    public static func placement(_ specimen: Specimen, basis: String,
                                 source: PlacementSource) -> Event {
        specimen.isUnplaced
            ? captureUnplaced(source: source)
            : capturePlaced(basis: basis,
                            hasRoom: specimen.venue?.projectRoomId != nil,
                            source: source)
    }
}

public extension CaptureAnalytics {
    func emit(_ event: FieldVisitTelemetry.Event) {
        self.event(event.name, event.properties)
    }
}

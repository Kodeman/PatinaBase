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

public enum FieldVisitTelemetry {
    public typealias Event = (name: String, properties: [String: String])

    public static func visitStart(kind: FieldVisitKind, kit: FieldVisitKit?,
                                  offline: Bool) -> Event {
        ("visit.start", ["kind": kind.rawValue,
                         "kit": kit?.rawValue ?? "none",
                         "offline": offline ? "true" : "false"])
    }

    public static func visitEnd(duration: TimeInterval, captures: Int, notes: Int,
                                scans: Int, unplaced: Int) -> Event {
        ("visit.end", ["duration_min": String(Int((duration / 60).rounded())),
                       "captures": String(captures),
                       "notes": String(notes),
                       "scans": String(scans),
                       "unplaced": String(unplaced)])
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

    public static func capturePlaced(basis: String, hasRoom: Bool) -> Event {
        ("capture.placed", ["basis": basis, "has_room": hasRoom ? "true" : "false"])
    }

    public static let captureUnplaced: Event = ("capture.unplaced", [:])
}

public extension CaptureAnalytics {
    func emit(_ event: FieldVisitTelemetry.Event) {
        self.event(event.name, event.properties)
    }
}

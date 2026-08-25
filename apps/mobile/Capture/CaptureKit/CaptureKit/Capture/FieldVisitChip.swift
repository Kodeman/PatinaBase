//  FieldVisitChip.swift
//  CaptureKit
//
//  Spec §7.2. ViewfinderVenueChip stops being a placemark string and becomes
//  the visit chip: project on top, room beneath, tappable → V0.

import Foundation

public struct FieldVisitChip: Equatable, Sendable {
    public let primary: String
    public let secondary: String
    public let isUnplaced: Bool

    public init(primary: String, secondary: String, isUnplaced: Bool) {
        self.primary = primary
        self.secondary = secondary
        self.isUnplaced = isUnplaced
    }
}

public enum FieldVisitChipBuilder {
    public static func chip(for state: CaptureVisitState,
                            isLocating: Bool) -> FieldVisitChip {
        // `.stale` is still an OPEN visit — "Still at Maple St?" is the whole
        // point of the stale window, so the chip names it exactly as `.active`
        // does. Where the app LANDS on a stale visit is a launch-table question
        // and never reaches this decision.
        if let context = state.context, let kind = context.kind {
            switch kind {
            case .sourcing:
                return FieldVisitChip(primary: trimmed(context.label) ?? "Sourcing",
                                      secondary: "Library",
                                      isUnplaced: false)
            case .site:
                let project = trimmed(context.routing.projectName)
                    ?? trimmed(context.label)
                    ?? "This visit"
                return FieldVisitChip(primary: project,
                                      secondary: trimmed(context.routing.room) ?? "Whole house",
                                      isUnplaced: false)
            }
        }
        // FC-R2: no visit IS a null kind. A kindless context is plain routing
        // memory, so it must never render as a placed visit.
        //
        // The chip's subject is the VISIT, and the visit is read synchronously —
        // there is nothing here to wait for. So `isLocating` never changes a word:
        // it only withholds the terracotta alarm while the venue lookup is still
        // out. A transitional string must not name a lookup whose result this chip
        // discards — "Locating venue…" settling to "Not placed" reads as the
        // lookup having failed her, when nothing failed at all.
        return FieldVisitChip(primary: "Not placed",
                              secondary: "Tap to place",
                              isUnplaced: !isLocating)
    }

    private static func trimmed(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty else { return nil }
        return value
    }
}

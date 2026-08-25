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

/// The C3 / C5 placement line (spec §7.5). One line, always true.
///
/// Wave 1 shipped this line pointed at S1; wave 3 repoints it at the door (V0)
/// and keeps the copy honest. It reads `Specimen.isUnplaced` and never
/// re-derives placement — `status` and `remoteId` are a different axis, and the
/// line clears on PLACEMENT, never on sync.
public enum FieldPlacementLine {
    @MainActor
    public static func text(for specimen: Specimen) -> String {
        // Flow 2: the door keeps this promise for the capture in her hand — the
        // in-hand draft re-inherits the visit she starts there (ViewfinderModel),
        // so the words are honest. FC-R6 is untouched: an already-SAVED unplaced
        // capture still waits on Today until she files it from the tray.
        guard !isUnplaced(specimen) else { return "Not placed — tap to place" }
        let project = trimmed(specimen.venue?.projectName)
        let room = trimmed(specimen.venue?.room)
        // Spec Flow 6: an un-chipped market find filed to the Library shelf is
        // DONE. It is not adrift, so it is neither offered a placement nor given
        // a project it has not got — it is told where it actually landed.
        // Keyed on the project ID, the placement fact everywhere else, so a
        // chipped find whose NAME was never stamped keeps its room.
        guard specimen.destinationRequiresProject
                || trimmed(specimen.venue?.projectId) != nil else { return "Library" }
        return "\(project ?? "This project") · \(room ?? "Whole house")"
    }

    @MainActor
    public static func isUnplaced(_ specimen: Specimen) -> Bool { specimen.isUnplaced }

    private static func trimmed(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty else { return nil }
        return value
    }
}

/// How the visit door keeps the C3 line's promise for the capture STILL IN HER
/// HAND (spec Flow 2). "Tap to place" opens V0, and V0 commits a session
/// context — it touches no `Specimen` — so without this the draft she left on
/// the card would still read "Not placed — tap to place" when she came back.
///
/// FC-R6 is untouched: this is the UNSAVED draft only. An already-committed
/// unplaced capture still waits on Today until she files it from the tray.
public enum FieldInHandPlacement {
    /// Adopts the visit onto a draft that has none, exactly as `makeDraft()`
    /// does at the shutter — session id, routing, destination, then the visit
    /// stamp — so a capture taken a second before the door opened is
    /// indistinguishable from one taken a second after.
    ///
    /// The session id travels with the rest: a draft left carrying the OLD id
    /// while displaying the NEW visit's project is the split Invariant V forbids,
    /// and V4 and the Visits block group by the visit a capture was taken in.
    ///
    /// A draft that already carries a project is left alone: she may have set it
    /// per-capture in S1, and the visit must not overwrite a narrower answer.
    /// Returns whether the draft adopted the visit.
    @MainActor
    @discardableResult
    public static func adopt(_ state: CaptureVisitState, into draft: Specimen) -> Bool {
        // FC-R2: a kindless context is routing memory, not a visit — the same
        // guard the chip applies, so the chip and the card cannot disagree about
        // whether there is a visit to inherit.
        guard draft.isUnplaced, let context = state.context, context.kind != nil else { return false }
        draft.captureSessionID = context.visitID
        draft.venue = context.routing.stamped(onto: draft.venue ?? VenueStamp())
        draft.destination = context.routing.destination
        draft.inherit(context)
        return true
    }
}

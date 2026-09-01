//  FieldVerbMenu.swift
//  CaptureKit
//
//  The three field verbs — a note in the Document · a task · a punch item — as
//  a state machine the view renders rather than owns. Extracted from
//  SmartGuessSheet (N5) so the C3 quick-confirm card can mount the SAME menu:
//  I-4's gap was that N5 has no production presenter, and Kody ruled the verbs
//  onto the card every capture already shows after the shutter.
//
//  Nothing here writes. A tap returns the ACTION its host performs against
//  Specimen's own request lanes (`requestMarginNote` / `requestPunchTask`), so
//  the wave-4 write path stays exactly as it shipped and was reviewed.
//
//  FC-R16 is honoured by omission and pinned by test: there is no action here
//  that can touch a measurement, so a spoken number reaching this menu becomes
//  words in a note or a task and never a measured record.

import Foundation

/// Every string the menu can say. Pinned in a test for the same reason
/// `PunchCourtCopy` is — a verb that names a landing it did not make is the
/// failure §3.3 forbids.
public enum FieldVerbCopy {
    public static let note = "Make it a note in the Document"
    /// Ruling 1: inside a placed visit the drain already filed it, so this row
    /// is state, not an action. Offering the verb here would either write a
    /// second note or do nothing, and both teach her that the menu lies.
    public static let noteFiled = "Filed in the Document."
    public static let task = "Make it a task"
    public static let punch = "Make it a punch item"
    /// Both writes need a project_id. Said plainly rather than shown as a dead
    /// row. (Filing an unplaced note is FC-R6's Today flow, not this card's.)
    public static let needsProject = "Put this on a project first."
}

/// What the menu shows, in order. `noteFiled` / `punchFiled` / `needsProject`
/// are statements; the rest are verbs.
public enum FieldVerbRow: String, Equatable, Sendable, CaseIterable {
    case note
    case noteFiled
    case task
    case punchFiled
    case punch
    case needsProject

    public var isVerb: Bool {
        switch self {
        case .note, .task, .punch: return true
        case .noteFiled, .punchFiled, .needsProject: return false
        }
    }

    public var title: String {
        switch self {
        case .note:         return FieldVerbCopy.note
        case .noteFiled:    return FieldVerbCopy.noteFiled
        case .task:         return FieldVerbCopy.task
        case .punchFiled:   return PunchCourtCopy.punchFiledMenuRow
        case .punch:        return FieldVerbCopy.punch
        case .needsProject: return FieldVerbCopy.needsProject
        }
    }
}

/// The write a tap asks its host to make. The owner/party pair is resolved
/// here so the host never re-decides a court that was already shown to her.
public enum FieldVerbAction: Equatable, Sendable {
    case note
    case punchTask(owner: String, partyID: String?)
}

/// Where the punch lane stands. The note lane has no confirm step and no
/// status line, so it is expressed by which row the menu renders.
public enum FieldVerbPhase: Equatable, Sendable {
    case idle
    case confirming(PunchCourt)
    case writing
    case filed
}

/// The specimen facts the menu reads, lifted off `Specimen` so the whole state
/// machine is testable without a SwiftData store.
public struct FieldVerbFacts: Equatable, Sendable {
    public let hasProject: Bool
    /// `marginNoteId != nil` — the sheet's own predicate. A requested note is
    /// shown as filed whatever its lane state, because the automatic in-visit
    /// note (ruling 1) is the common case and a second request is a no-op.
    public let noteRequested: Bool
    public let punchRequested: Bool
    public let punchState: FieldWriteState?
    public let punchOwnerRaw: String?
    public let punchPartyID: String?
    /// True once the party fetch has come BACK — success, empty, or failure.
    /// The list alone cannot stand in for it: an empty list is what an
    /// in-flight fetch and a project with no GC both look like, and
    /// `PunchCourtResolver` reads both as `.noCourt`. Tapping the punch verb in
    /// that window would file her own task and tell her there is no general
    /// contractor — a fact about the network stated as a fact about the
    /// project. Mirrors `ViewfinderModel.venueSettled`, which exists for the
    /// same reason on the same screen.
    public let partiesSettled: Bool

    public init(
        hasProject: Bool,
        noteRequested: Bool = false,
        punchRequested: Bool = false,
        punchState: FieldWriteState? = nil,
        punchOwnerRaw: String? = nil,
        punchPartyID: String? = nil,
        partiesSettled: Bool = true
    ) {
        self.hasProject = hasProject
        self.noteRequested = noteRequested
        self.punchRequested = punchRequested
        self.punchState = punchState
        self.punchOwnerRaw = punchOwnerRaw
        self.punchPartyID = punchPartyID
        self.partiesSettled = partiesSettled
    }

    /// `partiesSettled` has no default here: it is a fact about the host's
    /// fetch, not about the specimen, and a surface that forgets to say gets
    /// the race rather than a compiler error.
    public init(specimen: Specimen, partiesSettled: Bool) {
        self.init(
            hasProject: specimen.venue?.projectId?.isEmpty == false,
            noteRequested: specimen.marginNoteId != nil,
            punchRequested: specimen.punchTaskId != nil,
            punchState: specimen.punchTaskState,
            punchOwnerRaw: specimen.punchTaskOwnerRaw,
            punchPartyID: specimen.punchTaskPartyId,
            partiesSettled: partiesSettled)
    }
}

public struct FieldVerbMenu: Equatable, Sendable {
    /// Set the moment the punch verb is tapped and cleared by `confirmPunch()`
    /// or `cancelPunch()`. Non-nil IS the confirm step: FC-R7's punch never
    /// writes without one, because the row can end in a text to the GC.
    public private(set) var pendingPunch: PunchCourt?

    public init() {}

    // MARK: - What the menu shows

    public func rows(_ facts: FieldVerbFacts) -> [FieldVerbRow] {
        var rows: [FieldVerbRow] = [facts.noteRequested ? .noteFiled : .note]
        guard facts.hasProject else {
            rows.append(.needsProject)
            return rows
        }
        rows.append(.task)
        // I-5: the lane re-opens for a deliberate second item, which is right —
        // but silently, so the first filing had to be remembered rather than
        // read. Same shape as the note branch's landed row, above.
        if facts.punchState == .written { rows.append(.punchFiled) }
        rows.append(.punch)
        return rows
    }

    /// `requestPunchTask` is a no-op while the lane is open — an id is minted
    /// and has not landed — so a tap the model will swallow must not be
    /// offered. A lane whose task has landed is free again (I-5).
    public func punchVerbsAreEnabled(_ facts: FieldVerbFacts) -> Bool {
        !facts.punchRequested || facts.punchState == .written
    }

    public func isEnabled(_ row: FieldVerbRow, _ facts: FieldVerbFacts) -> Bool {
        switch row {
        case .note:  return !facts.noteRequested
        case .task:  return punchVerbsAreEnabled(facts)
        // The punch verb — and ONLY the punch verb — waits for the party list.
        // *Make it a task* is hers by definition and consults no court, so it
        // has nothing to wait for.
        case .punch: return punchVerbsAreEnabled(facts) && facts.partiesSettled
        case .noteFiled, .punchFiled, .needsProject: return false
        }
    }

    /// The punch lane's phase — the only lane on this menu with a confirm step
    /// and a status line.
    public func phase(_ facts: FieldVerbFacts) -> FieldVerbPhase {
        if let pendingPunch { return .confirming(pendingPunch) }
        switch facts.punchState {
        case .pending, .writing: return .writing
        case .written:           return .filed
        default:                 return .idle
        }
    }

    // MARK: - Taps

    /// Returns the write to make, or nil when the tap only moved the menu (the
    /// punch verb, which opens the confirm step) or was not actionable.
    public mutating func tap(
        _ row: FieldVerbRow,
        facts: FieldVerbFacts,
        parties: [FieldPartyRef]
    ) -> FieldVerbAction? {
        guard isEnabled(row, facts) else { return nil }
        switch row {
        case .note:
            return .note
        case .task:
            return .punchTask(owner: "designer", partyID: nil)
        case .punch:
            pendingPunch = PunchCourtResolver.resolve(parties: parties)
            return nil
        case .noteFiled, .punchFiled, .needsProject:
            return nil
        }
    }

    public mutating func confirmPunch() -> FieldVerbAction? {
        guard let court = pendingPunch else { return nil }
        pendingPunch = nil
        // Ruling 2: with no reachable GC this is written as HER task — which is
        // exactly what the intent line already told her would happen.
        switch court {
        case .reachable(let party): return .punchTask(owner: "gc", partyID: party.id)
        case .noCourt:              return .punchTask(owner: "designer", partyID: nil)
        }
    }

    public mutating func cancelPunch() { pendingPunch = nil }

    // MARK: - Lines

    /// An INTENTION, read at tap time. `fc_dispatch_task_assignment` re-reads
    /// the party's real consent when the row is finally written.
    public var intentLine: String? {
        pendingPunch.map(PunchCourtCopy.intent(for:))
    }

    public func statusLine(_ facts: FieldVerbFacts, parties: [FieldPartyRef]) -> String? {
        switch facts.punchState {
        case .refused:
            // Reports only. The degrade write already happened on the drain
            // (ruling 3), because this card may never be on screen when the
            // refusal arrives.
            return PunchCourtCopy.refusedTask
        case .written:
            return PunchCourtCopy.filed(for: filedCourt(facts, parties: parties))
        default:
            return nil
        }
    }

    /// The court as the WRITTEN row records it, not as this session resolved
    /// it: the card can be reopened after a relaunch, long after the resolve.
    public func filedCourt(_ facts: FieldVerbFacts, parties: [FieldPartyRef]) -> PunchCourt {
        guard facts.punchOwnerRaw == "gc",
              let partyID = facts.punchPartyID,
              let party = parties.first(where: { $0.id == partyID })
        else { return .noCourt }
        return .reachable(party)
    }
}

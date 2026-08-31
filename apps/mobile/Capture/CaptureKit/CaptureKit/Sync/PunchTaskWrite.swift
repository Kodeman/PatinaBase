//  PunchTaskWrite.swift
//  CaptureKit
//
//  FC-R7: a Field punch item is a project_tasks row owned by the GC, riding
//  the party-anchored SMS rail — never a client_decisions row.
//
//  Nothing here sends anything. The device writes a row; the AFTER INSERT
//  trigger fc_task_assignment_dispatch (00284:207-210) invokes sms-dispatch,
//  and only for a party whose kind is dispatchable AND whose
//  sms_consent_status is 'granted' (00284:172-179). field-daily then re-lists
//  the same open task in that party's digest (core.ts:177-181). Both hops run
//  under _shared/sms.ts's consent, quiet-hours and sms_messages logging.
//
//  PunchCourtResolver is a NARROWED mirror of that gate (ruling 2): a Field
//  punch goes to the GC with texting on, or it is not a punch at all. The
//  trigger admits four kinds; picking among them by array order would text
//  whichever trade came back first, and an app that names a party it did not
//  actually route to is exactly the lie §3.3 forbids.
//
//  ⚠ project_tasks has NO room column and wave 4 does not add one. The room
//  rides in `description`, on its own line. Adding room_id would be a ruling
//  about the project_rooms / public.rooms split (FC-R5) taken under deadline.

import Foundation

public struct FieldPartyRef: Codable, Hashable, Sendable {
    public let id: String
    public let displayName: String
    public let partyKind: String
    public let smsConsentGranted: Bool

    public init(id: String, displayName: String, partyKind: String, smsConsentGranted: Bool) {
        self.id = id
        self.displayName = displayName
        self.partyKind = partyKind
        self.smsConsentGranted = smsConsentGranted
    }
}

public enum PunchCourt: Equatable, Sendable {
    case reachable(FieldPartyRef)
    case noCourt

    public var party: FieldPartyRef? {
        switch self {
        case .reachable(let p): return p
        case .noCourt: return nil
        }
    }
}

public enum PunchCourtResolver {
    /// fc_dispatch_task_assignment will text any of these (00284:174). Kept as
    /// the documented mirror of the trigger — and pinned by a test — but NOT
    /// used as this resolver's filter.
    public static let dispatchableKinds: Set<String> = ["gc", "sub", "installer", "receiver"]

    /// FC-R7 ruled a FIELD punch is the GC's court, and ruling 2 (2026-08-24)
    /// closed the `court_party_id` question the same way: GC or nobody, no
    /// picker in v1. Taking the first consented candidate out of the four
    /// dispatchable kinds would text whichever trade the query happened to
    /// return first — a send to a party she never named, decided by array
    /// order. Consent is part of the filter because a GC with texting off is
    /// unreachable twice: the trigger returns early, and field-daily's digest
    /// filters on owner_party_id too.
    public static let punchCourtKind = "gc"

    public static func resolve(parties: [FieldPartyRef]) -> PunchCourt {
        guard let gc = parties.first(where: {
            $0.partyKind == punchCourtKind && $0.smsConsentGranted
        }) else { return .noCourt }
        return .reachable(gc)
    }
}

public struct PunchTaskWriteRequest: Encodable, Equatable, Sendable {
    public let id: UUID
    public let projectID: UUID
    public let title: String
    public let description: String
    public let status: String
    public let owner: String
    public let ownerPartyID: String?
    public let sectionKey: String?
    public let createdBy: UUID
    public let fieldCaptureID: UUID

    enum CodingKeys: String, CodingKey {
        case id, title, description, status, owner
        case projectID = "project_id"
        case ownerPartyID = "owner_party_id"
        case sectionKey = "section_key"
        case createdBy = "created_by"
        case fieldCaptureID = "field_capture_id"
    }
}

public enum PunchTaskComposer {
    private static let fallbackTitle = "From a site visit"
    private static let titleLimit = 80

    /// The first sentence, sentence-cased, clipped to something that reads in a
    /// list. The WHOLE transcript still travels in `description` — a title is a
    /// label, not the record.
    public static func title(from transcript: String?) -> String {
        let text = (transcript ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return fallbackTitle }

        var candidate = text
        if let stop = text.firstIndex(where: { $0 == "." || $0 == "\n" }) {
            let head = String(text[text.startIndex...stop])
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if head.count > 1 { candidate = head }
        }

        if candidate.count > titleLimit {
            let cut = candidate.index(candidate.startIndex, offsetBy: titleLimit - 1)
            candidate = String(candidate[candidate.startIndex..<cut])
                .trimmingCharacters(in: .whitespaces) + "…"
        }

        guard let first = candidate.first else { return fallbackTitle }
        return String(first).uppercased() + candidate.dropFirst()
    }

    private static func describe(transcript: String?, roomName: String?) -> String {
        let body = (transcript ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let room = (roomName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if body.isEmpty { return room }
        if room.isEmpty { return body }
        return "\(body)\n\(room)"
    }

    // The parameter lists below ARE the project_tasks contract Task 11 calls —
    // do not collapse them into a struct to satisfy the linter.
    // swiftlint:disable function_parameter_count

    public static func task(
        id: UUID,
        projectID: UUID,
        createdBy: UUID,
        fieldCaptureID: UUID,
        transcript: String?,
        roomName: String?
    ) -> PunchTaskWriteRequest {
        PunchTaskWriteRequest(
            id: id,
            projectID: projectID,
            title: title(from: transcript),
            description: describe(transcript: transcript, roomName: roomName),
            status: "todo",
            owner: "designer",
            ownerPartyID: nil,
            sectionKey: nil,
            createdBy: createdBy,
            fieldCaptureID: fieldCaptureID)
    }

    /// `courtPartyID` is NON-optional on purpose (ruling 2). A gc-owned row with
    /// a null owner_party_id reaches no trigger (00284:161) and no daily digest
    /// (field-daily/core.ts:177-181) — it is a punch item nobody will ever see.
    /// With no reachable GC the caller writes `task(...)` instead.
    public static func punch(
        id: UUID,
        projectID: UUID,
        createdBy: UUID,
        fieldCaptureID: UUID,
        transcript: String?,
        roomName: String?,
        courtPartyID: String
    ) -> PunchTaskWriteRequest {
        PunchTaskWriteRequest(
            id: id,
            projectID: projectID,
            title: title(from: transcript),
            description: describe(transcript: transcript, roomName: roomName),
            status: "todo",
            owner: "gc",
            ownerPartyID: courtPartyID,
            sectionKey: "install",
            createdBy: createdBy,
            fieldCaptureID: fieldCaptureID)
    }

    // swiftlint:enable function_parameter_count
}

/// The one place the app talks to a designer about whether a text went out.
///
/// The tense change between `intent` and `filed` is load-bearing. She reads the
/// intent line at TAP time, off the device's cached sms_consent_status; the row
/// is written at DRAIN time, which may be a tunnel and a night later; and the
/// send is decided later still, server-side, by fc_dispatch_task_assignment
/// re-reading the party's real consent (00284:160-203). Consent can flip either
/// way in between. So the pre-tap line promises an intention and the card states
/// the fact only once the row exists.
public enum PunchCourtCopy {
    /// BEFORE she taps Add. The row does not exist yet and the send is the
    /// database's to make later, so this is an intention, not a receipt.
    public static func intent(for court: PunchCourt) -> String {
        switch court {
        case .reachable(let party):
            return "\(party.displayName) will get a text."
        case .noCourt:
            // Ruling 2: a gc-owned row with no party reaches no trigger and no
            // digest, so it is filed as hers rather than pretending at a court.
            // There is deliberately no "filed for <GC>" line — naming a party
            // who will never see it is the failure §3.3 forbids.
            return "No general contractor with texting on this project — this stays as your task."
        }
    }

    /// AFTER the drain reports punchTaskState == .written. Now the row exists
    /// and the trigger has had its say, so the past tense is earned.
    public static func filed(for court: PunchCourt) -> String {
        switch court {
        case .reachable(let party): return "Filed. \(party.displayName) was texted."
        case .noCourt:              return "Filed as your task."
        }
    }

    /// FC-R8, per-designer in v1: a studio co-member's insert into
    /// project_tasks raises 42501, and the honest fallback is the note lane —
    /// which margin_notes_designer_all DOES admit from her, because that policy
    /// keys on the note's own designer_id, not the project's. The drain itself
    /// performs that write (ruling 3); this line only reports it.
    public static let refusedTask =
        "Tasks on this project belong to its designer of record. "
        + "Saved as a note in the Document instead."
}

public protocol PunchTaskGateway: Sendable {
    func existingProjectTask(id: UUID) async throws -> Bool
    func insertProjectTask(_ request: PunchTaskWriteRequest) async throws
}

public struct PunchTaskOrchestrator: Sendable {
    private let gateway: any PunchTaskGateway

    public init(gateway: any PunchTaskGateway) {
        self.gateway = gateway
    }

    public func write(_ request: PunchTaskWriteRequest) async throws -> FieldWriteOutcome {
        if try await gateway.existingProjectTask(id: request.id) {
            return .alreadyWritten
        }
        try await gateway.insertProjectTask(request)
        return .written
    }
}

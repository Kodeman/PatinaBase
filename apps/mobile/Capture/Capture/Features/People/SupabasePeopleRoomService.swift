//  SupabasePeopleRoomService.swift
//  Capture · W5 (the People room, on the job)
//
//  The real `PeopleRoomService`: PostgREST reads against the app's single
//  authenticated supabase-swift client. Every scope is RLS, server-side —
//  `people_directory_seats` and `people_directory` are `security_invoker`
//  (00626) and `project_site_access_cards` is studio-only with no client leg
//  (00625, PR-w), so there is no client-side filtering here and there must not
//  be any.
//
//  PR-t IS IN THE SELECT LIST: `project_party_authority.threshold_cents` is
//  never fetched. The figure is not hidden on this surface, it never arrives on
//  it — the phone reads `scope` and `prepares_only` and says the yes or the no.
//
//  PR-r IS IN THE SCHEMA: `project_site_access_cards` has no code column, and
//  every free-text field it does have goes through
//  `FieldSiteAccessRules.withholding` on the way to a screen, so a code typed
//  into the notes at the desk still never reaches a job site.

import Foundation
import Supabase
import CaptureKit

private enum PeopleRoomError: LocalizedError {
    case unavailable
    case changed
    case noCard

    var errorDescription: String? {
        switch self {
        case .unavailable: return "Choose a workspace before opening the roster."
        case .changed:     return "Your account or workspace changed while this was loading."
        case .noCard:      return "No site access card on this job yet."
        }
    }
}

struct SupabasePeopleRoomService: PeopleRoomService {
    let client: SupabaseClient
    let session: any SessionProviding
    /// Where a field link is read — the same origin `_shared/sms.ts` composes.
    let linkBaseURL: URL

    private static let seatColumns = """
        seat_id, person_id, project_id, project_name, party_kind, display_name, \
        trade, stage, on_site_from, on_site_to, company_name, off_job_at, \
        off_job_reason, phone_e164, consent_status, reach_state, paper_state, \
        contact_rule_summary
        """

    // MARK: Roster

    func roster(projectID: String) async throws -> FieldProjectRoster {
        let owner = try await requireOwner()
        let rows: [SeatRow] = try await client
            .from("people_directory_seats")
            .select(Self.seatColumns)
            .eq("project_id", value: projectID)
            .order("on_site_from", ascending: true)
            .execute()
            .value
        let card = try? await siteAccess(projectID: projectID)
        try await confirm(owner)
        return FieldProjectRoster(
            projectID: projectID,
            projectName: rows.first?.projectName ?? "This job",
            siteHeadLine: card.flatMap { headLine(for: $0) },
            seats: rows.map { $0.seat })
    }

    private func headLine(for card: FieldSiteAccessCard) -> String? {
        FieldSiteAccessRules.headLine(
            keyHolderName: card.keyHolderName,
            gateControl: card.gateControl,
            changedAt: card.changedAt ?? card.notices.first?.when)
    }

    // MARK: A person

    func person(projectID: String, personID: String) async throws -> FieldPersonCard {
        let owner = try await requireOwner()
        let row: DirectoryRow = try await client
            .from("people_directory")
            .select("id, name, company_name, role, reach_state, consent_status, "
                + "paper_state, contact_rule_summary")
            .eq("id", value: personID)
            .single()
            .execute()
            .value
        async let channels = fetchChannels(personID: personID)
        async let seats = fetchSeats(personID: personID)
        let seatRows = try await seats
        async let authority = fetchAuthority(seatIDs: seatRows.map(\.seatID))
        let card = try await FieldPersonCard(
            personID: row.id,
            name: row.name ?? "Someone on this job",
            firmName: row.companyName,
            roleAtFirm: row.role,
            reachWord: FieldPeopleVocabulary.reach(row.reachState),
            consentWord: FieldPeopleVocabulary.consent(row.consentStatus),
            paperWord: FieldPeopleVocabulary.paper(row.paperState),
            channels: channels,
            contactRule: row.contactRuleSummary,
            seats: seatRows.map(\.personSeatLine),
            authorityWords: authority)
        try await confirm(owner)
        return card
    }

    private func fetchChannels(personID: String) async throws -> [FieldPersonChannel] {
        let rows: [ChannelRow] = try await client
            .from("studio_contact_channels")
            .select("id, channel_kind, value, sms_capable, preferred, status")
            .eq("owner_id", value: personID)
            .eq("owner_type", value: "person")
            .order("preferred", ascending: false)
            .execute()
            .value
        return rows.map { $0.channel }
    }

    private func fetchSeats(personID: String) async throws -> [SeatRow] {
        try await client
            .from("people_directory_seats")
            .select(Self.seatColumns)
            .eq("person_id", value: personID)
            .order("on_site_from", ascending: false)
            .execute()
            .value
    }

    /// PR-t: `threshold_cents` is absent from this select list on purpose.
    private func fetchAuthority(seatIDs: [String]) async throws -> [String] {
        guard !seatIDs.isEmpty else { return [] }
        let rows: [AuthorityRow] = try await client
            .from("project_party_authority")
            .select("id, engagement_id, scope, prepares_only")
            .in("engagement_id", values: seatIDs)
            .execute()
            .value
        return FieldAuthorityWords.phoneSafe(lines: rows.map {
            FieldAuthorityWords.sentence(scope: $0.scope, preparesOnly: $0.preparesOnly)
        })
    }

    // MARK: The way in

    func siteAccess(projectID: String) async throws -> FieldSiteAccessCard {
        let owner = try await requireOwner()
        let rows: [SiteAccessRow] = try await client
            .from("project_site_access_cards")
            .select("id, project_id, lockbox_version, site_hours, site_notes, "
                + "emergency_lines, receiver_instructions, changed_at, "
                + "key_holder_engagement_id")
            .eq("project_id", value: projectID)
            .limit(1)
            .execute()
            .value
        guard let row = rows.first else { throw PeopleRoomError.noCard }
        let keyHolder = try await fetchKeyHolder(seatID: row.keyHolderEngagementID)
        let name = try await fetchProjectName(projectID: projectID)
        try await confirm(owner)
        return row.card(projectName: name ?? keyHolder?.projectName ?? "This job",
                        keyHolder: keyHolder)
    }

    /// The card carries no address column of its own (00625); the job's name is
    /// what the head prints.
    private func fetchProjectName(projectID: String) async throws -> String? {
        let rows: [PeopleProjectNameRow] = try await client
            .from("projects")
            .select("id, name")
            .eq("id", value: projectID)
            .limit(1)
            .execute()
            .value
        return rows.first?.name
    }

    private func fetchKeyHolder(seatID: String?) async throws -> SeatRow? {
        guard let seatID else { return nil }
        let rows: [SeatRow] = try await client
            .from("people_directory_seats")
            .select(Self.seatColumns)
            .eq("seat_id", value: seatID)
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    // MARK: The two writes

    /// W3/W4 own `record_notice`; this is its one caller on a phone. Until that
    /// RPC lands the call answers with PostgREST's own error, which the screen
    /// prints and the queue retries — it never reports a write that did not
    /// happen.
    func recordNotice(_ draft: FieldSiteNoticeDraft) async throws -> FieldSiteNotice {
        _ = try await requireOwner()
        let params = RecordNoticeParams(projectID: draft.projectID, what: draft.what,
                                        told: draft.toldSeatIDs)
        let response: NoticeRow = try await client
            .rpc("record_notice", params: params)
            .single()
            .execute()
            .value
        return response.notice(fallback: draft)
    }

    /// PR-s: the card and the seat are made in the same moment, then the link.
    func mintFieldLink(_ request: FieldLinkMintRequest) async throws -> FieldLinkMint {
        let owner = try await requireOwner()
        let cardPayload = NewCardPayload(
            organizationID: owner.workspaceID, entityKind: "person",
            contactKind: request.partyKind, fullName: request.fullName,
            companyName: request.firmName, phone: request.phone)
        let card: InsertedRow = try await client
            .from("studio_contacts")
            .insert(cardPayload)
            .select("id")
            .single()
            .execute()
            .value
        let seat = try await insertSeat(request, cardID: card.id)
        let link: [FieldLinkRow] = try await client
            .rpc("create_field_link", params: CreateFieldLinkParams(partyID: seat.id))
            .execute()
            .value
        guard let token = link.first?.token else { throw PeopleRoomError.noCard }
        return mint(seatID: seat.id, cardID: card.id, token: token,
                    endsAt: ProjectsWireDate.parse(seat.onSiteTo))
    }

    private func insertSeat(_ request: FieldLinkMintRequest,
                            cardID: String) async throws -> InsertedRow {
        let payload = NewSeatPayload(
            projectID: request.projectID, partyKind: request.partyKind,
            displayName: request.fullName, companyName: request.firmName,
            phone: request.phone, trade: request.trade,
            studioContactID: cardID, stage: "active")
        return try await client
            .from("project_parties")
            .insert(payload)
            .select("id, on_site_to")
            .single()
            .execute()
            .value
    }

    private func mint(seatID: String, cardID: String,
                      token: String, endsAt: Date?) -> FieldLinkMint {
        let base = linkBaseURL.absoluteString.hasSuffix("/")
            ? String(linkBaseURL.absoluteString.dropLast())
            : linkBaseURL.absoluteString
        let sentence = endsAt.map { "Ends with the job, \(FieldPeopleDates.long($0))." }
            ?? "Ends when the job's window closes. It renews when they use it."
        return FieldLinkMint(seatID: seatID, personID: cardID,
                             url: "\(base)/field/\(token)",
                             expiresAt: endsAt, expirySentence: sentence)
    }

    // MARK: Owner

    private func requireOwner() async throws -> CaptureOwnerIdentity {
        guard let owner = await session.ownerIdentity else { throw PeopleRoomError.unavailable }
        return owner
    }

    private func confirm(_ owner: CaptureOwnerIdentity) async throws {
        guard await session.ownerIdentity == owner else { throw PeopleRoomError.changed }
    }
}

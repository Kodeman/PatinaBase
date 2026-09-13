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
    case notOnThisJob
    case noLink

    var errorDescription: String? {
        switch self {
        case .unavailable:   return "Choose a workspace before opening the roster."
        case .changed:       return "Your account or workspace changed while this was loading."
        case .noCard:        return "No site access card on this job yet."
        case .notOnThisJob:  return "That person is not on this job."
        case .noLink:        return "The link did not come back, so nobody was added. Try again."
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

    /// `people_directory` is STUDIO-WIDE, so the identity row is never the gate:
    /// the seats are. Field is the job in front of the designer
    /// (ux-4-field-mobile §5, direction §8 P3), so a person opens only through a
    /// seat on THIS project, and an id from another job answers "not on this
    /// job" rather than a card.
    func person(projectID: String, personID: String) async throws -> FieldPersonCard {
        let owner = try await requireOwner()
        let seatRows = try await fetchSeats(personID: personID)
        guard seatRows.contains(where: { $0.projectID == projectID }) else {
            throw PeopleRoomError.notOnThisJob
        }
        async let channels = fetchChannels(personID: personID)
        async let authority = fetchAuthority(seatIDs: seatRows.map(\.seatID))
        let row: DirectoryRow = try await client
            .from("people_directory")
            .select("id, name, company_name, role, reach_state, consent_status, "
                + "paper_state, contact_rule_summary")
            .eq("id", value: personID)
            .single()
            .execute()
            .value
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
                + "changed_by, told_refs, key_holder_engagement_id")
            .eq("project_id", value: projectID)
            .limit(1)
            .execute()
            .value
        guard let row = rows.first else { throw PeopleRoomError.noCard }
        let keyHolder = try await fetchKeyHolder(seatID: row.keyHolderEngagementID)
        let name = try await fetchProjectName(projectID: projectID)
        let changedBy = await fetchProfileName(profileID: row.changedBy)
        let told = await fetchToldNames(projectID: projectID, refs: row.toldRefs ?? [])
        try await confirm(owner)
        return row.card(projectName: name ?? keyHolder?.projectName ?? "This job",
                        keyHolder: keyHolder,
                        changedByName: changedBy,
                        toldNames: told)
    }

    /// Who made the last change to the way in. A name the card could not resolve
    /// prints as no name at all rather than an id or a failed load.
    private func fetchProfileName(profileID: String?) async -> String? {
        guard let profileID else { return nil }
        let rows: [PeopleProfileNameRow]? = try? await client
            .from("profiles")
            .select("id, display_name, full_name")
            .eq("id", value: profileID)
            .limit(1)
            .execute()
            .value
        return rows?.first?.name
    }

    /// `told_refs` carries person-card OR seat ids (00625), so both legs of this
    /// project's own seats are matched. A ref this project does not hold is
    /// dropped rather than resolved studio-wide — Field stays on the job.
    private func fetchToldNames(projectID: String, refs: [String]) async -> [String] {
        guard !refs.isEmpty else { return [] }
        let rows: [SeatRow]? = try? await client
            .from("people_directory_seats")
            .select(Self.seatColumns)
            .eq("project_id", value: projectID)
            .execute()
            .value
        guard let rows else { return [] }
        let wanted = Set(refs.map { $0.lowercased() })
        return rows
            .filter { wanted.contains($0.seatID.lowercased())
                || ($0.personID.map { wanted.contains($0.lowercased()) } ?? false) }
            .compactMap(\.displayName)
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
    ///
    /// Three writes with no transaction between them, so each later failure
    /// undoes the earlier ones: a half-made person — a card with no seat, or a
    /// seat with no link — is worse on a roster than nothing at all, and there
    /// is no screen anywhere in Field that could clean one up.
    func mintFieldLink(_ request: FieldLinkMintRequest) async throws -> FieldLinkMint {
        let owner = try await requireOwner()
        let card = try await insertCard(request, owner: owner)
        let seat: InsertedRow
        do {
            seat = try await insertSeat(request, cardID: card.id)
        } catch {
            await undo(cardID: card.id)
            throw error
        }
        do {
            let link: [FieldLinkRow] = try await client
                .rpc("create_field_link", params: CreateFieldLinkParams(partyID: seat.id))
                .execute()
                .value
            guard let token = link.first?.token else { throw PeopleRoomError.noLink }
            return mint(seatID: seat.id, cardID: card.id, token: token,
                        windowEnd: seat.windowEnd)
        } catch {
            await undo(seatID: seat.id)
            await undo(cardID: card.id)
            throw error
        }
    }

    private func insertCard(_ request: FieldLinkMintRequest,
                            owner: CaptureOwnerIdentity) async throws -> InsertedRow {
        let payload = NewCardPayload(
            organizationID: owner.workspaceID, entityKind: "person",
            contactKind: request.partyKind, fullName: request.fullName,
            companyName: request.firmName, phone: request.phone)
        return try await client
            .from("studio_contacts")
            .insert(payload)
            .select("id")
            .single()
            .execute()
            .value
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
            .select("id, on_site_to, warranty_until")
            .single()
            .execute()
            .value
    }

    /// Best effort, and deliberately so: the caller is already throwing the
    /// failure that mattered, and a cleanup that cannot reach the studio must
    /// not replace it with its own.
    private func undo(cardID: String) async {
        _ = try? await client.from("studio_contacts").delete().eq("id", value: cardID).execute()
    }

    private func undo(seatID: String) async {
        _ = try? await client.from("project_parties").delete().eq("id", value: seatID).execute()
    }

    /// PR-d: the date the RPC actually stamped, computed the way the RPC
    /// computes it (`FieldLinkExpiry`, mirroring 00627) — `create_field_link`
    /// returns only `(id, token)`, so there is no expiry on the wire to read.
    /// A seat made here carries no window, which is the ninety-day branch, and
    /// the sentence now says that date instead of describing a window that does
    /// not exist.
    private func mint(seatID: String, cardID: String,
                      token: String, windowEnd: Date?) -> FieldLinkMint {
        let base = linkBaseURL.absoluteString.hasSuffix("/")
            ? String(linkBaseURL.absoluteString.dropLast())
            : linkBaseURL.absoluteString
        let window = FieldLinkExpiry.resolve(windowEnd: windowEnd)
        return FieldLinkMint(seatID: seatID, personID: cardID,
                             url: "\(base)/field/\(token)",
                             expiresAt: window.endsAt, expirySentence: window.sentence)
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

//  PeopleRoomWire.swift
//  Capture · W5 (the People room, on the job)
//
//  The PostgREST row and payload shapes behind `SupabasePeopleRoomService`.
//  Explicit `CodingKeys` naming literal columns — the SDK decoder applies no key
//  strategy, the same idiom `SupabaseProjectsService` uses. Dates arrive as
//  strings in two shapes (TIMESTAMPTZ and bare DATE) and go through
//  `ProjectsWireDate`.
//
//  Note what is NOT here: no `threshold_cents` on `AuthorityRow` (PR-t) and no
//  code of any kind on `SiteAccessRow` (PR-r, and the column does not exist).

import Foundation
import CaptureKit

// MARK: - Seats

struct SeatRow: Decodable {
    let seatID: String
    let personID: String?
    let projectID: String
    let projectName: String?
    let partyKind: String?
    let displayName: String?
    let trade: String?
    let stage: String?
    let onSiteFrom: String?
    let onSiteTo: String?
    let companyID: String?
    let companyName: String?
    let offJobAt: String?
    let offJobReason: String?
    let phoneE164: String?
    let consentStatus: String?
    let reachState: String?
    let paperState: String?
    let contactRuleSummary: String?

    enum CodingKeys: String, CodingKey {
        case seatID = "seat_id"
        case personID = "person_id"
        case projectID = "project_id"
        case projectName = "project_name"
        case partyKind = "party_kind"
        case displayName = "display_name"
        case trade
        case stage
        case onSiteFrom = "on_site_from"
        case onSiteTo = "on_site_to"
        case companyID = "company_id"
        case companyName = "company_name"
        case offJobAt = "off_job_at"
        case offJobReason = "off_job_reason"
        case phoneE164 = "phone_e164"
        case consentStatus = "consent_status"
        case reachState = "reach_state"
        case paperState = "paper_state"
        case contactRuleSummary = "contact_rule_summary"
    }

    var seat: FieldRosterSeat {
        let consent = FieldPeopleVocabulary.consent(consentStatus)
        return FieldRosterSeat(
            id: seatID,
            personID: personID,
            displayName: displayName ?? "Someone on this job",
            firmName: companyName,
            trade: trade,
            kindWord: FieldPeopleVocabulary.kind(partyKind),
            reachWord: FieldPeopleVocabulary.reach(reachState),
            stageWord: FieldPeopleVocabulary.stage(stage),
            consentWord: consent,
            phoneDisplay: phoneE164,
            phoneE164: phoneE164,
            contactRule: contactRuleSummary,
            contactRuleBlocks: Self.blocks(contactRuleSummary),
            optedOutNote: consent == "Opted out"
                ? "Opted out of texts. Only they can rejoin by replying START."
                : nil,
            heldClause: Self.held(paperState, firm: companyName),
            bidNote: offJobReason,
            onSiteFrom: ProjectsWireDate.parse(onSiteFrom),
            onSiteTo: ProjectsWireDate.parse(onSiteTo),
            offJobAt: ProjectsWireDate.parse(offJobAt))
    }

    var personSeatLine: FieldPersonSeatLine {
        let window = [onSiteFrom, onSiteTo]
            .compactMap(ProjectsWireDate.parse)
            .map(FieldPeopleDates.short)
            .joined(separator: " to ")
        let words = [FieldPeopleVocabulary.kind(partyKind), trade,
                     window.isEmpty ? nil : window]
            .compactMap { $0 }
            .joined(separator: " · ")
        return FieldPersonSeatLine(id: seatID, projectName: projectName ?? "This job",
                                   words: words,
                                   stageWord: FieldPeopleVocabulary.stage(stage))
    }

    /// R-S: the held clause, in words, wherever the paper blocks.
    private static func held(_ paper: String?, firm: String?) -> String? {
        guard paper == "lapsed" else { return nil }
        let who = firm ?? "This firm"
        return "Site access held. \(who)'s compliance paper has lapsed."
    }

    /// `contact_rule_summary` prints the forbidding clause as a sentence (PR-e);
    /// the room reads "Do not contact" and "Never" as the blocking shape.
    private static func blocks(_ summary: String?) -> Bool {
        guard let summary = summary?.lowercased() else { return false }
        return summary.contains("do not contact") || summary.hasPrefix("never")
    }
}

// MARK: - The identity row

/// `people_directory` (00626) is ONE ROW PER IDENTITY and its key is
/// `person_id`; it carries no `id`, no `name` and no `company_name` column at
/// all. It also carries no `role_at_firm`: its `role` is the PARTY
/// CLASSIFICATION (client / lead / maker / team / contact — 00626:1437 assigns
/// `'client'::text AS role`, 00626:111 says every carded seat now reads
/// `role='contact'`), which is not a job title and is not read here. The job
/// title at the firm is `studio_person_affiliations.role_at_firm` (00592:280)
/// and arrives through `AffiliationRow`.
struct DirectoryRow: Decodable {
    let id: String
    let name: String?
    let reachState: String?
    let consentStatus: String?
    let paperState: String?
    let contactRuleSummary: String?

    enum CodingKeys: String, CodingKey {
        case id = "person_id"
        case name = "display_name"
        case reachState = "reach_state"
        case consentStatus = "consent_status"
        case paperState = "paper_state"
        case contactRuleSummary = "contact_rule_summary"
    }
}

// MARK: - The firm, and the job held at it (E4)

/// `studio_person_affiliations` (00592) — "which person does what at which
/// firm, dated". `role_at_firm` is free text the studio wrote (owner / signer /
/// pm / superintendent / …) and is printed as written, the same way the
/// portal's person profile prints it.
struct AffiliationRow: Decodable {
    let id: String
    let personID: String
    let companyID: String
    let roleAtFirm: String?
    let fromDate: String?

    enum CodingKeys: String, CodingKey {
        case id
        case personID = "person_id"
        case companyID = "company_id"
        case roleAtFirm = "role_at_firm"
        case fromDate = "from_date"
    }
}

/// The card's own number, which `identity_phone_numbers()` cannot see unless
/// the caller passes it — the seats' numbers it finds for itself.
struct PeopleContactPhoneRow: Decodable {
    let id: String
    let phoneE164: String?

    enum CodingKeys: String, CodingKey {
        case id
        case phoneE164 = "phone_e164"
    }
}

// MARK: - Consent, R-Q's one sentence

struct ConsentEvidenceParams: Encodable {
    let organizationID: String
    let identityKey: String
    let cardPhone: String?

    enum CodingKeys: String, CodingKey {
        case organizationID = "p_organization_id"
        case identityKey = "p_identity_key"
        case cardPhone = "p_card_phone_e164"
    }
}

/// `identity_consent_evidence` (00626): the number whose verdict WON the
/// identity's worst-first reduction, plus that record's two dates, already
/// one-sided there so the pair can never compose a clause the word
/// contradicts. No row at all when the winning word came from a number with no
/// record — and then there is no sentence to say.
struct ConsentEvidenceRow: Decodable {
    let channelValue: String
    let consentedAt: String?
    let optOutAt: String?

    enum CodingKeys: String, CodingKey {
        case channelValue = "channel_value"
        case consentedAt = "consented_at"
        case optOutAt = "opt_out_at"
    }
}

/// The rest of R-Q's sentence, off the record the evidence named: which source
/// it was, and the job it was given on.
struct ChannelConsentRow: Decodable {
    let channelValue: String
    let source: String?
    let optOutSource: String?
    let originProject: PeopleEmbeddedProjectName?

    enum CodingKeys: String, CodingKey {
        case channelValue = "channel_value"
        case source
        case optOutSource = "opt_out_source"
        case originProject = "origin_project"
    }
}

struct PeopleEmbeddedProjectName: Decodable {
    let name: String?
}

// MARK: - Channels

struct ChannelRow: Decodable {
    let id: String
    let channelKind: String
    let value: String
    let smsCapable: Bool?
    let preferred: Bool?
    /// active | bounced | unsubscribed | dead (00593).
    let status: String?

    enum CodingKeys: String, CodingKey {
        case id
        case channelKind = "channel_kind"
        case value
        case smsCapable = "sms_capable"
        case preferred
        case status
    }

    var channel: FieldPersonChannel {
        FieldPersonChannel(
            id: id,
            kind: Self.word(channelKind),
            value: value,
            isPhone: smsCapable == true || Self.phoneKinds.contains(channelKind),
            preferred: preferred == true,
            heldReason: Self.heldReason(status))
    }

    private static let phoneKinds: Set<String> = ["mobile", "office", "dispatch", "after_hours"]

    private static func word(_ kind: String) -> String {
        switch kind {
        case "mobile":      return "Mobile"
        case "office":      return "Office"
        case "dispatch":    return "Dispatch"
        case "after_hours": return "After hours"
        case "ap_email":    return "AP email"
        case "email":       return "Email"
        case "portal_311":  return "311 portal"
        default:            return kind.replacingOccurrences(of: "_", with: " ")
        }
    }

    private static func heldReason(_ status: String?) -> String? {
        switch status {
        case "bounced":      return "This address bounced back. Texts and calls still reach them."
        case "unsubscribed": return "They unsubscribed from this channel."
        case "dead":         return "This line is dead."
        default:             return nil
        }
    }
}

// MARK: - Authority (PR-t: no threshold column is read)

struct AuthorityRow: Decodable {
    let id: String
    let engagementID: String
    let scope: String
    let preparesOnly: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case engagementID = "engagement_id"
        case scope
        case preparesOnly = "prepares_only"
    }
}

// MARK: - The site access card (PR-r: no code column exists)

struct EmergencyLineRow: Decodable {
    let label: String?
    let name: String?
    let phone: String?
}

struct SiteAccessRow: Decodable {
    let id: String
    let projectID: String
    let lockboxVersion: String?
    let siteHours: String?
    let siteNotes: String?
    let emergencyLines: [EmergencyLineRow]?
    let receiverInstructions: String?
    let changedAt: String?
    let changedBy: String?
    /// E15's own change log: person-card or seat ids, resolved to names against
    /// THIS project's seats (00625).
    let toldRefs: [String]?
    let keyHolderEngagementID: String?

    enum CodingKeys: String, CodingKey {
        case id
        case projectID = "project_id"
        case lockboxVersion = "lockbox_version"
        case siteHours = "site_hours"
        case siteNotes = "site_notes"
        case emergencyLines = "emergency_lines"
        case receiverInstructions = "receiver_instructions"
        case changedAt = "changed_at"
        case changedBy = "changed_by"
        case toldRefs = "told_refs"
        case keyHolderEngagementID = "key_holder_engagement_id"
    }

    /// Every free-text field passes through `FieldSiteAccessRules.withholding`
    /// on the way out: the schema holds no code, and a code typed into the notes
    /// at the desk does not reach a job site either.
    func card(projectName: String, keyHolder: SeatRow?,
              changedByName: String? = nil,
              toldNames: [String] = []) -> FieldSiteAccessCard {
        let ask = keyHolder?.displayName
        return FieldSiteAccessCard(
            projectID: projectID,
            projectName: projectName,
            address: nil,
            callFirst: (emergencyLines ?? []).enumerated().compactMap { index, line in
                guard let phone = line.phone else { return nil }
                return FieldSiteContactLine(
                    id: "\(id)-\(index)",
                    name: line.name ?? line.label ?? "Emergency line",
                    role: line.label ?? "on call",
                    phoneDisplay: phone,
                    phoneE164: phone)
            },
            wayIn: FieldSiteAccessRules.wayIn(lockboxVersion: lockboxVersion, askName: ask),
            gateControl: FieldSiteAccessRules.withholding(siteNotes, askName: ask),
            keyHolderLine: keyHolder.map { Self.keyHolderLine($0) },
            keyHolderName: keyHolder?.displayName,
            keyHolderPersonID: keyHolder?.personID,
            changedAt: ProjectsWireDate.parse(changedAt),
            hours: FieldSiteAccessRules.withholding(siteHours, askName: ask),
            receiving: FieldSiteAccessRules.withholding(receiverInstructions, askName: ask),
            notices: notices(by: changedByName, toldNames: toldNames))
    }

    /// The card's OWN change log, which the row has carried since 00625:
    /// `changed_at` / `changed_by` / `told_refs`. One entry, the most recent
    /// change — a fuller multi-entry log is `record_notice`'s to add, and until
    /// it lands this is the only history the way in has, so it is read rather
    /// than left empty.
    private func notices(by changedByName: String?, toldNames: [String]) -> [FieldSiteNotice] {
        guard let when = ProjectsWireDate.parse(changedAt) else { return [] }
        return [FieldSiteNotice(id: "card-\(id)", what: "The way in changed.",
                                when: when, by: changedByName, toldNames: toldNames)]
    }

    private static func keyHolderLine(_ seat: SeatRow) -> String {
        let name = seat.displayName ?? "The key holder"
        guard let phone = seat.phoneE164 else { return "\(name) holds a key." }
        return "\(name) holds a key. \(phone)."
    }
}

// MARK: - Notices

struct NoticeRow: Decodable {
    let id: String?
    let what: String?
    let recordedAt: String?
    let recordedBy: String?
    let toldNames: [String]?

    enum CodingKeys: String, CodingKey {
        case id
        case what
        case recordedAt = "recorded_at"
        case recordedBy = "recorded_by"
        case toldNames = "told_names"
    }

    func notice(fallback: FieldSiteNoticeDraft) -> FieldSiteNotice {
        FieldSiteNotice(
            id: id ?? fallback.id,
            what: what ?? fallback.what,
            when: ProjectsWireDate.parse(recordedAt) ?? fallback.writtenAt,
            by: recordedBy,
            toldNames: toldNames ?? [])
    }
}

struct RecordNoticeParams: Encodable {
    let projectID: String
    let what: String
    let told: [String]

    enum CodingKeys: String, CodingKey {
        case projectID = "p_project_id"
        case what = "p_what"
        case told = "p_told"
    }
}

// MARK: - Minting (PR-s)

struct NewCardPayload: Encodable {
    let organizationID: String
    let entityKind: String
    let contactKind: String
    let fullName: String
    let companyName: String?
    let phone: String?

    enum CodingKeys: String, CodingKey {
        case organizationID = "organization_id"
        case entityKind = "entity_kind"
        case contactKind = "contact_kind"
        case fullName = "full_name"
        case companyName = "company_name"
        case phone
    }
}

struct NewSeatPayload: Encodable {
    let projectID: String
    let partyKind: String
    let displayName: String
    let companyName: String?
    let phone: String?
    let trade: String?
    let studioContactID: String
    let stage: String

    enum CodingKeys: String, CodingKey {
        case projectID = "project_id"
        case partyKind = "party_kind"
        case displayName = "display_name"
        case companyName = "company_name"
        case phone
        case trade
        case studioContactID = "studio_contact_id"
        case stage
    }
}

struct InsertedRow: Decodable {
    let id: String
    let onSiteTo: String?
    let warrantyUntil: String?

    enum CodingKeys: String, CodingKey {
        case id
        case onSiteTo = "on_site_to"
        case warrantyUntil = "warranty_until"
    }

    /// The window `create_field_link` dates a token from (00627): the later of
    /// the two, NULLs ignored. A seat minted from the phone carries neither.
    var windowEnd: Date? {
        [onSiteTo, warrantyUntil].compactMap(ProjectsWireDate.parse).max()
    }
}

struct CreateFieldLinkParams: Encodable {
    let partyID: String

    enum CodingKeys: String, CodingKey {
        case partyID = "p_party_id"
    }
}

struct FieldLinkRow: Decodable {
    let id: String?
    let token: String
}

/// `changed_by` is a profile id; the portal's own convention is `display_name`
/// first, then `full_name` (00016 backfilled one from the other).
struct PeopleProfileNameRow: Decodable {
    let id: String
    let displayName: String?
    let fullName: String?

    enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case fullName = "full_name"
    }

    var name: String? {
        [displayName, fullName].compactMap { $0 }.first { !$0.isEmpty }
    }
}

/// `PeopleProjectNameRow`, not `ProjectNameRow`: the Site Request service
/// already owns that name in the same module.
struct PeopleProjectNameRow: Decodable {
    let id: String
    let name: String?
}

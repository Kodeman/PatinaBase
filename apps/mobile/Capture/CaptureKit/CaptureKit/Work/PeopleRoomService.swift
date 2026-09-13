//  PeopleRoomService.swift
//  CaptureKit
//
//  W5 seam — the People room, scoped to ONE project (the job in front of the
//  designer). Pure Foundation, no SDK: the app's concrete reads
//  `people_directory_seats` (00626), `people_directory` v4 (00626),
//  `project_site_access_cards` (00625) and `project_party_authority` (00624);
//  the mock returns the Okonkwo fixture.
//
//  Scope is ruled, not inferred (ux-4-field-mobile §5, PR-s, PR-t):
//   • the active project's roster and site access card, and nothing
//     studio-wide — no Directory, no rolodex across jobs;
//   • authority prints as yes/no words, never a threshold figure (PR-t);
//   • the site access card never carries a gate code (PR-r) — there is no
//     property here to hold one, and free text is withheld by
//     `FieldSiteAccessRules` before it reaches a screen;
//   • two writes only: `recordNotice` (who was told) and `mintFieldLink`
//     (someone met on site, PR-s). Every other act belongs to the desk.

import Foundation

// MARK: - Bands

/// The four bands a project roster sorts into (direction §3.4, trimmed to the
/// four this surface carries).
public enum FieldRosterBand: String, Codable, Sendable, CaseIterable {
    case thisWeek
    case later
    case bidding
    case done

    /// The band's heading, in the room's own words.
    public var heading: String {
        switch self {
        case .thisWeek: return "On the job · this week"
        case .later:    return "On the job · later"
        case .bidding:  return "Bidding"
        case .done:     return "Done"
        }
    }
}

// MARK: - A seat on the roster

/// One seat (`project_parties` through `people_directory_seats`). A seat, not a
/// human: one human holds many seats, and the stage word belongs to the seat
/// (PR-p).
public struct FieldRosterSeat: Identifiable, Sendable, Codable, Hashable {
    /// `people_directory_seats.seat_id`.
    public let id: String
    /// `people_directory_seats.person_id` — the identity's Directory row. Nil
    /// for a firm-only row (a bidder with nobody named yet).
    public let personID: String?
    public let displayName: String
    public let firmName: String?
    /// `trade`, already in words ("electrical", "carpentry / framing").
    public let trade: String?
    /// `party_kind` in words ("sub", "gc", "receiver").
    public let kindWord: String?
    /// Reach (E6/E9): "Account" · "Field link" · "On paper".
    public let reachWord: String
    /// Stage (E5): "On the job" · "Awarded" · "No response" · "Off the job" …
    public let stageWord: String?
    /// Consent (E8): "Texting" · "Invited" · "Opted out" · "Not asked". Nil
    /// when the record cannot be read for this caller.
    public let consentWord: String?
    /// As a person reads it: "(612) 555-0111".
    public let phoneDisplay: String?
    /// `phone_e164`, when the record carries one.
    public let phoneE164: String?
    /// E7 as one line — "Text only. The email on file bounces."
    public let contactRule: String?
    /// True when the rule forbids every channel (R-S: the clause prints wherever
    /// the rule is shown).
    public let contactRuleBlocks: Bool
    /// Who to write instead, when the blocking rule names a route.
    public let routeToName: String?
    /// R-T: an opted-out note prints on the collapsed row, not only in the unfold.
    public let optedOutNote: String?
    /// PR-h / R-S: "Site access held. Northgate Electric's insurance lapsed
    /// 31 March 2026." Printed with a terracotta leading rule.
    public let heldClause: String?
    /// R-R: "Quoted 2 October 2026. Selected 9 October 2026."
    public let bidNote: String?
    public let onSiteFrom: Date?
    public let onSiteTo: Date?
    public let offJobAt: Date?

    public init(
        id: String,
        personID: String? = nil,
        displayName: String,
        firmName: String? = nil,
        trade: String? = nil,
        kindWord: String? = nil,
        reachWord: String,
        stageWord: String? = nil,
        consentWord: String? = nil,
        phoneDisplay: String? = nil,
        phoneE164: String? = nil,
        contactRule: String? = nil,
        contactRuleBlocks: Bool = false,
        routeToName: String? = nil,
        optedOutNote: String? = nil,
        heldClause: String? = nil,
        bidNote: String? = nil,
        onSiteFrom: Date? = nil,
        onSiteTo: Date? = nil,
        offJobAt: Date? = nil
    ) {
        self.id = id
        self.personID = personID
        self.displayName = displayName
        self.firmName = firmName
        self.trade = trade
        self.kindWord = kindWord
        self.reachWord = reachWord
        self.stageWord = stageWord
        self.consentWord = consentWord
        self.phoneDisplay = phoneDisplay
        self.phoneE164 = phoneE164
        self.contactRule = contactRule
        self.contactRuleBlocks = contactRuleBlocks
        self.routeToName = routeToName
        self.optedOutNote = optedOutNote
        self.heldClause = heldClause
        self.bidNote = bidNote
        self.onSiteFrom = onSiteFrom
        self.onSiteTo = onSiteTo
        self.offJobAt = offJobAt
    }

    /// Firm and trade as one line — "Marrow & Sons · field supervision".
    public var subLine: String {
        [firmName, trade ?? kindWord]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }
}

// MARK: - The roster

public struct FieldProjectRoster: Sendable, Codable, Hashable {
    public let projectID: String
    public let projectName: String
    /// R-U: "Key held by Ngozi Eze. Luis Ochoa controls the gate. Changed 16 Oct 2026."
    public let siteHeadLine: String?
    public let seats: [FieldRosterSeat]
    /// The day the bands are reckoned against. The service supplies it rather
    /// than the screen reading a clock, so a cached roster still bands the way
    /// it did when it was loaded, and the fixture can stand in its own week.
    public let asOf: Date

    public init(projectID: String, projectName: String,
                siteHeadLine: String? = nil, seats: [FieldRosterSeat],
                asOf: Date = Date()) {
        self.projectID = projectID
        self.projectName = projectName
        self.siteHeadLine = siteHeadLine
        self.seats = seats
        self.asOf = asOf
    }
}

// MARK: - A person, opened from a row

/// One channel on a person card (E6).
public struct FieldPersonChannel: Identifiable, Sendable, Codable, Hashable {
    public let id: String
    /// "Mobile" · "Office" · "Email" · "After hours" …
    public let kind: String
    public let value: String
    public let isPhone: Bool
    public let preferred: Bool
    /// Why the channel is held — "This address bounced back, 12 March 2026."
    public let heldReason: String?
    /// The consent word against this channel's value, when it carries one.
    public let consentWord: String?

    public init(id: String, kind: String, value: String, isPhone: Bool,
                preferred: Bool = false, heldReason: String? = nil,
                consentWord: String? = nil) {
        self.id = id
        self.kind = kind
        self.value = value
        self.isPhone = isPhone
        self.preferred = preferred
        self.heldReason = heldReason
        self.consentWord = consentWord
    }
}

/// A seat line under a person, on this job or another (read-only here).
public struct FieldPersonSeatLine: Identifiable, Sendable, Codable, Hashable {
    public let id: String
    public let projectName: String
    public let words: String
    public let stageWord: String?

    public init(id: String, projectName: String, words: String, stageWord: String?) {
        self.id = id
        self.projectName = projectName
        self.words = words
        self.stageWord = stageWord
    }
}

/// The person behind a row. Identity, channels, the contact rule, seats, and
/// authority as yes/no words only (PR-t).
public struct FieldPersonCard: Sendable, Codable, Hashable {
    public let personID: String
    public let name: String
    public let firmName: String?
    public let roleAtFirm: String?
    public let reachWord: String
    public let consentWord: String?
    /// R-Q: "Written consent, 8 Oct 2026, on the Okonkwo residence."
    public let consentSentence: String?
    public let paperWord: String?
    public let channels: [FieldPersonChannel]
    public let contactRule: String?
    public let contactRuleBlocks: Bool
    public let routeToName: String?
    public let seats: [FieldPersonSeatLine]
    /// Already reduced to yes/no words by `FieldAuthorityWords` — never a figure.
    public let authorityWords: [String]

    public init(
        personID: String,
        name: String,
        firmName: String? = nil,
        roleAtFirm: String? = nil,
        reachWord: String,
        consentWord: String? = nil,
        consentSentence: String? = nil,
        paperWord: String? = nil,
        channels: [FieldPersonChannel] = [],
        contactRule: String? = nil,
        contactRuleBlocks: Bool = false,
        routeToName: String? = nil,
        seats: [FieldPersonSeatLine] = [],
        authorityWords: [String] = []
    ) {
        self.personID = personID
        self.name = name
        self.firmName = firmName
        self.roleAtFirm = roleAtFirm
        self.reachWord = reachWord
        self.consentWord = consentWord
        self.consentSentence = consentSentence
        self.paperWord = paperWord
        self.channels = channels
        self.contactRule = contactRule
        self.contactRuleBlocks = contactRuleBlocks
        self.routeToName = routeToName
        self.seats = seats
        self.authorityWords = authorityWords
    }
}

// MARK: - The site access card

/// One line under "Who to call first".
public struct FieldSiteContactLine: Identifiable, Sendable, Codable, Hashable {
    public let id: String
    public let name: String
    /// "superintendent", "owner", "gas" — the label the line carries.
    public let role: String
    public let phoneDisplay: String
    public let phoneE164: String?

    public init(id: String, name: String, role: String,
                phoneDisplay: String, phoneE164: String? = nil) {
        self.id = id
        self.name = name
        self.role = role
        self.phoneDisplay = phoneDisplay
        self.phoneE164 = phoneE164
    }

    /// "Luis Ochoa, superintendent, (612) 555-0109" — the whole line is the
    /// tap target at 390 (R-X).
    public var line: String { "\(name), \(role), \(phoneDisplay)" }
}

/// One entry in the card's change log (E15.told_refs).
public struct FieldSiteNotice: Identifiable, Sendable, Codable, Hashable {
    public let id: String
    public let what: String
    public let when: Date
    public let by: String?
    public let toldNames: [String]

    public init(id: String, what: String, when: Date, by: String?, toldNames: [String]) {
        self.id = id
        self.what = what
        self.when = when
        self.by = by
        self.toldNames = toldNames
    }
}

/// A notice waiting to be written (queued when there is no signal).
public struct FieldSiteNoticeDraft: Identifiable, Sendable, Codable, Hashable {
    public let id: String
    public let projectID: String
    public let what: String
    public let toldSeatIDs: [String]
    public let writtenAt: Date

    public init(id: String = UUID().uuidString, projectID: String, what: String,
                toldSeatIDs: [String] = [], writtenAt: Date = Date()) {
        self.id = id
        self.projectID = projectID
        self.what = what
        self.toldSeatIDs = toldSeatIDs
        self.writtenAt = writtenAt
    }
}

/// E15 — how a body gets on site. PR-r: there is NO code property here and there
/// is not meant to be one. Free text arrives through
/// `FieldSiteAccessRules.withholding(_:askName:)`, so a code typed into the
/// notes at the desk never reaches a phone screen either.
public struct FieldSiteAccessCard: Sendable, Codable, Hashable {
    public let projectID: String
    public let projectName: String
    public let address: String?
    public let callFirst: [FieldSiteContactLine]
    /// "Lockbox, version 3. The code is held off Patina; ask Luis Ochoa."
    public let wayIn: String
    /// "Luis Ochoa controls the gate."
    public let gateControl: String?
    /// "Ngozi Eze holds a key. Text only, (612) 555-0106."
    public let keyHolderLine: String?
    /// The key holder's name alone — the roster's one-line head reads this, not
    /// the sentence, so it cannot print "Key held by Ngozi Eze holds a key."
    public let keyHolderName: String?
    public let keyHolderPersonID: String?
    /// When the way in last changed (E15.changed_at).
    public let changedAt: Date?
    public let hours: String?
    public let receiving: String?
    public let notices: [FieldSiteNotice]

    public init(
        projectID: String,
        projectName: String,
        address: String? = nil,
        callFirst: [FieldSiteContactLine] = [],
        wayIn: String,
        gateControl: String? = nil,
        keyHolderLine: String? = nil,
        keyHolderName: String? = nil,
        keyHolderPersonID: String? = nil,
        changedAt: Date? = nil,
        hours: String? = nil,
        receiving: String? = nil,
        notices: [FieldSiteNotice] = []
    ) {
        self.projectID = projectID
        self.projectName = projectName
        self.address = address
        self.callFirst = callFirst
        self.wayIn = wayIn
        self.gateControl = gateControl
        self.keyHolderLine = keyHolderLine
        self.keyHolderName = keyHolderName
        self.keyHolderPersonID = keyHolderPersonID
        self.changedAt = changedAt
        self.hours = hours
        self.receiving = receiving
        self.notices = notices
    }
}

// MARK: - Minting a field link for someone met on site (PR-s)

public struct FieldLinkMintRequest: Sendable, Codable, Hashable {
    public let projectID: String
    public let fullName: String
    public let firmName: String?
    public let trade: String?
    /// `party_kind` — "sub", "installer", "receiver", "gc", "other".
    public let partyKind: String
    public let phone: String?

    public init(projectID: String, fullName: String, firmName: String? = nil,
                trade: String? = nil, partyKind: String, phone: String? = nil) {
        self.projectID = projectID
        self.fullName = fullName
        self.firmName = firmName
        self.trade = trade
        self.partyKind = partyKind
        self.phone = phone
    }
}

/// What a mint hands back: the link to pass on, and the date it ends, in words.
public struct FieldLinkMint: Sendable, Codable, Hashable {
    public let seatID: String
    public let personID: String?
    public let url: String
    public let expiresAt: Date?
    /// PR-d: "Ends with the job, 13 August 2027."
    public let expirySentence: String

    public init(seatID: String, personID: String?, url: String,
                expiresAt: Date?, expirySentence: String) {
        self.seatID = seatID
        self.personID = personID
        self.url = url
        self.expiresAt = expiresAt
        self.expirySentence = expirySentence
    }
}

// MARK: - The seam

public protocol PeopleRoomService: Sendable {
    /// Every seat on one project. RLS-scoped; never studio-wide.
    func roster(projectID: String) async throws -> FieldProjectRoster
    /// One person behind a row, with their channels, rule, seats and authority.
    func person(projectID: String, personID: String) async throws -> FieldPersonCard
    /// The way in. Studio-only (PR-w).
    func siteAccess(projectID: String) async throws -> FieldSiteAccessCard
    /// The one write on the site access card: who was told.
    func recordNotice(_ draft: FieldSiteNoticeDraft) async throws -> FieldSiteNotice
    /// PR-s: a person met on site gets a card and a seat at the same moment.
    func mintFieldLink(_ request: FieldLinkMintRequest) async throws -> FieldLinkMint
}

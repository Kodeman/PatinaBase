//  PeopleRoomMocks.swift
//  CaptureKitMocks
//
//  The Okonkwo residence, as the People room CRM fixture names it
//  (`artifacts/people-room-crm-2026-09-11/pieces/people-room-390.html` §FIXTURE),
//  so PR1/PR2/PR3 render on the Simulator without network and the names on the
//  screenshots are the names the panel argued over.
//
//  Today in this fixture is 20 October 2026 and "this week" is 19–25 October,
//  which is what puts Luis Ochoa on site and Pete Rusk in "later".

import Foundation
import CaptureKit

private func day(_ string: String) -> Date {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(identifier: "America/Chicago")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.date(from: string) ?? Date(timeIntervalSince1970: 1_792_000_000)
}

public enum PeopleRoomFixtures {
    /// The project every PR screen opens on.
    public static let projectID = "okonkwo-residence"
    public static let projectName = "Okonkwo residence"
    public static let address = "4412 Fremont Ave S, Minneapolis MN 55409"
    /// The person the `-CaptureScreen PR2.person` harness resolves to.
    public static let personID = "F-11"

    /// The fixture's own today — the roster bands are reckoned against the week
    /// containing it, so the Simulator shows the same bands the piece does.
    public static let today = day("2026-10-20")

    private static let substantialCompletion = day("2027-08-13")

    // MARK: Seats

    public static let seats: [FieldRosterSeat] = thisWeek + later + bidsAndClosed

    private static let thisWeek: [FieldRosterSeat] = [
        FieldRosterSeat(
            id: "seat-F-02", personID: "F-02", displayName: "Priya Natarajan",
            firmName: "Hartwell Studio", trade: "lead designer", kindWord: "studio",
            reachWord: "Account", stageWord: "On the job", consentWord: nil,
            phoneDisplay: "(612) 555-0102", phoneE164: "+16125550102",
            onSiteFrom: day("2026-08-01"), onSiteTo: day("2027-09-30")),
        FieldRosterSeat(
            id: "seat-F-04", personID: "F-04", displayName: "Adaeze Okonkwo",
            firmName: "Okonkwo household", trade: "client", kindWord: "client",
            reachWord: "Account", stageWord: "On the job", consentWord: "Texting",
            phoneDisplay: "(612) 555-0104", phoneE164: "+16125550104",
            onSiteFrom: day("2026-08-01"), onSiteTo: day("2027-09-30")),
        FieldRosterSeat(
            id: "seat-F-05", personID: "F-05", displayName: "Chidi Okonkwo",
            firmName: "Okonkwo household", trade: "household member",
            kindWord: "client_rep", reachWord: "On paper", stageWord: "On the job",
            consentWord: "Not asked",
            phoneDisplay: "(612) 555-0105", phoneE164: "+16125550105",
            contactRule: "Email first. Call for anything over an agreed amount.",
            onSiteFrom: day("2026-08-01"), onSiteTo: day("2027-09-30")),
        FieldRosterSeat(
            id: "seat-F-09", personID: "F-09", displayName: "Luis Ochoa",
            firmName: "Marrow & Sons", trade: "field supervision", kindWord: "gc",
            reachWord: "Field link", stageWord: "On the job", consentWord: "Texting",
            phoneDisplay: "(612) 555-0109", phoneE164: "+16125550109",
            contactRule: "Text only. Phone calls.",
            onSiteFrom: day("2026-10-12"), onSiteTo: substantialCompletion),
        FieldRosterSeat(
            id: "seat-F-08", personID: "F-08", displayName: "Erin Sato",
            firmName: "Marrow & Sons", trade: "project management", kindWord: "gc",
            reachWord: "Field link", stageWord: "On the job", consentWord: "Texting",
            phoneDisplay: "(612) 555-0108", phoneE164: "+16125550108",
            onSiteFrom: day("2026-10-12"), onSiteTo: substantialCompletion),
        FieldRosterSeat(
            id: "seat-F-07", personID: "F-07", displayName: "Tom Marrow",
            firmName: "Marrow & Sons", trade: "general contracting", kindWord: "gc",
            reachWord: "Field link", stageWord: "On the job", consentWord: "Not asked",
            phoneDisplay: "(612) 555-0107", phoneE164: "+16125550107",
            onSiteFrom: day("2026-10-12"), onSiteTo: substantialCompletion),
        FieldRosterSeat(
            id: "seat-F-11", personID: "F-11", displayName: "Dana Kowalski",
            firmName: "Northgate Electric", trade: "electrical", kindWord: "sub",
            reachWord: "Field link", stageWord: "On the job", consentWord: "Texting",
            phoneDisplay: "(612) 555-0111", phoneE164: "+16125550111",
            contactRule: "Text only. The email on file bounces.",
            heldClause: "Site access held. Northgate Electric's insurance lapsed 31 March 2026.",
            onSiteFrom: day("2026-10-12"), onSiteTo: substantialCompletion),
        FieldRosterSeat(
            id: "seat-F-18", personID: "F-18", displayName: "Joe Wozniak",
            firmName: "Cedar & Iron Framing", trade: "carpentry / framing", kindWord: "sub",
            reachWord: "Field link", stageWord: "On the job", consentWord: "Invited",
            phoneDisplay: "(612) 555-0118", phoneE164: "+16125550118",
            contactRule: "Text only. No working email.",
            onSiteFrom: day("2026-10-12"), onSiteTo: day("2026-12-19")),
        FieldRosterSeat(
            id: "seat-F-06", personID: "F-06", displayName: "Ngozi Eze",
            firmName: nil, trade: "receiving", kindWord: "receiver",
            reachWord: "Field link", stageWord: "On the job", consentWord: "Texting",
            phoneDisplay: "(612) 555-0106", phoneE164: "+16125550106",
            contactRule: "Text only. Never opens email.",
            onSiteFrom: day("2026-10-12"), onSiteTo: day("2027-09-30")),
        FieldRosterSeat(
            id: "seat-F-10", personID: "F-10", displayName: "Sam Rowe",
            firmName: "Beck + Rowe Architects", trade: "architecture", kindWord: "architect",
            reachWord: "On paper", stageWord: "On the job", consentWord: "Not asked",
            phoneDisplay: "(612) 555-0110", phoneE164: "+16125550110",
            contactRule: "Email only. Phone for emergencies.",
            onSiteFrom: day("2026-08-01"), onSiteTo: substantialCompletion)
    ]

    private static let later: [FieldRosterSeat] = [
        FieldRosterSeat(
            id: "seat-F-26", personID: "F-26", displayName: "Carol Nystrom",
            firmName: "Great Northern Bank", trade: "construction lending",
            kindWord: "inspector", reachWord: "On paper", stageWord: "Awarded",
            consentWord: "Not asked",
            phoneDisplay: "(612) 555-0126", phoneE164: "+16125550126",
            contactRule: "Never text. Email and phone only.", contactRuleBlocks: true,
            onSiteFrom: day("2026-11-02"), onSiteTo: substantialCompletion),
        FieldRosterSeat(
            id: "seat-F-12", personID: "F-12", displayName: "Pete Rusk",
            firmName: "Rusk Mechanical", trade: "plumbing", kindWord: "sub",
            reachWord: "On paper", stageWord: "Awarded", consentWord: "Opted out",
            phoneDisplay: "(612) 555-0112", phoneE164: "+16125550112",
            optedOutNote: "Opted out by text, 3 Dec 2025, on the Lindqvist kitchen.",
            onSiteFrom: day("2026-11-09"), onSiteTo: day("2027-04-24")),
        FieldRosterSeat(
            id: "seat-F-27", personID: "F-27", displayName: "Ray Thao",
            firmName: "City of Minneapolis, CPED Inspections", trade: "code enforcement",
            kindWord: "inspector", reachWord: "On paper", stageWord: "Awarded",
            consentWord: "Not asked",
            phoneDisplay: "(612) 555-0127", phoneE164: "+16125550127",
            contactRule: "Never text. Office phone or the 311 portal only.",
            contactRuleBlocks: true,
            onSiteFrom: day("2026-11-16"), onSiteTo: substantialCompletion),
        FieldRosterSeat(
            id: "seat-F-15", personID: "F-15", displayName: "Frank Bauer",
            firmName: "Twin Cities Drywall & Plaster", trade: "drywall / plaster",
            kindWord: "sub", reachWord: "On paper", stageWord: "Awarded",
            consentWord: "Not asked",
            contactRule: "Do not contact directly. Write Rosa Delgado instead.",
            contactRuleBlocks: true, routeToName: "Rosa Delgado",
            onSiteFrom: day("2027-01-11"), onSiteTo: day("2027-02-27")),
        FieldRosterSeat(
            id: "seat-F-16", personID: "F-16", displayName: "Amara Osei",
            firmName: "Lakeshore Painting Co.", trade: "paint", kindWord: "sub",
            reachWord: "Account", stageWord: "Awarded", consentWord: "Texting",
            phoneDisplay: "(612) 555-0116", phoneE164: "+16125550116",
            bidNote: "Quoted 2 October 2026. Selected 9 October 2026.",
            onSiteFrom: day("2027-05-04"), onSiteTo: day("2027-06-18")),
        FieldRosterSeat(
            id: "seat-F-13", personID: "F-13", displayName: "Ingrid Halvorsen",
            firmName: "Halvorsen Cabinet Works", trade: "cabinetry", kindWord: "sub",
            reachWord: "On paper", stageWord: "Awarded", consentWord: "Not asked",
            phoneDisplay: "(612) 555-0113", phoneE164: "+16125550113",
            contactRule: "Email only. No cell for work.",
            onSiteFrom: day("2027-04-05"), onSiteTo: day("2027-05-28"))
    ]

    private static let bidsAndClosed: [FieldRosterSeat] = [
        FieldRosterSeat(
            id: "seat-rivera", personID: nil, displayName: "Rivera Finishes",
            firmName: "Rivera Finishes", trade: "paint", kindWord: "sub",
            reachWord: "On paper", stageWord: "No response",
            bidNote: "Asked 28 September 2026. Due 5 October 2026. Nobody owed an answer after that."),
        FieldRosterSeat(
            id: "seat-granite", personID: nil, displayName: "Granite North",
            firmName: "Granite North", trade: "countertop fabrication", kindWord: "sub",
            reachWord: "On paper", stageWord: "Off the job",
            bidNote: "The slab program went to Stonehaven Tile Gallery.",
            offJobAt: day("2026-10-02"))
    ]

    // MARK: The roster

    public static let roster = FieldProjectRoster(
        projectID: projectID,
        projectName: projectName,
        siteHeadLine: FieldSiteAccessRules.headLine(
            keyHolderName: "Ngozi Eze",
            gateControl: "Luis Ochoa controls the gate.",
            changedAt: day("2026-10-16")),
        seats: seats,
        asOf: today)

    // MARK: Person cards

    public static let people: [FieldPersonCard] = [
        FieldPersonCard(
            personID: "F-11", name: "Dana Kowalski", firmName: "Northgate Electric",
            roleAtFirm: "owner-operator", reachWord: "Field link", consentWord: "Texting",
            consentSentence: "Written consent, 2 May 2025, on the Lindqvist kitchen.",
            paperWord: "Lapsed",
            channels: [
                FieldPersonChannel(id: "ch-11-m", kind: "Mobile", value: "(612) 555-0111",
                                   isPhone: true, preferred: true, consentWord: "Texting"),
                FieldPersonChannel(id: "ch-11-e", kind: "Email",
                                   value: "dana@northgateelectric.com", isPhone: false,
                                   heldReason: "This address bounced back, 12 March 2026. "
                                       + "Texts and calls still reach them.")
            ],
            contactRule: "Text only. The email on file bounces.",
            seats: [
                FieldPersonSeatLine(id: "seat-F-11", projectName: projectName,
                                    words: "sub · electrical · 12 Oct 2026 to 13 Aug 2027",
                                    stageWord: "On the job"),
                FieldPersonSeatLine(id: "seat-F-11-lq", projectName: "Lindqvist kitchen",
                                    words: "sub · electrical · closed 21 Nov 2025",
                                    stageWord: "Warranty")
            ],
            authorityWords: FieldAuthorityWords.phoneSafe(lines: [])),
        FieldPersonCard(
            personID: "F-05", name: "Chidi Okonkwo", firmName: "Okonkwo household",
            roleAtFirm: "household member", reachWord: "On paper", consentWord: "Not asked",
            channels: [
                FieldPersonChannel(id: "ch-05-m", kind: "Mobile", value: "(612) 555-0105",
                                   isPhone: true, preferred: false),
                FieldPersonChannel(id: "ch-05-e", kind: "Email",
                                   value: "chidi@okonkwohousehold.com", isPhone: false,
                                   preferred: true)
            ],
            contactRule: "Email first. Call for anything over an agreed amount.",
            seats: [
                FieldPersonSeatLine(id: "seat-F-05", projectName: projectName,
                                    words: "household member · 1 Aug 2026 to 30 Sep 2027",
                                    stageWord: "On the job")
            ],
            // PR-t: the yes, never the figure. The desk holds the threshold.
            authorityWords: FieldAuthorityWords.phoneSafe(lines: ["Signs money to $2,500."])),
        FieldPersonCard(
            personID: "F-09", name: "Luis Ochoa", firmName: "Marrow & Sons",
            roleAtFirm: "superintendent", reachWord: "Field link", consentWord: "Texting",
            consentSentence: "Verbal consent, 10 Oct 2026, on the Okonkwo residence.",
            paperWord: "Current",
            channels: [
                FieldPersonChannel(id: "ch-09-m", kind: "Mobile", value: "(612) 555-0109",
                                   isPhone: true, preferred: true, consentWord: "Texting")
            ],
            contactRule: "Text only. Phone calls.",
            seats: [
                FieldPersonSeatLine(id: "seat-F-09", projectName: projectName,
                                    words: "gc · field supervision · 12 Oct 2026 to 13 Aug 2027",
                                    stageWord: "On the job")
            ],
            authorityWords: FieldAuthorityWords.phoneSafe(lines: ["Controls the gate."])),
        FieldPersonCard(
            personID: "F-15", name: "Frank Bauer", firmName: "Twin Cities Drywall & Plaster",
            roleAtFirm: "owner, signer", reachWord: "On paper", consentWord: "Not asked",
            contactRule: "Do not contact directly. Write Rosa Delgado instead.",
            contactRuleBlocks: true, routeToName: "Rosa Delgado",
            seats: [
                FieldPersonSeatLine(id: "seat-F-15", projectName: projectName,
                                    words: "sub · drywall / plaster · 11 Jan to 27 Feb 2027",
                                    stageWord: "Awarded")
            ],
            authorityWords: FieldAuthorityWords.phoneSafe(
                lines: ["Signs the subcontract, sub side."]))
    ]

    /// Only four seats carry a hand-authored card above; the roster holds
    /// seventeen. Rather than hand a caller an unrelated person's record, the
    /// mock composes the remaining cards out of the seat itself, so every row
    /// on PR1 opens the person whose name is on it. Every field here is the
    /// seat's own value — nothing is invented, and nothing is borrowed from
    /// another identity. `roleAtFirm` stays nil because a seat carries a trade,
    /// not a job title (r4-14).
    public static func cardFromSeat(personID: String) -> FieldPersonCard? {
        guard let seat = seats.first(where: { $0.personID == personID }) else { return nil }
        let channels: [FieldPersonChannel] = seat.phoneDisplay.map {
            [FieldPersonChannel(id: "ch-\(personID)-m", kind: "Mobile", value: $0,
                               isPhone: true, preferred: true,
                               consentWord: seat.consentWord)]
        } ?? []
        let words = [seat.kindWord, seat.trade].compactMap { $0 }.joined(separator: " · ")
        return FieldPersonCard(
            personID: personID,
            name: seat.displayName,
            firmName: seat.firmName,
            reachWord: seat.reachWord,
            consentWord: seat.consentWord,
            channels: channels,
            contactRule: seat.contactRule,
            contactRuleBlocks: seat.contactRuleBlocks,
            routeToName: seat.routeToName,
            seats: [FieldPersonSeatLine(id: seat.id, projectName: projectName,
                                        words: words.isEmpty ? "on this job" : words,
                                        stageWord: seat.stageWord)],
            authorityWords: [])
    }

    // MARK: The site access card

    public static let siteAccess = FieldSiteAccessCard(
        projectID: projectID,
        projectName: projectName,
        address: address,
        callFirst: [
            FieldSiteContactLine(id: "F-09", name: "Luis Ochoa", role: "superintendent",
                                 phoneDisplay: "(612) 555-0109", phoneE164: "+16125550109"),
            FieldSiteContactLine(id: "F-05", name: "Chidi Okonkwo", role: "owner",
                                 phoneDisplay: "(612) 555-0105", phoneE164: "+16125550105"),
            FieldSiteContactLine(id: "F-10", name: "Sam Rowe", role: "architect",
                                 phoneDisplay: "(612) 555-0110", phoneE164: "+16125550110")
        ],
        wayIn: FieldSiteAccessRules.wayIn(lockboxVersion: "3", askName: "Luis Ochoa"),
        gateControl: "Luis Ochoa controls the gate.",
        keyHolderLine: "Ngozi Eze holds a key. Text only, (612) 555-0106.",
        keyHolderName: "Ngozi Eze",
        keyHolderPersonID: "F-06",
        changedAt: day("2026-10-16"),
        hours: "Weekdays 07:00 to 17:00. No Saturday work before 09:00.",
        receiving: "Ngozi Eze receives deliveries. Stage in the detached garage.",
        notices: [
            FieldSiteNotice(id: "notice-1", what: "Lockbox changed to version 3.",
                            when: day("2026-10-16"), by: "Priya Natarajan",
                            toldNames: ["Luis Ochoa", "Ngozi Eze", "Joe Wozniak", "Dana Kowalski"]),
            FieldSiteNotice(id: "notice-2", what: "Site hours set for the demo phase.",
                            when: day("2026-10-12"), by: "Priya Natarajan",
                            toldNames: ["Tom Marrow", "Erin Sato", "Luis Ochoa"])
        ])
}

// MARK: - The mock seam

/// What the mock refuses, in the words the screen prints.
public enum MockPeopleRoomError: LocalizedError {
    case notOnThisJob(String)

    public var errorDescription: String? {
        switch self {
        case .notOnThisJob(let personID):
            return "No seat on this job carries \(personID). Nobody to open."
        }
    }
}

/// Renders every PR screen on the Simulator with no network. The two writes
/// answer honestly: a notice comes back stamped now, and a mint returns a link
/// that ends with the job (PR-d).
public final class MockPeopleRoomService: PeopleRoomService, @unchecked Sendable {
    public init() {}

    public func roster(projectID: String) async throws -> FieldProjectRoster {
        PeopleRoomFixtures.roster
    }

    /// A personID with no seat on this job is refused the way the real service
    /// refuses it (`PeopleRoomError.notOnThisJob`) rather than falling through
    /// to some other person's card.
    public func person(projectID: String, personID: String) async throws -> FieldPersonCard {
        if let authored = PeopleRoomFixtures.people.first(where: { $0.personID == personID }) {
            return authored
        }
        guard let fromSeat = PeopleRoomFixtures.cardFromSeat(personID: personID) else {
            throw MockPeopleRoomError.notOnThisJob(personID)
        }
        return fromSeat
    }

    public func siteAccess(projectID: String) async throws -> FieldSiteAccessCard {
        PeopleRoomFixtures.siteAccess
    }

    public func recordNotice(_ draft: FieldSiteNoticeDraft) async throws -> FieldSiteNotice {
        FieldSiteNotice(id: draft.id, what: draft.what, when: draft.writtenAt,
                        by: "Priya Natarajan", toldNames: draft.toldSeatIDs.map(Self.name))
    }

    /// A seat made from the mint sheet carries NO window — the form has no field
    /// for one and nothing on the seat defaults it — so the mock takes the same
    /// branch the real service takes (`FieldLinkExpiry`, mirroring 00627's
    /// ninety-day fallback) rather than borrowing a date off the fixture's own
    /// windowed seats, which made the sim print a sentence real data never says.
    public func mintFieldLink(_ request: FieldLinkMintRequest) async throws -> FieldLinkMint {
        let window = FieldLinkExpiry.resolve(windowEnd: nil)
        return FieldLinkMint(
            seatID: "seat-\(UUID().uuidString.prefix(8))",
            personID: "card-\(UUID().uuidString.prefix(8))",
            url: "https://client.patina.cloud/field/e3a91c74f0b24d0e8a5f",
            expiresAt: window.endsAt,
            expirySentence: window.sentence)
    }

    private static func name(_ seatID: String) -> String {
        PeopleRoomFixtures.seats.first { $0.id == seatID }?.displayName ?? seatID
    }
}

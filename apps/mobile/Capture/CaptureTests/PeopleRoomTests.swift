//  PeopleRoomTests.swift
//  CaptureTests
//
//  W5's rules, tested where they live: the band a seat falls in, the `tel:` line
//  a row composes, the "no code" rule the site access card keeps (PR-r), the
//  yes/no authority a phone may print (PR-t), and the offline cache's own
//  promises.

import Foundation
import Testing
@testable import CaptureKit
@testable import CaptureKitMocks

private func day(_ string: String) -> Date {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(identifier: "America/Chicago")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.date(from: string) ?? .distantPast
}

private func seat(
    _ id: String,
    stage: String? = "On the job",
    from: String? = nil,
    to: String? = nil,
    offJob: String? = nil,
    name: String = "Someone"
) -> FieldRosterSeat {
    FieldRosterSeat(id: id, displayName: name, reachWord: "Field link", stageWord: stage,
                    onSiteFrom: from.map(day), onSiteTo: to.map(day),
                    offJobAt: offJob.map(day))
}

// MARK: - Bands

struct FieldRosterGroupingTests {
    /// The fixture's own week: Monday 19 to Sunday 25 October 2026.
    private let week = FieldRosterWeek.containing(day("2026-10-20"))

    @Test func weekRunsMondayToSunday() {
        var calendar = Calendar.current
        calendar.firstWeekday = 2
        #expect(calendar.component(.weekday, from: week.start) == 2)
        #expect(week.duration == 7 * 24 * 60 * 60)
        #expect(week.start <= day("2026-10-20"))
        #expect(week.end > day("2026-10-20"))
    }

    @Test func aWindowCoveringThisWeekIsOnTheJob() {
        let row = seat("a", from: "2026-10-12", to: "2027-08-13")
        #expect(FieldRosterGrouping.band(for: row, week: week) == .thisWeek)
    }

    @Test func aWindowThatHasNotOpenedYetIsLater() {
        let row = seat("b", stage: "Awarded", from: "2026-11-09", to: "2027-04-24")
        #expect(FieldRosterGrouping.band(for: row, week: week) == .later)
    }

    @Test func aBidderIsBiddingEvenWithNoWindow() {
        let row = seat("c", stage: "No response")
        #expect(FieldRosterGrouping.band(for: row, week: week) == .bidding)
    }

    /// The order of the rules is the rule: off the job wins over a window that
    /// still covers today.
    @Test func comingOffTheJobOutranksAnOpenWindow() {
        let row = seat("d", stage: "On the job", from: "2026-10-12", to: "2027-08-13",
                       offJob: "2026-10-02")
        #expect(FieldRosterGrouping.band(for: row, week: week) == .done)
    }

    @Test func aClosedWindowNobodyDatedStillReadsDone() {
        let row = seat("e", stage: "On the job", from: "2026-08-01", to: "2026-09-30")
        #expect(FieldRosterGrouping.band(for: row, week: week) == .done)
    }

    @Test func aWordlessSeatIsNeverSilentlyPromotedToThisWeek() {
        #expect(FieldRosterGrouping.band(for: seat("f", stage: "Awarded"), week: week) == .later)
        #expect(FieldRosterGrouping.band(for: seat("g", stage: "On the job"), week: week) == .thisWeek)
    }

    @Test func bandsComeBackInOrderWithTheirSeatsSorted() {
        let grouped = FieldRosterGrouping.grouped([
            seat("late", stage: "Awarded", from: "2027-02-01", name: "Zoe"),
            seat("now", from: "2026-10-12", to: "2027-08-13", name: "Ada"),
            seat("bid", stage: "Bidding", name: "Mika"),
            seat("earlier", stage: "Awarded", from: "2026-11-09", name: "Bo")
        ], week: week)
        #expect(grouped.map(\.band) == [.thisWeek, .later, .bidding])
        #expect(grouped[1].seats.map(\.displayName) == ["Bo", "Zoe"])
    }

    /// The Okonkwo fixture stands in its own week, so the Simulator shows the
    /// bands the specimen argues for.
    @Test func theFixtureBandsTheWayTheSpecimenDoes() {
        let grouped = FieldRosterGrouping.grouped(
            PeopleRoomFixtures.roster.seats,
            week: FieldRosterWeek.containing(PeopleRoomFixtures.roster.asOf))
        #expect(grouped.map(\.band) == [.thisWeek, .later, .bidding, .done])
        let thisWeek = grouped[0].seats.map(\.displayName)
        #expect(thisWeek.contains("Luis Ochoa"))
        #expect(thisWeek.contains("Dana Kowalski"))
        #expect(grouped[1].seats.map(\.displayName).contains("Pete Rusk"))
        #expect(grouped[3].seats.map(\.displayName) == ["Granite North"])
    }
}

// MARK: - The tel: line

struct FieldPhoneLineTests {
    @Test func anE164OnTheRecordWins() {
        #expect(FieldPhoneLine.dialable(e164: "+16125550109", display: "(612) 555-0111")
                == "+16125550109")
    }

    @Test func tenDigitsTakeTheStudiosOwnCountry() {
        #expect(FieldPhoneLine.dialable(display: "(612) 555-0109") == "+16125550109")
    }

    @Test func elevenDigitsLedByOneKeepTheirOwn() {
        #expect(FieldPhoneLine.dialable(display: "1 (612) 555-0109") == "+16125550109")
    }

    @Test func somethingTooShortToDialIsNotAPhoneNumber() {
        #expect(FieldPhoneLine.dialable(display: "555-0109") == nil)
        #expect(FieldPhoneLine.dialable(display: "") == nil)
        #expect(FieldPhoneLine.telURL(display: "x") == nil)
    }

    @Test func aMalformedE164FallsBackToTheDisplayedNumber() {
        #expect(FieldPhoneLine.dialable(e164: "6125550109", display: "(612) 555-0109")
                == "+16125550109")
    }

    @Test func theURLCarriesDigitsAndNoPunctuation() {
        let url = FieldPhoneLine.telURL(e164: "+16125550109", display: "(612) 555-0109")
        #expect(url?.absoluteString == "tel:+16125550109")
    }

    @Test func aRowWithNoNumberSaysSoRatherThanNothing() {
        #expect(FieldPhoneLine.noPhone == "No phone on file")
    }
}

// MARK: - The way in (PR-r)

struct FieldSiteAccessRulesTests {
    @Test func theWayInNamesTheLockboxAndWhoToAskAndNeverACode() {
        let line = FieldSiteAccessRules.wayIn(lockboxVersion: "3", askName: "Luis Ochoa")
        #expect(line == "Lockbox, version 3. The code is held off Patina; ask Luis Ochoa.")
    }

    @Test func withNoKeyHolderNamedItStillRefusesToHoldACode() {
        let line = FieldSiteAccessRules.wayIn(lockboxVersion: nil, askName: nil)
        #expect(line == "The code is held off Patina; ask the key holder.")
    }

    @Test func aBareRunOfDigitsReadsAsACode() {
        #expect(FieldSiteAccessRules.looksLikeACode("Gate 4417 then the side door"))
        #expect(FieldSiteAccessRules.looksLikeACode("code 90210"))
    }

    @Test func aPhoneNumberAndAYearAreNotCodes() {
        #expect(!FieldSiteAccessRules.looksLikeACode("Call (612) 555-0109 first"))
        #expect(!FieldSiteAccessRules.looksLikeACode("Changed 2026-10-16 by Priya"))
        #expect(!FieldSiteAccessRules.looksLikeACode("Weekdays 07:00 to 17:00"))
    }

    /// A code typed into the desk's free text never reaches a job site.
    @Test func freeTextCarryingACodeIsWithheld() {
        let out = FieldSiteAccessRules.withholding("Lockbox is 4417, garage side",
                                                   askName: "Luis Ochoa")
        #expect(out == "The code is held off Patina; ask Luis Ochoa.")
    }

    @Test func ordinaryFreeTextIsPrintedAsWritten() {
        let text = "Ngozi Eze receives deliveries. Stage in the detached garage."
        #expect(FieldSiteAccessRules.withholding(text, askName: "Luis Ochoa") == text)
        #expect(FieldSiteAccessRules.withholding("   ", askName: nil) == nil)
    }

    @Test func theFixtureCardHoldsNoCodeAnywhereOnIt() {
        let card = PeopleRoomFixtures.siteAccess
        let everyLine = [card.wayIn, card.gateControl, card.keyHolderLine,
                         card.hours, card.receiving].compactMap { $0 }
            + card.notices.map(\.what)
        #expect(everyLine.allSatisfy { !FieldSiteAccessRules.looksLikeACode($0) })
        #expect(card.wayIn.contains("held off Patina"))
    }

    @Test func theHeadLineIsTheOneTheRosterPrints() {
        let line = FieldSiteAccessRules.headLine(
            keyHolderName: "Ngozi Eze",
            gateControl: "Luis Ochoa controls the gate.",
            changedAt: day("2026-10-16"))
        #expect(line == "Key held by Ngozi Eze. Luis Ochoa controls the gate. Changed 16 Oct 2026.")
    }
}

// MARK: - Authority (PR-t)

struct FieldAuthorityWordsTests {
    @Test func aThresholdFigureNeverSurvivesToAPhone() {
        #expect(FieldAuthorityWords.phoneSafe("Signs money to $2,500.")
                == "Signs money to an agreed amount.")
    }

    @Test func aLineWithNoFigureIsLeftAlone() {
        #expect(FieldAuthorityWords.phoneSafe("Controls the gate.") == "Controls the gate.")
    }

    @Test func everyScopeSaysTheYesOrTheNoAndNoNumber() {
        let lines = ["money", "change_order", "draw_certify", "selections",
                     "schedule", "site_access", "key"]
            .map { FieldAuthorityWords.sentence(scope: $0, preparesOnly: false) }
        #expect(lines.allSatisfy { !$0.contains("$") })
        #expect(lines.allSatisfy { !$0.contains(where: \.isNumber) })
        #expect(lines.contains("May approve a change order."))
    }

    @Test func preparesOnlyOutranksTheScope() {
        #expect(FieldAuthorityWords.sentence(scope: "money", preparesOnly: true)
                == "Prepares only.")
    }

    @Test func theFixturesHouseholdMemberShowsTheYesAndNotTheFigure() {
        let chidi = PeopleRoomFixtures.people.first { $0.personID == "F-05" }
        #expect(chidi?.authorityWords == ["Signs money to an agreed amount."])
        #expect(chidi?.authorityWords.allSatisfy { !$0.contains("2,500") } == true)
    }

    @Test func emptyLinesAndDuplicatesAreDropped() {
        #expect(FieldAuthorityWords.phoneSafe(lines: ["", "  ", "Holds a key.", "Holds a key."])
                == ["Holds a key."])
    }
}

// MARK: - The words the columns carry

struct FieldPeopleVocabularyTests {
    @Test func theRecordsVerdictBecomesTheRoomsWord() {
        #expect(FieldPeopleVocabulary.consent("granted") == "Texting")
        #expect(FieldPeopleVocabulary.consent("pending") == "Invited")
        #expect(FieldPeopleVocabulary.consent("opted_out") == "Opted out")
        #expect(FieldPeopleVocabulary.consent("not_asked") == "Not asked")
    }

    /// A word nobody can read is not the affirmative one.
    @Test func anUnreadableConsentRecordStaysSilent() {
        #expect(FieldPeopleVocabulary.consent(nil) == nil)
        #expect(FieldPeopleVocabulary.consent("something_else") == nil)
    }

    @Test func reachFallsBackToOnPaperAndNeverToAnAccount() {
        #expect(FieldPeopleVocabulary.reach("account") == "Account")
        #expect(FieldPeopleVocabulary.reach("field_link") == "Field link")
        #expect(FieldPeopleVocabulary.reach(nil) == "On paper")
    }

    @Test func theFourPaperWordsAreTheFamilysOwn() {
        #expect(FieldPeopleVocabulary.paper("lapses_soon") == "Lapses in 30 days")
        #expect(FieldPeopleVocabulary.paper("lapsed") == "Lapsed")
        #expect(FieldPeopleVocabulary.paper("not_on_file") == "Not on file")
    }

    @Test func stagesMapOntoTheWordsTheBandsRead() {
        #expect(FieldPeopleVocabulary.stage("active") == "On the job")
        #expect(FieldPeopleVocabulary.stage("no_response") == "No response")
        #expect(FieldPeopleVocabulary.stage("off_job") == "Off the job")
    }
}

// MARK: - Offline

@MainActor
struct PeopleRoomCacheTests {
    private func freshCache() -> PeopleRoomCache {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("people-room-tests-\(UUID().uuidString)", isDirectory: true)
        return PeopleRoomCache(directory: directory)
    }

    private let owner = CaptureOwnerIdentity(userID: "u-1", workspaceID: "w-1")

    @Test func nothingCachedReadsAsNothingRatherThanAFailure() {
        #expect(freshCache().loadRoster(projectID: "p-1", owner: owner) == nil)
    }

    @Test func theLastGoodCopyComesBackWithTheStampItWasStoredAt() {
        let cache = freshCache()
        let stamp = day("2026-10-20")
        cache.saveRoster(PeopleRoomFixtures.roster, owner: owner, now: stamp)
        let cached = cache.loadRoster(projectID: PeopleRoomFixtures.projectID, owner: owner)
        #expect(cached?.storedAt == stamp)
        #expect(cached?.value.seats.count == PeopleRoomFixtures.roster.seats.count)
    }

    @Test func oneAccountsCachedCopyIsNotAnothersToRead() {
        let cache = freshCache()
        cache.saveRoster(PeopleRoomFixtures.roster, owner: owner)
        let other = CaptureOwnerIdentity(userID: "u-2", workspaceID: "w-1")
        #expect(cache.loadRoster(projectID: PeopleRoomFixtures.projectID, owner: other) == nil)
    }

    @Test func theSiteAccessCardCachesWholeAndKeepsItsNoCodeShape() {
        let cache = freshCache()
        cache.saveSiteAccess(PeopleRoomFixtures.siteAccess, owner: owner)
        let card = cache.loadSiteAccess(projectID: PeopleRoomFixtures.projectID, owner: owner)
        #expect(card?.value.wayIn == PeopleRoomFixtures.siteAccess.wayIn)
        #expect(card?.value.callFirst.count == 3)
    }

    @Test func aNoticeWrittenWithNoSignalIsQueuedAndThenDrained() async {
        let cache = freshCache()
        let draft = FieldSiteNoticeDraft(projectID: "p-1", what: "Lockbox changed to version 4.")
        cache.queue(draft, owner: owner)
        #expect(cache.pendingNotices(projectID: "p-1", owner: owner).count == 1)

        let written = await cache.drain(projectID: "p-1", owner: owner,
                                        using: MockPeopleRoomService())
        #expect(written.count == 1)
        #expect(cache.pendingNotices(projectID: "p-1", owner: owner).isEmpty)
    }

    @Test func aDrainThatCannotReachTheStudioLeavesTheQueueIntact() async {
        let cache = freshCache()
        cache.queue(FieldSiteNoticeDraft(projectID: "p-1", what: "Told Luis."), owner: owner)
        let written = await cache.drain(projectID: "p-1", owner: owner,
                                        using: RefusingPeopleRoomService())
        #expect(written.isEmpty)
        #expect(cache.pendingNotices(projectID: "p-1", owner: owner).count == 1)
    }

    @Test func theOfflineLineIsInkAndNotASpinner() {
        let now = day("2026-10-20")
        #expect(FieldPeopleDates.lastLoaded(now, now: now) == "Last loaded just now")
        #expect(FieldPeopleDates.lastLoaded(now.addingTimeInterval(-600), now: now)
                == "Last loaded 10 minutes ago")
        #expect(FieldPeopleDates.lastLoaded(now.addingTimeInterval(-7_200), now: now)
                == "Last loaded 2 hours ago")
        #expect(FieldPeopleDates.lastLoaded(day("2026-10-16"), now: now)
                == "Last loaded 16 Oct 2026")
    }
}

/// A studio that cannot be reached. Every call refuses, which is what a job site
/// with no bars looks like to this seam.
private struct RefusingPeopleRoomService: PeopleRoomService {
    struct NoSignal: Error {}

    func roster(projectID: String) async throws -> FieldProjectRoster { throw NoSignal() }
    func person(projectID: String, personID: String) async throws -> FieldPersonCard {
        throw NoSignal()
    }
    func siteAccess(projectID: String) async throws -> FieldSiteAccessCard { throw NoSignal() }
    func recordNotice(_ draft: FieldSiteNoticeDraft) async throws -> FieldSiteNotice {
        throw NoSignal()
    }
    func mintFieldLink(_ request: FieldLinkMintRequest) async throws -> FieldLinkMint {
        throw NoSignal()
    }
}

// MARK: - The mint (PR-s)

struct MintFieldLinkTests {
    @Test func aMintSaysWhenTheLinkEndsInWords() async throws {
        let mint = try await MockPeopleRoomService().mintFieldLink(
            FieldLinkMintRequest(projectID: PeopleRoomFixtures.projectID,
                                 fullName: "A framer's second", partyKind: "sub"))
        #expect(mint.expirySentence.hasPrefix("Ends with the job,"))
        #expect(mint.url.contains("/field/"))
    }
}

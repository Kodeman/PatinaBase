//
//  HouseRecordBuilderTests.swift
//  PatinaTests
//
//  Honesty (C5) is what these tests are for. A row draws only for a real
//  event carrying its real date; "new" comes from the last visit and from
//  nowhere else; on a first run nothing can be new; and an empty half is an
//  empty array the builder never pads.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct HouseRecordBuilderTests {

    // MARK: - Fixtures

    private let now = ISO8601DateFormatter().date(from: "2026-08-27T12:00:00Z")!

    private func day(_ iso: String) -> Date {
        ISO8601DateFormatter().date(from: iso)!
    }

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private func badges(
        decisions: [RemoteClientDecision] = [],
        proposals: [RemoteProposal] = [],
        invoices: [RemoteInvoice] = [],
        summaries: [RemoteCommsThreadSummary] = [],
        projects: [RemoteProject] = []
    ) -> BadgeCountService {
        let service = BadgeCountService.makeForTests()
        service.apply(
            decisions: decisions, summaries: summaries, proposals: proposals,
            invoices: invoices, projects: projects, roster: [], now: now
        )
        return service
    }

    /// The seed's three waiting things, as the walk sees them.
    private func waitingFixtures() throws -> (
        [RemoteClientDecision], [RemoteProposal], [RemoteInvoice]
    ) {
        let decisions = try decode([RemoteClientDecision].self, """
        [{ "id": "d1", "title": "Rug color — Natural vs Sand", "status": "pending",
           "due_date": "2026-08-22", "created_at": "2026-08-22T09:00:00Z",
           "project": { "name": "Aspen Loft Refresh",
             "designer": { "id": "u1", "display_name": "Leah Hartwell",
                           "business_name": "Hartwell Studio" } } }]
        """)
        let proposals = try decode([RemoteProposal].self, """
        [{ "id": "p1", "title": "Aspen Loft — Living Room Refresh", "status": "sent",
           "valid_until": "2026-09-08", "sent_at": "2026-08-24T09:00:00Z",
           "created_at": "2026-08-24T09:00:00Z", "total_amount": 1850000 }]
        """)
        let invoices = try decode([RemoteInvoice].self, """
        [{ "id": "i1", "invoice_number": "INV-2026-0142", "status": "sent",
           "due_date": "2026-09-01", "total_cents": 425000, "amount_paid_cents": 0,
           "sent_at": "2026-08-25T09:00:00Z", "created_at": "2026-08-25T09:00:00Z" }]
        """)
        return (decisions, proposals, invoices)
    }

    private func story(publishedAt: String) -> RemoteEditorialStory {
        RemoteEditorialStory(
            id: "s1", tag: "Maker spotlight",
            title: "The Grain Whisperer of Maine", subtitle: nil,
            bodyMarkdown: nil, readMinutes: 4, heroImageURL: nil,
            heroGradientKey: nil, makerName: nil, makerLocation: nil,
            makerAvatarURL: nil, makerAvatarGradientKey: nil,
            featuredProductID: nil, publishedAt: publishedAt
        )
    }

    private func lead(
        designerName: String? = "Leah Hartwell",
        createdAt: Date,
        updatedAt: Date? = nil
    ) -> DesignRequestStatus {
        DesignRequestStatus(
            leadId: UUID(uuidString: "11111111-1111-1111-1111-111111111111")!,
            statusRaw: "claimed",
            designerId: UUID(uuidString: "22222222-2222-2222-2222-222222222222")!,
            designerName: designerName, projectTypeRaw: nil, budgetRange: nil,
            timeline: nil, requestDescription: nil, scanCount: 0,
            createdAt: createdAt, updatedAt: updatedAt, dismissedAt: nil,
            dismissedStageRaw: nil
        )
    }

    private func build(
        badges: BadgeCountService,
        saved: [TableItemModel] = [],
        products: [Product] = [],
        story: RemoteEditorialStory? = nil,
        liveLead: DesignRequestStatus? = nil,
        lastSeen: Date?,
        now overrideNow: Date? = nil,
        previous: HouseRecord? = nil
    ) -> HouseRecord {
        HouseRecordBuilder.build(
            from: badges, saved: saved, products: products, story: story,
            liveLead: liveLead, lastSeen: lastSeen, now: overrideNow ?? now,
            previous: previous
        )
    }

    // MARK: - Order

    @Test("needs you is ordered by the date it was asked, ascending")
    func needsYouIsOrderedByTheDateItWasAsked() throws {
        let (decisions, proposals, invoices) = try waitingFixtures()

        let record = build(
            badges: badges(decisions: decisions, proposals: proposals, invoices: invoices),
            lastSeen: day("2026-08-20T12:00:00Z")
        )

        #expect(record.needsYou.map(\.kind) == [.decisionAsked, .proposalSent, .invoiceDue])
        #expect(record.needsYou.map(\.date) == record.needsYou.map(\.date).sorted())
    }

    @Test("moved is newest first")
    func movedIsNewestFirst() throws {
        let record = build(
            badges: badges(),
            story: story(publishedAt: "2026-08-25T09:00:00Z"),
            liveLead: lead(createdAt: day("2026-08-18T09:00:00Z")),
            lastSeen: day("2026-08-20T12:00:00Z")
        )

        #expect(record.moved.map(\.kind) == [.story, .matchedDesigner])
        #expect(record.moved[0].date > record.moved[1].date)
    }

    @Test("at most three rows per eyebrow, and the rest set has-more")
    func atMostThreeRowsPerEyebrowAndTheRestSetHasMore() throws {
        let decisions = try decode([RemoteClientDecision].self, """
        [
          { "id": "d1", "title": "One",   "status": "pending", "created_at": "2026-08-21T09:00:00Z" },
          { "id": "d2", "title": "Two",   "status": "pending", "created_at": "2026-08-22T09:00:00Z" },
          { "id": "d3", "title": "Three", "status": "pending", "created_at": "2026-08-23T09:00:00Z" },
          { "id": "d4", "title": "Four",  "status": "pending", "created_at": "2026-08-24T09:00:00Z" },
          { "id": "d5", "title": "Five",  "status": "pending", "created_at": "2026-08-25T09:00:00Z" }
        ]
        """)

        let record = build(badges: badges(decisions: decisions),
                           lastSeen: day("2026-08-20T12:00:00Z"))

        #expect(record.needsYou.count == 3)
        #expect(record.needsYou.map(\.detail) == ["One", "Two", "Three"])
        #expect(record.hasMoreNeedsYou)
        #expect(!record.hasMoreMoved)
    }

    // MARK: - Empties

    @Test("both halves empty makes an empty record, with nothing invented")
    func bothHalvesEmptyMakeAnEmptyRecord() {
        let record = build(badges: badges(), lastSeen: day("2026-08-20T12:00:00Z"))

        #expect(record.needsYou.isEmpty)
        #expect(record.moved.isEmpty)
        #expect(record.isEmpty)
        #expect(!record.hasMoreNeedsYou)
        #expect(!record.hasMoreMoved)
    }

    @Test("the two halves empty independently")
    func theEmptyHalvesAreIndependent() throws {
        let (decisions, _, _) = try waitingFixtures()

        let record = build(badges: badges(decisions: decisions),
                           lastSeen: day("2026-08-20T12:00:00Z"))

        #expect(record.needsYou.count == 1)
        #expect(record.moved.isEmpty)
        #expect(!record.isEmpty)
    }

    // MARK: - The window

    @Test("the window is a rolling seven days when you were here yesterday")
    func theWindowIsSevenRollingDaysWhenYouWereHereYesterday() throws {
        let lastSeen = day("2026-08-26T12:00:00Z")

        let record = build(
            badges: badges(),
            story: story(publishedAt: "2026-08-18T09:00:00Z"),   // nine days old
            lastSeen: lastSeen
        )

        // Seven days back from the START OF TODAY, not from the minute the app
        // was opened: the card prints whole days, so its window is whole days.
        let sevenWholeDays = Calendar.current.startOfDay(for: now)
            .addingTimeInterval(-7 * 86_400)
        #expect(record.window.end == now)
        #expect(record.window.start == sevenWholeDays)
        #expect(record.window.start < lastSeen)
        #expect(record.moved.isEmpty, "a nine-day-old event is outside a seven-day window")
    }

    @Test("two weeks away widens the window back to the last visit")
    func twoWeeksAwayWidensTheWindowToTheLastVisit() throws {
        let lastSeen = day("2026-08-13T12:00:00Z")   // fourteen days

        let record = build(
            badges: badges(),
            story: story(publishedAt: "2026-08-17T09:00:00Z"),   // ten days old
            lastSeen: lastSeen
        )

        #expect(record.window.start == lastSeen)
        #expect(record.moved.map(\.kind) == [.story])
    }

    /// B §1: nothing decays. An overdue decision does not fall off the record
    /// because it is old — that is the one thing the person most needs to see.
    @Test("needs you is never aged out of the window")
    func needsYouIsNotWindowFiltered() throws {
        let stale = try decode([RemoteClientDecision].self, """
        [{ "id": "d1", "title": "Rug color", "status": "pending",
           "due_date": "2026-06-01", "created_at": "2026-05-20T09:00:00Z" }]
        """)

        let record = build(badges: badges(decisions: stale),
                           lastSeen: day("2026-08-26T12:00:00Z"))

        #expect(record.needsYou.count == 1)
        #expect(record.needsYou[0].state == .overdue)
    }

    // MARK: - New

    @Test("on the first run nothing is new")
    func onTheFirstRunNothingIsNew() throws {
        let (decisions, proposals, invoices) = try waitingFixtures()

        let record = build(
            badges: badges(decisions: decisions, proposals: proposals, invoices: invoices),
            story: story(publishedAt: "2026-08-25T09:00:00Z"),
            lastSeen: nil
        )

        #expect(record.lastSeenAt == nil)
        #expect(record.needsYou.allSatisfy { !$0.isNew })
        #expect(record.moved.allSatisfy { !$0.isNew })
    }

    @Test("only what arrived after the last visit is new")
    func onlyWhatArrivedAfterTheLastVisitIsNew() throws {
        let (decisions, proposals, invoices) = try waitingFixtures()

        let record = build(
            badges: badges(decisions: decisions, proposals: proposals, invoices: invoices),
            lastSeen: day("2026-08-23T12:00:00Z")
        )

        // Asked Aug 22 — before the visit. Sent Aug 24 and Aug 25 — after.
        #expect(record.needsYou.map(\.isNew) == [false, true, true])
    }

    // MARK: - Six-hour suppression

    @Test("the second open of the day keeps the rows and does not re-date them")
    func theSecondOpenOfTheDayKeepsTheRowsAndTheirDates() throws {
        let (decisions, proposals, invoices) = try waitingFixtures()
        let service = badges(decisions: decisions, proposals: proposals, invoices: invoices)

        let morning = day("2026-08-27T12:40:00Z")
        let first = build(badges: service, lastSeen: day("2026-08-20T12:00:00Z"),
                          now: morning)

        // Noon: LastSeenStore has since been stamped with the morning open.
        let noon = day("2026-08-27T17:30:00Z")
        let second = build(badges: service, lastSeen: morning, now: noon, previous: first)

        #expect(second.needsYou.map(\.id) == first.needsYou.map(\.id))
        #expect(second.needsYou.map(\.date) == first.needsYou.map(\.date))
        #expect(second.needsYou.map(\.isNew) == first.needsYou.map(\.isNew))
        #expect(second.lastSeenAt == first.lastSeenAt)
        #expect(second.window.start == first.window.start)
        #expect(second.window.end == noon)
    }

    @Test("a rebuild more than six hours later takes the newer anchor")
    func aRebuildMoreThanSixHoursLaterTakesTheNewAnchor() throws {
        let (decisions, proposals, invoices) = try waitingFixtures()
        let service = badges(decisions: decisions, proposals: proposals, invoices: invoices)

        let morning = day("2026-08-27T12:40:00Z")
        let first = build(badges: service, lastSeen: day("2026-08-20T12:00:00Z"),
                          now: morning)

        let evening = day("2026-08-27T20:00:00Z")   // seven hours later
        let second = build(badges: service, lastSeen: morning, now: evening, previous: first)

        #expect(second.lastSeenAt == morning)
        #expect(second.lastSeenAt != first.lastSeenAt)
        // Nothing arrived between the two opens, and the anchor moved past
        // every row, so none of them is new any more.
        #expect(first.needsYou.allSatisfy { $0.isNew })
        #expect(second.needsYou.allSatisfy { !$0.isNew })
    }

    // MARK: - Copy and honesty

    @Test("the rows name the designer who acted")
    func theRowsNameTheDesignerWhoActed() throws {
        let (decisions, proposals, invoices) = try waitingFixtures()

        let record = build(
            badges: badges(decisions: decisions, proposals: proposals, invoices: invoices),
            liveLead: lead(createdAt: day("2026-08-18T09:00:00Z")),
            lastSeen: day("2026-08-20T12:00:00Z")
        )

        #expect(record.needsYou[0].title == "Leah Hartwell asked you to choose.")
        #expect(record.needsYou[0].detail == "Rug color — Natural vs Sand")
        #expect(record.needsYou[1].title == "Leah Hartwell sent a proposal to review.")
        #expect(record.needsYou[2].title == "Your invoice is due.")
        #expect(record.needsYou[2].detail == "INV-2026-0142")
    }

    @Test("with no designer anywhere the rows say your designer, not a name")
    func withNoDesignerTheRowsSayYourDesigner() throws {
        let decisions = try decode([RemoteClientDecision].self, """
        [{ "id": "d1", "title": "Rug color", "status": "pending",
           "created_at": "2026-08-22T09:00:00Z" }]
        """)

        let record = build(badges: badges(decisions: decisions),
                           lastSeen: day("2026-08-20T12:00:00Z"))

        #expect(record.needsYou[0].title == "Your designer asked you to choose.")
    }

    @Test("James sees that his request was picked up, on the date it was")
    func theMatchedDesignerRowIsTheFirstThingEngagedSees() throws {
        let picked = day("2026-08-24T09:00:00Z")

        let record = build(
            badges: badges(),
            liveLead: lead(createdAt: day("2026-08-18T09:00:00Z"), updatedAt: picked),
            lastSeen: day("2026-08-20T12:00:00Z")
        )

        let row = try #require(record.moved.first)
        #expect(row.kind == .matchedDesigner)
        #expect(row.title == "Leah Hartwell picked up your request.")
        #expect(row.date == picked)
        #expect(row.isNew)
        #expect(row.route == .designRequests(
            focusLeadId: "11111111-1111-1111-1111-111111111111"))
    }

    @Test("a lead nobody has claimed draws no row")
    func anUnclaimedLeadDrawsNothing() {
        let unclaimed = DesignRequestStatus(
            leadId: UUID(), statusRaw: "new", designerId: nil, designerName: nil,
            projectTypeRaw: nil, budgetRange: nil, timeline: nil,
            requestDescription: nil, scanCount: 0,
            createdAt: day("2026-08-24T09:00:00Z"), updatedAt: nil,
            dismissedAt: nil, dismissedStageRaw: nil
        )

        let record = build(badges: badges(), liveLead: unclaimed,
                           lastSeen: day("2026-08-20T12:00:00Z"))

        #expect(record.moved.isEmpty)
    }

    @Test("an unread message draws a row on the date it arrived")
    func anUnreadMessageDrawsARow() throws {
        let summaries = try decode([RemoteCommsThreadSummary].self, """
        [{
          "id": "thread-1", "kind": "project", "title": "Aspen Loft Refresh",
          "last_message_at": "2026-08-26T14:00:00Z",
          "comms_messages": [{
            "sender_id": "designer", "body": "The oak sample arrived.",
            "system": false, "created_at": "2026-08-26T14:00:00Z", "deleted_at": null
          }],
          "comms_thread_participants": [{
            "profile_id": "client", "role": "client",
            "last_read_at": "2026-08-25T14:00:00Z", "left_at": null
          }]
        }]
        """)

        let record = build(badges: badges(summaries: summaries),
                           liveLead: lead(createdAt: day("2026-08-18T09:00:00Z")),
                           lastSeen: day("2026-08-25T12:00:00Z"))

        let row = try #require(record.moved.first { $0.kind == .messageReceived })
        #expect(row.title == "Leah Hartwell sent you a message.")
        #expect(row.detail == "Aspen Loft Refresh")
        #expect(row.date == day("2026-08-26T14:00:00Z"))
        #expect(row.route == .threadDetail(threadId: "thread-1"))
    }

    @Test("a story with no publish date draws nothing")
    func aStoryWithNoPublishDateDrawsNothing() {
        let undated = RemoteEditorialStory(
            id: "s1", tag: "Maker spotlight", title: "The Grain Whisperer of Maine",
            subtitle: nil, bodyMarkdown: nil, readMinutes: 4, heroImageURL: nil,
            heroGradientKey: nil, makerName: nil, makerLocation: nil,
            makerAvatarURL: nil, makerAvatarGradientKey: nil,
            featuredProductID: nil, publishedAt: nil
        )

        let record = build(badges: badges(), story: undated,
                           lastSeen: day("2026-08-20T12:00:00Z"))

        #expect(record.moved.isEmpty)
    }

    @Test("a waiting thing with no date at all does not draw")
    func aRowWithNoDateDoesNotDraw() throws {
        // A proposal with neither sent_at nor created_at: there is no honest
        // date to print, so there is no row.
        let dateless = try decode([RemoteProposal].self, """
        [{ "id": "p1", "title": "Undated", "status": "sent", "valid_until": "2099-09-08" }]
        """)

        let record = build(badges: badges(proposals: dateless),
                           lastSeen: day("2026-08-20T12:00:00Z"))

        #expect(record.needsYou.isEmpty)
    }

    @Test("every row that draws carries a date inside the record it belongs to")
    func everyRowCarriesARealDate() throws {
        let (decisions, proposals, invoices) = try waitingFixtures()

        let record = build(
            badges: badges(decisions: decisions, proposals: proposals, invoices: invoices),
            story: story(publishedAt: "2026-08-25T09:00:00Z"),
            liveLead: lead(createdAt: day("2026-08-18T09:00:00Z"),
                           updatedAt: day("2026-08-24T09:00:00Z")),
            lastSeen: day("2026-08-20T12:00:00Z")
        )

        #expect(!record.moved.isEmpty)
        for row in record.moved {
            // Either the window covers the date the row prints, or the row is
            // marked as a standing condition and prints no date at all. There
            // is no third case: a dated row under a header the date predates
            // is the card contradicting itself.
            #expect(record.window.contains(row.date) || row.isStandingCondition,
                    "\(row.id) drew a date outside the window without being marked")
        }
        #expect(record.moved.allSatisfy { !$0.isStandingCondition },
                "nothing in this fixture is outside the window")
        for row in record.needsYou + record.moved {
            #expect(row.date < now)
            #expect(row.date > day("2020-01-01T00:00:00Z"))
        }
    }

    @Test("a row the window does not cover is marked, so it draws no date under the header")
    func aRowOutsideTheWindowIsMarkedAsAStandingCondition() throws {
        // Picked up three weeks ago, and still unresolved.
        let record = build(
            badges: badges(),
            liveLead: lead(createdAt: day("2026-08-01T09:00:00Z"),
                           updatedAt: day("2026-08-05T09:00:00Z")),
            lastSeen: day("2026-08-26T12:00:00Z")
        )

        let row = try #require(record.moved.first)
        #expect(row.kind == .matchedDesigner)
        #expect(!record.window.contains(row.date))
        #expect(row.isStandingCondition)
        #expect(!row.isNew)
    }

    @Test("a matched request three weeks old is not evicted by three newer rows")
    func theMatchedRequestSurvivesTheCap() throws {
        let summaries = try decode([RemoteCommsThreadSummary].self, """
        [
          { "id": "t1", "kind": "project", "title": "One",
            "comms_messages": [{ "sender_id": "d", "body": "a", "system": false,
              "created_at": "2026-08-24T09:00:00Z", "deleted_at": null }],
            "comms_thread_participants": [{ "profile_id": "c", "role": "client",
              "last_read_at": "2026-08-20T09:00:00Z", "left_at": null }] },
          { "id": "t2", "kind": "project", "title": "Two",
            "comms_messages": [{ "sender_id": "d", "body": "b", "system": false,
              "created_at": "2026-08-25T09:00:00Z", "deleted_at": null }],
            "comms_thread_participants": [{ "profile_id": "c", "role": "client",
              "last_read_at": "2026-08-20T09:00:00Z", "left_at": null }] },
          { "id": "t3", "kind": "project", "title": "Three",
            "comms_messages": [{ "sender_id": "d", "body": "c", "system": false,
              "created_at": "2026-08-26T09:00:00Z", "deleted_at": null }],
            "comms_thread_participants": [{ "profile_id": "c", "role": "client",
              "last_read_at": "2026-08-20T09:00:00Z", "left_at": null }] }
        ]
        """)

        let record = build(
            badges: badges(summaries: summaries),
            liveLead: lead(createdAt: day("2026-08-01T09:00:00Z"),
                           updatedAt: day("2026-08-05T09:00:00Z")),
            lastSeen: day("2026-08-20T12:00:00Z")
        )

        // B §1: a matched request stays on the record until it resolves. Being
        // pushed off by three newer rows is the same decay by another door.
        #expect(record.moved.count == 3)
        #expect(record.moved.contains { $0.kind == .matchedDesigner })
        #expect(record.hasMoreMoved)
        // Still newest first, with the standing row last.
        #expect(record.moved.last?.kind == .matchedDesigner)
    }

    @Test("the match ceremony's own date is preferred to the lead's last write")
    func theMatchedRowPrefersTheCeremonyDate() throws {
        let ceremony = day("2026-08-24T09:00:00Z")
        let anyLaterWrite = day("2026-08-26T18:00:00Z")
        var claimed = lead(createdAt: day("2026-08-18T09:00:00Z"), updatedAt: anyLaterWrite)
        claimed = DesignRequestStatus(
            leadId: claimed.leadId, statusRaw: claimed.statusRaw,
            designerId: claimed.designerId, designerName: claimed.designerName,
            projectTypeRaw: nil, budgetRange: nil, timeline: nil,
            requestDescription: nil, scanCount: 0,
            createdAt: claimed.createdAt, updatedAt: anyLaterWrite,
            dismissedAt: nil, dismissedStageRaw: nil,
            introduction: IntroductionInfo(
                ceremonyId: UUID(), state: "sent", introText: nil,
                credentialLine: nil, portfolioUrl: nil, slots: [], timezone: nil,
                offeredAt: day("2026-08-25T09:00:00Z"), pickedSlotId: nil,
                pickedSlotStartsAt: nil, threadId: nil, createdAt: ceremony
            )
        )

        let record = build(badges: badges(), liveLead: claimed,
                           lastSeen: day("2026-08-20T12:00:00Z"))

        let row = try #require(record.moved.first)
        #expect(row.date == ceremony)
        #expect(row.date != anyLaterWrite)
    }

    @Test("a waiting thing with no date still counts toward See all")
    func theDatelessWaitingItemStillCountsTowardHasMore() throws {
        let decisions = try decode([RemoteClientDecision].self, """
        [
          { "id": "d1", "title": "One",   "status": "pending", "created_at": "2026-08-21T09:00:00Z" },
          { "id": "d2", "title": "Two",   "status": "pending", "created_at": "2026-08-22T09:00:00Z" },
          { "id": "d3", "title": "Three", "status": "pending", "created_at": "2026-08-23T09:00:00Z" }
        ]
        """)
        // A fourth waiting thing that cannot say when it was asked: it does not
        // draw, but the Studio still counts it, so the record must offer the
        // way through to it.
        let dateless = try decode([RemoteProposal].self, """
        [{ "id": "p1", "title": "Undated", "status": "sent", "valid_until": "2099-09-08" }]
        """)

        let record = build(badges: badges(decisions: decisions, proposals: dateless),
                           lastSeen: day("2026-08-20T12:00:00Z"))

        #expect(record.needsYou.count == 3)
        #expect(record.hasMoreNeedsYou)
    }

    @Test("a designer row with no name at all reads as one sentence")
    func aDesignerWithEveryNameColumnNullStillReadsAsASentence() throws {
        // profiles row present, every name column null: the embed brings back a
        // designer object with nothing to print.
        let decisions = try decode([RemoteClientDecision].self, """
        [{ "id": "d1", "title": "Rug color", "status": "pending",
           "created_at": "2026-08-22T09:00:00Z",
           "project": { "name": "Aspen Loft Refresh",
             "designer": { "id": "u1", "display_name": null,
                           "full_name": null, "business_name": null } } }]
        """)

        let record = build(badges: badges(decisions: decisions),
                           lastSeen: day("2026-08-20T12:00:00Z"))

        #expect(record.needsYou[0].title == "Your designer asked you to choose.")
        #expect(!record.needsYou[0].title.hasPrefix("your"))
    }

    @Test("opening every five hours holds the same anchor, three opens deep")
    func theAnchorHoldsAcrossThreeCloseOpens() throws {
        let (decisions, proposals, invoices) = try waitingFixtures()
        let service = badges(decisions: decisions, proposals: proposals, invoices: invoices)

        let first = build(badges: service, lastSeen: day("2026-08-20T12:00:00Z"),
                          now: day("2026-08-27T08:00:00Z"))
        let second = build(badges: service, lastSeen: day("2026-08-27T08:00:00Z"),
                           now: day("2026-08-27T13:00:00Z"), previous: first)
        let third = build(badges: service, lastSeen: day("2026-08-27T13:00:00Z"),
                          now: day("2026-08-27T18:00:00Z"), previous: second)

        #expect(third.lastSeenAt == first.lastSeenAt)
        #expect(third.window.start == first.window.start)
        #expect(third.needsYou.map(\.isNew) == first.needsYou.map(\.isNew))
    }

    @Test("the invoice row carries the balance and the due date, not a colour")
    func theInvoiceRowCarriesTheBalanceAndDueDate() throws {
        let (_, _, invoices) = try waitingFixtures()

        let record = build(badges: badges(invoices: invoices),
                           lastSeen: day("2026-08-20T12:00:00Z"))

        let due = try #require(ISO8601DateParsing.dateOrDay(from: "2026-09-01"))
        #expect(record.needsYou[0].state == .amount(cents: 425_000, due: due))
    }

    @Test("a proposal still open carries its review-by date")
    func aProposalCarriesItsReviewByDate() throws {
        let (_, proposals, _) = try waitingFixtures()

        let record = build(badges: badges(proposals: proposals),
                           lastSeen: day("2026-08-20T12:00:00Z"))

        let by = try #require(ISO8601DateParsing.dateOrDay(from: "2026-09-08"))
        #expect(record.needsYou[0].state == .due(by))
    }
}

// MARK: - The discovering rows

@MainActor
struct HouseRecordSavedPieceTests {

    private let now = ISO8601DateFormatter().date(from: "2026-08-27T12:00:00Z")!

    private func day(_ iso: String) -> Date {
        ISO8601DateFormatter().date(from: iso)!
    }

    private func savedLamp(priceInCents: Int?) -> TableItemModel {
        TableItemModel(
            name: "Brass Arc Floor Lamp",
            productId: "lamp-1",
            savedAt: day("2026-08-18T12:00:00Z"),
            brandName: "Schoolhouse",
            priceInCents: priceInCents
        )
    }

    private func lamp(priceCents: Int, deletedAt: Date? = nil) -> Product {
        Product(
            id: "lamp-1", name: "Brass Arc Floor Lamp", priceCents: priceCents,
            matchScore: 80, makerName: "Schoolhouse", makerLocation: nil,
            makerStory: nil, imageURL: nil, usdzURL: nil,
            styleTags: [], materialTags: [], badges: [],
            category: .lighting, tier: .styleMatch,
            deletedAt: deletedAt
        )
    }

    private func build(saved: [TableItemModel], products: [Product]) -> HouseRecord {
        HouseRecordBuilder.build(
            from: BadgeCountService.makeForTests(), saved: saved, products: products,
            story: nil, liveLead: nil, lastSeen: day("2026-08-20T12:00:00Z"), now: now
        )
    }

    @Test("a saved piece that dropped in price states both numbers")
    func aSavedPieceThatDroppedInPriceDrawsBothNumbers() throws {
        let record = build(saved: [savedLamp(priceInCents: 99_000)],
                           products: [lamp(priceCents: 89_000)])

        let row = try #require(record.moved.first)
        #expect(row.kind == .savedPieceRepriced)
        // The wire says nothing about WHEN the price moved, so the row makes no
        // dated claim and never carries a tick earned by the reader's own save.
        #expect(row.isStandingCondition)
        #expect(!row.isNew)
        #expect(row.title
                == "The Brass Arc Floor Lamp you saved is $100 less than when you saved it.")
        #expect(row.detail == "Saved at $990.00 · now $890.00")
        #expect(row.route == .pieceDetail(pieceId: "lamp-1"))
        // No countdown, no scarcity count, no was/now strike.
        let printed = row.title + (row.detail ?? "")
        for banned in ["was ", "Was ", "%", "left", "hurry", "only"] {
            #expect(!printed.contains(banned), "the repriced row printed \(banned)")
        }
    }

    @Test("a saved piece that went up says more, in both numbers")
    func aSavedPieceThatWentUpSaysMore() throws {
        let record = build(saved: [savedLamp(priceInCents: 89_000)],
                           products: [lamp(priceCents: 99_000)])

        let row = try #require(record.moved.first)
        #expect(row.title
                == "The Brass Arc Floor Lamp you saved is $100 more than when you saved it.")
        #expect(row.detail == "Saved at $890.00 · now $990.00")
    }

    @Test("a move of less than a dollar is not a row that says nothing happened")
    func aSubDollarMoveDrawsNoRow() {
        let record = build(saved: [savedLamp(priceInCents: 89_050)],
                           products: [lamp(priceCents: 89_000)])

        #expect(record.moved.isEmpty)
    }

    @Test("a move that is not whole dollars states the exact figure")
    func anUnevenMoveStatesTheExactFigure() throws {
        let record = build(saved: [savedLamp(priceInCents: 99_049)],
                           products: [lamp(priceCents: 89_000)])

        let row = try #require(record.moved.first)
        #expect(row.title
                == "The Brass Arc Floor Lamp you saved is $100.49 less than when you saved it.")
        #expect(row.detail == "Saved at $990.49 · now $890.00")
    }

    @Test("an unchanged price draws no row")
    func anUnchangedPriceDrawsNoRow() {
        let record = build(saved: [savedLamp(priceInCents: 89_000)],
                           products: [lamp(priceCents: 89_000)])

        #expect(record.moved.isEmpty)
    }

    @Test("a piece saved without a price draws no repricing row")
    func aPieceSavedWithoutAPriceDrawsNothing() {
        let record = build(saved: [savedLamp(priceInCents: nil)],
                           products: [lamp(priceCents: 89_000)])

        #expect(record.moved.isEmpty)
    }

    @Test("a withdrawn saved piece draws on the date it was withdrawn")
    func aWithdrawnSavedPieceDrawsOnItsDeletionDate() throws {
        let withdrawn = day("2026-08-24T12:00:00Z")

        let record = build(
            saved: [savedLamp(priceInCents: 89_000)],
            products: [lamp(priceCents: 89_000, deletedAt: withdrawn)]
        )

        let row = try #require(record.moved.first)
        #expect(row.kind == .savedPieceWithdrawn)
        #expect(row.title == "The Brass Arc Floor Lamp you saved is no longer available.")
        #expect(row.date == withdrawn)
        #expect(row.isNew)
    }

    @Test("a withdrawn piece is not also reported as repriced")
    func aWithdrawnPieceDrawsOneRowNotTwo() throws {
        let record = build(
            saved: [savedLamp(priceInCents: 99_000)],
            products: [lamp(priceCents: 89_000, deletedAt: day("2026-08-24T12:00:00Z"))]
        )

        #expect(record.moved.count == 1)
        #expect(record.moved[0].kind == .savedPieceWithdrawn)
    }

    @Test("a piece withdrawn before the window does not draw")
    func aPieceWithdrawnLongAgoDoesNotDraw() {
        let record = build(
            saved: [savedLamp(priceInCents: 89_000)],
            products: [lamp(priceCents: 89_000, deletedAt: day("2026-07-01T12:00:00Z"))]
        )

        #expect(record.moved.isEmpty)
    }

    /// The honest silence: the record composes over the products the caller
    /// supplied, and says nothing about a piece nobody fetched.
    @Test("a saved piece with no product row draws nothing")
    func aSavedPieceWithNoProductRowDrawsNothing() {
        let record = build(saved: [savedLamp(priceInCents: 99_000)], products: [])

        #expect(record.moved.isEmpty)
    }

    @Test("a product carrying deleted_at decodes it")
    func productDecodesDeletedAt() throws {
        let product = try JSONDecoder().decode(Product.self, from: Data("""
        { "id": "lamp-1", "name": "Brass Arc Floor Lamp", "price_cents": 89000,
          "deleted_at": "2026-08-24T12:00:00Z" }
        """.utf8))

        #expect(product.deletedAt == day("2026-08-24T12:00:00Z"))
    }

    @Test("a product with no deleted_at has none")
    func productWithoutDeletedAtHasNone() throws {
        let product = try JSONDecoder().decode(Product.self, from: Data("""
        { "id": "lamp-1", "name": "Brass Arc Floor Lamp", "price_cents": 89000 }
        """.utf8))

        #expect(product.deletedAt == nil)
    }
}

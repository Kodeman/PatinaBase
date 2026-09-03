//
//  AttentionCountTests.swift
//  PatinaTests
//
//  SP-16's first half. One screen printed three answers to "how much needs
//  me?": the Studio header read "4 things need your eye", the Companion below
//  it read the same in mono caps, the block between them read "Awaiting you 3",
//  and Today said "2 project decisions waiting". The count is computed once
//  now, from BadgeCountService, and every surface reads that number.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct AttentionCountTests {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private struct Fixtures {
        let decisions: [RemoteClientDecision]
        let summaries: [RemoteCommsThreadSummary]
        let proposals: [RemoteProposal]
        let invoices: [RemoteInvoice]
        let projects: [RemoteProject]
    }

    private func fixtures() throws -> Fixtures {
        // Two decisions, one signable proposal, one payable invoice — the
        // shape the review walked: four items collapsing to three rows.
        let decisions = try decode([RemoteClientDecision].self, """
        [
          { "id": "d1", "title": "Rug color", "status": "pending",
            "due_date": "2026-08-22", "created_at": "2026-08-12T12:00:00Z" },
          { "id": "d2", "title": "Sconce finish", "status": "pending",
            "due_date": "2026-09-02", "created_at": "2026-08-14T12:00:00Z" }
        ]
        """)
        let summaries = try decode([RemoteCommsThreadSummary].self, """
        [{
          "id": "thread-1", "kind": "project", "title": "Oak Street",
          "last_message_at": "2026-07-29T14:00:00Z",
          "comms_messages": [{
            "sender_id": "designer", "body": "The oak sample arrived.", "system": false,
            "created_at": "2026-07-29T14:00:00Z", "deleted_at": null
          }],
          "comms_thread_participants": [{
            "profile_id": "client", "role": "client",
            "last_read_at": "2026-07-28T14:00:00Z", "left_at": null
          }]
        }]
        """)
        let proposals = try decode([RemoteProposal].self, """
        [{ "id": "p1", "title": "Phase 1", "status": "sent",
           "valid_until": "2099-09-08", "updated_at": "2026-08-20T12:00:00Z" }]
        """)
        let invoices = try decode([RemoteInvoice].self, """
        [{
          "id": "i1", "status": "sent", "due_date": "2026-09-01",
          "total_cents": 425000, "amount_paid_cents": 0, "currency": "USD",
          "created_at": "2026-08-18T12:00:00Z"
        }]
        """)
        let projects = try decode([RemoteProject].self, """
        [{ "id": "11111111-1111-1111-1111-111111111111", "name": "Oak Street",
           "status": "active", "updated_at": "2026-08-20T12:00:00Z" }]
        """)
        return Fixtures(
            decisions: decisions, summaries: summaries, proposals: proposals,
            invoices: invoices, projects: projects
        )
    }

    @Test("the attention count sums the three queues that actually need the client")
    func attentionCountSumsTheThreeQueues() throws {
        let rows = try fixtures()
        let badges = BadgeCountService.makeForTests()
        badges.apply(
            decisions: rows.decisions, summaries: rows.summaries,
            proposals: rows.proposals, invoices: rows.invoices,
            projects: rows.projects, roster: []
        )

        #expect(badges.pendingDecisionCount == 2)
        #expect(badges.proposalsAwaitingSignatureCount == 1)
        #expect(badges.payableInvoiceCount == 1)
        #expect(badges.attentionCount == 4)
        #expect(badges.attentionHint == "4 things need your eye")
    }

    @Test("one thing needing the client reads in the singular")
    func singularHint() throws {
        let rows = try fixtures()
        let badges = BadgeCountService.makeForTests()
        badges.apply(
            decisions: [], summaries: rows.summaries,
            proposals: [], invoices: rows.invoices,
            projects: rows.projects, roster: []
        )
        #expect(badges.attentionCount == 1)
        #expect(badges.attentionHint == "1 thing needs your eye")
    }

    @Test("nothing needing the client prints no count at all")
    func emptyHintIsNil() throws {
        let rows = try fixtures()
        let badges = BadgeCountService.makeForTests()
        badges.apply(
            decisions: [], summaries: rows.summaries,
            proposals: [], invoices: [],
            projects: rows.projects, roster: []
        )
        #expect(badges.attentionCount == 0)
        #expect(badges.attentionHint == nil)
    }

    /// The three surfaces the review caught disagreeing all print the same
    /// string now, because they all derive it from one number.
    @Test("the Studio subhead, the footer/Companion and the Daily Room agree")
    func everyConsumerPrintsTheSameCount() throws {
        let rows = try fixtures()
        let badges = BadgeCountService.makeForTests()
        badges.apply(
            decisions: rows.decisions, summaries: rows.summaries,
            proposals: rows.proposals, invoices: rows.invoices,
            projects: rows.projects, roster: []
        )

        let expected = StudioAttentionSummary.attentionHint(count: badges.attentionCount)
        #expect(expected == "4 things need your eye")

        // The Studio snapshot's own summary carries the same number rather
        // than recomputing it from a different fetch.
        let snapshot = StudioQueueBuilder.build(
            StudioQueueInput(
                projects: rows.projects,
                decisions: rows.decisions,
                proposals: rows.proposals,
                invoices: rows.invoices,
                documents: [],
                threads: rows.summaries,
                notifications: [],
                currentUserId: "client",
                now: try #require(ISO8601DateFormatter().date(from: "2026-07-29T16:00:00Z"))
            )
        )
        // The "Awaiting you" badge prints `awaitingCount`, so this is also the
        // assertion that the header and that badge cannot disagree.
        #expect(snapshot.attentionSummary.awaitingCount == badges.attentionCount)
        #expect(snapshot.attentionSummary.hint == expected)
        #expect(badges.attentionHint == expected)
    }

    /// B2, authored by this lane and caught in review: the Studio subhead was
    /// switched to `attentionHint` alone, which is nil whenever nothing is
    /// awaiting — so a client with three unread threads and no decisions read
    /// "Nothing needs your attention right now." as the header directly above
    /// a Conversation block reading "3 unread threads".
    @Test("a client with unread threads and nothing awaiting is not told nothing needs them")
    func nothingAwaitingIsNotNothingHappening() throws {
        let rows = try fixtures()
        let badges = BadgeCountService.makeForTests()
        badges.apply(
            decisions: [], summaries: rows.summaries,
            proposals: [], invoices: [],
            projects: rows.projects, roster: []
        )

        #expect(badges.attentionCount == 0)
        #expect(badges.attentionHint == nil, "nothing is awaiting, so there is no count to print")
        #expect(badges.studioHint == "1 new conversation",
                "the sentence a consumer prints must fall through to the rest of the chain")
    }

    @Test("with nothing awaiting and nothing unread the chain reaches the projects")
    func theChainReachesTheProjects() throws {
        let rows = try fixtures()
        let badges = BadgeCountService.makeForTests()
        badges.apply(
            decisions: [], summaries: [], proposals: [], invoices: [],
            projects: rows.projects, roster: []
        )
        #expect(badges.studioHint == "1 project is moving")
    }

    @Test("with nothing at all there is no sentence")
    func silenceIsTheHonestAnswer() {
        let badges = BadgeCountService.makeForTests()
        badges.apply(
            decisions: [], summaries: [], proposals: [], invoices: [],
            projects: [], roster: []
        )
        #expect(badges.studioHint == nil)
    }

    /// m7: `everyConsumerPrintsTheSameCount` compares model to model, which is
    /// why B2 slipped through the seam it was checking. The consumers are
    /// SwiftUI `body` expressions with no callable seam, so this asserts on
    /// what they read — a consumer that goes back to `attentionHint` alone,
    /// or recomputes the count from its own fetch, fails here.
    @Test("all three consumers read the one hint, not their own recomputation")
    func everyConsumerReadsTheOneHint() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // PatinaTests
            .deletingLastPathComponent()   // Patina
            .appendingPathComponent("Patina")

        for path in [
            "Features/Profile/Views/StudioHubView.swift",
            "Features/Companion/Views/CompanionOverlay.swift",
            "Features/Home/Views/DailyRoomView.swift"
        ] {
            let source = try String(
                contentsOf: root.appendingPathComponent(path), encoding: .utf8
            )
            #expect(source.contains("BadgeCountService.shared.studioHint")
                    || source.contains("badges.studioHint"),
                    "\(path) no longer reads the one hint")
            for regression in ["shared.attentionHint", "badges.attentionHint"] {
                #expect(!source.contains(regression),
                        "\(path) prints the attention sentence alone, which is nil at zero")
            }
        }
    }

    /// M4: the header and the "Awaiting you" rows were two computations over
    /// two fetches with different predicates. `valid_until` is a Postgres
    /// `date`, which both ISO8601 formatters reject — so `isSignable` read a
    /// long-expired proposal as having no expiry at all and counted it, while
    /// the Studio's own row did not.
    @Test("a proposal that expired yesterday counts for neither surface")
    func anExpiredDateOnlyProposalCountsNowhere() throws {
        let expired = try decode([RemoteProposal].self, """
        [{ "id": "p-old", "title": "Phase 1", "status": "sent",
           "valid_until": "2020-01-31", "updated_at": "2020-01-01T12:00:00Z" }]
        """)
        let now = try #require(ISO8601DateFormatter().date(from: "2026-07-29T16:00:00Z"))

        #expect(expired[0].isSignable, "isSignable still reads a bare date as no expiry")
        #expect(!expired[0].isAwaitingSignature(now: now))

        let badges = BadgeCountService.makeForTests()
        badges.apply(
            decisions: [], summaries: [], proposals: expired, invoices: [],
            projects: [], roster: [], now: now
        )
        #expect(badges.proposalsAwaitingSignatureCount == 0)

        let snapshot = StudioQueueBuilder.build(
            StudioQueueInput(
                projects: [], decisions: [], proposals: expired, invoices: [],
                documents: [], threads: [], notifications: [],
                currentUserId: "client", now: now
            )
        )
        #expect(snapshot.attentionSummary.awaitingCount == badges.attentionCount)
    }

    // MARK: - A-81: four numbers on one screen

    /// The finding as filed: bell 3 · Studio 5 · "5 THINGS NEED YOUR EYE" ·
    /// a NEEDS YOU section listing 3 rows. It is two counts each shown twice,
    /// and the third number is the same count capped for drawing — so what it
    /// takes to be honest is (a) one derivation for the attention count, and
    /// (b) a card that says out loud when it is showing fewer rows than the
    /// count it sits under.
    @Test("the bell and the Studio pill count different things, and both say which")
    func theTwoCountsAreDistinctAndBothAreNamed() throws {
        let header = try SourcePin.read("Patina/Features/Home/Views/DailyGreetingHeader.swift")
        // The bell is unread notifications and names itself as such.
        #expect(header.contains(#"accessibilityLabel("Notifications")"#))
        #expect(header.contains(#"\(unreadCount) unread"#))
        // The Studio control prints THE attention count and names it.
        #expect(header.contains("StudioControlLabel.waitingValue(count: attentionCount)"))
        // And it does not recompute either from a fetch of its own.
        #expect(header.contains("BadgeCountService") == false)
    }

    /// (b): with five items awaiting and a three-row cap, the card must not
    /// silently show three under a header that says five.
    @Test("a capped NEEDS YOU section says there are more")
    func aCappedSectionSaysThereAreMore() throws {
        let rows = try fixtures()
        let extraDecisions = try decode([RemoteClientDecision].self, """
        [
          { "id": "d3", "title": "Sconce height", "status": "pending",
            "due_date": "2026-09-03", "created_at": "2026-08-15T12:00:00Z" },
          { "id": "d4", "title": "Paint sheen", "status": "pending",
            "due_date": "2026-09-04", "created_at": "2026-08-16T12:00:00Z" }
        ]
        """)
        let badges = BadgeCountService.makeForTests()
        badges.apply(
            decisions: rows.decisions + extraDecisions, summaries: rows.summaries,
            proposals: rows.proposals, invoices: rows.invoices,
            projects: rows.projects, roster: []
        )
        #expect(badges.attentionCount == 6)

        let record = HouseRecordBuilder.build(
            from: badges, saved: [], products: [], story: nil,
            liveLead: nil, lastSeen: nil,
            now: try #require(ISO8601DateFormatter().date(from: "2026-09-05T16:00:00Z"))
        )
        #expect(record.needsYou.count <= HouseRecordBuilder.maxRowsPerEyebrow)
        #expect(
            record.hasMoreNeedsYou,
            "the card draws three rows under a count of six and says nothing"
        )
    }

    /// And with nothing hidden it must not offer a door to more.
    @Test("an uncapped NEEDS YOU section offers no see-all")
    func anUncappedSectionOffersNoSeeAll() throws {
        let rows = try fixtures()
        let badges = BadgeCountService.makeForTests()
        badges.apply(
            decisions: [], summaries: rows.summaries,
            proposals: [], invoices: rows.invoices,
            projects: rows.projects, roster: []
        )
        let record = HouseRecordBuilder.build(
            from: badges, saved: [], products: [], story: nil,
            liveLead: nil, lastSeen: nil,
            now: try #require(ISO8601DateFormatter().date(from: "2026-09-05T16:00:00Z"))
        )
        #expect(record.hasMoreNeedsYou == false)
    }

    /// The other half of M4: `listPending` returns rows the Studio treats as
    /// answered, so the header could outrun the rows by one.
    @Test("a pending row that has been responded to counts for neither surface")
    func aRespondedDecisionCountsNowhere() throws {
        let responded = try decode([RemoteClientDecision].self, """
        [{ "id": "d9", "title": "Rug color", "status": "pending",
           "responded_at": "2026-08-20T12:00:00Z",
           "created_at": "2026-08-12T12:00:00Z" }]
        """)
        #expect(responded[0].isResolved)

        let badges = BadgeCountService.makeForTests()
        badges.apply(
            decisions: responded, summaries: [], proposals: [], invoices: [],
            projects: [], roster: []
        )
        #expect(badges.pendingDecisionCount == 0)
        #expect(badges.attentionHint == nil)
    }

    @Test("the fetched rows are retained for the Record")
    func refreshRetainsTheFetchedRows() throws {
        let rows = try fixtures()
        let badges = BadgeCountService.makeForTests()
        badges.apply(
            decisions: rows.decisions, summaries: rows.summaries,
            proposals: rows.proposals, invoices: rows.invoices,
            projects: rows.projects,
            roster: [RosterDesigner(designerId: UUID(), addedAt: Date())]
        )

        #expect(badges.pendingDecisions.count == 2)
        #expect(badges.pendingProposals.count == 1)
        #expect(badges.payableInvoices.count == 1)
        #expect(badges.threadSummaries.count == 1)
        #expect(badges.projects.count == 1)
        #expect(badges.roster.count == 1)
        // The retained rows are the ones the counts were computed from.
        #expect(badges.pendingDecisions.count == badges.pendingDecisionCount)
        #expect(badges.pendingProposals.count == badges.proposalsAwaitingSignatureCount)
        #expect(badges.payableInvoices.count == badges.payableInvoiceCount)
        #expect(badges.projects.count == badges.projectCount)
    }
}

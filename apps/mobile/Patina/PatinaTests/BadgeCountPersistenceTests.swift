//
//  BadgeCountPersistenceTests.swift
//  PatinaTests
//
//  R-02 — L1-B's finding, in L1-F's file, arriving as `l1-f-notes.md` Task
//  F-L1B-3.
//
//  In-process, `apply(…)` already preserves a failed source: a nil argument
//  leaves the previous value standing. The gap is the COLD LAUNCH. Nothing was
//  held across the process boundary, so a first refresh that failed published
//  zeros. The walk measured it — same account, one relaunch apart, backend
//  unreachable: bell badge 3 → no badge, Studio pill "Studio 5" → "Studio",
//  one record row gone, and the app never said a word.
//
//  The rule the shape carries: restored numbers are a FLOOR TO DRAW, never a
//  claim that a fetch answered. `hasLoaded` and `projectsLoaded` stay false.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct BadgeCountPersistenceTests {

    private func defaults() -> UserDefaults {
        let suite = "patina.tests.badges.\(UUID().uuidString)"
        // A fresh suite per test: these are process-global and six lanes run
        // this tier on one machine.
        return UserDefaults(suiteName: suite) ?? .standard
    }

    /// The in-repo fixture pattern (`AttentionCountTests`): decode the wire
    /// shape rather than construct it, so a schema change breaks here too.
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private func decisions() throws -> [RemoteClientDecision] {
        try decode([RemoteClientDecision].self, """
        [
          { "id": "d1", "title": "Rug color", "status": "pending",
            "created_at": "2026-08-12T12:00:00Z" },
          { "id": "d2", "title": "Sconce finish", "status": "pending",
            "created_at": "2026-08-14T12:00:00Z" },
          { "id": "d3", "title": "Oak stain", "status": "pending",
            "created_at": "2026-08-15T12:00:00Z" }
        ]
        """)
    }

    private func projects() throws -> [RemoteProject] {
        try decode([RemoteProject].self, """
        [
          { "id": "11111111-1111-1111-1111-111111111111", "name": "Oak Street",
            "status": "active", "updated_at": "2026-08-20T12:00:00Z" },
          { "id": "22222222-2222-2222-2222-222222222222", "name": "Aspen Loft",
            "status": "active", "updated_at": "2026-08-20T12:00:00Z" }
        ]
        """)
    }

    private func loaded(_ service: BadgeCountService) throws {
        service.apply(
            decisions: try decisions(), summaries: nil, proposals: nil,
            invoices: nil, projects: try projects(), roster: nil
        )
        service.persistCountsForTesting()
    }

    // MARK: - The round trip

    @Test("a refresh that answered leaves a floor the next launch can draw")
    func theCountsSurviveAColdLaunch() throws {
        let store = defaults()
        let first = BadgeCountService.makeForTests(defaults: store)
        try loaded(first)

        let next = BadgeCountService.makeForTests(defaults: store)

        #expect(next.pendingDecisionCount == 3)
        #expect(next.projectCount == 2)
    }

    /// R-02's other half, walked. The counts alone restore the NUMBERS and lose
    /// the SEAT: `DesignerSeat.make` reads `projects`, not `projectCount`, so
    /// the walk's first offline cold launch kept the record rows and drew a
    /// house with no designer in it (shots 36/37). The rows are the floor too.
    @Test("the project rows survive a cold launch, not just their count")
    func theProjectRowsSurviveAColdLaunch() throws {
        let store = defaults()
        try loaded(BadgeCountService.makeForTests(defaults: store))

        let next = BadgeCountService.makeForTests(defaults: store)

        #expect(next.projects.count == 2)
        #expect(next.projects.map(\.name) == ["Oak Street", "Aspen Loft"])
        // …and they are still only a floor.
        #expect(next.projectsLoaded == false)
    }

    /// A payload written before the rows joined the blob still decodes. If it
    /// threw, the whole floor — every count — would go with it.
    @Test("a pre-rows payload still restores its counts")
    func anOlderPayloadStillDecodes() throws {
        let store = defaults()
        let json = """
        {"pendingDecisionCount":3,"unreadMessageCount":1,
         "proposalsAwaitingSignatureCount":0,"payableInvoiceCount":2,
         "projectCount":2,"storedAt":"2026-09-03T12:00:00Z"}
        """
        store.set(Data(json.utf8), forKey: "patina.badge_counts.last_successful.v1")

        let next = BadgeCountService.makeForTests(defaults: store)

        #expect(next.pendingDecisionCount == 3)
        #expect(next.payableInvoiceCount == 2)
        #expect(next.projects.isEmpty)
    }

    /// The whole point of the finding: a restored number is not an answer.
    @Test("restored counts do not claim a fetch answered")
    func theFloorIsNotALoadedClaim() throws {
        let store = defaults()
        try loaded(BadgeCountService.makeForTests(defaults: store))

        let next = BadgeCountService.makeForTests(defaults: store)

        #expect(next.hasLoaded == false)
        #expect(next.projectsLoaded == false)
        #expect(next.lastRefreshFailed == false)
    }

    /// The bell is not restored. Its count is the feed's own rows, read state
    /// and all; a number carried across a process boundary would badge updates
    /// this process has never fetched — `C2-07` in the other direction.
    @Test("the bell's count is not part of the floor")
    func theBellIsNotRestored() throws {
        let store = defaults()
        let first = BadgeCountService.makeForTests(defaults: store)
        first.applyNotificationRows([
            AppNotification(
                remoteId: "n1",
                type: .decision,
                title: "A decision needs you",
                body: "Shaker oak or rift white.",
                timestamp: Date(timeIntervalSince1970: 1_787_000_000),
                isRead: false,
                entityType: "decision",
                entityId: "d9"
            )
        ])
        try loaded(first)
        #expect(first.unreadNotificationCount == 1)

        let next = BadgeCountService.makeForTests(defaults: store)

        #expect(next.unreadNotificationCount == 0)
    }

    // MARK: - The account boundary

    @Test("a session change takes the floor with it")
    func theFloorIsTheAccountsOwn() throws {
        let store = defaults()
        let first = BadgeCountService.makeForTests(defaults: store)
        try loaded(first)

        first.resetForSessionChange()
        let next = BadgeCountService.makeForTests(defaults: store)

        #expect(next.pendingDecisionCount == 0)
        #expect(next.projectCount == 0)
    }

    @Test("nothing on disk is not a crash, it is zero")
    func anEmptyStoreRestoresNothing() {
        let service = BadgeCountService.makeForTests(defaults: defaults())
        #expect(service.pendingDecisionCount == 0)
        #expect(service.hasLoaded == false)
    }

    // MARK: - Where the write lives

    /// The write is on the `hasLoaded = true` branch only. A run where every
    /// fetch failed must not overwrite the last numbers that were true with
    /// the zeros it did not learn.
    @Test("only a refresh that answered writes the floor")
    func theWriteIsOnTheAnsweredBranchOnly() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Services/Badges/BadgeCountService.swift")
        )
        let answered = try #require(code.range(of: "hasLoaded = true"))
        let failed = try #require(code.range(of: "lastRefreshFailed = true"))
        let persist = try #require(code.range(of: "persistCounts()\n"))
        #expect(persist.lowerBound > answered.lowerBound)
        #expect(persist.lowerBound < failed.lowerBound)
    }
}

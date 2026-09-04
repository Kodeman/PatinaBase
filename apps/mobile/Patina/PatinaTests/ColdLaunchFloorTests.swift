//
//  ColdLaunchFloorTests.swift
//  PatinaTests
//
//  `R-02` — the half the first fix round left open, and the walk re-measured:
//  "the rows survive an offline cold launch (shots 26, 30), but the designer
//  seat is STILL dropped: 'Leah Hartwell · Aspen Loft Refresh · Message' is
//  present online (02, 45) and absent on every offline frame (26, 27, 30)".
//
//  The mechanism is one line in the auth seam. `settledUserId` started `nil`
//  every launch, so GoTrue restoring a session read as `nil → A` — an account
//  CHANGE — and `SessionScope.reset()` ran. That calls
//  `BadgeCountService.resetForSessionChange()`, which clears the retained rows
//  AND deletes `patina.badge_counts.last_successful.v1`: the floor R-02 put
//  there in the first place. Online the refetch that followed hid it. Offline
//  it was the whole defect — floor deleted, every fetch failed, `projects`
//  stayed `[]`, and `DesignerSeat.make` had nothing to name.
//
//  Two things are pinned: the seam no longer calls a cold launch a change, and
//  the floor now carries everything `DesignerSeat.make` reads — including the
//  three collections that resolve WHICH project the seat names.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct ColdLaunchFloorTests {

    // MARK: - The seam

    /// `localStoreOwnerKey` is already the device's record of whose data is on
    /// this phone. Seeding `settledUserId` from it is what makes a cold launch
    /// of the SAME account a non-event.
    @Test("the seed reads the account this device last settled on")
    func theSeedReadsTheDeviceOwner() {
        let suite = UserDefaults(suiteName: "patina.tests.coldfloor.\(UUID().uuidString)")!
        #expect(AuthService.settledAccountOnDisk(suite) == nil)

        suite.set("AAAA-1111", forKey: LocalStoreOwnership.ownerKey)
        #expect(AuthService.settledAccountOnDisk(suite) == "AAAA-1111")
    }

    /// The behaviour the finding is about, as the two calls the listener makes.
    @Test("a cold launch of the same account is not an account change")
    func aColdLaunchOfTheSameAccountIsNotAChange() {
        let suite = UserDefaults(suiteName: "patina.tests.coldfloor.\(UUID().uuidString)")!
        suite.set("AAAA-1111", forKey: LocalStoreOwnership.ownerKey)
        let seeded = AuthService.settledAccountOnDisk(suite)

        // The restore GoTrue performs on every launch.
        #expect(!AuthService.isAccountChange(previous: seeded, incoming: "AAAA-1111"))
        // A different account still is one, and still resets.
        #expect(AuthService.isAccountChange(previous: seeded, incoming: "BBBB-2222"))
        // A fresh install has no owner: `nil → A` still resets, over nothing.
        #expect(AuthService.isAccountChange(previous: nil, incoming: "AAAA-1111"))
    }

    /// The seed is installed at `init`, not read at the comparison — the
    /// comparison is against the in-memory value, which a sign-out clears.
    @Test("the seed is installed in init, from the owner key")
    func theSeedIsInstalledInInit() throws {
        let source = try SourcePin.read("Patina/Services/Auth/AuthService.swift")
        let code = SourceScan.code(in: source)
        #expect(code.contains("settledUserId = Self.settledAccountOnDisk()"))
        let seed = try #require(code.range(of: "settledUserId = Self.settledAccountOnDisk()"))
        let listener = try #require(code.range(of: "startAuthStateListener()"))
        #expect(seed.lowerBound < listener.lowerBound,
                "the seed must be in place before the first auth-state event lands")
    }

    /// Suppressing the reset must not suppress the FETCH the same branch used
    /// to trigger. `SessionScope.refresh()` keeps firing once per process.
    @Test("the session fan-out still runs on a cold launch")
    func theFanOutStillRunsOnAColdLaunch() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Services/Auth/AuthService.swift")
        )
        #expect(code.contains("accountChanged || !hasFannedSessionRefresh"),
                "SessionScope.refresh() is gated on accountChanged alone again")
    }

    // MARK: - The floor the seat reads

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private func projects() throws -> [RemoteProject] {
        try decode([RemoteProject].self, """
        [
          { "id": "11111111-1111-1111-1111-111111111111", "name": "Birch Hollow",
            "status": "active", "updated_at": "2026-09-03T12:00:00Z",
            "designer": { "id": "d-1", "display_name": "Leah Hartwell",
                          "business_name": "Middle Studio" } },
          { "id": "22222222-2222-2222-2222-222222222222", "name": "Aspen Loft Refresh",
            "status": "active", "updated_at": "2026-09-01T12:00:00Z",
            "designer": { "id": "d-1", "display_name": "Leah Hartwell",
                          "business_name": "Middle Studio" } }
        ]
        """)
    }

    private func decisions() throws -> [RemoteClientDecision] {
        try decode([RemoteClientDecision].self, """
        [
          { "id": "dec-1", "title": "Dining chairs", "status": "pending",
            "project_id": "22222222-2222-2222-2222-222222222222",
            "created_at": "2026-09-01T12:00:00Z" }
        ]
        """)
    }

    /// The Record the offline launch paints: its most urgent row is the
    /// decision that belongs to Aspen Loft, not to the newest project.
    private func record() -> HouseRecord {
        HouseRecord(
            needsYou: [
                HouseRecordRow(
                    id: "dec-1",
                    kind: .decisionAsked,
                    title: "Leah asked about Dining chairs.",
                    detail: nil,
                    date: Date(timeIntervalSince1970: 1_756_900_000),
                    state: .none,
                    isNew: false,
                    route: .decisionDetail(decisionId: "dec-1")
                )
            ],
            moved: [],
            window: DateInterval(start: Date(timeIntervalSince1970: 1_756_300_000), duration: 604_800),
            lastSeenAt: nil,
            hasMoreNeedsYou: false,
            hasMoreMoved: false
        )
    }

    private func floor(_ store: UserDefaults) throws {
        let service = BadgeCountService.makeForTests(defaults: store)
        service.apply(
            decisions: try decisions(), summaries: nil, proposals: nil,
            invoices: nil, projects: try projects(), roster: nil
        )
        service.persistCountsForTesting()
    }

    @Test("the seat’s own project survives a cold launch, not just the projects")
    func theSeatResolvesItsProjectOffline() throws {
        let store = UserDefaults(suiteName: "patina.tests.coldfloor.\(UUID().uuidString)")!
        try floor(store)

        // The next process: nothing has answered, only the floor is in hand.
        let next = BadgeCountService.makeForTests(defaults: store)
        #expect(next.hasLoaded == false, "the floor must not claim a fetch answered")

        let seat = try #require(
            DesignerSeat.make(
                liveLead: nil,
                projects: next.projects,
                record: record(),
                decisions: next.pendingDecisions,
                proposals: next.pendingProposals,
                invoices: next.payableInvoices
            ),
            "the designer seat is still dropped on a cold offline launch (R-02)"
        )
        #expect(seat.name == "Leah Hartwell")
        // Not "Birch Hollow": the seat follows the Record's urgent row, and
        // that resolution needs the retained decision rows to have survived
        // too — with them gone it fell through to `active.first`.
        #expect(seat.meta?.contains("Aspen Loft Refresh") == true,
                "the offline seat names a different project from the online one")
        #expect(seat.projectId == "22222222-2222-2222-2222-222222222222")
    }

    /// Same forward-compatibility contract the `projects` field already has: a
    /// payload written before these three joined the blob must still restore
    /// its counts rather than throwing the whole floor away.
    @Test("a payload written before the retained rows joined still decodes")
    func anOlderPayloadStillDecodes() {
        let store = UserDefaults(suiteName: "patina.tests.coldfloor.\(UUID().uuidString)")!
        let json = """
        {"pendingDecisionCount":3,"unreadMessageCount":1,
         "proposalsAwaitingSignatureCount":0,"payableInvoiceCount":2,
         "projectCount":2,"storedAt":"2026-09-03T12:00:00Z"}
        """
        store.set(Data(json.utf8), forKey: "patina.badge_counts.last_successful.v1")

        let next = BadgeCountService.makeForTests(defaults: store)

        #expect(next.pendingDecisionCount == 3)
        #expect(next.pendingDecisions.isEmpty)
        #expect(next.pendingProposals.isEmpty)
        #expect(next.payableInvoices.isEmpty)
    }
}

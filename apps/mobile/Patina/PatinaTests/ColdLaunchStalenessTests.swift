//
//  ColdLaunchStalenessTests.swift
//  PatinaTests
//
//  `L07-05`, re-opened by walk B's re-walk 2 as `W1-B-16`. `R-02` gave the cold
//  launch a floor so an offline start degrades instead of deleting; the Studio
//  header prints `BadgeCountService.studioHint`, which on that path IS the
//  floor's number. The floor carried the counts and not the timestamp, so an
//  offline COLD launch printed "5 things need your eye" as current above "We
//  couldn't gather your Studio…" with no staleness line anywhere in the tree
//  (re-walk 2 shot 33), while the WARM shape printed "Last updated 1 minute
//  ago." (35) because it had an in-process `lastSuccessAt` to name.
//
//  `PersistedCounts.storedAt` was always written; `restorePersistedCounts()`
//  dropped it on the floor. These pins are that timestamp surviving, and the
//  Studio reading it.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct ColdLaunchStalenessTests {

    private func makeSuite() -> UserDefaults {
        UserDefaults(suiteName: "patina.tests.coldstaleness.\(UUID().uuidString)")!
    }

    // MARK: - The floor carries its own timestamp

    @Test("a restored floor knows when it was written")
    func aRestoredFloorKnowsWhenItWasWritten() {
        let suite = makeSuite()

        let writer = BadgeCountService.makeForTests(defaults: suite)
        writer.apply(
            decisions: [], summaries: [], proposals: [], invoices: [],
            projects: [], roster: []
        )
        writer.persistCountsForTesting()
        #expect(writer.floorStoredAt != nil, "the writer did not stamp the floor it just wrote")

        // A second instance is the cold launch: it has run no fetch.
        let coldLaunch = BadgeCountService.makeForTests(defaults: suite)
        #expect(coldLaunch.hasLoaded == false)
        #expect(coldLaunch.floorStoredAt != nil, "the restored floor has no timestamp (W1-B-16)")
    }

    @Test("a device with no floor has no timestamp to offer")
    func aFreshInstallHasNoFloorTimestamp() {
        #expect(BadgeCountService.makeForTests(defaults: makeSuite()).floorStoredAt == nil)
    }

    @Test("dropping the previous account's floor drops its timestamp with it")
    func anAccountChangeDropsTheFloorTimestamp() {
        let suite = makeSuite()
        let service = BadgeCountService.makeForTests(defaults: suite)
        service.apply(
            decisions: [], summaries: [], proposals: [], invoices: [],
            projects: [], roster: []
        )
        service.persistCountsForTesting()
        #expect(service.floorStoredAt != nil)

        service.resetForSessionChange()
        #expect(
            service.floorStoredAt == nil,
            "account B's first launch can date account A's numbers"
        )
    }

    // MARK: - The Studio reads it on the cold path

    private func totalFailure() -> StudioLoadResult {
        StudioLoadResult(
            projects: nil, decisions: nil, approvals: nil, proposals: nil, invoices: nil,
            documents: nil, threads: nil, notifications: nil
        )
    }

    /// The exact shape re-walk 2 shot: nothing held (this process has fetched
    /// nothing), every source failed, and a floor on disk that the header is
    /// printing.
    @Test("an offline cold launch dates the count it is showing")
    func aColdLaunchFailureNamesWhenTheCountWasTrue() throws {
        let hub = StudioHubViewModel()
        let floorWrittenAt = Date(timeIntervalSinceNow: -3600)
        hub.restoredFloorAt = { floorWrittenAt }

        hub.apply(totalFailure())

        #expect(hub.failedSources.count == 7)
        let line = try #require(
            hub.stalenessLine,
            "the cold shape prints a retained count with no staleness line (W1-B-16)"
        )
        #expect(line.localizedCaseInsensitiveContains("last updated"))
        #expect(line.hasSuffix("."))
    }

    /// And with no floor and nothing held there is genuinely nothing to be
    /// stale about — that is the error state, which the hub already draws.
    @Test("a first-ever launch that fails offers no staleness line")
    func aFirstEverColdLaunchHasNothingToBeStaleAbout() {
        let hub = StudioHubViewModel()
        hub.restoredFloorAt = { nil }
        hub.apply(totalFailure())
        #expect(hub.stalenessLine == nil)
    }

    /// …and a floor that draws NOTHING is the same case, not the case above.
    ///
    /// A floor is written for an account with nothing in it too — five zeros —
    /// so `floorStoredAt != nil` alone put "Last updated 2 minutes ago." over
    /// an empty Studio that printed no line at all before `W1-B-16`. The
    /// staleness line dates what the screen is showing.
    @Test("an empty floor does not date an empty Studio")
    func anEmptyFloorDatesNothing() {
        let writer = BadgeCountService.makeForTests(defaults: makeSuite())
        writer.apply(
            decisions: [], summaries: [], proposals: [], invoices: [],
            projects: [], roster: []
        )
        writer.persistCountsForTesting()
        #expect(writer.floorStoredAt != nil, "a floor was still written")
        #expect(writer.drawsAnyCount == false, "an all-zero floor draws nothing")

        let hub = StudioHubViewModel()
        hub.restoredFloorAt = {
            writer.drawsAnyCount ? writer.floorStoredAt : nil
        }
        hub.apply(totalFailure())
        #expect(hub.stalenessLine == nil,
                "an empty Studio dated itself after a failure")
    }

    /// The floor W1-B-16 was filed about — one that has something on it — is
    /// the one that carries the line.
    @Test("a floor with a count on it is the one that can be stale")
    func aFloorWithCountsDrawsSomething() throws {
        let writer = BadgeCountService.makeForTests(defaults: makeSuite())
        writer.apply(
            decisions: nil, summaries: nil, proposals: nil, invoices: nil,
            projects: [try project()], roster: nil
        )
        writer.persistCountsForTesting()
        #expect(writer.drawsAnyCount)
        #expect(writer.floorStoredAt != nil)
    }

    private func project() throws -> RemoteProject {
        let row: [String: Any] = [
            "id": "c0000000-0000-0000-0000-000000000001",
            "name": "Hartwell Residence"
        ]
        return try JSONDecoder().decode(
            RemoteProject.self,
            from: try JSONSerialization.data(withJSONObject: row)
        )
    }

    /// The in-process success still wins: a warm hub names when IT last
    /// answered, not when the floor was written.
    @Test("the warm shape still names its own last success")
    func theWarmShapeStillNamesItsOwnSuccess() throws {
        let hub = StudioHubViewModel()
        hub.restoredFloorAt = { Date(timeIntervalSince1970: 0) }

        let success = Date(timeIntervalSinceNow: -120)
        hub.apply(
            StudioLoadResult(
                projects: [], decisions: [], approvals: [], proposals: [], invoices: [],
                documents: [], threads: [], notifications: []
            ),
            now: success
        )
        #expect(hub.lastSuccessAt == success)
        hub.apply(totalFailure())

        let line = try #require(hub.stalenessLine)
        // 1970 would render as "55 years ago"; two minutes is what it must say.
        #expect(!line.contains("years"))
    }

    /// The source half: the two halves of the fix are wired to each other, so
    /// a future refactor cannot quietly restore the counts without the stamp.
    @Test("the floor's timestamp is restored beside the counts, and read by the hub")
    func theTwoHalvesAreWiredTogether() throws {
        let service = SourceScan.code(
            in: try SourcePin.read("Patina/Services/Badges/BadgeCountService.swift")
        )
        #expect(service.contains("floorStoredAt = stored.storedAt"),
                "the restore drops the floor's timestamp again (W1-B-16)")

        let hub = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Profile/ViewModels/StudioHubViewModel.swift")
        )
        #expect(hub.contains("lastSuccessAt ?? restoredFloorAt()"))
        #expect(hub.contains("BadgeCountService.shared"),
                "the hub's seam no longer reads the real floor in production")
        #expect(hub.contains("badges.drawsAnyCount ? badges.floorStoredAt : nil"),
                "the production seam dates a floor that draws nothing")
    }
}

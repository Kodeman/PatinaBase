//
//  SharedDirectionFilesTests.swift
//  PatinaTests
//
//  W1A-10 · CONTRACT-C §C.3.3 (admission under the ceiling), §C.5.3 (the
//  `202 materializing` continuation) and §C.7 (freshness). The ceiling is
//  scaled from mebibytes to bytes so a 200 MiB plan set is four 50-byte
//  sheets; the arithmetic the contract states is the same at either scale.
//

import Foundation
import SwiftData
import Testing
@testable import Patina

@MainActor
struct SharedDirectionFilesTests {

    /// 500 MiB / 50 MiB / 200 MiB / 60 sheets, one byte to the mebibyte.
    private static let scaled = SharedDirectionLimits(
        ceilingBytes: 500, maxFileBytes: 50, maxPlanSetBytes: 200, maxPlanSheets: 60
    )
    private static let twoHundred = [50, 50, 50, 50]

    private func id(_ index: Int) -> String { DirectionFixture.decisionId(index) }

    private func availability(_ harness: DirectionHarness, _ index: Int) -> SharedDirectionAvailability? {
        harness.store.cachedEdition(decisionId: id(index))?.availability
    }

    private func discover(_ harness: DirectionHarness, _ indices: [Int]) async {
        await harness.refreshAndSettle(indices.compactMap { harness.discovered(id($0)) })
    }

    // MARK: - §C.3.3 admission

    @Test("(a) three protected 200 MiB sets: two commit, the third waits for space, then commits")
    func threeProtectedSets() async throws {
        let harness = try DirectionHarness(limits: Self.scaled)
        defer { harness.cleanUp() }
        for index in 1...3 { harness.client.editions[id(index)] = FakeEdition(sheetSizes: Self.twoHundred) }

        await discover(harness, [1, 2])
        await discover(harness, [3])
        #expect(availability(harness, 1) == .complete)
        #expect(availability(harness, 2) == .complete)
        #expect(availability(harness, 3) == .noSpace)
        #expect(harness.filesOnDisk(id(3)).isEmpty)

        var responded = FakeEdition.responded()
        responded.sheetSizes = Self.twoHundred
        harness.client.editions[id(1)] = responded
        await harness.refreshAndSettle()

        #expect(availability(harness, 1) == SharedDirectionAvailability.none, "the responded set gave way")
        #expect(harness.store.cachedEdition(decisionId: id(1)) != nil, "records are never evicted")
        #expect(harness.filesOnDisk(id(1)).isEmpty)
        #expect(availability(harness, 2) == .complete)
        #expect(availability(harness, 3) == .complete)
        #expect(harness.filesOnDisk(id(3)).count == 4)
    }

    @Test("(b) an awaiting observer row is evicted ahead of a responded answering row")
    func observerGivesWayFirst() async throws {
        let harness = try DirectionHarness(limits: Self.scaled)
        defer { harness.cleanUp() }
        harness.client.editions[id(1)] = FakeEdition(viewerRole: "studio", sheetSizes: Self.twoHundred)
        var responded = FakeEdition.responded()
        responded.sheetSizes = Self.twoHundred
        harness.client.editions[id(2)] = responded
        harness.client.editions[id(3)] = FakeEdition(sheetSizes: Self.twoHundred)

        await discover(harness, [1, 2])
        await discover(harness, [3])

        #expect(availability(harness, 1) == SharedDirectionAvailability.none)
        #expect(availability(harness, 2) == .complete)
        #expect(availability(harness, 3) == .complete)
    }

    @Test("(c) no plan: nothing is evicted and the incoming set is noSpace")
    func noPlanEvictsNothing() async throws {
        let harness = try DirectionHarness(limits: Self.scaled)
        defer { harness.cleanUp() }
        harness.client.editions[id(1)] = FakeEdition(sheetSizes: Self.twoHundred)
        harness.client.editions[id(2)] = FakeEdition(sheetSizes: Self.twoHundred)
        var small = FakeEdition.responded()
        small.sheetSizes = [50]
        harness.client.editions[id(3)] = small
        harness.client.editions[id(4)] = FakeEdition(sheetSizes: Self.twoHundred)

        await discover(harness, [1, 2, 3])
        let before = harness.everyFile()
        #expect(before.count == 9)

        await discover(harness, [4])
        #expect(availability(harness, 4) == .noSpace)
        #expect(availability(harness, 3) == .complete, "the 50 MiB eligible set is kept")
        #expect(harness.everyFile() == before, "zero files deleted")
    }

    @Test("(d) a lead's incomplete draft is protected; the older responded set gives way")
    func draftAwaitingConfirmationIsProtected() async throws {
        let harness = try DirectionHarness(limits: Self.scaled)
        defer { harness.cleanUp() }
        harness.client.editions[id(1)] = FakeEdition(
            lifecycleStatus: "draft", completed: 0, required: 1, authorityRevision: 3,
            sentAt: NSNull(), sheetSizes: Self.twoHundred
        )
        var responded = FakeEdition.responded(at: "2026-08-01T09:00:00+00:00")
        responded.sheetSizes = Self.twoHundred
        harness.client.editions[id(2)] = responded
        harness.client.editions[id(3)] = FakeEdition(sheetSizes: Self.twoHundred)

        await discover(harness, [1, 2])
        let draft = try #require(harness.store.cachedEdition(decisionId: id(1))?.review)
        #expect(draft.needsReviewConfirmation && draft.viewerAnswers)
        await discover(harness, [3])

        #expect(availability(harness, 1) == .complete)
        #expect(availability(harness, 2) == SharedDirectionAvailability.none)
        #expect(availability(harness, 3) == .complete)
    }

    // MARK: - §C.5.3 the continuation loop

    private static let materializing = (
        status: 202, body: DirectionFixture.json(["status": "materializing", "retryAfterSeconds": 1])
    )

    @Test("three 202s then a 200: the files commit after exactly four requests")
    func continuationEndsInADownload() async throws {
        let harness = try DirectionHarness()
        defer { harness.cleanUp() }
        let edition = id(1)
        harness.client.editions[edition] = FakeEdition(sheetSizes: [64])
        harness.client.attachmentScript[edition] = Array(repeating: Self.materializing, count: 3)

        await discover(harness, [1])

        #expect(harness.client.attachmentCalls.count == 4)
        #expect(harness.waits == Array(repeating: .seconds(1), count: 3))
        #expect(availability(harness, 1) == .complete)
    }

    @Test("seven 202s: six requests, then record-only, nothing purged")
    func continuationStopsAtTheCap() async throws {
        let harness = try DirectionHarness()
        defer { harness.cleanUp() }
        let edition = id(1)
        harness.client.editions[edition] = FakeEdition(sheetSizes: [64])
        harness.client.attachmentScript[edition] = Array(repeating: Self.materializing, count: 7)

        await discover(harness, [1])

        #expect(harness.client.attachmentCalls.count == SharedDirectionStore.continuationCap)
        #expect(availability(harness, 1) == SharedDirectionAvailability.none)
        #expect(harness.telemetry.isEmpty)
    }

    @Test("a purge during the wait stops the loop: no further request")
    func purgeStopsTheLoop() async throws {
        let harness = try DirectionHarness()
        defer { harness.cleanUp() }
        let edition = id(1)
        harness.client.editions[edition] = FakeEdition(sheetSizes: [64])
        harness.client.attachmentScript[edition] = Array(repeating: Self.materializing, count: 7)
        harness.holdWaits = true

        await harness.store.refresh(discovered: [try #require(harness.discovered(edition))])
        #expect(await eventually { harness.heldWaitCount == 1 })
        let loop = harness.store.pendingFileFetch(edition)

        harness.client.editions[edition]?.status = "revoked"
        await harness.store.refresh(discovered: [])
        harness.releaseWaits()
        await loop?.value

        #expect(harness.client.attachmentCalls.count == 1)
        #expect(harness.store.cachedEdition(decisionId: edition) == nil)
    }

    @Test("retryAfterSeconds is clamped to 1…30, and absent means 5")
    func retryAfterIsClamped() async throws {
        let harness = try DirectionHarness()
        defer { harness.cleanUp() }
        let edition = id(1)
        harness.client.editions[edition] = FakeEdition(sheetSizes: [64])
        harness.client.attachmentScript[edition] = [
            (202, DirectionFixture.json(["status": "materializing"])),
            (202, DirectionFixture.json(["status": "materializing", "retryAfterSeconds": 90])),
            (202, DirectionFixture.json(["status": "materializing", "retryAfterSeconds": 0]))
        ]
        await discover(harness, [1])
        #expect(harness.waits == [.seconds(5), .seconds(30), .seconds(1)])
    }

    // MARK: - §C.7 freshness

    @Test("out of order: the 12:05 anchor holds, E reads five minutes, F zero, nothing moves back")
    func anchorIsMonotonic() throws {
        let start = ContinuousClock.now
        let early = DirectionFixture.date("2026-09-24T12:00:00+00:00")
        let late = DirectionFixture.date("2026-09-24T12:05:00+00:00")
        var anchor = SharedDirectionAnchor()
        anchor.observe(servedAt: late, at: start)
        anchor.observe(servedAt: early, at: start)

        #expect(anchor.estimatedServerNow(at: start) == late)
        #expect(SharedDirectionFreshness.label(servedAt: early, anchor: anchor, now: start) == "Updated 5 min ago")
        #expect(SharedDirectionFreshness.label(servedAt: late, anchor: anchor, now: start) == "Updated just now")
        let later = start.advanced(by: .seconds(60))
        #expect(SharedDirectionFreshness.label(servedAt: early, anchor: anchor, now: later) == "Updated 6 min ago")
        #expect(SharedDirectionFreshness.label(servedAt: late, anchor: anchor, now: later) == "Updated 1 min ago")
    }

    @Test("no anchor yet: the label is the absolute server time in the device's zone")
    func noAnchorIsAbsolute() throws {
        let utc = try #require(TimeZone(identifier: "UTC"))
        let label = SharedDirectionFreshness.label(
            servedAt: DirectionFixture.date("2026-09-24T15:12:00+00:00"),
            anchor: SharedDirectionAnchor(), now: .now, timeZone: utc
        )
        #expect(label == "Updated 24 Sep, 3:12 PM")
    }
}

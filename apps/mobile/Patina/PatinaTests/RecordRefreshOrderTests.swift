//
//  RecordRefreshOrderTests.swift
//  PatinaTests
//
//  r1-notes §3: `markSeen()` must be called AFTER the record for that open has
//  been built. Stamping first makes every row's `isNew` false on the one open
//  that should have shown the ticks — a silent failure no screenshot catches.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct RecordRefreshOrderTests {

    private func temporaryDirectory() -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("record-refresh-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private func stores() -> (RecordSnapshotStore, LastSeenStore, RecordOwnerStamp) {
        let suiteName = "record-refresh-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        return (
            RecordSnapshotStore(
                appGroupIdentifier: "group.test.invalid",
                fallbackDirectory: temporaryDirectory()
            ),
            LastSeenStore(defaults: defaults),
            RecordOwnerStamp(defaults: defaults)
        )
    }

    private func record(lastSeenAt: Date?, moved: [HouseRecordRow] = []) -> HouseRecord {
        HouseRecord(
            needsYou: [], moved: moved,
            window: DateInterval(start: Date(timeIntervalSince1970: 1_755_000_000),
                                 duration: 7 * 24 * 60 * 60),
            lastSeenAt: lastSeenAt, hasMoreNeedsYou: false, hasMoreMoved: false
        )
    }

    private func row(id: String) -> HouseRecordRow {
        HouseRecordRow(
            id: id, kind: .story, title: "A new story from the workshop.",
            detail: nil, date: Date(timeIntervalSince1970: 1_756_000_000),
            state: .none, isNew: true, route: nil
        )
    }

    @Test("the snapshot paints before the record is built, and the stamp lands last")
    func theOrderIsSnapshotBuildSaveStamp() {
        let (snapshots, lastSeen, owner) = stores()
        let visit = Date(timeIntervalSince1970: 1_755_500_000)
        lastSeen.markSeen(now: visit)
        snapshots.save(record(lastSeenAt: visit, moved: [row(id: "snapshot")]))
        owner.stamp("client-a")

        var painted: [String] = []
        var visitAtBuildTime: Date?

        let outcome = RecordRefresh.run(
            snapshots: snapshots, lastSeen: lastSeen, owner: owner,
            sessionUserId: "client-a",
            now: Date(timeIntervalSince1970: 1_756_100_000),
            build: { previous, lastSeenAt in
                // The build reads the visit that is still on disk…
                visitAtBuildTime = lastSeen.lastSeenAt
                #expect(lastSeenAt == visit)
                #expect(previous?.moved.first?.id == "snapshot")
                return record(lastSeenAt: lastSeenAt, moved: [row(id: "fresh")])
            },
            paint: { painted.append($0.moved.first?.id ?? "empty") }
        )

        #expect(outcome.steps == [.paintedSnapshot, .built, .saved, .attributed, .stamped])
        #expect(painted == ["snapshot", "fresh"])
        // …and it was still the OLD visit while the build ran.
        #expect(visitAtBuildTime == visit)
        // The stamp advanced only afterwards.
        #expect(lastSeen.lastSeenAt == Date(timeIntervalSince1970: 1_756_100_000))
    }

    @Test("with no snapshot on disk nothing is painted before the build")
    func aFirstRunPaintsOnlyTheBuiltRecord() {
        let (snapshots, lastSeen, owner) = stores()
        var painted = 0

        let outcome = RecordRefresh.run(
            snapshots: snapshots, lastSeen: lastSeen, owner: owner,
            sessionUserId: "client-a",
            build: { previous, lastSeenAt in
                #expect(previous == nil)
                #expect(lastSeenAt == nil)
                return record(lastSeenAt: nil)
            },
            paint: { _ in painted += 1 }
        )

        // Nothing was on disk, so nothing was discarded — a first run must not
        // read as a leak that was caught.
        #expect(outcome.steps == [.built, .saved, .attributed, .stamped])
        #expect(painted == 1)
    }

    @Test("the record that was built is the record that was saved")
    func theSavedRecordIsTheBuiltOne() {
        let (snapshots, lastSeen, owner) = stores()
        let built = record(lastSeenAt: nil, moved: [row(id: "fresh")])

        RecordRefresh.run(
            snapshots: snapshots, lastSeen: lastSeen, owner: owner,
            sessionUserId: "client-a",
            build: { _, _ in built }, paint: { _ in }
        )

        #expect(snapshots.load()?.moved.first?.id == "fresh")
        #expect(owner.ownerId == "client-a")
    }

    // MARK: - B-1: the record must not outlive the account

    @Test("another account's record is discarded before it can be painted or built against")
    func aForeignRecordNeverReachesTheScreen() {
        let (snapshots, lastSeen, owner) = stores()
        let visit = Date(timeIntervalSince1970: 1_755_500_000)

        // Client A's device state: a record, a visit, and A's name on it.
        lastSeen.markSeen(now: visit)
        snapshots.save(record(lastSeenAt: visit, moved: [row(id: "client-a-invoice")]))
        owner.stamp("client-a")

        var painted: [String] = []

        let outcome = RecordRefresh.run(
            snapshots: snapshots, lastSeen: lastSeen, owner: owner,
            sessionUserId: "client-b",
            now: Date(timeIntervalSince1970: 1_756_100_000),
            build: { previous, lastSeenAt in
                // B builds against nothing: not A's rows, and not A's visit —
                // which would otherwise decide what is "new" for B.
                #expect(previous == nil)
                #expect(lastSeenAt == nil)
                return record(lastSeenAt: nil, moved: [row(id: "client-b")])
            },
            paint: { painted.append($0.moved.first?.id ?? "empty") }
        )

        #expect(outcome.steps == [.discardedForeignRecord, .built, .saved, .attributed, .stamped])
        #expect(painted == ["client-b"])
        #expect(owner.ownerId == "client-b")
    }

    @Test("a snapshot no account claims is discarded rather than shown")
    func anUnattributedSnapshotIsNotShown() {
        let (snapshots, lastSeen, owner) = stores()
        snapshots.save(record(lastSeenAt: nil, moved: [row(id: "from-before-the-guard")]))

        var painted: [String] = []
        let outcome = RecordRefresh.run(
            snapshots: snapshots, lastSeen: lastSeen, owner: owner,
            sessionUserId: "client-a",
            build: { previous, _ in
                #expect(previous == nil)
                return record(lastSeenAt: nil)
            },
            paint: { painted.append($0.moved.first?.id ?? "empty") }
        )

        #expect(outcome.steps.first == .discardedForeignRecord)
        #expect(painted == ["empty"])
    }

    @Test("the same account keeps its own record")
    func theOwnRecordSurvives() {
        let (snapshots, lastSeen, owner) = stores()
        snapshots.save(record(lastSeenAt: nil, moved: [row(id: "mine")]))
        owner.stamp("client-a")

        let outcome = RecordRefresh.run(
            snapshots: snapshots, lastSeen: lastSeen, owner: owner,
            sessionUserId: "client-a",
            build: { previous, _ in
                #expect(previous?.moved.first?.id == "mine")
                return record(lastSeenAt: nil, moved: [row(id: "mine")])
            },
            paint: { _ in }
        )

        #expect(!outcome.steps.contains(.discardedForeignRecord))
    }
}

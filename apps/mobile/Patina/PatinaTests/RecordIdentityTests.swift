//
//  RecordIdentityTests.swift
//  PatinaTests
//
//  B-1: the Record's two artefacts live in the App Group container, which is
//  device-global and outlives a sign-out. These pin that one account's record
//  cannot be shown to another — at the auth boundary AND on the paint path,
//  because only the second covers a snapshot written before the wipe existed.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct RecordIdentityTests {

    private func stores() -> (RecordSnapshotStore, LastSeenStore, RecordOwnerStamp) {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("record-identity-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let defaults = UserDefaults(suiteName: "record-identity-\(UUID().uuidString)")!
        return (
            RecordSnapshotStore(
                appGroupIdentifier: "group.test.invalid", fallbackDirectory: directory
            ),
            LastSeenStore(defaults: defaults),
            RecordOwnerStamp(defaults: defaults)
        )
    }

    private func record() -> HouseRecord {
        HouseRecord(
            needsYou: [], moved: [],
            window: DateInterval(start: Date(timeIntervalSince1970: 1_755_000_000),
                                 duration: 7 * 24 * 60 * 60),
            lastSeenAt: nil, hasMoreNeedsYou: false, hasMoreMoved: false
        )
    }

    @Test("the same account may see its own record")
    func theOwnerIsAdmitted() {
        #expect(RecordIdentity.decide(stampedOwner: "a", session: "a") == .paint)
    }

    @Test("another account's record is discarded, never merely hidden")
    func aDifferentAccountIsDiscarded() {
        #expect(RecordIdentity.decide(stampedOwner: "a", session: "b") == .discard)
    }

    @Test("a record no account claims is discarded")
    func anUnattributedRecordIsDiscarded() {
        #expect(RecordIdentity.decide(stampedOwner: nil, session: "a") == .discard)
        #expect(RecordIdentity.decide(stampedOwner: "", session: "a") == .discard)
    }

    @Test("with no session the file is kept and nothing is painted")
    func aSessionStillRestoringIsNotADifferentAccount() {
        // Withheld, not discarded: a nil id during session restore must not
        // cost the person the head start their own record was for.
        #expect(RecordIdentity.decide(stampedOwner: "a", session: nil) == .withhold)
        #expect(RecordIdentity.decide(stampedOwner: "a", session: "") == .withhold)
    }

    @Test("a discard takes the record, the visit and the stamp with it")
    func theDiscardIsComplete() {
        let (snapshots, lastSeen, owner) = stores()
        snapshots.save(record())
        lastSeen.markSeen(now: Date(timeIntervalSince1970: 1_755_500_000))
        owner.stamp("client-a")

        let admitted = RecordIdentity.admits(
            session: "client-b", owner: owner, snapshots: snapshots, lastSeen: lastSeen
        )

        #expect(!admitted)
        #expect(snapshots.load() == nil)
        #expect(lastSeen.lastSeenAt == nil)
        #expect(owner.ownerId == nil)
    }

    @Test("a withheld record is kept on disk")
    func aWithholdRemovesNothing() {
        let (snapshots, lastSeen, owner) = stores()
        snapshots.save(record())
        owner.stamp("client-a")

        #expect(!RecordIdentity.admits(
            session: nil, owner: owner, snapshots: snapshots, lastSeen: lastSeen
        ))
        #expect(snapshots.load() != nil)
        #expect(owner.ownerId == "client-a")
    }

    @Test("the auth boundary wipes the record, the visit and the stamp")
    func theWipeCoversTheRecord() throws {
        let source = try SourcePin.read("Patina/Core/Persistence/LocalStoreReset.swift")
        #expect(source.contains("RecordSnapshotStore.shared.remove()"))
        #expect(source.contains("LastSeenStore.shared.clear()"))
        #expect(source.contains("RecordOwnerStamp.shared.clear()"))
    }

    @Test("the paint path checks identity, not only a session")
    func thePaintPathIsScoped() throws {
        let source = try SourcePin.read(
            "Patina/Features/Home/ViewModels/DailyRoomViewModel.swift"
        )
        #expect(source.contains("RecordIdentity.admits(session: AuthService.shared.currentUserId)"))
        #expect(source.contains("sessionUserId: AuthService.shared.currentUserId"))
    }
}

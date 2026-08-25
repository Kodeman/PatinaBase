//  TodayBandTests.swift
//  CaptureTests
//
//  W1 becomes Today (spec §7.1). The band renders from the local store, always.

import Foundation
import Testing
@testable import CaptureKit

@MainActor
struct TodayBandTests {

    private let identity = CaptureSessionIdentity(userID: "u1", workspaceID: "w1")
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func openVisit(startedAt: Date, lastActivityAt: Date) -> CaptureSessionContext {
        CaptureSessionContext(identity: identity, startedAt: startedAt,
                              lastActivityAt: lastActivityAt, kind: .site,
                              label: "Maple St · Living")
    }

    @Test func noVisitAndAnEmptyTrayIsStillNotABlankScreen() {
        let band = FieldTodayBandBuilder.build(
            visitState: .none, visitCaptures: [], unplaced: [],
            pendingScanUploads: 0, queued: 0, isOffline: false, now: now)
        #expect(band.visit == .none)
        #expect(band.unplacedLine == nil)
        #expect(band.offlineLine == nil)
    }

    @Test func anOpenVisitCountsCapturesNotesAndScans() throws {
        let store = try CaptureStore.inMemory()
        let photo = store.newDraft()
        photo.photos.append(CapturePhoto(filename: "a.heic"))
        let note = store.newDraft()
        note.voiceTranscript = "the alcove on the north wall"

        let band = FieldTodayBandBuilder.build(
            visitState: .active(openVisit(startedAt: now.addingTimeInterval(-3600),
                                          lastActivityAt: now)),
            visitCaptures: [photo, note], unplaced: [],
            pendingScanUploads: 1, queued: 0, isOffline: false, now: now)

        guard case let .open(label, startedAt, captures, notes, scans) = band.visit else {
            Issue.record("expected .open, got \(band.visit)")
            return
        }
        #expect(label == "Maple St · Living")
        #expect(startedAt == now.addingTimeInterval(-3600))
        #expect(captures == 1)
        #expect(notes == 1)
        #expect(scans == 1)
    }

    @Test func aStaleVisitAsksWhetherSheIsStillThere() {
        let last = now.addingTimeInterval(-(CaptureSessionContextPolicy.staleConfirmWindow + 60))
        let band = FieldTodayBandBuilder.build(
            visitState: .stale(openVisit(startedAt: last, lastActivityAt: last)),
            visitCaptures: [], unplaced: [],
            pendingScanUploads: 0, queued: 0, isOffline: false, now: now)
        #expect(band.visitSubtitle == "Still at Maple St · Living?")
    }

    @Test func theUnplacedLineCountsAndPluralises() throws {
        let store = try CaptureStore.inMemory()
        let one = store.newDraft()
        let two = store.newDraft()

        let single = FieldTodayBandBuilder.build(
            visitState: .none, visitCaptures: [], unplaced: [one],
            pendingScanUploads: 0, queued: 0, isOffline: false, now: now)
        #expect(single.unplacedLine == "1 capture not placed yet")

        let many = FieldTodayBandBuilder.build(
            visitState: .none, visitCaptures: [], unplaced: [one, two],
            pendingScanUploads: 0, queued: 0, isOffline: false, now: now)
        #expect(many.unplacedLine == "2 captures not placed yet")
    }

    // FC-R6: unplaced means `project_id == nil`, regardless of sync state — the
    // unplaced set INCLUDES `.committed` rows. A capture that has synced to the
    // server but has no project is still unplaced, and this band must still
    // count it. This is the rule the band exists to protect, so it is pinned
    // here directly (not just at `Specimen.isUnplaced`, Task 7's level).
    @Test func unplacedCountIncludesCommittedRowsThatHaveSyncedButNotBeenFiled() throws {
        let store = try CaptureStore.inMemory()
        let committed = store.newDraft()
        committed.status = .committed
        committed.remoteId = "remote-capture-id"
        #expect(committed.isUnplaced)

        let band = FieldTodayBandBuilder.build(
            visitState: .none, visitCaptures: [], unplaced: [committed],
            pendingScanUploads: 0, queued: 0, isOffline: false, now: now)
        #expect(band.unplacedCount == 1)
        #expect(band.unplacedLine == "1 capture not placed yet")
    }

    @Test func offlineSaysWhatIsOnThePhoneAndNeverTheWordInbox() {
        let band = FieldTodayBandBuilder.build(
            visitState: .none, visitCaptures: [], unplaced: [],
            pendingScanUploads: 0, queued: 3, isOffline: true, now: now)
        #expect(band.offlineLine == "Showing what's on this phone.")
        #expect(band.queuedCount == 3)
        #expect(!(band.offlineLine ?? "").lowercased().contains("inbox"))
    }
}

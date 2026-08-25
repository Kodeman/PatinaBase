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

    // Finding 2 (Wave 3 review, fix round 1) + the round-2 correction on
    // Finding 1: the composed `.open` subtitle was never pinned, and §7.1's
    // Syncing state ("n queued", re-voiced here) lives in exactly the string
    // that correction edited. Pin both states as a pair: fragment order
    // (captures · scans · notes) is covered by both.
    @Test func anOpenVisitSubtitleAppendsWhatsStillOnThePhoneWhenThereIsAnyDepth() throws {
        let store = try CaptureStore.inMemory()
        let photo = store.newDraft()
        photo.photos.append(CapturePhoto(filename: "a.heic"))
        let note = store.newDraft()
        note.voiceTranscript = "the alcove on the north wall"

        let band = FieldTodayBandBuilder.build(
            visitState: .active(openVisit(startedAt: now.addingTimeInterval(-3600),
                                          lastActivityAt: now)),
            visitCaptures: [photo, note], unplaced: [],
            pendingScanUploads: 1, queued: 5, isOffline: false, now: now)

        #expect(band.visitSubtitle == "1 capture · 1 scan · 1 note · 5 still on this phone")
        #expect(!(band.visitSubtitle ?? "").lowercased().contains("queued"))
    }

    @Test func anOpenVisitSubtitleAppendsNothingAndNoStraySeparatorAtZeroDepth() throws {
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

        #expect(band.visitSubtitle == "1 capture · 1 scan · 1 note")
        #expect(!(band.visitSubtitle ?? "").hasSuffix("·"))
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

    // MARK: - unfiled (FC-R6)

    @Test func unfiledIsEverythingWithNoProjectOnIt() throws {
        let store = try CaptureStore.inMemory()
        let owner = CaptureOwnerIdentity(userID: "u1", workspaceID: "w1")!

        let placed = store.newDraft(owner: owner)
        placed.venue = VenueStamp(projectId: "p1", projectName: "Maple St")
        let unplaced = store.newDraft(owner: owner)
        let someoneElses = store.newDraft(
            owner: CaptureOwnerIdentity(userID: "u2", workspaceID: "w2")!)
        try store.save()

        let mine = store.unfiled(owner: owner)
        #expect(mine.contains { $0.id == unplaced.id })
        #expect(!mine.contains { $0.id == placed.id })
        #expect(!mine.contains { $0.id == someoneElses.id })
    }

    @Test func aBlankProjectStringStillCountsAsUnplaced() throws {
        let store = try CaptureStore.inMemory()
        let owner = CaptureOwnerIdentity(userID: "u1", workspaceID: "w1")!
        let blank = store.newDraft(owner: owner)
        blank.venue = VenueStamp(projectId: "   ")
        try store.save()
        #expect(store.unfiled(owner: owner).contains { $0.id == blank.id })
    }

    @Test func syncingDoesNotFileACaptureAndPlacementDoes() throws {
        // FC-R6, the whole ruling in one test: the tray empties on PLACEMENT.
        let store = try CaptureStore.inMemory()
        let owner = CaptureOwnerIdentity(userID: "u1", workspaceID: "w1")!
        let capture = store.newDraft(owner: owner)
        capture.status = .committed          // the NORMAL end of a successful drain
        capture.remoteId = UUID().uuidString
        try store.save()

        #expect(store.unfiled(owner: owner).contains { $0.id == capture.id })

        capture.place(projectID: "p1", projectRoomID: "sr1", room: "Living")
        try store.save()

        #expect(!store.unfiled(owner: owner).contains { $0.id == capture.id })
        #expect(capture.venue?.projectId == "p1")
        #expect(capture.venue?.projectRoomId == "sr1")
        // Committed already, so the server has to be told again.
        #expect(capture.placementNeedsReplay)
    }

    @Test func placingACaptureThatNeverCommittedNeedsNoReplay() throws {
        let store = try CaptureStore.inMemory()
        let owner = CaptureOwnerIdentity(userID: "u1", workspaceID: "w1")!
        let capture = store.newDraft(owner: owner)      // status .draft
        capture.place(projectID: "p1", projectRoomID: nil, room: nil)
        try store.save()
        #expect(!capture.placementNeedsReplay)          // it rides the FIRST commit
        #expect(!store.unfiled(owner: owner).contains { $0.id == capture.id })
    }

    // MARK: - The placement replay, end to end (FC-R6, server side)

    /// The carried defect this task closes. Two separate gates stranded a placed
    /// committed capture: `CaptureStore.outbox()` never re-admitted it (its
    /// `needsProjectPlacement` escape is the FF&E lane, which `place(…)` does not
    /// write), and the sync path's confirmed-receipt short-circuit would have
    /// handed back the old receipt without re-sending. Both are asserted here.
    /// `LocalCaptureSyncService` itself lives in the app target, which this
    /// bundle cannot link — `canReuseConfirmedReceipt` and
    /// `confirmPlacementReplay()` are the CaptureKit rules it reads and calls.
    @Test func aPlacedCommittedCaptureReentersTheDrainAndLeavesItOnce() throws {
        let store = try CaptureStore.inMemory()
        let owner = CaptureOwnerIdentity(userID: "u1", workspaceID: "w1")!
        let capture = store.newDraft(owner: owner)
        capture.status = .committed
        capture.remoteId = UUID().uuidString
        capture.committedProductId = UUID().uuidString
        try store.save()

        // Committed, receipted, unplaced: settled as far as sync is concerned.
        #expect(!store.outbox(owner: owner).contains { $0.id == capture.id })
        #expect(capture.canReuseConfirmedReceipt)

        capture.place(projectID: "p1", projectRoomID: "sr1", room: "Living")
        try store.save()

        // Gate 1 — the drain admits it again.
        #expect(store.outbox(owner: owner).contains { $0.id == capture.id })
        // Gate 2 — and the short-circuit stands aside, so it really re-commits.
        #expect(!capture.canReuseConfirmedReceipt)

        // The receipt lands: the bit is let go of, once.
        #expect(capture.confirmPlacementReplay())
        try store.save()
        #expect(!capture.placementNeedsReplay)
        #expect(capture.canReuseConfirmedReceipt)
        #expect(!store.outbox(owner: owner).contains { $0.id == capture.id })
        #expect(!capture.confirmPlacementReplay())
    }
}

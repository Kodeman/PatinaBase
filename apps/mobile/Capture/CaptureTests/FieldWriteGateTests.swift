//  FieldWriteGateTests.swift
//  CaptureTests
//
//  Both wave-4 write lanes carry field_capture_id, an FK to field_captures(id).
//  That id does not exist until commit_field_capture returns a receipt, so a
//  lane that runs early inserts a row pointing at nothing and gets a 23503.
//  This is the guard, and it is the only part of the drain wiring that can be
//  unit-tested at all (constraint C1).
//
//  `laneState` and `degrade` are here for the same reason: the drain that uses
//  them is app-target code with no test target, so the two rules that turn a
//  wrong mapping into an infinite drain loop or a duplicated note are pinned
//  as pure values instead.

import Foundation
import Testing
@testable import CaptureKit

struct FieldWriteGateTests {
    @Test func aSpecimenWithNoReceiptOffersNoCaptureID() {
        let specimen = Specimen()
        #expect(FieldWriteGate.fieldCaptureID(for: specimen) == nil)
    }

    @Test func aCommittedSpecimenWithARemoteIDOffersIt() {
        let id = UUID(uuidString: "c1111111-1111-4111-8111-111111111111")!
        let specimen = Specimen()
        specimen.remoteId = id.uuidString
        specimen.statusRaw = CaptureStatus.committed.rawValue

        #expect(FieldWriteGate.fieldCaptureID(for: specimen) == id)
    }

    @Test func aRemoteIDWithoutACommittedStatusIsNotAReceipt() {
        let specimen = Specimen()
        specimen.remoteId = "c1111111-1111-4111-8111-111111111111"
        specimen.statusRaw = CaptureStatus.queued.rawValue

        #expect(FieldWriteGate.fieldCaptureID(for: specimen) == nil)
    }

    @Test func aNonUUIDRemoteIDIsRefusedRatherThanForcedThrough() {
        let specimen = Specimen()
        specimen.remoteId = "not-a-uuid"
        specimen.statusRaw = CaptureStatus.committed.rawValue

        #expect(FieldWriteGate.fieldCaptureID(for: specimen) == nil)
    }

    @Test func whitespaceIsNotAReceipt() {
        let specimen = Specimen()
        specimen.remoteId = "   "
        specimen.statusRaw = CaptureStatus.committed.rawValue

        #expect(FieldWriteGate.fieldCaptureID(for: specimen) == nil)
    }

    // MARK: - Ruling 1: which notes file themselves

    private func spoken(_ text: String?) -> Specimen {
        let specimen = Specimen()
        specimen.voiceTranscript = text
        return specimen
    }

    @Test func aSpokenNoteInsideAPlacedVisitFilesItself() {
        #expect(FieldWriteGate.shouldAutoFileMarginNote(
            for: spoken("the scribe is short"), projectID: "p1", insideVisit: true))
    }

    @Test func anUnplacedNoteNeverFilesItself_thatIsStillADeliberateAct() {
        // FC-R6: an unplaced note waits on Today. There is no project_id to
        // anchor a margin note to, so this is enforced, not merely intended.
        #expect(FieldWriteGate.shouldAutoFileMarginNote(
            for: spoken("the scribe is short"), projectID: nil, insideVisit: true) == false)
    }

    @Test func aPhotoWithNoWordsFilesNothing() {
        #expect(FieldWriteGate.shouldAutoFileMarginNote(
            for: spoken(nil), projectID: "p1", insideVisit: true) == false)
        #expect(FieldWriteGate.shouldAutoFileMarginNote(
            for: spoken("   "), projectID: "p1", insideVisit: true) == false)
    }

    @Test func aNoteOutsideAVisitFilesNothing() {
        #expect(FieldWriteGate.shouldAutoFileMarginNote(
            for: spoken("the scribe is short"), projectID: "p1", insideVisit: false) == false)
    }

    @Test func aLaneAlreadyRequestedIsNeverReRequested() {
        let specimen = spoken("the scribe is short")
        specimen.requestMarginNote(noteID: UUID())
        #expect(FieldWriteGate.shouldAutoFileMarginNote(
            for: specimen, projectID: "p1", insideVisit: true) == false)
    }

    // MARK: - The outcome → lane-state mapping the drain must not get wrong

    @Test func alreadyWrittenClosesTheLaneExactlyAsWrittenDoes() {
        // `needsMarginNote` / `needsPunchTask` hold a committed specimen in the
        // outbox until its lane reads .written or .refused. Mapping
        // .alreadyWritten to anything else re-attempts, on every drain forever,
        // a row the server already has.
        #expect(FieldWriteGate.laneState(for: .written) == .written)
        #expect(FieldWriteGate.laneState(for: .alreadyWritten) == .written)
    }

    @Test func aDeferralCostsNothingAndARefusalIsTerminal() {
        #expect(FieldWriteGate.laneState(for: .deferred("offline")) == .pending)
        #expect(FieldWriteGate.laneState(for: .refused("42501")) == .refused)
        #expect(FieldWriteGate.laneState(for: .failed("boom")) == .failed)
    }

    // MARK: - Ruling 3: the degrade keeps the refused task's own id

    private var refusedPunch: PunchTaskWriteRequest {
        PunchTaskComposer.punch(
            id: UUID(uuidString: "c2222222-2222-4222-8222-222222222222")!,
            projectID: UUID(uuidString: "c3333333-3333-4333-8333-333333333333")!,
            createdBy: UUID(uuidString: "c4444444-4444-4444-8444-444444444444")!,
            fieldCaptureID: UUID(uuidString: "c5555555-5555-4555-8555-555555555555")!,
            transcript: "the scribe is short on the left return",
            roomName: "Kitchen",
            courtPartyID: "party-gc")
    }

    @Test func theDegradedNoteReusesTheRefusedTasksOwnID() {
        // A fresh UUID here would write a second note on every replay. The
        // client-minted lineage is the whole of the idempotency.
        let request = refusedPunch
        #expect(FieldWriteGate.degrade(request).noteID == request.id)
    }

    @Test func theDegradedNoteCarriesTheTaskAndTheReason() {
        let body = FieldWriteGate.degrade(refusedPunch).body
        #expect(body.contains("the scribe is short on the left return".prefix(1).uppercased()))
        #expect(body.contains("Kitchen"))
        #expect(body.hasSuffix("Couldn't assign — you're not this project's owner."))
    }
}

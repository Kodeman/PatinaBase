//  MarginNoteWriteTests.swift
//  CaptureTests
//
//  FC-R4 lets the phone write margin_notes directly, on the existing capture
//  outbox, with a client-minted id as the idempotency key. margin_notes.body
//  is NOT NULL (00196:25-41) and margin_notes_designer_all is
//  `for all to authenticated using (designer_id = auth.uid())` (00196:51-54),
//  so the two things that can go wrong are an empty body and someone else's
//  designer_id. Both are pinned here.

import Foundation
import Testing
@testable import CaptureKit

struct MarginNoteWriteTests {
    private let noteID = UUID(uuidString: "a1111111-1111-4111-8111-111111111111")!
    private let projectID = UUID(uuidString: "a2222222-2222-4222-8222-222222222222")!
    private let designerID = UUID(uuidString: "a3333333-3333-4333-8333-333333333333")!
    private let captureID = UUID(uuidString: "a4444444-4444-4444-8444-444444444444")!

    // MARK: - The wire shape

    @Test func requestEncodesTheExactMarginNotesColumnNames() throws {
        let request = try #require(MarginNoteComposer.request(
            noteID: noteID, projectID: projectID, designerID: designerID,
            fieldCaptureID: captureID,
            transcript: "the base cabinet scribe is short on the left return"))

        let data = try JSONEncoder().encode(request)
        let json = try #require(
            JSONSerialization.jsonObject(with: data) as? [String: Any])

        #expect(json["id"] as? String == noteID.uuidString)
        #expect(json["project_id"] as? String == projectID.uuidString)
        #expect(json["designer_id"] as? String == designerID.uuidString)
        #expect(json["field_capture_id"] as? String == captureID.uuidString)
        #expect(json["anchor_kind"] as? String == "letterhead")
        #expect(json["body"] as? String == "the base cabinet scribe is short on the left return")
        #expect(json.count == 6)
    }

    @Test func anchorKindIsAlwaysLetterheadBecauseTheCheckAdmitsNothingElse() throws {
        let request = try #require(MarginNoteComposer.request(
            noteID: noteID, projectID: projectID, designerID: designerID,
            fieldCaptureID: captureID, transcript: "anything"))
        #expect(request.anchorKind == "letterhead")
    }

    @Test func anEmptyTranscriptProducesNoRequestAtAll() {
        #expect(MarginNoteComposer.request(
            noteID: noteID, projectID: projectID, designerID: designerID,
            fieldCaptureID: captureID, transcript: nil) == nil)
        #expect(MarginNoteComposer.request(
            noteID: noteID, projectID: projectID, designerID: designerID,
            fieldCaptureID: captureID, transcript: "   \n  ") == nil)
    }

    @Test func theBodyIsTrimmedButNeverTruncated() throws {
        let long = String(repeating: "the alcove reads forty-two and three quarters. ", count: 40)
        let request = try #require(MarginNoteComposer.request(
            noteID: noteID, projectID: projectID, designerID: designerID,
            fieldCaptureID: captureID, transcript: "  \(long)  "))
        #expect(request.body == long.trimmingCharacters(in: .whitespacesAndNewlines))
        #expect(request.body.count > 80)
    }

    // MARK: - Failure classification

    @Test func rowLevelSecurityIsRefusedAndNeverRetried() {
        #expect(FieldWriteClassifier.outcome(code: "42501", message: "permission denied")
                == .refused("permission denied"))
        #expect(FieldWriteClassifier.outcome(
            code: nil,
            message: "new row violates row-level security policy for table \"project_tasks\"")
                == .refused("new row violates row-level security policy for table \"project_tasks\""))
    }

    @Test func aMissingGrantIsNotARefusal_becauseItIsADeployDefectOnEveryDevice() {
        // "permission denied for table X" with no 42501 is a missing GRANT. As a
        // terminal refusal that discarded the write on every device, silently.
        let missingGrant = FieldWriteClassifier.outcome(
            code: nil, message: "permission denied for table project_tasks")
        #expect(missingGrant == .failed("permission denied for table project_tasks"))
    }

    @Test func aPermanentlyUnsatisfiableCodeIsTerminalRatherThanRetriedForever() {
        // None of these can ever succeed on a retry: the FK target is gone, a
        // NOT NULL arrived null, the body fails a CHECK, an id is not uuid text,
        // or the deployed schema has no such column.
        #expect(FieldWriteClassifier.outcome(code: "23503", message: "violates foreign key")
                == .unsatisfiable("violates foreign key"))
        #expect(FieldWriteClassifier.outcome(code: "23502", message: "null value")
                == .unsatisfiable("null value"))
        #expect(FieldWriteClassifier.outcome(code: "23514", message: "violates check constraint")
                == .unsatisfiable("violates check constraint"))
        #expect(FieldWriteClassifier.outcome(code: "22P02", message: "invalid input syntax for uuid")
                == .unsatisfiable("invalid input syntax for uuid"))
        // The live one: 00543–00545 are not on Strata, so a build shipping ahead
        // of them takes this on every attempt until the migration lands.
        let schemaCache = "Could not find the 'field_capture_id' column of "
            + "'project_tasks' in the schema cache"
        #expect(FieldWriteClassifier.outcome(code: "PGRST204", message: schemaCache)
                == .unsatisfiable(schemaCache))
        #expect(FieldWriteGate.laneState(for: .unsatisfiable("x")) == .unwritable)
    }

    @Test func aDuplicateKeyIsAReplayAndCountsAsWritten() {
        #expect(FieldWriteClassifier.outcome(code: "23505", message: "duplicate key")
                == .alreadyWritten)
    }

    @Test func offlineDefersWithoutSpendingARetry() {
        #expect(FieldWriteClassifier.outcome(code: nil, message: "The Internet connection appears to be offline.")
                == .deferred("The Internet connection appears to be offline."))
        #expect(FieldWriteClassifier.outcome(code: "PGRST301", message: "JWT expired")
                == .deferred("JWT expired"))
    }

    @Test func anythingElseIsAPlainFailure() {
        // This used to assert 23503 == .failed, which pinned the bug: a dangling
        // FK retried forever. An unrecognised error is still a retryable
        // failure — but a bounded one, see the ceiling test below.
        #expect(FieldWriteClassifier.outcome(code: "XX000", message: "internal error")
                == .failed("internal error"))
        #expect(FieldWriteClassifier.outcome(code: nil, message: "the server exploded")
                == .failed("the server exploded"))
    }

    // MARK: - Lookup before write

    @Test func aReplayFindsTheExistingNoteBeforeWritingAgain() async throws {
        let gateway = SpyMarginNoteGateway(exists: true)
        let request = try #require(MarginNoteComposer.request(
            noteID: noteID, projectID: projectID, designerID: designerID,
            fieldCaptureID: captureID, transcript: "spoken"))

        let outcome = try await MarginNoteOrchestrator(gateway: gateway).write(request)

        #expect(outcome == .alreadyWritten)
        #expect(gateway.insertCount == 0)
    }

    @Test func aFirstAttemptInsertsExactlyOnce() async throws {
        let gateway = SpyMarginNoteGateway(exists: false)
        let request = try #require(MarginNoteComposer.request(
            noteID: noteID, projectID: projectID, designerID: designerID,
            fieldCaptureID: captureID, transcript: "spoken"))

        let outcome = try await MarginNoteOrchestrator(gateway: gateway).write(request)

        #expect(outcome == .written)
        #expect(gateway.insertCount == 1)
    }

    // MARK: - The lane on the outbox record

    @Test func aSpecimenWithNoNoteRequestNeedsNothing() {
        let specimen = Specimen()
        #expect(specimen.needsMarginNote == false)
    }

    @Test func markingAnUnopenedLaneIsANoOp_asOnThePlacementLane() {
        // markProjectPlacementFailed has always guarded on its id; these two
        // dropped it, so a failure could paint state onto a lane that was never
        // requested and leave `…LastError` on a specimen with no note at all.
        let specimen = Specimen()
        specimen.markMarginNoteFailed("earlier")
        specimen.markMarginNoteRefused("also earlier")

        #expect(specimen.marginNoteState == nil)
        #expect(specimen.marginNoteLastError == nil)
        #expect(specimen.marginNoteRetryCount == nil)
        #expect(specimen.fieldWriteAttention == nil)
    }

    @Test func requestingANoteOpensTheLaneClean() {
        let specimen = Specimen()
        specimen.requestMarginNote(noteID: noteID)

        #expect(specimen.marginNoteId == noteID.uuidString)
        #expect(specimen.marginNoteState == .pending)
        #expect(specimen.marginNoteLastError == nil)
        #expect(specimen.marginNoteRetryCount == 0)
        #expect(specimen.needsMarginNote)
    }

    @Test func aWrittenNoteClosesTheLane() {
        let specimen = Specimen()
        specimen.requestMarginNote(noteID: noteID)
        specimen.markMarginNoteWritten()

        #expect(specimen.marginNoteState == .written)
        #expect(specimen.needsMarginNote == false)
    }

    @Test func aRefusedNoteClosesTheLaneButLeavesTheLossOnRecord() {
        // A margin 42501 has nowhere to degrade — margin_notes_designer_all keys
        // on the note's OWN designer_id — so it means this build wrote the wrong
        // designer_id. The lane closes, and the fact survives where a reader
        // can find it rather than only in a field nothing reads.
        let specimen = Specimen()
        specimen.requestMarginNote(noteID: noteID)
        specimen.markMarginNoteRefused("permission denied")

        #expect(specimen.marginNoteState == .refused)
        #expect(specimen.marginNoteLastError == "permission denied")
        #expect(specimen.needsMarginNote == false)
        #expect(specimen.fieldWriteAttention?.lane == .marginNote)
        #expect(specimen.fieldWriteAttention?.message == "permission denied")
    }

    @Test func aFailedNoteStaysInTheLaneAndCountsTheAttempt() {
        let specimen = Specimen()
        specimen.requestMarginNote(noteID: noteID)
        specimen.markMarginNoteFailed("boom")
        specimen.markMarginNoteFailed("boom again")

        #expect(specimen.marginNoteState == .failed)
        #expect(specimen.marginNoteRetryCount == 2)
        #expect(specimen.needsMarginNote)
    }

    @Test func aLaneThatSpendsItsRetriesClosesAndKeepsItsLastError() {
        let specimen = Specimen()
        specimen.requestMarginNote(noteID: noteID)
        for attempt in 1...FieldWriteGate.retryCeiling {
            specimen.markMarginNoteFailed("boom \(attempt)")
        }

        #expect(specimen.marginNoteState == .unwritable)
        #expect(specimen.marginNoteRetryCount == FieldWriteGate.retryCeiling)
        #expect(specimen.marginNoteLastError == "boom \(FieldWriteGate.retryCeiling)")
        #expect(specimen.needsMarginNote == false)
        #expect(specimen.fieldWriteAttention?.lane == .marginNote)
    }

    @Test func anUnsatisfiableErrorClosesTheLaneOnTheFirstAttempt() {
        let specimen = Specimen()
        specimen.requestMarginNote(noteID: noteID)
        specimen.markMarginNoteUnwritable("Could not find the column in the schema cache")

        #expect(specimen.marginNoteState == .unwritable)
        #expect(specimen.needsMarginNote == false)
        #expect(specimen.fieldWriteAttention?.lane == .marginNote)
    }

    @Test func aLaneWithNothingLeftToSayCanStillClose() {
        // F10: the lane was opened on a capture whose transcript later resolved
        // empty. MarginNoteComposer.request returns nil, so there is no row to
        // write — and without a settle path `needsMarginNote` stays true and
        // CaptureStore.outbox() hands the committed row back on every drain.
        let specimen = Specimen()
        specimen.requestMarginNote(noteID: noteID)
        #expect(specimen.needsMarginNote)

        specimen.settleMarginNoteWithNothingToWrite()

        #expect(specimen.needsMarginNote == false)
        #expect(specimen.marginNoteState == .unwritable)
        // Nothing failed, so nothing is owed to a reader.
        #expect(specimen.fieldWriteAttention == nil)
    }

    // MARK: - The automatic lane (ruling 1) and the degrade's body (ruling 3)

    @Test func requestingAnOpenLaneTwiceKeepsTheFirstId() {
        let specimen = Specimen()
        specimen.requestMarginNote(noteID: noteID)
        specimen.requestMarginNote(noteID: UUID())

        #expect(specimen.marginNoteId == noteID.uuidString)
    }

    @Test func aWrittenLaneIsFreeAgainForADeliberateSecondNote() {
        let specimen = Specimen()
        specimen.requestMarginNote(noteID: noteID)
        specimen.markMarginNoteWritten()

        let second = UUID()
        specimen.requestMarginNote(noteID: second)

        #expect(specimen.marginNoteId == second.uuidString)
        #expect(specimen.marginNoteState == .pending)
        #expect(specimen.needsMarginNote)
    }

    @Test func theDegradeLandsWhileTheAutoFiledNoteIsStillInFlight() {
        // Ruling 3's degrade used to go through requestMarginNote, which is
        // id-guarded — so on the ordinary FC-R8 path, where ruling 1 has ALREADY
        // auto-opened this capture's margin lane with its transcript, the
        // degrade was a silent no-op. The punch lane is `.refused` by then, so
        // `needsPunchTask` is false and nothing ever retried: the co-member's
        // item vanished leaving only punchTaskLastError.
        let specimen = Specimen()
        specimen.requestMarginNote(noteID: noteID)          // ruling 1, still pending
        #expect(specimen.marginNoteState == .pending)

        let refusedTaskID = UUID()
        let body = MarginNoteComposer.refusedTaskBody(title: "Scribe short", context: nil)
        specimen.requestDegradeNote(noteID: refusedTaskID, body: body)

        // The degrade is queued in its own slot, and the transcript note it
        // would have overwritten is untouched.
        #expect(specimen.degradeNoteId == refusedTaskID.uuidString)
        #expect(specimen.degradeNoteBodyRaw == body)
        #expect(specimen.needsDegradeNote)
        #expect(specimen.marginNoteId == noteID.uuidString)
        #expect(specimen.needsMarginNote)
    }

    @Test func theDegradeKeepsTheRefusedTasksIdSoAReplayWritesOnce() {
        let specimen = Specimen()
        let refusedTaskID = UUID()
        specimen.requestDegradeNote(noteID: refusedTaskID, body: "a")
        specimen.requestDegradeNote(noteID: UUID(), body: "b")

        #expect(specimen.degradeNoteId == refusedTaskID.uuidString)
        #expect(specimen.degradeNoteBodyRaw == "a")
    }

    @Test func aWrittenDegradeClosesItsLane() {
        let specimen = Specimen()
        specimen.requestDegradeNote(noteID: noteID, body: "a")
        specimen.markDegradeNoteWritten()

        #expect(specimen.degradeNoteState == .written)
        #expect(specimen.needsDegradeNote == false)
    }

    @Test func aRefusedDegradeIsTheEndOfTheRoadAndSaysSo() {
        let specimen = Specimen()
        specimen.requestDegradeNote(noteID: noteID, body: "a")
        specimen.markDegradeNoteRefused("permission denied")

        #expect(specimen.needsDegradeNote == false)
        #expect(specimen.fieldWriteAttention?.lane == .degradeNote)
        #expect(specimen.fieldWriteAttention?.message == "permission denied")
    }

    @Test func aDegradeBodyCarriesTheTaskThenTheContextThenTheReason() {
        #expect(MarginNoteComposer.refusedTaskBody(
            title: "The base cabinet scribe is short.",
            context: "the base cabinet scribe is short on the left return\nKitchen")
            == """
            The base cabinet scribe is short.
            the base cabinet scribe is short on the left return
            Kitchen
            Couldn't assign — you're not this project's owner.
            """)
    }

    @Test func aDegradeBodyNeverRepeatsItselfAndAlwaysStatesTheReason() {
        #expect(MarginNoteComposer.refusedTaskBody(title: "Order the runner", context: "Order the runner")
                == "Order the runner\nCouldn't assign — you're not this project's owner.")
        #expect(MarginNoteComposer.refusedTaskBody(title: "Order the runner", context: nil)
                == "Order the runner\nCouldn't assign — you're not this project's owner.")
        #expect(MarginNoteComposer.refusedTaskBody(title: "", context: "   ")
                == "Couldn't assign — you're not this project's owner.")
    }

    @Test func aDegradeBodyIsPersistedOnTheLaneSoItSurvivesARelaunch() {
        let specimen = Specimen()
        let body = MarginNoteComposer.refusedTaskBody(title: "Scribe short", context: nil)
        specimen.requestDegradeNote(noteID: noteID, body: body)

        #expect(specimen.degradeNoteBodyRaw == body)
        #expect(specimen.needsDegradeNote)
    }
}

private final class SpyMarginNoteGateway: MarginNoteGateway, @unchecked Sendable {
    private let exists: Bool
    private(set) var insertCount = 0

    init(exists: Bool) { self.exists = exists }

    func existingMarginNote(id: UUID) async throws -> Bool { exists }
    func insertMarginNote(_ request: MarginNoteWriteRequest) async throws { insertCount += 1 }
}

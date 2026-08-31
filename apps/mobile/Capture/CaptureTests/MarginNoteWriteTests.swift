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
        #expect(FieldWriteClassifier.outcome(code: "23503", message: "insert or update violates foreign key")
                == .failed("insert or update violates foreign key"))
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

    @Test func requestingANoteOpensTheLaneAndClearsAnyPriorFailure() {
        let specimen = Specimen()
        specimen.markMarginNoteFailed("earlier")
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

    @Test func aRefusedNoteClosesTheLaneToo_soTheDrainStopsInsteadOfLooping() {
        let specimen = Specimen()
        specimen.requestMarginNote(noteID: noteID)
        specimen.markMarginNoteRefused("permission denied")

        #expect(specimen.marginNoteState == .refused)
        #expect(specimen.marginNoteLastError == "permission denied")
        #expect(specimen.needsMarginNote == false)
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

    // MARK: - The automatic lane (ruling 1) and the degrade's body (ruling 3)

    @Test func requestingAnOpenLaneTwiceKeepsTheFirstId() {
        let specimen = Specimen()
        specimen.requestMarginNote(noteID: noteID)
        specimen.requestMarginNote(noteID: UUID())

        #expect(specimen.marginNoteId == noteID.uuidString)
    }

    @Test func aWrittenLaneIsFreeAgain_soTheDegradeCanStillFileItsWords() {
        let specimen = Specimen()
        specimen.requestMarginNote(noteID: noteID)
        specimen.markMarginNoteWritten()

        let second = UUID()
        specimen.requestMarginNote(noteID: second, body: "Scribe short\nCouldn't assign — you're not this project's owner.")

        #expect(specimen.marginNoteId == second.uuidString)
        #expect(specimen.marginNoteState == .pending)
        #expect(specimen.needsMarginNote)
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
        specimen.requestMarginNote(noteID: noteID, body: body)

        #expect(specimen.marginNoteBodyRaw == body)
        #expect(specimen.needsMarginNote)
    }
}

private final class SpyMarginNoteGateway: MarginNoteGateway, @unchecked Sendable {
    private let exists: Bool
    private(set) var insertCount = 0

    init(exists: Bool) { self.exists = exists }

    func existingMarginNote(id: UUID) async throws -> Bool { exists }
    func insertMarginNote(_ request: MarginNoteWriteRequest) async throws { insertCount += 1 }
}

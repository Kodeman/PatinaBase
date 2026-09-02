//
//  ErrorVoiceTests.swift
//  PatinaTests
//
//  C4-08 / C4-09 / C5-11: four different spellings of "Something went wrong"
//  shipped at once, two of them interpolating a raw server or system string
//  straight into a homeowner-facing sentence. Modelled on
//  `MoneyFailureCopy`/`OrderFailureCopy`: the thrown error is logged, never
//  interpolated, and the generic failure collapses to one of two canonical
//  sentences everywhere this suite can reach.
//
//  Some assertions below are source-scans of files outside L1-E's own globs
//  (`ScanUploadProgressView.swift`, `ScanReviewView.swift`, `RoomsAPIClient.swift`)
//  — they are expected to stay red on this lane's own clone until the
//  matching rows in `build/waves/w1/l1-e-copy-deck.md` land in L1-B's
//  worktree and the branches merge. That is this suite's designed purpose
//  (PROGRAM.md §3 · L1-E: "a row in the deck that no lane applied fails
//  ... ErrorVoiceTests and comes back as a fix round"), not a defect here.
//

import Testing
import Foundation
@testable import Patina

struct ErrorVoiceTests {

    // MARK: - DesignServicesError (L1-E's own file)

    @Test("DesignServicesError never echoes its associated raw text")
    func designServicesErrorNeverEchoesRawText() {
        let canary = "CANARY_RAW_TEXT_\(UUID().uuidString)"
        #expect(DesignServicesError.invalidRequest(canary).errorDescription?.contains(canary) == false)
        #expect(DesignServicesError.networkError(canary).errorDescription?.contains(canary) == false)
    }

    @Test("DesignServicesError.submissionFailed reads the fix's exact sentence")
    func submissionFailedReadsExactSentence() {
        #expect(
            DesignServicesError.submissionFailed.errorDescription
                == "We couldn't send your request. Nothing was lost — try again."
        )
    }

    @Test("the sending step's fallback matches the app's one canonical generic sentence")
    func sendingStepFallbackIsCanonical() throws {
        let source = try SourcePin.read("Patina/Features/DesignServices/DesignRequestFlowView+Steps.swift")
        #expect(source.contains("\"Something went wrong. Try again.\""))
        #expect(!source.contains("?? \"Something went wrong.\"\n"))
    }

    // MARK: - CompanionAPIError (no other W1 lane owns Services/Companion/**)

    @Test("CompanionAPIError never echoes a raw server message or an HTTP status code")
    func companionAPIErrorNeverEchoesServerText() {
        let canary = "CANARY_RAW_TEXT_\(UUID().uuidString)"
        #expect(CompanionAPIError.badRequest(message: canary).errorDescription?.contains(canary) == false)
        #expect(CompanionAPIError.serverError(statusCode: 599).errorDescription?.contains("599") == false)
    }

    @Test("CompanionAPIError's generic failures read one of the two canonical sentences")
    func companionGenericFailuresAreCanonical() {
        let canonical: Set<String> = [
            "Something went wrong.",
            "Something went wrong. Try again.",
            "That didn't go through. Try again."
        ]
        #expect(CompanionAPIError.badRequest(message: "x").errorDescription.map(canonical.contains) == true)
        #expect(CompanionAPIError.serverError(statusCode: 500).errorDescription.map(canonical.contains) == true)
        #expect(CompanionAPIError.decodingError(underlying: NSError(domain: "x", code: 1)).errorDescription.map(canonical.contains) == true)
    }

    // MARK: - Cross-lane source-scans (expected red until L1-B's rows land — see file header)

    @Test("PatinaErrorState's own preview text is the canonical bare headline")
    func patinaErrorStatePreviewIsCanonical() throws {
        let source = try SourcePin.read("Patina/Design/Components/PatinaErrorState.swift")
        #expect(!source.contains("Something went wrong loading this."))
    }

    @Test("ScanReviewView's error headline carries a terminal period, matching the app's one voice")
    func scanReviewHeadlineHasPeriod() throws {
        let source = try SourcePin.read("Patina/Features/RoomScan/Views/ScanReviewView.swift")
        #expect(!source.contains("Text(\"Something went wrong\")\n"))
    }

    @Test("RoomsAPIError conforms to LocalizedError so no caller can repeat the raw-description bug")
    func roomsAPIErrorIsLocalized() throws {
        let source = try SourcePin.read("Patina/Core/Network/RoomsAPIClient.swift")
        #expect(source.contains("RoomsAPIError: Error, LocalizedError")
            || source.contains("RoomsAPIError: LocalizedError"))
    }

    @Test("ScanUploadProgressView no longer prints package.lastError verbatim")
    func scanUploadProgressDoesNotPrintRawLastError() throws {
        let source = try SourcePin.read(
            "Patina/Features/RoomScan/Shared/Components/ScanUploadProgressView.swift"
        )
        #expect(!source.contains("Text(err)"))
    }
}

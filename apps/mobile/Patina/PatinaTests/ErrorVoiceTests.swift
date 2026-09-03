//
//  ErrorVoiceTests.swift
//  PatinaTests
//
//  C4-08 / C4-09 / C5-11: four different spellings of "Something went wrong"
//  shipped at once, two of them interpolating a raw server or system string
//  straight into a homeowner-facing sentence. Modelled on
//  `MoneyFailureCopy`/`OrderFailureCopy`: the thrown error is logged, never
//  interpolated, and every `errorDescription` in the two services this lane
//  owns is a complete sentence in one register.
//
//  Assertions that scan files OUTSIDE L1-E's globs are wrapped in
//  `withKnownIssue`, naming the deck row and the lane that owns it. On this
//  branch (which has not yet rebased onto the integration tip) they record
//  the expected failure and the suite stays green; at the deck pass, once
//  the owning lane has merged, the wrapper itself fails with "Known issue
//  was not recorded" — that is the signal to unwrap it. A wrapper that keeps
//  passing after the rebase means the row was never applied, which is the
//  fix round PROGRAM.md §3 · L1-E describes.
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

    @Test("PickIntroductionError never echoes its associated raw text")
    func pickIntroductionErrorNeverEchoesRawText() {
        let canary = "CANARY_RAW_TEXT_\(UUID().uuidString)"
        #expect(PickIntroductionError.failed(canary).errorDescription?.contains(canary) == false)
    }

    @Test("DesignServicesError.submissionFailed reads the fix's exact sentence")
    func submissionFailedReadsExactSentence() {
        #expect(
            DesignServicesError.submissionFailed.errorDescription
                == "We couldn’t send your request. Nothing was lost — try again."
        )
    }

    @Test("the sending step's fallback matches the app's one canonical generic sentence")
    func sendingStepFallbackIsCanonical() throws {
        let source = try SourcePin.read("Patina/Features/DesignServices/DesignRequestFlowView+Steps.swift")
        // Positive form only. The negative form this test used to carry
        // (`?? "Something went wrong."` followed by a newline) can never
        // match the real source, where the line ends in `)`.
        #expect(source.contains("?? \"Something went wrong. Try again.\""))
        #expect(!source.contains("?? \"Something went wrong.\")"))
    }

    // MARK: - CompanionAPIError (no other W1 lane owns Services/Companion/**)

    @Test("CompanionAPIError never echoes a raw server message or an HTTP status code")
    func companionAPIErrorNeverEchoesServerText() {
        let canary = "CANARY_RAW_TEXT_\(UUID().uuidString)"
        #expect(CompanionAPIError.badRequest(message: canary).errorDescription?.contains(canary) == false)
        #expect(CompanionAPIError.serverError(statusCode: 599).errorDescription?.contains("599") == false)
    }

    @Test("CompanionAPIError's generic failures read one of the three canonical sentences")
    func companionGenericFailuresAreCanonical() {
        let canonical: Set<String> = [
            "Something went wrong.",
            "Something went wrong. Try again.",
            "That didn’t go through. Try again."
        ]
        #expect(CompanionAPIError.badRequest(message: "x").errorDescription.map(canonical.contains) == true)
        #expect(CompanionAPIError.serverError(statusCode: 500).errorDescription.map(canonical.contains) == true)
        #expect(
            CompanionAPIError.decodingError(underlying: NSError(domain: "x", code: 1))
                .errorDescription.map(canonical.contains) == true
        )
    }

    // MARK: - One punctuation rule across both services (C5-11's "one voice")

    /// Every arm of both services' `errorDescription`. `rateLimited`'s
    /// interpolated arm is exercised at both branches.
    private static let everyOwnedErrorDescription: [String] = {
        let designServices: [DesignServicesError] = [
            .notAuthenticated, .noScans, .primaryNotInSet, .invalidProjectType,
            .scanNotFound(scanIds: []), .scanNotReady(scanIds: []),
            .designerNotFound, .requestNotFound, .alreadySubmitted,
            .invalidRequest("raw"), .networkError("raw"), .submissionFailed
        ]
        let companion: [CompanionAPIError] = [
            .unauthorized, .badRequest(message: "raw"), .serverError(statusCode: 500),
            .networkError(underlying: URLError(.notConnectedToInternet)),
            .decodingError(underlying: URLError(.cannotDecodeRawData)),
            .noToken, .rateLimited(retryAfter: 30), .rateLimited(retryAfter: nil)
        ]
        let pick: [PickIntroductionError] = [.alreadyPicked, .slotStale, .notFound, .failed("raw")]
        return designServices.compactMap(\.errorDescription)
            + companion.compactMap(\.errorDescription)
            + pick.compactMap(\.errorDescription)
    }()

    @Test("every failure sentence in the two services this lane owns ends in a period")
    func errorSentencesEndInPeriods() {
        for sentence in Self.everyOwnedErrorDescription {
            #expect(sentence.hasSuffix("."), "not a complete sentence: \"\(sentence)\"")
        }
    }

    /// The deck's register rule: the app says "Try again.", never
    /// "Please try again." — a polite "Please sign in" instruction is a
    /// different thing and stays.
    @Test("no failure sentence in the two services this lane owns pads with 'Please try again'")
    func errorSentencesShareOneRegister() {
        for sentence in Self.everyOwnedErrorDescription where sentence.contains("Please try again") {
            Issue.record("\"\(sentence)\" is in a more formal register than the rest")
        }
    }

    @Test("DesignServices and the Companion say the connection sentence with the same bytes")
    func theTwoServicesShareOneNetworkSentence() {
        #expect(
            DesignServicesError.networkError("raw").errorDescription
                == CompanionAPIError.networkError(underlying: URLError(.notConnectedToInternet)).errorDescription
        )
    }

    // MARK: - The raw detail is logged, not discarded

    @Test("dropping the raw text from the reader's sentence did not drop it from the log")
    func rawDetailIsStillLogged() throws {
        let service = try SourcePin.read("Patina/Services/DesignServices/DesignServicesService.swift")
        #expect(service.contains("PatinaLog."), "submitDesignRequest discards the Postgres message entirely")

        let companionClient = try SourcePin.read("Patina/Services/Companion/CompanionAPIClient.swift")
        #expect(companionClient.contains("PatinaLog.companion.error(\"Bad request:"))
        #expect(companionClient.contains("PatinaLog.companion.error(\"Server error:"))

        // C4-08's log must survive into a Release archive — a TestFlight AR
        // save failure that leaves no trace is the reason this pin exists.
        let arViewModel = try SourcePin.read("Patina/Features/ARPlacement/ViewModels/ARPlacementViewModel.swift")
        let marker = "PatinaLog.ui.error(\"[ARPlacement] save failed:"
        let saveLog = try #require(arViewModel.range(of: marker))
        #expect(
            !arViewModel[..<saveLog.lowerBound].suffix(140).contains("#if DEBUG"),
            "the save-failure log is compiled out of Release, where a tester's failure needs it most"
        )
    }

    // MARK: - L1-E's own files, already applied here

    @Test("PatinaErrorState's own preview text is the canonical bare headline")
    func patinaErrorStatePreviewIsCanonical() throws {
        let source = try SourcePin.read("Patina/Design/Components/PatinaErrorState.swift")
        #expect(!source.contains("Something went wrong loading this."))
    }

    // MARK: - Cross-lane source-scans (see the file header)

    @Test("ScanReviewView's error headline carries a terminal period, matching the app's one voice")
    func scanReviewHeadlineHasPeriod() throws {
        withKnownIssue("deck row C5-11 / ScanReviewView.swift:128 is L1-B's; unwrap after L1-B merges") {
            let source = try SourcePin.read("Patina/Features/RoomScan/Views/ScanReviewView.swift")
            #expect(!source.contains("Text(\"Something went wrong\")\n"))
        }
    }

    @Test("RoomsAPIError conforms to LocalizedError so no caller can repeat the raw-description bug")
    func roomsAPIErrorIsLocalized() throws {
        withKnownIssue("deck row C4-08 / RoomsAPIClient.swift is L1-B's; unwrap after L1-B merges") {
            let source = try SourcePin.read("Patina/Core/Network/RoomsAPIClient.swift")
            #expect(source.contains("RoomsAPIError: Error, LocalizedError")
                || source.contains("RoomsAPIError: LocalizedError"))
        }
    }

    @Test("ScanUploadProgressView no longer prints package.lastError verbatim")
    func scanUploadProgressDoesNotPrintRawLastError() throws {
        withKnownIssue("deck row C4-09 / ScanUploadProgressView.swift:57 is L1-B's; unwrap after L1-B merges") {
            let source = try SourcePin.read(
                "Patina/Features/RoomScan/Shared/Components/ScanUploadProgressView.swift"
            )
            #expect(!source.contains("Text(err)"))
        }
    }
}

//
//  ServiceAcceptanceRepairTests.swift
//  PatinaTests
//
//  US-52 SQ-2253, the repair of SQ-2250's BLOCK on the iOS service-acceptance
//  surface. One assertion group per finding: exact references before Accept
//  (F1), server text limits (F2), drafts bound per request (F3), an
//  acknowledged answer that survives a failed re-read (F4), fail-closed
//  signer rows (F5), reachable history (F6), and a first read that cannot
//  pass for "no request" (F7).
//

import Testing
import Foundation
@testable import Patina

/// Serves queued fetch results in order, then `rows`; records every answer.
private actor ScriptedService: ServiceAcceptanceService {
    var rows: [RemoteServiceAcceptanceRequest]
    var fetchResults: [Result<[RemoteServiceAcceptanceRequest], Error>]
    var respondFailures: [Error]
    private(set) var sent: [ServiceAcceptanceSubmission] = []

    init(rows: [RemoteServiceAcceptanceRequest],
         fetchResults: [Result<[RemoteServiceAcceptanceRequest], Error>] = [],
         respondFailures: [Error] = []) {
        self.rows = rows
        self.fetchResults = fetchResults
        self.respondFailures = respondFailures
    }

    func queueFetch(_ result: Result<[RemoteServiceAcceptanceRequest], Error>) {
        fetchResults.append(result)
    }

    func fetchMyServiceAcceptanceRequests() async throws -> [RemoteServiceAcceptanceRequest] {
        if !fetchResults.isEmpty { return try fetchResults.removeFirst().get() }
        return rows
    }

    func respondToServiceAcceptance(_ submission: ServiceAcceptanceSubmission) async throws {
        sent.append(submission)
        if !respondFailures.isEmpty { throw respondFailures.removeFirst() }
    }

    func fetchStudioServiceCompletion(projectId: String) async throws -> RemoteStudioServiceCompletionRead {
        RemoteStudioServiceCompletionRead()
    }
}

private func row(_ json: String) throws -> RemoteServiceAcceptanceRequest {
    try ServiceAcceptanceFixture.request(json)
}

struct MalformedSignerCase: Sendable, CustomTestStringConvertible {
    let name: String
    var signers: String?
    var omitSigners = false
    var viewerSignerId: String? = "s-me"
    var testDescription: String { name }
}

private let malformedSignerCases: [MalformedSignerCase] = [
    MalformedSignerCase(name: "signers absent", omitSigners: true),
    MalformedSignerCase(name: "signers null", signers: "null"),
    MalformedSignerCase(name: "signers empty", signers: "[]"),
    MalformedSignerCase(name: "viewerSignerId unmatched", viewerSignerId: "s-someone-else"),
    MalformedSignerCase(name: "viewerSignerId null", viewerSignerId: nil),
    MalformedSignerCase(name: "viewerSignerId matches twice", signers: """
        [{"signerId": "s-me", "slot": "client", "required": true, "response": null},
         {"signerId": "s-me", "slot": "client_again", "required": true, "response": null}]
        """),
    MalformedSignerCase(name: "required role on an optional entry", signers: """
        [{"signerId": "s-me", "slot": "client", "required": false, "response": null}]
        """)
]

@MainActor
struct ServiceAcceptanceRepairTests {

    // MARK: - F1 exact references before Accept

    @Test("F1: the scope edition, scope hash and evidence hash are drawn, in the web's short form, before any act")
    func referencesPrecedeTheActs() throws {
        let request = try row(ServiceAcceptanceFixture.row(scopeContentHash: "0123456789abcdef-scope"))
        #expect(ServiceAcceptanceCopy.scopeReference(request.scopeContentHash) == "Scope reference · 0123456789ab")
        #expect(ServiceAcceptanceCopy.evidenceReference(request.evidenceManifestHash)
                == "Evidence reference · sha-evidence")
        #expect(ServiceAcceptanceCopy.acceptStatement(request).contains("this agreed scope (edition ed-1)"))

        let source = try SourcePin.readCode("Patina/Features/ServiceAcceptance/ServiceAcceptanceDetailView.swift")
        let content = try #require(source.range(of: "struct ServiceAcceptanceDetailContent"))
        let body = source[content.upperBound...]
        let refs = try #require(body.range(of: "references(request)"), "the detail never draws the references")
        let acts = try #require(body.range(of: "respondSection(request)"))
        #expect(refs.lowerBound < acts.lowerBound, "the references are drawn after the acts")
        for drawn in ["request.scopeEditionId", "request.scopeContentHash", "request.evidenceManifestHash"] {
            #expect(source.contains(drawn), "the detail never draws \(drawn)")
        }
    }

    // MARK: - F2 server limits

    @Test("F2: limits mirror 00886 — 1–20 conditions of 1–2000 characters, a reason of 1–2000, counted as Postgres counts")
    func limitsMirrorTheServer() {
        let max = String(repeating: "a", count: 2000)
        let over = String(repeating: "a", count: 2001)
        #expect(ServiceAcceptanceAnswer.acceptWithConditions([max]).issue == nil)
        #expect(ServiceAcceptanceAnswer.acceptWithConditions(["Fine", over]).issue == .conditionTooLong(row: 2))
        #expect(ServiceAcceptanceAnswer.acceptWithConditions(Array(repeating: "x", count: 20)).issue == nil)
        #expect(ServiceAcceptanceAnswer.acceptWithConditions(Array(repeating: "x", count: 21)).issue
                == .tooManyConditions)
        #expect(ServiceAcceptanceAnswer.acceptWithConditions(["  "]).issue == .missingCondition)
        #expect(ServiceAcceptanceAnswer.returned(reason: max).issue == nil)
        #expect(ServiceAcceptanceAnswer.returned(reason: over).issue == .reasonTooLong)
        #expect(ServiceAcceptanceAnswer.returned(reason: " ").issue == .missingReason)
        // 1001 "é" as e + combining accent: 1001 characters to Swift, 2002 to
        // Postgres `length()`. The server's count decides.
        let combining = String(repeating: "e\u{301}", count: 1001)
        #expect(ServiceAcceptanceAnswer.returned(reason: combining).issue == .reasonTooLong)
        #expect(ServiceAcceptanceAnswer.returned(reason: combining).isComplete == false)
    }

    @Test("F2: over-limit input shows a local error and disables Submit; nothing is sent")
    func overLimitBlocksSubmit() async throws {
        let request = try row(ServiceAcceptanceFixture.row())
        let service = ScriptedService(rows: [request])
        let model = ServiceAcceptanceModel(service: service)
        await model.load()
        model.presentedRequestId = request.requestId
        model.choose(.returnToStudio)
        model.returnReason = String(repeating: "a", count: 2001)
        #expect(model.canSubmit == false)
        let issue = try #require(model.draftIssue)
        #expect(ServiceAcceptanceCopy.issue(issue) == "Your reason is over 2,000 characters. Shorten it to send.")
        await model.submit(for: request)
        #expect(await service.sent.isEmpty)
    }

    @Test("F2: service_acceptance_response_invalid gets its own message, not Retry, and the same answer stays blocked")
    func invalidRefusalIsNotRetry() async throws {
        let invalid = RoomsAPIError.http(
            status: 400, body: #"{"code":"23514","message":"service_acceptance_response_invalid"}"#
        )
        #expect(ServiceAcceptanceRefusal(error: invalid) == .invalid)
        #expect(ServiceAcceptanceCopy.refusal(.invalid) != ServiceAcceptanceCopy.refusal(.failed))
        #expect(ServiceAcceptanceCopy.refusal(.invalid).contains("2,000"))

        let request = try row(ServiceAcceptanceFixture.row())
        let service = ScriptedService(rows: [request], respondFailures: [invalid])
        let model = ServiceAcceptanceModel(service: service)
        await model.load()
        model.presentedRequestId = request.requestId
        model.choose(.acceptWithConditions)
        model.conditions = ["Touch up the hall"]
        await model.submit(for: request)
        #expect(model.refusal == .invalid)
        #expect(model.canSubmit == false, "an unchanged answer the server called invalid is offered again")
        model.conditions = ["Touch up the hall before Friday"]
        #expect(model.canSubmit)
    }

    // MARK: - F3 drafts per request and binding

    @Test("F3: request B never inherits A's choice or conditions; A's own draft comes back")
    func draftsStayWithTheirRequest() async throws {
        let first = try row(ServiceAcceptanceFixture.row(requestId: "req-A"))
        let second = try row(ServiceAcceptanceFixture.row(requestId: "req-B", scopeContentHash: "sha-scope-B"))
        let service = ScriptedService(rows: [first, second])
        let model = ServiceAcceptanceModel(service: service)
        await model.load()

        model.presentedRequestId = "req-A"
        model.choose(.acceptWithConditions)
        model.conditions = ["Rehang the lamp"]
        #expect(model.canSubmit)

        model.presentedRequestId = nil
        model.presentedRequestId = "req-B"
        #expect(model.choice == nil)
        #expect(model.conditions == [""])
        #expect(model.canSubmit == false)
        await model.submit(for: second)
        #expect(await service.sent.isEmpty, "B was sent A's draft")

        model.presentedRequestId = "req-A"
        #expect(model.choice == .acceptWithConditions)
        #expect(model.conditions == ["Rehang the lamp"])
    }

    @Test("F3: a changed scope hash on the same request is a new binding with an empty draft")
    func changedBindingStartsEmpty() async throws {
        let before = try row(ServiceAcceptanceFixture.row())
        let after = try row(ServiceAcceptanceFixture.row(scopeContentHash: "sha-scope-2"))
        let service = ScriptedService(rows: [before])
        let model = ServiceAcceptanceModel(service: service)
        await model.load()
        model.presentedRequestId = before.requestId
        model.choose(.accept)
        #expect(model.choice == .accept)

        await service.queueFetch(.success([after]))
        await model.load()
        #expect(model.choice == nil)
        #expect(model.canSubmit == false)
    }

    // MARK: - F4 acknowledged answers stay acknowledged

    @Test("F4: after HTTP success a failed re-read keeps the answer recorded and read-only; no second act")
    func successSurvivesAFailedReread() async throws {
        let open = try row(ServiceAcceptanceFixture.row())
        let answered = try row(ServiceAcceptanceFixture.row(viewerResponse: "accept", method: "ios_authenticated"))
        let service = ScriptedService(rows: [open])
        let model = ServiceAcceptanceModel(service: service)
        await model.load()
        model.presentedRequestId = open.requestId
        model.choose(.accept)

        await service.queueFetch(.failure(URLError(.notConnectedToInternet)))
        await model.submit(for: open)
        #expect(model.loadFailed)
        let shown = try #require(model.presentedRequest)
        #expect(shown.canRespond, "precondition: the stale read still offers the act")
        #expect(model.settled[open.requestId]?.answer == .accept)
        #expect(model.canRespond(shown) == false)
        #expect(model.canSubmit == false)
        #expect(model.choice == nil)
        #expect(ServiceAcceptanceCopy.status(shown, settled: model.settled[open.requestId])
                == ServiceAcceptanceCopy.recorded)

        model.choose(.accept)
        await model.submit(for: shown)
        #expect(await service.sent.count == 1, "a second act went out after an acknowledged one")

        await service.queueFetch(.success([answered]))
        await model.reload()
        #expect(model.settled.isEmpty, "a good read did not reconcile the recorded answer")
        #expect(model.presentedRequest?.viewerResponse?.response == .accept)
    }

    // MARK: - F5 malformed signer rows fail closed

    @Test("F5: a required role is offered no act unless exactly one consistent signer entry is hers",
          arguments: malformedSignerCases)
    func malformedSignersFailClosed(_ malformed: MalformedSignerCase) throws {
        let request = try row(ServiceAcceptanceFixture.row(
            signers: malformed.signers, omitSigners: malformed.omitSigners, viewerSignerId: malformed.viewerSignerId
        ))
        #expect(request.viewerRole == .signerRequired)
        #expect(request.isOpen)
        #expect(request.viewerSigner == nil)
        #expect(request.canRespond == false)
        #expect(ServiceAcceptanceCopy.roleNote(request) == ServiceAcceptanceCopy.readOnly)
    }

    @Test("F5: the well-formed row still offers the acts")
    func wellFormedSignerResponds() throws {
        let request = try row(ServiceAcceptanceFixture.row())
        #expect(request.viewerSigner?.signerId == "s-me")
        #expect(request.canRespond)
    }

    // MARK: - F6 history is reachable

    @Test("F6: withdrawn, superseded, closed and accepted requests stay listed under Past requests and open read-only")
    func historyIsReachable() async throws {
        let rows = try [
            row(ServiceAcceptanceFixture.row(requestId: "open")),
            row(ServiceAcceptanceFixture.row(lifecycle: "withdrawn", requestId: "withdrawn")),
            row(ServiceAcceptanceFixture.row(lifecycle: "superseded", requestId: "superseded")),
            row(ServiceAcceptanceFixture.row(lifecycle: "closed", aggregateOutcome: "returned",
                                             viewerResponse: "return", requestId: "closed")),
            row(ServiceAcceptanceFixture.row(lifecycle: "closed", aggregateOutcome: "accepted",
                                             viewerResponse: "accept", requestId: "accepted"))
        ]
        let model = ServiceAcceptanceModel(service: ScriptedService(rows: rows))
        await model.load()
        #expect(model.openRequests.map(\.requestId) == ["open"])
        #expect(model.pastRequests.map(\.requestId) == ["withdrawn", "superseded", "closed", "accepted"])
        for past in model.pastRequests {
            model.presentedRequestId = past.requestId
            #expect(model.presentedRequest?.requestId == past.requestId)
            #expect(model.canRespond(past) == false)
        }

        let entry = try SourcePin.readCode("Patina/Features/ServiceAcceptance/ServiceAcceptanceEntry.swift")
        #expect(entry.contains("ForEach(model.pastRequests)"), "the entry never lists past requests")
        #expect(entry.contains("ServiceAcceptanceCopy.pastRequests"))
    }

    // MARK: - F7 bounded load, error and retry

    @Test("F7: a failed first read is a failure with a retry, never an empty list; retry recovers")
    func firstReadFailureIsNotEmpty() async throws {
        let request = try row(ServiceAcceptanceFixture.row())
        let service = ScriptedService(rows: [request], fetchResults: [.failure(URLError(.timedOut))])
        let model = ServiceAcceptanceModel(service: service)
        #expect(model.isFirstLoad, "before the first read the entry must show loading")
        await model.load()
        #expect(model.isLoading == false)
        #expect(model.isFirstLoad == false)
        #expect(model.loadFailed)
        #expect(model.hasLoaded == false, "a failed first read reads as loaded and empty")
        #expect(model.entryState == .firstLoadFailed)
        await model.load()
        #expect(model.hasLoaded)
        #expect(model.loadFailed == false)
        #expect(model.openRequests.map(\.requestId) == ["req-1"])

        let entry = try SourcePin.readCode("Patina/Features/ServiceAcceptance/ServiceAcceptanceEntry.swift")
        #expect(entry.contains("case .firstLoadFailed:"), "the entry hides a failed first read")
        #expect(entry.contains("ServiceAcceptanceCopy.tryAgain"))
    }

    @Test("F7: the decision list's pull-to-refresh also reloads the agreed-services read")
    func pullToRefreshReloadsThisModel() throws {
        let list = try SourcePin.readCode("Patina/Features/Decisions/Views/DecisionListView.swift")
        let refresh = try #require(list.range(of: ".refreshable {"), "the list has no refresh block")
        let block = list[refresh.upperBound...].prefix(200)
        #expect(block.contains("serviceAcceptance.load()"), "pull-to-refresh never reloads service acceptance")
        #expect(list.contains("ServiceAcceptanceEntry(model: serviceAcceptance)"))
    }
}

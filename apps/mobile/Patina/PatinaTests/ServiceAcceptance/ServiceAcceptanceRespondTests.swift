//
//  ServiceAcceptanceRespondTests.swift
//  PatinaTests
//
//  US-52 WP-10C-d. Pins the `respond_service_acceptance` request body, the
//  stable `client_request_id` across retries, the refusal mapping, and the
//  K5 vocabulary of the surface.
//

import Testing
import Foundation
@testable import Patina

/// Records every submission and throws the queued failures in order.
private actor FakeServiceAcceptanceService: ServiceAcceptanceService {
    var rows: [RemoteServiceAcceptanceRequest]
    var failures: [Error]
    private(set) var sent: [ServiceAcceptanceSubmission] = []
    private(set) var fetches = 0

    init(rows: [RemoteServiceAcceptanceRequest], failures: [Error] = []) {
        self.rows = rows
        self.failures = failures
    }

    func fetchMyServiceAcceptanceRequests() async throws -> [RemoteServiceAcceptanceRequest] {
        fetches += 1
        return rows
    }

    func respondToServiceAcceptance(_ submission: ServiceAcceptanceSubmission) async throws {
        sent.append(submission)
        if !failures.isEmpty { throw failures.removeFirst() }
    }
}

private func refusalBody(_ code: String, _ message: String) -> RoomsAPIError {
    .http(status: 400, body: #"{"code":"\#(code)","details":null,"hint":null,"message":"\#(message)"}"#)
}

struct RefusalCase: Sendable, CustomTestStringConvertible {
    let code: String
    let message: String
    let expected: ServiceAcceptanceRefusal

    var testDescription: String { message }
}

private let refusalCases: [RefusalCase] = [
    RefusalCase(code: "40001", message: "stale_scope", expected: .stale),
    RefusalCase(code: "40001", message: "stale_signer_policy", expected: .stale),
    RefusalCase(code: "23505", message: "already_responded", expected: .alreadyResponded),
    RefusalCase(code: "55000", message: "request_not_open", expected: .requestNotOpen),
    RefusalCase(code: "55000", message: "scope_editions_inactive", expected: .paused),
    RefusalCase(code: "42501", message: "permission denied for function respond_service_acceptance", expected: .paused),
    RefusalCase(code: "42501", message: "insufficient_privilege", expected: .notYours),
    RefusalCase(code: "55000", message: "signer_not_active", expected: .notYours),
    RefusalCase(code: "23514", message: "service_acceptance_response_invalid", expected: .failed)
]

@MainActor
struct ServiceAcceptanceRespondTests {

    private func openRequest() throws -> RemoteServiceAcceptanceRequest {
        try ServiceAcceptanceFixture.request(ServiceAcceptanceFixture.row())
    }

    // MARK: - Request body

    @Test("the body presents the hashes and revision exactly as read, the key, and ios_authenticated")
    func bodyCarriesThePresentedBinding() throws {
        let submission = ServiceAcceptanceSubmission(
            request: try openRequest(), answer: .accept, clientRequestId: "key-1"
        )
        let body = submission.rpcBody
        #expect(body["p_request_id"] as? String == "req-1")
        #expect(body["p_response"] as? String == "accept")
        #expect(body["p_scope_content_hash"] as? String == "sha-scope-1")
        #expect(body["p_evidence_manifest_hash"] as? String == "sha-evidence-1")
        #expect(body["p_signer_policy_revision"] as? Int == 3)
        #expect(body["p_client_request_id"] as? String == "key-1")
        #expect(body["p_method"] as? String == "ios_authenticated")
        #expect((body["p_conditions"] as? [[String: String]])?.isEmpty == true)
        #expect(body["p_return_reason"] is NSNull)
        #expect(Set(body.keys) == [
            "p_request_id", "p_response", "p_conditions", "p_return_reason", "p_scope_content_hash",
            "p_evidence_manifest_hash", "p_signer_policy_revision", "p_client_request_id", "p_method"
        ])
        // It must serialise: `callRPC` hands it to JSONSerialization.
        #expect(JSONSerialization.isValidJSONObject(body))
    }

    @Test("conditions go as trimmed {text} objects; a return carries its reason")
    func conditionsAndReturnShapes() throws {
        let request = try openRequest()
        let conditional = ServiceAcceptanceSubmission(
            request: request, answer: .acceptWithConditions(["  Touch up the hall  ", "", "Rehang the lamp"])
        ).rpcBody
        #expect(conditional["p_response"] as? String == "accept_with_conditions")
        #expect(conditional["p_conditions"] as? [[String: String]]
                == [["text": "Touch up the hall"], ["text": "Rehang the lamp"]])

        let returned = ServiceAcceptanceSubmission(request: request, answer: .returned(reason: " Wrong fabric ")).rpcBody
        #expect(returned["p_response"] as? String == "return")
        #expect(returned["p_return_reason"] as? String == "Wrong fabric")
        #expect((returned["p_conditions"] as? [[String: String]])?.isEmpty == true)
    }

    @Test("conditions need at least one line and a return needs a reason")
    func answerCompleteness() {
        #expect(ServiceAcceptanceAnswer.accept.isComplete)
        #expect(!ServiceAcceptanceAnswer.acceptWithConditions(["", "  "]).isComplete)
        #expect(ServiceAcceptanceAnswer.acceptWithConditions(["Fix the rail"]).isComplete)
        #expect(!ServiceAcceptanceAnswer.returned(reason: "   ").isComplete)
        #expect(ServiceAcceptanceAnswer.returned(reason: "Not done").isComplete)
    }

    // MARK: - Stable key across retries

    @Test("a retry after a failed send re-sends the same client_request_id")
    func retryKeepsTheKey() async throws {
        let request = try openRequest()
        let fake = FakeServiceAcceptanceService(
            rows: [request], failures: [URLError(.timedOut)]
        )
        let model = ServiceAcceptanceModel(service: fake)
        await model.load()
        model.choose(.accept)

        await model.submit(for: request)
        #expect(model.refusal == .failed)
        #expect(model.pendingSubmission != nil)

        await model.submit(for: request)
        let sent = await fake.sent
        #expect(sent.count == 2)
        #expect(sent[0].clientRequestId == sent[1].clientRequestId)
        #expect(sent[0] == sent[1])
        #expect(model.refusal == nil)
        #expect(model.pendingSubmission == nil)
    }

    @Test("a changed answer mints a new key")
    func changedAnswerMintsANewKey() async throws {
        let request = try openRequest()
        let fake = FakeServiceAcceptanceService(rows: [request], failures: [URLError(.timedOut)])
        let model = ServiceAcceptanceModel(service: fake)
        await model.load()
        model.choose(.accept)
        await model.submit(for: request)
        model.choose(.returnToStudio)
        model.returnReason = "Not finished"
        await model.submit(for: request)
        let sent = await fake.sent
        #expect(sent.count == 2)
        #expect(sent[0].clientRequestId != sent[1].clientRequestId)
    }

    @Test("an observer is never sent, whatever is composed")
    func observerCannotSubmit() async throws {
        let observer = try ServiceAcceptanceFixture.request(ServiceAcceptanceFixture.row(viewerRole: "mystery"))
        let fake = FakeServiceAcceptanceService(rows: [observer])
        let model = ServiceAcceptanceModel(service: fake)
        model.choose(.accept)
        await model.submit(for: observer)
        #expect(await fake.sent.isEmpty)
    }

    // MARK: - Refusal mapping

    @Test("server refusals map to what the screen does next", arguments: refusalCases)
    func refusalMapping(_ refusal: RefusalCase) {
        #expect(ServiceAcceptanceRefusal(error: refusalBody(refusal.code, refusal.message)) == refusal.expected)
    }

    @Test("a transport error or an unreadable body is a plain failure")
    func transportFailure() {
        #expect(ServiceAcceptanceRefusal(error: URLError(.notConnectedToInternet)) == .failed)
        #expect(ServiceAcceptanceRefusal(status: 502, body: "<html>bad gateway</html>") == .failed)
    }

    @Test("paused says nothing is lost")
    func pausedCopy() {
        #expect(ServiceAcceptanceCopy.refusal(.paused) == "Responses are paused for now. Nothing you’ve seen is lost.")
    }

    @Test("stale waits for Reload, which drops the old submission and re-reads")
    func staleWaitsForReload() async throws {
        let request = try openRequest()
        let fake = FakeServiceAcceptanceService(rows: [request], failures: [refusalBody("40001", "stale_scope")])
        let model = ServiceAcceptanceModel(service: fake)
        await model.load()
        model.choose(.accept)
        await model.submit(for: request)
        #expect(model.refusal == .stale)
        #expect(await fake.fetches == 1)

        await model.reload()
        #expect(model.refusal == nil)
        #expect(model.pendingSubmission == nil)
        #expect(await fake.fetches == 2)
    }

    @Test("request_not_open and already_responded re-read to show the final state")
    func finalStateRefusalsReload() async throws {
        for message in ["request_not_open", "already_responded"] {
            let request = try openRequest()
            let fake = FakeServiceAcceptanceService(rows: [request], failures: [refusalBody("55000", message)])
            let model = ServiceAcceptanceModel(service: fake)
            await model.load()
            model.choose(.accept)
            await model.submit(for: request)
            #expect(await fake.fetches == 2, "\(message) did not re-read")
            #expect(model.choice == nil)
            #expect(model.pendingSubmission == nil)
        }
    }

    // MARK: - K5 vocabulary

    @Test("K5: no line on the surface says sign or signature")
    func noSignatureVocabulary() throws {
        let files = [
            "Patina/Features/ServiceAcceptance/ServiceAcceptanceCopy.swift",
            "Patina/Features/ServiceAcceptance/ServiceAcceptanceEntry.swift",
            "Patina/Features/ServiceAcceptance/ServiceAcceptanceDetailView.swift"
        ]
        var walked = 0
        for file in files {
            for literal in BrandVoiceLintTests.stringLiterals(in: try SourcePin.readCode(file)) {
                walked += 1
                #expect(
                    literal.range(of: #"\bsign(s|ed|ing|ature|atures)?\b"#,
                                  options: [.regularExpression, .caseInsensitive]) == nil,
                    "\(file) ships \"\(literal)\""
                )
            }
        }
        #expect(walked > 20, "the literal walk found only \(walked) literals")
        #expect(ServiceAcceptanceCopy.acceptStatement
                == "You confirm the studio delivered the service described in this agreed scope.")
    }
}

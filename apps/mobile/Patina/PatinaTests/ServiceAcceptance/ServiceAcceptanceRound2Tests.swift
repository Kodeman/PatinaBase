//
//  ServiceAcceptanceRound2Tests.swift
//  PatinaTests
//
//  US-52 SQ-2260, the round-2 repair after SQ-2258's BLOCK. One assertion
//  group per finding: the settled latch is keyed by the signer binding that
//  was acted on (R1), a read begun before an act never publishes over it
//  (R2), the answer goes only under the signer policy revision she was shown
//  (R3), and a failed refresh shows with a retry whatever is cached (R4).
//

import Testing
import Foundation
@testable import Patina

/// Serves `rows`, or queued results first. A fetch asked to hold waits until
/// the test resumes it with the rows it should return then.
private actor ControlledService: ServiceAcceptanceService {
    var rows: [RemoteServiceAcceptanceRequest]
    private var queued: [Result<[RemoteServiceAcceptanceRequest], Error>] = []
    private var holdNext = false
    private var held: [CheckedContinuation<[RemoteServiceAcceptanceRequest], Error>] = []
    private(set) var sent: [ServiceAcceptanceSubmission] = []

    init(rows: [RemoteServiceAcceptanceRequest]) {
        self.rows = rows
    }

    func setRows(_ rows: [RemoteServiceAcceptanceRequest]) { self.rows = rows }
    func queueFetch(_ result: Result<[RemoteServiceAcceptanceRequest], Error>) { queued.append(result) }
    func holdNextFetch() { holdNext = true }
    var heldCount: Int { held.count }

    func resumeHeld(returning rows: [RemoteServiceAcceptanceRequest]) {
        held.removeFirst().resume(returning: rows)
    }

    func fetchMyServiceAcceptanceRequests() async throws -> [RemoteServiceAcceptanceRequest] {
        if holdNext {
            holdNext = false
            return try await withCheckedThrowingContinuation { held.append($0) }
        }
        if !queued.isEmpty { return try queued.removeFirst().get() }
        return rows
    }

    func respondToServiceAcceptance(_ submission: ServiceAcceptanceSubmission) async throws {
        sent.append(submission)
    }

    func fetchStudioServiceCompletion(projectId: String) async throws -> RemoteStudioServiceCompletionRead {
        RemoteStudioServiceCompletionRead()
    }
}

private func row(_ json: String) throws -> RemoteServiceAcceptanceRequest {
    try ServiceAcceptanceFixture.request(json)
}

/// The same request after the studio replaced her answered slot with a new
/// active one for her (00886 :1115-1158): new signer id, revision 4, no answer.
/// The projection lists active signers only (:1252-1260).
private func replacedSlot() throws -> RemoteServiceAcceptanceRequest {
    try row(ServiceAcceptanceFixture.row(
        signers: """
        [{"signerId": "s-me-2", "slot": "client", "required": true, "response": null}]
        """,
        viewerSignerId: "s-me-2",
        signerPolicyRevision: 4
    ))
}

@MainActor
struct ServiceAcceptanceRound2Tests {

    // MARK: - R1 settled by the binding acted on

    @Test("R1: the same binding stays read-only; a new slot for her clears the latch and offers the act again")
    func newSlotClearsTheLatch() async throws {
        let open = try row(ServiceAcceptanceFixture.row())
        let service = ControlledService(rows: [open])
        let model = ServiceAcceptanceModel(service: service)
        await model.load()
        model.presentedRequestId = open.requestId
        model.choose(.accept)

        // Acknowledged, and the re-read still shows the slot unanswered: F4 holds.
        await model.submit(for: open)
        let same = try #require(model.presentedRequest)
        #expect(same.canRespond, "precondition: the read still offers the same slot")
        #expect(model.canRespond(same) == false, "the same binding was offered a second act")
        #expect(model.settlement(for: same)?.answer == .accept)

        // The studio replaces her slot: a new signer id and revision.
        let replaced = try replacedSlot()
        await service.setRows([replaced])
        await model.reload()
        let shown = try #require(model.presentedRequest)
        #expect(shown.viewerSignerId == "s-me-2")
        #expect(model.settled.isEmpty, "the old binding's latch outlived the replacement")
        #expect(model.settlement(for: shown) == nil)
        #expect(model.canRespond(shown), "the new slot was never offered")
        #expect(ServiceAcceptanceCopy.status(shown, settled: model.settlement(for: shown))
                == "Waiting on your response.")

        model.choose(.accept)
        #expect(model.canSubmit)
        await model.submit(for: shown)
        let sent = await service.sent
        #expect(sent.count == 2)
        #expect(sent.last?.signerPolicyRevision == 4)
    }

    // MARK: - R2 read ordering

    @Test("R2: a read begun before the act and finished after it never brings the act back")
    func olderReadNeverPublishesOverAnAct() async throws {
        let open = try row(ServiceAcceptanceFixture.row())
        let answered = try row(ServiceAcceptanceFixture.row(viewerResponse: "accept", method: "ios_authenticated"))
        let service = ControlledService(rows: [open])
        let model = ServiceAcceptanceModel(service: service)
        await model.load()
        model.presentedRequestId = open.requestId
        model.choose(.accept)

        // Read A starts (pull-to-refresh) and is held in flight.
        await service.holdNextFetch()
        let readA = Task { await model.load() }
        while await service.heldCount == 0 { await Task.yield() }

        // She submits; the submit's read B sees her recorded answer.
        await service.setRows([answered])
        await model.submit(for: open)
        #expect(model.presentedRequest?.viewerResponse?.response == .accept)
        #expect(model.settled.isEmpty, "precondition: read B reconciled the answer")

        // A now lands with its pre-act snapshot.
        await service.resumeHeld(returning: [open])
        await readA.value
        let shown = try #require(model.presentedRequest)
        #expect(shown.viewerResponse?.response == .accept, "the older read A published over read B")
        #expect(model.canRespond(shown) == false, "the act reappeared after it was recorded")
        #expect(model.isLoading == false)
        #expect(await service.sent.count == 1)
    }

    @Test("R2: of two reads in flight, only the later one publishes")
    func laterReadWins() async throws {
        let first = try row(ServiceAcceptanceFixture.row(requestId: "req-old"))
        let second = try row(ServiceAcceptanceFixture.row(requestId: "req-new"))
        let service = ControlledService(rows: [second])
        let model = ServiceAcceptanceModel(service: service)

        await service.holdNextFetch()
        let readA = Task { await model.load() }
        while await service.heldCount == 0 { await Task.yield() }
        await model.load()
        #expect(model.requests.map(\.requestId) == ["req-new"])

        await service.resumeHeld(returning: [first])
        await readA.value
        #expect(model.requests.map(\.requestId) == ["req-new"], "an older read overwrote a newer one")
        #expect(model.isLoading == false)
    }

    // MARK: - R3 the presented policy revision

    @Test("R3: a refresh bringing another signer revision keeps her words, blocks Submit, and never stamps it")
    func changedRevisionAsksForReview() async throws {
        let before = try row(ServiceAcceptanceFixture.row())
        let after = try row(ServiceAcceptanceFixture.row(signerPolicyRevision: 4))
        let service = ControlledService(rows: [before])
        let model = ServiceAcceptanceModel(service: service)
        await model.load()
        model.presentedRequestId = before.requestId
        model.choose(.acceptWithConditions)
        model.conditions = ["Rehang the lamp"]
        #expect(model.canSubmit)
        #expect(model.signersChanged == false)

        await service.setRows([after])
        await model.load()
        let shown = try #require(model.presentedRequest)
        #expect(shown.signerPolicyRevision == 4)
        #expect(model.conditions == ["Rehang the lamp"], "her words were dropped")
        #expect(model.choice == .acceptWithConditions)
        #expect(model.signersChanged, "the changed signers were not shown")
        #expect(model.canSubmit == false, "Submit stayed on under a revision she was not shown")
        await model.submit(for: shown)
        #expect(await service.sent.isEmpty, "the answer went out stamped with revision 4")

        await model.reviewAgain()
        #expect(model.choice == nil, "review again did not ask her to pick her act again")
        #expect(model.signersChanged == false)
        model.choose(.acceptWithConditions)
        #expect(model.conditions == ["Rehang the lamp"])
        #expect(model.canSubmit)
        let current = try #require(model.presentedRequest)
        await model.submit(for: current)
        let sent = await service.sent
        #expect(sent.count == 1)
        #expect(sent.first?.signerPolicyRevision == 4)
    }

    @Test("R3: the detail draws the signers-changed notice with an explicit reload")
    func detailDrawsTheNotice() throws {
        let detail = try SourcePin.readCode("Patina/Features/ServiceAcceptance/ServiceAcceptanceDetailView.swift")
        #expect(detail.contains("if model.signersChanged { signersChangedNotice }"))
        #expect(detail.contains("await model.reviewAgain()"))
        #expect(ServiceAcceptanceCopy.signersChanged.contains("signers on this request changed"))
    }

    // MARK: - R4 refresh failure whatever is cached

    @Test("R4: after a good empty read, a failed refresh shows with Retry")
    func warmEmptyFailureShows() async throws {
        let service = ControlledService(rows: [])
        let model = ServiceAcceptanceModel(service: service)
        await model.load()
        #expect(model.entryState == .empty)

        await service.queueFetch(.failure(URLError(.notConnectedToInternet)))
        await model.load()
        #expect(model.requests.isEmpty)
        #expect(model.entryState == .loaded(refreshFailed: true), "a warm-empty failure draws nothing")

        let request = try row(ServiceAcceptanceFixture.row())
        await service.setRows([request])
        await model.load()
        #expect(model.entryState == .loaded(refreshFailed: false))

        await service.queueFetch(.failure(URLError(.timedOut)))
        await model.load()
        #expect(model.entryState == .loaded(refreshFailed: true))

        let entry = try SourcePin.readCode("Patina/Features/ServiceAcceptance/ServiceAcceptanceEntry.swift")
        #expect(entry.contains("switch model.entryState"), "the entry decides its own state")
        #expect(entry.contains("if refreshFailed { failure(ServiceAcceptanceCopy.refreshFailed) }"))
    }
}

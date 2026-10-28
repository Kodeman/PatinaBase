//
//  ServiceAcceptanceModel.swift
//  Patina
//
//  US-52 WP-10C-d. The state behind the agreed-services entry and its detail
//  sheet: the caller's requests, the request on screen, one draft answer per
//  request binding, the answers the server has acknowledged, and the one
//  submission a retry re-sends.
//

import SwiftUI

/// The two calls this feature makes. `DecisionsAPIClient` is the real one;
/// tests hand in a fake.
nonisolated protocol ServiceAcceptanceService: Sendable {
    func fetchMyServiceAcceptanceRequests() async throws -> [RemoteServiceAcceptanceRequest]
    func respondToServiceAcceptance(_ submission: ServiceAcceptanceSubmission) async throws
}

extension DecisionsAPIClient: ServiceAcceptanceService {}

/// The three acts a required signer is offered, in the order drawn.
enum ServiceAcceptanceChoice: CaseIterable, Identifiable, Sendable {
    case accept, acceptWithConditions, returnToStudio

    var id: Self { self }
}

/// What a draft is bound to: the request and the exact scope and evidence it
/// presented. A changed hash is a different binding with its own empty draft.
struct ServiceAcceptanceDraftKey: Hashable, Sendable {
    let requestId: String
    let scopeContentHash: String
    let evidenceManifestHash: String

    init(_ request: RemoteServiceAcceptanceRequest) {
        requestId = request.requestId
        scopeContentHash = request.scopeContentHash
        evidenceManifestHash = request.evidenceManifestHash
    }
}

/// One answer being composed.
struct ServiceAcceptanceDraft: Equatable, Sendable {
    var choice: ServiceAcceptanceChoice?
    var conditions: [String] = [""]
    var returnReason = ""

    var answer: ServiceAcceptanceAnswer? {
        switch choice {
        case .accept: return .accept
        case .acceptWithConditions: return .acceptWithConditions(conditions)
        case .returnToStudio: return .returned(reason: returnReason)
        case nil: return nil
        }
    }
}

/// A request the server has settled for this caller since the last good read:
/// her answer was acknowledged (`answer` set), or a refusal said no act can
/// succeed (`answer` nil). It stays read-only until a successful read shows
/// the request no longer waiting on her.
struct ServiceAcceptanceSettled: Equatable, Sendable {
    let answer: ServiceAcceptanceAnswer?
}

@Observable
@MainActor
final class ServiceAcceptanceModel {
    private(set) var requests: [RemoteServiceAcceptanceRequest] = []
    private(set) var isLoading = false
    private(set) var loadFailed = false
    /// True once any read has succeeded; until then an empty list means
    /// "not known yet", never "no request".
    private(set) var hasLoaded = false

    /// The request the sheet shows. Opening another drops the last one's
    /// refusal line; drafts stay with the request they were written for.
    var presentedRequestId: String? {
        didSet { if presentedRequestId != oldValue { refusal = nil } }
    }

    private(set) var drafts: [ServiceAcceptanceDraftKey: ServiceAcceptanceDraft] = [:]
    private(set) var settled: [String: ServiceAcceptanceSettled] = [:]
    private(set) var isSubmitting = false
    private(set) var refusal: ServiceAcceptanceRefusal?
    /// The submission last sent and not yet answered. A retry of the same
    /// answer on the same request re-sends it, key and all.
    private(set) var pendingSubmission: ServiceAcceptanceSubmission?

    /// Server cap on conditions per response (00886 `_service_acceptance_conditions`).
    static let maxConditions = ServiceAcceptanceAnswer.maxConditions

    private let service: ServiceAcceptanceService

    init(service: ServiceAcceptanceService = DecisionsAPIClient.shared) {
        self.service = service
    }

    // MARK: - Read

    /// Sent and still waiting on someone: the entry's cards.
    var openRequests: [RemoteServiceAcceptanceRequest] { requests.filter(\.isOpen) }

    /// Withdrawn, superseded, closed or decided: read-only history.
    var pastRequests: [RemoteServiceAcceptanceRequest] { requests.filter { !$0.isOpen } }

    /// Nothing read yet and nothing failed: the first read is in flight.
    var isFirstLoad: Bool { !hasLoaded && !loadFailed }

    func request(id: String) -> RemoteServiceAcceptanceRequest? {
        requests.first { $0.requestId == id }
    }

    var presentedRequest: RemoteServiceAcceptanceRequest? { presentedRequestId.flatMap(request(id:)) }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let fresh = try await service.fetchMyServiceAcceptanceRequests()
            requests = fresh
            hasLoaded = true
            loadFailed = false
            // A good read that no longer offers her an act reconciles a
            // settled request; one that still does keeps it read-only.
            settled = settled.filter { id, _ in fresh.first { $0.requestId == id }?.canRespond == true }
        } catch {
            // A failed read keeps whatever was already on screen.
            loadFailed = true
            #if DEBUG
            PatinaLog.ui.error("[ServiceAcceptance] load failed: \(error.localizedDescription)")
            #endif
        }
    }

    /// The server offers her an act and nothing here has settled it since.
    func canRespond(_ request: RemoteServiceAcceptanceRequest) -> Bool {
        request.canRespond && settled[request.requestId] == nil
    }

    // MARK: - Compose (the presented request's draft)

    private var draftKey: ServiceAcceptanceDraftKey? { presentedRequest.map(ServiceAcceptanceDraftKey.init) }

    private var draft: ServiceAcceptanceDraft {
        get { draftKey.flatMap { drafts[$0] } ?? ServiceAcceptanceDraft() }
        set { if let draftKey { drafts[draftKey] = newValue } }
    }

    /// The act she picked; nil until she picks one.
    var choice: ServiceAcceptanceChoice? { draft.choice }

    var conditions: [String] {
        get { draft.conditions }
        set { draft.conditions = newValue }
    }

    var returnReason: String {
        get { draft.returnReason }
        set { draft.returnReason = newValue }
    }

    func choose(_ choice: ServiceAcceptanceChoice?) {
        draft.choice = choice
        refusal = nil
    }

    /// The answer as composed, or nil when nothing is chosen.
    var draftAnswer: ServiceAcceptanceAnswer? { draft.answer }

    /// What stops the composed answer going, if anything.
    var draftIssue: ServiceAcceptanceAnswerIssue? { draftAnswer?.issue }

    var canSubmit: Bool {
        guard !isSubmitting, let request = presentedRequest, canRespond(request),
              let answer = draftAnswer, answer.isComplete else { return false }
        // The server already called this exact answer invalid; she edits it.
        return !(refusal == .invalid && pendingSubmission?.answer == answer)
    }

    var canAddCondition: Bool { conditions.count < Self.maxConditions }

    func addCondition() {
        guard canAddCondition else { return }
        conditions.append("")
    }

    // MARK: - Respond

    /// Send the draft composed for this request. A retry of an unchanged
    /// answer re-sends the pending submission with its original
    /// `client_request_id`, so the server replays rather than records twice.
    func submit(for request: RemoteServiceAcceptanceRequest) async {
        let key = ServiceAcceptanceDraftKey(request)
        guard canRespond(request), !isSubmitting,
              let answer = drafts[key]?.answer, answer.isComplete else { return }
        let submission: ServiceAcceptanceSubmission
        if let pending = pendingSubmission, pending.requestId == request.requestId,
           pending.answer == answer,
           pending.scopeContentHash == request.scopeContentHash,
           pending.evidenceManifestHash == request.evidenceManifestHash,
           pending.signerPolicyRevision == request.signerPolicyRevision {
            submission = pending
        } else {
            submission = ServiceAcceptanceSubmission(request: request, answer: answer)
        }
        pendingSubmission = submission
        isSubmitting = true
        refusal = nil
        do {
            try await service.respondToServiceAcceptance(submission)
            isSubmitting = false
            settle(request, key: key, answer: answer)
            await load()
        } catch {
            isSubmitting = false
            await handle(ServiceAcceptanceRefusal(error: error), for: request, key: key)
        }
    }

    /// The reload a `stale` refusal or an unreconciled answer asks for. What
    /// she read may have moved, so the old submission is dropped with it.
    func reload() async {
        pendingSubmission = nil
        refusal = nil
        await load()
    }

    private func handle(_ refusal: ServiceAcceptanceRefusal, for request: RemoteServiceAcceptanceRequest,
                        key: ServiceAcceptanceDraftKey) async {
        self.refusal = refusal
        switch refusal {
        case .alreadyResponded, .requestNotOpen, .notYours:
            // No act on this request can succeed now; the record says what is
            // true. Read-only until a good read shows it.
            settle(request, key: key, answer: nil)
            await load()
        case .stale, .paused, .failed, .invalid:
            // Stale waits for her Reload; paused and failed keep her answer
            // and its key for a later retry; invalid waits for her edit.
            break
        }
    }

    private func settle(_ request: RemoteServiceAcceptanceRequest, key: ServiceAcceptanceDraftKey,
                        answer: ServiceAcceptanceAnswer?) {
        pendingSubmission = nil
        drafts[key] = nil
        settled[request.requestId] = ServiceAcceptanceSettled(answer: answer)
    }
}

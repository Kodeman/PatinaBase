//
//  ServiceAcceptanceModel.swift
//  Patina
//
//  US-52 WP-10C-d. The state behind the agreed-services entry and its detail
//  sheet: the caller's requests, the answer she is composing, and the one
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

@Observable
@MainActor
final class ServiceAcceptanceModel {
    private(set) var requests: [RemoteServiceAcceptanceRequest] = []
    private(set) var isLoading = false
    private(set) var loadFailed = false

    /// The act she picked; nil until she picks one.
    private(set) var choice: ServiceAcceptanceChoice?
    var conditions: [String] = [""]
    var returnReason = ""
    private(set) var isSubmitting = false
    private(set) var refusal: ServiceAcceptanceRefusal?
    /// The submission last sent and not yet answered. A retry of the same
    /// answer on the same request re-sends it, key and all.
    private(set) var pendingSubmission: ServiceAcceptanceSubmission?

    /// Server cap on conditions per response (00886 `_service_acceptance_conditions`).
    static let maxConditions = 20

    private let service: ServiceAcceptanceService

    init(service: ServiceAcceptanceService = DecisionsAPIClient.shared) {
        self.service = service
    }

    /// The requests the entry carries: sent and still waiting on someone.
    var openRequests: [RemoteServiceAcceptanceRequest] { requests.filter(\.isOpen) }

    func request(id: String) -> RemoteServiceAcceptanceRequest? {
        requests.first { $0.requestId == id }
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            requests = try await service.fetchMyServiceAcceptanceRequests()
            loadFailed = false
        } catch {
            // A failed read keeps whatever was already on screen.
            loadFailed = true
            #if DEBUG
            PatinaLog.ui.error("[ServiceAcceptance] load failed: \(error.localizedDescription)")
            #endif
        }
    }

    func choose(_ choice: ServiceAcceptanceChoice?) {
        self.choice = choice
        refusal = nil
    }

    /// The answer as composed, or nil when nothing is chosen.
    var draftAnswer: ServiceAcceptanceAnswer? {
        switch choice {
        case .accept: return .accept
        case .acceptWithConditions: return .acceptWithConditions(conditions)
        case .returnToStudio: return .returned(reason: returnReason)
        case nil: return nil
        }
    }

    var canSubmit: Bool { !isSubmitting && (draftAnswer?.isComplete ?? false) }

    var canAddCondition: Bool { conditions.count < Self.maxConditions }

    func addCondition() {
        guard canAddCondition else { return }
        conditions.append("")
    }

    /// Send the composed answer. A retry of an unchanged answer re-sends the
    /// pending submission with its original `client_request_id`, so the
    /// server replays rather than records twice.
    func submit(for request: RemoteServiceAcceptanceRequest) async {
        guard request.canRespond, let answer = draftAnswer, answer.isComplete, !isSubmitting else { return }
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
            pendingSubmission = nil
            resetComposer()
            await load()
        } catch {
            isSubmitting = false
            await handle(ServiceAcceptanceRefusal(error: error))
        }
    }

    /// The reload a `stale` refusal asks for. What she read has moved, so the
    /// old submission is dropped with it.
    func reload() async {
        pendingSubmission = nil
        refusal = nil
        await load()
    }

    private func handle(_ refusal: ServiceAcceptanceRefusal) async {
        self.refusal = refusal
        switch refusal {
        case .alreadyResponded, .requestNotOpen, .notYours:
            // The record already says what is true; show it.
            pendingSubmission = nil
            resetComposer()
            await load()
        case .stale, .paused, .failed:
            // Stale waits for her Reload; paused and failed keep her answer
            // and its key for a later retry.
            break
        }
    }

    private func resetComposer() {
        choice = nil
        conditions = [""]
        returnReason = ""
    }
}

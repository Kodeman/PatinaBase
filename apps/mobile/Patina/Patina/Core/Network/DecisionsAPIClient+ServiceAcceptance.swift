//
//  DecisionsAPIClient+ServiceAcceptance.swift
//  Patina
//
//  US-52 WP-10C-d. C4 service acceptance on the phone: a homeowner reads the
//  requests her studio sent and, where she is a required signer, answers one
//  with an authenticated click-through.
//
//   • `get_my_service_acceptance_requests()` (00886:1243) — every SENT request
//     on which the caller is an active signer or the project's client, with a
//     `viewerRole` saying which. Definer, granted to `authenticated`.
//   • `respond_service_acceptance(...)` (00886:789) — the answer. CAS on the
//     presented scope hash, evidence hash and signer-policy revision; replay
//     by `client_request_id`. Shipped revoked (C4 §2.8): until the reviewed
//     activation migration grants it, every call is `permission denied`,
//     which the screen reads as "responses are paused".
//
//  This is a separate projection from the Stage-2 approvals in
//  `DecisionsAPIClient+ProjectApprovals.swift`, decoded into separate types.
//  Neither decoder ever receives the other's rows (C4 §2.10, X08).
//

import Foundation

// MARK: - Wire vocabularies

/// A string the server owns, decoded so that a value this build does not know
/// lands on an explicit `unknown` case instead of throwing. Every screen that
/// reads one of these treats `unknown` as read-only.
nonisolated protocol ServiceAcceptanceWireValue: RawRepresentable, Decodable, Sendable, Equatable
where RawValue == String {
    static var unknownValue: Self { get }
}

nonisolated extension ServiceAcceptanceWireValue {
    init(wire raw: String?) {
        self = raw.flatMap(Self.init(rawValue:)) ?? Self.unknownValue
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        self.init(wire: container.decodeNil() ? nil : try container.decode(String.self))
    }
}

/// Who the caller is to one service-acceptance request.
///
/// **Fail-closed, deliberately unlike the approvals decoder.**
/// `RemoteProjectApprovalReview.viewerAnswers`
/// (`DecisionsAPIClient+ProjectApprovals.swift:189-195`) reads an unknown role
/// as the caller's own, because dropping a homeowner's approval off her feeds
/// is the worse failure there. Here the worse failure is the opposite: an
/// unknown role offered the Accept / Return acts would put an answer on the
/// record for someone the server may not count, on a statement that the
/// studio delivered the agreed service. C4 §2.10 rules that, for this
/// projection only, an unknown `viewerRole` decodes as `.observer` — she can
/// read the request, she is not offered an act. The server refuses a
/// non-signer anyway; this keeps the phone from implying otherwise.
nonisolated enum ServiceAcceptanceViewerRole: String, ServiceAcceptanceWireValue {
    case signerRequired = "signer_required"
    case signerOptional = "signer_optional"
    case observer

    static var unknownValue: Self { .observer }
}

/// `service_acceptance_requests.lifecycle` (00886:77-78).
nonisolated enum ServiceAcceptanceLifecycle: String, ServiceAcceptanceWireValue {
    case draft, sent, withdrawn, superseded, closed
    case unknown

    static var unknownValue: Self { .unknown }
}

/// `service_acceptance_requests.aggregate_outcome` (00886:79-80), derived by
/// the server and never by a client.
nonisolated enum ServiceAcceptanceOutcome: String, ServiceAcceptanceWireValue {
    case pending, accepted, returned
    case acceptedWithConditions = "accepted_with_conditions"
    case unknown

    static var unknownValue: Self { .unknown }
}

/// One signer's recorded answer (`service_acceptance_responses.response`).
nonisolated enum ServiceAcceptanceResponseKind: String, ServiceAcceptanceWireValue {
    case accept
    case acceptWithConditions = "accept_with_conditions"
    case `return`
    case unknown

    static var unknownValue: Self { .unknown }
}

/// How an answer reached the record. Paper counts only after studio review.
nonisolated enum ServiceAcceptanceMethod: String, ServiceAcceptanceWireValue {
    case portalAuthenticated = "portal_authenticated"
    case iosAuthenticated = "ios_authenticated"
    case paperIntake = "paper_intake"
    case unknown

    static var unknownValue: Self { .unknown }

    /// The one method this app records.
    static let thisApp = "ios_authenticated"
}

// MARK: - Projection

nonisolated struct RemoteServiceAcceptanceCondition: Decodable, Sendable, Equatable {
    let conditionId: String?
    let text: String
}

nonisolated struct RemoteServiceAcceptanceResponse: Decodable, Sendable, Equatable {
    let response: ServiceAcceptanceResponseKind
    let conditions: [RemoteServiceAcceptanceCondition]
    let returnReason: String?
    let method: ServiceAcceptanceMethod
    let respondedAt: String?

    private enum CodingKeys: String, CodingKey {
        case response, conditions, returnReason, method, respondedAt
    }

    init(from decoder: Decoder) throws {
        let keys = try decoder.container(keyedBy: CodingKeys.self)
        response = try keys.decodeIfPresent(ServiceAcceptanceResponseKind.self, forKey: .response) ?? .unknown
        conditions = try keys.decodeIfPresent([RemoteServiceAcceptanceCondition].self, forKey: .conditions) ?? []
        returnReason = try keys.decodeIfPresent(String.self, forKey: .returnReason)
        method = try keys.decodeIfPresent(ServiceAcceptanceMethod.self, forKey: .method) ?? .unknown
        respondedAt = try keys.decodeIfPresent(String.self, forKey: .respondedAt)
    }
}

nonisolated struct RemoteServiceAcceptanceSigner: Decodable, Sendable, Identifiable, Equatable {
    let signerId: String
    let slot: String
    let required: Bool
    /// Nil until this signer has answered.
    let response: RemoteServiceAcceptanceResponse?

    var id: String { signerId }
}

/// One request, as `get_my_service_acceptance_requests` serves it to a client
/// (`_service_acceptance_request_json(id, false)` plus the viewer keys).
nonisolated struct RemoteServiceAcceptanceRequest: Decodable, Sendable, Identifiable, Equatable {
    let requestId: String
    let projectId: String
    let requestNumber: Int
    let scopeEditionId: String
    /// Presented back to `respond_service_acceptance` exactly as read.
    let scopeContentHash: String
    /// Presented back exactly as read.
    let evidenceManifestHash: String
    let lifecycle: ServiceAcceptanceLifecycle
    let aggregateOutcome: ServiceAcceptanceOutcome
    let closedAt: String?
    /// Presented back exactly as read; a replacement since the read is
    /// `stale_signer_policy`.
    let signerPolicyRevision: Int
    let sentAt: String?
    let signers: [RemoteServiceAcceptanceSigner]
    let viewerRole: ServiceAcceptanceViewerRole
    let viewerSignerId: String?

    var id: String { requestId }

    private enum CodingKeys: String, CodingKey {
        case requestId, projectId, requestNumber, scopeEditionId, scopeContentHash
        case evidenceManifestHash, lifecycle, aggregateOutcome, closedAt
        case signerPolicyRevision, sentAt, signers, viewerRole, viewerSignerId
    }

    init(from decoder: Decoder) throws {
        let keys = try decoder.container(keyedBy: CodingKeys.self)
        requestId = try keys.decode(String.self, forKey: .requestId)
        projectId = try keys.decode(String.self, forKey: .projectId)
        requestNumber = try keys.decode(Int.self, forKey: .requestNumber)
        scopeEditionId = try keys.decode(String.self, forKey: .scopeEditionId)
        scopeContentHash = try keys.decode(String.self, forKey: .scopeContentHash)
        evidenceManifestHash = try keys.decode(String.self, forKey: .evidenceManifestHash)
        lifecycle = try keys.decodeIfPresent(ServiceAcceptanceLifecycle.self, forKey: .lifecycle) ?? .unknown
        aggregateOutcome = try keys.decodeIfPresent(ServiceAcceptanceOutcome.self, forKey: .aggregateOutcome) ?? .unknown
        closedAt = try keys.decodeIfPresent(String.self, forKey: .closedAt)
        signerPolicyRevision = try keys.decode(Int.self, forKey: .signerPolicyRevision)
        sentAt = try keys.decodeIfPresent(String.self, forKey: .sentAt)
        signers = try keys.decodeIfPresent([RemoteServiceAcceptanceSigner].self, forKey: .signers) ?? []
        // Absent is unknown, and unknown is observer.
        viewerRole = try keys.decodeIfPresent(ServiceAcceptanceViewerRole.self, forKey: .viewerRole) ?? .observer
        viewerSignerId = try keys.decodeIfPresent(String.self, forKey: .viewerSignerId)
    }

    /// The caller's own answer, when she is a signer and has given one.
    var viewerResponse: RemoteServiceAcceptanceResponse? {
        guard let viewerSignerId else { return nil }
        return signers.first { $0.signerId == viewerSignerId }?.response
    }

    /// Still in front of its signers: sent, and no outcome derived yet.
    var isOpen: Bool { lifecycle == .sent && aggregateOutcome == .pending }

    /// The three acts are offered only to a required signer, on an open
    /// request, who has not answered. Every unknown value fails this.
    var canRespond: Bool {
        viewerRole == .signerRequired && viewerSignerId != nil && isOpen && viewerResponse == nil
    }
}

// MARK: - Response

/// The answer a required signer gives. Conditions and a return reason are
/// trimmed here so the body the server hashes is the body she saw.
nonisolated enum ServiceAcceptanceAnswer: Equatable, Sendable {
    case accept
    case acceptWithConditions([String])
    case returned(reason: String)

    var wireResponse: String {
        switch self {
        case .accept: return ServiceAcceptanceResponseKind.accept.rawValue
        case .acceptWithConditions: return ServiceAcceptanceResponseKind.acceptWithConditions.rawValue
        case .returned: return ServiceAcceptanceResponseKind.return.rawValue
        }
    }

    var conditionTexts: [String] {
        guard case .acceptWithConditions(let list) = self else { return [] }
        return list.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    }

    var returnReason: String? {
        guard case .returned(let reason) = self else { return nil }
        let trimmed = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// Conditions need at least one line; a return needs its reason.
    var isComplete: Bool {
        switch self {
        case .accept: return true
        case .acceptWithConditions: return !conditionTexts.isEmpty
        case .returned: return returnReason != nil
        }
    }
}

/// One response, bound to the request exactly as it was presented.
///
/// `clientRequestId` is minted once, when the answer is first submitted, and
/// a retry re-sends this same value: the server replays its receipt for the
/// same key and body rather than recording a second answer.
nonisolated struct ServiceAcceptanceSubmission: Equatable, Sendable {
    let requestId: String
    let scopeContentHash: String
    let evidenceManifestHash: String
    let signerPolicyRevision: Int
    let answer: ServiceAcceptanceAnswer
    let clientRequestId: String

    init(request: RemoteServiceAcceptanceRequest, answer: ServiceAcceptanceAnswer,
         clientRequestId: String = UUID().uuidString.lowercased()) {
        self.requestId = request.requestId
        self.scopeContentHash = request.scopeContentHash
        self.evidenceManifestHash = request.evidenceManifestHash
        self.signerPolicyRevision = request.signerPolicyRevision
        self.answer = answer
        self.clientRequestId = clientRequestId
    }

    /// The body `respond_service_acceptance` takes, parameter for parameter.
    var rpcBody: [String: Any] {
        [
            "p_request_id": requestId,
            "p_response": answer.wireResponse,
            "p_conditions": answer.conditionTexts.map { ["text": $0] },
            "p_return_reason": answer.returnReason ?? NSNull(),
            "p_scope_content_hash": scopeContentHash,
            "p_evidence_manifest_hash": evidenceManifestHash,
            "p_signer_policy_revision": signerPolicyRevision,
            "p_client_request_id": clientRequestId,
            "p_method": ServiceAcceptanceMethod.thisApp
        ]
    }
}

/// Why the server turned a response away, in the terms the screen acts on.
nonisolated enum ServiceAcceptanceRefusal: Equatable, Sendable {
    /// `stale_scope` / `stale_signer_policy`: what she read has moved. Reload.
    case stale
    /// `already_responded`: her answer is on the record.
    case alreadyResponded
    /// `request_not_open`: the request reached a final state. Reload to show it.
    case requestNotOpen
    /// The respond RPC is not granted (C4 §2.8 deactivation) or scope editions
    /// are switched off. Nothing she has seen is lost.
    case paused
    /// She is no longer an active signer on this request.
    case notYours
    /// Anything else, including the network. A retry keeps the same key.
    case failed

    init(error: Error) {
        guard case RoomsAPIError.http(let status, let body) = error else {
            self = .failed
            return
        }
        self.init(status: status, body: body)
    }

    init(status: Int, body: String) {
        let payload = (try? JSONSerialization.jsonObject(with: Data(body.utf8))) as? [String: Any]
        let code = payload?["code"] as? String
        let message = (payload?["message"] as? String ?? "").lowercased()
        switch message {
        case "stale_scope", "stale_signer_policy":
            self = .stale
        case "already_responded":
            self = .alreadyResponded
        case "request_not_open":
            self = .requestNotOpen
        case "scope_editions_inactive":
            self = .paused
        case "insufficient_privilege", "signer_not_active":
            self = .notYours
        default:
            // An ungranted function is PostgREST's 42501 "permission denied
            // for function respond_service_acceptance" — the shipped-inactive
            // state, not a fault.
            if code == "42501" || message.hasPrefix("permission denied") {
                self = .paused
            } else {
                self = .failed
            }
        }
    }
}

// MARK: - Calls

extension DecisionsAPIClient {

    /// Every sent service-acceptance request this caller can read. `[]` for a
    /// caller with none.
    func fetchMyServiceAcceptanceRequests() async throws -> [RemoteServiceAcceptanceRequest] {
        let data = try await callRPC("get_my_service_acceptance_requests", body: [String: Any]())
        let payload = String(data: data, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard let payload, !payload.isEmpty, payload != "null" else { return [] }
        return try JSONDecoder().decode([RemoteServiceAcceptanceRequest].self, from: data)
    }

    /// Record one answer with method `ios_authenticated`. Throws the raw
    /// error; `ServiceAcceptanceRefusal(error:)` reads it.
    func respondToServiceAcceptance(_ submission: ServiceAcceptanceSubmission) async throws {
        _ = try await callRPC("respond_service_acceptance", body: submission.rpcBody)
    }
}

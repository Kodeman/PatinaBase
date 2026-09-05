//
//  DecisionsAPIClient+ProjectApprovals.swift
//  Patina
//
//  `P-09`. The Stage-2 half of the decision rail: a `client_decisions` row
//  carrying `approval_contract = 'project_artifact_v1'` is an APPROVAL of one
//  frozen edition of a document, not a choice between options.
//
//  It is read and written through its own RPCs, never through PostgREST on
//  `client_decisions` — the row itself carries none of the artifact, the
//  impacts or the review state:
//
//   • `list_my_project_decision_reviews()` (00467:135) — the caller-global,
//     client-safe list. The studio-scoped `get_project_decision_reviews`
//     raises `insufficient_privilege` for a homeowner; this one fans out over
//     it as definer and filters each project to the frozen decision lead.
//     Its per-row projection is built in 00465:370 and is the same camelCase
//     shape `packages/supabase/src/hooks/use-project-approvals.ts` parses.
//   • `confirm_project_decision_review` (00463:1467) — the review leg. CAS on
//     the authority revision AND the artifact hash, and only while the
//     decision is still `draft`.
//   • `respond_project_approval` (00464:811) — the outcome. CAS on
//     `updated_at`, and only from `pending`, published, with the lead's review
//     confirmation already recorded.
//
//  This lives beside `DecisionsAPIClient.swift` rather than in it because that
//  file is at SwiftLint's 500-line `file_length` warning. `callRPC` is the one
//  internal seam it reaches back through: the actor's session, base URL and
//  headers stay private, which `NetworkRecoveryTests` pins.
//

import Foundation

/// The three answers a Stage-2 approval can carry. The raw values are the
/// server's own (`client_decision_options.approval_outcome`, checked by
/// `_respond_project_approval_checked`), so they are load-bearing.
public enum ProjectApprovalOutcome: String, Codable, Sendable, CaseIterable {
    case approved
    case changesRequested = "changes_requested"
    case needsDiscussion = "needs_discussion"
}

/// One Stage-2 approval, as the client-safe projection returns it.
///
/// Every field is the RPC's own key — the projection is already camelCase, so
/// unlike every other model in this file's neighbour there is no PostgREST
/// aliasing to keep in step. Fields this screen does not draw (`phaseId`,
/// `sectionKey`, the predecessor/successor pair) are simply not decoded;
/// `JSONDecoder` ignores what it is not asked for.
public struct RemoteProjectApprovalReview: Codable, Sendable, Identifiable {
    public let decisionId: String
    public let projectId: String
    public let artifactId: String
    public let artifactVersion: Int
    public let artifactChecksum: String
    public let artifactTitle: String
    public let question: String
    /// The designer's framing of the ask. Nullable in the artifact table.
    public let context: String?
    public let dueAt: String?
    public let costCentsDelta: Int
    public let scheduleDaysDelta: Int
    public let leadTimeDaysDelta: Int
    /// `client_decisions.status` — `draft | pending | responded | expired`.
    public let lifecycleStatus: String
    /// Nil until an outcome is recorded.
    public let outcome: String?
    /// `active | withdrawn | superseded`.
    public let disposition: String
    public let completedReviewCount: Int
    public let requiredReviewCount: Int
    /// The frozen CAS value `confirm_project_decision_review` demands. Nil
    /// where the snapshot did not supply one — the review act is then not
    /// offered rather than guessed at.
    public let authorityRevision: Int?
    public let createdAt: String
    public let respondedAt: String?
    /// The CAS value `respond_project_approval` demands, echoed back verbatim.
    public let updatedAt: String

    public var id: String { decisionId }

    /// The recorded answer, where the server has one and the app knows the word.
    public var recordedOutcome: ProjectApprovalOutcome? {
        guard let outcome else { return nil }
        return ProjectApprovalOutcome(rawValue: outcome)
    }

    /// Every reviewer the frozen snapshot requires has confirmed this exact
    /// edition. Counted, not drawn — the numbers never reach the screen (R5).
    public var isReviewComplete: Bool {
        completedReviewCount >= requiredReviewCount
    }

    /// The review act exists for this row and has not been given.
    ///
    /// `draft` is the only status `confirm_project_decision_review` accepts,
    /// and it refuses a payload without the frozen revision — so an approval
    /// whose snapshot carried none is not offered an act the server refuses.
    public var needsReviewConfirmation: Bool {
        lifecycleStatus == "draft" && !isReviewComplete && authorityRevision != nil
    }

    /// The review is required, and cannot be given: the frozen revision is
    /// missing. The screen says so rather than drawing a dead act.
    public var reviewConfirmationUnavailable: Bool {
        lifecycleStatus == "draft" && !isReviewComplete && authorityRevision == nil
    }

    /// The review landed and the approval is now with the studio to issue.
    public var isAwaitingStudioIssue: Bool {
        lifecycleStatus == "draft" && isReviewComplete
    }

    /// An outcome can be recorded — the four legs `_respond_project_approval
    /// _checked` applies, minus the ones only the server can see.
    public var canRespond: Bool {
        lifecycleStatus == "pending"
            && disposition == "active"
            && isReviewComplete
            && outcome == nil
    }
}

extension DecisionsAPIClient {

    /// Every Stage-2 approval this client is the frozen lead for, across
    /// projects. `[]` where there are none — the RPC never reveals whether an
    /// unauthorized decision exists.
    public func listProjectApprovalReviews() async throws -> [RemoteProjectApprovalReview] {
        let data = try await callRPC("list_my_project_decision_reviews", body: [:])
        return try JSONDecoder().decode([RemoteProjectApprovalReview].self, from: data)
    }

    /// Record that this client read the exact edition, bound to the authority
    /// revision and the artifact hash she was shown.
    ///
    /// `reviewMethod` is `portal_clickthrough` and nothing else: the enum is
    /// checked in the RPC, and R1 keeps it for the review leg on every surface
    /// — the typed name and the press-and-hold belong to the outcome, not to
    /// the reading.
    public func confirmProjectApprovalReview(
        decisionId: String,
        authorityRevision: Int,
        artifactChecksum: String,
        idempotencyKey: String
    ) async throws {
        _ = try await callRPC("confirm_project_decision_review", body: [
            "p_decision_id": decisionId,
            "p_payload": [
                "authorityRevision": authorityRevision,
                "artifactHash": artifactChecksum,
                "reviewMethod": "portal_clickthrough"
            ],
            "p_idempotency_key": idempotencyKey
        ])
    }

    /// Record one of the three canonical outcomes against the edition the
    /// client was reading. `expectedUpdatedAt` is the row's own `updatedAt`,
    /// echoed back: the RPC answers `serialization_failure` if the approval
    /// moved while the screen was open.
    public func respondToProjectApproval(
        decisionId: String,
        outcome: ProjectApprovalOutcome,
        expectedUpdatedAt: String,
        idempotencyKey: String
    ) async throws {
        _ = try await callRPC("respond_project_approval", body: [
            "p_decision_id": decisionId,
            "p_payload": ["outcome": outcome.rawValue],
            "p_expected_updated_at": expectedUpdatedAt,
            "p_idempotency_key": idempotencyKey
        ])
    }
}

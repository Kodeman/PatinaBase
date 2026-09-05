//
//  DecisionsAPIClient+ProjectApprovals.swift
//  Patina
//
//  `P-09`. The Stage-2 half of the decision rail: a `client_decisions` row
//  carrying `approval_contract = 'project_artifact_v1'` is an APPROVAL of one
//  frozen edition of a document, not a choice between options.
//
//  It is read and written through its own RPCs, and it MUST be — 00467:18-38
//  cut Stage-2 out of every raw `client_decisions` SELECT policy a homeowner
//  can reach, so a PostgREST read of the row returns nothing to the very
//  person being asked. The projection is the only door she has:
//
//   • `get_project_decision_review(p_decision_id)` (00467:101) — the exact
//     single-row read for a detail screen. Definer, granted to `authenticated`,
//     and NULL for a nonexistent, legacy or unauthorized id without saying
//     which. Its serialization is `get_project_decision_reviews`' own
//     (00465:370) — the same camelCase shape
//     `packages/supabase/src/hooks/use-project-approvals.ts` parses.
//   • `list_my_project_decision_reviews` (00467:135) — every approval this
//     caller can reach, for the feeds that carry what is waiting on her. The
//     detail screen still reads one row by id; this is what puts a door on the
//     home and in the decision list at all.
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
    /// `client_decisions.sent_at` — stamped by `publish_client_decision`
    /// (00464:998,1061) and by nothing else, so it is the one field that says
    /// whether the studio has actually issued this edition.
    public let sentAt: String?
    public let respondedAt: String?
    /// The CAS value `respond_project_approval` demands, echoed back verbatim.
    public let updatedAt: String

    public var id: String { decisionId }

    /// The recorded answer, where the server has one and the app knows the word.
    public var recordedOutcome: ProjectApprovalOutcome? {
        guard let outcome else { return nil }
        return ProjectApprovalOutcome(rawValue: outcome)
    }

    /// The studio pulled this approval back.
    public var isWithdrawn: Bool { disposition == "withdrawn" }

    /// A later edition took this one's place.
    public var isSuperseded: Bool { disposition == "superseded" }

    /// Neither open nor answered. The house's own precedence puts these two
    /// AHEAD of an outcome (`client-attention.ts:55-71`), so a superseded
    /// approval reads as superseded even when it also carries an answer.
    public var isClosedByDisposition: Bool { isWithdrawn || isSuperseded }

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
            && !isClosedByDisposition
    }

    /// The review is required, and cannot be given: the frozen revision is
    /// missing. The screen says so rather than drawing a dead act.
    public var reviewConfirmationUnavailable: Bool {
        lifecycleStatus == "draft" && !isReviewComplete && authorityRevision == nil
            && !isClosedByDisposition
    }

    /// The review landed and the approval is now with the studio to issue.
    public var isAwaitingStudioIssue: Bool {
        lifecycleStatus == "draft" && isReviewComplete && !isClosedByDisposition
    }

    /// An outcome can be recorded — the four legs `_respond_project_approval
    /// _checked` applies, minus the ones only the server can see.
    public var canRespond: Bool {
        lifecycleStatus == "pending"
            && disposition == "active"
            && isReviewComplete
            && outcome == nil
    }

    /// The ceremony still holds an act that is hers to take. Everything else —
    /// a draft with no frozen revision, one already with the studio, a closed
    /// or answered one — is waiting on somebody who is not her.
    public var awaitsClient: Bool {
        needsReviewConfirmation || canRespond
    }

    /// The studio has issued this edition. `sent_at` is stamped only by
    /// `publish_client_decision`, so an unsent row is the studio's own working
    /// copy — nothing has been asked of anybody yet.
    public var isPublished: Bool { sentAt != nil }

    /// `W1R2-M3`: the row a homeowner-facing feed may carry.
    ///
    /// `awaitsClient` alone let an UNSENT draft onto Today, the Studio hub and
    /// the bell, drawn as an ask with a due date — a question the studio had
    /// not asked yet, dated. A feed says what is waiting on her; an edition
    /// nobody has sent is not. The review leg on a draft is still reachable by
    /// its own route (the detail screen reads `get_project_decision_review`
    /// directly), which is where a pre-publish act belongs.
    public var awaitsClientInFeed: Bool { isPublished && awaitsClient }

    /// This approval as a row for the feeds that carry every waiting
    /// obligation: `BadgeCountService.pendingDecisions` (the NEEDS YOU
    /// eyebrow, the Studio's "Awaiting you") and the decision list.
    ///
    /// It has to be synthesized. Those feeds read `listPending`, a PostgREST
    /// GET on `client_decisions`, and 00467:18-38 rewrote both SELECT policies
    /// a homeowner can reach to `approval_contract IS DISTINCT FROM
    /// 'project_artifact_v1'` — so her own Stage-2 approvals are the one thing
    /// that read can never return, and without this bridge a push notification
    /// was her only door to the ceremony.
    ///
    /// `approval_contract` is carried verbatim so the detail screen knows
    /// which ceremony it is opening before the projection lands, and
    /// `lifecycleStatus` is carried unchanged rather than flattened to
    /// `pending` — `draft` and `pending` both read as unresolved downstream,
    /// so there is nothing to gain by saying the row is further along than it
    /// is.
    ///
    /// `W1R2-M2`: the projection carries no project name and no designer, and
    /// a row without one degraded R8's sentence to "Still open, your designer
    /// asked on Sep 4." on every Stage-2 row while the Record two screens away
    /// said "Leah asked for your approval." The name is not invented here — it
    /// is taken from the project the caller already holds, matched on the
    /// projection's own `projectId`, and stays nil when that project is not in
    /// hand.
    func asWaitingDecision(from projects: [RemoteProject] = []) -> RemoteClientDecision {
        let project = projects.first { $0.id == projectId }
        return RemoteClientDecision(
            id: decisionId,
            project_id: projectId,
            project: project.map {
                RemoteDecisionProjectRef(name: $0.name, designer: $0.designer)
            },
            title: question,
            description: context,
            status: lifecycleStatus,
            decision_type: nil,
            coordination_kind: nil,
            court: nil,
            approval_contract: "project_artifact_v1",
            recommended_option_id: nil,
            viewed_at: nil,
            responded_at: respondedAt,
            due_date: dueAt,
            client_consent_method: nil,
            client_consented_at: nil,
            created_at: createdAt
        )
    }
}

extension DecisionsAPIClient {

    /// This Stage-2 approval, or nil.
    ///
    /// Nil covers three things the RPC deliberately does not distinguish: no
    /// such decision, a legacy (non-Stage-2) one, and one this caller is not
    /// the frozen lead or a studio co-member for.
    public func fetchProjectApprovalReview(
        decisionId: String
    ) async throws -> RemoteProjectApprovalReview? {
        let data = try await callRPC(
            "get_project_decision_review", body: ["p_decision_id": decisionId]
        )
        // The RPC returns `jsonb`, so an unauthorized or nonexistent id comes
        // back as the four bytes `null` — not as an empty list.
        let payload = String(data: data, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard let payload, !payload.isEmpty, payload != "null" else { return nil }
        return try JSONDecoder().decode(RemoteProjectApprovalReview.self, from: data)
    }

    /// Every Stage-2 approval this caller can reach, across all her projects.
    ///
    /// `list_my_project_decision_reviews()` (00467:135) takes no arguments and
    /// answers `[]` for an unauthenticated caller. It is the only read that
    /// hands a homeowner her own approvals at all — see `asWaitingDecision`
    /// for why the list feeds cannot find them any other way.
    public func fetchProjectApprovalReviews() async throws -> [RemoteProjectApprovalReview] {
        let data = try await callRPC(
            "list_my_project_decision_reviews", body: [String: Any]()
        )
        let payload = String(data: data, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard let payload, !payload.isEmpty, payload != "null" else { return [] }
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

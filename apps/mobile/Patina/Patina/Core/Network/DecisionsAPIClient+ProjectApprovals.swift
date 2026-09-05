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

/// What the caller is to one Stage-2 approval.
///
/// 00467 admits two readers and the projection names which one this is. The
/// spellings are normalised rather than matched byte-for-byte — the field is a
/// Wave 2 migration this lane does not own, and a snake-cased, hyphenated or
/// camel-cased variant of the same word must not change what a homeowner sees.
public enum ProjectApprovalViewerRole: Sendable, Equatable {
    /// The frozen decision lead. The ask is hers.
    case answers
    /// A studio co-member reading her own client app. She can see it; she is
    /// not the one being asked.
    case observes
    /// The projection said nothing, or said something this build does not know.
    case unspecified

    /// Roles that ANSWER. Checked first, so a compound naming both (a
    /// `client_lead`) reads as the answering one.
    static let answering: Set<String> = [
        "decisionlead", "lead", "client", "recipient", "owner", "clientlead"
    ]
    /// Roles that only WATCH.
    ///
    /// `household` is the projection's third real value (00569:884-888:
    /// `lead` → `studio` → `household`) and it WATCHES: the migration's own
    /// comment calls it "the project's client on a row whose frozen lead is
    /// somebody else", reachable after a lead reassignment. Only the frozen
    /// lead answers — `respond_project_approval` accepts nobody else — so a
    /// household reader who is not the lead may neither be asked nor be told
    /// she approved something the lead approved.
    static let observing: Set<String> = [
        "studiocomember", "comember", "studiomember", "studio", "designer",
        "teammate", "observer", "viewer", "watcher", "household"
    ]

    public init(raw: String?) {
        guard let raw else { self = .unspecified; return }
        let key = raw.lowercased().filter(\.isLetter)
        if key.isEmpty { self = .unspecified } else if Self.answering.contains(key) {
            self = .answers
        } else if Self.observing.contains(key) {
            self = .observes
        } else {
            self = .unspecified
        }
    }
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
    /// `project_approval_artifacts.source_kind` — `plan_issue`,
    /// `spec_book_artifact` or `budget_version` (00463:134-135), served as
    /// `artifactKind` (00569:865). Optional so a projection written before
    /// this key existed decodes rather than throwing; the copy that reads it
    /// falls back to the unnamed edition.
    public let artifactKind: String?
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
    /// Who this caller is to this approval, when the projection says.
    ///
    /// `W1R2-M3`'s remainder, ruled at the Wave 1 close: 00467 lets two people
    /// read a Stage-2 row — the frozen decision lead
    /// (`snapshot.decision_lead_id = p_actor`) and any studio co-member
    /// (`is_design_studio_comember(decision.designer_id)`) — and the projection
    /// carried nothing to tell them apart, so a designer reading her own client
    /// app saw her studio's approvals under NEEDS YOU. Wave 1 could only
    /// subtract the drafts; this field subtracts the rest.
    ///
    /// Absent on every projection written before the Wave 2 migration, which
    /// decodes as nil and behaves exactly as Wave 1 did.
    public let viewerRole: String?

    public var id: String { decisionId }

    /// The recorded answer, where the server has one and the app knows the word.
    public var recordedOutcome: ProjectApprovalOutcome? {
        guard let outcome else { return nil }
        return ProjectApprovalOutcome(rawValue: outcome)
    }

    /// Whether this caller is the one the approval is asked OF.
    ///
    /// Default-INCLUDE, deliberately: a role the app does not recognise reads
    /// as hers. Excluding an unknown spelling would silently drop a
    /// homeowner's own obligations off every feed she has, which is a far
    /// worse failure than the one this field exists to fix.
    public var viewerAnswers: Bool { ProjectApprovalViewerRole(raw: viewerRole) != .observes }

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

    /// The reading leg, and only it: the studio froze an edition that requires
    /// her review and has not issued it yet.
    ///
    /// `needsReviewConfirmation` is the whole of what an unpublished row can
    /// hold — `canRespond` demands `pending`, and `publish_client_decision`
    /// sets `status = 'pending'` and `sent_at` in one statement (00464:998,
    /// 1061), so a `pending` row is always sent and a `draft` one never is.
    public var awaitsReadingOnly: Bool { !isPublished && needsReviewConfirmation }

    /// What a homeowner-facing feed carries: an act of hers on an edition the
    /// studio has actually ISSUED.
    ///
    /// `W1R2-M3`, as ruled at the Wave 1 close (`rulings-2026-09-04.md`,
    /// "Studio co-member in the client app"): drafts are excluded from every
    /// homeowner-facing merge. An unsent row is the studio's own working copy
    /// — nothing has been asked of anybody yet — and 00467's projection
    /// carries no viewer role, so a studio co-member reading her own client
    /// app was being shown editions her studio had not issued.
    ///
    /// The cost is recorded rather than argued away: because
    /// `awaitsReadingOnly` and `!isPublished` are the same set, this
    /// subtracts exactly the review-confirmation leg, and
    /// `AppRoute.decisionDetail` is pushed from a feed row and nowhere else.
    /// P-09's review confirmation is therefore WEB-ONLY for Wave 1; the
    /// viewer-role field that would let the phone carry it is a Wave 2
    /// migration item.
    ///
    /// Wave 2 adds `viewerRole` beside it: a row this caller does not ANSWER
    /// never reaches a homeowner-facing feed at all, drafts or not.
    public var awaitsClientInFeed: Bool { awaitsClient && isPublished && viewerAnswers }

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
            // `W1R2-M3`: an edition the studio has not issued carries no date
            // it may state to her. `dueAt` on a draft is the studio's own
            // plan for an ask it has not made, and Today drew it as the
            // deadline of a question nobody had asked. The row stays — the
            // reading is hers, and it is her only door to it — with the
            // invented deadline off it.
            due_date: awaitsReadingOnly ? nil : dueAt,
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

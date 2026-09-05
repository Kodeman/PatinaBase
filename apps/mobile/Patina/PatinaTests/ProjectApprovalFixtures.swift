//
//  ProjectApprovalFixtures.swift
//  PatinaTests
//
//  `P-09`. One Stage-2 approval, in the shapes the two suites read it in.
//  Decoded from the RPCs' own JSON rather than constructed, so the fixtures
//  also pin that the projection's key names are what the app asks for.
//

import Foundation
@testable import Patina

enum ProjectApprovalFixture {

    /// The one decision every fixture below is about.
    static let decisionId = "a0000000-0000-0000-0000-0000000009e1"

    // MARK: - The wire shape

    /// Decoded from the RPC's own JSON rather than constructed, so this pins
    /// that the projection's key names are what the app asks for. The shape is
    /// `get_project_decision_reviews`' `jsonb_build_object` (00465:370).
    static func review(
        lifecycleStatus: String = "pending",
        outcome: Any = NSNull(),
        disposition: String = "active",
        completed: Int = 1,
        required: Int = 1,
        authorityRevision: Any = 3,
        sentAt: Any = "2026-09-02T00:00:00+00:00",
        respondedAt: Any = NSNull(),
        updatedAt: String = "2026-09-04T10:15:00+00:00",
        costCentsDelta: Int = 0,
        scheduleDaysDelta: Int = 0,
        leadTimeDaysDelta: Int = 0,
        context: Any = "Leah asked the mill to hold the walnut.",
        /// Absent by default — that is the projection every build before the
        /// Wave 2 migration returns.
        viewerRole: Any = NSNull()
    ) throws -> RemoteProjectApprovalReview {
        let row: [String: Any] = [
            "decisionId": decisionId,
            "projectId": "b0000000-0000-0000-0000-0000000000b1",
            "phaseId": "c0000000-0000-0000-0000-0000000000c1",
            "sectionKey": NSNull(),
            "authorityRevision": authorityRevision,
            "artifactKind": "spec_book_artifact",
            "artifactId": "d0000000-0000-0000-0000-0000000000d1",
            "artifactVersion": 3,
            "artifactChecksum": String(repeating: "a", count: 64),
            "artifactTitle": "Kitchen millwork spec",
            "question": "Approve the kitchen millwork as drawn?",
            "context": context,
            "dueAt": "2026-09-11T00:00:00+00:00",
            "costCentsDelta": costCentsDelta,
            "scheduleDaysDelta": scheduleDaysDelta,
            "leadTimeDaysDelta": leadTimeDaysDelta,
            "lifecycleStatus": lifecycleStatus,
            "outcome": outcome,
            "disposition": disposition,
            "isOverdue": false,
            "completedReviewCount": completed,
            "requiredReviewCount": required,
            "predecessorDecisionId": NSNull(),
            "successorDecisionId": NSNull(),
            "createdAt": "2026-09-01T00:00:00+00:00",
            "sentAt": sentAt,
            "respondedAt": respondedAt,
            "updatedAt": updatedAt,
            "viewerRole": viewerRole
        ]
        return try JSONDecoder().decode(
            RemoteProjectApprovalReview.self,
            from: try JSONSerialization.data(withJSONObject: row)
        )
    }

    /// `id` defaults to the one decision above; pass another where a test
    /// needs a SECOND row, since the merge that feeds NEEDS YOU carries one
    /// obligation once (`ProjectApprovalDoorTests`).
    static func decision(
        contract: String? = "project_artifact_v1",
        status: String = "pending",
        id: String = decisionId
    ) throws -> RemoteClientDecision {
        var row: [String: Any] = [
            "id": id,
            "title": "Kitchen millwork",
            "description": "Leah asked the mill to hold the walnut.",
            "status": status,
            "decision_type": "approval",
            "coordination_kind": "signoff",
            "court": "client",
            "created_at": "2026-09-01T00:00:00Z"
        ]
        if let contract { row["approval_contract"] = contract }
        return try JSONDecoder().decode(
            RemoteClientDecision.self,
            from: try JSONSerialization.data(withJSONObject: row)
        )
    }

    static func option() throws -> RemoteDecisionOption {
        let row: [String: Any] = [
            "id": "e0000000-0000-0000-0000-0000000000e1",
            "decision_id": decisionId,
            "title": "Approved"
        ]
        return try JSONDecoder().decode(
            RemoteDecisionOption.self,
            from: try JSONSerialization.data(withJSONObject: row)
        )
    }
}

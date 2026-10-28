//
//  ServiceAcceptanceDecodeTests.swift
//  PatinaTests
//
//  US-52 WP-10C-d. Pins the `get_my_service_acceptance_requests` decoder:
//  fail-closed `viewerRole`, read-only unknowns, and the X08 split from the
//  Stage-2 approvals decoder.
//

import Testing
import Foundation
@testable import Patina

enum ServiceAcceptanceFixture {
    /// One client-shaped row, as `_service_acceptance_request_json(id, false)`
    /// plus `viewerRole` / `viewerSignerId` serve it (00886:651-688, :1243-1254).
    /// `signers` replaces the whole signers value (`"null"` for null); pass
    /// `omitSigners` to drop the key. `viewerSignerId` nil serves JSON null.
    static func row(
        viewerRole: String? = "signer_required",
        lifecycle: String = "sent",
        aggregateOutcome: String = "pending",
        viewerResponse: String? = nil,
        method: String = "portal_authenticated",
        requestId: String = "req-1",
        scopeContentHash: String = "sha-scope-1",
        signers: String? = nil,
        omitSigners: Bool = false,
        viewerSignerId: String? = "s-me"
    ) -> String {
        let role = viewerRole.map { "\"viewerRole\": \"\($0)\"," } ?? ""
        let response = viewerResponse.map {
            """
            {"response": "\($0)", "conditions": [], "returnReason": null,
             "method": "\(method)", "respondedAt": "2026-10-27T10:00:00Z"}
            """
        } ?? "null"
        let signerList = signers ?? """
        [
            {"signerId": "s-me", "slot": "client", "required": true, "response": \(response)},
            {"signerId": "s-partner", "slot": "household_partner", "required": false, "response": null}
          ]
        """
        let signerKey = omitSigners ? "" : "\"signers\": \(signerList),"
        let viewer = viewerSignerId.map { "\"\($0)\"" } ?? "null"
        return """
        {
          "requestId": "\(requestId)", "projectId": "proj-1", "requestNumber": 2,
          "scopeEditionId": "ed-1", "scopeContentHash": "\(scopeContentHash)",
          "evidenceManifestHash": "sha-evidence-1", "lifecycle": "\(lifecycle)",
          "aggregateOutcome": "\(aggregateOutcome)", "closedAt": null,
          "signerPolicyRevision": 3, "sentAt": "2026-10-26T09:00:00Z",
          \(signerKey)
          \(role)
          "viewerSignerId": \(viewer)
        }
        """
    }

    static func request(_ json: String) throws -> RemoteServiceAcceptanceRequest {
        try JSONDecoder().decode(RemoteServiceAcceptanceRequest.self, from: Data(json.utf8))
    }

    /// A Stage-2 approval row, as `list_my_project_decision_reviews` serves it.
    static let approvalRow = """
    {
      "decisionId": "dec-1", "projectId": "proj-1", "artifactId": "art-1",
      "artifactVersion": 1, "artifactChecksum": "sha-art", "artifactTitle": "Plan",
      "question": "Approve the plan?", "context": null, "dueAt": null,
      "costCentsDelta": 0, "scheduleDaysDelta": 0, "leadTimeDaysDelta": 0,
      "lifecycleStatus": "pending", "outcome": null, "disposition": "active",
      "completedReviewCount": 1, "requiredReviewCount": 1, "authorityRevision": 1,
      "createdAt": "2026-10-20T00:00:00Z", "sentAt": "2026-10-21T00:00:00Z",
      "respondedAt": null, "updatedAt": "2026-10-21T00:00:00Z", "viewerRole": "lead"
    }
    """
}

@MainActor
struct ServiceAcceptanceDecodeTests {

    // MARK: - viewerRole fails closed

    @Test("an unknown viewerRole decodes as observer and is offered no act")
    func unknownViewerRoleIsObserver() throws {
        let request = try ServiceAcceptanceFixture.request(
            ServiceAcceptanceFixture.row(viewerRole: "signer_delegate")
        )
        #expect(request.viewerRole == .observer)
        #expect(request.canRespond == false)
        #expect(ServiceAcceptanceCopy.roleNote(request) != nil)
    }

    @Test("an absent viewerRole decodes as observer too")
    func absentViewerRoleIsObserver() throws {
        let request = try ServiceAcceptanceFixture.request(ServiceAcceptanceFixture.row(viewerRole: nil))
        #expect(request.viewerRole == .observer)
        #expect(request.canRespond == false)
    }

    @Test("the approvals decoder keeps its default-include reading of the same unknown role")
    func approvalsAsymmetryIsUnchanged() {
        // C4 §2.10: the asymmetry is deliberate. The approvals side still
        // reads an unknown role as hers; this projection does not.
        #expect(ProjectApprovalViewerRole(raw: "signer_delegate") == .unspecified)
        #expect(ServiceAcceptanceViewerRole(wire: "signer_delegate") == .observer)
    }

    @Test("the three known roles decode, and only a required signer may respond")
    func knownRoles() throws {
        let required = try ServiceAcceptanceFixture.request(ServiceAcceptanceFixture.row(viewerRole: "signer_required"))
        let optional = try ServiceAcceptanceFixture.request(ServiceAcceptanceFixture.row(viewerRole: "signer_optional"))
        let observer = try ServiceAcceptanceFixture.request(ServiceAcceptanceFixture.row(viewerRole: "observer"))
        #expect(required.viewerRole == .signerRequired)
        #expect(required.canRespond)
        #expect(required.scopeContentHash == "sha-scope-1")
        #expect(required.evidenceManifestHash == "sha-evidence-1")
        #expect(required.signerPolicyRevision == 3)
        #expect(optional.viewerRole == .signerOptional)
        #expect(optional.canRespond == false)
        #expect(observer.viewerRole == .observer)
        #expect(observer.canRespond == false)
    }

    @Test("a required signer who already answered is not offered the acts again")
    func answeredSignerReadsOnly() throws {
        let request = try ServiceAcceptanceFixture.request(
            ServiceAcceptanceFixture.row(viewerResponse: "accept", method: "ios_authenticated")
        )
        #expect(request.viewerResponse?.response == .accept)
        #expect(request.viewerResponse?.method == .iosAuthenticated)
        #expect(request.canRespond == false)
    }

    // MARK: - Unknown values render read-only

    @Test("unknown lifecycle, outcome, response and method decode to .unknown without throwing")
    func unknownsDecode() throws {
        let request = try ServiceAcceptanceFixture.request(
            ServiceAcceptanceFixture.row(
                lifecycle: "paused_by_studio", aggregateOutcome: "partially_accepted",
                viewerResponse: "accept_later", method: "kiosk"
            )
        )
        #expect(request.lifecycle == .unknown)
        #expect(request.aggregateOutcome == .unknown)
        #expect(request.viewerResponse?.response == .unknown)
        #expect(request.viewerResponse?.method == .unknown)
        #expect(request.canRespond == false)
        #expect(ServiceAcceptanceCopy.status(request) == ServiceAcceptanceCopy.readOnly)
    }

    @Test("an unknown outcome on a sent request is read-only for a required signer")
    func unknownOutcomeBlocksTheActs() throws {
        let request = try ServiceAcceptanceFixture.request(
            ServiceAcceptanceFixture.row(aggregateOutcome: "partially_accepted")
        )
        #expect(request.viewerRole == .signerRequired)
        #expect(request.canRespond == false)
    }

    @Test("a closed request reads its final state")
    func closedRequest() throws {
        let request = try ServiceAcceptanceFixture.request(
            ServiceAcceptanceFixture.row(lifecycle: "closed", aggregateOutcome: "returned", viewerResponse: "return")
        )
        #expect(request.isOpen == false)
        #expect(request.canRespond == false)
        #expect(ServiceAcceptanceCopy.status(request) == "Returned to your studio.")
    }

    // MARK: - X08: the two decoders never cross

    @Test("X08: each list decodes only its own rows; a cross-fed row throws rather than appearing")
    func mixedRecordsStayApart() throws {
        let serviceList = "[\(ServiceAcceptanceFixture.row())]"
        let approvalList = "[\(ServiceAcceptanceFixture.approvalRow)]"
        let decoder = JSONDecoder()

        let approvals = try decoder.decode([RemoteProjectApprovalReview].self, from: Data(approvalList.utf8))
        let services = try decoder.decode([RemoteServiceAcceptanceRequest].self, from: Data(serviceList.utf8))
        #expect(approvals.map(\.decisionId) == ["dec-1"])
        #expect(services.map(\.requestId) == ["req-1"])

        #expect(throws: DecodingError.self) {
            _ = try decoder.decode([RemoteProjectApprovalReview].self, from: Data(serviceList.utf8))
        }
        #expect(throws: DecodingError.self) {
            _ = try decoder.decode([RemoteServiceAcceptanceRequest].self, from: Data(approvalList.utf8))
        }
    }

    @Test("a recorded response reads back its server-minted {conditionId, text} conditions")
    func recordedConditionsDecode() throws {
        let row = ServiceAcceptanceFixture.row(viewerResponse: "accept_with_conditions").replacingOccurrences(
            of: #""conditions": []"#,
            with: #""conditions": [{"conditionId": "c-1", "text": "Touch up the hall"}]"#
        )
        let request = try ServiceAcceptanceFixture.request(row)
        let response = try #require(request.viewerResponse)
        #expect(response.response == .acceptWithConditions)
        #expect(response.conditions.map(\.conditionId) == ["c-1"])
        #expect(response.conditions.map(\.text) == ["Touch up the hall"])
    }

    @Test("X08: the approvals path never reads the service projection, and the service path never reads approvals")
    func readsStayOnTheirOwnRPCs() throws {
        let approvalsClient = try SourcePin.readCode("Patina/Core/Network/DecisionsAPIClient+ProjectApprovals.swift")
        let listModel = try SourcePin.readCode("Patina/Features/Decisions/ViewModels/DecisionsListViewModel.swift")
        let serviceClient = try SourcePin.readCode("Patina/Core/Network/DecisionsAPIClient+ServiceAcceptance.swift")
        for source in [approvalsClient, listModel] {
            #expect(!source.contains("service_acceptance"))
            #expect(!source.contains("ServiceAcceptance"))
        }
        #expect(serviceClient.contains("\"get_my_service_acceptance_requests\""))
        #expect(!serviceClient.contains("list_my_project_decision_reviews"))
        #expect(!serviceClient.contains("RemoteProjectApprovalReview"))
    }
}

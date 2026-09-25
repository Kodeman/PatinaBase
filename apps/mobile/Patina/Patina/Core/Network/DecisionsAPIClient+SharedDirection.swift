//
//  DecisionsAPIClient+SharedDirection.swift
//  Patina
//
//  W1A-10 · CONTRACT-C §C.5, §C.3.2. The wire the offline shared direction
//  reads through: the typed edition RPCs NI-05 adds in 00670, and NI-06's
//  attachment signer. The single detail read moved here from
//  `get_project_decision_review`, whose NULL could not tell "gone", "never
//  yours" and "no longer yours" apart (NI-05 plan: "the Swift client's switch
//  to the new edition is inside W1A-10").
//
//  Every method hands back the raw body. Classification is
//  `SharedDirectionWire`'s, in one place, because only a decoded envelope may
//  ever purge anything.
//

import Foundation
import Supabase

/// One edition's proof of possession (§C.5): what the device holds, sent so
/// the server can say `revoked` to a caller who proves she read it.
nonisolated struct SharedDirectionHeldProof: Sendable, Equatable {
    let decisionId: String
    let heldAuthorityRevision: Int?
    let heldArtifactChecksum: String?
}

/// What `SharedDirectionStore` reads and acts through. `DecisionsAPIClient`
/// is the app's; a test injects its own and holds each answer until it
/// releases it.
nonisolated protocol SharedDirectionClient: Sendable {
    /// `get_project_decision_editions(p_held)`, 1…200 items.
    func projectDecisionEditions(held: [SharedDirectionHeldProof]) async throws -> Data
    /// `get_project_decision_edition`: the detail read and the pre-act check.
    func projectDecisionEdition(_ held: SharedDirectionHeldProof) async throws -> Data
    /// NI-06. The status and body of any answer; throws only on transport.
    func projectApprovalAttachments(decisionId: String) async throws -> (status: Int, body: Data)
    /// One signed URL, written to `destination`.
    func downloadAttachment(from url: URL, to destination: URL) async throws
    func confirmProjectApprovalReview(
        decisionId: String, authorityRevision: Int, artifactChecksum: String, idempotencyKey: String
    ) async throws
    func respondToProjectApproval(
        decisionId: String, outcome: ProjectApprovalOutcome, clientSignature: String,
        expectedUpdatedAt: String, idempotencyKey: String
    ) async throws
}

/// The download answered with something other than the file.
nonisolated struct SharedDirectionDownloadError: Error {
    let status: Int
}

extension DecisionsAPIClient: SharedDirectionClient {

    static let attachmentsFunctionPath = "/functions/v1/project-approval-attachments"

    func projectDecisionEditions(held: [SharedDirectionHeldProof]) async throws -> Data {
        try await callRPC("get_project_decision_editions", body: [
            "p_held": held.map { proof -> [String: Any] in
                [
                    "decisionId": proof.decisionId,
                    "heldAuthorityRevision": proof.heldAuthorityRevision ?? NSNull(),
                    "heldArtifactChecksum": proof.heldArtifactChecksum ?? NSNull()
                ]
            }
        ])
    }

    func projectDecisionEdition(_ held: SharedDirectionHeldProof) async throws -> Data {
        try await callRPC("get_project_decision_edition", body: [
            "p_decision_id": held.decisionId,
            "p_held_authority_revision": held.heldAuthorityRevision ?? NSNull(),
            "p_held_artifact_checksum": held.heldArtifactChecksum ?? NSNull()
        ])
    }

    /// `POST` with the caller's JWT: the signer re-checks authority as the
    /// caller on every request (§C.3.2 step 1).
    func projectApprovalAttachments(decisionId: String) async throws -> (status: Int, body: Data) {
        var request = URLRequest(
            url: APIConfiguration.apiURL.appendingPathComponent(Self.attachmentsFunctionPath)
        )
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(APIConfiguration.anonKey, forHTTPHeaderField: "apikey")
        request.timeoutInterval = APIConfiguration.requestTimeout
        if let token = try? await SupabaseClientManager.shared.client.auth.session.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: ["decisionId": decisionId])
        let (data, response) = try await PatinaURLSession.shared.patinaData(for: request)
        return ((response as? HTTPURLResponse)?.statusCode ?? 0, data)
    }

    /// A signed URL carries its own authority, so no header rides with it.
    func downloadAttachment(from url: URL, to destination: URL) async throws {
        let (temporary, response) = try await PatinaURLSession.shared.download(from: url)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else {
            try? FileManager.default.removeItem(at: temporary)
            throw SharedDirectionDownloadError(status: status)
        }
        try FileManager.default.moveItem(at: temporary, to: destination)
    }
}

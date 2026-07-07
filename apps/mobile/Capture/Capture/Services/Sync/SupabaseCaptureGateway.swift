//  SupabaseCaptureGateway.swift
//  Capture
//
//  Thin app-side wrapper over the authenticated supabase-swift client for the
//  field-capture backend (migrations 00234/00235): idempotent capture-media
//  uploads + the `commit_field_capture` / `route_field_capture` RPCs. Stateless —
//  LocalCaptureSyncService owns identity/paths and passes them in. supabase-swift
//  lives ONLY app-side; CaptureKit stays SDK-free.
//
//  Wire-key discipline: the PostgREST encoder applies no key strategy, so the
//  `p_*` argument names and the nested FieldCapturePayload's camelCase keys are
//  emitted verbatim — matching migration 00235's jsonb reader exactly.

import Foundation
import Supabase
import CaptureKit

/// Project-routing + org context shared by commit/route (00235 args).
struct CaptureRoutingContext {
    var projectID: UUID?
    var projectRoomID: UUID?
    var shelf: String?
    var organizationID: UUID?

    init(projectID: UUID? = nil, projectRoomID: UUID? = nil,
         shelf: String? = nil, organizationID: UUID? = nil) {
        self.projectID = projectID
        self.projectRoomID = projectRoomID
        self.shelf = shelf
        self.organizationID = organizationID
    }
}

struct SupabaseCaptureGateway {
    let client: SupabaseClient
    let bucket: String

    /// Upsert an artifact to `<uid>/<clientToken>/<file>` in capture-media. Upsert
    /// makes replays idempotent (an offline retry overwrites the same object).
    func upload(_ data: Data, to path: String, contentType: String) async throws {
        try await client.storage
            .from(bucket)
            .upload(path, data: data,
                    options: FileOptions(contentType: contentType, upsert: true))
    }

    /// `commit_field_capture` — idempotent on `p_client_capture_id`.
    func commit(clientCaptureID: UUID,
                destination: String,
                payload: FieldCapturePayload,
                routing: CaptureRoutingContext) async throws -> CaptureCommitResult {
        let params = CommitFieldCaptureParams(
            clientCaptureID: clientCaptureID, destination: destination, payload: payload,
            projectID: routing.projectID, projectRoomID: routing.projectRoomID,
            shelf: routing.shelf, organizationID: routing.organizationID)
        return try await client.rpc("commit_field_capture", params: params).execute().value
    }

    /// `route_field_capture` — promote an already-committed inbox capture. (The
    /// capture's stored org is reused server-side, so no organizationID here.)
    func route(captureID: UUID,
               routing: CaptureRoutingContext) async throws -> CaptureCommitResult {
        let params = RouteFieldCaptureParams(
            captureID: captureID, projectID: routing.projectID,
            projectRoomID: routing.projectRoomID, shelf: routing.shelf)
        return try await client.rpc("route_field_capture", params: params).execute().value
    }
}

// MARK: - Wire envelopes (file-scope; keys = SQL argument / result names)

private struct CommitFieldCaptureParams: Encodable {
    let clientCaptureID: UUID
    let destination: String
    let payload: FieldCapturePayload
    let projectID: UUID?
    let projectRoomID: UUID?
    let shelf: String?
    let organizationID: UUID?
    enum CodingKeys: String, CodingKey {
        case clientCaptureID = "p_client_capture_id"
        case destination = "p_destination"
        case payload = "p_payload"
        case projectID = "p_project_id"
        case projectRoomID = "p_project_room_id"
        case shelf = "p_shelf"
        case organizationID = "p_organization_id"
    }
}

private struct RouteFieldCaptureParams: Encodable {
    let captureID: UUID
    let projectID: UUID?
    let projectRoomID: UUID?
    let shelf: String?
    enum CodingKeys: String, CodingKey {
        case captureID = "p_capture_id"
        case projectID = "p_project_id"
        case projectRoomID = "p_project_room_id"
        case shelf = "p_shelf"
    }
}

/// The JSONB envelope `commit_field_capture` / `route_field_capture` return.
struct CaptureCommitResult: Decodable, Sendable {
    let captureID: UUID?
    let productID: UUID?
    let status: String?
    let created: Bool?
    enum CodingKeys: String, CodingKey {
        case captureID = "capture_id"
        case productID = "product_id"
        case status
        case created
    }
}

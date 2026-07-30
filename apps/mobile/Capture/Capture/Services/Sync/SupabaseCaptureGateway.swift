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

struct SupabaseCaptureGateway: ProjectPlacementGateway {
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

    /// A response-loss-safe replay check. `captureId` is the specimen's stable
    /// client token, written into `project_ffe_specs.routing_source` by the
    /// placement RPC.
    func existingPlacement(
        for request: ProjectPlacementRequest
    ) async throws -> ProjectPlacementReceipt? {
        guard let routingKey = request.captureRoutingKey else { return nil }
        let rows: [ExistingPlacementRow] = try await client
            .from("project_ffe_specs")
            .select(
                "id, ffe_item_id, "
                    + "ffe_item:project_ffe_items!inner(project_id, project_room_id, product_id)"
            )
            .eq("routing_source->>captureId", value: routingKey)
            .eq("ffe_item.project_id", value: request.projectID)
            .eq("ffe_item.product_id", value: request.productID)
            .limit(1)
            .execute()
            .value
        guard let row = rows.first else { return nil }
        return ProjectPlacementReceipt(
            projectID: request.projectID,
            ffeItemID: row.ffeItemID,
            specID: row.id,
            productID: request.productID,
            roomID: row.ffeItem.projectRoomID,
            placement: request.slotID == nil ? "created_line" : "filled_slot"
        )
    }

    func placeProduct(
        _ request: ProjectPlacementRequest
    ) async throws -> ProjectPlacementReceipt {
        try await client
            .rpc("place_product_in_project", params: request)
            .execute()
            .value
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

private struct ExistingPlacementRow: Decodable {
    let id: UUID
    let ffeItemID: UUID
    let ffeItem: ExistingPlacementFFEItem

    enum CodingKeys: String, CodingKey {
        case id
        case ffeItemID = "ffe_item_id"
        case ffeItem = "ffe_item"
    }
}

private struct ExistingPlacementFFEItem: Decodable {
    let projectRoomID: UUID?

    enum CodingKeys: String, CodingKey {
        case projectRoomID = "project_room_id"
    }
}

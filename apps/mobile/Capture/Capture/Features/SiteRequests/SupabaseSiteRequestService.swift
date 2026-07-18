//  SupabaseSiteRequestService.swift
//  Capture
//
//  Authenticated designer RPC adapter + opaque-token guest Edge adapter. The
//  Supabase client carries only its normal anon/authenticated credentials.

import Foundation
import Supabase
import CaptureKit

struct SupabaseSiteRequestService: SiteRequestService, GuestSiteRequestService {
    let client: SupabaseClient
    let functionBaseURL: URL
    let anonKey: String

    init(deps: WorkServiceDependencies) {
        client = deps.client
        functionBaseURL = AppConfiguration.supabaseURL.appendingPathComponent("functions/v1")
        anonKey = AppConfiguration.supabaseAnonKey
    }

    func hub(projectID: String) async throws -> SiteProjectHub {
        async let project: ProjectNameRow = client.from("projects")
            .select("id,name")
            .eq("id", value: projectID)
            .single()
            .execute().value
        async let requests: [SiteRequestHubRow] = client.from("site_requests")
            .select("id,project_id,status,due_at,due_context,sent_at,opened_at,"
                + "assignee_name_snapshot,assignee_phone_snapshot,"
                + "items:site_request_items(id,status)")
            .eq("project_id", value: projectID)
            .order("created_at", ascending: false)
            .execute().value
        let (projectRow, requestRows) = try await (project, requests)
        return SiteProjectHub(
            projectID: projectID,
            projectName: projectRow.name,
            requests: requestRows.map(\.summary),
            reviewItems: [],
            rooms: [],
            events: []
        )
    }

    func createDraft(_ draft: SiteRequestDraft) async throws -> String {
        guard let partyID = draft.assignee.partyID else {
            throw SiteRequestRemoteError.assigneePartyRequired
        }
        let params = CreateDraftParams(
            projectID: draft.projectID,
            assigneePartyID: partyID,
            dueAt: WireDate.string(draft.dueAt),
            dueContext: draft.dueContext,
            note: draft.note,
            items: draft.items.map(DraftItemWire.init)
        )
        return try await client.rpc(SiteRequestContract.RPC.createDraft, params: params)
            .execute().value
    }

    func reviseItem(requestID _: String, itemID: String,
                    revision: SiteRequestDraftItem) async throws -> String {
        let params = ReviseItemParams(
            itemID: itemID,
            kitCode: revision.kit.rawValue,
            title: revision.title,
            guidance: revision.guidance,
            roomID: revision.roomID,
            configuration: EmptyConfiguration()
        )
        return try await client.rpc(SiteRequestContract.RPC.reviseItem, params: params)
            .execute().value
    }

    func send(requestID: String, expiresAt: Date) async throws {
        let _: SendResponse = try await designerDispatch(
            action: "send", requestID: requestID, expiresAt: expiresAt)
    }

    func resend(requestID: String, expiresAt: Date) async throws {
        let _: SendResponse = try await designerDispatch(
            action: "resend", requestID: requestID, expiresAt: expiresAt)
    }

    func approve(itemID: String, deliverableID: String, roomID: String?) async throws {
        let _: ApproveResponse = try await client.rpc(
            SiteRequestContract.RPC.approveItem,
            params: ApproveParams(itemID: itemID, deliverableID: deliverableID, roomID: roomID))
            .execute().value
    }

    func redo(itemID: String, note: String) async throws {
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw SiteRequestRemoteError.invalidResponse }
        let _: RedoResponse = try await client.rpc(
            SiteRequestContract.RPC.redoItem,
            params: RedoParams(itemID: itemID, note: note))
            .execute().value
    }

    func close(requestID: String) async throws {
        let _: CloseResponse = try await client.rpc(
            SiteRequestContract.RPC.close,
            params: RequestOnlyParams(requestID: requestID))
            .execute().value
    }

    func bootstrap(accessToken: String) async throws -> GuestSiteRequest {
        try await guestCall(function: SiteRequestContract.GuestFunction.bootstrap,
                            accessToken: accessToken, body: EmptyBody())
    }

    func createUploadIntent(accessToken: String,
                            request: SiteUploadIntentRequest) async throws -> SiteUploadIntent {
        try await guestCall(function: SiteRequestContract.GuestFunction.createUpload,
                            accessToken: accessToken, body: request)
    }

    func acknowledgeUpload(accessToken: String, uploadID: String,
                           checksumSHA256: String) async throws -> SiteUploadReceipt {
        try await guestCall(function: SiteRequestContract.GuestFunction.acknowledgeUpload,
                            accessToken: accessToken,
                            body: AcknowledgeUploadBody(uploadID: uploadID,
                                                        checksumSHA256: checksumSHA256))
    }

    func deliver(accessToken: String,
                 submission: SiteDeliverySubmission) async throws -> SiteDeliveryReceipt {
        try await guestCall(function: SiteRequestContract.GuestFunction.deliver,
                            accessToken: accessToken, body: submission)
    }

    private func guestCall<Body: Encodable, Response: Decodable>(
        function: String, accessToken: String, body: Body
    ) async throws -> Response {
        var request = URLRequest(url: functionBaseURL.appendingPathComponent(function))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw SiteRequestRemoteError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            throw SiteRequestRemoteError.rejected(
                status: http.statusCode,
                message: String(data: data, encoding: .utf8) ?? "Unknown error")
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(Response.self, from: data)
    }

    private func designerDispatch<Response: Decodable>(
        action: String, requestID: String, expiresAt: Date?
    ) async throws -> Response {
        let userAccessToken = try await client.auth.session.accessToken
        return try await edgeCall(
            function: SiteRequestContract.designerDispatchFunction,
            bearer: userAccessToken,
            body: DesignerDispatchBody(
                action: action,
                requestID: requestID,
                expiresAt: expiresAt.map(WireDate.string)))
    }

    private func edgeCall<Body: Encodable, Response: Decodable>(
        function: String, bearer: String, body: Body
    ) async throws -> Response {
        var request = URLRequest(url: functionBaseURL.appendingPathComponent(function))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw SiteRequestRemoteError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            throw SiteRequestRemoteError.rejected(
                status: http.statusCode,
                message: String(data: data, encoding: .utf8) ?? "Unknown error")
        }
        return try JSONDecoder().decode(Response.self, from: data)
    }
}

enum SiteRequestServiceFactory {
    @MainActor
    static func make(deps: WorkServiceDependencies) -> SupabaseSiteRequestService {
        SupabaseSiteRequestService(deps: deps)
    }
}

private enum WireDate {
    static let formatter: ISO8601DateFormatter = {
        let value = ISO8601DateFormatter()
        value.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return value
    }()
    static func string(_ date: Date) -> String { formatter.string(from: date) }
    static func date(_ value: String) -> Date { formatter.date(from: value) ?? Date(timeIntervalSince1970: 0) }
}

private struct ProjectNameRow: Decodable { let id: String; let name: String }
private struct SiteRequestHubItemRow: Decodable { let id: String; let status: String }
private struct SiteRequestHubRow: Decodable {
    let id: String
    let projectID: String
    let status: String
    let dueAt: String
    let dueContext: String?
    let sentAt: String?
    let openedAt: String?
    let assigneeName: String
    let assigneePhone: String
    let items: [SiteRequestHubItemRow]

    enum CodingKeys: String, CodingKey {
        case id, status, items
        case projectID = "project_id"
        case dueAt = "due_at"
        case dueContext = "due_context"
        case sentAt = "sent_at"
        case openedAt = "opened_at"
        case assigneeName = "assignee_name_snapshot"
        case assigneePhone = "assignee_phone_snapshot"
    }

    var summary: SiteRequestSummary {
        SiteRequestSummary(
            id: id,
            projectID: projectID,
            title: dueContext ?? "Site request",
            status: SiteRequestStatus(rawValue: status) ?? .draft,
            assignee: SiteRequestAssignee(name: assigneeName,
                                          normalizedPhone: assigneePhone,
                                          smsConsentGranted: true),
            dueAt: WireDate.date(dueAt),
            dueContext: dueContext,
            sentAt: sentAt.map(WireDate.date),
            openedAt: openedAt.map(WireDate.date),
            deliveredItemCount: items.filter { ["delivered", "approved"].contains($0.status) }.count,
            itemCount: items.count)
    }
}

private struct DraftItemWire: Encodable {
    let kitCode: String
    let title: String
    let guidance: String
    let roomID: String?
    let sortOrder: Int
    init(_ item: SiteRequestDraftItem) {
        kitCode = item.kit.rawValue
        title = item.title
        guidance = item.guidance
        roomID = item.roomID
        sortOrder = item.sortOrder
    }
    enum CodingKeys: String, CodingKey {
        case title, guidance
        case kitCode = "kit_code"
        case roomID = "room_id"
        case sortOrder = "sort_order"
    }
}
private struct CreateDraftParams: Encodable {
    let projectID: String; let assigneePartyID: String; let dueAt: String
    let dueContext: String?; let note: String?; let items: [DraftItemWire]
    enum CodingKeys: String, CodingKey {
        case items = "p_items"; case note = "p_note"
        case projectID = "p_project_id"; case assigneePartyID = "p_assignee_party_id"
        case dueAt = "p_due_at"; case dueContext = "p_due_context"
    }
}
private struct EmptyConfiguration: Encodable {}
private struct ReviseItemParams: Encodable {
    let itemID: String; let kitCode: String; let title: String; let guidance: String
    let roomID: String?; let configuration: EmptyConfiguration
    enum CodingKeys: String, CodingKey {
        case itemID = "p_item_id"; case kitCode = "p_kit_code"; case title = "p_title"
        case guidance = "p_guidance"; case roomID = "p_room_id"
        case configuration = "p_configuration"
    }
}
private struct RequestExpiryParams: Encodable {
    let requestID: String; let expiresAt: String
    enum CodingKeys: String, CodingKey { case requestID = "p_request_id"; case expiresAt = "p_expires_at" }
}
private struct RequestOnlyParams: Encodable {
    let requestID: String
    enum CodingKeys: String, CodingKey { case requestID = "p_request_id" }
}
private struct ApproveParams: Encodable {
    let itemID: String; let deliverableID: String; let roomID: String?
    enum CodingKeys: String, CodingKey {
        case itemID = "p_item_id"; case deliverableID = "p_deliverable_id"; case roomID = "p_room_id"
    }
}
private struct RedoParams: Encodable {
    let itemID: String; let note: String
    enum CodingKeys: String, CodingKey { case itemID = "p_item_id"; case note = "p_note" }
}
private struct EmptyBody: Encodable {}
private struct AcknowledgeUploadBody: Encodable {
    let uploadID: String; let checksumSHA256: String
    enum CodingKeys: String, CodingKey { case uploadID = "upload_id"; case checksumSHA256 = "checksum_sha256" }
}
private struct DesignerDispatchBody: Encodable {
    let action: String; let requestID: String; let expiresAt: String?
    enum CodingKeys: String, CodingKey {
        case action; case requestID = "request_id"; case expiresAt = "expires_at"
    }
}
private struct SendResponse: Decodable {
    let requestID: String; let status: String; let needsConsent: Bool?
    enum CodingKeys: String, CodingKey { case requestID = "request_id"; case status; case needsConsent = "needs_consent" }
}
private struct ApproveResponse: Decodable {
    let itemID: String; let deliverableID: String; let binderEntryID: String
    enum CodingKeys: String, CodingKey {
        case itemID = "item_id"; case deliverableID = "deliverable_id"; case binderEntryID = "binder_entry_id"
    }
}
private struct RedoResponse: Decodable { let itemID: String; enum CodingKeys: String, CodingKey { case itemID = "item_id" } }
private struct CloseResponse: Decodable { let requestID: String; enum CodingKeys: String, CodingKey { case requestID = "request_id" } }

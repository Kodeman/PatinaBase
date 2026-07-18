//  SupabaseSiteRequestService.swift
//  Capture
//
//  Authenticated designer RPC adapter + opaque-token guest Edge adapter. The
//  Supabase client carries only its normal anon/authenticated credentials.

import Foundation
import Supabase
import CaptureKit

struct SupabaseSiteRequestService: SiteRequestService, GuestSiteRequestService {
    private static let mediaBucket = "site-requests"
    private static let displayURLLifetime = 10 * 60

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
            .select("id,project_id,status,note,due_at,due_context,sent_at,"
                + "assignee_name_snapshot,assignee_phone_snapshot,"
                + "assignee_trade_snapshot,consent_status_snapshot,"
                + "items:site_request_items(id,status)")
            .eq("project_id", value: projectID)
            .order("created_at", ascending: false)
            .execute().value
        async let rooms: [ProjectRoomRow] = client.from("project_rooms")
            .select("id,name,updated_at")
            .eq("project_id", value: projectID)
            .order("sort_order")
            .execute().value
        async let parties: [ProjectPartyRow] = client.from("project_parties")
            .select("id,display_name,company_name,phone,phone_e164,trade,sms_consent_status")
            .eq("project_id", value: projectID)
            .order("display_name")
            .execute().value
        async let binderEntries: [SiteBinderEntryRow] = client.from("site_binder_entries")
            .select("id,room_id,request_id,item_id,item_version_id,deliverable_id,"
                + "entry_kind,payload,supersedes_entry_id,approved_at,"
                + "approver:profiles!site_binder_entries_approved_by_fkey(full_name)")
            .eq("project_id", value: projectID)
            .order("approved_at", ascending: false)
            .execute().value
        let (projectRow, requestRows, roomRows, partyRows, binderRows) =
            try await (project, requests, rooms, parties, binderEntries)

        let (itemRows, eventRows) = try await currentRows(requestIDs: requestRows.map(\.id))
        let events = eventRows.map(\.event)
        let reviewItems = itemRows.compactMap(\.item)
        let rawBinderHistory = binderRows.compactMap(\.entry)
        let (signedReviewItems, binderHistory) = await signingMedia(
            reviewItems: reviewItems, binderHistory: rawBinderHistory)
        let currentBinderEntries = SiteBinderProjection.currentEntries(from: binderHistory)
        return SiteProjectHub(
            projectID: projectID,
            projectName: projectRow.name,
            requests: requestRows.map { row in
                row.summary(openedAt: events.first(where: {
                    $0.requestID == row.id && $0.type == "guest_opened"
                })?.occurredAt)
            },
            reviewItems: signedReviewItems,
            rooms: roomRows.map { $0.room(currentEntries: currentBinderEntries) },
            assignees: partyRows.compactMap(\.assignee),
            events: events,
            binderEntries: binderHistory,
            currentBinderEntries: currentBinderEntries
        )
    }

    private func signingMedia(
        reviewItems: [SiteRequestItem], binderHistory: [SiteBinderEntry]
    ) async -> ([SiteRequestItem], [SiteBinderEntry]) {
        let displayURLs = await signedDisplayURLs(
            for: reviewItems.flatMap(\.media) + binderHistory.flatMap(\.media))
        let signedReviewItems = reviewItems.map { item in
            item.replacingMedia(item.media.map {
                $0.withSignedDisplayURL(displayURLs[$0.id])
            })
        }
        let signedBinderHistory = binderHistory.map { entry in
            entry.replacingMedia(entry.media.map {
                $0.withSignedDisplayURL(displayURLs[$0.id])
            })
        }
        return (signedReviewItems, signedBinderHistory)
    }

    private func signedDisplayURLs(for media: [SiteRequestMedia]) async -> [String: URL] {
        var result: [String: URL] = [:]
        var attempted = Set<String>()
        for item in media where attempted.insert(item.id).inserted {
            let candidates = SiteRequestMediaDisplayPath.candidates(
                originalPath: item.objectPath, previewPath: item.previewPath)
            for path in candidates {
                if let url = try? await client.storage
                    .from(Self.mediaBucket)
                    .createSignedURL(path: path, expiresIn: Self.displayURLLifetime) {
                    result[item.id] = url
                    break
                }
            }
        }
        return result
    }

    private func currentRows(requestIDs: [String]) async throws
        -> ([SiteRequestCurrentItemRow], [SiteRequestEventRow]) {
        guard !requestIDs.isEmpty else { return ([], []) }
        async let items: [SiteRequestCurrentItemRow] = client.from("site_request_items")
            .select("id,request_id,status,redo_note,"
                + "current_version:site_request_item_versions!site_request_items_current_version_id_fkey("
                + "id,version_number,kit_code,title,guidance,room_id,room_name_snapshot,configuration),"
                + "deliverables:site_deliverables(id,item_version_id,attempt_number,status,"
                + "captured_by_name,captured_at,delivered_at,"
                + "dimensions:site_deliverable_dimensions(id,label,value_mm,captured_by_name,captured_at,proof_media_id),"
                + "media:site_deliverable_media(id,object_path,mime_type,checksum_sha256,upload_state,client_filename,derivatives))")
            .in("request_id", values: requestIDs)
            .order("sort_order")
            .execute().value
        async let events: [SiteRequestEventRow] = client.from("site_request_events")
            .select("id,request_id,event_type,actor_kind,actor_label,created_at")
            .in("request_id", values: requestIDs)
            .order("sequence_no", ascending: false)
            .execute().value
        return try await (items, events)
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
            note: draft.title.trimmingCharacters(in: .whitespacesAndNewlines),
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
            configuration: DraftConfigurationWire(revision)
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

    func nudge(requestID: String, note: String?) async throws {
        let _: SendResponse = try await designerDispatch(
            action: "nudge", requestID: requestID, expiresAt: nil, note: note)
    }

    func revokeAccess(requestID: String, reason: String?) async throws {
        let _: RevokeAccessResponse = try await client.rpc(
            SiteRequestContract.RPC.revokeAccess,
            params: RevokeAccessParams(requestID: requestID, reason: reason))
            .execute().value
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
        let response: GuestBootstrapEnvelope = try await guestCall(
            accessToken: accessToken,
            body: GuestActionBody(action: SiteRequestContract.GuestAction.bootstrap))
        return response.request.guestRequest
    }

    func createUploadIntent(accessToken: String,
                            request: SiteUploadIntentRequest) async throws -> SiteUploadIntent {
        let response: GuestUploadIntentWire = try await guestCall(
            accessToken: accessToken,
            body: GuestUploadBody(action: SiteRequestContract.GuestAction.createUpload,
                                  request: request))
        return try response.intent()
    }

    func acknowledgeUpload(accessToken: String, uploadID: String,
                           request: SiteUploadIntentRequest) async throws -> SiteUploadReceipt {
        let response: GuestReceiptEnvelope = try await guestCall(
            accessToken: accessToken,
            body: GuestReceiptBody(action: SiteRequestContract.GuestAction.acknowledgeUpload,
                                   mediaID: uploadID, request: request))
        return response.receipt.uploadReceipt
    }

    func deliver(accessToken: String,
                 submission: SiteDeliverySubmission) async throws -> SiteDeliveryReceipt {
        if submission.photoResults != nil,
           submission.resolvedPhotoResults() == nil {
            throw SiteRequestRemoteError.invalidResponse
        }
        let response: GuestDeliveryEnvelope = try await guestCall(
            accessToken: accessToken,
            body: GuestDeliveryBody(action: SiteRequestContract.GuestAction.deliver,
                                    submission: submission))
        return response.delivery.receipt(clientDeliveryID: submission.clientDeliveryID)
    }

    private func guestCall<Body: Encodable, Response: Decodable>(
        accessToken: String, body: Body
    ) async throws -> Response {
        var request = URLRequest(
            url: functionBaseURL.appendingPathComponent(SiteRequestContract.guestFunction))
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
                code: edgeErrorCode(data))
        }
        return try WireDate.decoder.decode(Response.self, from: data)
    }

    private func designerDispatch<Response: Decodable>(
        action: String, requestID: String, expiresAt: Date?, note: String? = nil
    ) async throws -> Response {
        let userAccessToken = try await client.auth.session.accessToken
        return try await edgeCall(
            function: SiteRequestContract.designerDispatchFunction,
            bearer: userAccessToken,
            body: DesignerDispatchBody(
                action: action,
                requestID: requestID,
                expiresAt: expiresAt.map(WireDate.string),
                note: note))
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
                code: edgeErrorCode(data))
        }
        return try JSONDecoder().decode(Response.self, from: data)
    }

    private func edgeErrorCode(_ data: Data) -> String {
        (try? JSONDecoder().decode(EdgeErrorEnvelope.self, from: data).error)
            ?? "unknown_error"
    }
}

enum SiteRequestServiceFactory {
    @MainActor
    static func make(deps: WorkServiceDependencies) -> SupabaseSiteRequestService {
        SupabaseSiteRequestService(deps: deps)
    }
}

private enum WireDate {
    static let fractionalFormatter: ISO8601DateFormatter = {
        let value = ISO8601DateFormatter()
        value.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return value
    }()
    static let formatter = ISO8601DateFormatter()

    static var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            guard let date = dateIfPresent(value) else {
                throw DecodingError.dataCorruptedError(
                    in: container, debugDescription: "Invalid ISO-8601 date")
            }
            return date
        }
        return decoder
    }

    static func string(_ date: Date) -> String { fractionalFormatter.string(from: date) }
    static func dateIfPresent(_ value: String?) -> Date? {
        guard let value else { return nil }
        return fractionalFormatter.date(from: value) ?? formatter.date(from: value)
    }
    static func date(_ value: String) -> Date {
        dateIfPresent(value) ?? Date(timeIntervalSince1970: 0)
    }
}

private struct ProjectNameRow: Decodable { let id: String; let name: String }
private struct ProjectRoomRow: Decodable {
    let id: String
    let name: String
    let updatedAt: String?
    enum CodingKeys: String, CodingKey { case id, name; case updatedAt = "updated_at" }

    func room(currentEntries: [SiteBinderEntry]) -> SiteBinderRoom {
        let entries = currentEntries.filter { $0.roomID == id }
        return SiteBinderRoom(
            id: id, name: name,
            dimensionCount: entries.reduce(0) { $0 + $1.dimensions.count },
            photoCount: entries.reduce(0) { $0 + $1.media.count },
            updatedAt: entries.map(\.approvedAt).max() ?? WireDate.dateIfPresent(updatedAt))
    }
}

private struct SiteBinderEntryRow: Decodable {
    let id: String
    let roomID: String
    let requestID: String
    let itemID: String
    let itemVersionID: String
    let deliverableID: String
    let entryKind: String
    let payload: SiteBinderPayloadWire
    let supersedesEntryID: String?
    let approvedAt: String
    let approver: ProfileNameRow?

    enum CodingKeys: String, CodingKey {
        case id, payload, approver
        case roomID = "room_id"
        case requestID = "request_id"
        case itemID = "item_id"
        case itemVersionID = "item_version_id"
        case deliverableID = "deliverable_id"
        case entryKind = "entry_kind"
        case supersedesEntryID = "supersedes_entry_id"
        case approvedAt = "approved_at"
    }

    var entry: SiteBinderEntry? {
        guard let kind = SiteRequestKit(rawValue: entryKind) else { return nil }
        return SiteBinderEntry(
            id: id, requestID: requestID, itemID: itemID,
            itemVersionID: itemVersionID, roomID: roomID,
            title: payload.title, kind: kind,
            sourceDeliverableID: deliverableID,
            supersedesEntryID: supersedesEntryID,
            approvedBy: approver?.fullName ?? "Designer",
            approvedAt: WireDate.date(approvedAt),
            dimensions: payload.dimensions.map(\.dimension),
            media: payload.media.map(\.media))
    }
}

private struct ProfileNameRow: Decodable {
    let fullName: String?
    enum CodingKeys: String, CodingKey { case fullName = "full_name" }
}

private struct SiteBinderPayloadWire: Decodable {
    let title: String
    let dimensions: [SiteBinderDimensionWire]
    let media: [SiteBinderMediaWire]
}

private struct SiteBinderDimensionWire: Decodable {
    let id: String
    let label: String
    let valueMM: Int
    let capturedByName: String?
    let capturedAt: String
    let proofMediaID: String?
    enum CodingKeys: String, CodingKey {
        case id, label
        case valueMM = "value_mm"
        case capturedByName = "captured_by_name"
        case capturedAt = "captured_at"
        case proofMediaID = "proof_media_id"
    }
    var dimension: SiteRequestDimension {
        SiteRequestDimension(
            id: id, label: label, millimetres: valueMM,
            capturedBy: capturedByName ?? "Guest",
            capturedAt: WireDate.date(capturedAt),
            proofAssetPath: proofMediaID)
    }
}

private struct SiteBinderMediaWire: Decodable {
    let id: String
    let objectPath: String
    let mimeType: String
    let checksumSHA256: String
    let derivatives: SiteBinderDerivativesWire?
    enum CodingKeys: String, CodingKey {
        case id, derivatives
        case objectPath = "object_path"
        case mimeType = "mime_type"
        case checksumSHA256 = "checksum_sha256"
    }
    var media: SiteRequestMedia {
        SiteRequestMedia(
            id: id, objectPath: objectPath, mimeType: mimeType,
            checksumSHA256: checksumSHA256,
            previewPath: derivatives?.previewPath)
    }
}

private struct SiteBinderDerivativesWire: Decodable {
    let previewPath: String?
    let thumbnailPath: String?
    enum CodingKeys: String, CodingKey {
        case previewPath = "preview_path"
        case thumbnailPath = "thumbnail_path"
    }
}

private struct ProjectPartyRow: Decodable {
    let id: String
    let displayName: String
    let companyName: String?
    let phone: String?
    let phoneE164: String?
    let trade: String?
    let consentStatus: String
    enum CodingKeys: String, CodingKey {
        case id, phone, trade
        case displayName = "display_name"
        case companyName = "company_name"
        case phoneE164 = "phone_e164"
        case consentStatus = "sms_consent_status"
    }

    var assignee: SiteRequestAssignee? {
        guard let normalizedPhone = phoneE164 ?? phone, !normalizedPhone.isEmpty else { return nil }
        return SiteRequestAssignee(
            partyID: id, name: displayName, normalizedPhone: normalizedPhone,
            trade: trade ?? companyName, smsConsentGranted: consentStatus == "granted")
    }
}

private struct SiteRequestHubItemRow: Decodable { let id: String; let status: String }
private struct SiteRequestHubRow: Decodable {
    let id: String
    let projectID: String
    let status: String
    let note: String?
    let dueAt: String
    let dueContext: String?
    let sentAt: String?
    let assigneeName: String?
    let assigneePhone: String?
    let assigneeTrade: String?
    let consentStatus: String
    let items: [SiteRequestHubItemRow]

    enum CodingKeys: String, CodingKey {
        case id, status, note, items
        case projectID = "project_id"
        case dueAt = "due_at"
        case dueContext = "due_context"
        case sentAt = "sent_at"
        case assigneeName = "assignee_name_snapshot"
        case assigneePhone = "assignee_phone_snapshot"
        case assigneeTrade = "assignee_trade_snapshot"
        case consentStatus = "consent_status_snapshot"
    }

    func summary(openedAt: Date?) -> SiteRequestSummary {
        SiteRequestSummary(
            id: id,
            projectID: projectID,
            title: note ?? dueContext ?? "Site request",
            status: SiteRequestStatus(rawValue: status) ?? .draft,
            assignee: SiteRequestAssignee(name: assigneeName ?? "Project contact",
                                          normalizedPhone: assigneePhone ?? "",
                                          trade: assigneeTrade,
                                          smsConsentGranted: consentStatus == "granted"),
            dueAt: WireDate.date(dueAt),
            dueContext: dueContext,
            sentAt: WireDate.dateIfPresent(sentAt),
            openedAt: openedAt,
            deliveredItemCount: items.filter { ["delivered", "approved"].contains($0.status) }.count,
            itemCount: items.count)
    }
}

private struct SiteRequestCurrentItemRow: Decodable {
    let id: String
    let requestID: String
    let status: String
    let redoNote: String?
    let currentVersion: SiteRequestVersionRow?
    let deliverables: [SiteRequestDeliverableRow]
    enum CodingKeys: String, CodingKey {
        case id, status, deliverables
        case requestID = "request_id"
        case redoNote = "redo_note"
        case currentVersion = "current_version"
    }

    var item: SiteRequestItem? {
        guard let version = currentVersion,
              let kit = SiteRequestKit(rawValue: version.kitCode) else { return nil }
        let delivery = deliverables
            .filter { $0.status == "delivered" && $0.itemVersionID == version.id }
            .max { $0.attemptNumber < $1.attemptNumber }
        return SiteRequestItem(
            id: id, requestID: requestID, versionID: version.id,
            version: version.versionNumber, kit: kit, title: version.title,
            guidance: version.guidance ?? "", roomID: version.roomID,
            roomName: version.roomName,
            status: SiteRequestItemStatus(rawValue: status) ?? .pending,
            dimensions: delivery?.dimensions.map(\.dimension) ?? [],
            media: delivery?.media.filter { $0.uploadState == "ready" || $0.uploadState == "uploaded" }
                .map(\.media) ?? [],
            redoNote: redoNote, deliverableID: delivery?.id,
            measureDefinitions: version.configuration.measureDefinitions,
            photoShots: version.configuration.photoShots)
    }
}

private struct SiteRequestVersionRow: Decodable {
    let id: String
    let versionNumber: Int
    let kitCode: String
    let title: String
    let guidance: String?
    let roomID: String?
    let roomName: String?
    let configuration: SiteRequestConfigurationWire
    enum CodingKeys: String, CodingKey {
        case id, title, guidance, configuration
        case versionNumber = "version_number"
        case kitCode = "kit_code"
        case roomID = "room_id"
        case roomName = "room_name_snapshot"
    }
}

private struct SiteRequestConfigurationWire: Decodable {
    let measureDefinitions: [SiteRequestMeasureDefinition]
    let photoShots: [SiteRequestPhotoShot]

    private enum CodingKeys: String, CodingKey { case dimensions, shots }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let dimensions = try container.decodeIfPresent(
            [SiteRequestDefinitionCandidate].self, forKey: .dimensions) ?? []
        let shots = try container.decodeIfPresent(
            [SiteRequestDefinitionCandidate].self, forKey: .shots) ?? []
        measureDefinitions = dimensions.prefix(20).enumerated().map { index, candidate in
            let id = candidate.id ?? candidate.label ?? String(index + 1)
            return SiteRequestMeasureDefinition(
                id: id, label: candidate.label ?? "Measure \(index + 1)",
                guidance: candidate.guidance)
        }
        photoShots = shots.prefix(30).enumerated().map { index, candidate in
            SiteRequestPhotoShot(
                id: candidate.id ?? String(index + 1),
                label: candidate.label ?? "Shot \(index + 1)",
                guidance: candidate.guidance,
                referenceURL: candidate.referenceURL.flatMap(URL.init(string:)))
        }
    }
}

private struct SiteRequestDefinitionCandidate: Decodable {
    let id: String?
    let label: String?
    let guidance: String?
    let referenceURL: String?

    private enum CodingKeys: String, CodingKey {
        case id, label, guidance
        case referenceURL = "reference_url"
    }

    init(from decoder: Decoder) throws {
        if let value = try? decoder.singleValueContainer().decode(String.self) {
            id = nil
            label = value
            guidance = nil
            referenceURL = nil
            return
        }
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(String.self, forKey: .id)
        label = try container.decodeIfPresent(String.self, forKey: .label)
        guidance = try container.decodeIfPresent(String.self, forKey: .guidance)
        referenceURL = try container.decodeIfPresent(String.self, forKey: .referenceURL)
    }
}

private struct SiteRequestDeliverableRow: Decodable {
    let id: String
    let itemVersionID: String
    let attemptNumber: Int
    let status: String
    let capturedByName: String?
    let capturedAt: String?
    let deliveredAt: String?
    let dimensions: [SiteRequestDimensionRow]
    let media: [SiteRequestMediaRow]
    enum CodingKeys: String, CodingKey {
        case id, status, dimensions, media
        case itemVersionID = "item_version_id"
        case attemptNumber = "attempt_number"
        case capturedByName = "captured_by_name"
        case capturedAt = "captured_at"
        case deliveredAt = "delivered_at"
    }
}

private struct SiteRequestDimensionRow: Decodable {
    let id: String
    let label: String
    let valueMM: Int
    let capturedByName: String?
    let capturedAt: String
    let proofMediaID: String?
    enum CodingKeys: String, CodingKey {
        case id, label
        case valueMM = "value_mm"
        case capturedByName = "captured_by_name"
        case capturedAt = "captured_at"
        case proofMediaID = "proof_media_id"
    }
    var dimension: SiteRequestDimension {
        SiteRequestDimension(
            id: id, label: label, millimetres: valueMM,
            capturedBy: capturedByName ?? "Guest", capturedAt: WireDate.date(capturedAt),
            proofAssetPath: proofMediaID)
    }
}

private struct SiteRequestMediaRow: Decodable {
    let id: String
    let objectPath: String
    let mimeType: String
    let checksumSHA256: String
    let uploadState: String
    let clientFilename: String
    let derivatives: SiteBinderDerivativesWire?
    enum CodingKeys: String, CodingKey {
        case id, derivatives
        case objectPath = "object_path"
        case mimeType = "mime_type"
        case checksumSHA256 = "checksum_sha256"
        case uploadState = "upload_state"
        case clientFilename = "client_filename"
    }
    var media: SiteRequestMedia {
        SiteRequestMedia(id: id, objectPath: objectPath, mimeType: mimeType,
                         checksumSHA256: checksumSHA256,
                         previewPath: derivatives?.previewPath,
                         caption: clientFilename)
    }
}

private struct SiteRequestEventRow: Decodable {
    let id: String
    let requestID: String
    let eventType: String
    let actorKind: String
    let actorLabel: String?
    let createdAt: String
    enum CodingKeys: String, CodingKey {
        case id
        case requestID = "request_id"
        case eventType = "event_type"
        case actorKind = "actor_kind"
        case actorLabel = "actor_label"
        case createdAt = "created_at"
    }
    var event: SiteRequestEvent {
        SiteRequestEvent(
            id: id, requestID: requestID, type: eventType,
            occurredAt: WireDate.date(createdAt),
            actorName: actorLabel ?? actorKind.capitalized,
            message: eventType.replacingOccurrences(of: "_", with: " "))
    }
}

private struct GuestBootstrapEnvelope: Decodable { let request: GuestBootstrapWire }
private struct GuestBootstrapWire: Decodable {
    let request: GuestRequestWire
    let assignee: GuestAssigneeWire
    let items: [GuestItemWire]

    var guestRequest: GuestSiteRequest {
        let mappedItems = items.compactMap { $0.item(requestID: request.id) }
        let assignee = SiteRequestAssignee(
            partyID: self.assignee.id,
            name: self.assignee.displayName,
            normalizedPhone: "",
            trade: self.assignee.trade,
            smsConsentGranted: true)
        let summary = SiteRequestSummary(
            id: request.id, projectID: request.projectID,
            title: request.note ?? request.dueContext ?? "Site request",
            status: SiteRequestStatus(rawValue: request.status) ?? .sent,
            assignee: assignee, dueAt: request.dueAt,
            dueContext: request.dueContext, deliveredItemCount: mappedItems.filter {
                $0.status == .delivered || $0.status == .approved
            }.count, itemCount: mappedItems.count)
        return GuestSiteRequest(
            request: summary, designerName: request.designerName,
            studioName: request.studioName, projectDisplayName: request.siteName,
            items: mappedItems)
    }
}

private struct GuestRequestWire: Decodable {
    let id: String
    let projectID: String
    let status: String
    let dueAt: Date
    let dueContext: String?
    let note: String?
    let siteName: String
    let designerName: String
    let studioName: String
    enum CodingKeys: String, CodingKey {
        case id, status, note
        case projectID = "project_id"
        case dueAt = "due_at"
        case dueContext = "due_context"
        case siteName = "site_name"
        case designerName = "designer_name"
        case studioName = "studio_name"
    }
}

private struct GuestAssigneeWire: Decodable {
    let id: String
    let displayName: String
    let trade: String?
    enum CodingKeys: String, CodingKey { case id, trade; case displayName = "display_name" }
}

private struct GuestItemWire: Decodable {
    let id: String
    let status: String
    let redoNote: String?
    let version: GuestVersionWire
    let deliveries: [GuestDeliveryAttemptWire]
    enum CodingKeys: String, CodingKey { case id, status, version, deliveries; case redoNote = "redo_note" }

    func item(requestID: String) -> SiteRequestItem? {
        guard let kit = SiteRequestKit(rawValue: version.kitCode) else { return nil }
        let delivery = deliveries.filter { $0.status == "delivered" }
            .max { $0.attemptNumber < $1.attemptNumber }
        return SiteRequestItem(
            id: id, requestID: requestID, versionID: version.id,
            version: version.versionNumber, kit: kit, title: version.title,
            guidance: version.guidance ?? "", roomID: version.roomID,
            roomName: version.roomName,
            status: SiteRequestItemStatus(rawValue: status) ?? .pending,
            media: delivery?.media.map(\.media) ?? [], redoNote: redoNote,
            deliverableID: delivery?.id,
            measureDefinitions: version.configuration.measureDefinitions,
            photoShots: version.configuration.photoShots)
    }
}

private struct GuestVersionWire: Decodable {
    let id: String
    let versionNumber: Int
    let kitCode: String
    let title: String
    let guidance: String?
    let roomID: String?
    let roomName: String?
    let configuration: SiteRequestConfigurationWire
    enum CodingKeys: String, CodingKey {
        case id, title, guidance, configuration
        case versionNumber = "version_number"
        case kitCode = "kit_code"
        case roomID = "room_id"
        case roomName = "room_name"
    }
}

private struct GuestDeliveryAttemptWire: Decodable {
    let id: String
    let attemptNumber: Int
    let status: String
    let media: [GuestMediaWire]
    enum CodingKeys: String, CodingKey {
        case id, status, media
        case attemptNumber = "attempt_number"
    }
}

private struct GuestMediaWire: Decodable {
    let id: String
    let filename: String
    let mimeType: String
    let uploadState: String
    let objectPath: String
    enum CodingKeys: String, CodingKey {
        case id, filename
        case mimeType = "mime_type"
        case uploadState = "upload_state"
        case objectPath = "object_path"
    }
    var media: SiteRequestMedia {
        SiteRequestMedia(id: id, objectPath: objectPath, mimeType: mimeType,
                         checksumSHA256: "", caption: filename)
    }
}

private struct DraftItemWire: Encodable {
    let kitCode: String
    let title: String
    let guidance: String
    let roomID: String?
    let sortOrder: Int
    let configuration: DraftConfigurationWire
    init(_ item: SiteRequestDraftItem) {
        kitCode = item.kit.rawValue
        title = item.title
        guidance = item.guidance
        roomID = item.roomID
        sortOrder = item.sortOrder
        configuration = DraftConfigurationWire(item)
    }
    enum CodingKeys: String, CodingKey {
        case title, guidance, configuration
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
private struct DraftConfigurationWire: Encodable {
    let dimensions: [DraftMeasureDefinitionWire]
    let shots: [DraftPhotoShotWire]

    init(_ item: SiteRequestDraftItem) {
        dimensions = item.measureDefinitions.map(DraftMeasureDefinitionWire.init)
        shots = item.photoShots.map(DraftPhotoShotWire.init)
    }
}

private struct DraftMeasureDefinitionWire: Encodable {
    let id: String
    let label: String
    let guidance: String?
    init(_ definition: SiteRequestMeasureDefinition) {
        id = definition.id
        label = definition.label
        guidance = definition.guidance
    }
}

private struct DraftPhotoShotWire: Encodable {
    let id: String
    let label: String
    let guidance: String?
    let referenceURL: URL?
    init(_ shot: SiteRequestPhotoShot) {
        id = shot.id
        label = shot.label
        guidance = shot.guidance
        referenceURL = shot.referenceURL
    }
    enum CodingKeys: String, CodingKey {
        case id, label, guidance
        case referenceURL = "reference_url"
    }
}

private struct ReviseItemParams: Encodable {
    let itemID: String; let kitCode: String; let title: String; let guidance: String
    let roomID: String?; let configuration: DraftConfigurationWire
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
private struct RevokeAccessParams: Encodable {
    let requestID: String
    let reason: String?
    enum CodingKeys: String, CodingKey {
        case requestID = "p_request_id"
        case reason = "p_reason"
    }
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

private struct GuestActionBody: Encodable { let action: String }

private struct GuestUploadBody: Encodable {
    let action: String
    let itemVersionId: String
    let clientAttemptId: UUID
    let filename: String
    let mimeType: String
    let checksumSha256: String
    let sizeBytes: Int

    init(action: String, request: SiteUploadIntentRequest) {
        self.action = action
        itemVersionId = request.itemVersionID
        clientAttemptId = request.clientDeliveryID
        filename = request.filename
        mimeType = request.mimeType
        checksumSha256 = request.checksumSHA256
        sizeBytes = request.byteCount
    }
}

private struct GuestUploadIntentWire: Decodable {
    let mediaID: String
    let deliverableID: String
    let objectPath: String
    let uploadURL: String
    enum CodingKeys: String, CodingKey {
        case mediaID = "mediaId"
        case deliverableID = "deliverableId"
        case objectPath = "objectPath"
        case uploadURL = "uploadUrl"
    }
    func intent() throws -> SiteUploadIntent {
        guard let signedURL = URL(string: uploadURL) else {
            throw SiteRequestRemoteError.invalidResponse
        }
        return SiteUploadIntent(uploadID: mediaID, objectPath: objectPath,
                                signedURL: signedURL, expiresAt: Date().addingTimeInterval(900))
    }
}

private struct GuestReceiptBody: Encodable {
    let action: String
    let mediaId: String
    let itemVersionId: String
    let clientAttemptId: UUID
    let filename: String
    let mimeType: String
    let checksumSha256: String
    let sizeBytes: Int

    init(action: String, mediaID: String, request: SiteUploadIntentRequest) {
        self.action = action
        mediaId = mediaID
        itemVersionId = request.itemVersionID
        clientAttemptId = request.clientDeliveryID
        filename = request.filename
        mimeType = request.mimeType
        checksumSha256 = request.checksumSHA256
        sizeBytes = request.byteCount
    }
}

private struct GuestReceiptEnvelope: Decodable { let receipt: GuestReceiptWire }
private struct GuestReceiptWire: Decodable {
    let mediaID: String
    let uploadState: String
    enum CodingKeys: String, CodingKey {
        case mediaID = "media_id"
        case uploadState = "upload_state"
    }
    var uploadReceipt: SiteUploadReceipt {
        SiteUploadReceipt(uploadID: mediaID, objectPath: "",
                          checksumVerified: ["uploaded", "processing", "ready"].contains(uploadState))
    }
}

private struct GuestDeliveryBody: Encodable {
    let action: String
    let itemVersionId: String
    let clientAttemptId: UUID
    let payload: GuestDeliveryPayload
    let dimensions: [GuestDimensionBody]
    let capturedByName: String
    let capturedAt: String

    init(action: String, submission: SiteDeliverySubmission) {
        self.action = action
        itemVersionId = submission.itemVersionID
        clientAttemptId = submission.clientDeliveryID
        payload = GuestDeliveryPayload(submission: submission)
        dimensions = submission.dimensions.map(GuestDimensionBody.init)
        capturedByName = submission.dimensions.first?.capturedBy ?? "Guest"
        capturedAt = WireDate.string(submission.dimensions.first?.capturedAt ?? Date())
    }
}

private struct GuestDeliveryPayload: Encodable {
    let kitCode: String
    let uploadIDs: [String]
    let skippedShotLabels: [String]
    let skipReason: String?
    let shots: [GuestShotPayload]?
    init(submission: SiteDeliverySubmission) {
        kitCode = submission.photoResults == nil ? SiteRequestKit.measureSet.rawValue
            : SiteRequestKit.detailPhotos.rawValue
        uploadIDs = submission.uploadIDs
        skippedShotLabels = submission.skippedShotLabels
        skipReason = submission.photoResults?.first(where: { $0.status == .skipped })?.skipNote
            ?? submission.skippedShotLabels.first
        shots = submission.resolvedPhotoResults()?.map { result in
            GuestShotPayload(
                id: result.id, label: result.label, status: result.status.rawValue,
                mediaID: result.mediaID,
                skipNote: result.skipNote)
        }
    }
    enum CodingKeys: String, CodingKey {
        case kitCode = "kit_code"
        case uploadIDs = "upload_ids"
        case skippedShotLabels = "skipped_shot_labels"
        case skipReason = "skip_reason"
        case shots
    }
}

private struct GuestShotPayload: Encodable {
    let id: String
    let label: String
    let status: String
    let mediaID: String?
    let skipNote: String?
    enum CodingKeys: String, CodingKey {
        case id, label, status
        case mediaID = "media_id"
        case skipNote = "skip_note"
    }
}

private struct GuestDimensionBody: Encodable {
    let label: String
    let valueMM: Int
    let proofMediaID: String?
    init(_ dimension: SiteRequestDimension) {
        label = dimension.label
        valueMM = dimension.millimetres
        proofMediaID = dimension.proofAssetPath
    }
    enum CodingKeys: String, CodingKey {
        case label
        case valueMM = "value_mm"
        case proofMediaID = "proof_media_id"
    }
}

private struct GuestDeliveryEnvelope: Decodable { let delivery: GuestDeliveryWire }
private struct GuestDeliveryWire: Decodable {
    let deliverableID: String
    let deliveredAt: Date
    let idempotent: Bool
    enum CodingKeys: String, CodingKey {
        case idempotent
        case deliverableID = "deliverable_id"
        case deliveredAt = "delivered_at"
    }
    func receipt(clientDeliveryID: UUID) -> SiteDeliveryReceipt {
        SiteDeliveryReceipt(deliverableID: deliverableID,
                            clientDeliveryID: clientDeliveryID,
                            receivedAt: deliveredAt, duplicate: idempotent)
    }
}
private struct DesignerDispatchBody: Encodable {
    let action: String; let requestID: String; let expiresAt: String?; let note: String?
    enum CodingKeys: String, CodingKey {
        case action, note; case requestID = "request_id"; case expiresAt = "expires_at"
    }
}
private struct SendResponse: Decodable {
    let requestID: String?; let status: String; let needsConsent: Bool?
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
private struct RevokeAccessResponse: Decodable {
    let requestID: String
    let revokedCount: Int
    enum CodingKeys: String, CodingKey {
        case requestID = "request_id"
        case revokedCount = "revoked_count"
    }
}
private struct EdgeErrorEnvelope: Decodable { let error: String }

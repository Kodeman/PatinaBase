//  SiteRequestService.swift
//  CaptureKit
//
//  P1 Site Request contracts shared by the designer and guest surfaces.
//  Guest access is deliberately an Edge API contract: no guest JWT, service-role
//  credential, or direct table/storage access crosses this seam.

import Foundation

public enum SiteRequestKit: String, Codable, CaseIterable, Sendable {
    case measureSet = "K-01"
    case detailPhotos = "K-02"

    public var title: String {
        switch self {
        case .measureSet: return "K-01 · Measure Set"
        case .detailPhotos: return "K-02 · Detail Photos"
        }
    }
}

public enum SiteRequestAccessToken {
    /// Site Request tokens have their own namespace so iOS never intercepts
    /// legacy 64-hex Field Coordination links that share `/field/{token}`.
    public static func isNativeSiteRequestToken(_ token: String) -> Bool {
        guard token.hasPrefix("sr_") else { return false }
        let opaque = token.dropFirst(3)
        guard opaque.count == 43 else { return false }
        return opaque.allSatisfy { character in
            character.isASCII && (character.isLetter || character.isNumber
                || character == "_" || character == "-")
        }
    }
}

public enum SiteRequestStatus: String, Codable, Sendable {
    case draft
    case awaitingConsent = "awaiting_consent"
    case sent
    case inProgress = "in_progress"
    case delivered
    case completed
    case closed
    case expired
}

public enum SiteRequestItemStatus: String, Codable, Sendable {
    case pending = "open"
    case captured
    case uploading
    case delivered
    case approved
    case redo = "redo_requested"
}

public struct SiteRequestAssignee: Codable, Hashable, Sendable {
    public let partyID: String?
    public let name: String
    public let normalizedPhone: String
    public let trade: String?
    public let smsConsentGranted: Bool

    public init(partyID: String? = nil, name: String, normalizedPhone: String,
                trade: String? = nil, smsConsentGranted: Bool) {
        self.partyID = partyID
        self.name = name
        self.normalizedPhone = normalizedPhone
        self.trade = trade
        self.smsConsentGranted = smsConsentGranted
    }
}

public struct SiteRequestDimension: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let label: String
    public let millimetres: Int
    public let capturedBy: String
    public let capturedAt: Date
    public let proofAssetPath: String?

    public init(id: String, label: String, millimetres: Int, capturedBy: String,
                capturedAt: Date, proofAssetPath: String? = nil) {
        self.id = id
        self.label = label
        self.millimetres = millimetres
        self.capturedBy = capturedBy
        self.capturedAt = capturedAt
        self.proofAssetPath = proofAssetPath
    }
}

public struct SiteRequestMedia: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let objectPath: String
    public let mimeType: String
    public let checksumSHA256: String
    public let previewPath: String?
    public let caption: String?
    /// An authenticated, short-lived presentation capability. This value is
    /// intentionally omitted from Codable so it never enters durable payloads.
    public let signedDisplayURL: URL?

    public init(id: String, objectPath: String, mimeType: String,
                checksumSHA256: String, previewPath: String? = nil,
                caption: String? = nil, signedDisplayURL: URL? = nil) {
        self.id = id
        self.objectPath = objectPath
        self.mimeType = mimeType
        self.checksumSHA256 = checksumSHA256
        self.previewPath = previewPath
        self.caption = caption
        self.signedDisplayURL = signedDisplayURL
    }

    public func withSignedDisplayURL(_ url: URL?) -> SiteRequestMedia {
        SiteRequestMedia(
            id: id, objectPath: objectPath, mimeType: mimeType,
            checksumSHA256: checksumSHA256, previewPath: previewPath,
            caption: caption, signedDisplayURL: url)
    }

    private enum CodingKeys: String, CodingKey {
        case id, objectPath, mimeType, checksumSHA256, previewPath, caption
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        objectPath = try container.decode(String.self, forKey: .objectPath)
        mimeType = try container.decode(String.self, forKey: .mimeType)
        checksumSHA256 = try container.decode(String.self, forKey: .checksumSHA256)
        previewPath = try container.decodeIfPresent(String.self, forKey: .previewPath)
        caption = try container.decodeIfPresent(String.self, forKey: .caption)
        signedDisplayURL = nil
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(objectPath, forKey: .objectPath)
        try container.encode(mimeType, forKey: .mimeType)
        try container.encode(checksumSHA256, forKey: .checksumSHA256)
        try container.encodeIfPresent(previewPath, forKey: .previewPath)
        try container.encodeIfPresent(caption, forKey: .caption)
    }
}

public enum SiteRequestMediaDisplayPath {
    /// Returns only safe paths within the original immutable attempt. A valid
    /// preview derivative is attempted first; the original is always the
    /// fallback. Bucket names and signed query strings never belong here.
    public static func candidates(originalPath: String, previewPath: String?) -> [String] {
        guard isSafeRelativePath(originalPath) else { return [] }
        var result: [String] = []
        if let previewPath,
           isPreview(previewPath, forOriginal: originalPath) {
            result.append(previewPath)
        }
        if !result.contains(originalPath) { result.append(originalPath) }
        return result
    }

    private static func isPreview(_ previewPath: String, forOriginal originalPath: String) -> Bool {
        guard isSafeRelativePath(previewPath) else { return false }
        let original = originalPath.split(separator: "/").map(String.init)
        let preview = previewPath.split(separator: "/").map(String.init)
        guard preview.count == original.count + 1,
              preview.count >= 3,
              preview[preview.count - 2] == "derivatives" else { return false }
        return Array(preview.dropLast(2)) == Array(original.dropLast())
    }

    private static func isSafeRelativePath(_ path: String) -> Bool {
        guard !path.isEmpty, !path.hasPrefix("/"), !path.contains("\\") else { return false }
        let components = path.split(separator: "/", omittingEmptySubsequences: false)
        return components.allSatisfy { !$0.isEmpty && $0 != "." && $0 != ".." }
    }
}

public struct SiteRequestPhotoShot: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let label: String
    public let guidance: String?
    public let referenceURL: URL?

    public init(id: String, label: String, guidance: String? = nil,
                referenceURL: URL? = nil) {
        self.id = id
        self.label = label
        self.guidance = guidance
        self.referenceURL = referenceURL
    }

    public static let p1DetailPhotos: [SiteRequestPhotoShot] = [
        SiteRequestPhotoShot(
            id: "wide_context", label: "Wide context",
            guidance: "Show the detail in the full wall or room context."),
        SiteRequestPhotoShot(
            id: "straight_on", label: "Straight on",
            guidance: "Center the detail and keep the phone level."),
        SiteRequestPhotoShot(
            id: "left_return", label: "Left return",
            guidance: "Show the left edge, return, and nearby condition."),
        SiteRequestPhotoShot(
            id: "detail", label: "Close detail",
            guidance: "Move close enough to show material, joint, and finish.")
    ]
}

public struct SiteRequestMeasureDefinition: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let label: String
    public let guidance: String?

    public init(id: String, label: String, guidance: String? = nil) {
        self.id = id
        self.label = label
        self.guidance = guidance
    }

    public static let p1MeasureSet: [SiteRequestMeasureDefinition] = [
        SiteRequestMeasureDefinition(
            id: "floor_to_sill", label: "A · floor → sill",
            guidance: "Measure vertically from the finished floor to the sill."),
        SiteRequestMeasureDefinition(
            id: "sill_to_head", label: "B · sill → head",
            guidance: "Measure vertically from the sill to the opening head."),
        SiteRequestMeasureDefinition(
            id: "run_length", label: "C · run length",
            guidance: "Measure the full horizontal run shown in the diagram.")
    ]
}

public enum SiteRequestPhotoResultStatus: String, Codable, Hashable, Sendable {
    case captured
    case skipped
}

public struct SiteRequestPhotoResult: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let label: String
    public let status: SiteRequestPhotoResultStatus
    public let skipNote: String?

    public init(id: String, label: String, status: SiteRequestPhotoResultStatus,
                skipNote: String? = nil) {
        self.id = id
        self.label = label
        self.status = status
        self.skipNote = skipNote
    }
}

public struct SiteRequestResolvedPhotoResult: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let label: String
    public let status: SiteRequestPhotoResultStatus
    public let mediaID: String?
    public let skipNote: String?

    public init(id: String, label: String, status: SiteRequestPhotoResultStatus,
                mediaID: String? = nil, skipNote: String? = nil) {
        self.id = id
        self.label = label
        self.status = status
        self.mediaID = mediaID
        self.skipNote = skipNote
    }
}

public struct SiteRequestItem: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let requestID: String?
    public let versionID: String
    public let version: Int
    public let kit: SiteRequestKit
    public let title: String
    public let guidance: String
    public let roomID: String?
    public let roomName: String?
    public let status: SiteRequestItemStatus
    public let dimensions: [SiteRequestDimension]
    public let media: [SiteRequestMedia]
    public let redoNote: String?
    public let deliverableID: String?
    public let measureDefinitions: [SiteRequestMeasureDefinition]
    public let photoShots: [SiteRequestPhotoShot]

    public init(id: String, requestID: String? = nil,
                versionID: String, version: Int = 1,
                kit: SiteRequestKit, title: String, guidance: String,
                roomID: String? = nil, roomName: String? = nil,
                status: SiteRequestItemStatus = .pending,
                dimensions: [SiteRequestDimension] = [],
                media: [SiteRequestMedia] = [], redoNote: String? = nil,
                deliverableID: String? = nil,
                measureDefinitions: [SiteRequestMeasureDefinition] = [],
                photoShots: [SiteRequestPhotoShot] = []) {
        self.id = id
        self.requestID = requestID
        self.versionID = versionID
        self.version = version
        self.kit = kit
        self.title = title
        self.guidance = guidance
        self.roomID = roomID
        self.roomName = roomName
        self.status = status
        self.dimensions = dimensions
        self.media = media
        self.redoNote = redoNote
        self.deliverableID = deliverableID
        self.measureDefinitions = measureDefinitions
        self.photoShots = photoShots
    }

    public func replacingMedia(_ media: [SiteRequestMedia]) -> SiteRequestItem {
        SiteRequestItem(
            id: id, requestID: requestID, versionID: versionID, version: version,
            kit: kit, title: title, guidance: guidance, roomID: roomID,
            roomName: roomName, status: status, dimensions: dimensions,
            media: media, redoNote: redoNote, deliverableID: deliverableID,
            measureDefinitions: measureDefinitions, photoShots: photoShots)
    }
}

public struct SiteRequestSummary: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let projectID: String
    public let title: String
    public let status: SiteRequestStatus
    public let assignee: SiteRequestAssignee
    public let dueAt: Date
    public let dueContext: String?
    public let sentAt: Date?
    public let openedAt: Date?
    public let deliveredItemCount: Int
    public let itemCount: Int

    public init(id: String, projectID: String, title: String,
                status: SiteRequestStatus, assignee: SiteRequestAssignee,
                dueAt: Date, dueContext: String? = nil, sentAt: Date? = nil,
                openedAt: Date? = nil, deliveredItemCount: Int, itemCount: Int) {
        self.id = id
        self.projectID = projectID
        self.title = title
        self.status = status
        self.assignee = assignee
        self.dueAt = dueAt
        self.dueContext = dueContext
        self.sentAt = sentAt
        self.openedAt = openedAt
        self.deliveredItemCount = deliveredItemCount
        self.itemCount = itemCount
    }
}

public struct SiteRequestEvent: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let requestID: String?
    public let type: String?
    public let occurredAt: Date
    public let actorName: String
    public let message: String

    public init(id: String, requestID: String? = nil, type: String? = nil,
                occurredAt: Date, actorName: String, message: String) {
        self.id = id
        self.requestID = requestID
        self.type = type
        self.occurredAt = occurredAt
        self.actorName = actorName
        self.message = message
    }
}

public struct SiteBinderRoom: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let dimensionCount: Int
    public let photoCount: Int
    public let updatedAt: Date?

    public init(id: String, name: String, dimensionCount: Int,
                photoCount: Int, updatedAt: Date? = nil) {
        self.id = id
        self.name = name
        self.dimensionCount = dimensionCount
        self.photoCount = photoCount
        self.updatedAt = updatedAt
    }
}

public struct SiteBinderEntry: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let requestID: String?
    public let itemID: String?
    public let itemVersionID: String?
    public let roomID: String
    public let title: String
    public let kind: SiteRequestKit
    public let sourceDeliverableID: String
    public let supersedesEntryID: String?
    public let approvedBy: String
    public let approvedAt: Date
    public let dimensions: [SiteRequestDimension]
    public let media: [SiteRequestMedia]

    public init(id: String, requestID: String? = nil, itemID: String? = nil,
                itemVersionID: String? = nil, roomID: String,
                title: String, kind: SiteRequestKit,
                sourceDeliverableID: String, supersedesEntryID: String? = nil,
                approvedBy: String, approvedAt: Date,
                dimensions: [SiteRequestDimension] = [], media: [SiteRequestMedia] = []) {
        self.id = id
        self.requestID = requestID
        self.itemID = itemID
        self.itemVersionID = itemVersionID
        self.roomID = roomID
        self.title = title
        self.kind = kind
        self.sourceDeliverableID = sourceDeliverableID
        self.supersedesEntryID = supersedesEntryID
        self.approvedBy = approvedBy
        self.approvedAt = approvedAt
        self.dimensions = dimensions
        self.media = media
    }

    public func replacingMedia(_ media: [SiteRequestMedia]) -> SiteBinderEntry {
        SiteBinderEntry(
            id: id, requestID: requestID, itemID: itemID,
            itemVersionID: itemVersionID, roomID: roomID, title: title,
            kind: kind, sourceDeliverableID: sourceDeliverableID,
            supersedesEntryID: supersedesEntryID, approvedBy: approvedBy,
            approvedAt: approvedAt, dimensions: dimensions, media: media)
    }
}

public struct SiteProjectHub: Codable, Hashable, Sendable {
    public let projectID: String
    public let projectName: String
    public let requests: [SiteRequestSummary]
    public let reviewItems: [SiteRequestItem]
    public let rooms: [SiteBinderRoom]
    public let assignees: [SiteRequestAssignee]
    public let events: [SiteRequestEvent]
    public let binderEntries: [SiteBinderEntry]
    public let currentBinderEntries: [SiteBinderEntry]

    public init(projectID: String, projectName: String,
                requests: [SiteRequestSummary], reviewItems: [SiteRequestItem],
                rooms: [SiteBinderRoom], assignees: [SiteRequestAssignee] = [],
                events: [SiteRequestEvent], binderEntries: [SiteBinderEntry] = [],
                currentBinderEntries: [SiteBinderEntry]? = nil) {
        self.projectID = projectID
        self.projectName = projectName
        self.requests = requests
        self.reviewItems = reviewItems
        self.rooms = rooms
        self.assignees = assignees
        self.events = events
        self.binderEntries = binderEntries
        self.currentBinderEntries = currentBinderEntries
            ?? SiteBinderProjection.currentEntries(from: binderEntries)
    }
}

public struct SiteRequestDraftItem: Codable, Hashable, Sendable {
    public let kit: SiteRequestKit
    public let title: String
    public let guidance: String
    public let roomID: String?
    public let sortOrder: Int
    public let measureDefinitions: [SiteRequestMeasureDefinition]
    public let photoShots: [SiteRequestPhotoShot]

    public init(kit: SiteRequestKit, title: String, guidance: String,
                roomID: String?, sortOrder: Int,
                measureDefinitions: [SiteRequestMeasureDefinition] = [],
                photoShots: [SiteRequestPhotoShot] = []) {
        self.kit = kit
        self.title = title
        self.guidance = guidance
        self.roomID = roomID
        self.sortOrder = sortOrder
        self.measureDefinitions = measureDefinitions
        self.photoShots = photoShots
    }
}

public struct SiteRequestDraftItemChoice: Codable, Hashable, Sendable {
    public let kit: SiteRequestKit
    public let isSelected: Bool
    public let title: String
    public let guidance: String
    public let roomID: String?

    public init(kit: SiteRequestKit, isSelected: Bool, title: String,
                guidance: String, roomID: String?) {
        self.kit = kit
        self.isSelected = isSelected
        self.title = title
        self.guidance = guidance
        self.roomID = roomID
    }
}

public enum SiteRequestDraftBuilder {
    public static func selectedItems(from choices: [SiteRequestDraftItemChoice])
        -> [SiteRequestDraftItem] {
        choices.filter(\.isSelected).enumerated().map { sortOrder, choice in
            SiteRequestDraftItem(
                kit: choice.kit, title: choice.title, guidance: choice.guidance,
                roomID: choice.roomID, sortOrder: sortOrder,
                measureDefinitions: choice.kit == .measureSet
                    ? SiteRequestMeasureDefinition.p1MeasureSet : [],
                photoShots: choice.kit == .detailPhotos
                    ? SiteRequestPhotoShot.p1DetailPhotos : [])
        }
    }
}

public struct SiteRequestDraft: Codable, Hashable, Sendable {
    public let projectID: String
    public let title: String
    public let assignee: SiteRequestAssignee
    public let dueAt: Date
    public let dueContext: String?
    public let note: String?
    public let items: [SiteRequestDraftItem]

    public init(projectID: String, title: String, assignee: SiteRequestAssignee,
                dueAt: Date, dueContext: String? = nil, note: String? = nil,
                items: [SiteRequestDraftItem]) {
        self.projectID = projectID
        self.title = title
        self.assignee = assignee
        self.dueAt = dueAt
        self.dueContext = dueContext
        self.note = note
        self.items = items
    }
}

public struct GuestSiteRequest: Codable, Hashable, Sendable {
    public let request: SiteRequestSummary
    public let designerName: String
    public let studioName: String
    public let projectDisplayName: String
    public let items: [SiteRequestItem]

    public init(request: SiteRequestSummary, designerName: String,
                studioName: String, projectDisplayName: String,
                items: [SiteRequestItem]) {
        self.request = request
        self.designerName = designerName
        self.studioName = studioName
        self.projectDisplayName = projectDisplayName
        self.items = items
    }
}

public struct SiteUploadIntentRequest: Codable, Hashable, Sendable {
    public let requestID: String
    public let itemVersionID: String
    public let clientDeliveryID: UUID
    public let filename: String
    public let mimeType: String
    public let byteCount: Int
    public let checksumSHA256: String

    public init(requestID: String, itemVersionID: String, clientDeliveryID: UUID,
                filename: String, mimeType: String, byteCount: Int,
                checksumSHA256: String) {
        self.requestID = requestID
        self.itemVersionID = itemVersionID
        self.clientDeliveryID = clientDeliveryID
        self.filename = filename
        self.mimeType = mimeType
        self.byteCount = byteCount
        self.checksumSHA256 = checksumSHA256
    }
}

public struct SiteUploadIntent: Codable, Hashable, Sendable {
    public let uploadID: String
    public let objectPath: String
    public let signedURL: URL
    public let expiresAt: Date

    public init(uploadID: String, objectPath: String, signedURL: URL, expiresAt: Date) {
        self.uploadID = uploadID
        self.objectPath = objectPath
        self.signedURL = signedURL
        self.expiresAt = expiresAt
    }
}

public struct SiteUploadReceipt: Codable, Hashable, Sendable {
    public let uploadID: String
    public let objectPath: String
    public let checksumVerified: Bool

    public init(uploadID: String, objectPath: String, checksumVerified: Bool) {
        self.uploadID = uploadID
        self.objectPath = objectPath
        self.checksumVerified = checksumVerified
    }
}

public struct SiteDeliverySubmission: Codable, Hashable, Sendable {
    public let requestID: String
    public let itemID: String
    public let itemVersionID: String
    public let clientDeliveryID: UUID
    public let dimensions: [SiteRequestDimension]
    public let uploadIDs: [String]
    public let skippedShotLabels: [String]
    public let photoResults: [SiteRequestPhotoResult]?

    public init(requestID: String, itemID: String, itemVersionID: String,
                clientDeliveryID: UUID, dimensions: [SiteRequestDimension] = [],
                uploadIDs: [String] = [], skippedShotLabels: [String] = [],
                photoResults: [SiteRequestPhotoResult]? = nil) {
        self.requestID = requestID
        self.itemID = itemID
        self.itemVersionID = itemVersionID
        self.clientDeliveryID = clientDeliveryID
        self.dimensions = dimensions
        self.uploadIDs = uploadIDs
        self.skippedShotLabels = skippedShotLabels
        self.photoResults = photoResults
    }
}

public extension SiteDeliverySubmission {
    /// Resolves each captured result to exactly one received media id and keeps
    /// verbatim skip notes. Nil means the K-02 payload is incomplete or
    /// ambiguous and must not reach the server.
    func resolvedPhotoResults() -> [SiteRequestResolvedPhotoResult]? {
        guard let photoResults, !photoResults.isEmpty,
              Set(photoResults.map(\.id)).count == photoResults.count else { return nil }
        var mediaIDs = uploadIDs.makeIterator()
        var consumedMediaCount = 0
        var resolved: [SiteRequestResolvedPhotoResult] = []
        for result in photoResults {
            switch result.status {
            case .captured:
                guard let mediaID = mediaIDs.next(), !mediaID.isEmpty else { return nil }
                consumedMediaCount += 1
                resolved.append(SiteRequestResolvedPhotoResult(
                    id: result.id, label: result.label, status: .captured,
                    mediaID: mediaID))
            case .skipped:
                guard let note = result.skipNote?.trimmingCharacters(in: .whitespacesAndNewlines),
                      !note.isEmpty else { return nil }
                resolved.append(SiteRequestResolvedPhotoResult(
                    id: result.id, label: result.label, status: .skipped,
                    skipNote: note))
            }
        }
        guard consumedMediaCount == uploadIDs.count else { return nil }
        return resolved
    }
}

public enum SiteBinderProjection {
    public static func currentEntries(from history: [SiteBinderEntry]) -> [SiteBinderEntry] {
        let superseded = Set(history.compactMap(\.supersedesEntryID))
        return history.filter { !superseded.contains($0.id) }
    }
}

public struct SiteDeliveryReceipt: Codable, Hashable, Sendable {
    public let deliverableID: String
    public let clientDeliveryID: UUID
    public let receivedAt: Date
    public let duplicate: Bool

    public init(deliverableID: String, clientDeliveryID: UUID,
                receivedAt: Date, duplicate: Bool) {
        self.deliverableID = deliverableID
        self.clientDeliveryID = clientDeliveryID
        self.receivedAt = receivedAt
        self.duplicate = duplicate
    }
}

public protocol SiteRequestService: Sendable {
    func hub(projectID: String) async throws -> SiteProjectHub
    /// Every project party, unfiltered. `SiteRequestAssignee` drops a party with
    /// no phone; `PunchCourtResolver` must see it anyway, because a GC with no
    /// phone number is still the reason a punch item is not somebody else's.
    func fieldParties(projectID: String) async throws -> [FieldPartyRef]
    func createDraft(_ draft: SiteRequestDraft) async throws -> String
    func reviseItem(requestID: String, itemID: String,
                    revision: SiteRequestDraftItem) async throws -> String
    func send(requestID: String, expiresAt: Date) async throws
    func resend(requestID: String, expiresAt: Date) async throws
    func nudge(requestID: String, note: String?) async throws
    func revokeAccess(requestID: String, reason: String?) async throws
    func approve(itemID: String, deliverableID: String, roomID: String?) async throws
    func redo(itemID: String, note: String) async throws
    func close(requestID: String) async throws
}

public enum SiteRequestLifecycleAction: String, CaseIterable, Sendable {
    case resend
    case nudge
    case revokeAccess = "revoke_access"
    case close
}

public enum SiteRequestLifecyclePolicy {
    public static func allows(_ action: SiteRequestLifecycleAction,
                              for status: SiteRequestStatus,
                              hasSMSConsent: Bool = true) -> Bool {
        switch action {
        case .resend:
            return hasSMSConsent && [.sent, .inProgress, .delivered].contains(status)
        case .nudge:
            return [.sent, .inProgress, .delivered].contains(status)
        case .revokeAccess:
            return [.awaitingConsent, .sent, .inProgress, .delivered].contains(status)
        case .close:
            return status == .completed
        }
    }
}

public protocol GuestSiteRequestService: Sendable {
    func bootstrap(accessToken: String) async throws -> GuestSiteRequest
    func createUploadIntent(accessToken: String,
                            request: SiteUploadIntentRequest) async throws -> SiteUploadIntent
    func acknowledgeUpload(accessToken: String, uploadID: String,
                           request: SiteUploadIntentRequest) async throws -> SiteUploadReceipt
    func deliver(accessToken: String,
                 submission: SiteDeliverySubmission) async throws -> SiteDeliveryReceipt
}

public enum SiteRequestReceiptEvidence {
    public static func matches(_ record: SiteRequestOutboxRecord,
                               requestID: String,
                               items: [SiteRequestItem]) -> Bool {
        guard record.requestID == requestID,
              record.state == .delivered,
              record.serverDeliverableID?.trimmingCharacters(
                in: .whitespacesAndNewlines).isEmpty == false else { return false }
        return items.contains {
            $0.id == record.itemID && $0.versionID == record.itemVersionID
        }
    }
}

public extension GuestSiteRequest {
    /// Selects only an item the server says is currently open. Real guest
    /// deliveries therefore inherit request/item/version identity from the
    /// narrow bootstrap DTO instead of from route or screenshot fixtures.
    func deliverySubmission(
        for kit: SiteRequestKit,
        clientDeliveryID: UUID,
        dimensions: [SiteRequestDimension] = [],
        uploadIDs: [String] = [],
        skippedShotLabels: [String] = [],
        photoResults: [SiteRequestPhotoResult]? = nil
    ) -> SiteDeliverySubmission? {
        guard let item = items.first(where: {
            $0.kit == kit && ($0.status == .pending || $0.status == .redo)
        }) else { return nil }
        return SiteDeliverySubmission(
            requestID: request.id,
            itemID: item.id,
            itemVersionID: item.versionID,
            clientDeliveryID: clientDeliveryID,
            dimensions: dimensions,
            uploadIDs: uploadIDs,
            skippedShotLabels: skippedShotLabels,
            photoResults: photoResults)
    }
}

public enum SiteRequestMediaMIMEType {
    public static func value(forFilename filename: String) -> String {
        switch URL(fileURLWithPath: filename).pathExtension.lowercased() {
        case "heic": return "image/heic"
        case "heif": return "image/heif"
        case "jpg", "jpeg": return "image/jpeg"
        case "png": return "image/png"
        case "webp": return "image/webp"
        default: return "application/octet-stream"
        }
    }
}

public enum SiteRequestUploadIDs {
    public static func appending(_ uploadID: String, to existing: [String]) -> [String] {
        existing.contains(uploadID) ? existing : existing + [uploadID]
    }
}

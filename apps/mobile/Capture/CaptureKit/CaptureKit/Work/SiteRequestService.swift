//  SiteRequestService.swift
//  CaptureKit
//
//  P1 Site Request contracts shared by the designer and guest surfaces.
//  Guest access is deliberately an Edge API contract: no guest JWT, service-role
//  credential, or direct table/storage access crosses this seam.

import Foundation

public enum SiteRequestKit: String, Codable, CaseIterable, Sendable {
    case measureSet = "k01"
    case detailPhotos = "k02"

    public var title: String {
        switch self {
        case .measureSet: return "K-01 · Measure Set"
        case .detailPhotos: return "K-02 · Detail Photos"
        }
    }
}

public enum SiteRequestStatus: String, Codable, Sendable {
    case draft
    case awaitingConsent = "awaiting_consent"
    case sent
    case inProgress = "in_progress"
    case delivered
    case closed
    case expired
}

public enum SiteRequestItemStatus: String, Codable, Sendable {
    case pending
    case captured
    case uploading
    case delivered
    case approved
    case redo
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
    public let derivativePath: String?
    public let caption: String?

    public init(id: String, objectPath: String, mimeType: String,
                checksumSHA256: String, derivativePath: String? = nil,
                caption: String? = nil) {
        self.id = id
        self.objectPath = objectPath
        self.mimeType = mimeType
        self.checksumSHA256 = checksumSHA256
        self.derivativePath = derivativePath
        self.caption = caption
    }
}

public struct SiteRequestItem: Codable, Hashable, Identifiable, Sendable {
    public let id: String
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

    public init(id: String, versionID: String, version: Int = 1,
                kit: SiteRequestKit, title: String, guidance: String,
                roomID: String? = nil, roomName: String? = nil,
                status: SiteRequestItemStatus = .pending,
                dimensions: [SiteRequestDimension] = [],
                media: [SiteRequestMedia] = [], redoNote: String? = nil) {
        self.id = id
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
    public let occurredAt: Date
    public let actorName: String
    public let message: String

    public init(id: String, occurredAt: Date, actorName: String, message: String) {
        self.id = id
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
    public let roomID: String
    public let title: String
    public let kind: SiteRequestKit
    public let sourceDeliverableID: String
    public let supersedesEntryID: String?
    public let approvedBy: String
    public let approvedAt: Date
    public let dimensions: [SiteRequestDimension]
    public let media: [SiteRequestMedia]

    public init(id: String, roomID: String, title: String, kind: SiteRequestKit,
                sourceDeliverableID: String, supersedesEntryID: String? = nil,
                approvedBy: String, approvedAt: Date,
                dimensions: [SiteRequestDimension] = [], media: [SiteRequestMedia] = []) {
        self.id = id
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
}

public struct SiteProjectHub: Codable, Hashable, Sendable {
    public let projectID: String
    public let projectName: String
    public let requests: [SiteRequestSummary]
    public let reviewItems: [SiteRequestItem]
    public let rooms: [SiteBinderRoom]
    public let events: [SiteRequestEvent]

    public init(projectID: String, projectName: String,
                requests: [SiteRequestSummary], reviewItems: [SiteRequestItem],
                rooms: [SiteBinderRoom], events: [SiteRequestEvent]) {
        self.projectID = projectID
        self.projectName = projectName
        self.requests = requests
        self.reviewItems = reviewItems
        self.rooms = rooms
        self.events = events
    }
}

public struct SiteRequestDraftItem: Codable, Hashable, Sendable {
    public let kit: SiteRequestKit
    public let title: String
    public let guidance: String
    public let roomID: String?
    public let sortOrder: Int

    public init(kit: SiteRequestKit, title: String, guidance: String,
                roomID: String?, sortOrder: Int) {
        self.kit = kit
        self.title = title
        self.guidance = guidance
        self.roomID = roomID
        self.sortOrder = sortOrder
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

    public init(requestID: String, itemID: String, itemVersionID: String,
                clientDeliveryID: UUID, dimensions: [SiteRequestDimension] = [],
                uploadIDs: [String] = [], skippedShotLabels: [String] = []) {
        self.requestID = requestID
        self.itemID = itemID
        self.itemVersionID = itemVersionID
        self.clientDeliveryID = clientDeliveryID
        self.dimensions = dimensions
        self.uploadIDs = uploadIDs
        self.skippedShotLabels = skippedShotLabels
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
    func createDraft(_ draft: SiteRequestDraft) async throws -> String
    func reviseItem(requestID: String, itemID: String,
                    revision: SiteRequestDraftItem) async throws -> String
    func send(requestID: String, expiresAt: Date) async throws
    func resend(requestID: String, expiresAt: Date) async throws
    func approve(itemID: String, deliverableID: String, roomID: String?) async throws
    func redo(itemID: String, note: String) async throws
    func close(requestID: String) async throws
}

public protocol GuestSiteRequestService: Sendable {
    func bootstrap(accessToken: String) async throws -> GuestSiteRequest
    func createUploadIntent(accessToken: String,
                            request: SiteUploadIntentRequest) async throws -> SiteUploadIntent
    func acknowledgeUpload(accessToken: String, uploadID: String,
                           checksumSHA256: String) async throws -> SiteUploadReceipt
    func deliver(accessToken: String,
                 submission: SiteDeliverySubmission) async throws -> SiteDeliveryReceipt
}

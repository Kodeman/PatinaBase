//  SiteRequestMocks.swift
//  CaptureKitMocks
//
//  Stable SR01–SR20 fixtures and mock service conformer. The fixture IDs are
//  deterministic so launch-arg screenshots never depend on network state.

import Foundation
import CaptureKit

public enum SiteRequestFixtures {
    public static let projectID = WorkFixtures.projectID
    public static let requestID = "req-site-001"
    public static let measureItemID = "item-measure-001"
    public static let measureVersionID = "version-measure-001"
    public static let photoItemID = "item-photo-001"
    public static let photoVersionID = "version-photo-001"
    public static let deliverableID = "delivery-site-001"
    public static let guestToken = "fixture-opaque-request-token"
    public static let redoNote = "Re-shoot in daylight — glare hides the grout line."
    public static let now = Date(timeIntervalSince1970: 1_787_865_600) // 2026-08-28

    public static let assignee = SiteRequestAssignee(
        partyID: "party-dan-k",
        name: "Dan K.",
        normalizedPhone: "+16085550142",
        trade: "Kippley Custom Carpentry",
        smsConsentGranted: true)

    public static let dimensions: [SiteRequestDimension] = [
        SiteRequestDimension(id: "dim-a", label: "A · floor → sill", millimetres: 1_051,
                             capturedBy: "Dan K.", capturedAt: now.addingTimeInterval(-180),
                             proofAssetPath: "site-requests/req-site-001/version-measure-001/a/proof.jpg"),
        SiteRequestDimension(id: "dim-b", label: "B · sill → head", millimetres: 654,
                             capturedBy: "Dan K.", capturedAt: now.addingTimeInterval(-120)),
        SiteRequestDimension(id: "dim-c", label: "C · run length", millimetres: 2_445,
                             capturedBy: "Dan K.", capturedAt: now.addingTimeInterval(-60))
    ]

    public static let media: [SiteRequestMedia] = (1...4).map { index in
        SiteRequestMedia(
            id: "media-\(index)",
            objectPath: "site-requests/req-site-001/version-photo-001/attempt-1/photo-\(index).jpg",
            mimeType: "image/jpeg",
            checksumSHA256: String(repeating: "\(index)", count: 64),
            derivativePath: "site-requests/req-site-001/version-photo-001/attempt-1/photo-\(index)-display.jpg",
            caption: ["Wide context", "Straight on", "Left return", "Grout detail"][index - 1])
    }

    public static let measureItem = SiteRequestItem(
        id: measureItemID, requestID: requestID,
        versionID: measureVersionID,
        kit: .measureSet,
        title: "Kitchen · west wall",
        guidance: "Inside face to inside face — ignore the trim.",
        roomID: "room-1",
        roomName: "Kitchen",
        status: .delivered,
        dimensions: dimensions,
        deliverableID: deliverableID,
        measureDefinitions: SiteRequestMeasureDefinition.p1MeasureSet)

    public static let photoItem = SiteRequestItem(
        id: photoItemID, requestID: requestID,
        versionID: photoVersionID,
        kit: .detailPhotos,
        title: "Photos · Vanity alcove",
        guidance: "Straight on — include the sconce.",
        roomID: "room-2",
        roomName: "Primary bath",
        status: .redo,
        media: media,
        redoNote: redoNote,
        deliverableID: deliverableID,
        photoShots: SiteRequestPhotoShot.p1DetailPhotos)

    public static let request = SiteRequestSummary(
        id: requestID,
        projectID: projectID,
        title: "Pre-drywall pass",
        status: .inProgress,
        assignee: assignee,
        dueAt: now.addingTimeInterval(86_400),
        dueContext: "before drywall",
        sentAt: now.addingTimeInterval(-24_000),
        openedAt: now.addingTimeInterval(-1_200),
        deliveredItemCount: 1,
        itemCount: 2)

    public static let binderEntries: [SiteBinderEntry] = [
        SiteBinderEntry(
            id: "binder-measure-current", requestID: requestID,
            itemID: measureItemID, itemVersionID: measureVersionID,
            roomID: "room-1", title: "Kitchen · west wall", kind: .measureSet,
            sourceDeliverableID: deliverableID,
            supersedesEntryID: "binder-measure-prior",
            approvedBy: "Leah", approvedAt: now,
            dimensions: dimensions),
        SiteBinderEntry(
            id: "binder-photo-current", requestID: requestID,
            itemID: photoItemID, itemVersionID: photoVersionID,
            roomID: "room-2", title: "Photos · Vanity alcove", kind: .detailPhotos,
            sourceDeliverableID: "delivery-photo-001",
            approvedBy: "Leah", approvedAt: now.addingTimeInterval(-300),
            media: media),
        SiteBinderEntry(
            id: "binder-measure-prior", requestID: requestID,
            itemID: measureItemID, itemVersionID: "version-measure-prior",
            roomID: "room-1", title: "Kitchen · west wall", kind: .measureSet,
            sourceDeliverableID: "delivery-measure-prior",
            approvedBy: "Leah", approvedAt: now.addingTimeInterval(-86_400),
            dimensions: [SiteRequestDimension(
                id: "dim-prior", label: "C · run length", millimetres: 2_432,
                capturedBy: "Dan K.", capturedAt: now.addingTimeInterval(-87_000))])
    ]

    public static let rooms: [SiteBinderRoom] = [
        SiteBinderRoom(id: "room-1", name: "Kitchen", dimensionCount: 3, photoCount: 0, updatedAt: now),
        SiteBinderRoom(id: "room-2", name: "Primary bath", dimensionCount: 0, photoCount: 4, updatedAt: now),
        SiteBinderRoom(id: "room-3", name: "Mudroom", dimensionCount: 0, photoCount: 0, updatedAt: nil)
    ]

    public static let events: [SiteRequestEvent] = [
        SiteRequestEvent(id: "event-1", occurredAt: now.addingTimeInterval(-60),
                         actorName: "Dan K.", message: "delivered Kitchen dimensions"),
        SiteRequestEvent(id: "event-2", occurredAt: now.addingTimeInterval(-1_200),
                         actorName: "Dan K.", message: "opened the request"),
        SiteRequestEvent(id: "event-3", occurredAt: now.addingTimeInterval(-24_000),
                         actorName: "You", message: "sent Pre-drywall pass")
    ]

    public static let hub = SiteProjectHub(
        projectID: projectID,
        projectName: "Killkenny West",
        requests: [request],
        reviewItems: [measureItem, photoItem],
        rooms: rooms,
        assignees: [assignee],
        events: events,
        binderEntries: binderEntries)

    public static let guest = GuestSiteRequest(
        request: request,
        designerName: "Leah",
        studioName: "Middlewest Studio",
        projectDisplayName: "Killkenny West",
        items: [measureItem, photoItem])
}

public actor MockSiteRequestService: SiteRequestService, GuestSiteRequestService {
    private var currentHub = SiteRequestFixtures.hub

    public init() {}

    public func hub(projectID _: String) async throws -> SiteProjectHub { currentHub }

    public func createDraft(_ draft: SiteRequestDraft) async throws -> String {
        "draft-\(draft.projectID)"
    }

    public func reviseItem(requestID _: String, itemID: String,
                           revision _: SiteRequestDraftItem) async throws -> String {
        "\(itemID)-v2"
    }

    public func send(requestID _: String, expiresAt _: Date) async throws {}
    public func resend(requestID _: String, expiresAt _: Date) async throws {}
    public func close(requestID _: String) async throws {}

    public func approve(itemID: String, deliverableID _: String, roomID _: String?) async throws {
        currentHub = replacingStatus(itemID: itemID, with: .approved)
    }

    public func redo(itemID: String, note: String) async throws {
        guard !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw MockSiteRequestError.redoNoteRequired
        }
        currentHub = replacingStatus(itemID: itemID, with: .redo)
    }

    public func bootstrap(accessToken _: String) async throws -> GuestSiteRequest {
        SiteRequestFixtures.guest
    }

    public func createUploadIntent(accessToken _: String,
                                   request: SiteUploadIntentRequest) async throws -> SiteUploadIntent {
        SiteUploadIntent(uploadID: "upload-\(request.clientDeliveryID.uuidString)",
                         objectPath: "site-requests/\(request.requestID)/\(request.itemVersionID)/attempt-1/\(request.filename)",
                         signedURL: URL(string: "https://example.invalid/upload")!,
                         expiresAt: SiteRequestFixtures.now.addingTimeInterval(900))
    }

    public func acknowledgeUpload(accessToken _: String, uploadID: String,
                                  request _: SiteUploadIntentRequest) async throws -> SiteUploadReceipt {
        SiteUploadReceipt(uploadID: uploadID,
                          objectPath: "site-requests/fixture/immutable-object.jpg",
                          checksumVerified: true)
    }

    public func deliver(accessToken _: String,
                        submission: SiteDeliverySubmission) async throws -> SiteDeliveryReceipt {
        SiteDeliveryReceipt(deliverableID: SiteRequestFixtures.deliverableID,
                            clientDeliveryID: submission.clientDeliveryID,
                            receivedAt: SiteRequestFixtures.now,
                            duplicate: false)
    }

    private func replacingStatus(itemID: String,
                                 with status: SiteRequestItemStatus) -> SiteProjectHub {
        let items = currentHub.reviewItems.map { item in
            guard item.id == itemID else { return item }
            return SiteRequestItem(
                id: item.id, requestID: item.requestID,
                versionID: item.versionID, version: item.version,
                kit: item.kit, title: item.title, guidance: item.guidance,
                roomID: item.roomID, roomName: item.roomName, status: status,
                dimensions: item.dimensions, media: item.media, redoNote: item.redoNote,
                deliverableID: item.deliverableID,
                measureDefinitions: item.measureDefinitions,
                photoShots: item.photoShots)
        }
        return SiteProjectHub(projectID: currentHub.projectID,
                              projectName: currentHub.projectName,
                              requests: currentHub.requests,
                              reviewItems: items,
                              rooms: currentHub.rooms,
                              assignees: currentHub.assignees,
                              events: currentHub.events,
                              binderEntries: currentHub.binderEntries,
                              currentBinderEntries: currentHub.currentBinderEntries)
    }
}

public enum MockSiteRequestError: Error, Equatable, Sendable {
    case redoNoteRequired
}

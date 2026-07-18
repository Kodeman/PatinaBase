//  SiteRequestTests.swift
//  CaptureTests
//
//  P1 K-01 canonical-unit and durable delivery-state contracts.

import Foundation
import Testing
@testable import CaptureKit

struct SiteRequestTests {
    @Test func imperialFractionsRoundToCanonicalIntegerMillimetres() throws {
        #expect(try SiteMeasurement.millimetres(fromImperial: "41 3/8 in") == 1_051)
        #expect(try SiteMeasurement.millimetres(fromImperial: "25¾") == 654)
        #expect(try SiteMeasurement.millimetres(fromImperial: "96 1/4") == 2_445)
        #expect(SiteMeasurement.imperialString(millimetres: 1_051) == "41 3/8 in")
    }

    @Test func imperialEntryQuantizesToOneSixteenth() throws {
        let millimetres = try SiteMeasurement.millimetres(fromImperial: "10.04")
        #expect(SiteMeasurement.imperialString(millimetres: millimetres) == "10 1/16 in")
    }

    @Test func metricEntryStoresRoundedIntegerMillimetres() throws {
        #expect(try SiteMeasurement.millimetres(fromMetric: "654.4 mm") == 654)
        #expect(try SiteMeasurement.millimetres(fromMetric: "654.6") == 655)
    }

    @Test func checksumIsStableSHA256() {
        #expect(SiteRequestChecksum.sha256(Data("abc".utf8))
                == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    @Test func outboxRequiresServerReceiptBeforeDelivered() throws {
        let record = makeRecord()
        try record.transition(to: .uploading)
        try record.transition(to: .awaitingReceipt)
        #expect(record.state == .awaitingReceipt)
        #expect(record.serverDeliverableID == nil)
        try record.transition(to: .delivered, serverDeliverableID: "delivery-1")
        #expect(record.state == .delivered)
        #expect(record.serverDeliverableID == "delivery-1")
    }

    @Test func invalidReceiptBypassIsRejected() {
        let record = makeRecord()
        #expect(throws: SiteRequestOutboxError.invalidTransition(from: .queued, to: .delivered)) {
            try record.transition(to: .delivered)
        }
    }

    @Test func failedRetryPreservesIdempotencyAndSchedulesBackoff() throws {
        let id = UUID()
        let record = makeRecord(id: id)
        let now = Date(timeIntervalSince1970: 100)
        try record.transition(to: .failed, error: "offline", now: now)
        #expect(record.clientDeliveryID == id)
        #expect(record.retryCount == 1)
        #expect(record.nextAttemptAt == now.addingTimeInterval(5))
        try record.transition(to: .queued)
        #expect(record.clientDeliveryID == id)
        #expect(record.nextAttemptAt == nil)
    }

    @MainActor
    @Test func storeEnqueueIsIdempotentByClientDeliveryID() throws {
        let store = try CaptureStore.inMemory()
        let id = UUID()
        let first = try store.enqueueSiteRequestDelivery(makeRecord(id: id))
        let duplicate = try store.enqueueSiteRequestDelivery(makeRecord(id: id))
        #expect(first === duplicate)
        #expect(store.siteRequestOutbox().count == 1)
    }

    @Test func nonFixtureBootstrapRoutesSubmissionToCurrentServerIDs() throws {
        let requestID = "8d464e30-2b71-4e47-b792-cf53184dc102"
        let itemID = "bd7497df-930a-463f-a680-1389ae3de6d5"
        let versionID = "9e5db203-9dd7-4cdc-b606-52f0407fc133"
        let assignee = SiteRequestAssignee(
            partyID: "6c5f2a86-cd57-49f6-83ed-ff2d0d6f9e28",
            name: "Sam", normalizedPhone: "", smsConsentGranted: true)
        let summary = SiteRequestSummary(
            id: requestID, projectID: "529c051a-5ccf-4948-bc7a-da020b08d951",
            title: "Real request", status: .inProgress, assignee: assignee,
            dueAt: Date(timeIntervalSince1970: 2_000_000_000),
            deliveredItemCount: 0, itemCount: 1)
        let bootstrap = GuestSiteRequest(
            request: summary, designerName: "Leah", studioName: "Middlewest",
            projectDisplayName: "Real project",
            items: [SiteRequestItem(
                id: itemID, requestID: requestID, versionID: versionID,
                kit: .measureSet, title: "Opening", guidance: "Inside face",
                status: .pending)])

        let clientID = UUID()
        let submission = try #require(bootstrap.deliverySubmission(
            for: .measureSet, clientDeliveryID: clientID))
        #expect(submission.requestID == requestID)
        #expect(submission.itemID == itemID)
        #expect(submission.itemVersionID == versionID)
        #expect(submission.clientDeliveryID == clientID)
    }

    @Test func bootstrapDoesNotRouteAlreadyDeliveredItem() {
        let assignee = SiteRequestAssignee(name: "Sam", normalizedPhone: "", smsConsentGranted: true)
        let summary = SiteRequestSummary(
            id: "request-real", projectID: "project-real", title: "Real request",
            status: .delivered, assignee: assignee, dueAt: Date(),
            deliveredItemCount: 1, itemCount: 1)
        let bootstrap = GuestSiteRequest(
            request: summary, designerName: "Leah", studioName: "Middlewest",
            projectDisplayName: "Real project",
            items: [SiteRequestItem(
                id: "item-real", versionID: "version-real", kit: .measureSet,
                title: "Opening", guidance: "Inside face", status: .delivered)])
        #expect(bootstrap.deliverySubmission(
            for: .measureSet, clientDeliveryID: UUID()) == nil)
    }

    @Test func guestAccessSessionRestoresPersistsAndClearsInjectedStore() throws {
        let store = InMemoryGuestAccessTokenStore(value: "restored-token")
        let first = GuestAccessSession(store: store)
        #expect(first.restore() == "restored-token")
        first.enter("new-token")
        #expect(GuestAccessSession(store: store).restore() == "new-token")
        first.leave()
        #expect(GuestAccessSession(store: store).restore() == nil)
    }

    @Test func mediaMIMETypeComesFromFilename() {
        #expect(SiteRequestMediaMIMEType.value(forFilename: "proof.HEIC") == "image/heic")
        #expect(SiteRequestMediaMIMEType.value(forFilename: "detail.jpeg") == "image/jpeg")
        #expect(SiteRequestMediaMIMEType.value(forFilename: "plan.png") == "image/png")
        #expect(SiteRequestMediaMIMEType.value(forFilename: "unknown") == "application/octet-stream")
    }

    @Test func uploadIDsRemainUniqueAcrossRetry() {
        #expect(SiteRequestUploadIDs.appending("media-1", to: ["media-1"]) == ["media-1"])
        #expect(SiteRequestUploadIDs.appending("media-2", to: ["media-1"]) == ["media-1", "media-2"])
    }

    private func makeRecord(id: UUID = UUID()) -> SiteRequestOutboxRecord {
        SiteRequestOutboxRecord(
            clientDeliveryID: id,
            requestID: "request-1",
            itemID: "item-1",
            itemVersionID: "item-version-1",
            payloadPath: "/tmp/site-delivery.json",
            checksumSHA256: String(repeating: "a", count: 64))
    }
}

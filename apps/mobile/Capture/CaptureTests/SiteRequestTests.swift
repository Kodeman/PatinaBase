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

    @Test func deliveredStateRequiresConcreteServerReceiptID() throws {
        let record = makeRecord()
        try record.transition(to: .uploading)
        try record.transition(to: .awaitingReceipt)
        #expect(throws: SiteRequestOutboxError.serverReceiptRequired) {
            try record.transition(to: .delivered)
        }
        #expect(record.state == .awaitingReceipt)
    }

    @Test func receiptEvidenceMustMatchRequestItemVersionAndServerID() throws {
        let record = makeRecord()
        try record.transition(to: .uploading)
        try record.transition(to: .awaitingReceipt)
        try record.transition(to: .delivered, serverDeliverableID: "delivery-1")
        let matchingItem = SiteRequestItem(
            id: record.itemID, versionID: record.itemVersionID,
            kit: .measureSet, title: "Opening", guidance: "Inside face")
        #expect(SiteRequestReceiptEvidence.matches(
            record, requestID: record.requestID, items: [matchingItem]))
        #expect(!SiteRequestReceiptEvidence.matches(
            record, requestID: "another-request", items: [matchingItem]))
        let changedVersion = SiteRequestItem(
            id: record.itemID, versionID: "new-version",
            kit: .measureSet, title: "Opening", guidance: "Inside face")
        #expect(!SiteRequestReceiptEvidence.matches(
            record, requestID: record.requestID, items: [changedVersion]))
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

    @Test func terminalFailureStopsRetryAndPersistsActionableReason() throws {
        let record = makeRecord()
        try record.transition(to: .uploading)
        try record.transition(
            to: .terminal,
            error: SiteRequestOutboxTerminalReason.requestChanged.userMessage,
            terminalReason: .requestChanged)
        #expect(record.state == .terminal)
        #expect(record.terminalReason == .requestChanged)
        #expect(record.nextAttemptAt == nil)
        #expect(!record.state.canTransition(to: .queued))
    }

    @Test func guestFailureClassificationSeparatesPermanentFromTransient() {
        #expect(SiteRequestFailureClassifier.disposition(
            status: 401, code: "invalid_or_expired_link") == .terminal(.invalidAccess))
        #expect(SiteRequestFailureClassifier.disposition(
            status: 404, code: "invalid_or_expired_link") == .terminal(.invalidAccess))
        #expect(SiteRequestFailureClassifier.disposition(
            status: 404, code: "not_found") == .terminal(.requestUnavailable))
        #expect(SiteRequestFailureClassifier.disposition(
            status: 409, code: "request_conflict") == .terminal(.requestChanged))
        #expect(SiteRequestFailureClassifier.disposition(
            status: 409, code: "receipt_checksum_mismatch") == .terminal(.checksumMismatch))
        #expect(SiteRequestFailureClassifier.disposition(
            status: 409, code: "receipt_not_ready") == .transient)
        #expect(SiteRequestFailureClassifier.disposition(
            status: 502, code: "upload_intent_failed") == .transient)
    }

    @Test func draftBuilderCreatesExactlySelectedBuiltInItems() {
        let choices = [
            SiteRequestDraftItemChoice(
                kit: .measureSet, isSelected: false, title: "Kitchen opening",
                guidance: "Inside face", roomID: "room-kitchen"),
            SiteRequestDraftItemChoice(
                kit: .detailPhotos, isSelected: true, title: "Bath detail",
                guidance: "Include sconce", roomID: "room-bath")
        ]
        let items = SiteRequestDraftBuilder.selectedItems(from: choices)
        #expect(items.count == 1)
        #expect(items[0].kit == .detailPhotos)
        #expect(items[0].roomID == "room-bath")
        #expect(items[0].sortOrder == 0)
        #expect(items[0].measureDefinitions.isEmpty)
        #expect(items[0].photoShots == SiteRequestPhotoShot.p1DetailPhotos)
    }

    @Test func lifecyclePolicyExposesOnlyServerSupportedActions() {
        #expect(SiteRequestLifecyclePolicy.allows(.resend, for: .sent, hasSMSConsent: true))
        #expect(!SiteRequestLifecyclePolicy.allows(.resend, for: .sent, hasSMSConsent: false))
        #expect(SiteRequestLifecyclePolicy.allows(.nudge, for: .inProgress))
        #expect(!SiteRequestLifecyclePolicy.allows(.nudge, for: .awaitingConsent))
        #expect(SiteRequestLifecyclePolicy.allows(.revokeAccess, for: .delivered))
        #expect(!SiteRequestLifecyclePolicy.allows(.close, for: .expired))
        #expect(!SiteRequestLifecyclePolicy.allows(.close, for: .closed))
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
        first.bind("new-token", to: "request-a")
        first.enter("other-token")
        first.bind("other-token", to: "request-b")
        #expect(first.accessToken(for: "request-a") == "new-token")
        #expect(first.accessToken(for: "request-b") == "other-token")
        first.leave(requestID: "request-b")
        #expect(first.accessToken(for: "request-a") == "new-token")
        #expect(first.accessToken(for: "request-b") == nil)
        first.enter("new-token")
        first.leave()
        #expect(GuestAccessSession(store: store).restore() == nil)
    }

    @Test func nativeTokenNamespaceDoesNotClaimLegacyCoordinationLinks() {
        #expect(SiteRequestAccessToken.isNativeSiteRequestToken(
            "sr_" + String(repeating: "a", count: 43)))
        #expect(!SiteRequestAccessToken.isNativeSiteRequestToken(
            String(repeating: "a", count: 64)))
        #expect(!SiteRequestAccessToken.isNativeSiteRequestToken("sr_too-short"))
        #expect(!SiteRequestAccessToken.isNativeSiteRequestToken(
            "sr_" + String(repeating: "/", count: 64)))
    }

    @Test func binderProjectionKeepsCurrentEntriesWithoutOverwritingHistory() {
        let now = Date()
        let prior = SiteBinderEntry(
            id: "prior", roomID: "room", title: "Opening", kind: .measureSet,
            sourceDeliverableID: "delivery-1", approvedBy: "Leah", approvedAt: now)
        let current = SiteBinderEntry(
            id: "current", roomID: "room", title: "Opening", kind: .measureSet,
            sourceDeliverableID: "delivery-2", supersedesEntryID: prior.id,
            approvedBy: "Leah", approvedAt: now.addingTimeInterval(1))
        let photo = SiteBinderEntry(
            id: "photo", roomID: "room", title: "Photos", kind: .detailPhotos,
            sourceDeliverableID: "delivery-3", approvedBy: "Leah", approvedAt: now)
        let history = [current, prior, photo]
        let projected = SiteBinderProjection.currentEntries(from: history)
        #expect(history.count == 3)
        #expect(Set(projected.map(\.id)) == Set(["current", "photo"]))
    }

    @Test func photoShotResultsSurviveDurablePayloadRoundTrip() throws {
        let submission = SiteDeliverySubmission(
            requestID: "request", itemID: "item", itemVersionID: "version",
            clientDeliveryID: UUID(), skippedShotLabels: ["Detail"],
            photoResults: [
                SiteRequestPhotoResult(id: "wide", label: "Wide", status: .captured),
                SiteRequestPhotoResult(id: "detail", label: "Detail", status: .skipped,
                                       skipNote: "Cabinet is wrapped")
            ])
        let data = try JSONEncoder().encode(submission)
        let decoded = try JSONDecoder().decode(SiteDeliverySubmission.self, from: data)
        #expect(decoded.photoResults == submission.photoResults)
    }

    @Test func configuredPhotoResultsMapEveryReceivedMediaExactlyOnce() throws {
        let submission = SiteDeliverySubmission(
            requestID: "request", itemID: "item", itemVersionID: "version",
            clientDeliveryID: UUID(), uploadIDs: ["media-wide", "media-detail"],
            skippedShotLabels: ["Straight on"], photoResults: [
                SiteRequestPhotoResult(id: "wide_context", label: "Wide context", status: .captured),
                SiteRequestPhotoResult(id: "straight_on", label: "Straight on", status: .skipped,
                                       skipNote: "Scaffolding blocks this angle"),
                SiteRequestPhotoResult(id: "detail", label: "Close detail", status: .captured)
            ])
        let results = try #require(submission.resolvedPhotoResults())
        #expect(results.map(\.id) == ["wide_context", "straight_on", "detail"])
        #expect(results.compactMap(\.mediaID) == ["media-wide", "media-detail"])
        #expect(results[1].skipNote == "Scaffolding blocks this angle")

        let extraMedia = SiteDeliverySubmission(
            requestID: "request", itemID: "item", itemVersionID: "version",
            clientDeliveryID: UUID(), uploadIDs: ["one", "orphan"],
            photoResults: [SiteRequestPhotoResult(
                id: "wide", label: "Wide", status: .captured)])
        #expect(extraMedia.resolvedPhotoResults() == nil)
    }

    @Test func mediaMIMETypeComesFromFilename() {
        #expect(SiteRequestMediaMIMEType.value(forFilename: "proof.HEIC") == "image/heic")
        #expect(SiteRequestMediaMIMEType.value(forFilename: "detail.jpeg") == "image/jpeg")
        #expect(SiteRequestMediaMIMEType.value(forFilename: "plan.png") == "image/png")
        #expect(SiteRequestMediaMIMEType.value(forFilename: "unknown") == "application/octet-stream")
    }

    @Test func mediaDisplayPathPrefersValidatedPreviewThenOriginal() {
        let original = "11111111-1111-1111-1111-111111111111/"
            + "22222222-2222-2222-2222-222222222222/1/original.heic"
        let preview = "11111111-1111-1111-1111-111111111111/"
            + "22222222-2222-2222-2222-222222222222/1/derivatives/media_1600.jpg"
        #expect(SiteRequestMediaDisplayPath.candidates(
            originalPath: original, previewPath: preview) == [preview, original])

        let foreignPreview = "33333333-3333-3333-3333-333333333333/"
            + "22222222-2222-2222-2222-222222222222/1/derivatives/media_1600.jpg"
        #expect(SiteRequestMediaDisplayPath.candidates(
            originalPath: original, previewPath: foreignPreview) == [original])
        #expect(SiteRequestMediaDisplayPath.candidates(
            originalPath: original, previewPath: "../private.jpg") == [original])
    }

    @Test func signedMediaCapabilityNeverEntersDurableEncoding() throws {
        let signedURL = try #require(URL(
            string: "https://storage.example.invalid/object?token=secret-capability"))
        let media = SiteRequestMedia(
            id: "media", objectPath: "request/version/1/original.jpg",
            mimeType: "image/jpeg", checksumSHA256: String(repeating: "a", count: 64),
            previewPath: "request/version/1/derivatives/media_1600.jpg",
            caption: "Wide context", signedDisplayURL: signedURL)
        let encoded = try JSONEncoder().encode(media)
        let encodedText = try #require(String(data: encoded, encoding: .utf8))
        #expect(!encodedText.contains("secret-capability"))
        #expect(!encodedText.contains("signedDisplayURL"))

        let decoded = try JSONDecoder().decode(SiteRequestMedia.self, from: encoded)
        #expect(decoded.signedDisplayURL == nil)
        #expect(decoded.previewPath == media.previewPath)
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

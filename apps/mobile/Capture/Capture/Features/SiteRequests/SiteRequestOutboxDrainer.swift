//  SiteRequestOutboxDrainer.swift
//  Capture
//
//  Relaunch-safe P1 delivery runner. Immutable clientDeliveryID values make
//  upload intents and delivery receipts idempotent; local `delivered` is written
//  only after the server receipt returns.

import Foundation
import CaptureKit

@MainActor
final class SiteRequestOutboxDrainer {
    private let store: CaptureStore
    private let remote: any GuestSiteRequestService
    private var isDraining = false

    init(store: CaptureStore, remote: any GuestSiteRequestService) {
        self.store = store
        self.remote = remote
    }

    func resume(accessToken: String) async {
        guard !isDraining else { return }
        isDraining = true
        defer { isDraining = false }
        let now = Date()
        for record in store.siteRequestOutbox().filter({
            $0.state != .delivered && ($0.nextAttemptAt == nil || $0.nextAttemptAt! <= now)
        }) {
            await drain(record, accessToken: accessToken)
        }
    }

    private func drain(_ record: SiteRequestOutboxRecord, accessToken: String) async {
        do {
            if record.state == .uploading {
                try store.transitionSiteRequestDelivery(record, to: .queued)
            } else if record.state == .failed {
                try store.transitionSiteRequestDelivery(record, to: .queued)
            }

            var submission = try loadSubmission(at: record.payloadPath)
            if record.state == .queued {
                try store.transitionSiteRequestDelivery(record, to: .uploading)
                let uploadIDs = try await uploadMedia(
                    record: record, existing: submission.uploadIDs, accessToken: accessToken)
                submission = SiteDeliverySubmission(
                    requestID: submission.requestID,
                    itemID: submission.itemID,
                    itemVersionID: submission.itemVersionID,
                    clientDeliveryID: submission.clientDeliveryID,
                    dimensions: submission.dimensions,
                    uploadIDs: uploadIDs,
                    skippedShotLabels: submission.skippedShotLabels)
                try saveSubmission(submission, at: record.payloadPath)
                try store.transitionSiteRequestDelivery(record, to: .awaitingReceipt)
            }

            guard record.state == .awaitingReceipt else { return }
            let receipt = try await remote.deliver(accessToken: accessToken, submission: submission)
            guard receipt.clientDeliveryID == record.clientDeliveryID else {
                throw SiteRequestRemoteError.invalidResponse
            }
            try store.transitionSiteRequestDelivery(
                record, to: .delivered, serverDeliverableID: receipt.deliverableID)
        } catch {
            if record.state != .delivered {
                try? store.transitionSiteRequestDelivery(
                    record, to: .failed, error: error.localizedDescription)
            }
        }
    }

    private func uploadMedia(record: SiteRequestOutboxRecord, existing: [String],
                             accessToken: String) async throws -> [String] {
        var uploadIDs = existing
        for path in record.mediaPaths {
            let url = URL(fileURLWithPath: path)
            let data = try Data(contentsOf: url)
            let checksum = SiteRequestChecksum.sha256(data)
            let intent = try await remote.createUploadIntent(
                accessToken: accessToken,
                request: SiteUploadIntentRequest(
                    requestID: record.requestID,
                    itemVersionID: record.itemVersionID,
                    clientDeliveryID: record.clientDeliveryID,
                    filename: url.lastPathComponent,
                    mimeType: "image/heic",
                    byteCount: data.count,
                    checksumSHA256: checksum))
            var request = URLRequest(url: intent.signedURL)
            request.httpMethod = "PUT"
            request.setValue("image/heic", forHTTPHeaderField: "Content-Type")
            let (_, response) = try await URLSession.shared.upload(for: request, from: data)
            guard let http = response as? HTTPURLResponse,
                  (200..<300).contains(http.statusCode) else {
                throw SiteRequestRemoteError.invalidResponse
            }
            let receipt = try await remote.acknowledgeUpload(
                accessToken: accessToken,
                uploadID: intent.uploadID,
                checksumSHA256: checksum)
            guard receipt.checksumVerified else { throw SiteRequestRemoteError.invalidResponse }
            uploadIDs.append(intent.uploadID)
        }
        return uploadIDs
    }

    private func loadSubmission(at path: String) throws -> SiteDeliverySubmission {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(SiteDeliverySubmission.self,
                                  from: Data(contentsOf: URL(fileURLWithPath: path)))
    }

    private func saveSubmission(_ submission: SiteDeliverySubmission, at path: String) throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        try encoder.encode(submission).write(to: URL(fileURLWithPath: path), options: .atomic)
    }
}

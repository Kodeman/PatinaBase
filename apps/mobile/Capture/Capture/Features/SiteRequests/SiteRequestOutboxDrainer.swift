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

    func resume(accessTokenForRequest: (String) -> String?) async {
        guard !isDraining else { return }
        isDraining = true
        defer { isDraining = false }
        let now = Date()
        for record in store.siteRequestOutbox().filter({
            $0.state != .delivered && $0.state != .terminal
                && ($0.nextAttemptAt == nil || $0.nextAttemptAt! <= now)
        }) {
            guard let accessToken = accessTokenForRequest(record.requestID) else {
                continue
            }
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
                    record: record, submission: submission, accessToken: accessToken)
                submission = replacingUploadIDs(uploadIDs, in: submission)
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
                if let terminalReason = (error as? SiteRequestRemoteError)?.terminalOutboxReason {
                    try? store.transitionSiteRequestDelivery(
                        record, to: .terminal,
                        error: terminalReason.userMessage,
                        terminalReason: terminalReason)
                } else if record.state != .terminal {
                    try? store.transitionSiteRequestDelivery(
                        record, to: .failed, error: error.localizedDescription)
                }
            }
        }
    }

    private func uploadMedia(record: SiteRequestOutboxRecord,
                             submission: SiteDeliverySubmission,
                             accessToken: String) async throws -> [String] {
        var uploadIDs = submission.uploadIDs
        for path in record.mediaPaths {
            let url = URL(fileURLWithPath: path)
            let data = try Data(contentsOf: url)
            let checksum = SiteRequestChecksum.sha256(data)
            let mimeType = SiteRequestMediaMIMEType.value(forFilename: url.lastPathComponent)
            let intentRequest = SiteUploadIntentRequest(
                requestID: record.requestID,
                itemVersionID: record.itemVersionID,
                clientDeliveryID: record.clientDeliveryID,
                filename: url.lastPathComponent,
                mimeType: mimeType,
                byteCount: data.count,
                checksumSHA256: checksum)
            let intent = try await remote.createUploadIntent(
                accessToken: accessToken,
                request: intentRequest)
            if uploadIDs.contains(intent.uploadID) { continue }

            // A process may have died after storage accepted the bytes but
            // before the payload recorded the media id. Receipt-first resumes
            // that attempt without issuing a second immutable PUT.
            var receipt = try? await remote.acknowledgeUpload(
                accessToken: accessToken, uploadID: intent.uploadID, request: intentRequest)
            if receipt?.checksumVerified != true {
                var request = URLRequest(url: intent.signedURL)
                request.httpMethod = "PUT"
                request.setValue("false", forHTTPHeaderField: "x-upsert")
                let multipart = signedUploadBody(
                    data: data, filename: url.lastPathComponent, mimeType: mimeType)
                request.setValue(
                    "multipart/form-data; boundary=\(multipart.boundary)",
                    forHTTPHeaderField: "Content-Type")
                let (_, response) = try await URLSession.shared.upload(
                    for: request, from: multipart.data)
                guard let http = response as? HTTPURLResponse,
                      (200..<300).contains(http.statusCode) else {
                    throw SiteRequestRemoteError.invalidResponse
                }
                receipt = try await remote.acknowledgeUpload(
                    accessToken: accessToken, uploadID: intent.uploadID, request: intentRequest)
            }
            guard receipt?.checksumVerified == true else {
                throw SiteRequestRemoteError.invalidResponse
            }
            uploadIDs = SiteRequestUploadIDs.appending(intent.uploadID, to: uploadIDs)
            try saveSubmission(
                replacingUploadIDs(uploadIDs, in: submission), at: record.payloadPath)
        }
        return uploadIDs
    }

    private func signedUploadBody(data: Data, filename: String, mimeType: String)
        -> (boundary: String, data: Data) {
        let boundary = "PatinaSiteRequest-\(UUID().uuidString)"
        var body = Data()
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"cacheControl\"\r\n\r\n".utf8))
        body.append(Data("3600\r\n".utf8))
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"\"; filename=\"\(filename)\"\r\n".utf8))
        body.append(Data("Content-Type: \(mimeType)\r\n\r\n".utf8))
        body.append(data)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        return (boundary, body)
    }

    private func replacingUploadIDs(_ uploadIDs: [String],
                                    in submission: SiteDeliverySubmission) -> SiteDeliverySubmission {
        var proofIDs = uploadIDs.makeIterator()
        let dimensions = submission.dimensions.map { dimension in
            guard dimension.proofAssetPath != nil,
                  let proofMediaID = proofIDs.next() else { return dimension }
            return SiteRequestDimension(
                id: dimension.id, label: dimension.label,
                millimetres: dimension.millimetres,
                capturedBy: dimension.capturedBy,
                capturedAt: dimension.capturedAt,
                proofAssetPath: proofMediaID)
        }
        return SiteDeliverySubmission(
            requestID: submission.requestID,
            itemID: submission.itemID,
            itemVersionID: submission.itemVersionID,
            clientDeliveryID: submission.clientDeliveryID,
            dimensions: dimensions,
            uploadIDs: uploadIDs,
            skippedShotLabels: submission.skippedShotLabels,
            photoResults: submission.photoResults)
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

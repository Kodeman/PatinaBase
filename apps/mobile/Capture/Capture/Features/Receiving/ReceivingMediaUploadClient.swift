//  ReceivingMediaUploadClient.swift
//  Capture · Wave G (Receiving / goods-in)
//
//  Minimal port of the media service's upload-session flow, ported from
//  apps/mobile/Patina/Patina/Features/Receiving/ViewModels/MediaUploadClient.swift.
//  Protocol (services/media/src/modules/upload/upload.controller.ts — unchanged
//  by the recent BullMQ→Cloudflare-Queues media-worker migration; that swap is
//  the internal processing pipeline, not this client-facing HTTP contract):
//    1. POST {media}/v1/media/upload            → intent, returns a PAR URL
//    2. PUT  <parUrl>                            → raw bytes, direct to storage
//    3. POST {media}/v1/media/upload/<id>/confirm
//  Auth: Supabase JWT bearer (`client.auth.session.accessToken`), same client
//  Receiving's other Supabase calls use. The service binding and host are
//  configured by the active media-svc Cloudflare Worker unit.

import Foundation
import UIKit
import Supabase

/// Narrow, typed — the caller (`SupabaseReceivingService.uploadInspectionPhoto`)
/// treats any throw as "this photo failed", surfaced per-photo and retriable.
enum ReceivingMediaUploadError: LocalizedError {
    case imageEncodingFailed
    case invalidEndpoint
    case httpStatus(step: String, code: Int)
    case malformedResponse(step: String)

    var errorDescription: String? {
        switch self {
        case .imageEncodingFailed:
            return "Couldn't process that photo."
        case .invalidEndpoint:
            return "Photo upload is misconfigured."
        case .httpStatus(let step, let code):
            return "Photo upload failed (\(step) · \(code))."
        case .malformedResponse(let step):
            return "Photo upload returned an unexpected response (\(step))."
        }
    }
}

/// Single-purpose: `upload(_:)` in raw image `Data`, MediaAsset UUID string
/// out. Always JPEG-re-encodes — mirrors the reference client so whatever
/// format the photo library handed back (HEIC by default on-device) lands in
/// the media service's `ALLOWED_IMAGE_MIMES` allowlist as `image/jpeg`.
struct ReceivingMediaUploadClient {
    let client: SupabaseClient

    /// Media service origin — from `AppConfiguration` (launch-arg overridable
    /// via `-CaptureMediaBaseURL`).
    private static var baseURL: URL { AppConfiguration.mediaBaseURL }

    func upload(_ data: Data) async throws -> String {
        guard let image = UIImage(data: data),
              let jpegData = image.jpegData(compressionQuality: 0.85) else {
            throw ReceivingMediaUploadError.imageEncodingFailed
        }
        let token = try await client.auth.session.accessToken
        let intent = UploadIntent(kind: "IMAGE", filename: "receiving-\(UUID().uuidString).jpg",
                                  fileSize: jpegData.count, mimeType: "image/jpeg", role: nil)

        let session = try await requestUploadSession(intent: intent, token: token)
        try await putBytes(jpegData, to: session.parUrl, headers: session.headers)
        try await confirmUpload(sessionId: session.uploadSessionId, token: token)
        return session.assetId
    }

    // MARK: - Step 1: request upload session

    private func requestUploadSession(intent: UploadIntent, token: String) async throws -> UploadSessionResponse {
        let url = Self.baseURL.appendingPathComponent("/v1/media/upload")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(intent)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw ReceivingMediaUploadError.httpStatus(step: "intent",
                                                       code: (response as? HTTPURLResponse)?.statusCode ?? -1)
        }
        do {
            return try JSONDecoder().decode(UploadSessionResponse.self, from: data)
        } catch {
            throw ReceivingMediaUploadError.malformedResponse(step: "intent")
        }
    }

    // MARK: - Step 2: PUT bytes to the PAR URL

    private func putBytes(_ data: Data, to parURLString: String, headers: [String: String]?) async throws {
        guard let parURL = URL(string: parURLString) else {
            throw ReceivingMediaUploadError.invalidEndpoint
        }
        var request = URLRequest(url: parURL)
        request.httpMethod = "PUT"
        for (key, value) in headers ?? [:] {
            request.setValue(value, forHTTPHeaderField: key)
        }

        let (_, response) = try await URLSession.shared.upload(for: request, from: data)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw ReceivingMediaUploadError.httpStatus(step: "put",
                                                       code: (response as? HTTPURLResponse)?.statusCode ?? -1)
        }
    }

    // MARK: - Step 3: confirm upload

    private func confirmUpload(sessionId: String, token: String) async throws {
        let url = Self.baseURL.appendingPathComponent("/v1/media/upload/\(sessionId)/confirm")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(ConfirmBody(sessionId: sessionId))

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw ReceivingMediaUploadError.httpStatus(step: "confirm",
                                                       code: (response as? HTTPURLResponse)?.statusCode ?? -1)
        }
    }
}

// MARK: - Wire types (file-scope; camelCase matches the NestJS DTOs verbatim —
// this is a JSON REST body, not PostgREST, so no snake_case key mapping)

private struct UploadIntent: Encodable {
    let kind: String
    let filename: String
    let fileSize: Int
    let mimeType: String
    let role: String?
}

private struct UploadSessionResponse: Decodable {
    let assetId: String
    let uploadSessionId: String
    let parUrl: String
    let targetKey: String
    let headers: [String: String]?
}

private struct ConfirmBody: Encodable {
    let sessionId: String
}

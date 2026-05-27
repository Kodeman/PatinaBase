//
//  MediaUploadClient.swift
//  Patina
//
//  Sprint 2 / Wave 2.4 — minimal client for the media service's
//  upload-session flow. Used by the iOS receiving flow to attach
//  inspection photos to `receiving_inspections.photo_asset_ids`.
//
//  Protocol (services/media/src/modules/upload/upload.controller.ts):
//    1. POST  {media}/v1/media/upload  with the upload intent
//       → { assetId, uploadSessionId, parUrl, targetKey, headers, expiresAt }
//    2. PUT bytes to `parUrl` (an OCI Pre-Authenticated Request, direct
//       to Object Storage; we forward `headers` from step 1)
//    3. POST {media}/v1/media/upload/{sessionId}/confirm
//       → { assetId, targetKey } — marks the session UPLOADED and lets
//       downstream processing pick it up.
//
//  Existing conventions read & followed:
//    - APIConfiguration (Services/API/APIConfiguration.swift) — pattern
//      for environment-aware base URLs. iOS doesn't yet have a media-
//      service URL slot, so we resolve one inline (mirrors the
//      cloud/self-hosted/local triple the file uses).
//    - SupabaseClientManager.shared.client.auth.session.accessToken —
//      Bearer-token pattern from DecisionsAPIClient.swift (auth header
//      for NestJS services via `Authorization: Bearer <jwt>`).
//    - URLSession.shared + async/await — same as the existing API
//      clients. No actor / no protocol — single concrete struct.
//    - Errors via a local `enum MediaUploadFailure: Error` — narrowly
//      scoped (not a kitchen-sink NetworkError). Caller treats any
//      throw as "fail the submit" per the W2.4 dossier.
//
//  Out of scope:
//    - Background uploads, retry, parallel TaskGroup (3 photos max,
//      sequential is the v1 default).
//    - HEIC handling — we always JPEG-encode (smallest reliable
//      payload). The media service accepts image/jpeg per the upload
//      service's ALLOWED_IMAGE_MIMES list.
//

import Foundation
import UIKit
import Supabase

/// Errors thrown by `MediaUploadClient`. Intentionally narrow — the
/// receive-delivery view model only branches on "did the whole thing
/// succeed" vs "didn't" and surfaces a generic message.
enum MediaUploadFailure: Error {
    /// Couldn't encode the UIImage as JPEG (extremely rare; CGImage missing).
    case imageEncodingFailed
    /// Missing or bad URL from APIConfiguration — should not happen at runtime.
    case invalidEndpoint
    /// Non-2xx response from any of the three calls. Includes the step
    /// for debug logging.
    case httpStatus(step: String, code: Int)
    /// Upload response body didn't decode into the expected shape.
    case malformedResponse(step: String)
}

/// Minimal client for the media service's upload-session flow. Single
/// `upload(_:)` entry point; throws on any failure so the caller can
/// fail the whole submit.
struct MediaUploadClient {

    // MARK: - Base URL

    /// Media-service base URL, mirroring the APIConfiguration deployment
    /// triple. Hardcoded here because APIConfiguration doesn't yet have
    /// a media slot — keeping the change scoped to this file rather than
    /// editing the configuration enum (other features don't need it yet).
    ///
    /// TODO: confirm endpoint with Kody — using `https://media.patina.cloud`
    /// for self-hosted (matches infra/cloudflare-tunnel-config.yml line 78).
    private static var baseURL: URL {
        switch DeploymentTarget.current {
        case .cloud, .selfHosted:
            return URL(string: "https://media.patina.cloud")!
        case .local:
            return URL(string: "http://localhost:3014")!
        }
    }

    // MARK: - Public API

    /// Upload a single image to the media service. Returns the
    /// `MediaAsset.id` (UUID) suitable for writing into
    /// `receiving_inspections.photo_asset_ids`.
    ///
    /// Performs three sequential round-trips:
    ///   1. POST /v1/media/upload         (intent → PAR URL)
    ///   2. PUT  <parUrl>                 (raw bytes → OCI)
    ///   3. POST /v1/media/upload/<id>/confirm
    ///
    /// Any non-2xx, malformed body, or transport error throws. The
    /// caller (`ReceiveDeliveryViewModel.submit()`) treats one failure
    /// as fatal and aborts the inspection write — no partial state.
    func upload(_ image: UIImage) async throws -> UUID {
        guard let jpegData = image.jpegData(compressionQuality: 0.85) else {
            throw MediaUploadFailure.imageEncodingFailed
        }

        let token = try? await SupabaseClientManager.shared.client.auth.session.accessToken
        let filename = "receiving-\(UUID().uuidString).jpg"
        let intent = UploadIntent(
            kind: "IMAGE",
            filename: filename,
            fileSize: jpegData.count,
            mimeType: "image/jpeg",
            role: nil
        )

        let session = try await requestUploadSession(intent: intent, token: token)
        try await putBytes(jpegData, to: session.parUrl, headers: session.headers)
        try await confirmUpload(sessionId: session.uploadSessionId, token: token)

        guard let assetUUID = UUID(uuidString: session.assetId) else {
            throw MediaUploadFailure.malformedResponse(step: "intent")
        }
        return assetUUID
    }

    // MARK: - Step 1: request upload session

    private func requestUploadSession(
        intent: UploadIntent,
        token: String?
    ) async throws -> UploadSessionResponse {
        let url = Self.baseURL.appendingPathComponent("/v1/media/upload")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        request.timeoutInterval = APIConfiguration.uploadTimeout
        request.httpBody = try JSONEncoder().encode(intent)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw MediaUploadFailure.httpStatus(
                step: "intent",
                code: (response as? HTTPURLResponse)?.statusCode ?? -1
            )
        }
        do {
            return try JSONDecoder().decode(UploadSessionResponse.self, from: data)
        } catch {
            throw MediaUploadFailure.malformedResponse(step: "intent")
        }
    }

    // MARK: - Step 2: PUT bytes to PAR URL

    private func putBytes(
        _ data: Data,
        to parUrlString: String,
        headers: [String: String]?
    ) async throws {
        guard let parUrl = URL(string: parUrlString) else {
            throw MediaUploadFailure.invalidEndpoint
        }
        var request = URLRequest(url: parUrl)
        request.httpMethod = "PUT"
        request.timeoutInterval = APIConfiguration.uploadTimeout
        // The intent response carries the required `x-content-type` header.
        for (key, value) in (headers ?? [:]) {
            request.setValue(value, forHTTPHeaderField: key)
        }
        let (_, response) = try await URLSession.shared.upload(for: request, from: data)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw MediaUploadFailure.httpStatus(
                step: "put",
                code: (response as? HTTPURLResponse)?.statusCode ?? -1
            )
        }
    }

    // MARK: - Step 3: confirm upload

    private func confirmUpload(sessionId: String, token: String?) async throws {
        let url = Self.baseURL.appendingPathComponent("/v1/media/upload/\(sessionId)/confirm")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        request.timeoutInterval = APIConfiguration.requestTimeout
        // The controller accepts `{ sessionId }` in the body even though it's
        // also in the path — mirror what the controller signature shows.
        request.httpBody = try JSONEncoder().encode(ConfirmBody(sessionId: sessionId))

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw MediaUploadFailure.httpStatus(
                step: "confirm",
                code: (response as? HTTPURLResponse)?.statusCode ?? -1
            )
        }
    }
}

// MARK: - Wire types (private to this file)

/// Matches `UploadIntent` in services/media/src/modules/upload/upload.service.ts.
/// `kind` is the Prisma `AssetKind` enum — we only send IMAGE.
private struct UploadIntent: Encodable {
    let kind: String              // "IMAGE"
    let filename: String
    let fileSize: Int
    let mimeType: String
    let role: String?             // nil — HERO/etc. don't apply to inspections
}

/// Matches the controller's 200 response example.
private struct UploadSessionResponse: Decodable {
    let assetId: String
    let uploadSessionId: String
    let parUrl: String
    let targetKey: String
    let headers: [String: String]?
    // `expiresAt` is sent but we don't act on it — the PAR has a 15-min TTL
    // and uploads happen immediately. Left out of the decode to avoid date-
    // format coupling.
}

private struct ConfirmBody: Encodable {
    let sessionId: String
}

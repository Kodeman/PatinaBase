//  MediaUploadIntentClient.swift
//  CaptureKit
//
//  PROVENANCE: a DUPLICATE of the client app's
//  `apps/mobile/Patina/Patina/Services/Sync/MediaUploadIntentClient.swift`
//  (W3-B), kept seam-for-seam identical on purpose. The two apps share no Swift
//  module — CaptureKit is a framework built only into Patina Field, and the
//  client app has no package to import it from — so the choice was duplicate or
//  invent a cross-app module. Duplicated. When the interface moves, BOTH copies
//  move; the shape below is the diff target.
//
//  Client for the Phase-2 media upload interface on the edge API worker
//  (`infra/edge-api-worker/src/media-uploads.ts`, OPERATIONS.md "Media upload
//  interface"):
//
//    POST /v1/media/uploads                   -> intent  (201 new / 200 repeat)
//    PUT  <putUrl>                            -> the bytes, straight to R2
//    POST /v1/media/uploads/:uploadId/confirm -> HEAD + compare + land `stored`
//
//  The three calls are one transaction from the caller's point of view, so
//  `upload(fileAt:request:)` drives all three; the individual steps stay
//  reachable because the shadow leg reports on each separately.
//
//  It lives in CaptureKit rather than the app target because CaptureTests links
//  ONLY CaptureKit (scripts/generate_project.rb) — a copy in `Capture/` would be
//  unreachable from a unit test.

import Foundation
import CryptoKit

/// Typed client for the edge API's upload-intent interface.
///
/// A value type with injected seams (`session`, `accessToken`, `refreshSession`)
/// rather than a singleton reaching for the app's Supabase client: CaptureKit is
/// deliberately supabase-swift-free (only the app target links it — see
/// `generate_project.rb`), so the session is a closure the app hands in, and the
/// leg stays exercisable without a signed-in app.
public struct MediaUploadIntentClient: Sendable {

    // MARK: - Artifact kinds

    /// The closed set the interface accepts — `UPLOAD_ARTIFACT_KINDS` in
    /// `media-uploads.ts`, which is THIS app's artifact vocabulary
    /// (`keys.py`'s `KIND_TO_FOLDER` + `KIND_TO_URL_COLUMN`, mirrored on-device
    /// by `ScanUploadDescriptor.all`). Unlike the client app — whose
    /// `ScanManifest.ArtifactKind` needed a hand-written translation — Field's
    /// descriptor `kind` strings ARE these names, so the mapping is a raw-value
    /// lookup and `ScanUploadDescriptorInterfaceTests` pins it.
    public enum ArtifactKind: String, Sendable, CaseIterable {
        case anchors
        case bundleManifest
        case capturedRoomJson
        case coverageHeatmap
        case depthArchive
        case depthIndex
        case heroFrame
        case keyframeIndex
        case keyframeSummary
        case keyframesArchive
        case mesh
        case photosManifest
        case scorecard
        case thumbnail
        case usdz
        case worldMap
    }

    // MARK: - Request

    public struct IntentRequest: Sendable, Equatable {
        public let scanId: UUID
        public let artifactKind: ArtifactKind
        public let filename: String
        public let declaredSha256: String
        public let declaredSize: Int
        public let declaredMime: String

        public init(
            scanId: UUID,
            artifactKind: ArtifactKind,
            filename: String,
            declaredSha256: String,
            declaredSize: Int,
            declaredMime: String
        ) {
            self.scanId = scanId
            self.artifactKind = artifactKind
            self.filename = filename
            self.declaredSha256 = declaredSha256
            self.declaredSize = declaredSize
            self.declaredMime = declaredMime
        }
    }

    // MARK: - Responses

    /// What an intent answered. The interface has exactly two shapes, and the
    /// difference is whether there is anything left to upload.
    public enum IntentOutcome: Sendable, Equatable {
        /// `pending` — a PUT capability was issued. Covers both a fresh intent
        /// (201) and a restatement of one still pending (200): identical body,
        /// and a re-issued URL for the same object is exactly what a client
        /// resuming an interrupted upload needs.
        case pending(PendingIntent)
        /// Already `stored`/`verified` — the worker refuses to sign a PUT for a
        /// row that has landed, so there is no `putUrl` and nothing to send.
        case alreadyStored(uploadId: String, lifecycle: String)
    }

    public struct PendingIntent: Sendable, Equatable {
        public let uploadId: String
        public let putUrl: URL
        /// Conditions baked into the signature. Sent verbatim, never
        /// synthesised — see `putBytes`.
        public let requiredHeaders: [String: String]
        public let expiresAt: String?

        public init(
            uploadId: String,
            putUrl: URL,
            requiredHeaders: [String: String],
            expiresAt: String?
        ) {
            self.uploadId = uploadId
            self.putUrl = putUrl
            self.requiredHeaders = requiredHeaders
            self.expiresAt = expiresAt
        }
    }

    public struct Confirmation: Sendable, Equatable {
        public let uploadId: String
        public let lifecycle: String
        public let sha256: String?
        public let etag: String?
        public let sizeBytes: Int?

        public init(
            uploadId: String,
            lifecycle: String,
            sha256: String?,
            etag: String?,
            sizeBytes: Int?
        ) {
            self.uploadId = uploadId
            self.lifecycle = lifecycle
            self.sha256 = sha256
            self.etag = etag
            self.sizeBytes = sizeBytes
        }
    }

    // MARK: - Errors

    public enum ClientError: Error, Sendable {
        /// No `EDGE_API_URL` configured — the interface is dormant, not broken.
        case notConfigured
        /// No Supabase access token available (signed out).
        case missingSession
        /// 401 from the worker, after a refresh-and-retry.
        case unauthorized
        /// 404 — unknown scan, invisible scan, unknown upload id, or an upload
        /// belonging to someone else. The interface answers all four alike on
        /// purpose; this client keeps them alike too.
        case notFound
        /// 400 from the worker: the body was not a shape the route accepts.
        case invalidRequest(String?)
        /// R2 refused the body against the signed digest — the bytes on disk do
        /// not hash to what the intent declared, and NOTHING was stored. Named
        /// apart from every other PUT failure because it is the only one that
        /// says the file changed under us rather than that the network or the
        /// credential failed.
        case badDigest
        /// Any other non-2xx from the presigned PUT. `code` is R2's XML error
        /// code when one could be read (e.g. `SignatureDoesNotMatch`).
        case putFailed(status: Int, code: String?)
        /// 409 from confirm. The registry row stays `pending`, so a re-PUT is
        /// the correct response — `upload(fileAt:request:)` makes exactly one.
        case mismatch(reason: String?)
        /// A response this client cannot interpret.
        case unexpectedResponse(status: Int)
        case transport(Error)
    }

    // MARK: - Seams

    private let baseURL: URL
    private let session: URLSession
    private let accessToken: @Sendable () async -> String?
    private let refreshSession: @Sendable () async -> Void

    public init(
        baseURL: URL,
        session: URLSession = .shared,
        accessToken: @escaping @Sendable () async -> String?,
        refreshSession: @escaping @Sendable () async -> Void = {}
    ) {
        self.baseURL = baseURL
        self.session = session
        self.accessToken = accessToken
        self.refreshSession = refreshSession
    }

    // MARK: - Digest

    /// Streaming sha256 of a file, lowercase hex.
    ///
    /// Streamed rather than `Data(contentsOf:)` because this runs against depth
    /// and keyframe archives that are hundreds of megabytes, and it runs on the
    /// SHADOW leg — a leg that must never be the reason the app is killed for
    /// memory while the primary upload is in flight.
    ///
    /// Same algorithm and output shape as `BundleChecksum.sha256(ofFile:)`; kept
    /// here rather than delegated so this file stays a literal diff of the
    /// client app's copy.
    public static func sha256Hex(ofFileAt url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        while let chunk = try handle.read(upToCount: 1 << 20), !chunk.isEmpty {
            hasher.update(data: chunk)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    public static func fileSize(ofFileAt url: URL) throws -> Int {
        let values = try url.resourceValues(forKeys: [.fileSizeKey])
        guard let size = values.fileSize else {
            throw CocoaError(.fileReadUnknown)
        }
        return size
    }

    // MARK: - The whole transaction

    /// Intent -> PUT -> confirm for one artifact.
    ///
    /// The 409 retry is deliberately ONE re-PUT and no more: a mismatch leaves
    /// the row `pending` and re-PUTting is the interface's own prescribed
    /// answer, but a second disagreement means the bytes and the declaration
    /// genuinely differ and looping would only spend bandwidth proving it.
    public func upload(
        fileAt fileURL: URL,
        request: IntentRequest
    ) async throws -> Confirmation {
        let pending: PendingIntent
        switch try await createIntent(request) {
        case .pending(let issued):
            pending = issued
        case .alreadyStored(let uploadId, let lifecycle):
            // Nothing to send and nothing to confirm. The registry only answers
            // this way for an EXACT restatement of an intent it already holds,
            // so the checksum on file is the one just declared.
            return Confirmation(
                uploadId: uploadId,
                lifecycle: lifecycle,
                sha256: request.declaredSha256,
                etag: nil,
                sizeBytes: request.declaredSize
            )
        }

        try await putBytes(from: fileURL, to: pending)

        do {
            return try await confirm(uploadId: pending.uploadId)
        } catch ClientError.mismatch {
            try await putBytes(from: fileURL, to: pending)
            return try await confirm(uploadId: pending.uploadId)
        }
    }

    // MARK: - Intent

    public func createIntent(_ request: IntentRequest) async throws -> IntentOutcome {
        let body: [String: Any] = [
            "scanId": request.scanId.uuidString.lowercased(),
            "artifactKind": request.artifactKind.rawValue,
            "filename": request.filename,
            "declaredSha256": request.declaredSha256,
            "declaredSize": request.declaredSize,
            "declaredMime": request.declaredMime
        ]
        let data = try await postJSON(path: "/v1/media/uploads", body: body)
        return try Self.decodeIntent(data)
    }

    static func decodeIntent(_ data: Data) throws -> IntentOutcome {
        guard
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let uploadId = json["uploadId"] as? String
        else {
            throw ClientError.unexpectedResponse(status: 200)
        }
        // No `putUrl` is the interface SAYING the object has landed, not an
        // omission — the worker refuses to sign a PUT for a non-pending row.
        guard
            let putUrlString = json["putUrl"] as? String,
            let putUrl = URL(string: putUrlString)
        else {
            return .alreadyStored(
                uploadId: uploadId,
                lifecycle: json["lifecycle"] as? String ?? "stored"
            )
        }
        let headers = (json["requiredHeaders"] as? [String: Any])?
            .compactMapValues { value -> String? in
                if let string = value as? String { return string }
                if let number = value as? NSNumber { return number.stringValue }
                return nil
            } ?? [:]
        return .pending(
            PendingIntent(
                uploadId: uploadId,
                putUrl: putUrl,
                requiredHeaders: headers,
                expiresAt: json["expiresAt"] as? String
            )
        )
    }

    // MARK: - PUT

    /// Send the bytes to R2 with EXACTLY the headers the intent named.
    ///
    /// `content-length` is set by URLSession from the file itself and is a
    /// reserved header it will not let us write — so the signed condition is
    /// met only while the file is the length we declared. That is checked here
    /// rather than assumed: a file that changed size since the intent would
    /// otherwise fail at R2 as an unexplained `SignatureDoesNotMatch`, and the
    /// local check names the real cause.
    public func putBytes(from fileURL: URL, to pending: PendingIntent) async throws {
        if let declared = pending.requiredHeaders["content-length"].flatMap(Int.init) {
            let actual = try Self.fileSize(ofFileAt: fileURL)
            guard actual == declared else {
                throw ClientError.putFailed(status: 0, code: "ContentLengthChanged")
            }
        }

        var request = URLRequest(url: pending.putUrl)
        request.httpMethod = "PUT"
        for (name, value) in pending.requiredHeaders where name.lowercased() != "content-length" {
            request.setValue(value, forHTTPHeaderField: name)
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.upload(for: request, fromFile: fileURL)
        } catch {
            throw ClientError.transport(error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw ClientError.unexpectedResponse(status: -1)
        }
        guard (200..<300).contains(http.statusCode) else {
            let code = Self.r2ErrorCode(in: data)
            if http.statusCode == 400 && code == "BadDigest" {
                throw ClientError.badDigest
            }
            throw ClientError.putFailed(status: http.statusCode, code: code)
        }
    }

    /// Pull `<Code>…</Code>` out of an S3/R2 XML error body. Deliberately a
    /// substring scan, not an XML parse: the body is a diagnostic, and a client
    /// that can only report failures it could fully parse reports fewer.
    static func r2ErrorCode(in data: Data) -> String? {
        guard let body = String(data: data.prefix(2048), encoding: .utf8) else { return nil }
        guard
            let open = body.range(of: "<Code>"),
            let close = body.range(of: "</Code>", range: open.upperBound..<body.endIndex)
        else { return nil }
        return String(body[open.upperBound..<close.lowerBound])
    }

    // MARK: - Confirm

    public func confirm(uploadId: String) async throws -> Confirmation {
        let path = "/v1/media/uploads/\(uploadId)/confirm"
        let data = try await postJSON(path: path, body: [:])
        guard
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let id = json["uploadId"] as? String
        else {
            throw ClientError.unexpectedResponse(status: 200)
        }
        return Confirmation(
            uploadId: id,
            lifecycle: json["lifecycle"] as? String ?? "stored",
            sha256: json["sha256"] as? String,
            etag: json["etag"] as? String,
            sizeBytes: (json["sizeBytes"] as? NSNumber)?.intValue
        )
    }

    // MARK: - Transport

    /// POST a JSON body to the worker and return the response body, mapping the
    /// interface's status vocabulary onto `ClientError`.
    ///
    /// A 401 buys exactly one refresh-and-retry. More than one turns a signed-out
    /// user into a refresh loop on every artifact of every scan.
    private func postJSON(path: String, body: [String: Any]) async throws -> Data {
        let data = try await attempt(path: path, body: body, allowRefresh: true)
        return data
    }

    private func attempt(
        path: String,
        body: [String: Any],
        allowRefresh: Bool
    ) async throws -> Data {
        guard let token = await accessToken(), !token.isEmpty else {
            throw ClientError.missingSession
        }
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            throw ClientError.notConfigured
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw ClientError.transport(error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw ClientError.unexpectedResponse(status: -1)
        }
        if http.statusCode == 401, allowRefresh {
            await refreshSession()
            return try await attempt(path: path, body: body, allowRefresh: false)
        }
        return try Self.body(of: http, data: data)
    }

    /// The interface's status vocabulary, mapped. Separated from `attempt` so
    /// the retry decision and the status mapping stay one thing each.
    static func body(of response: HTTPURLResponse, data: Data) throws -> Data {
        switch response.statusCode {
        case 200..<300:
            return data
        case 400:
            throw ClientError.invalidRequest(errorField("message", in: data))
        case 401:
            throw ClientError.unauthorized
        case 404:
            throw ClientError.notFound
        case 409:
            throw ClientError.mismatch(reason: errorField("reason", in: data))
        default:
            throw ClientError.unexpectedResponse(status: response.statusCode)
        }
    }

    static func errorField(_ key: String, in data: Data) -> String? {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return json[key] as? String
    }
}

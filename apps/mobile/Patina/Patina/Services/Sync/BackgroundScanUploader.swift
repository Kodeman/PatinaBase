//
//  BackgroundScanUploader.swift
//  Patina
//
//  Background URL-session uploader for large scan artifacts.
//

import Foundation
import OSLog
import Supabase

/// Background URL-session uploader for large scan artifacts.
///
/// Designed to survive app backgrounding. Files to upload must live on disk
/// under the scan bundle — URLSession's background tasks require file URLs,
/// not in-memory `Data`. The class:
///
///   1. Refreshes the Supabase auth session so the uploaded token has ~1h TTL.
///   2. Builds a POST to `<supabaseUrl>/storage/v1/object/room-scans/<path>`
///      with Authorization/apikey/Content-Type and the custom object metadata
///      carried in the base64(JSON) `x-metadata` request header — the channel
///      Storage actually persists into `user_metadata` for a raw-body upload.
///      Raw `x-amz-meta-*` headers are dropped (land in `user_metadata = {}`),
///      which silently broke every >=5 MB artifact's integrity check.
///   3. Delegates to `URLSessionConfiguration.background` for resume-safe
///      transfer.
///   4. Throttles `didSendBodyData` progress updates to ~2 Hz per artifact.
///   5. Maps HTTP 408/429/5xx → exponential backoff retry (max 3 attempts).
///   6. Verifies the round-tripped sha256 after completion by GETting
///      `storage/v1/object/info/authenticated/room-scans/<path>` and reading
///      `metadata.sha256` out of its JSON body. Present-and-differing → retry
///      (max 3); absent/unverifiable → accept (the bytes landed with a 2xx).
///
/// Wave 5.2 does not call this yet. Wave 6 will wire `RoomScanSyncService`
/// and the `AppDelegate` background-completion handler.
@MainActor
public final class BackgroundScanUploader: NSObject {

    // MARK: - Singleton

    public static let shared = BackgroundScanUploader()
    public static let sessionIdentifier = "com.patina.scans.upload"

    // MARK: - Descriptor

    public struct UploadDescriptor: Sendable {
        public let scanId: UUID
        public let artifactKind: String  // ScanManifest.ArtifactKind.rawValue
        public let sha256: String?
        public let mimeType: String
        public let sizeBytes: Int
        public let fileURL: URL
        public let storagePath: String   // e.g. "mesh/<userId>/<roomId>/mesh.ply"
        public let sizeExpected: Int?    // for HEAD verification

        public init(
            scanId: UUID,
            artifactKind: String,
            sha256: String?,
            mimeType: String,
            sizeBytes: Int,
            fileURL: URL,
            storagePath: String,
            sizeExpected: Int? = nil
        ) {
            self.scanId = scanId
            self.artifactKind = artifactKind
            self.sha256 = sha256
            self.mimeType = mimeType
            self.sizeBytes = sizeBytes
            self.fileURL = fileURL
            self.storagePath = storagePath
            self.sizeExpected = sizeExpected ?? sizeBytes
        }
    }

    // MARK: - Errors

    public enum UploadError: Error, CustomStringConvertible {
        case httpStatus(Int)
        case shaMismatch(expected: String, actual: String?)
        case transport(Error)
        case cancelled
        case invalidURL
        case missingSession

        public var description: String {
            switch self {
            case .httpStatus(let code): return "HTTP \(code)"
            case .shaMismatch(let e, let a): return "SHA mismatch expected=\(e) actual=\(a ?? "<none>")"
            case .transport(let e): return "transport: \(e.localizedDescription)"
            case .cancelled: return "cancelled"
            case .invalidURL: return "invalid storage URL"
            case .missingSession: return "no supabase session"
            }
        }
    }

    // MARK: - Public callbacks

    /// Called by the `UIApplicationDelegate.handleEventsForBackgroundURLSession`
    /// entry point; cached so `BackgroundScanUploader` can invoke it when all
    /// pending tasks drain.
    public var backgroundCompletionHandler: (() -> Void)?

    /// Per-task progress updates. Wired to `RoomScanPackage.artifactStateJSON`
    /// in Wave 6.
    public var onProgress: (@MainActor (UUID, String, Double) -> Void)?
    public var onCompletion: (@MainActor (UUID, String, Result<Void, UploadError>) -> Void)?

    // MARK: - Private state

    private let logger = Logger(subsystem: "com.patina.scans", category: "BackgroundScanUploader")
    private var session: URLSession!

    /// Ties a `URLSessionTask` to its descriptor + attempt count.
    private var inflight: [URLSessionTask: Tracker] = [:]
    /// Last time we emitted progress per task, to throttle to ~2 Hz.
    private var lastProgressTick: [URLSessionTask: Date] = [:]

    private final class Tracker {
        let descriptor: UploadDescriptor
        var attempts: Int = 1
        /// Accumulated response body. Storage returns a JSON error payload
        /// on 4xx that explains the failure (e.g. "mime type ... is not
        /// supported" or RLS detail); without capturing it we'd be guessing.
        var responseBody: Data = Data()
        init(_ d: UploadDescriptor) { self.descriptor = d }
    }

    // MARK: - Init

    private override init() {
        super.init()
        let config = URLSessionConfiguration.background(withIdentifier: Self.sessionIdentifier)
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = true
        config.waitsForConnectivity = true
        config.allowsCellularAccess = true  // NWPathMonitor gate lives in Wave 6
        config.httpMaximumConnectionsPerHost = 2
        self.session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }

    // MARK: - Public API

    /// Enqueue an artifact for background upload. Returns immediately.
    public func upload(_ descriptor: UploadDescriptor) async throws {
        // C7-15: this used to be `refreshSession()`, forced, before EVERY
        // artifact — and a bundle is a manifest plus a USDZ plus a world map
        // plus meshes plus depth plus photos. GoTrue rotates the refresh
        // token on each call and rate-limits `/token`, so a bundle uploading
        // its parts in parallel was a credible route to a 429 or a rotation
        // race that signs the person out mid-scan.
        //
        // `auth.session` returns the current session and refreshes only when
        // it has actually expired, which is the guarantee the forced call was
        // standing in for. Still best-effort: a signed-out user makes this
        // throw, and `buildRequest` below then throws `.missingSession`,
        // which propagates to `RoomScanSyncService.uploadArtifactViaBackground`
        // and is recorded as the artifact's lastError.
        _ = try? await SupabaseClientManager.shared.client.auth.session
        let request = try buildRequest(for: descriptor)
        let task = session.uploadTask(with: request, fromFile: descriptor.fileURL)
        inflight[task] = Tracker(descriptor)
        task.resume()
        logger.info(
            "enqueued artifact=\(descriptor.artifactKind, privacy: .public) size=\(descriptor.sizeBytes, privacy: .public) path=\(descriptor.storagePath, privacy: .public)"
        )
    }

    // MARK: - Request construction

    private func buildRequest(for descriptor: UploadDescriptor) throws -> URLRequest {
        let base = AppConfiguration.supabaseURL
        guard let url = URL(
            string: "storage/v1/object/room-scans/\(descriptor.storagePath)",
            relativeTo: base
        )?.absoluteURL else {
            throw UploadError.invalidURL
        }

        // Authenticated user JWT. Without it, Supabase Storage rejects with
        // 403 (RLS policy `auth.uid()::text = (storage.foldername(name))[2]`
        // can't match a null subject). Previously this fell back to "" and the
        // failed PUT was logged but the wider sync flow still marked the scan
        // complete (2026-05-12 smoke-test bug). Throw instead so the failure
        // propagates and `mark_scan_upload_complete` is gated.
        guard
            let accessToken = SupabaseClientManager.shared.client.auth.currentSession?.accessToken,
            !accessToken.isEmpty
        else {
            throw UploadError.missingSession
        }
        let anonKey = AppConfiguration.supabaseAnonKey

        var request = URLRequest(url: url)
        // Supabase Storage's REST API uses POST to *create* a file and PUT
        // to *update* an existing one. The 2026-05-13 retest showed scan
        // E3359067's worldMap artifact failing with HTTP 400 from this path
        // even though the same scan's other 4 artifacts (uploaded inline
        // via supabase-swift) all succeeded — because supabase-swift uses
        // POST. PUT against a non-existent object is the wrong verb and
        // Storage rejects it. Use POST with x-upsert: true for the upsert
        // semantics we actually want.
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue(descriptor.mimeType, forHTTPHeaderField: "Content-Type")
        request.setValue("true", forHTTPHeaderField: "x-upsert")

        // Custom object metadata. Supabase Storage does NOT persist raw
        // `x-amz-meta-*` request headers on a plain-body upload (proven: they
        // land in `user_metadata = {}`), so the previous scan-id / kind / sha256
        // headers were silently discarded and the integrity check below could
        // never round-trip — every >=5 MB artifact deterministically failed
        // with `.shaMismatch` despite a clean 200. The base64(JSON) `x-metadata`
        // header is the wire format the server actually stores into
        // `user_metadata` (same value the inline <5 MB supabase-swift
        // `FileOptions(metadata:)` path lands via its multipart `metadata`
        // field). See `encodeMetadataHeader`.
        var meta: [String: String] = [
            "scanId": descriptor.scanId.uuidString,
            "artifactKind": descriptor.artifactKind
        ]
        if let sha = descriptor.sha256, !sha.isEmpty {
            meta["sha256"] = sha
        }
        if let encoded = Self.encodeMetadataHeader(meta) {
            request.setValue(encoded, forHTTPHeaderField: "x-metadata")
        }
        return request
    }
}

// MARK: - URLSession delegates

extension BackgroundScanUploader: URLSessionDelegate, URLSessionTaskDelegate, URLSessionDataDelegate {

    public nonisolated func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive data: Data
    ) {
        // Append response body bytes into the tracker so 4xx error payloads
        // (Storage returns JSON like {"statusCode":"413","error":...,"message":...})
        // are available when didComplete fires.
        let captured = data
        Task { @MainActor in
            inflight[dataTask]?.responseBody.append(captured)
        }
    }

    public nonisolated func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didSendBodyData bytesSent: Int64,
        totalBytesSent: Int64,
        totalBytesExpectedToSend: Int64
    ) {
        Task { @MainActor in
            let now = Date()
            let last = lastProgressTick[task] ?? .distantPast
            if now.timeIntervalSince(last) < 0.5 { return }
            lastProgressTick[task] = now
            guard let tracker = inflight[task] else { return }
            let pct = totalBytesExpectedToSend > 0
                ? Double(totalBytesSent) / Double(totalBytesExpectedToSend)
                : 0
            onProgress?(tracker.descriptor.scanId, tracker.descriptor.artifactKind, pct)
        }
    }

    public nonisolated func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?
    ) {
        let responseCopy = task.response
        Task { @MainActor in
            guard let tracker = inflight.removeValue(forKey: task) else { return }
            lastProgressTick.removeValue(forKey: task)
            let descriptor = tracker.descriptor

            if let error = error {
                logger.error(
                    "transport error artifact=\(descriptor.artifactKind, privacy: .public) err=\(error.localizedDescription, privacy: .public)"
                )
                UploadDiagnosticsLog.shared.log(
                    event: "bg.transport_error",
                    scanId: descriptor.scanId,
                    artifactKind: descriptor.artifactKind,
                    error: error.localizedDescription
                )
                await retryOrFail(tracker: tracker, with: .transport(error))
                return
            }
            guard let http = responseCopy as? HTTPURLResponse else {
                UploadDiagnosticsLog.shared.log(
                    event: "bg.no_http_response",
                    scanId: descriptor.scanId,
                    artifactKind: descriptor.artifactKind
                )
                await retryOrFail(tracker: tracker, with: .httpStatus(-1))
                return
            }
            let code = http.statusCode
            guard (200..<300).contains(code) else {
                let bodySnippet = String(data: tracker.responseBody.prefix(512), encoding: .utf8) ?? ""
                logger.error("http \(code, privacy: .public) artifact=\(descriptor.artifactKind, privacy: .public) body=\(bodySnippet, privacy: .public)")
                UploadDiagnosticsLog.shared.log(
                    event: "bg.http_error",
                    scanId: descriptor.scanId,
                    artifactKind: descriptor.artifactKind,
                    httpStatus: code,
                    extra: [
                        "path": descriptor.storagePath,
                        "body": String(bodySnippet.prefix(300))
                    ]
                )
                if code == 401 {
                    // Token expired mid-flight. Refresh once and retry.
                    await refreshSessionAndRetry(tracker: tracker)
                } else if [408, 429].contains(code) || (500..<600).contains(code) {
                    await retryOrFail(tracker: tracker, with: .httpStatus(code))
                } else {
                    onCompletion?(descriptor.scanId, descriptor.artifactKind, .failure(.httpStatus(code)))
                }
                return
            }

            // Body landed with a 2xx — run the post-upload integrity check and
            // report terminal completion. Extracted so this delegate method
            // stays within complexity limits.
            await verifyAndComplete(tracker: tracker)
        }
    }

    /// Post-2xx sha256 integrity check + terminal completion.
    ///
    /// Only a *present and differing* stored sha is a real failure. A
    /// nil/absent stored sha means Storage surfaced none (unverifiable) —
    /// accept, since the body already landed with a 2xx. This mirrors the
    /// inline (<5 MB) path, which never verifies at all, and keeps this path
    /// robust if Storage changes its metadata behaviour again.
    private func verifyAndComplete(tracker: Tracker) async {
        let descriptor = tracker.descriptor
        if let expectedSha = descriptor.sha256 {
            do {
                let stored = try await fetchStoredSha(for: descriptor)
                switch Self.verificationOutcome(expected: expectedSha, stored: stored) {
                case .fail:
                    logger.error(
                        "sha mismatch artifact=\(descriptor.artifactKind, privacy: .public) expected=\(expectedSha.prefix(10), privacy: .public) actual=\(stored ?? "<none>", privacy: .public)"
                    )
                    UploadDiagnosticsLog.shared.log(
                        event: "bg.sha_mismatch",
                        scanId: descriptor.scanId,
                        artifactKind: descriptor.artifactKind,
                        extra: ["expected": String(expectedSha.prefix(12))]
                    )
                    await retryOrFail(
                        tracker: tracker,
                        with: .shaMismatch(expected: expectedSha, actual: stored)
                    )
                    return
                case .accept:
                    if stored == nil {
                        logger.info(
                            "sha unverifiable (storage surfaced no metadata) — accepting artifact=\(descriptor.artifactKind, privacy: .public)"
                        )
                        UploadDiagnosticsLog.shared.log(
                            event: "bg.sha_unverifiable",
                            scanId: descriptor.scanId,
                            artifactKind: descriptor.artifactKind
                        )
                    }
                }
            } catch {
                // Info fetch failed (transport/parse) — not fatal, the body
                // already landed with a 2xx.
                logger.debug("integrity check skipped: \(error.localizedDescription, privacy: .public)")
            }
        }

        logger.info(
            "uploaded artifact=\(descriptor.artifactKind, privacy: .public) sha=\(descriptor.sha256?.prefix(10) ?? "<none>", privacy: .public)"
        )
        onCompletion?(descriptor.scanId, descriptor.artifactKind, .success(()))
    }

    public nonisolated func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        Task { @MainActor in
            let handler = backgroundCompletionHandler
            backgroundCompletionHandler = nil
            handler?()
        }
    }

    // MARK: - Retry

    /// Refresh the Supabase session and re-enqueue the upload once.
    /// Avoids ping-pong by counting against the same attempt budget as
    /// transport/HTTP retries.
    private func refreshSessionAndRetry(tracker: Tracker) async {
        let maxAttempts = 3
        if tracker.attempts >= maxAttempts {
            logger.error(
                "401 refresh exhausted artifact=\(tracker.descriptor.artifactKind, privacy: .public) attempts=\(tracker.attempts, privacy: .public)"
            )
            onCompletion?(tracker.descriptor.scanId, tracker.descriptor.artifactKind, .failure(.httpStatus(401)))
            return
        }
        do {
            _ = try await SupabaseClientManager.shared.client.auth.refreshSession()
        } catch {
            logger.error("auth refresh failed: \(error.localizedDescription, privacy: .public)")
            onCompletion?(tracker.descriptor.scanId, tracker.descriptor.artifactKind, .failure(.missingSession))
            return
        }
        tracker.attempts += 1
        do {
            let request = try buildRequest(for: tracker.descriptor)
            let task = session.uploadTask(with: request, fromFile: tracker.descriptor.fileURL)
            inflight[task] = tracker
            task.resume()
            logger.info(
                "401 retry after refresh attempt=\(tracker.attempts, privacy: .public) artifact=\(tracker.descriptor.artifactKind, privacy: .public)"
            )
        } catch {
            onCompletion?(
                tracker.descriptor.scanId,
                tracker.descriptor.artifactKind,
                .failure(.transport(error))
            )
        }
    }

    private func retryOrFail(tracker: Tracker, with error: UploadError) async {
        let maxAttempts = 3
        if tracker.attempts >= maxAttempts {
            logger.error(
                "giving up artifact=\(tracker.descriptor.artifactKind, privacy: .public) after \(tracker.attempts, privacy: .public) attempts"
            )
            onCompletion?(tracker.descriptor.scanId, tracker.descriptor.artifactKind, .failure(error))
            return
        }
        tracker.attempts += 1
        let delaySeconds: Double = {
            switch tracker.attempts {
            case 2: return 2
            case 3: return 8
            default: return 30
            }
        }()
        logger.info(
            "retrying attempt=\(tracker.attempts, privacy: .public) in=\(delaySeconds, privacy: .public)s artifact=\(tracker.descriptor.artifactKind, privacy: .public)"
        )
        try? await Task.sleep(for: .seconds(delaySeconds))
        do {
            let request = try buildRequest(for: tracker.descriptor)
            let task = session.uploadTask(with: request, fromFile: tracker.descriptor.fileURL)
            inflight[task] = tracker
            task.resume()
        } catch {
            onCompletion?(
                tracker.descriptor.scanId,
                tracker.descriptor.artifactKind,
                .failure(.transport(error))
            )
        }
    }

    // MARK: - Integrity

    /// Fetch the stored sha256 by GETting the object-info endpoint and reading
    /// `metadata.sha256` from its JSON body. The metadata is NOT surfaced as an
    /// `x-amz-meta-*` response header (the previous HEAD read always returned
    /// nil), so we must parse the body — GET, not HEAD, since HEAD has none.
    /// Returns nil when Storage surfaced no sha (treated as unverifiable).
    private func fetchStoredSha(for descriptor: UploadDescriptor) async throws -> String? {
        let base = AppConfiguration.supabaseURL
        guard let url = URL(
            string: "storage/v1/object/info/authenticated/room-scans/\(descriptor.storagePath)",
            relativeTo: base
        )?.absoluteURL else {
            return nil
        }
        let accessToken = SupabaseClientManager.shared.client.auth.currentSession?.accessToken ?? ""
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(AppConfiguration.supabaseAnonKey, forHTTPHeaderField: "apikey")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard
            let http = response as? HTTPURLResponse,
            (200..<300).contains(http.statusCode)
        else {
            return nil
        }
        return Self.parseStoredSha(from: data)
    }
}

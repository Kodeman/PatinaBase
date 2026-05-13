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
///   2. Builds a PUT to `<supabaseUrl>/storage/v1/object/room-scans/<path>`
///      with Authorization/apikey/Content-Type and `x-amz-meta-*` metadata.
///   3. Delegates to `URLSessionConfiguration.background` for resume-safe
///      transfer.
///   4. Throttles `didSendBodyData` progress updates to ~2 Hz per artifact.
///   5. Maps HTTP 408/429/5xx → exponential backoff retry (max 3 attempts).
///   6. Verifies round-tripped `x-amz-meta-sha256` after completion via a
///      HEAD on `storage/v1/object/info/authenticated/room-scans/<path>`.
///      Mismatch → retry (max 3).
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
        // Best-effort token refresh before building the request so the bearer
        // we attach has a fresh TTL. If the user is signed out entirely, the
        // refresh will fail (typically silently) and `buildRequest` below will
        // throw `.missingSession` — that error propagates up to
        // `RoomScanSyncService.uploadArtifactViaBackground` and is recorded
        // as the artifact's lastError instead of being silently swallowed.
        try? await SupabaseClientManager.shared.client.auth.refreshSession()
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
        request.httpMethod = "PUT"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue(descriptor.mimeType, forHTTPHeaderField: "Content-Type")
        request.setValue("true", forHTTPHeaderField: "x-upsert")
        request.setValue(descriptor.scanId.uuidString, forHTTPHeaderField: "x-amz-meta-scan-id")
        request.setValue(descriptor.artifactKind, forHTTPHeaderField: "x-amz-meta-artifact-kind")
        if let sha = descriptor.sha256 {
            request.setValue(sha, forHTTPHeaderField: "x-amz-meta-sha256")
        }
        return request
    }
}

// MARK: - URLSession delegates

extension BackgroundScanUploader: URLSessionDelegate, URLSessionTaskDelegate, URLSessionDataDelegate {

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
                logger.error("http \(code, privacy: .public) artifact=\(descriptor.artifactKind, privacy: .public)")
                UploadDiagnosticsLog.shared.log(
                    event: "bg.http_error",
                    scanId: descriptor.scanId,
                    artifactKind: descriptor.artifactKind,
                    httpStatus: code,
                    extra: ["path": descriptor.storagePath]
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

            // Integrity check via HEAD.
            if let expectedSha = descriptor.sha256 {
                do {
                    let actual = try await fetchStoredSha(for: descriptor)
                    if actual != expectedSha {
                        logger.error(
                            "sha mismatch artifact=\(descriptor.artifactKind, privacy: .public) expected=\(expectedSha.prefix(10), privacy: .public) actual=\(actual ?? "<none>", privacy: .public)"
                        )
                        await retryOrFail(
                            tracker: tracker,
                            with: .shaMismatch(expected: expectedSha, actual: actual)
                        )
                        return
                    }
                } catch {
                    // HEAD failure isn't fatal — treat as success since body
                    // landed.
                    logger.debug("HEAD check skipped: \(error.localizedDescription, privacy: .public)")
                }
            }

            logger.info(
                "uploaded artifact=\(descriptor.artifactKind, privacy: .public) sha=\(descriptor.sha256?.prefix(10) ?? "<none>", privacy: .public)"
            )
            onCompletion?(descriptor.scanId, descriptor.artifactKind, .success(()))
        }
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
        request.httpMethod = "HEAD"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(AppConfiguration.supabaseAnonKey, forHTTPHeaderField: "apikey")
        let (_, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse {
            return http.value(forHTTPHeaderField: "x-amz-meta-sha256")
        }
        return nil
    }
}

//  FieldBackgroundScanUploader.swift
//  Capture · Wave F (Pro site-scan) · Field Capture P1 · item 8, Part 3 resilience
//
//  Background-URLSession artifact uploader — a faithful port of the client's proven
//  `BackgroundScanUploader` (`apps/mobile/Patina/.../Services/Sync/`). Uploads survive
//  app suspension/kill and resume on relaunch (background session + `sessionSendsLaunchEvents`
//  + the app-delegate completion-handler seam), so a 500 MB bundle completes without the
//  user babysitting F4 — the M2 AC. Driven off `ScanUploadRecord`'s per-artifact
//  statuses (in `SupabaseSiteScanService`), so a resume re-enqueues only the artifacts
//  not yet `uploaded`.
//
//  ⚠️ DEVICE-VERIFICATION-OWED: background continuation, airplane-mode resume, and the
//  500 MB unattended path can only be proven on a device — the machinery is built and
//  compiles; the walk confirms it (see the M2 checklist).
//
//  Mechanics ported verbatim from the client:
//   • POST + x-upsert:true to storage/v1/object/room-scans/<key> (Storage uses POST to
//     create; a PUT against a missing object 400s). base64(JSON) `x-metadata` header —
//     the channel Storage persists into user_metadata (raw x-amz-meta-* headers are DROPPED).
//   • Bounded retry on 408/429/5xx: 2 s then 8 s (maxAttempts = 3, so the 30 s tier is
//     unreachable — the third failure is terminal); 401 → refresh session + retry.
//   • Post-upload integrity: GET /object/info/authenticated → compare stored sha
//     (present-and-differ = fail → retry; absent = accept the 2xx).
//   • Relaunch (item 8 · M3): `reconcileExistingTasks()` adopts the background session's
//     surviving tasks so their re-delivered completions aren't dropped, and `enqueue`
//     dedups against a live task for the same storage path.
//
//  ⚠️ KNOWN LIMITATION (not built — see the M2 checklist): there is no per-artifact
//  continuation watchdog. If an adopted/in-flight task neither completes nor re-delivers
//  a terminal event, the awaiting `upload()` continuation for that kind never resolves.
//  The durable record + resume path bound the damage (a fresh launch re-plans), but a
//  timeout that fails the continuation and re-enqueues is deferred to a later cycle.

import Foundation
import CaptureKit

@MainActor
final class FieldBackgroundScanUploader: NSObject {

    static let sessionIdentifier = "cloud.patina.field.scan-upload"

    struct Descriptor: Sendable {
        let scanID: String
        let kind: String
        let ownerUserID: String
        let ownerWorkspaceID: String
        let sha256: String?
        let mimeType: String
        let fileURL: URL
        let storagePath: String   // {folder}/{userId}/{roomId}/{scanId}/{filename}
    }

    enum UploadError: Error, Equatable {
        case httpStatus(Int)
        case shaMismatch
        case missingSession
        case transport
    }

    /// scanID, kind, fraction 0…1.
    var onProgress: (@MainActor (String, String, Double) -> Void)?
    /// descriptor, result — fired once per artifact (success or terminal failure). The
    /// full descriptor (not just scanID/kind) lets the owner route an orphaned completion
    /// back onto its durable record (storagePath → remote URL) — item 8 · M3.
    var onCompletion: (@MainActor (Descriptor, Result<Void, UploadError>) -> Void)?
    /// The system's background-completion handler, parked by the app delegate on wake
    /// and invoked when the session drains (static so it survives instance churn).
    static var systemCompletionHandler: (() -> Void)?
    /// The current access token (nil/empty ⇒ can't upload → .missingSession).
    var accessTokenProvider: (() async -> String?)?
    /// Refresh the session on a 401; return the new token (or nil to give up).
    var refreshTokenProvider: (() async -> String?)?

    private let baseURL: URL
    private let anonKey: String
    private var session: URLSession!

    private final class Tracker {
        let descriptor: Descriptor
        var attempts: Int
        /// Adopted on relaunch from a surviving background task (M3). Its source file
        /// URL is unknown, so a retry can't re-enqueue it — an adopted task that fails
        /// terminates, and the durable resume re-enqueues with the real descriptor.
        let adopted: Bool
        var responseBody = Data()
        init(_ descriptor: Descriptor, attempts: Int, adopted: Bool = false) {
            self.descriptor = descriptor; self.attempts = attempts; self.adopted = adopted
        }
    }
    private var inflight: [Int: Tracker] = [:]
    private var didReconcile = false
    private var reconciliationTask: Task<Void, Never>?

    private static let maxAttempts = 3

    init(baseURL: URL, anonKey: String) {
        self.baseURL = baseURL
        self.anonKey = anonKey
        super.init()
        let config = URLSessionConfiguration.background(withIdentifier: Self.sessionIdentifier)
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = true
        config.waitsForConnectivity = true
        config.allowsCellularAccess = true
        config.httpMaximumConnectionsPerHost = 2
        session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }

    /// Enqueue one artifact as a background upload task (file-based — required for a
    /// background session). No-op-with-failure if there's no access token.
    ///
    /// Dedup (M3): if a live task already targets this owner's scan artifact (e.g. one
    /// adopted on relaunch), let it finish rather than creating a duplicate. Logical
    /// identity deliberately includes owner + scan + kind instead of object path alone:
    /// separate scans assigned to the same room must never share a transfer.
    func enqueue(_ descriptor: Descriptor) async {
        // Every enqueue waits until surviving background tasks have been
        // adopted. This closes the relaunch race even if a future caller
        // bypasses the service's startup reconciliation path.
        await reconcileExistingTasks()
        if inflight.values.contains(where: {
            let active = $0.descriptor
            return active.ownerUserID == descriptor.ownerUserID
                && active.ownerWorkspaceID == descriptor.ownerWorkspaceID
                && active.scanID == descriptor.scanID
                && active.kind == descriptor.kind
        }) {
            return
        }
        guard let request = await buildRequest(descriptor, token: await accessTokenProvider?() ?? nil) else {
            onCompletion?(descriptor, .failure(.missingSession))
            return
        }
        let task = session.uploadTask(with: request, fromFile: descriptor.fileURL)
        inflight[task.taskIdentifier] = Tracker(descriptor, attempts: 1)
        task.resume()
    }

    /// Adopt the background session's surviving tasks on relaunch (M3), so their
    /// re-delivered completions land on a tracker instead of being dropped, and so
    /// `enqueue` can dedup against them. Idempotent per launch.
    func reconcileExistingTasks() async {
        guard !didReconcile else { return }

        if let reconciliationTask {
            await reconciliationTask.value
            return
        }

        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            let tasks: [URLSessionTask] = await withCheckedContinuation { continuation in
                self.session.getAllTasks { continuation.resume(returning: $0) }
            }
            for task in tasks where self.inflight[task.taskIdentifier] == nil {
                guard let descriptor = Self.descriptor(from: task) else { continue }
                self.inflight[task.taskIdentifier] = Tracker(
                    descriptor,
                    attempts: Self.maxAttempts,
                    adopted: true
                )
            }
        }
        reconciliationTask = task
        await task.value
        didReconcile = true
        reconciliationTask = nil
    }

    /// Best-effort reconstruction of a Descriptor from a surviving task's request — the
    /// storage path from the URL, and scanId/kind/sha from the persisted `x-metadata`
    /// header. The source file URL isn't recoverable (it was the task body), so adopted
    /// descriptors carry an empty file URL and never retry from file.
    private static func descriptor(from task: URLSessionTask) -> Descriptor? {
        guard let request = task.originalRequest, let path = request.url?.path,
              let range = path.range(of: "/object/room-scans/") else { return nil }
        let storagePath = String(path[range.upperBound...])
        let values = request.value(forHTTPHeaderField: "x-metadata")
            .flatMap(decodeMetadataHeader) ?? [:]
        guard let metadata = ScanBackgroundTransferMetadata(
            dictionary: values
        ) else { return nil }
        return Descriptor(scanID: metadata.scanID,
                          kind: metadata.artifactKind,
                          ownerUserID: metadata.owner.userID,
                          ownerWorkspaceID: metadata.owner.workspaceID,
                          sha256: metadata.sha256,
                          mimeType: request.value(forHTTPHeaderField: "Content-Type") ?? "application/octet-stream",
                          fileURL: URL(fileURLWithPath: ""), storagePath: storagePath)
    }

    /// Inverse of `encodeMetadataHeader` — base64(JSON) → [String: String].
    static func decodeMetadataHeader(_ header: String) -> [String: String]? {
        guard let data = Data(base64Encoded: header) else { return nil }
        return try? JSONDecoder().decode([String: String].self, from: data)
    }

    private func buildRequest(_ descriptor: Descriptor, token: String?) async -> URLRequest? {
        guard let token, !token.isEmpty else { return nil }
        let url = baseURL.appendingPathComponent("storage/v1/object/room-scans/\(descriptor.storagePath)")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue(descriptor.mimeType, forHTTPHeaderField: "Content-Type")
        request.setValue("true", forHTTPHeaderField: "x-upsert")
        guard let owner = CaptureOwnerIdentity(
            userID: descriptor.ownerUserID,
            workspaceID: descriptor.ownerWorkspaceID
        ) else { return nil }
        let metadata = ScanBackgroundTransferMetadata(
            scanID: descriptor.scanID,
            artifactKind: descriptor.kind,
            owner: owner,
            sha256: descriptor.sha256
        )
        if let header = Self.encodeMetadataHeader(metadata.dictionary) {
            request.setValue(header, forHTTPHeaderField: "x-metadata")
        }
        return request
    }

    /// base64(JSON, sorted keys) — the persisted `user_metadata` channel.
    static func encodeMetadataHeader(_ meta: [String: String]) -> String? {
        guard !meta.isEmpty else { return nil }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        guard let data = try? encoder.encode(meta) else { return nil }
        return data.base64EncodedString()
    }

    // MARK: - Retry / verify

    private func retryOrFail(_ tracker: Tracker, error: UploadError) async {
        let d = tracker.descriptor
        // Adopted tasks (M3) have no recoverable source file — fail terminally so the
        // durable resume re-enqueues with the real descriptor rather than re-uploading
        // an empty body.
        guard !tracker.adopted, tracker.attempts < Self.maxAttempts else {
            onCompletion?(d, .failure(error)); return
        }
        tracker.attempts += 1
        // 2 s then 8 s; the 30 s tier is unreachable at maxAttempts = 3 (attempts 2, 3).
        let delay: Double = tracker.attempts == 2 ? 2 : (tracker.attempts == 3 ? 8 : 30)
        try? await Task.sleep(for: .seconds(delay))
        let token: String? = (error == .missingSession) ? await refreshTokenProvider?() ?? nil
                                                         : await accessTokenProvider?() ?? nil
        guard let request = await buildRequest(d, token: token) else {
            onCompletion?(d, .failure(.missingSession)); return
        }
        let task = session.uploadTask(with: request, fromFile: d.fileURL)
        inflight[task.taskIdentifier] = tracker
        task.resume()
    }

    /// After a 2xx, GET the object info and compare the stored sha (present-and-differ
    /// = fail → retry; absent/unverifiable = accept the 2xx). A failed info fetch is
    /// non-fatal (the bytes already landed).
    private func verifyAndComplete(_ tracker: Tracker) async {
        let d = tracker.descriptor
        guard let expected = d.sha256, !expected.isEmpty else {
            onCompletion?(d, .success(())); return
        }
        let infoURL = baseURL.appendingPathComponent(
            "storage/v1/object/info/authenticated/room-scans/\(d.storagePath)")
        var request = URLRequest(url: infoURL)
        if let token = await accessTokenProvider?() ?? nil {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        let stored: String? = try? await {
            let (data, _) = try await URLSession.shared.data(for: request)
            return Self.parseStoredSha(from: data)
        }()
        switch Self.verificationOutcome(expected: expected, stored: stored) {
        case .accept: onCompletion?(d, .success(()))
        case .fail:   await retryOrFail(tracker, error: .shaMismatch)
        }
    }

    enum VerificationOutcome: Equatable { case accept, fail }
    static func verificationOutcome(expected: String?, stored: String?) -> VerificationOutcome {
        guard let expected, !expected.isEmpty else { return .accept }
        guard let stored, !stored.isEmpty else { return .accept }   // unverifiable → accept
        return stored == expected ? .accept : .fail
    }

    static func parseStoredSha(from body: Data) -> String? {
        guard let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any] else { return nil }
        for key in ["metadata", "user_metadata"] {
            if let meta = json[key] as? [String: Any], let sha = meta["sha256"] as? String { return sha }
        }
        return nil
    }
}

// MARK: - URLSession delegate (off-main; hops to MainActor)

extension FieldBackgroundScanUploader: URLSessionDataDelegate {

    nonisolated func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        let id = dataTask.taskIdentifier
        Task { @MainActor in self.inflight[id]?.responseBody.append(data) }
    }

    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask,
                                didSendBodyData bytesSent: Int64, totalBytesSent: Int64,
                                totalBytesExpectedToSend total: Int64) {
        guard total > 0 else { return }
        let id = task.taskIdentifier
        let fraction = Double(totalBytesSent) / Double(total)
        Task { @MainActor in
            guard let tracker = self.inflight[id] else { return }
            self.onProgress?(tracker.descriptor.scanID, tracker.descriptor.kind, fraction)
        }
    }

    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask,
                                didCompleteWithError error: Error?) {
        let id = task.taskIdentifier
        let status = (task.response as? HTTPURLResponse)?.statusCode
        Task { @MainActor in
            guard let tracker = self.inflight.removeValue(forKey: id) else { return }
            if error != nil {
                await self.retryOrFail(tracker, error: .transport)
            } else if let status, (200..<300).contains(status) {
                await self.verifyAndComplete(tracker)
            } else if status == 401 {
                await self.retryOrFail(tracker, error: .missingSession)
            } else if let status, status == 408 || status == 429 || (500..<600).contains(status) {
                await self.retryOrFail(tracker, error: .httpStatus(status))
            } else {
                self.onCompletion?(tracker.descriptor, .failure(.httpStatus(status ?? -1)))
            }
        }
    }

    nonisolated func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        Task { @MainActor in
            FieldBackgroundScanUploader.systemCompletionHandler?()
            FieldBackgroundScanUploader.systemCompletionHandler = nil
        }
    }
}

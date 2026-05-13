//
//  UploadDiagnosticsLog.swift
//  Patina
//
//  Minimal NDJSON appender for upload-pipeline diagnostics. Gated behind
//  the `--upload-diagnostics` launch arg (or `--uitesting`). Writes one
//  JSON object per line to `Application Support/upload-diagnostics.log`,
//  pullable from a physical device via `xcrun devicectl device copy from`.
//
//  Surfaces the per-artifact failure detail that
//  `RoomScanSyncService.launchArtifactUpload` and
//  `BackgroundScanUploader.URLSession completion` previously only emitted
//  via `print()` — invisible on a release-signed app running off-Xcode.
//

import Foundation
import OSLog

public final class UploadDiagnosticsLog: @unchecked Sendable {

    public static let shared = UploadDiagnosticsLog()

    private let logger = Logger(subsystem: "com.patina.scans", category: "UploadDiagnostics")
    private let queue = DispatchQueue(label: "com.patina.scans.upload-diagnostics", qos: .utility)
    private let fileURL: URL?
    private let isEnabled: Bool
    private let iso8601 = ISO8601DateFormatter()

    private init() {
        let args = ProcessInfo.processInfo.arguments
        self.isEnabled = args.contains("--upload-diagnostics") || args.contains("--uitesting")

        if isEnabled,
           let base = try? FileManager.default.url(
               for: .applicationSupportDirectory,
               in: .userDomainMask,
               appropriateFor: nil,
               create: true
           ) {
            self.fileURL = base.appendingPathComponent("upload-diagnostics.log")
        } else {
            self.fileURL = nil
        }
    }

    public func log(
        event: String,
        scanId: UUID? = nil,
        artifactKind: String? = nil,
        httpStatus: Int? = nil,
        sha: String? = nil,
        error: String? = nil,
        extra: [String: String] = [:]
    ) {
        guard isEnabled, let url = fileURL else { return }

        var payload: [String: Any] = [
            "ts": iso8601.string(from: Date()),
            "event": event
        ]
        if let scanId { payload["scan_id"] = scanId.uuidString }
        if let artifactKind { payload["artifact_kind"] = artifactKind }
        if let httpStatus { payload["http_status"] = httpStatus }
        if let sha { payload["sha"] = String(sha.prefix(16)) }
        if let error { payload["error"] = error }
        for (k, v) in extra { payload[k] = v }

        queue.async { [logger] in
            guard
                let json = try? JSONSerialization.data(withJSONObject: payload, options: []),
                var line = String(data: json, encoding: .utf8)
            else { return }
            line.append("\n")
            guard let data = line.data(using: .utf8) else { return }

            if FileManager.default.fileExists(atPath: url.path),
               let handle = try? FileHandle(forWritingTo: url) {
                defer { try? handle.close() }
                _ = try? handle.seekToEnd()
                try? handle.write(contentsOf: data)
            } else {
                try? data.write(to: url, options: [.atomic])
            }
            logger.debug("\(line, privacy: .public)")
        }
    }
}

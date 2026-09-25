//
//  SharedDirectionFiles.swift
//  Patina
//
//  W1A-10 · CONTRACT-C §C.3.3. Where an edition's verified files live and how
//  a download becomes one. Layout, under the root:
//
//      <accountId>/<decisionId>/<attachmentId>   verified, committed
//      <accountId>/_staging/<taskId>/…           one fetch's downloads
//
//  Staging is per account and per task, so a dropped task deletes only its
//  own. `_staging` can never collide with an id: ids are UUID-shaped and
//  `isSafeComponent` refuses the underscore.
//

import CryptoKit
import Foundation

nonisolated enum SharedDirectionFiles {

    static let stagingName = "_staging"

    /// `Application Support/SharedDirection`, excluded from backup: every byte
    /// is re-fetchable from the server, so it has no business in iCloud.
    static func defaultRoot() -> URL {
        let base = (try? FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask,
            appropriateFor: nil, create: true
        )) ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent("SharedDirection", isDirectory: true)
    }

    /// Server ids become path components, so only a UUID-shaped string may:
    /// letters, digits and hyphens, nothing that walks the tree.
    static func isSafeComponent(_ value: String) -> Bool {
        (1...64).contains(value.count)
            && value.unicodeScalars.allSatisfy { scalar in
                scalar == "-" || (scalar.isASCII && CharacterSet.alphanumerics.contains(scalar))
            }
    }

    static func accountDirectory(root: URL, account: String) -> URL {
        root.appendingPathComponent(account, isDirectory: true)
    }

    static func editionDirectory(root: URL, account: String, decisionId: String) -> URL {
        accountDirectory(root: root, account: account)
            .appendingPathComponent(decisionId, isDirectory: true)
    }

    static func stagingDirectory(root: URL, account: String, task: UUID) -> URL {
        accountDirectory(root: root, account: account)
            .appendingPathComponent(stagingName, isDirectory: true)
            .appendingPathComponent(task.uuidString.lowercased(), isDirectory: true)
    }

    /// Streams the file through SHA-256 a mebibyte at a time, so a 50 MiB
    /// sheet never sits in memory whole.
    static func digest(of url: URL) throws -> (sha256: String, bytes: Int) {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        var bytes = 0
        while let chunk = try handle.read(upToCount: 1 << 20), !chunk.isEmpty {
            hasher.update(data: chunk)
            bytes += chunk.count
        }
        let hex = hasher.finalize().map { String(format: "%02x", $0) }.joined()
        return (hex, bytes)
    }

    /// What the file's first bytes say it is — PDF, PNG or JPEG — or nil.
    /// A manifest `contentType` is checked against the bytes themselves,
    /// not against a header the storage echoes back (SQ-247 F10).
    static func sniffedContentType(of url: URL) throws -> String? {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        let head = try handle.read(upToCount: 1024) ?? Data()
        if head.starts(with: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) { return "image/png" }
        if head.starts(with: [0xFF, 0xD8, 0xFF]) { return "image/jpeg" }
        // A PDF reader accepts the header anywhere in the first kilobyte.
        if head.range(of: Data("%PDF-".utf8)) != nil { return "application/pdf" }
        return nil
    }

    /// At launch every staging directory is cleared: no fetch survives a
    /// process, so whatever is there is a dead task's (§C.3.3 step 5).
    static func clearStaging(root: URL) {
        let fm = FileManager.default
        guard let accounts = try? fm.contentsOfDirectory(
            at: root, includingPropertiesForKeys: nil
        ) else { return }
        for account in accounts {
            try? fm.removeItem(at: account.appendingPathComponent(stagingName, isDirectory: true))
        }
    }

    static func remove(_ url: URL) {
        try? FileManager.default.removeItem(at: url)
    }

    static func makeDirectory(_ url: URL) throws {
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var marked = url
        try? marked.setResourceValues(values)
    }
}

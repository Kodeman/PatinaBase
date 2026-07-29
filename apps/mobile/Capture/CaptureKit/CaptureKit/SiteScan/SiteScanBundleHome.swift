//  SiteScanBundleHome.swift
//  CaptureKit
//
//  Durable on-disk home for site-scan bundles (Field Capture P1 · item 8, Part 3 —
//  C2 fix). The bundle dir MUST survive an app kill under storage pressure and a
//  changed app-container path, because the background `uploadTask(fromFile:)` reads
//  the source across relaunches and the durable `ScanUploadRecord` resumes against it.
//
//  • Home = Application Support / "SiteScans" — NOT NSTemporaryDirectory (iOS purges
//    tmp exactly in the survives-kill window) and NOT Caches (also reclaimable).
//    Mirrors the shipped client discipline (`ScanBundleWriter` uses
//    `.applicationSupportDirectory`).
//  • The durable key is the path RELATIVE to Application Support ("SiteScans/site-scan-…"),
//    so a resume re-resolves the absolute URL under the CURRENT container even if the
//    app-container path changed since the record was written (`relativeKey` is pure).
//  • Retention: the owner deletes a bundle after durable completion; `sweepOrphans`
//    reaps only old dirs not protected by any durable transfer record.

import Foundation

public enum SiteScanBundleHome {

    /// Subdirectory of Application Support that holds every scan bundle.
    public static let dirName = "SiteScans"

    /// Retention window for abandoned dirs that have no durable transfer owner.
    public static let retentionDays = 7

    // MARK: - Locations

    private static func applicationSupport(_ fileManager: FileManager) throws -> URL {
        try fileManager.url(for: .applicationSupportDirectory, in: .userDomainMask,
                            appropriateFor: nil, create: true)
    }

    /// Application Support / SiteScans (created if absent).
    public static func root(fileManager: FileManager = .default) throws -> URL {
        let dir = try applicationSupport(fileManager).appendingPathComponent(dirName, isDirectory: true)
        try fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// Mint a fresh, unique bundle dir under the home. Returns its absolute URL.
    public static func makeBundleDir(fileManager: FileManager = .default) throws -> URL {
        let dir = try root(fileManager: fileManager)
            .appendingPathComponent("site-scan-\(UUID().uuidString.lowercased())", isDirectory: true)
        try fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    // MARK: - Durable key (container-independent)

    /// The record's stable key = the bundle path RELATIVE to Application Support
    /// ("SiteScans/<dir>"). Pure string math on the last path component, so it never
    /// embeds the volatile absolute container prefix.
    public static func relativeKey(for bundleURL: URL) -> String {
        "\(dirName)/\(bundleURL.lastPathComponent)"
    }

    /// Resolve a stored `relativeKey` back to an absolute URL under the CURRENT
    /// Application Support base (re-derive on launch — the container path may have moved).
    public static func resolve(relativeKey: String, fileManager: FileManager = .default) throws -> URL {
        try applicationSupport(fileManager).appendingPathComponent(relativeKey, isDirectory: true)
    }

    // MARK: - Retention

    /// Delete one bundle dir (best-effort; called when its upload record completes).
    public static func remove(bundleURL: URL, fileManager: FileManager = .default) {
        try? fileManager.removeItem(at: bundleURL)
    }

    /// Reap unprotected abandoned bundle dirs older than `days`. Returns the count
    /// removed. Best-effort — a failed removal is skipped, never fatal.
    @discardableResult
    public static func sweepOrphans(
        olderThan days: Int = retentionDays,
        protectedRelativeKeys: Set<String> = [],
        rootURL: URL? = nil,
        fileManager: FileManager = .default,
        now: Date = Date()
    ) -> Int {
        let scanRoot: URL
        if let rootURL {
            scanRoot = rootURL
        } else if let durableRoot = try? root(fileManager: fileManager) {
            scanRoot = durableRoot
        } else {
            return 0
        }
        guard let entries = try? fileManager.contentsOfDirectory(
            at: scanRoot,
            includingPropertiesForKeys: [
                .contentModificationDateKey,
                .isDirectoryKey
            ],
            options: [.skipsHiddenFiles]
        ) else { return 0 }
        let cutoff = now.addingTimeInterval(-Double(days) * 86_400)
        var removed = 0
        for entry in entries {
            let relativeKey = relativeKey(for: entry)
            guard !protectedRelativeKeys.contains(relativeKey) else { continue }
            let values = try? entry.resourceValues(
                forKeys: [.contentModificationDateKey, .isDirectoryKey]
            )
            guard values?.isDirectory == true else { continue }
            let modified = values?.contentModificationDate ?? .distantFuture
            if modified < cutoff,
               (try? fileManager.removeItem(at: entry)) != nil {
                removed += 1
            }
        }
        return removed
    }
}

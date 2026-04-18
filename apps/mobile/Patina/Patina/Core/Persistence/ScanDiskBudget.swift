//
//  ScanDiskBudget.swift
//  Patina
//
//  Enforces a disk-space ceiling for locally-stored scan bundles.
//  Evicts oldest fully-synced bundles first; never touches unsynced
//  packages, packages marked `diskSizeBudgetExempt`, or the scan the
//  caller asks us to preserve (e.g. the one in progress). Also surfaces
//  a preflight-space check that scan-start callers can consult before
//  allocating hundreds of megabytes of capture artifacts.
//

import Foundation
import SwiftData
import os

/// Enforces a disk-space ceiling for locally-stored scan bundles.
/// Evicts oldest fully-synced bundles first; never touches unsynced ones.
@MainActor
public final class ScanDiskBudget {

    // MARK: - Config

    public struct Config: Sendable, Equatable {
        public var maxTotalBytes: Int64
        public var maxBundleCount: Int
        public var lowFreeSpaceHardStopBytes: Int64
        public var lowFreeSpaceAdvisoryBytes: Int64

        public init(
            maxTotalBytes: Int64,
            maxBundleCount: Int,
            lowFreeSpaceHardStopBytes: Int64,
            lowFreeSpaceAdvisoryBytes: Int64
        ) {
            self.maxTotalBytes = maxTotalBytes
            self.maxBundleCount = maxBundleCount
            self.lowFreeSpaceHardStopBytes = lowFreeSpaceHardStopBytes
            self.lowFreeSpaceAdvisoryBytes = lowFreeSpaceAdvisoryBytes
        }

        public static let `default` = Config(
            maxTotalBytes: 3 * 1024 * 1024 * 1024,          // 3 GB
            maxBundleCount: 20,
            lowFreeSpaceHardStopBytes: 500 * 1024 * 1024,   // 500 MB
            lowFreeSpaceAdvisoryBytes: 1 * 1024 * 1024 * 1024 // 1 GB
        )
    }

    // MARK: - Preflight result

    public enum PreflightResult: Sendable, Equatable {
        case ok
        /// Below advisory free threshold — eviction should run but scan may
        /// proceed. UI may choose to surface a soft warning.
        case advise
        /// Below hard-stop threshold — refuse to start the scan.
        case blocked(reason: String)
    }

    // MARK: - Singleton / state

    public static let shared = ScanDiskBudget()
    public var config: Config = .default

    private let logger = Logger(subsystem: "com.patina.app", category: "ScanDiskBudget")

    private init() {}

    // MARK: - Totals

    /// Sum of `RoomScanPackage.sizeBytes` across all rows. Returns 0 if the
    /// fetch fails — callers treat this as advisory.
    public func currentTotalBytes(in context: ModelContext) -> Int64 {
        let descriptor = FetchDescriptor<RoomScanPackage>()
        guard let packages = try? context.fetch(descriptor) else { return 0 }
        return packages.reduce(Int64(0)) { acc, pkg in
            acc + Int64(pkg.sizeBytes)
        }
    }

    /// Current package row count across all statuses.
    public func currentBundleCount(in context: ModelContext) -> Int {
        let descriptor = FetchDescriptor<RoomScanPackage>()
        return (try? context.fetchCount(descriptor)) ?? 0
    }

    // MARK: - Eviction

    /// Delete oldest synced bundles (by `syncedAt` ascending) until the
    /// package count is under `maxBundleCount` AND total bytes are under
    /// `maxTotalBytes`. Never touches non-synced rows, rows flagged
    /// `diskSizeBudgetExempt`, or the `preservingScanId`. Eviction is
    /// best-effort: IO failures are logged and the loop continues.
    public func evictIfNeeded(
        in context: ModelContext,
        preservingScanId: UUID? = nil
    ) async {
        var totalBytes = currentTotalBytes(in: context)
        var totalCount = currentBundleCount(in: context)

        if totalBytes <= config.maxTotalBytes && totalCount <= config.maxBundleCount {
            return
        }

        // Fetch synced candidates, oldest-synced-first.
        let descriptor = FetchDescriptor<RoomScanPackage>(
            predicate: #Predicate<RoomScanPackage> { pkg in
                pkg.statusRaw == "synced" && pkg.diskSizeBudgetExempt == false
            },
            sortBy: [SortDescriptor(\.syncedAt, order: .forward)]
        )

        guard let candidates = try? context.fetch(descriptor) else {
            logger.error("Failed to fetch eviction candidates")
            return
        }

        let preserved = preservingScanId

        for package in candidates {
            if totalBytes <= config.maxTotalBytes && totalCount <= config.maxBundleCount {
                break
            }

            if let preserved, package.scanId == preserved {
                continue
            }

            let freed = evict(package: package, in: context)
            totalBytes -= freed
            totalCount -= 1
        }

        do {
            try context.save()
        } catch {
            logger.error("Failed to save context after eviction: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Delete the bundle directory on disk (if present) and the SwiftData
    /// row. Returns the bytes freed so callers can update their running
    /// total without a re-fetch.
    @discardableResult
    private func evict(package: RoomScanPackage, in context: ModelContext) -> Int64 {
        let freed = Int64(package.sizeBytes)
        let scanId = package.scanId

        if let bundleURL = package.absoluteBundleURL {
            if FileManager.default.fileExists(atPath: bundleURL.path) {
                do {
                    try FileManager.default.removeItem(at: bundleURL)
                    logger.debug("Evicted bundle for scan \(scanId.uuidString, privacy: .public) (\(freed) bytes)")
                } catch {
                    // Log and continue — row still gets deleted so we're not
                    // dragging a dangling reference forward.
                    logger.error("Failed to remove bundle at \(bundleURL.path, privacy: .public): \(error.localizedDescription, privacy: .public)")
                }
            } else {
                logger.debug("Bundle already missing for scan \(scanId.uuidString, privacy: .public); removing row only")
            }
        }

        context.delete(package)
        return freed
    }

    // MARK: - Preflight

    /// Call at scan start. Returns an actionable result based on free disk
    /// space on the app's volume.
    public func preflightAtScanStart() -> PreflightResult {
        guard let free = freeSpaceBytes() else { return .ok }

        if free < config.lowFreeSpaceHardStopBytes {
            let needed = ByteCountFormatter.string(
                fromByteCount: config.lowFreeSpaceHardStopBytes,
                countStyle: .file
            )
            return .blocked(reason: "Need \(needed) free to start a scan")
        }

        if free < config.lowFreeSpaceAdvisoryBytes {
            return .advise
        }

        return .ok
    }

    /// Free bytes on the app's volume, using the iOS "important usage" key
    /// where available. Falls back to `systemFreeSize` and ultimately nil.
    private func freeSpaceBytes() -> Int64? {
        let url = URL(fileURLWithPath: NSHomeDirectory())
        if let values = try? url.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]),
           let capacity = values.volumeAvailableCapacityForImportantUsage {
            return capacity
        }
        if let attrs = try? FileManager.default.attributesOfFileSystem(forPath: NSHomeDirectory()),
           let sz = attrs[.systemFreeSize] as? NSNumber {
            return sz.int64Value
        }
        return nil
    }
}

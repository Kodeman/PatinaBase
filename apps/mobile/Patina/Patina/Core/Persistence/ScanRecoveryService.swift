//
//  ScanRecoveryService.swift
//  Patina
//
//  Recovers or discards scan bundles after app termination or crash.
//  On launch we scan SwiftData for `RoomScanPackage` rows that never
//  reached the synced state, classify each against what's actually on
//  disk, and return a list of viable recovery candidates for the UI to
//  prompt the user about. Non-viable rows are silently discarded so the
//  app doesn't accumulate orphaned bundles.
//

import Foundation
import SwiftData
import os

/// Recovers or discards scan bundles after app termination or crash.
@MainActor
public final class ScanRecoveryService {

    // MARK: - Candidate

    public struct RecoveryCandidate: Identifiable, Sendable {
        public let id: UUID      // scanId
        public let bundleURL: URL
        public let photosCount: Int
        public let reviewCompletedAt: Date?
        public let createdAt: Date

        public init(
            id: UUID,
            bundleURL: URL,
            photosCount: Int,
            reviewCompletedAt: Date?,
            createdAt: Date
        ) {
            self.id = id
            self.bundleURL = bundleURL
            self.photosCount = photosCount
            self.reviewCompletedAt = reviewCompletedAt
            self.createdAt = createdAt
        }
    }

    // MARK: - Tunables

    /// Minimum on-disk photo count to treat an unfinished bundle as worth
    /// prompting about. Below this we silently discard — the user barely
    /// started scanning, recovery would be noise.
    private let minimumViablePhotoCount: Int = 5

    // MARK: - Singleton

    public static let shared = ScanRecoveryService()

    private let logger = Logger(subsystem: "com.patina.app", category: "ScanRecovery")

    private init() {}

    // MARK: - Scan

    /// Called at app launch. Returns candidates the UI should prompt the
    /// user to recover; silently discards non-viable ones.
    ///
    /// "Viable" == manifest exists, decodes cleanly, `completedAt == nil`,
    /// and on-disk photo count >= `minimumViablePhotoCount`.
    ///
    /// Rows with `completedAt != nil` that somehow aren't synced are left
    /// in place so `RoomScanSyncService` can continue retrying.
    public func scanForRecoverableSessions(
        in context: ModelContext
    ) async -> [RecoveryCandidate] {
        // `heldLocal` bundles are INTENTIONALLY kept: they're sealed on the
        // phone awaiting an explicit design request, not orphaned or
        // interrupted uploads. Excluding them from the fetch means they're
        // never discarded and never surfaced as recovery candidates — they're
        // the resting state, not "recoverable". (Pinned by
        // ScanRecoveryServiceHeldTests.)
        let descriptor = FetchDescriptor<RoomScanPackage>(
            predicate: #Predicate<RoomScanPackage> { pkg in
                pkg.syncedAt == nil
                    && pkg.statusRaw != "synced"
                    && pkg.statusRaw != "heldLocal"
            },
            sortBy: [SortDescriptor(\.createdAt, order: .forward)]
        )

        guard let packages = try? context.fetch(descriptor) else {
            logger.error("Failed to fetch incomplete scan packages")
            return []
        }

        var candidates: [RecoveryCandidate] = []
        var rowsToDelete: [RoomScanPackage] = []

        for package in packages {
            guard let bundleURL = package.absoluteBundleURL else {
                logger.debug("No bundle URL for scan \(package.scanId.uuidString, privacy: .public); discarding row")
                rowsToDelete.append(package)
                continue
            }

            let manifestURL = bundleURL.appendingPathComponent("manifest.json")

            guard
                FileManager.default.fileExists(atPath: manifestURL.path),
                let data = try? Data(contentsOf: manifestURL)
            else {
                logger.info("Manifest missing for scan \(package.scanId.uuidString, privacy: .public); cleaning bundle + row")
                removeBundleDirectory(at: bundleURL)
                rowsToDelete.append(package)
                continue
            }

            let manifest: ScanManifest
            do {
                manifest = try JSONDecoder.scanManifestDecoder.decode(ScanManifest.self, from: data)
            } catch {
                logger.info("Manifest decode failed for scan \(package.scanId.uuidString, privacy: .public): \(error.localizedDescription, privacy: .public); cleaning bundle + row")
                removeBundleDirectory(at: bundleURL)
                rowsToDelete.append(package)
                continue
            }

            // Already finalized but not synced — sync service owns retry.
            if manifest.completedAt != nil {
                continue
            }

            let photosCount = countPhotos(in: bundleURL, manifest: manifest)

            if photosCount < minimumViablePhotoCount {
                logger.info("Scan \(package.scanId.uuidString, privacy: .public) has only \(photosCount) photos; discarding")
                removeBundleDirectory(at: bundleURL)
                rowsToDelete.append(package)
                continue
            }

            candidates.append(
                RecoveryCandidate(
                    id: package.scanId,
                    bundleURL: bundleURL,
                    photosCount: photosCount,
                    reviewCompletedAt: manifest.annotations.reviewCompletedAt,
                    createdAt: package.createdAt
                )
            )
        }

        for pkg in rowsToDelete {
            context.delete(pkg)
        }

        if !rowsToDelete.isEmpty {
            do {
                try context.save()
            } catch {
                logger.error("Failed to save after discarding non-viable rows: \(error.localizedDescription, privacy: .public)")
            }
        }

        return candidates
    }

    /// Permanently drop a candidate: bundle files on disk and the
    /// SwiftData row. Idempotent — missing bundles and missing rows are
    /// tolerated.
    public func discard(_ candidateId: UUID, in context: ModelContext) async {
        let descriptor = FetchDescriptor<RoomScanPackage>(
            predicate: #Predicate<RoomScanPackage> { pkg in
                pkg.scanId == candidateId
            }
        )

        guard let matches = try? context.fetch(descriptor), let package = matches.first else {
            logger.debug("No row for discard candidate \(candidateId.uuidString, privacy: .public)")
            return
        }

        if let bundleURL = package.absoluteBundleURL {
            removeBundleDirectory(at: bundleURL)
        }

        context.delete(package)

        do {
            try context.save()
        } catch {
            logger.error("Failed to save after discarding candidate \(candidateId.uuidString, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Helpers

    /// Count posed-photo files on disk under the bundle's `photos/`
    /// subdirectory. Prefers what's on disk over the manifest's
    /// `photos` array (the manifest may lag behind the last capture).
    private func countPhotos(in bundleURL: URL, manifest: ScanManifest) -> Int {
        let photosDir = bundleURL.appendingPathComponent("photos", isDirectory: true)

        guard FileManager.default.fileExists(atPath: photosDir.path) else {
            return manifest.photos.count
        }

        let contents = (try? FileManager.default.contentsOfDirectory(atPath: photosDir.path)) ?? []

        // Count HEIC/JPEG originals only — skip NDJSON sidecars and thumbnails.
        let diskCount = contents.filter { name in
            let lower = name.lowercased()
            guard lower.hasSuffix(".heic") || lower.hasSuffix(".jpg") || lower.hasSuffix(".jpeg") else {
                return false
            }
            // Exclude thumbnails (typical prefix `thumb_`).
            return !lower.hasPrefix("thumb_")
        }.count

        return max(diskCount, manifest.photos.count)
    }

    private func removeBundleDirectory(at url: URL) {
        guard FileManager.default.fileExists(atPath: url.path) else { return }
        do {
            try FileManager.default.removeItem(at: url)
        } catch {
            logger.error("Failed to remove bundle at \(url.path, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }
}

// MARK: - Decoder

private extension JSONDecoder {
    /// Decoder tuned for the scan manifest. Currently just the default
    /// strategy; isolated so tests or future schema tweaks can swap it.
    static var scanManifestDecoder: JSONDecoder {
        JSONDecoder()
    }
}

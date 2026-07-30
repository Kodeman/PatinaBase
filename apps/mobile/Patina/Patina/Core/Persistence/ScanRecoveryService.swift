//
//  ScanRecoveryService.swift
//  Patina
//
//  Recovers, quarantines or discards scan bundles after app termination or
//  crash. On launch we scan SwiftData for `RoomScanPackage` rows that never
//  reached the synced state, classify each against what's actually on disk,
//  and return a list of viable recovery candidates for the UI to prompt the
//  user about.
//
//  ── The one rule ────────────────────────────────────────────────────────────
//  THIS PASS MAY ONLY DELETE BYTES IT HAS PROVEN ARE NOT THE USER'S.
//
//  It runs unattended at launch, before anyone can object, so the burden of
//  proof sits here. "Proven not the user's" means exactly two things: the
//  bundle directory is not on disk at all (an orphaned row), or it is on disk
//  and holds zero bytes. Everything else is a capture the user walked, and it
//  stays.
//
//  A manifest that will not decode is NOT proof. It is a failure of OUR reader
//  against THEIR bytes — a manifest from a newer build, an enum case we don't
//  know, a truncated write. Those bundles are QUARANTINED (`.quarantined`, see
//  `RoomScanPackage`): kept on disk, marked, logged, and excluded from every
//  pipeline by status rather than deleted.
//
//  This is a correction, not a precaution. Before it, the `catch` around the
//  manifest decode deleted bundle + row, and the decoder it used was a bare
//  `JSONDecoder()` while `ScanBundleWriter` writes `dateEncodingStrategy =
//  .iso8601` — so `createdAt` mismatched on EVERY real manifest and every
//  non-held unsynced bundle was deleted at launch. Both halves are fixed here:
//  the read now goes through the writer's own `ScanBundleWriter.readManifest`
//  (one read path, one strategy, no second decoder to drift), and a failed read
//  no longer destroys anything.
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

    // MARK: - Quarantine reason

    /// Why a bundle's bytes could not be read. Both outcomes are the same
    /// disposition — keep, mark, log — but the distinction is the first thing
    /// anyone reading the diagnostics will want.
    public enum QuarantineReason: String, Sendable {
        /// The directory holds bytes but no `manifest.json`.
        case manifestMissing
        /// `manifest.json` is there and does not decode.
        case manifestUnreadable

        /// Breadcrumb stored on the row's `lastError`.
        var summary: String {
            switch self {
            case .manifestMissing:    return "Scan saved on this phone — its index file is missing"
            case .manifestUnreadable: return "Scan saved on this phone — its index file couldn't be read"
            }
        }
    }

    // MARK: - Tunables

    /// Minimum on-disk photo count to treat an unfinished bundle as worth
    /// prompting about. Below this we silently discard — the user barely
    /// started scanning, recovery would be noise.
    ///
    /// This one deletion of real bytes is deliberate and predates this file's
    /// rewrite: at the writer's 2s auto-photo interval, four photos is under ten
    /// seconds of walking. It is reached only after a CLEAN decode, so it is a
    /// judgement about a bundle we fully understand — the opposite of the
    /// decode-failure path.
    private let minimumViablePhotoCount: Int = 5

    // MARK: - Singleton

    public static let shared = ScanRecoveryService()

    private let logger = Logger(subsystem: "com.patina.app", category: "ScanRecovery")

    private init() {}

    // MARK: - Scan

    /// Called at app launch. Returns candidates the UI should prompt the user
    /// to recover, quarantines bundles it cannot read, and discards only what
    /// it has proven holds nothing (see the file header).
    ///
    /// "Viable" == manifest exists, decodes, `completedAt == nil`, and on-disk
    /// photo count >= `minimumViablePhotoCount`.
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
        //
        // `quarantined` is excluded for the mirror-image reason: we already
        // looked, already failed, already marked it. Re-reading it every launch
        // would re-log the same failure forever and could never reach a
        // different answer — the bytes don't change and neither does the reader
        // until the app is updated.
        let descriptor = FetchDescriptor<RoomScanPackage>(
            predicate: #Predicate<RoomScanPackage> { pkg in
                pkg.syncedAt == nil
                    && pkg.statusRaw != "synced"
                    && pkg.statusRaw != "heldLocal"
                    && pkg.statusRaw != "quarantined"
            },
            sortBy: [SortDescriptor(\.createdAt, order: .forward)]
        )

        guard let packages = try? context.fetch(descriptor) else {
            logger.error("Failed to fetch incomplete scan packages")
            return []
        }

        var candidates: [RecoveryCandidate] = []
        var rowsToDelete: [RoomScanPackage] = []
        var didQuarantine = false

        for package in packages {
            let scanId = package.scanId.uuidString

            guard let bundleURL = package.absoluteBundleURL else {
                // Application Support did not resolve. That is an app-wide,
                // usually transient environment failure — it says nothing about
                // THIS row, and it would say the same about every row. Deleting
                // on it would wipe the whole table for a bad `FileManager`
                // answer. Leave the row and complain.
                logger.error("Cannot resolve bundle URL for scan \(scanId, privacy: .public); leaving row untouched")
                continue
            }

            switch classify(package: package, bundleURL: bundleURL) {

            case .orphanedRow:
                // A row pointing at a directory that isn't there. Nothing on
                // disk to lose — this is the cleanup that stays.
                logger.info("No bundle on disk for scan \(scanId, privacy: .public); removing orphaned row")
                rowsToDelete.append(package)

            case .emptyBundle:
                // The directory exists and holds zero bytes. Also nothing to
                // lose; take the empty shell with it.
                logger.info("Bundle for scan \(scanId, privacy: .public) holds no bytes; removing bundle + row")
                removeBundleDirectory(at: bundleURL)
                rowsToDelete.append(package)

            case .unreadable(let reason):
                quarantine(package, reason: reason, detail: nil)
                didQuarantine = true

            case .unreadableManifest(let reason, let error):
                quarantine(package, reason: reason, detail: error.localizedDescription)
                didQuarantine = true

            case .finalized:
                // Already sealed but not synced — RoomScanSyncService owns the
                // retry. Not ours to touch either way.
                continue

            case .tooSmall(let photosCount):
                logger.info("Scan \(scanId, privacy: .public) has only \(photosCount) photos; discarding")
                removeBundleDirectory(at: bundleURL)
                rowsToDelete.append(package)

            case .recoverable(let photosCount, let reviewCompletedAt):
                candidates.append(
                    RecoveryCandidate(
                        id: package.scanId,
                        bundleURL: bundleURL,
                        photosCount: photosCount,
                        reviewCompletedAt: reviewCompletedAt,
                        createdAt: package.createdAt
                    )
                )
            }
        }

        for pkg in rowsToDelete {
            context.delete(pkg)
        }

        if !rowsToDelete.isEmpty || didQuarantine {
            do {
                try context.save()
            } catch {
                logger.error("Failed to save after recovery pass: \(error.localizedDescription, privacy: .public)")
            }
        }

        return candidates
    }

    // MARK: - Classification

    /// What the recovery pass decided about one bundle. Split out of the loop
    /// so the disposition is a value you can read in one screen — the defect
    /// this replaced was a chain of `guard`s in which "the manifest won't
    /// decode" and "there is no bundle" fell into the same delete.
    private enum Disposition {
        /// Row points at a directory that isn't on disk. Delete the row.
        case orphanedRow
        /// Directory is on disk and holds zero bytes. Delete both.
        case emptyBundle
        /// Directory holds bytes but no manifest. Keep everything; quarantine.
        case unreadable(QuarantineReason)
        /// Manifest is there and threw. Keep everything; quarantine.
        case unreadableManifest(QuarantineReason, any Error)
        /// `completedAt != nil` — the sync service still owns it.
        case finalized
        /// Decoded cleanly, below the viability threshold.
        case tooSmall(photosCount: Int)
        /// Decoded cleanly and worth prompting about.
        case recoverable(photosCount: Int, reviewCompletedAt: Date?)
    }

    private func classify(package: RoomScanPackage, bundleURL: URL) -> Disposition {
        let fm = FileManager.default

        var isDirectory: ObjCBool = false
        guard fm.fileExists(atPath: bundleURL.path, isDirectory: &isDirectory), isDirectory.boolValue else {
            return .orphanedRow
        }

        // Byte total rather than entry count: a directory holding only empty
        // files or empty subdirectories is just as empty as one holding
        // nothing, and both are the "zero-byte bundle" case.
        guard bundleByteCount(at: bundleURL) > 0 else {
            return .emptyBundle
        }

        // Past this line the directory holds real bytes. NOTHING below may
        // delete them except `tooSmall`, which is reached only after a clean
        // decode.

        let manifestURL = bundleURL.appendingPathComponent("manifest.json")
        guard fm.fileExists(atPath: manifestURL.path) else {
            return .unreadable(.manifestMissing)
        }

        let manifest: ScanManifest
        do {
            // The writer's own reader: same `.iso8601` strategy, one read path.
            manifest = try ScanBundleWriter.readManifest(at: bundleURL)
        } catch {
            return .unreadableManifest(.manifestUnreadable, error)
        }

        if !manifest.unreadableInstrumentKeys.isEmpty {
            // A partial degrade, not a failure: the scan is intact and usable,
            // we just could not read some instrument diagnostics. Say so —
            // this is the line that will name the first forward-compat break.
            let keys = manifest.unreadableInstrumentKeys.joined(separator: ",")
            logger.error(
                "Scan \(package.scanId.uuidString, privacy: .public) kept; unreadable instrument keys: \(keys, privacy: .public)"
            )
            UploadDiagnosticsLog.shared.log(
                event: "scan_manifest_instrument_degraded",
                scanId: package.scanId,
                extra: ["keys": keys]
            )
        }

        if manifest.completedAt != nil {
            return .finalized
        }

        let photosCount = countPhotos(in: bundleURL, manifest: manifest)
        guard photosCount >= minimumViablePhotoCount else {
            return .tooSmall(photosCount: photosCount)
        }

        return .recoverable(
            photosCount: photosCount,
            reviewCompletedAt: manifest.annotations.reviewCompletedAt
        )
    }

    /// Keep the bytes, mark the row, and make the failure legible on every
    /// surface we have: the unified log, the NDJSON upload-diagnostics sink
    /// (pullable off a device), and `lastError` on the row itself.
    private func quarantine(_ package: RoomScanPackage, reason: QuarantineReason, detail: String?) {
        let scanId = package.scanId.uuidString
        logger.error(
            "Quarantining scan \(scanId, privacy: .public): \(reason.rawValue, privacy: .public) — \(detail ?? "no manifest", privacy: .public). Bundle KEPT."
        )
        UploadDiagnosticsLog.shared.log(
            event: "scan_bundle_quarantined",
            scanId: package.scanId,
            error: detail,
            extra: ["reason": reason.rawValue]
        )
        package.markQuarantined(reason.summary)
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

    /// Total bytes of regular files under `url`, recursively. Zero means the
    /// bundle holds nothing worth keeping — the only on-disk state this pass
    /// will delete without understanding it.
    private func bundleByteCount(at url: URL) -> Int {
        let keys: Set<URLResourceKey> = [.isRegularFileKey, .fileSizeKey]
        guard let enumerator = FileManager.default.enumerator(
            at: url,
            includingPropertiesForKeys: Array(keys),
            options: []
        ) else {
            // Can't enumerate: assume there IS something. An unreadable
            // directory is not an empty one, and guessing "empty" here is the
            // guess that deletes.
            return 1
        }

        var total = 0
        for case let fileURL as URL in enumerator {
            guard
                let values = try? fileURL.resourceValues(forKeys: keys),
                values.isRegularFile == true
            else { continue }
            total += values.fileSize ?? 0
        }
        return total
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

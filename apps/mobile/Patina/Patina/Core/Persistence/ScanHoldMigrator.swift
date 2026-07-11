//
//  ScanHoldMigrator.swift
//  Patina
//
//  One-time launch migration that retro-fits the strict-local-until-request
//  hold onto scan bundles created before the hold pipeline existed.
//
//  The old flow auto-uploaded every finalized scan; a bundle could be left
//  in `.pending` for two reasons: (a) it was created and simply hadn't
//  started uploading yet, or (b) the retired passive cellular gate parked it
//  in `.pending` with a "Waiting for Wi-Fi" breadcrumb — and, because
//  `resumePendingUploads` only ever refetched `syncing`/`failed`, those
//  cellular-parked rows were STRANDED forever (a live bug).
//
//  The migration rule is a single privacy-first invariant:
//
//    "If any bytes already left the phone, finish the job. Otherwise, hold."
//
//  So a `.pending` row with no server-side room row (`remoteRoomId == nil`)
//  and no artifact that has reached `.uploaded` is flipped to `.heldLocal`
//  (and its stale "Waiting for Wi-Fi" error cleared) — this both realises
//  the local-until-request promise for pre-existing scans AND un-strands the
//  cellular-parked rows. Anything with a `remoteRoomId` or an already-
//  uploaded artifact is left exactly as-is so `resumePendingUploads` can
//  finish the upload under the consent the user already gave.
//

import Foundation
import SwiftData
import os

/// One-time migrator that moves pre-hold `.pending` scan bundles into the
/// strict-local `.heldLocal` state. Guarded by a UserDefaults version key so
/// it runs at most once per install generation; call it once at launch,
/// BEFORE `resumePendingUploads`.
@MainActor
public final class ScanHoldMigrator {

    public static let shared = ScanHoldMigrator()

    /// Bump this when the migration semantics change so the pass re-runs.
    static let versionKey = "ScanHoldMigrator.completedVersion"
    static let currentVersion = 1

    private let logger = Logger(subsystem: "com.patina.app", category: "ScanHoldMigrator")

    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// Run the migration once. No-op if it has already completed at the
    /// current version. Returns the number of bundles flipped to `.heldLocal`
    /// (0 when it no-ops or nothing qualified) so callers/tests can assert.
    @discardableResult
    public func migrateIfNeeded(in context: ModelContext) -> Int {
        guard defaults.integer(forKey: Self.versionKey) < Self.currentVersion else {
            return 0
        }

        let flipped = migrate(in: context)
        defaults.set(Self.currentVersion, forKey: Self.versionKey)
        if flipped > 0 {
            logger.info("Held \(flipped, privacy: .public) pre-hold scan bundle(s) locally")
        }
        return flipped
    }

    /// The migration body, exposed for unit tests (which drive it directly on
    /// an in-memory container without the UserDefaults guard).
    @discardableResult
    func migrate(in context: ModelContext) -> Int {
        // Only `.pending` rows are candidates — `syncing`/`failed`/`synced`/
        // already-`heldLocal` are all left untouched.
        let descriptor = FetchDescriptor<RoomScanPackage>(
            predicate: #Predicate<RoomScanPackage> { pkg in
                pkg.statusRaw == "pending"
            }
        )

        guard let packages = try? context.fetch(descriptor) else {
            logger.error("Failed to fetch pending scan packages for hold migration")
            return 0
        }

        var flipped = 0
        for package in packages {
            // If any bytes are already server-side, finish the job — leave it
            // for `resumePendingUploads`. "Bytes left the phone" == a parent
            // room row was created OR at least one artifact reached uploaded.
            if package.remoteRoomId != nil { continue }
            let anyUploaded = package.artifactState.artifacts.contains { $0.status == .uploaded }
            if anyUploaded { continue }

            package.markHeldLocal()
            flipped += 1
        }

        if flipped > 0 {
            do {
                try context.save()
            } catch {
                logger.error("Failed to save after hold migration: \(error.localizedDescription, privacy: .public)")
            }
        }

        return flipped
    }
}

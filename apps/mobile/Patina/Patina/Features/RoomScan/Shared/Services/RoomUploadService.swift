//
//  RoomUploadService.swift
//  Patina
//
//  Strict-local hold for finalized scan bundles. In the local-until-request
//  pipeline NO scan bytes leave the phone at scan time — the review-complete
//  handoff seals the bundle and parks it in `.heldLocal`. The bundle only
//  uploads later, inside the explicit design-request flow
//  (`DesignRequestCoordinator`), never here.
//
//  This file used to detach a background upload from the Soft Landing
//  transition; that auto-upload path (performUpload / loadPackage / the
//  legacy no-op overload) was deleted when the hold became the only
//  pre-upload resting state.
//

import Foundation
import SwiftData

@MainActor
public final class RoomUploadService {

    public static let shared = RoomUploadService()

    private init() {}

    /// Seal a finalized scan bundle on the phone WITHOUT uploading it.
    ///
    /// Writes (or updates) a `RoomScanPackage` in `.heldLocal`, stamping the
    /// review-step metadata read off the sealed manifest (room name, review
    /// timestamp, hero photo, byte size — fields that exist on the row but
    /// were never populated by the old auto-upload path), and persists a
    /// local `RoomModel` via `RoomStore.saveScan` so the room shows up in
    /// "Your Spaces" immediately. The room is marked `.local` (only exists on
    /// this phone) — held scans are never "waiting to sync".
    ///
    /// All failures are swallowed and logged; sealing must never block the
    /// UI flow onward to the saved-confirmation screen.
    public func holdLocally(
        session: RoomScanSession,
        roomData: FirstWalkRoomData,
        bundlePath: String?,
        modelContext: ModelContext
    ) {
        guard let bundlePath, !bundlePath.isEmpty else {
            PatinaLog.scan.error("[RoomUploadService] holdLocally called with no bundlePath — cannot hold")
            return
        }

        // 1. Upsert the package row in the held state.
        let package = upsertHeldPackage(
            scanId: roomData.roomId,
            roomLocalId: roomData.roomId,
            bundlePath: bundlePath,
            modelContext: modelContext
        )

        // 2. Stamp review-step metadata from the sealed manifest.
        if let bundleURL = package.absoluteBundleURL,
           let manifest = try? ScanBundleWriter.readManifest(at: bundleURL) {
            package.userProvidedRoomName = manifest.annotations.userProvidedRoomName
                ?? package.userProvidedRoomName
            package.reviewCompletedAt = manifest.annotations.reviewCompletedAt ?? Date()
            package.heroPhotoId = Self.heroPhotoId(in: manifest)
            package.userRoomNotes = manifest.annotations.roomNotes
            let size = manifest.artifacts.reduce(0) { $0 + $1.sizeBytes }
                + manifest.photos.reduce(0) { $0 + $1.sizeBytes }
            if size > 0 { package.sizeBytes = size }
            package.updatedAt = Date()
        } else {
            // No manifest yet (defensive) — still record the review time.
            package.reviewCompletedAt = Date()
        }
        try? modelContext.save()

        // 3. Persist the local RoomModel so "Your Spaces" reflects the scan.
        //    saveScan defaults to `.pending`; a held scan only exists locally,
        //    so re-mark it `.local` (no false "waiting to sync").
        let store = RoomStore(context: modelContext)
        let room = store.saveScan(
            roomData: roomData,
            name: package.userProvidedRoomName
        )
        room.syncStatus = .local
        store.touch(room)

        // 4. Observe the hold via PostHog. Replaces `scan_upload_started` —
        //    nothing uploads here anymore.
        PostHogService.shared.capture("scan_held_locally", properties: [
            "scan_session_id": session.sessionId.uuidString,
            "scan_id": roomData.roomId.uuidString,
            "scan_method": session.scanMethod.rawValue,
            "window_count": session.features.windowCount,
            "door_count": session.features.doorCount,
            "room_type": session.features.roomType,
            "size_bytes": package.sizeBytes
        ])
    }

    // MARK: - Persistence

    /// Insert or update the `RoomScanPackage` row, forcing it into
    /// `.heldLocal`. Keyed on `scanId` (== `room_scans.id` / bundle dir id).
    @discardableResult
    private func upsertHeldPackage(
        scanId: UUID,
        roomLocalId: UUID,
        bundlePath: String,
        modelContext: ModelContext
    ) -> RoomScanPackage {
        let descriptor = FetchDescriptor<RoomScanPackage>(
            predicate: #Predicate { $0.scanId == scanId }
        )
        if let existing = (try? modelContext.fetch(descriptor))?.first {
            existing.bundlePath = bundlePath
            existing.markHeldLocal()
            return existing
        }
        let pkg = RoomScanPackage(
            scanId: scanId,
            roomLocalId: roomLocalId,
            bundlePath: bundlePath,
            status: .heldLocal
        )
        modelContext.insert(pkg)
        return pkg
    }

    /// Resolve the hero photo id the user picked in the review step (or the
    /// auto-scored hero) so the picker/room card can show the right frame.
    private static func heroPhotoId(in manifest: ScanManifest) -> UUID? {
        if let userHero = manifest.photos.first(where: { $0.isUserSelectedHero }) {
            return userHero.id
        }
        if let scoredHero = manifest.photos.first(where: { $0.kind == .hero }) {
            return scoredHero.id
        }
        return nil
    }
}

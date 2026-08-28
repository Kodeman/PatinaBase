//
//  LocalStoreReset.swift
//  Patina
//
//  Wipes all user-scoped local data so one account's rooms / scans / saved
//  items / taste profile / design requests never leak into another. The local
//  SwiftData store (PersistenceController.shared) is device-global and has no
//  per-user scoping, so isolation is enforced at the auth boundary: AuthService
//  calls this ONLY when a DIFFERENT real account signs in. A guest→account
//  transition is NOT a wipe — the guest's local scans are claimed by the new
//  account (see AuthService.reconcileLocalStoreOwner).
//

import Foundation
import SwiftData

@MainActor
enum LocalStoreReset {

    /// Delete every user-scoped `@Model` in the shared container (the full
    /// PersistenceController schema — all of these belong to a single signed-in
    /// identity), clear the in-memory room selection, and remove the on-disk
    /// scan bundles left by wiped `RoomScanPackage` rows.
    static func wipeUserScopedData() {
        let context = PersistenceController.shared.container.mainContext
        do {
            try context.delete(model: RoomModel.self)
            try context.delete(model: SavedItem.self)
            try context.delete(model: RoomScanPackage.self)
            try context.delete(model: StylePreferenceModel.self)
            try context.delete(model: SubmittedDesignRequest.self)
            try context.delete(model: DesignRequestDraft.self)
            try context.delete(model: SyncQueueItem.self)
            try context.delete(model: TableItemModel.self)
            try context.save()
        } catch {
            PatinaLog.auth.error("[LocalStoreReset] SwiftData wipe failed: \(error.localizedDescription)")
        }

        // The "currently selected room" mirror lives outside SwiftData.
        RoomSelectionStore.shared.clear()

        // Remove on-disk scan bundles (USDZ / HEIC / meshes) so wiped
        // RoomScanPackage rows don't leave orphaned files for the next account.
        deleteScanBundles()

        // The Record's two artefacts live in the App Group container, outside
        // SwiftData and outside this app's own domain, so nothing above
        // touches them. Left behind, the next account's Today paints the
        // previous account's NEEDS YOU rows — its invoice figure, its
        // designer's name — for the whole window between the cold-launch
        // snapshot paint and the rebuild.
        RecordSnapshotStore.shared.remove()
        LastSeenStore.shared.clear()
        RecordOwnerStamp.shared.clear()

        // The rooms the sync debounce was protecting are gone; the next
        // screen must ask again rather than wait out the window.
        RoomSyncCoordinator.shared.forget()
    }

    /// "Start fresh" on the SP-06 claim sheet — the guest's work, and only the
    /// guest's.
    ///
    /// The claim is offered to an account taking over a store no account has
    /// owned, and everything in it at that moment is a guest's. Everything
    /// except a room carrying a `remoteId`: those are the account's own rooms,
    /// mirrored down from the server, and "start fresh" must never be a way to
    /// delete them. The whole-store wipe above is for the other case — a
    /// DIFFERENT account taking over — where the rows really do belong to
    /// somebody else.
    static func wipeGuestWork(in context: ModelContext? = nil) {
        let context = context ?? PersistenceController.shared.container.mainContext
        do {
            for room in (try? context.fetch(FetchDescriptor<RoomModel>())) ?? [] {
                guard room.remoteId == nil else { continue }
                // `items` cascades with the room.
                context.delete(room)
            }
            try context.delete(model: RoomScanPackage.self)
            try context.delete(model: StylePreferenceModel.self)
            try context.delete(model: SubmittedDesignRequest.self)
            try context.delete(model: DesignRequestDraft.self)
            try context.delete(model: SyncQueueItem.self)
            try context.delete(model: TableItemModel.self)
            try context.save()
        } catch {
            PatinaLog.auth.error("[LocalStoreReset] guest wipe failed: \(error.localizedDescription)")
        }

        RoomSelectionStore.shared.clear()
        deleteScanBundles()
        RoomSyncCoordinator.shared.forget()
    }

    /// `Application Support/Scans/` — the root `ScanBundleWriter` writes each
    /// scan bundle under (`Scans/{scanId}/…`).
    private static func deleteScanBundles() {
        let fm = FileManager.default
        guard let appSupport = try? fm.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: false
        ) else { return }
        let scansRoot = appSupport.appendingPathComponent("Scans", isDirectory: true)
        try? fm.removeItem(at: scansRoot)
    }
}

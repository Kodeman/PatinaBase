//
//  RoomUploadService.swift
//  Patina
//
//  Thin facade over RoomScanSyncService so the Quiet Conversation flow has a
//  clean, forward-only API for kicking off the background upload during the
//  Soft Landing transition. Uploads must NOT block UI state transitions
//  (per PRD §4.5).
//

import Foundation
import SwiftData
import UIKit

@MainActor
public final class RoomUploadService {

    public static let shared = RoomUploadService()

    private init() {}

    /// Legacy entry point used by the Soft Landing transition. Logs the
    /// intent and returns immediately — the real upload is driven by the
    /// richer `uploadInBackground(session:roomData:...)` overload called
    /// from the scan completion path, which has `roomData` + `styleSignals`
    /// in scope. The two overloads coexist so the UI flow never blocks and
    /// the full data pipeline only runs once, where it has everything.
    public func uploadInBackground(
        session: RoomScanSession,
        usdzData: Data? = nil,
        heroImageData: Data? = nil
    ) {
        PostHogService.shared.capture("scan_upload_hinted", properties: [
            "scan_session_id": session.sessionId.uuidString,
            "scan_method": session.scanMethod.rawValue,
            "has_usdz": usdzData != nil,
            "has_hero": heroImageData != nil,
            "window_count": session.features.windowCount,
            "door_count": session.features.doorCount,
            "room_type": session.features.roomType
        ])
        // The real upload is enqueued by ScanViewModel /
        // QuietConversationFlowHost via the full-data overload below.
    }

    /// Kick off a background upload for a completed LiDAR scan.
    ///
    /// Writes a `RoomScanPackage` row pointing at the on-disk bundle and
    /// enqueues a `SyncQueueItem` so `RoomScanSyncService` picks it up
    /// on its next tick (or immediately, if online).
    ///
    /// All errors are swallowed and logged — the UI flow must always
    /// continue to the Conversation.
    public func uploadInBackground(
        session: RoomScanSession,
        roomData: FirstWalkRoomData,
        styleSignals: FirstWalkStyleSignals,
        bundlePath: String?,
        remoteRoomId: UUID? = nil,
        modelContext: ModelContext
    ) {
        // Observe the outcome via PostHog's existing infra.
        PostHogService.shared.capture("scan_upload_started", properties: [
            "scan_session_id": session.sessionId.uuidString,
            "scan_method": session.scanMethod.rawValue,
            "has_bundle": bundlePath != nil,
            "window_count": session.features.windowCount,
            "door_count": session.features.doorCount,
            "room_type": session.features.roomType
        ])

        // Record (or update) the RoomScanPackage row so the bundle survives
        // app restarts and can be resumed by RoomScanSyncService.
        //
        // We key the package on `roomData.roomId` (not session.sessionId) so
        // the package, the bundle directory, and `room_scans.id` server-side
        // are all one id. `RoomCaptureService.processRoom()` reuses
        // `currentScanId` for `FirstWalkRoomData.roomId` to guarantee that.
        if let bundlePath = bundlePath {
            upsertPackage(
                scanId: roomData.roomId,
                roomLocalId: roomData.roomId,
                bundlePath: bundlePath,
                remoteRoomId: remoteRoomId,
                modelContext: modelContext
            )
        }

        // Detached task so the Soft Landing UI doesn't wait on us.
        let capturedSession = session
        let capturedRoomData = roomData
        let capturedStyleSignals = styleSignals
        let capturedBundlePath = bundlePath

        Task.detached(priority: .utility) {
            await Self.performUpload(
                session: capturedSession,
                roomData: capturedRoomData,
                styleSignals: capturedStyleSignals,
                bundlePath: capturedBundlePath
            )
        }
    }

    // MARK: - Persistence

    private func upsertPackage(
        scanId: UUID,
        roomLocalId: UUID,
        bundlePath: String,
        remoteRoomId: UUID?,
        modelContext: ModelContext
    ) {
        let descriptor = FetchDescriptor<RoomScanPackage>(
            predicate: #Predicate { $0.scanId == scanId }
        )
        if let existing = (try? modelContext.fetch(descriptor))?.first {
            existing.bundlePath = bundlePath
            if existing.remoteRoomId == nil { existing.remoteRoomId = remoteRoomId }
            existing.updatedAt = Date()
        } else {
            let pkg = RoomScanPackage(
                scanId: scanId,
                roomLocalId: roomLocalId,
                bundlePath: bundlePath,
                remoteRoomId: remoteRoomId
            )
            modelContext.insert(pkg)
        }
        try? modelContext.save()
    }

    // MARK: - Upload

    private static func performUpload(
        session: RoomScanSession,
        roomData: FirstWalkRoomData,
        styleSignals: FirstWalkStyleSignals,
        bundlePath: String?
    ) async {
        guard let bundlePath = bundlePath else {
            // Legacy v1 — fall back to existing path.
            do {
                _ = try await RoomScanSyncService.shared.uploadRoomScan(
                    roomData: roomData,
                    styleSignals: styleSignals,
                    thumbnail: nil,
                    projectId: nil,
                    existingRoomRemoteId: nil,
                    usdzData: nil
                )
            } catch {
                await reportFailure(session: session, error: error)
            }
            return
        }

        // v2 advanced bundle upload. The RoomScanPackage row was written
        // from the main actor before this task started; refetch it here.
        let package = await loadPackage(scanId: roomData.roomId, bundlePath: bundlePath)
        guard let package = package else {
            await reportFailure(
                session: session,
                error: NSError(domain: "RoomUploadService", code: -1,
                               userInfo: [NSLocalizedDescriptionKey: "RoomScanPackage missing"])
            )
            return
        }

        do {
            _ = try await RoomScanSyncService.shared.uploadAdvancedScanBundle(
                package: package,
                roomData: roomData,
                styleSignals: styleSignals
            )
            await MainActor.run {
                PostHogService.shared.capture("scan_upload_succeeded", properties: [
                    "scan_session_id": session.sessionId.uuidString,
                    "room_id": roomData.roomId.uuidString
                ])
            }
        } catch {
            await reportFailure(session: session, error: error)
        }
    }

    @MainActor
    private static func loadPackage(scanId: UUID, bundlePath: String) -> RoomScanPackage? {
        let container = PersistenceController.shared.container
        let ctx = container.mainContext
        let descriptor = FetchDescriptor<RoomScanPackage>(
            predicate: #Predicate { $0.scanId == scanId }
        )
        return (try? ctx.fetch(descriptor))?.first
    }

    @MainActor
    private static func reportFailure(session: RoomScanSession, error: Error) {
        PostHogService.shared.capture("scan_upload_failed", properties: [
            "scan_session_id": session.sessionId.uuidString,
            "error": error.localizedDescription
        ])
    }
}

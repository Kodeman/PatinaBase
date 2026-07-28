//
//  RoomCreationCoordinator.swift
//  Patina
//
//  Orchestrates room-creation side effects for the **manual entry** path:
//  local SwiftData insert → PostgREST write-through → Daily Room selection
//  fan-out. The scanned-room flow lives in `RoomScanSyncService.uploadRoomScan`
//  now — there's only one sync path to keep correct.
//

import Foundation
import SwiftData

@MainActor
public final class RoomCreationCoordinator {

    public struct Result {
        public let room: RoomModel
        public let remoteRoomId: String
        public let remoteScanId: String?
    }

    private let store: RoomStore
    private let api: RoomsAPIClient
    private let selection: RoomSelectionStore

    public init(
        store: RoomStore,
        api: RoomsAPIClient = .shared,
        selection: RoomSelectionStore = .shared
    ) {
        self.store = store
        self.api = api
        self.selection = selection
    }

    /// Display name for a room the user never named. Shared by every
    /// manual-entry surface so a hand-typed room and a fallback-scanned room
    /// of the same type read identically in "Your Spaces".
    ///
    /// `nonisolated` so pure value types (e.g. `FallbackRoomDraft`) can build
    /// a name without hopping to the main actor.
    nonisolated public static func defaultDisplayName(forType type: String) -> String {
        switch type {
        case "living":  return "Living Room"
        case "bedroom": return "Bedroom"
        case "office":  return "Office"
        case "dining":  return "Dining Room"
        case "kitchen": return "Kitchen"
        default:        return "Room"
        }
    }

    /// Create a room with no scan attached (manual entry path).
    public func createManualRoom(
        name: String,
        roomType: String,
        widthFeet: Double?,
        lengthFeet: Double?,
        ceilingHeightFeet: Double?,
        orientationRaw: String,
        windowCount: Int,
        doorCount: Int
    ) async throws -> Result {
        // 1. Local insert — UI updates immediately
        let local = store.createRoom(
            name: name,
            roomType: roomType,
            widthFeet: widthFeet,
            lengthFeet: lengthFeet,
            ceilingHeightFeet: ceilingHeightFeet,
            orientationRaw: orientationRaw,
            windowCount: windowCount,
            doorCount: doorCount,
            manualEntry: true
        )

        // 2. Remote write-through
        let userId = try await api.resolveUserId()
        let remote = try await api.createRoom(CreateRoomPayload(
            name: name,
            type: roomType,
            lengthMeters: lengthFeet.map { $0 * 0.3048 },
            widthMeters: widthFeet.map { $0 * 0.3048 },
            heightMeters: ceilingHeightFeet.map { $0 * 0.3048 },
            styleSignals: nil,
            userId: userId
        ))

        // 3. Stash the remote id on the local model (see RoomModel+Remote)
        local.remoteId = remote.id
        store.touch(local)

        // 4. Select the new room so the Daily Room feed switches to it
        selection.select(localId: local.id, remoteId: remote.id)

        return Result(room: local, remoteRoomId: remote.id, remoteScanId: nil)
    }
}

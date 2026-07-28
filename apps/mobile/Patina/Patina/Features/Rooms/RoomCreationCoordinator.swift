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

/// The remote half of manual room creation. A protocol rather than the
/// concrete `RoomsAPIClient` so the offline / signed-out path — the one that
/// used to end in a duplicate room — is exercisable without a live client.
public protocol RoomCreationRemote: Sendable {
    func resolveUserId() async throws -> String
    func createRoom(_ payload: CreateRoomPayload) async throws -> RemoteRoom
}

extension RoomsAPIClient: RoomCreationRemote {}

@MainActor
public final class RoomCreationCoordinator {

    public struct Result {
        public let room: RoomModel
        /// `nil` when the remote write-through failed — the room lives on this
        /// phone only. It is still the one and only `RoomModel` for this
        /// creation; callers must never insert a replacement.
        public let remoteRoomId: String?
        public let remoteScanId: String?

        public var isLocalOnly: Bool { remoteRoomId == nil }
    }

    private let store: RoomStore
    private let api: RoomCreationRemote
    private let selection: RoomSelectionStore

    public init(
        store: RoomStore,
        api: RoomCreationRemote = RoomsAPIClient.shared,
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
    ///
    /// Exactly one `RoomModel` is inserted per call whatever the network does.
    /// A failed write-through downgrades the result to local-only instead of
    /// throwing, so no caller can "recover" from the error by inserting a
    /// second room — which is how one "This Looks Right" produced two rooms.
    @discardableResult
    public func createManualRoom(
        name: String,
        roomType: String,
        widthFeet: Double?,
        lengthFeet: Double?,
        ceilingHeightFeet: Double?,
        orientationRaw: String,
        windowCount: Int,
        doorCount: Int
    ) async -> Result {
        // 1. Local insert — UI updates immediately. This is the only insert
        //    this method ever performs.
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

        // Parity with `RoomScanSyncService.uploadRoomScan`: on a cold launch
        // the auth-state listener has not published a session yet, so a
        // signed-in user's first manual room would resolve as unauthenticated
        // and land local-only for no reason other than timing.
        await AuthService.shared.waitForAuthReady()

        do {
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
        } catch {
            // Guests and offline users keep the room they just made; it syncs
            // when they sign in or reconnect.
            selection.select(localId: local.id, remoteId: nil)
            #if DEBUG
            PatinaLog.sync.error("[RoomCreationCoordinator] remote room write failed, keeping the local room: \(error)")
            #endif
            return Result(room: local, remoteRoomId: nil, remoteScanId: nil)
        }
    }
}

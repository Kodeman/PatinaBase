//
//  RoomStore.swift
//  Patina
//
//  Central persistence surface for the Room System. Wraps a SwiftData
//  ModelContext so the gallery, room detail, cross-room view, and the
//  Daily Room feed all mutate rooms and saved items through one place.
//

import Foundation
import SwiftData

@MainActor
public final class RoomStore {

    public let context: ModelContext

    public init(context: ModelContext) {
        self.context = context
    }

    // MARK: - Reads

    public func allRooms() -> [RoomModel] {
        let descriptor = FetchDescriptor<RoomModel>(
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    public func room(id: UUID) -> RoomModel? {
        let descriptor = FetchDescriptor<RoomModel>(
            predicate: #Predicate { $0.id == id }
        )
        return (try? context.fetch(descriptor))?.first
    }

    public func allItems() -> [SavedItem] {
        let descriptor = FetchDescriptor<SavedItem>(
            sortBy: [SortDescriptor(\.addedAt, order: .reverse)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    /// Grand totals for the "Whole Home" cross-room bar.
    public struct WholeHomeStats {
        public let roomCount: Int
        public let itemCount: Int
        public let totalCents: Int
    }

    public func wholeHomeStats() -> WholeHomeStats {
        let rooms = allRooms()
        let items = allItems()
        let total = items.reduce(0) { $0 + $1.priceCents }
        return WholeHomeStats(
            roomCount: rooms.count,
            itemCount: items.count,
            totalCents: total
        )
    }

    // MARK: - Create / Update Rooms

    @discardableResult
    public func createRoom(
        name: String,
        roomType: String,
        widthFeet: Double? = nil,
        lengthFeet: Double? = nil,
        ceilingHeightFeet: Double? = nil,
        orientationRaw: String = "",
        windowCount: Int = 0,
        doorCount: Int = 0,
        manualEntry: Bool
    ) -> RoomModel {
        // Convert feet → meters for RoomModel's internal storage when provided.
        let wMeters = widthFeet.map { $0 * 0.3048 }
        let lMeters = lengthFeet.map { $0 * 0.3048 }
        let hMeters = ceilingHeightFeet.map { $0 * 0.3048 }

        let room = RoomModel(
            name: name,
            roomType: roomType,
            hasBeenScanned: !manualEntry,
            width: wMeters,
            length: lMeters,
            height: hMeters
        )
        room.orientationRaw = orientationRaw
        room.windowCount = windowCount
        room.doorCount = doorCount
        room.ceilingHeightFeet = ceilingHeightFeet
        context.insert(room)
        save()
        return room
    }

    /// Persist a completed Walk scan as a local `RoomModel`. This is the
    /// local half of the scan save pipeline — it runs *before* the remote
    /// upload in `RoomScanSyncService` so the UI can show the new room
    /// immediately, independent of network. The `remoteId` / `remoteScanId`
    /// columns are populated later by `markRoomSynced` once the upload
    /// completes.
    ///
    /// If a `RoomModel` with the same id already exists (e.g. a rescan of
    /// the current selection), its dimensions are updated in place rather
    /// than inserting a duplicate row.
    @discardableResult
    public func saveScan(
        roomData: FirstWalkRoomData,
        name: String? = nil,
        roomType: String = "other"
    ) -> RoomModel {
        let finalName = (name?.isEmpty == false ? name : nil)
            ?? (roomData.roomName.isEmpty ? "New Room" : roomData.roomName)

        if let existing = room(id: roomData.roomId) {
            existing.name = finalName
            existing.roomType = roomType
            existing.hasBeenScanned = true
            existing.width = Double(roomData.dimensions.width)
            existing.length = Double(roomData.dimensions.length)
            existing.height = Double(roomData.dimensions.height)
            existing.heroFrameData = roomData.heroFrameData
            existing.heroFrameScore = roomData.heroFrameScore
            existing.heroFrameTimestamp = roomData.heroFrameData != nil ? Date() : existing.heroFrameTimestamp
            existing.syncStatus = .pending
            existing.updatedAt = Date()
            save()
            return existing
        }

        let room = RoomModel(
            id: roomData.roomId,
            name: finalName,
            roomType: roomType,
            hasBeenScanned: true,
            width: Double(roomData.dimensions.width),
            length: Double(roomData.dimensions.length),
            height: Double(roomData.dimensions.height),
            syncStatus: .pending,
            heroFrameData: roomData.heroFrameData,
            heroFrameScore: roomData.heroFrameScore
        )
        room.windowCount = roomData.windowCount
        context.insert(room)
        save()
        return room
    }

    /// Mark a local room as fully synced with its server-side counterparts.
    /// Called after `RoomScanSyncService.uploadRoomScan` returns successfully.
    public func markRoomSynced(
        localId: UUID,
        remoteRoomId: UUID,
        remoteScanId: UUID
    ) {
        guard let room = room(id: localId) else { return }
        room.remoteId = remoteRoomId.uuidString
        room.remoteScanId = remoteScanId
        room.syncStatus = .synced
        room.lastSyncedAt = Date()
        room.updatedAt = Date()
        save()
    }

    /// Mark a local room as having failed to sync. The sync queue keeps the
    /// actual payload; this just updates the local model so the UI can show a
    /// "saved locally, waiting to sync" badge.
    public func markRoomSyncFailed(localId: UUID) {
        guard let room = room(id: localId) else { return }
        room.syncStatus = .failed
        room.updatedAt = Date()
        save()
    }

    /// Persist any in-memory mutations on a RoomModel (e.g., remoteId).
    public func touch(_ room: RoomModel) {
        room.updatedAt = Date()
        save()
    }

    public func rename(_ room: RoomModel, to newName: String) {
        room.name = newName
        room.updatedAt = Date()
        save()
    }

    public func updateType(_ room: RoomModel, to newType: String) {
        room.roomType = newType
        room.updatedAt = Date()
        save()
    }

    /// The local half of the room budget. Always succeeds — the mirror to
    /// `rooms.budget_cents` is `RoomBudgetCoordinator`'s, and a room that has
    /// never synced still keeps the figure its owner typed.
    public func setBudget(_ room: RoomModel, cents: Int?) {
        room.budgetCents = cents
        room.updatedAt = Date()
        save()
    }

    /// Dimensions the person typed against the segmented unit control.
    ///
    /// Deliberately NOT `RoomModel.updateDimensions`, which sets
    /// `hasBeenScanned = true`: a typed correction is still a typed room, and
    /// flipping the flag would relabel it `SCANNED` on every surface (F51).
    public func updateTypedDimensions(
        _ room: RoomModel,
        widthMeters: Double?,
        lengthMeters: Double?,
        heightMeters: Double?
    ) {
        room.width = widthMeters
        room.length = lengthMeters
        if let heightMeters { room.height = heightMeters }
        room.measuredWithUnitControl = true
        room.updatedAt = Date()
        save()
    }

    public func delete(_ room: RoomModel) {
        context.delete(room)
        save()
    }

    // MARK: - Items

    @discardableResult
    func addItem(
        _ product: Product,
        matchScore: Int,
        toRoomId roomId: UUID
    ) -> SavedItem? {
        guard let room = room(id: roomId) else { return nil }
        let item = SavedItem.make(from: product, matchScore: matchScore, room: room)
        context.insert(item)
        room.savedItemCount = (room.items.count) + 1
        room.updatedAt = Date()
        save()
        return item
    }

    public func moveItem(_ item: SavedItem, toRoomId newRoomId: UUID) {
        guard let newRoom = room(id: newRoomId) else { return }
        let oldRoom = item.room
        item.room = newRoom
        oldRoom?.savedItemCount = max(0, (oldRoom?.items.count ?? 1) - 0)
        newRoom.savedItemCount = newRoom.items.count + 1
        save()
    }

    @discardableResult
    public func copyItem(_ item: SavedItem, toRoomId newRoomId: UUID) -> SavedItem? {
        guard let newRoom = room(id: newRoomId) else { return nil }
        let clone = SavedItem(
            productId: item.productId,
            productName: item.productName,
            makerName: item.makerName,
            priceCents: item.priceCents,
            matchScore: item.matchScore,
            hasAR: item.hasAR,
            thumbGradientKey: item.thumbGradientKey,
            room: newRoom
        )
        context.insert(clone)
        newRoom.savedItemCount = newRoom.items.count + 1
        save()
        return clone
    }

    public func removeItem(_ item: SavedItem) {
        let room = item.room
        context.delete(item)
        room?.savedItemCount = max(0, (room?.items.count ?? 1) - 1)
        save()
    }

    // MARK: - Persistence

    private func save() {
        do {
            try context.save()
        } catch {
            #if DEBUG
            PatinaLog.scan.error("[RoomStore] save error: \(error)")
            #endif
        }
    }
}

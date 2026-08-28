//
//  RoomBudgetCoordinator.swift
//  Patina
//
//  The room budget, local-first and mirrored (B §3, W4).
//
//  `RoomModel.budgetCents` is the source of truth on the phone;
//  `rooms.budget_cents` (00537 §1) is the copy that follows the person to
//  another device. The local write can never fail, so a guest, an offline
//  person, or a room that has never synced still keeps the figure they typed —
//  the same shape `RoomCreationCoordinator` uses for the room itself.
//

import Foundation

/// The remote half of the budget write. A protocol rather than the concrete
/// `RoomsAPIClient` so the local-only and the failed-mirror paths are
/// exercisable without a live client.
public protocol RoomBudgetRemote: Sendable {
    @discardableResult
    func updateRoomBudget(id: String, cents: Int?) async throws -> RemoteRoom
}

extension RoomsAPIClient: RoomBudgetRemote {}

@MainActor
public final class RoomBudgetCoordinator {

    public struct Result: Equatable {
        /// What is now stored on this phone. Always what was asked for.
        public let budgetCents: Int?
        /// `false` only when the mirror actually landed on `rooms`.
        public let isLocalOnly: Bool
    }

    private let store: RoomStore
    private let api: RoomBudgetRemote

    public init(store: RoomStore, api: RoomBudgetRemote = RoomsAPIClient.shared) {
        self.store = store
        self.api = api
    }

    /// Set (or, with `nil`, remove) a room's budget.
    ///
    /// Order matters: the local write happens first and unconditionally, so a
    /// dropped network call costs the mirror and never the figure.
    @discardableResult
    public func setBudget(_ room: RoomModel, cents: Int?) async -> Result {
        store.setBudget(room, cents: cents)

        guard let remoteId = room.remoteId else {
            return Result(budgetCents: cents, isLocalOnly: true)
        }

        do {
            try await api.updateRoomBudget(id: remoteId, cents: cents)
            return Result(budgetCents: cents, isLocalOnly: false)
        } catch {
            // `.pending` is what makes the room findable by a later sync; the
            // budget itself is already saved.
            room.syncStatus = .pending
            store.touch(room)
            #if DEBUG
            PatinaLog.sync.error("[RoomBudgetCoordinator] budget mirror failed, keeping the local figure: \(error)")
            #endif
            return Result(budgetCents: cents, isLocalOnly: true)
        }
    }
}

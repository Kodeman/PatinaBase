//
//  RoomSelectionStore.swift
//  Patina
//
//  Single source of truth for "which room is currently active" across
//  the Home tab (Daily Room feed), Room Context Bar, Product Detail,
//  and AR Placement. A shared store avoids prop-drilling roomId through
//  every screen.
//
//  Any feature that needs to react to room selection should observe
//  `selectedLocalId` / `selectedRemoteId`.
//

import Foundation
import Observation

@MainActor
@Observable
public final class RoomSelectionStore {
    public static let shared = RoomSelectionStore()

    public private(set) var selectedLocalId: UUID?
    public private(set) var selectedRemoteId: String?

    private init() {}

    public func select(localId: UUID?, remoteId: String?) {
        self.selectedLocalId = localId
        self.selectedRemoteId = remoteId
    }

    public func clear() {
        self.selectedLocalId = nil
        self.selectedRemoteId = nil
    }
}

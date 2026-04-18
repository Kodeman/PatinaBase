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
//  `@Published var selectedLocalId` / `selectedRemoteId`.
//

import Foundation
import Combine

@MainActor
public final class RoomSelectionStore: ObservableObject {
    public static let shared = RoomSelectionStore()

    @Published public private(set) var selectedLocalId: UUID?
    @Published public private(set) var selectedRemoteId: String?

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

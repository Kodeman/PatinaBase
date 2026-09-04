//
//  LocalRoomSignal.swift
//  Patina
//
//  A revision the room readers can observe.
//
//  B-03: after a confirmed delete, Studio still reported "2 ROOMS" and still
//  rendered the deleted room's card under YOUR ROOMS. `ProfileViewModel`
//  snapshots its rooms in `loadData(context:)`, called from one `onAppear`;
//  a delete two screens away changed the store and nothing told the snapshot.
//
//  `RoomSyncCoordinator.revision` already does this for the server merge.
//  This is the same idea for local writes, kept separate because they have
//  different readers and different reasons to fire.
//

import Foundation
import Observation

@MainActor
@Observable
final class LocalRoomSignal {

    static let shared = LocalRoomSignal()

    /// Bumped by every local write that changes which rooms exist.
    private(set) var revision: Int = 0

    init() {}

    func changed() {
        revision &+= 1
    }
}

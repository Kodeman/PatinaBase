//
//  RoomTombstones.swift
//  Patina
//
//  The rooms this phone deleted, remembered until the server agrees.
//
//  B-03's second half. `RoomStore.delete` removed the local row and nothing
//  else: `RoomsAPIClient.deleteRoom(id:)` had no callers anywhere in the app,
//  so the `rooms` row survived and the next reconcile's `plan.insert`
//  re-created the card the person had just confirmed away. Bumping the local
//  signal fixed the stale snapshot; it could not fix the reappearance.
//
//  A tombstone is the missing fact: *this remote id was deleted here, and a
//  server row carrying it is a row we have not managed to delete yet.* It
//  survives a relaunch because a delete that failed offline must not be
//  undone by the first reconcile after the phone comes back.
//

import Foundation

@MainActor
enum RoomTombstones {

    static let defaultsKey = "patina.rooms.deleted.remote_ids.v1"

    /// Enough for any plausible backlog of failed deletes, and small enough
    /// that a defaults key can never grow without bound.
    static let maximum = 200

    static var all: [String] {
        UserDefaults.standard.stringArray(forKey: defaultsKey) ?? []
    }

    /// Remote ids are uuids and the device has written both cases over the
    /// app's life, so the set is held lower-cased and compared lower-cased.
    static func contains(_ remoteId: String) -> Bool {
        all.contains(remoteId.lowercased())
    }

    static func record(_ remoteId: String) {
        let key = remoteId.lowercased()
        var ids = all.filter { $0 != key }
        ids.append(key)
        if ids.count > maximum { ids.removeFirst(ids.count - maximum) }
        UserDefaults.standard.set(ids, forKey: defaultsKey)
    }

    /// The server no longer has the row: the tombstone has done its job.
    static func clear(_ remoteId: String) {
        let key = remoteId.lowercased()
        UserDefaults.standard.set(all.filter { $0 != key }, forKey: defaultsKey)
    }

    static func clearAll() {
        UserDefaults.standard.removeObject(forKey: defaultsKey)
    }
}

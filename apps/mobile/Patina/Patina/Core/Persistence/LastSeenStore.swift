//
//  LastSeenStore.swift
//  Patina
//
//  When you were last here. The Record's "new" tick is computed against this
//  and nothing else — never against a count of days shown to the person, and
//  never against the row's own age.
//
//  Written on `scenePhase → .active` AFTER the record for that open has been
//  built, so the ticks survive one open: the fourth visit of the day still
//  shows what arrived this morning.
//
//  UserDefaults, deliberately: it is one timestamp, it must survive without a
//  schema change, and `profiles.last_seen_at` (00537) is the second-device
//  mirror, not this.
//

import Foundation

struct LastSeenStore: Sendable {

    /// The key the widget and any later mirror read. Changing it resets every
    /// installed app's idea of "new", so it is a contract, not a detail.
    static let key = "patina.house.lastSeenAt"

    static let shared = LastSeenStore()

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// The last time the person opened the app, or nil before the first open.
    /// Nil means nothing can honestly be called new.
    var lastSeenAt: Date? {
        guard let stamp = defaults.object(forKey: Self.key) as? Double else { return nil }
        return Date(timeIntervalSince1970: stamp)
    }

    func markSeen(now: Date = Date()) {
        defaults.set(now.timeIntervalSince1970, forKey: Self.key)
    }
}

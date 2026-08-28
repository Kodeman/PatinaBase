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
//  The App Group suite, not `.standard`: `UserDefaults.standard` is the app's
//  own domain and no extension can read it. W6's widget will read
//  `UserDefaults(suiteName: "group.cloud.patina.app")`, and it has to find the
//  same timestamp the app wrote or it will call everything new for ever. Same
//  container as `RecordSnapshotStore`, and the same honest fallback when the
//  suite is unreachable.
//

import Foundation

struct LastSeenStore: Sendable {

    /// The key the widget and any later mirror read. Changing it resets every
    /// installed app's idea of "new", so it is a contract, not a detail.
    static let key = "patina.house.lastSeenAt"

    /// The same group `RecordSnapshotStore` writes the snapshot into.
    static let appGroupIdentifier = "group.cloud.patina.app"

    static let shared = LastSeenStore()

    private let defaults: UserDefaults

    /// False when the shared suite was unreachable and the app's own domain is
    /// being used instead — the widget would then read nothing. Reported, not
    /// hidden; a genuinely shared suite is a device claim.
    let usesAppGroupDefaults: Bool

    /// `defaults` is for tests. Production takes the App Group suite, falling
    /// back to `.standard` only when the suite cannot be opened.
    init(defaults: UserDefaults? = nil) {
        if let defaults {
            self.defaults = defaults
            self.usesAppGroupDefaults = false
            return
        }
        let group = UserDefaults(suiteName: Self.appGroupIdentifier)
        self.defaults = group ?? .standard
        self.usesAppGroupDefaults = group != nil
        if group == nil {
            PatinaLog.sync.debug(
                "[Record] App Group defaults unavailable — the last visit is app-local"
            )
        }
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

    /// Forget the visit. The stamp is device-global and survives a sign-out,
    /// and a visit belonging to one account must never decide what is "new"
    /// for the next — so the auth boundary (`LocalStoreReset`) and the record's
    /// own identity guard both clear it.
    func clear() {
        defaults.removeObject(forKey: Self.key)
    }
}

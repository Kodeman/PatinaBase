//
//  RecordOwner.swift
//  Patina
//
//  Whose record is on disk.
//
//  The snapshot (`RecordSnapshotStore`) and the visit stamp (`LastSeenStore`)
//  both live in the App Group container, which is device-global and survives a
//  sign-out. Nothing in either file says who it was built for, so a paint that
//  only checks `isAuthenticated` will happily put the previous client's invoice
//  figure and designer name on the next client's Today — for the whole window
//  between the cold-launch paint and the rebuild.
//
//  So the snapshot carries the account it was built for, beside it, and the
//  paint path refuses one that does not match the live session. `LocalStoreReset`
//  removes all three artefacts at the auth boundary; this is the guard for every
//  path that boundary does not cover (a snapshot written before this build, a
//  wipe that failed, a session restored without one).
//
//  SP-06: the local store is account-scoped, and the leak to later accounts is
//  not kept.
//

import Foundation

/// The account id the record on disk was built for. One string, in the same
/// App Group suite as the visit stamp, so the widget (W6) can make the same
/// judgement the app makes.
struct RecordOwnerStamp: Sendable {

    static let key = "patina.house.recordOwnerId"
    static let appGroupIdentifier = "group.cloud.patina.app"

    static let shared = RecordOwnerStamp()

    private let defaults: UserDefaults

    /// `defaults` is for tests. Production takes the App Group suite, falling
    /// back to `.standard` exactly as `LastSeenStore` does — the two must land
    /// in the same domain or a stamp could outlive the visit it attributes.
    init(defaults: UserDefaults? = nil) {
        self.defaults = defaults ?? UserDefaults(suiteName: Self.appGroupIdentifier) ?? .standard
    }

    var ownerId: String? {
        defaults.string(forKey: Self.key)
    }

    func stamp(_ userId: String?) {
        guard let userId, !userId.isEmpty else { return clear() }
        defaults.set(userId, forKey: Self.key)
    }

    func clear() {
        defaults.removeObject(forKey: Self.key)
    }
}

/// May what is on disk be shown to the person who is signed in now?
enum RecordIdentity {

    enum Decision: Equatable {
        /// The stamp names this session. Paint it.
        case paint
        /// No session to compare against — paint nothing, but keep the file:
        /// a session still being restored is not a different account.
        case withhold
        /// Another account's record, or one no account claims. Remove it.
        case discard
    }

    static func decide(stampedOwner: String?, session: String?) -> Decision {
        guard let session, !session.isEmpty else { return .withhold }
        // An unattributed snapshot is one written before this guard existed.
        // It cannot be shown to anyone, because it cannot be shown to be
        // theirs; one open without a head start is the whole cost.
        guard let stampedOwner, !stampedOwner.isEmpty else { return .discard }
        return stampedOwner == session ? .paint : .discard
    }

    /// The decision, acted on. Returns true when the caller may paint what is
    /// on disk; a `.discard` takes the record, the visit stamp and the owner
    /// stamp with it before returning false.
    @discardableResult
    static func admits(
        session: String?,
        owner: RecordOwnerStamp = .shared,
        snapshots: RecordSnapshotStore = .shared,
        lastSeen: LastSeenStore = .shared
    ) -> Bool {
        switch decide(stampedOwner: owner.ownerId, session: session) {
        case .paint:
            return true
        case .withhold:
            return false
        case .discard:
            snapshots.remove()
            lastSeen.clear()
            owner.clear()
            return false
        }
    }
}

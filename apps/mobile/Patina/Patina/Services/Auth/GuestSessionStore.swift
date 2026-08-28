//
//  GuestSessionStore.swift
//  Patina
//
//  W3 ruling 9: a guest who chose "Look around first" stays a guest across
//  relaunches, until they sign in or clear the app. `AppCoordinator`'s
//  `guestModeOptIn` was a plain `= false`, so every cold launch put the wall
//  back in front of someone who had already declined it.
//
//  It stores one thing — that the choice was made — and nothing about the
//  person. SP-06's local-store ownership rule is unaffected: this decides
//  which phase the app opens in, never who owns the rooms on the device.
//

import Foundation

struct GuestSessionStore: Sendable {

    /// Written once, read on every launch. Changing it makes every guest on
    /// the current build meet the wall again, so it is a contract.
    static let key = "patina.guest.optedIn"

    nonisolated static let shared = GuestSessionStore()

    private let defaults: UserDefaults

    /// `defaults` is for tests; production takes the standard domain, which
    /// is what "clear the app" clears.
    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    var isOptedIn: Bool {
        defaults.bool(forKey: Self.key)
    }

    func optIn() {
        defaults.set(true, forKey: Self.key)
    }

    /// Ends the guest session: signing in, and signing out (which is owed the
    /// gate again, not a silent slide into guest mode).
    func clear() {
        defaults.removeObject(forKey: Self.key)
    }
}

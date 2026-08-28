//
//  GuestSessionTests.swift
//  PatinaTests
//
//  W3 ruling 9: a guest who chose "Look around first" stays a guest across
//  relaunches, until they sign in or clear the app.
//

import Testing
import Foundation
@testable import Patina

struct GuestSessionTests {

    private func store(_ name: String) throws -> (GuestSessionStore, UserDefaults) {
        let suite = try #require(UserDefaults(suiteName: "guest-session-\(name)-\(UUID())"))
        return (GuestSessionStore(defaults: suite), suite)
    }

    @Test("a fresh install is not a guest — the gate is the first thing")
    func freshInstallIsNotAGuest() throws {
        let (guest, _) = try store("fresh")
        #expect(!guest.isOptedIn)
    }

    @Test("the choice survives the relaunch that used to undo it")
    func theChoiceSurvivesARelaunch() throws {
        let (guest, suite) = try store("relaunch")
        guest.optIn()
        // A relaunch is a new `GuestSessionStore` over the same domain, which
        // is exactly what `AppCoordinator.guestModeOptIn`'s initial value is.
        #expect(GuestSessionStore(defaults: suite).isOptedIn)
    }

    @Test("signing in, and signing out, end the guest session")
    func clearingReturnsTheGate() throws {
        let (guest, suite) = try store("clear")
        guest.optIn()
        guest.clear()
        #expect(!guest.isOptedIn)
        #expect(!GuestSessionStore(defaults: suite).isOptedIn)
    }

    @Test("the key is the pinned one")
    func theKeyIsPinned() throws {
        // Changing it makes every guest on the current build meet the wall
        // again, which is why it is asserted rather than assumed.
        #expect(GuestSessionStore.key == "patina.guest.optedIn")
        let (guest, suite) = try store("key")
        guest.optIn()
        #expect(suite.bool(forKey: GuestSessionStore.key))
    }
}

//
//  AccountIsolationTests.swift
//  PatinaTests
//
//  Pins the owner-change decision that drives the local-store wipe: the device
//  SwiftData store is wiped ONLY when a different real account signs in. A
//  guest→account transition (nil previous owner) keeps the local scans.
//

import Testing
@testable import Patina

@MainActor
struct AccountIsolationTests {

    @Test
    func freshOrGuestOwnerNeverWipes() {
        // nil previous owner = fresh install or a guest who just scanned →
        // claim the store, don't wipe (keep guest scans on sign-in).
        #expect(AuthService.shouldWipeLocalStore(previousOwner: nil, incomingUser: "userA") == false)
    }

    @Test
    func sameAccountReSignInIsNoWipe() {
        #expect(AuthService.shouldWipeLocalStore(previousOwner: "userA", incomingUser: "userA") == false)
    }

    @Test
    func differentAccountWipes() {
        // A → B is the reported privacy leak: B must not see A's rooms.
        #expect(AuthService.shouldWipeLocalStore(previousOwner: "userA", incomingUser: "userB") == true)
    }
}

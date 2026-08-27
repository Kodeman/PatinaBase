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

    // MARK: - SP-06: the claim is asked, not assumed

    /// The guest scanned a room and saved a piece; the account signing in on
    /// this phone gets to say whether that work is theirs.
    @Test
    func firstSignInWithGuestWorkAsks() {
        #expect(LocalStoreClaim.shouldAsk(previousOwner: nil, hasGuestWork: true))
    }

    /// Nothing to claim, nothing to ask about.
    @Test
    func firstSignInWithAnEmptyStoreDoesNotAsk() {
        #expect(LocalStoreClaim.shouldAsk(previousOwner: nil, hasGuestWork: false) == false)
    }

    /// A second account is not asked — that case wipes, and asking would
    /// offer one person the option of keeping another person's rooms.
    @Test
    func aSecondAccountIsNotAskedToClaim() {
        #expect(LocalStoreClaim.shouldAsk(previousOwner: "userA", hasGuestWork: true) == false)
    }

    /// The same account relaunching is not re-asked.
    @Test
    func theSameAccountIsNotAskedAgain() {
        #expect(LocalStoreClaim.shouldAsk(previousOwner: "userA", hasGuestWork: false) == false)
    }
}

//
//  AccountIsolationTests.swift
//  PatinaTests
//
//  Pins the owner-change decision that drives the local-store wipe: the device
//  SwiftData store is wiped ONLY when a different real account signs in. A
//  guest→account transition (nil previous owner) keeps the local scans.
//

import Testing
import Foundation
import SwiftData
@testable import Patina

@MainActor
struct AccountIsolationTests {

    /// The app's own schema, so `delete(model:)` finds every type the wipe
    /// names.
    private func makeContext() throws -> ModelContext {
        let schema = Schema([
            TableItemModel.self,
            RoomModel.self,
            SavedItem.self,
            StylePreferenceModel.self,
            SyncQueueItem.self,
            RoomScanPackage.self,
            DesignRequestDraft.self,
            SubmittedDesignRequest.self
        ])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        return ModelContext(try ModelContainer(for: schema, configurations: [config]))
    }

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

    // MARK: - The claim decides before the hydrate runs

    /// Ordering one: there IS guest work. The sheet goes up and the server
    /// hydrate is held — because "Start fresh" answered underneath a hydrate
    /// would be deleting rooms that arrived from the account's own server row
    /// and were never the guest's.
    @Test
    func aPendingClaimHoldsTheHydrate() throws {
        let context = try makeContext()
        let store = RoomStore(context: context)
        _ = store.createRoom(name: "Guest's Studio", roomType: "other", manualEntry: true)

        let claim = LocalStoreClaim()
        #expect(claim.askIfNeeded(previousOwner: nil, context: context))
        #expect(claim.isAsking)
    }

    /// Ordering two: nothing to claim. No sheet, and the hydrate runs off the
    /// auth event as it did before.
    @Test
    func anEmptyStoreAsksNothingAndHydratesAtOnce() throws {
        let context = try makeContext()
        let claim = LocalStoreClaim()
        #expect(claim.askIfNeeded(previousOwner: nil, context: context) == false)
        #expect(claim.isAsking == false)
    }

    @Test
    func theAuthListenerWaitsOnAPendingClaim() throws {
        let source = try SourcePin.read("Patina/Services/Auth/AuthService.swift")
        #expect(source.contains("if !claimPending {"))
    }

    /// "Start fresh" clears the guest's work. A room carrying a `remoteId` is
    /// the account's own row, mirrored down — not the guest's, and not what
    /// this button offers to clear.
    @Test
    func startFreshClearsOnlyTheRoomsThatNeverSynced() throws {
        let context = try makeContext()
        let store = RoomStore(context: context)
        let guestRoom = store.createRoom(name: "Guest's Studio", roomType: "other", manualEntry: true)
        let mirrored = store.createRoom(name: "Guest Bedroom", roomType: "bedroom", manualEntry: true)
        mirrored.remoteId = "c0000000-0000-4000-8000-000000000001"
        context.insert(TableItemModel(name: "A piece", productId: "p-1"))
        try context.save()
        let guestId = guestRoom.id

        LocalStoreReset.wipeGuestWork(in: context)

        let rooms = store.allRooms()
        #expect(rooms.count == 1)
        #expect(rooms.first?.remoteId == "c0000000-0000-4000-8000-000000000001")
        #expect(rooms.contains { $0.id == guestId } == false)
        #expect(try context.fetch(FetchDescriptor<TableItemModel>()).isEmpty)
    }

    /// And the debounce does not then keep the account off its own rooms for
    /// the next thirty seconds.
    @Test
    func aWipeMakesTheNextHydrateDue() throws {
        let context = try makeContext()
        LocalStoreReset.wipeGuestWork(in: context)
        #expect(RoomSyncCoordinator.shared.isDue(owner: "userA", now: Date()))
    }
}

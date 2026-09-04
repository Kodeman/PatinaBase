//
//  GuestRoomListScopeTests.swift
//  PatinaTests
//
//  `GAP3-18`, re-opened by walk B's re-walk 2 as `W1-B-17`: after Settings →
//  Sign Out, the guest "Your Spaces" still listed "Guest Bedroom, 180 sq ft"
//  and "Whole Home, 1 room" on a device whose guest Studio, one tap away, read
//  "Guest / Rooms: 0". Reproduced twice, once per sign-out. On a shared phone
//  it is a privacy leak.
//
//  The mechanism is not the auth seam. `AuthService.isAccountChange` is
//  `previous != incoming`, so `A → nil` is still a change and
//  `SessionScope.reset()` still fires; what survives a sign-out is the
//  SwiftData store, which `LocalStoreReset.wipeUserScopedData()` clears on ONE
//  seam — a DIFFERENT real account signing in — deliberately, so the same
//  account signing back in finds its rooms. `LocalStoreOwnership
//  .accountRowsAreVisible` is the gate L1-B built for the guest in between, and
//  `RoomStore`, `ProfileViewModel` and `StyleProfileStore` read through it.
//  `YourSpacesView` held its own `@Query` and did not — which is exactly why
//  the Studio said 0 and the gallery said 2.
//

import Testing
import Foundation
import SwiftData
@testable import Patina

@MainActor
struct GuestRoomListScopeTests {

    private func makeContext() throws -> ModelContext {
        let schema = Schema(versionedSchema: PatinaSchemaV1.self)
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        return ModelContext(try ModelContainer(for: schema, configurations: [config]))
    }

    /// `YourSpacesView.rooms`, written the way the view writes it. The source
    /// pin below is what keeps this from drifting away from the screen.
    private func gatedRooms(
        _ stored: [RoomModel],
        isAuthenticated: Bool,
        owner: String?
    ) -> [RoomModel] {
        LocalStoreOwnership.accountRowsAreVisible(
            isAuthenticated: isAuthenticated,
            owner: owner,
            isAuthStateReady: true
        ) ? stored : []
    }

    @Test("signing out empties the guest room list on a store the account still owns")
    func aSignOutEmptiesTheGuestRoomList() throws {
        let context = try makeContext()
        let store = RoomStore(context: context)
        _ = store.createRoom(name: "Guest Bedroom", roomType: "bedroom", manualEntry: true)
        _ = store.createRoom(name: "Audit Room B", roomType: "other", manualEntry: true)
        // A private context is deliberately unscoped (`aPrivateContextIsNotScoped`),
        // so this is the raw `@Query` result the screen starts from.
        let stored = store.allRooms()
        #expect(stored.count == 2)

        // Signed in: the account's own rooms, all of them.
        #expect(gatedRooms(stored, isAuthenticated: true, owner: "userA").count == 2)

        // Signed out, same store, same rows: a guest, and the gallery is empty.
        #expect(
            gatedRooms(stored, isAuthenticated: false, owner: "userA").isEmpty,
            "the guest gallery still lists the previous account's rooms (W1-B-17)"
        )

        // SP-06's other half: a store no account has claimed holds the guest's
        // own work, and it stays theirs.
        #expect(gatedRooms(stored, isAuthenticated: false, owner: nil).count == 2)
    }

    /// The screen and the Studio now answer with one voice, on one store.
    ///
    /// The walk's contradiction was a device where the Studio said "Guest /
    /// Rooms: 0" and the gallery one tap away listed two rooms. `ProfileView
    /// Model`'s room list reads `RoomStore`, whose gate is deliberately inert
    /// on a private context (`aPrivateContextIsNotScoped`), so the Studio side
    /// is read here through the two members that do consult the injected
    /// predicate — and the gallery side through the expression the screen uses.
    @Test("the gallery and the Studio stat agree after a sign-out")
    func theGalleryAndTheStudioAgree() throws {
        let context = try makeContext()
        let store = RoomStore(context: context)
        _ = store.createRoom(name: "Guest Bedroom", roomType: "bedroom", manualEntry: true)
        context.insert(TableItemModel(name: "Oak Bench", productId: "p1", savedAt: Date()))
        try context.save()
        let stored = store.allRooms()

        let owner = ProfileViewModel()
        owner.accountRowsAreVisible = { true }
        owner.loadData(context: context)
        #expect(owner.savedItemCount == 1)

        let guest = ProfileViewModel()
        guest.accountRowsAreVisible = { false }
        guest.loadData(context: context)

        #expect(guest.savedItemCount == 0)
        #expect(guest.styleProfile == nil)
        #expect(gatedRooms(stored, isAuthenticated: false, owner: "userA").isEmpty)
    }

    /// …and the screen really is written that way: the `@Query` result is bound
    /// to a name the body never reads, and the name the body does read is the
    /// gated one.
    @Test("the gallery reads the ownership gate, not the raw query")
    func theGalleryReadsTheGate() throws {
        let source = try SourcePin.read("Patina/Features/Rooms/Views/YourSpacesView.swift")
        let code = SourceScan.code(in: source)
        #expect(
            code.contains("private var storedRooms: [RoomModel]"),
            "the @Query is bound straight to `rooms` again — the gate is bypassed"
        )
        #expect(
            code.contains("LocalStoreOwnership.accountRowsAreVisible ? storedRooms : []"),
            "YourSpacesView no longer scopes its room list by ownership (GAP3-18)"
        )
        // Exactly one reader of the ungated list: the gated property itself.
        #expect(code.components(separatedBy: "storedRooms").count - 1 == 2)
    }
}

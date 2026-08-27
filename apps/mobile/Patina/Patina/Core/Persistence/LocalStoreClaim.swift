//
//  LocalStoreClaim.swift
//  Patina
//
//  SP-06. The device-local SwiftData store is device-global. A guest types a
//  room and saves a piece; the next account to sign in on that phone inherited
//  both, and every count on Today, Profile and the Companion then presented
//  device data as account data — `client@patina.dev`, with zero rooms and zero
//  saved items server-side, read "ACTIVE ROOM / Living Room", "1 ROOM" and
//  "1 SAVED PIECE".
//
//  The documented intent in `AuthService.reconcileLocalStoreOwner` is kept:
//  the guest who scanned a room does not lose it by signing up. What changes
//  is that the claim becomes the account's own decision instead of something
//  that happens to it. `AuthService.shouldWipeLocalStore` is untouched —
//  promote-only, never wiped on sign-out — because that is the branch that can
//  destroy someone's work.
//

import Foundation
import SwiftData

@MainActor
@Observable
public final class LocalStoreClaim {

    public static let shared = LocalStoreClaim()

    /// True while the first-sign-in claim is waiting on the account's answer.
    /// The host surface presents the sheet off this.
    public private(set) var isAsking = false

    private init() {}

    /// The pure decision, unit-tested. Ask only when a real account is taking
    /// over a store that no account has ever owned AND there is guest work in
    /// it to claim. A second account signing in is not asked — that case wipes
    /// (`AuthService.shouldWipeLocalStore`). An empty store is not asked —
    /// there is nothing to decide.
    public static func shouldAsk(previousOwner: String?, hasGuestWork: Bool) -> Bool {
        previousOwner == nil && hasGuestWork
    }

    /// Whether the device-local store holds anything a guest could have made.
    public static func hasGuestWork(context: ModelContext) -> Bool {
        let rooms = (try? context.fetchCount(FetchDescriptor<RoomModel>())) ?? 0
        let saves = (try? context.fetchCount(FetchDescriptor<TableItemModel>())) ?? 0
        return rooms > 0 || saves > 0
    }

    /// Reads the shared container itself so callers outside the persistence
    /// layer (`AuthService`) need no SwiftData import.
    public func askIfNeeded(previousOwner: String?) {
        let context = PersistenceController.shared.container.mainContext
        guard Self.shouldAsk(
            previousOwner: previousOwner,
            hasGuestWork: Self.hasGuestWork(context: context)
        ) else { return }
        isAsking = true
    }

    /// "Keep them" — exactly the behaviour that used to happen silently.
    public func keep() {
        isAsking = false
    }

    /// "Start fresh" — the account starts with its own rows and nothing else.
    /// Routed through the existing `LocalStoreReset` so the on-disk scan
    /// bundles go with the rows.
    public func startFresh() {
        LocalStoreReset.wipeUserScopedData()
        isAsking = false
    }
}

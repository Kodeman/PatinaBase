//
//  SessionScope.swift
//  Patina
//
//  Everything the app holds in memory for whoever is signed in, and the one
//  place it is dropped when that changes.
//
//  The app's singletons outlive a session. Signing out of one account and into
//  another INSIDE the same process left `BadgeCountService.projects` and
//  `DesignRequestStatusService.liveLead` holding the previous account's rows,
//  and `DesignerThreadOpener` — which reads both with no staleness guard —
//  resolved the new client against the old client's project id. The server
//  refused the cross-tenant `rpc_start_project_thread`, so nothing leaked; what
//  the person saw was their message failing to send (`waves/w5/walk.md` item 2).
//  The account boundary is the only honest place to fix that: not a per-reader
//  guard, which every future reader would have to remember, but one reset on
//  the seam `AuthService` already owns, beside `LocalStoreReset`.
//
//  This file is deliberately the whole list. A singleton that holds the signed-
//  in client's own data and is not here is a leak waiting for its first reader,
//  which is why `SessionScopeSourcePinTests` walks the tree and fails on any
//  `static let shared` that is neither a participant nor a written exclusion.
//

import Foundation

/// A process-lifetime holder of the signed-in account's data.
///
/// `resetForSessionChange()` puts it back to the state it has before any
/// account has been seen — never to a *guest* state that some other code path
/// would read as "loaded and empty", which is a different lie.
@MainActor
protocol SessionScoped: AnyObject {
    func resetForSessionChange()
}

@MainActor
enum SessionScope {

    /// The participants, in no meaningful order — a reset is not a sequence.
    ///
    /// Five declare the reset in their own file because their state is
    /// `private(set)` and only the declaring file can write it. The other six
    /// are conformed below over a clearing method they already had.
    static func participants() -> [any SessionScoped] {
        [
            BadgeCountService.shared,
            DesignRequestStatusService.shared,
            OrdersService.shared,
            StudioHubViewModel.shared,
            SettingsService.shared,
            ProfileService.shared,
            RoomSelectionStore.shared,
            NotificationManager.shared,
            RoomSyncCoordinator.shared,
            CompanionService.shared,
            PieceActChannel.shared
        ]
    }

    /// Drop the previous account's data. Called from the auth-state seam
    /// BEFORE anything fetches for the new one.
    /// (No default argument: one would be evaluated outside the actor.)
    static func reset() {
        reset(participants())
    }

    static func reset(_ participants: [any SessionScoped]) {
        for participant in participants {
            participant.resetForSessionChange()
        }
    }

    /// Refetch what has no load gate of its own.
    ///
    /// `DesignerThreadOpener` reads `BadgeCountService.projects` and
    /// `DesignRequestStatusService.liveLead` on demand, from a view body, with
    /// nothing to trigger a fetch first — so those two are asked for the new
    /// account's rows here. `OrdersService` and `StudioHubViewModel` are not:
    /// their `hasLoaded` gates were just cleared, so their own
    /// `refreshIfNeeded()` / `loadIfNeeded()` re-fetch on the next appear, and
    /// firing seven Studio reads at every launch to save that is a cost the
    /// wave did not ask for.
    static func refresh() {
        Task { @MainActor in
            await BadgeCountService.shared.refresh()
        }
        Task { @MainActor in
            await DesignRequestStatusService.shared.refresh()
        }
    }
}

// MARK: - Conformances

// Five declare `resetForSessionChange()` in their own file, because everything
// they hold is `private(set)` and only the declaring file can write it.

extension BadgeCountService: SessionScoped {}
extension DesignRequestStatusService: SessionScoped {}
extension OrdersService: SessionScoped {}
extension StudioHubViewModel: SessionScoped {}
extension SettingsService: SessionScoped {}

// The rest already had a clearing method, so the conformance is the whole edit.

/// The profile is already cleared on `.signedOut`; this covers the other
/// arm — a session replaced without one, where the stale profile would name
/// the previous account on the new account's first screen.
extension ProfileService: SessionScoped {
    @MainActor func resetForSessionChange() { clear() }
}

extension RoomSelectionStore: SessionScoped {
    @MainActor func resetForSessionChange() { clear() }
}

extension NotificationManager: SessionScoped {
    @MainActor func resetForSessionChange() { clearAll() }
}

/// Not data but a debounce: the window that decides whether to ask the server
/// for this account's rooms. `forget()` is what `LocalStoreReset` already calls
/// when the rows it was protecting are gone.
extension RoomSyncCoordinator: SessionScoped {
    @MainActor func resetForSessionChange() { forget() }
}

/// The Companion's conversation is the client's own words.
extension CompanionService: SessionScoped {
    @MainActor func resetForSessionChange() { clearHistory() }
}

/// The act the piece screen resolved carries the previous account's designer
/// relationship in it. The token is a counter, not account data, and is left
/// alone — a stale token is already never read.
extension PieceActChannel: SessionScoped {
    @MainActor func resetForSessionChange() { publish(nil) }
}

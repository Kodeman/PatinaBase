//
//  LocalStoreOwnership.swift
//  Patina
//
//  Who the rows on this phone belong to, and whether whoever is holding the
//  phone right now may see them.
//
//  The SwiftData store is device-global with no per-user scoping, and
//  `LocalStoreReset.wipeUserScopedData()` runs on exactly one seam: a
//  DIFFERENT real account signing in. Signing OUT wipes nothing — deliberately,
//  because the same account signing back in must find its rooms. What was
//  missing is the other half: between the sign-out and the next sign-in there
//  is a **guest** on the phone, and the guest was shown the account's rooms
//  (`GAP3-18`) and the account's taste portrait (`B-15`) as if they were
//  their own.
//
//  So the rows stay, and the reads are scoped. This is the scope.
//

import Foundation

@MainActor
enum LocalStoreOwnership {

    /// The same key `AuthService` writes when an account claims the store.
    /// Pinned by `AccountIsolationTests` so the two cannot drift.
    static let ownerKey = "local_store_owner_user_id"

    static var ownerUserId: String? {
        UserDefaults.standard.string(forKey: ownerKey)
    }

    /// Whether the person holding the phone may read the account-scoped rows.
    ///
    /// Three cases, and only the third hides anything:
    ///  · signed in — the wipe on the account-change seam has already run, so
    ///    what is in the store is this account's;
    ///  · a guest on a store no account has claimed — the rows are the
    ///    guest's own work, and SP-06 says they stay theirs;
    ///  · a guest on a store an account owns — a signed-out session looking
    ///    at somebody's rooms.
    static var accountRowsAreVisible: Bool {
        if AuthService.shared.isAuthenticated { return true }
        return ownerUserId == nil
    }

    /// The pure decision, so the rule is a fact rather than a hope.
    static func accountRowsAreVisible(isAuthenticated: Bool, owner: String?) -> Bool {
        isAuthenticated || owner == nil
    }
}

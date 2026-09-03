//
//  StyleProfileStore.swift
//  Patina
//
//  Lightweight persistence for the user's most-recent StyleProfileResponse.
//  Used by the Soft Landing to decide whether to show the "Use my style /
//  Update my style" prompt on subsequent scans.
//
//  Stored in UserDefaults for v2.0 — can be swapped for Supabase-backed
//  persistence later without changing call sites.
//

import Foundation
import SwiftData

@MainActor
public final class StyleProfileStore {

    public static let shared = StyleProfileStore()

    private let defaults: UserDefaults
    private let key = "patina.style_profile_response.v1"
    private let completedKey = "patina.style_profile_completed.v1"

    private init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// Whether the user has completed any full style profile.
    ///
    /// B-15: the two keys below carry no account, and the wipe that clears
    /// them runs only when a DIFFERENT account signs in — so between a
    /// sign-out and the next sign-in the guest holding the phone inherited
    /// the previous account's portrait, and `CompanionOverlay` read it
    /// straight into the Companion's context. The rows stay (the same account
    /// signing back in must find them); the read is scoped.
    ///
    /// The trade, stated: a guest who signs out and then takes the quiz will
    /// be offered it again after signing in, because a store an account owns
    /// stays that account's until the account signs in again. Being asked a
    /// question twice is the smaller failure.
    public var hasCompletedProfile: Bool {
        guard LocalStoreOwnership.accountRowsAreVisible else { return false }
        return defaults.bool(forKey: completedKey)
    }

    /// The user's most-recent StyleProfileResponse, if any.
    public var currentProfile: StyleProfileResponse? {
        guard LocalStoreOwnership.accountRowsAreVisible else { return nil }
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(StyleProfileResponse.self, from: data)
    }

    /// Persist a new profile response.
    public func save(_ response: StyleProfileResponse) {
        guard let data = try? JSONEncoder().encode(response) else { return }
        defaults.set(data, forKey: key)
        defaults.set(true, forKey: completedKey)
    }

    /// Clear the latest Aesthete response.
    public func reset() {
        defaults.removeObject(forKey: key)
        defaults.removeObject(forKey: completedKey)
    }

    /// Explicitly forget every local taste portrait representation while
    /// preserving rooms, saved items, scans, and project data.
    public func resetTasteProfile(in context: ModelContext) {
        reset()
        do {
            try context.delete(model: StylePreferenceModel.self)
            try context.save()
        } catch {
            #if DEBUG
            PatinaLog.ui.error("[StyleProfileStore] taste reset failed: \(error.localizedDescription)")
            #endif
        }
    }
}

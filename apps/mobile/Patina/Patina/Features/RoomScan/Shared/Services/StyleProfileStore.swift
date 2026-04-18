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
    public var hasCompletedProfile: Bool {
        defaults.bool(forKey: completedKey)
    }

    /// The user's most-recent StyleProfileResponse, if any.
    public var currentProfile: StyleProfileResponse? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(StyleProfileResponse.self, from: data)
    }

    /// Persist a new profile response.
    public func save(_ response: StyleProfileResponse) {
        guard let data = try? JSONEncoder().encode(response) else { return }
        defaults.set(data, forKey: key)
        defaults.set(true, forKey: completedKey)
    }

    /// Clear the saved profile (debug / reset only).
    public func reset() {
        defaults.removeObject(forKey: key)
        defaults.removeObject(forKey: completedKey)
    }
}

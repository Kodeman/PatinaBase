//
//  ProfileService.swift
//  Patina
//
//  Fetches profile and role data from Supabase after sign-in,
//  mirroring the portal useAuth() hydration pattern.
//

import Foundation
import Supabase

/// User profile from the `profiles` table
public struct UserProfile: Codable, Sendable {
    public let id: String
    public let displayName: String?
    public let fullName: String?
    public let avatarUrl: String?
    public let email: String?
    public let role: String
    public let businessName: String?
    public let bio: String?
    public let phone: String?
    public let isDesigner: Bool?
    public let isVerified: Bool?

    enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case fullName = "full_name"
        case avatarUrl = "avatar_url"
        case email
        case role
        case businessName = "business_name"
        case bio
        case phone
        case isDesigner = "is_designer"
        case isVerified = "is_verified"
    }
}

/// Role from the `roles` table (joined via `user_roles`)
public struct UserRole: Codable, Sendable {
    public let name: String
    public let displayName: String
    public let domain: String

    enum CodingKeys: String, CodingKey {
        case name
        case displayName = "display_name"
        case domain
    }
}

/// Join row from `user_roles` with nested `roles`
private struct UserRoleJoin: Codable {
    let roles: UserRole
}

/// Fetches and caches profile + roles for the current user
@Observable
public final class ProfileService {
    public static let shared = ProfileService()

    /// Current user's profile (nil if not authenticated or not yet loaded)
    public private(set) var currentProfile: UserProfile?

    /// Current user's domain-based roles (e.g. ["designer", "consumer"])
    public private(set) var roles: [String] = []

    /// Domain roles (e.g. ["designer"]) — matches portal role_domain enum
    public var domains: [String] {
        roles
    }

    /// Whether profile has been loaded for the current session
    public private(set) var isLoaded = false

    private init() {}

    // MARK: - Fetch

    /// Fetch profile and roles for a user ID. Call after sign-in.
    @MainActor
    public func fetchProfile(userId: String) async {
        do {
            // Fetch profile
            let profile: UserProfile = try await supabase.database
                .from("profiles")
                .select()
                .eq("id", value: userId)
                .single()
                .execute()
                .value

            self.currentProfile = profile

            // Fetch roles via user_roles → roles join
            let userRoleJoins: [UserRoleJoin] = try await supabase.database
                .from("user_roles")
                .select("roles(name, display_name, domain)")
                .eq("user_id", value: userId)
                .execute()
                .value

            self.roles = userRoleJoins.map { $0.roles.domain }
            self.isLoaded = true
        } catch {
            PatinaLog.auth.error("ProfileService: failed to fetch profile — \(error.localizedDescription)")
            // Non-fatal: user can still use the app without profile data
            self.isLoaded = true
        }
    }

    // MARK: - Last seen (B §3, 00537 §2)

    /// `UserDefaults` watermark for the last stamp actually mirrored. Without
    /// it every home re-render would PATCH the same second over again.
    static let lastSeenMirrorKey = "patina.house.lastSeenAt.mirrored"

    /// Whether `stamp` is worth a write: something to write, and newer than
    /// whatever reached the server last.
    static func mirrorIsDue(stamp: Date?, mirrored: Date?) -> Bool {
        guard let stamp else { return false }
        guard let mirrored else { return true }
        return stamp > mirrored
    }

    /// Mirror the local visit stamp onto the caller's own `profiles` row —
    /// the second device's half of "when were you last here" (B §3). Owner
    /// UPDATE under RLS (`00013_profiles_table.sql:62`); best effort, never
    /// awaited by anything the reader is looking at, and a failure leaves the
    /// local stamp — the authority — untouched.
    @MainActor
    func mirrorLastSeenIfNeeded(
        stamp: Date? = LastSeenStore.shared.lastSeenAt,
        defaults: UserDefaults = .standard
    ) async {
        guard AuthService.shared.isAuthenticated,
              let userId = AuthService.shared.currentUserId else { return }
        let mirrored = (defaults.object(forKey: Self.lastSeenMirrorKey) as? Double)
            .map { Date(timeIntervalSince1970: $0) }
        guard let stamp, Self.mirrorIsDue(stamp: stamp, mirrored: mirrored) else { return }

        do {
            try await supabase.database
                .from("profiles")
                .update(["last_seen_at": ISO8601DateFormatter().string(from: stamp)])
                .eq("id", value: userId)
                .execute()
            defaults.set(stamp.timeIntervalSince1970, forKey: Self.lastSeenMirrorKey)
        } catch {
            PatinaLog.sync.debug(
                "ProfileService: last_seen_at mirror deferred — \(error.localizedDescription)"
            )
        }
    }

    /// Clear profile data on sign-out
    @MainActor
    public func clear() {
        currentProfile = nil
        roles = []
        isLoaded = false
        // The watermark belongs to the account that wrote it: the next
        // account's first visit must reach its own row, not be swallowed as
        // "already mirrored".
        UserDefaults.standard.removeObject(forKey: Self.lastSeenMirrorKey)
    }

    // MARK: - Convenience

    /// Whether user has a specific domain role
    public func hasRole(_ domain: String) -> Bool {
        roles.contains(domain)
    }

    /// Display name from profile, falling back to email
    public var displayName: String? {
        currentProfile?.displayName ?? currentProfile?.fullName ?? currentProfile?.email
    }
}

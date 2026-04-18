//
//  UserMode.swift
//  Patina
//
//  User authentication mode for guest vs authenticated flows
//

import Foundation

/// User authentication mode
public enum UserMode: String, Codable {
    /// User is browsing without an account
    /// - Rooms saved locally only (SwiftData)
    /// - No cloud sync
    /// - Prompted to create account after first scan
    case guest

    /// User is signed in with an account
    /// - Full cloud sync enabled
    /// - Cross-device access
    case authenticated

    /// Check if user can sync to cloud
    public var canSync: Bool {
        self == .authenticated
    }

    /// Check if user should be prompted to create account
    public var shouldPromptAccount: Bool {
        self == .guest
    }
}

/// Context for user authentication state
public struct UserContext {
    /// Current user mode
    public var mode: UserMode

    /// User ID (if authenticated)
    public var userId: UUID?

    /// Email (if authenticated)
    public var email: String?

    /// Display name from profiles table
    public var displayName: String?

    /// Avatar URL from profiles table
    public var avatarUrl: String?

    /// Domain-based roles (e.g. ["designer", "consumer"]) — matches portal useAuth().roles
    public var roles: [String]

    /// Number of local-only rooms pending sync
    public var pendingRoomCount: Int

    /// Whether user has completed onboarding
    public var hasCompletedOnboarding: Bool

    public init(
        mode: UserMode = .guest,
        userId: UUID? = nil,
        email: String? = nil,
        displayName: String? = nil,
        avatarUrl: String? = nil,
        roles: [String] = [],
        pendingRoomCount: Int = 0,
        hasCompletedOnboarding: Bool = false
    ) {
        self.mode = mode
        self.userId = userId
        self.email = email
        self.displayName = displayName
        self.avatarUrl = avatarUrl
        self.roles = roles
        self.pendingRoomCount = pendingRoomCount
        self.hasCompletedOnboarding = hasCompletedOnboarding
    }

    /// Create authenticated context from ProfileService
    public static func authenticated(userId: UUID, email: String?) -> UserContext {
        let profile = ProfileService.shared
        return UserContext(
            mode: .authenticated,
            userId: userId,
            email: email,
            displayName: profile.displayName,
            avatarUrl: profile.currentProfile?.avatarUrl,
            roles: profile.roles,
            pendingRoomCount: 0,
            hasCompletedOnboarding: true
        )
    }

    /// Create guest context
    public static func guest(pendingRoomCount: Int = 0) -> UserContext {
        UserContext(
            mode: .guest,
            userId: nil,
            email: nil,
            pendingRoomCount: pendingRoomCount,
            hasCompletedOnboarding: false
        )
    }

    /// Whether user has a specific domain role
    public func hasRole(_ domain: String) -> Bool {
        roles.contains(domain)
    }
}

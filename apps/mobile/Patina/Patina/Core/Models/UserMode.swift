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

    /// Number of local-only rooms pending sync
    public var pendingRoomCount: Int

    /// Whether user has completed onboarding
    public var hasCompletedOnboarding: Bool

    public init(
        mode: UserMode = .guest,
        userId: UUID? = nil,
        email: String? = nil,
        pendingRoomCount: Int = 0,
        hasCompletedOnboarding: Bool = false
    ) {
        self.mode = mode
        self.userId = userId
        self.email = email
        self.pendingRoomCount = pendingRoomCount
        self.hasCompletedOnboarding = hasCompletedOnboarding
    }

    /// Create authenticated context
    public static func authenticated(userId: UUID, email: String?) -> UserContext {
        UserContext(
            mode: .authenticated,
            userId: userId,
            email: email,
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
}

//
//  TokenManager.swift
//  Patina
//
//  Manages authentication token lifecycle
//  Stores tokens in Keychain, handles refresh before expiry
//

import Foundation

/// Manages authentication token lifecycle
public final class TokenManager {
    public static let shared = TokenManager()

    // MARK: - Configuration

    /// Buffer time before expiry to trigger refresh (5 minutes)
    private let refreshBuffer: TimeInterval = 300

    // MARK: - Dependencies

    private let keychain = KeychainService.shared

    // MARK: - Initialization

    private init() {}

    // MARK: - Token Storage

    /// Store access and refresh tokens
    /// - Parameters:
    ///   - accessToken: The access token
    ///   - refreshToken: The refresh token
    ///   - expiresIn: Token lifetime in seconds (optional)
    public func storeTokens(
        accessToken: String,
        refreshToken: String,
        expiresIn: TimeInterval? = nil
    ) throws {
        try keychain.set(accessToken, forKey: KeychainService.Keys.accessToken)
        try keychain.set(refreshToken, forKey: KeychainService.Keys.refreshToken)

        // Store expiry time if provided
        if let expiresIn = expiresIn {
            let expiryDate = Date().addingTimeInterval(expiresIn)
            let expiryString = ISO8601DateFormatter().string(from: expiryDate)
            try keychain.set(expiryString, forKey: KeychainService.Keys.tokenExpiry)
        }
    }

    /// Get stored access token
    /// - Returns: The access token if available
    public func getAccessToken() throws -> String? {
        return try keychain.get(KeychainService.Keys.accessToken)
    }

    /// Get stored refresh token
    /// - Returns: The refresh token if available
    public func getRefreshToken() throws -> String? {
        return try keychain.get(KeychainService.Keys.refreshToken)
    }

    /// Clear all stored tokens
    public func clearTokens() throws {
        try keychain.delete(KeychainService.Keys.accessToken)
        try keychain.delete(KeychainService.Keys.refreshToken)
        try keychain.delete(KeychainService.Keys.tokenExpiry)
    }

    /// Check if tokens are stored
    public var hasTokens: Bool {
        keychain.exists(KeychainService.Keys.accessToken) &&
        keychain.exists(KeychainService.Keys.refreshToken)
    }

    // MARK: - Token Validation

    /// Check if the access token is expired or about to expire
    /// - Returns: True if token should be refreshed
    public var shouldRefresh: Bool {
        guard let expiryString = try? keychain.get(KeychainService.Keys.tokenExpiry),
              let expiryDate = ISO8601DateFormatter().date(from: expiryString) else {
            // If we can't determine expiry, don't force refresh
            return false
        }

        // Refresh if within buffer time of expiry
        return Date().addingTimeInterval(refreshBuffer) >= expiryDate
    }

    /// Check if the access token is expired
    public var isExpired: Bool {
        guard let expiryString = try? keychain.get(KeychainService.Keys.tokenExpiry),
              let expiryDate = ISO8601DateFormatter().date(from: expiryString) else {
            return false
        }

        return Date() >= expiryDate
    }

    /// Get token expiry date
    public var tokenExpiryDate: Date? {
        guard let expiryString = try? keychain.get(KeychainService.Keys.tokenExpiry) else {
            return nil
        }
        return ISO8601DateFormatter().date(from: expiryString)
    }

    // MARK: - Token Refresh

    /// Get a valid access token, refreshing if necessary
    /// - Parameter refreshHandler: Async closure that performs the refresh and returns new tokens
    /// - Returns: A valid access token
    /// - Throws: Error if refresh fails or no token available
    public func getValidAccessToken(
        refreshHandler: () async throws -> (accessToken: String, refreshToken: String, expiresIn: TimeInterval?)
    ) async throws -> String {
        // Check if we have a token
        guard let currentToken = try getAccessToken() else {
            throw TokenError.noToken
        }

        // Check if refresh is needed
        guard shouldRefresh else {
            return currentToken
        }

        // Perform refresh
        let newTokens = try await refreshHandler()
        try storeTokens(
            accessToken: newTokens.accessToken,
            refreshToken: newTokens.refreshToken,
            expiresIn: newTokens.expiresIn
        )

        return newTokens.accessToken
    }
}

// MARK: - Token Error

public enum TokenError: LocalizedError {
    case noToken
    case noRefreshToken
    case refreshFailed
    case invalidToken

    public var errorDescription: String? {
        switch self {
        case .noToken:
            return "No access token available"
        case .noRefreshToken:
            return "No refresh token available"
        case .refreshFailed:
            return "Failed to refresh token"
        case .invalidToken:
            return "Token is invalid"
        }
    }
}

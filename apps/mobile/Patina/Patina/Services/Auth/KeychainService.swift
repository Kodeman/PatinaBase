//
//  KeychainService.swift
//  Patina
//
//  Secure storage service using iOS Keychain
//  Tokens stored with biometric protection
//

import Foundation
import Security
import LocalAuthentication

/// Service for secure storage using iOS Keychain
public final class KeychainService {
    public static let shared = KeychainService()

    // MARK: - Configuration

    private let serviceName = "com.patina.app"
    private let accessGroup: String? = nil // Use default keychain access group

    // MARK: - Initialization

    private init() {}

    // MARK: - Public Methods

    /// Store a string value securely in Keychain
    /// - Parameters:
    ///   - value: The string value to store
    ///   - key: The key to associate with the value
    ///   - requireBiometric: Whether to require biometric auth to access
    /// - Throws: KeychainError if storage fails
    public func set(_ value: String, forKey key: String, requireBiometric: Bool = false) throws {
        guard let data = value.data(using: .utf8) else {
            throw KeychainError.encodingFailed
        }
        try set(data, forKey: key, requireBiometric: requireBiometric)
    }

    /// Store data securely in Keychain
    /// - Parameters:
    ///   - data: The data to store
    ///   - key: The key to associate with the data
    ///   - requireBiometric: Whether to require biometric auth to access
    /// - Throws: KeychainError if storage fails
    public func set(_ data: Data, forKey key: String, requireBiometric: Bool = false) throws {
        // Delete any existing item first
        try? delete(key)

        var query = baseQuery(for: key)
        query[kSecValueData as String] = data

        // Set accessibility level
        if requireBiometric {
            // Require device to be unlocked and optionally biometric
            let access = SecAccessControlCreateWithFlags(
                nil,
                kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
                .userPresence,
                nil
            )
            query[kSecAttrAccessControl as String] = access
        } else {
            query[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        }

        let status = SecItemAdd(query as CFDictionary, nil)

        guard status == errSecSuccess else {
            throw KeychainError.from(status: status)
        }
    }

    /// Retrieve a string value from Keychain
    /// - Parameter key: The key associated with the value
    /// - Returns: The stored string value, or nil if not found
    /// - Throws: KeychainError if retrieval fails (other than not found)
    public func get(_ key: String) throws -> String? {
        guard let data = try getData(key) else {
            return nil
        }
        guard let string = String(data: data, encoding: .utf8) else {
            throw KeychainError.decodingFailed
        }
        return string
    }

    /// Retrieve data from Keychain
    /// - Parameter key: The key associated with the data
    /// - Returns: The stored data, or nil if not found
    /// - Throws: KeychainError if retrieval fails (other than not found)
    public func getData(_ key: String) throws -> Data? {
        var query = baseQuery(for: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        switch status {
        case errSecSuccess:
            return result as? Data
        case errSecItemNotFound:
            return nil
        default:
            throw KeychainError.from(status: status)
        }
    }

    /// Delete a value from Keychain
    /// - Parameter key: The key associated with the value to delete
    /// - Throws: KeychainError if deletion fails
    public func delete(_ key: String) throws {
        let query = baseQuery(for: key)
        let status = SecItemDelete(query as CFDictionary)

        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.from(status: status)
        }
    }

    /// Check if a key exists in Keychain
    /// - Parameter key: The key to check
    /// - Returns: True if the key exists
    public func exists(_ key: String) -> Bool {
        var query = baseQuery(for: key)
        query[kSecReturnData as String] = false

        let status = SecItemCopyMatching(query as CFDictionary, nil)
        return status == errSecSuccess
    }

    /// Delete all Patina-related items from Keychain
    public func deleteAll() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName
        ]

        let status = SecItemDelete(query as CFDictionary)

        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.from(status: status)
        }
    }

    // MARK: - Private Helpers

    private func baseQuery(for key: String) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key
        ]

        if let accessGroup = accessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }

        return query
    }
}

// MARK: - Keychain Keys

extension KeychainService {
    /// Keys used for storing auth tokens
    public enum Keys {
        public static let accessToken = "patina.auth.accessToken"
        public static let refreshToken = "patina.auth.refreshToken"
        public static let tokenExpiry = "patina.auth.tokenExpiry"
    }
}

// MARK: - Keychain Error

public enum KeychainError: LocalizedError {
    case encodingFailed
    case decodingFailed
    case itemNotFound
    case duplicateItem
    case authenticationFailed
    case accessDenied
    case unknown(OSStatus)

    public var errorDescription: String? {
        switch self {
        case .encodingFailed:
            return "Failed to encode data for Keychain storage"
        case .decodingFailed:
            return "Failed to decode data from Keychain"
        case .itemNotFound:
            return "Item not found in Keychain"
        case .duplicateItem:
            return "Item already exists in Keychain"
        case .authenticationFailed:
            return "Authentication failed"
        case .accessDenied:
            return "Access to Keychain denied"
        case .unknown(let status):
            return "Keychain error: \(status)"
        }
    }

    static func from(status: OSStatus) -> KeychainError {
        switch status {
        case errSecItemNotFound:
            return .itemNotFound
        case errSecDuplicateItem:
            return .duplicateItem
        case errSecAuthFailed:
            return .authenticationFailed
        case errSecInteractionNotAllowed:
            return .accessDenied
        default:
            return .unknown(status)
        }
    }
}

//  KeychainGuestAccessTokenStore.swift
//  Capture

//  Persists the active request-scoped opaque guest token across cold launches.
//  The value never enters UserDefaults, logs, Supabase auth, or direct queries.

import Foundation
import Security
import CaptureKit

struct KeychainGuestAccessTokenStore: GuestAccessTokenStoring {
    private let service: String
    private let account: String

    init(service: String = "cloud.patina.field.guest-access",
         account: String = "active-site-request") {
        self.service = service
        self.account = account
    }

    func load() throws -> String? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess,
              let data = result as? Data,
              let token = String(data: data, encoding: .utf8),
              !token.isEmpty else {
            throw KeychainGuestAccessError(status: status)
        }
        return token
    }

    func save(_ accessToken: String) throws {
        let data = Data(accessToken.utf8)
        let status = SecItemUpdate(
            baseQuery as CFDictionary,
            [kSecValueData as String: data] as CFDictionary)
        if status == errSecSuccess { return }
        if status != errSecItemNotFound { throw KeychainGuestAccessError(status: status) }

        var item = baseQuery
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let addStatus = SecItemAdd(item as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            throw KeychainGuestAccessError(status: addStatus)
        }
    }

    func clear() throws {
        let status = SecItemDelete(baseQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainGuestAccessError(status: status)
        }
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }
}

private struct KeychainGuestAccessError: Error {
    let status: OSStatus
}

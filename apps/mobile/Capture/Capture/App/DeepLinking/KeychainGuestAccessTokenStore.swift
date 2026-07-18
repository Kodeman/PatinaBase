//  KeychainGuestAccessTokenStore.swift
//  Capture

//  Persists the active request-scoped opaque guest token across cold launches
//  and a separate account per request for durable outbox retries. Values never
//  enter UserDefaults, logs, Supabase auth, SwiftData, or direct queries.

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
        try load(account: account)
    }

    func save(_ accessToken: String) throws {
        try save(accessToken, account: account)
    }

    func clear() throws {
        try clear(account: account)
    }

    func load(requestID: String) throws -> String? {
        try load(account: requestAccount(requestID))
    }

    func save(_ accessToken: String, requestID: String) throws {
        try save(accessToken, account: requestAccount(requestID))
    }

    func clear(requestID: String) throws {
        try clear(account: requestAccount(requestID))
    }

    private func load(account: String) throws -> String? {
        var query = baseQuery(account: account)
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

    private func save(_ accessToken: String, account: String) throws {
        let data = Data(accessToken.utf8)
        let status = SecItemUpdate(
            baseQuery(account: account) as CFDictionary,
            [kSecValueData as String: data] as CFDictionary)
        if status == errSecSuccess { return }
        if status != errSecItemNotFound { throw KeychainGuestAccessError(status: status) }

        var item = baseQuery(account: account)
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let addStatus = SecItemAdd(item as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            throw KeychainGuestAccessError(status: addStatus)
        }
    }

    private func clear(account: String) throws {
        let status = SecItemDelete(baseQuery(account: account) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainGuestAccessError(status: status)
        }
    }

    private func requestAccount(_ requestID: String) -> String {
        "site-request:\(requestID)"
    }

    private func baseQuery(account: String) -> [String: Any] {
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

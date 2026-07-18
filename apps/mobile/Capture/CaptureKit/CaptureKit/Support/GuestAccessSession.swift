//  GuestAccessSession.swift
//  CaptureKit
//
//  Persistence seam for the active opaque Site Request link plus request-keyed
//  outbox credentials. The production app supplies Keychain; raw tokens never
//  enter SwiftData payloads. Tests use the in-memory conformer.

import Foundation

public protocol GuestAccessTokenStoring: Sendable {
    func load() throws -> String?
    func save(_ accessToken: String) throws
    func clear() throws
    func load(requestID: String) throws -> String?
    func save(_ accessToken: String, requestID: String) throws
    func clear(requestID: String) throws
}

public final class InMemoryGuestAccessTokenStore: GuestAccessTokenStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var value: String?
    private var requestValues: [String: String] = [:]

    public init(value: String? = nil) { self.value = value }

    public func load() -> String? {
        lock.withLock { value }
    }

    public func save(_ accessToken: String) {
        lock.withLock { value = accessToken }
    }

    public func clear() {
        lock.withLock { value = nil }
    }

    public func load(requestID: String) -> String? {
        lock.withLock { requestValues[requestID] }
    }

    public func save(_ accessToken: String, requestID: String) {
        lock.withLock { requestValues[requestID] = accessToken }
    }

    public func clear(requestID: String) {
        lock.withLock { _ = requestValues.removeValue(forKey: requestID) }
    }
}

public final class GuestAccessSession: @unchecked Sendable {
    private let store: any GuestAccessTokenStoring

    public init(store: any GuestAccessTokenStoring) {
        self.store = store
    }

    public func restore() -> String? { try? store.load() }

    public func enter(_ accessToken: String) {
        // Keep the current launch usable if Keychain has a transient error;
        // restore remains honest because it only returns a successful write.
        try? store.save(accessToken)
    }

    public func bind(_ accessToken: String, to requestID: String) {
        try? store.save(accessToken, requestID: requestID)
    }

    public func accessToken(for requestID: String) -> String? {
        try? store.load(requestID: requestID)
    }

    public func leave(requestID: String? = nil) {
        if let requestID { try? store.clear(requestID: requestID) }
        try? store.clear()
    }
}

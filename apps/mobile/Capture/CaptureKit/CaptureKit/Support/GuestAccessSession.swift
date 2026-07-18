//  GuestAccessSession.swift
//  CaptureKit
//
//  Small persistence seam for the one active opaque Site Request link. The
//  production app supplies Keychain; tests use the in-memory conformer.

import Foundation

public protocol GuestAccessTokenStoring: Sendable {
    func load() throws -> String?
    func save(_ accessToken: String) throws
    func clear() throws
}

public final class InMemoryGuestAccessTokenStore: GuestAccessTokenStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var value: String?

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

    public func leave() { try? store.clear() }
}

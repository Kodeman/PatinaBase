//
//  UserDefaultsBacked.swift
//  Patina
//
//  Property wrapper for UserDefaults-backed storage
//

import Foundation
import SwiftUI

/// Property wrapper that stores values in UserDefaults
@propertyWrapper
public struct UserDefaultsBacked<Value: Codable> {
    private let key: String
    private let defaultValue: Value
    private let storage: UserDefaults

    public init(
        wrappedValue defaultValue: Value,
        key: String,
        storage: UserDefaults = .standard
    ) {
        self.key = key
        self.defaultValue = defaultValue
        self.storage = storage
    }

    public var wrappedValue: Value {
        get {
            guard let data = storage.data(forKey: key) else {
                return defaultValue
            }

            do {
                return try JSONDecoder().decode(Value.self, from: data)
            } catch {
                return defaultValue
            }
        }
        set {
            do {
                let data = try JSONEncoder().encode(newValue)
                storage.set(data, forKey: key)
            } catch {
                print("Failed to encode \(key): \(error)")
            }
        }
    }
}

// MARK: - App Storage Keys

/// Centralized UserDefaults keys for the app
public enum StorageKey {
    public static let hasCompletedOnboarding = "hasCompletedOnboarding"
    public static let hasSeenThreshold = "hasSeenThreshold"
    public static let lastTimeOfDay = "lastTimeOfDay"
    public static let userStyleProfile = "userStyleProfile"
    public static let companionHasUnreadMessage = "companionHasUnreadMessage"
    public static let roomCount = "roomCount"
    public static let tableItemCount = "tableItemCount"
}

// MARK: - App Settings

/// Observable settings object for app-wide preferences
@Observable
public final class AppSettings {
    public static let shared = AppSettings()

    private let defaults = UserDefaults.standard

    public var hasCompletedOnboarding: Bool {
        get { defaults.bool(forKey: StorageKey.hasCompletedOnboarding) }
        set { defaults.set(newValue, forKey: StorageKey.hasCompletedOnboarding) }
    }

    public var hasSeenThreshold: Bool {
        get { defaults.bool(forKey: StorageKey.hasSeenThreshold) }
        set { defaults.set(newValue, forKey: StorageKey.hasSeenThreshold) }
    }

    public var companionHasUnreadMessage: Bool {
        get { defaults.bool(forKey: StorageKey.companionHasUnreadMessage) }
        set { defaults.set(newValue, forKey: StorageKey.companionHasUnreadMessage) }
    }

    public var roomCount: Int {
        get { defaults.integer(forKey: StorageKey.roomCount) }
        set { defaults.set(newValue, forKey: StorageKey.roomCount) }
    }

    public var tableItemCount: Int {
        get { defaults.integer(forKey: StorageKey.tableItemCount) }
        set { defaults.set(newValue, forKey: StorageKey.tableItemCount) }
    }

    private init() {}

    /// Reset all settings - useful for debugging
    public func reset() {
        hasCompletedOnboarding = false
        hasSeenThreshold = false
        companionHasUnreadMessage = false
        roomCount = 0
        tableItemCount = 0
    }
}

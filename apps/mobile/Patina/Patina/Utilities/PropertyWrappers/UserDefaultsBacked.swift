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
                PatinaLog.ui.error("Failed to encode \(key): \(error)")
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

/// Observable settings object for app-wide preferences.
///
/// ⚠ Every property here is COMPUTED (UserDefaults-backed), and the
/// `@Observable` macro only instruments *stored* properties — a bare
/// computed property is invisible to `withObservationTracking`. That
/// exact gap made `AppCoordinator`'s phase observer deaf to
/// `hasCompletedOnboarding = true`, stranding users on the style reveal
/// until relaunch (Wave 1 P0). Each accessor therefore reports to the
/// synthesized observation registrar by hand: `access(keyPath:)` in the
/// getter, `withMutation(keyPath:)` around the setter — the documented
/// Observation pattern for computed properties backed by external storage.
@Observable
public final class AppSettings {
    public static let shared = AppSettings()

    @ObservationIgnored
    private let defaults = UserDefaults.standard

    public var hasCompletedOnboarding: Bool {
        get {
            access(keyPath: \.hasCompletedOnboarding)
            return defaults.bool(forKey: StorageKey.hasCompletedOnboarding)
        }
        set {
            withMutation(keyPath: \.hasCompletedOnboarding) {
                defaults.set(newValue, forKey: StorageKey.hasCompletedOnboarding)
            }
        }
    }

    public var hasSeenThreshold: Bool {
        get {
            access(keyPath: \.hasSeenThreshold)
            return defaults.bool(forKey: StorageKey.hasSeenThreshold)
        }
        set {
            withMutation(keyPath: \.hasSeenThreshold) {
                defaults.set(newValue, forKey: StorageKey.hasSeenThreshold)
            }
        }
    }

    public var companionHasUnreadMessage: Bool {
        get {
            access(keyPath: \.companionHasUnreadMessage)
            return defaults.bool(forKey: StorageKey.companionHasUnreadMessage)
        }
        set {
            withMutation(keyPath: \.companionHasUnreadMessage) {
                defaults.set(newValue, forKey: StorageKey.companionHasUnreadMessage)
            }
        }
    }

    public var roomCount: Int {
        get {
            access(keyPath: \.roomCount)
            return defaults.integer(forKey: StorageKey.roomCount)
        }
        set {
            withMutation(keyPath: \.roomCount) {
                defaults.set(newValue, forKey: StorageKey.roomCount)
            }
        }
    }

    public var tableItemCount: Int {
        get {
            access(keyPath: \.tableItemCount)
            return defaults.integer(forKey: StorageKey.tableItemCount)
        }
        set {
            withMutation(keyPath: \.tableItemCount) {
                defaults.set(newValue, forKey: StorageKey.tableItemCount)
            }
        }
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

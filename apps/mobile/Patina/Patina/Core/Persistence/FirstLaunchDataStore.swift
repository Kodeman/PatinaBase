//
//  FirstLaunchDataStore.swift
//  Patina
//
//  Persistence for first-launch data including metrics and room data.
//

import Foundation

/// Data store for persisting first-launch information
public final class FirstLaunchDataStore {

    // MARK: - Singleton

    public static let shared = FirstLaunchDataStore()

    // MARK: - Storage Keys

    private enum Keys {
        static let firstLaunchMetrics = "firstLaunchMetrics"
        static let firstWalkRoomData = "firstWalkRoomData"
        static let firstWalkStyleSignals = "firstWalkStyleSignals"
    }

    // MARK: - Dependencies

    private let defaults = UserDefaults.standard
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    // MARK: - Initialization

    private init() {}

    // MARK: - Metrics

    /// Save first-launch metrics
    public func saveMetrics(_ metrics: FirstLaunchMetrics) {
        do {
            let data = try encoder.encode(metrics)
            defaults.set(data, forKey: Keys.firstLaunchMetrics)
        } catch {
            print("[FirstLaunchDataStore] Failed to save metrics: \(error)")
        }
    }

    /// Load saved first-launch metrics
    public func loadMetrics() -> FirstLaunchMetrics? {
        guard let data = defaults.data(forKey: Keys.firstLaunchMetrics) else {
            return nil
        }

        do {
            return try decoder.decode(FirstLaunchMetrics.self, from: data)
        } catch {
            print("[FirstLaunchDataStore] Failed to load metrics: \(error)")
            return nil
        }
    }

    // MARK: - Room Data

    /// Save first walk room data
    public func saveRoomData(_ roomData: FirstWalkRoomData) {
        do {
            let data = try encoder.encode(roomData)
            defaults.set(data, forKey: Keys.firstWalkRoomData)
        } catch {
            print("[FirstLaunchDataStore] Failed to save room data: \(error)")
        }
    }

    /// Load saved first walk room data
    public func loadRoomData() -> FirstWalkRoomData? {
        guard let data = defaults.data(forKey: Keys.firstWalkRoomData) else {
            return nil
        }

        do {
            return try decoder.decode(FirstWalkRoomData.self, from: data)
        } catch {
            print("[FirstLaunchDataStore] Failed to load room data: \(error)")
            return nil
        }
    }

    // MARK: - Style Signals

    /// Save first walk style signals
    public func saveStyleSignals(_ signals: FirstWalkStyleSignals) {
        do {
            let data = try encoder.encode(signals)
            defaults.set(data, forKey: Keys.firstWalkStyleSignals)
        } catch {
            print("[FirstLaunchDataStore] Failed to save style signals: \(error)")
        }
    }

    /// Load saved first walk style signals
    public func loadStyleSignals() -> FirstWalkStyleSignals? {
        guard let data = defaults.data(forKey: Keys.firstWalkStyleSignals) else {
            return nil
        }

        do {
            return try decoder.decode(FirstWalkStyleSignals.self, from: data)
        } catch {
            print("[FirstLaunchDataStore] Failed to load style signals: \(error)")
            return nil
        }
    }

    // MARK: - Clear Data

    /// Clear all first-launch data (for debugging/reset)
    public func clearAll() {
        defaults.removeObject(forKey: Keys.firstLaunchMetrics)
        defaults.removeObject(forKey: Keys.firstWalkRoomData)
        defaults.removeObject(forKey: Keys.firstWalkStyleSignals)
    }

    // MARK: - Analytics Export

    /// Export metrics for analytics (to send to backend)
    public func exportMetricsForAnalytics() -> [String: Any]? {
        guard let metrics = loadMetrics() else { return nil }

        return [
            "threshold_hold_duration": metrics.thresholdHoldDuration ?? 0,
            "walk_invitation_choice": metrics.walkInvitationChoice?.rawValue ?? "none",
            "permission_result": metrics.permissionResult?.rawValue ?? "none",
            "walk_duration": metrics.walkDuration ?? 0,
            "questions_answered": metrics.questionsAnswered,
            "questions_ignored": metrics.questionsIgnored,
            "first_emergence_action": metrics.firstEmergenceAction?.rawValue ?? "none",
            "total_flow_duration": metrics.totalFlowDuration ?? 0,
            "skipped_walk": metrics.skippedWalk,
            "permission_denied": metrics.permissionDenied
        ]
    }
}

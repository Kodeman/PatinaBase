//
//  ScanEventChannel.swift
//  Patina
//
//  PT-6-16: typed, `@Observable` replacement for the two cross-view
//  `NotificationCenter` buses (`.mockScanCompleted` and
//  `.patinaScanRecoveryCandidatesDidAppear`) plus the `pendingScanRecovery`
//  UserDefaults flag.
//
//  Producers set a property on the channel; consumers read it (directly or
//  via SwiftUI `.onChange(of:)`). Injected through the SwiftUI environment
//  so there's exactly one instance shared across the app, observed through
//  Swift's Observation rather than stringly-typed notifications.
//

import SwiftUI

/// A single mock-scan completion event. Wrapped in an `Identifiable` value
/// (rather than exposing the payload bare) so consumers can react to *each*
/// completion via `.onChange(of:)` even when two completions carry equal
/// room data — the `id` makes every post distinct.
public struct MockScanCompletedEvent: Identifiable, Equatable {
    public let id = UUID()
    public let roomData: FirstWalkRoomData

    public init(roomData: FirstWalkRoomData) {
        self.roomData = roomData
    }

    public static func == (lhs: MockScanCompletedEvent, rhs: MockScanCompletedEvent) -> Bool {
        lhs.id == rhs.id
    }
}

/// Typed event bus for scan-related cross-view signals. Replaces two
/// `NotificationCenter` names and one UserDefaults flag with a single,
/// observable source of truth (PT-6-16).
@MainActor
@Observable
public final class ScanEventChannel {

    // MARK: - Mock scan completion

    /// The most recent mock-scan completion (simulator / `--mockar` path).
    /// `WalkView` observes this and feeds the room data into its completion
    /// handler. Each post is a fresh `MockScanCompletedEvent` so repeat
    /// completions are observable.
    public private(set) var mockScanCompleted: MockScanCompletedEvent?

    /// Post a mock-scan completion. Called by `MockRoomScanView` in place of
    /// `NotificationCenter.post(name: .mockScanCompleted, ...)`.
    public func postMockScanCompleted(roomData: FirstWalkRoomData) {
        mockScanCompleted = MockScanCompletedEvent(roomData: roomData)
    }

    // MARK: - Scan recovery candidates

    /// Number of recoverable scan bundles found at launch (0 when none).
    /// Replaces both the `.patinaScanRecoveryCandidatesDidAppear`
    /// notification and the `pendingScanRecovery` UserDefaults flag — late
    /// subscribers can read this property directly, the same way they used
    /// to read the flag.
    public private(set) var pendingRecoveryCandidateCount: Int = 0

    /// Whether there are scan bundles awaiting a recovery prompt. Mirrors the
    /// old `pendingScanRecovery` boolean for call sites that only need a flag.
    public var hasPendingRecoveryCandidates: Bool {
        pendingRecoveryCandidateCount > 0
    }

    /// Record the launch-time recovery scan result. Called by `PatinaApp`'s
    /// housekeeping task in place of the notification + UserDefaults writes.
    public func setRecoveryCandidateCount(_ count: Int) {
        pendingRecoveryCandidateCount = count
    }

    public init() {}
}

// MARK: - Environment

extension EnvironmentValues {
    /// The shared scan event channel. A throwaway default keeps isolated
    /// previews / tests rendering; the real instance is injected from
    /// `PatinaApp`.
    @Entry public var scanEventChannel: ScanEventChannel = ScanEventChannel()
}

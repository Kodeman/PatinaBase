//
//  FirstLaunchCoordinator.swift
//  Patina
//
//  Manages the first-time user onboarding flow from Threshold to first Emergence.
//  Coordinates with AppCoordinator for navigation and tracks captured data.
//

import SwiftUI

/// Coordinator for the first-launch onboarding experience
@Observable
public final class FirstLaunchCoordinator {

    // MARK: - State

    /// Current state in the first-launch flow
    public private(set) var currentState: FirstLaunchState = .threshold

    /// Whether the flow is complete
    public private(set) var isComplete = false

    // MARK: - Captured Data

    /// Room data captured during the walk
    public private(set) var capturedRoomData: FirstWalkRoomData?

    /// Style signals computed from room features and user responses
    public private(set) var styleSignals: FirstWalkStyleSignals?

    /// Engagement metrics for analytics
    public private(set) var metrics = FirstLaunchMetrics()

    // MARK: - Flow State

    /// User's choice at walk invitation
    public private(set) var walkInvitationChoice: WalkInvitationChoice?

    /// Result of camera permission request
    public private(set) var permissionResult: CameraPermissionResult?

    /// Name of the room being walked
    public private(set) var roomName: String = "Living Room"

    /// Type of the room being walked
    public private(set) var roomType: String = "Living Room"

    // MARK: - Dependencies

    private let settings = AppSettings.shared

    // MARK: - Initialization

    public init() {
        metrics.flowStartedAt = Date()
    }

    // MARK: - State Transitions

    /// Advance to the next state
    public func advance() {
        guard let nextState = currentState.nextState else { return }
        transition(to: nextState)
    }

    /// Transition to a specific state
    public func transition(to newState: FirstLaunchState) {
        guard newState != currentState else { return }
        let previousState = currentState

        withAnimation(.easeInOut(duration: 0.5)) {
            currentState = newState
        }

        // Track metrics
        trackTransition(from: previousState, to: newState)
    }

    // MARK: - Threshold Actions

    /// Complete the threshold hold gesture
    public func completeThreshold(holdDuration: TimeInterval) {
        metrics.thresholdHoldDuration = holdDuration
        settings.hasSeenThreshold = true
        HapticManager.shared.thresholdCrossed()
        transition(to: .walkInvitation)
    }

    // MARK: - Walk Invitation Actions

    /// Handle user's walk invitation choice
    public func handleWalkInvitationChoice(_ choice: WalkInvitationChoice) {
        walkInvitationChoice = choice
        metrics.walkInvitationChoice = choice

        switch choice {
        case .letsWalk:
            // Check camera permission status
            // For now, assume we need to request
            transition(to: .cameraPermission)

        case .notYet:
            // Complete with minimal onboarding, skip to main app
            completeOnboarding(skippedWalk: true)
        }
    }

    // MARK: - Camera Permission Actions

    /// Handle camera permission result
    public func handleCameraPermission(_ result: CameraPermissionResult) {
        permissionResult = result
        metrics.permissionResult = result

        switch result {
        case .granted:
            // Permission granted, start the walk
            transition(to: .walkActive)

        case .denied:
            // Permission denied, complete with limited experience
            completeOnboarding(permissionDenied: true)

        case .notDetermined:
            // Shouldn't happen after request, but handle gracefully
            break
        }
    }

    // MARK: - Walk Actions

    /// Start the walk (called when AR session initializes)
    public func startWalk() {
        metrics.walkStartedAt = Date()
    }

    /// Update walk progress
    public func updateWalkProgress(_ progress: Float) {
        metrics.walkProgress = progress
    }

    /// Record a question answered during walk
    public func recordQuestionAnswered() {
        metrics.questionsAnswered += 1
    }

    /// Record a question ignored during walk
    public func recordQuestionIgnored() {
        metrics.questionsIgnored += 1
    }

    /// Complete the walk with captured room data
    public func completeWalk(roomData: FirstWalkRoomData, styleSignals: FirstWalkStyleSignals) {
        self.capturedRoomData = roomData
        self.styleSignals = styleSignals

        metrics.walkEndedAt = Date()
        metrics.walkDuration = metrics.walkEndedAt?.timeIntervalSince(metrics.walkStartedAt ?? Date())

        HapticManager.shared.impact(.medium)
        transition(to: .walkComplete)
    }

    // MARK: - Walk Complete Actions

    /// Show the first emergence
    public func showFirstEmergence() {
        transition(to: .firstEmergence)
    }

    // MARK: - First Emergence Actions

    /// Handle user's action on the first emergence
    public func handleEmergenceAction(_ action: EmergenceAction) {
        metrics.firstEmergenceAction = action

        switch action {
        case .stay:
            HapticManager.shared.notification(.success)
        case .drift:
            HapticManager.shared.impact(.light)
        }

        // Transition to room naming instead of completing
        transition(to: .roomNaming)
    }

    // MARK: - Room Naming Actions

    /// Update the room name and type
    public func updateRoomName(_ name: String, type: String) {
        roomName = name
        roomType = type

        // Update the captured room data if we have it
        if var roomData = capturedRoomData {
            roomData.roomName = name
            capturedRoomData = roomData
        }
    }

    // MARK: - Completion

    /// Mark onboarding as complete and record final metrics
    public func completeOnboarding(skippedWalk: Bool = false, permissionDenied: Bool = false) {
        settings.hasCompletedOnboarding = true
        isComplete = true

        metrics.flowEndedAt = Date()
        metrics.totalFlowDuration = metrics.flowEndedAt?.timeIntervalSince(metrics.flowStartedAt ?? Date())
        metrics.skippedWalk = skippedWalk
        metrics.permissionDenied = permissionDenied

        transition(to: .complete)

        // Persist metrics for analytics
        persistMetrics()
    }

    /// Reset for testing/debugging
    public func reset() {
        currentState = .threshold
        isComplete = false
        capturedRoomData = nil
        styleSignals = nil
        metrics = FirstLaunchMetrics()
        metrics.flowStartedAt = Date()
        walkInvitationChoice = nil
        permissionResult = nil
        roomName = "Living Room"
        roomType = "Living Room"
    }

    // MARK: - Private Helpers

    private func trackTransition(from: FirstLaunchState, to: FirstLaunchState) {
        // Could send analytics event here
        print("[FirstLaunch] \(from.displayName) → \(to.displayName)")
    }

    private func persistMetrics() {
        // In full implementation, would save to SwiftData or send to backend
        print("[FirstLaunch] Metrics: \(metrics)")
    }
}

// MARK: - Environment Key

private struct FirstLaunchCoordinatorKey: EnvironmentKey {
    static let defaultValue: FirstLaunchCoordinator? = nil
}

extension EnvironmentValues {
    public var firstLaunchCoordinator: FirstLaunchCoordinator? {
        get { self[FirstLaunchCoordinatorKey.self] }
        set { self[FirstLaunchCoordinatorKey.self] = newValue }
    }
}

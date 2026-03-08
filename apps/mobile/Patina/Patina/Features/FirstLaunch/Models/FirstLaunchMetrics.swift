//
//  FirstLaunchMetrics.swift
//  Patina
//
//  Engagement metrics captured during the first-launch experience.
//  Used for analytics and improving the onboarding flow.
//

import Foundation

/// Metrics captured during the first-launch flow
public struct FirstLaunchMetrics: Codable {

    // MARK: - Timing

    /// When the flow started (app first opened)
    public var flowStartedAt: Date?

    /// When the flow ended (completed or abandoned)
    public var flowEndedAt: Date?

    /// Total flow duration in seconds
    public var totalFlowDuration: TimeInterval?

    // MARK: - Threshold

    /// How long the user held to cross the threshold
    public var thresholdHoldDuration: TimeInterval?

    // MARK: - Walk Invitation

    /// User's choice at walk invitation
    public var walkInvitationChoice: WalkInvitationChoice?

    // MARK: - Permission

    /// Result of camera permission request
    public var permissionResult: CameraPermissionResult?

    // MARK: - Walk

    /// When the walk started (AR session began)
    public var walkStartedAt: Date?

    /// When the walk ended
    public var walkEndedAt: Date?

    /// Walk duration in seconds
    public var walkDuration: TimeInterval?

    /// Current walk progress (0-1)
    public var walkProgress: Float = 0

    /// Number of questions answered during walk
    public var questionsAnswered: Int = 0

    /// Number of questions ignored (timed out) during walk
    public var questionsIgnored: Int = 0

    // MARK: - First Emergence

    /// User's action on the first emerged piece
    public var firstEmergenceAction: EmergenceAction?

    // MARK: - Flow Completion

    /// Whether the user skipped the walk
    public var skippedWalk: Bool = false

    /// Whether permission was denied
    public var permissionDenied: Bool = false

    // MARK: - Initialization

    public init() {}
}

// MARK: - Emergence Action

/// User's action on an emerged piece
public enum EmergenceAction: String, Codable {
    /// Keep the piece (add to Table)
    case stay

    /// Let the piece drift away
    case drift
}

// MARK: - Debug Description

extension FirstLaunchMetrics: CustomStringConvertible {
    public var description: String {
        var parts: [String] = []

        if let duration = totalFlowDuration {
            parts.append("duration: \(Int(duration))s")
        }

        if let threshold = thresholdHoldDuration {
            parts.append("threshold: \(String(format: "%.1f", threshold))s")
        }

        if let choice = walkInvitationChoice {
            parts.append("choice: \(choice.rawValue)")
        }

        if let walk = walkDuration {
            parts.append("walk: \(Int(walk))s")
        }

        parts.append("questions: \(questionsAnswered)/\(questionsAnswered + questionsIgnored)")

        if let action = firstEmergenceAction {
            parts.append("emergence: \(action.rawValue)")
        }

        if skippedWalk {
            parts.append("(skipped)")
        }

        if permissionDenied {
            parts.append("(denied)")
        }

        return "Metrics(\(parts.joined(separator: ", ")))"
    }
}

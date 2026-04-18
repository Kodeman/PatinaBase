//
//  ScanAnalytics.swift
//  Patina
//
//  Enumerated PostHog event helper for the Quiet Conversation flow.
//  Per PRD §8 Analytics Events.
//
//  Each case maps to a specific event name and property bag so the view
//  models never have to remember string literals.
//

import Foundation
import UIKit

@MainActor
public final class ScanAnalytics {

    public static let shared = ScanAnalytics()

    private let posthog = PostHogService.shared

    private init() {}

    // MARK: - Session context

    /// Base context shared across all events. Merged into every capture.
    public struct Context {
        public var sessionId: String
        public var userId: String?
        public var hasLidar: Bool
        public var roomType: String?

        public init(sessionId: String, userId: String?, hasLidar: Bool, roomType: String? = nil) {
            self.sessionId = sessionId
            self.userId = userId
            self.hasLidar = hasLidar
            self.roomType = roomType
        }

        fileprivate func merged(into props: [String: Any]) -> [String: Any] {
            var out = props
            out["scan_session_id"] = sessionId
            if let uid = userId { out["user_id"] = uid }
            out["has_lidar"] = hasLidar
            if let rt = roomType { out["room_type"] = rt }
            out["device_model"] = UIDevice.current.model
            out["os_version"] = UIDevice.current.systemVersion
            return out
        }
    }

    /// The current scan session's base context. Set once at Threshold entry, cleared
    /// when the flow ends so background noise doesn't inherit scan properties.
    public var context: Context?

    // MARK: - Event enum

    public enum Event {
        // Scan lifecycle
        case thresholdEntered(previousRoomType: String?)
        case scanStarted
        case scanProgressMilestone(milestone: Int)  // 25 | 50 | 75
        case scanCompleted(durationSeconds: Double, quality: Float)
        case scanAbandoned(progress: Float)
        case scanPaused(progress: Float)
        case scanResumed
        case scanPartialAccepted(progress: Float)

        // Edge cases
        case edgeLowLight
        case edgeFastMovement
        case edgeFeatureLoss
        case edgeIdle
        case edgeRoomTooLarge

        // Conversation
        case conversationStarted
        case q1Answered(selection: String)
        case q2Answered(selections: [String])
        case q3Answered(selections: [String])
        case q4Answered(tier: String)
        case q5Answered(selection: String)
        case conversationCompleted(totalSeconds: Double)

        // Reveal
        case revealDisplayed(aestheticName: String)
        case revealCtaTapped(flaggedForDesigner: Bool)
        case revealProfileExplored

        // Floor plan
        case floorplanDisplayed
        case floorplanAccepted
        case floorplanRescan

        // Fallback
        case manualEntryStarted
        case manualEntryCompleted(roomType: String)

        fileprivate var name: String {
            switch self {
            case .thresholdEntered:         return "scan_threshold_entered"
            case .scanStarted:              return "scan_started"
            case .scanProgressMilestone:    return "scan_progress_milestone"
            case .scanCompleted:            return "scan_completed"
            case .scanAbandoned:            return "scan_abandoned"
            case .scanPaused:               return "scan_paused"
            case .scanResumed:              return "scan_resumed"
            case .scanPartialAccepted:      return "scan_partial_accepted"
            case .edgeLowLight:             return "scan_edge_low_light"
            case .edgeFastMovement:         return "scan_edge_fast_movement"
            case .edgeFeatureLoss:          return "scan_edge_feature_loss"
            case .edgeIdle:                 return "scan_edge_idle"
            case .edgeRoomTooLarge:         return "scan_edge_room_too_large"
            case .conversationStarted:      return "conversation_started"
            case .q1Answered:               return "conversation_q1_answered"
            case .q2Answered:               return "conversation_q2_answered"
            case .q3Answered:               return "conversation_q3_answered"
            case .q4Answered:               return "conversation_q4_answered"
            case .q5Answered:               return "conversation_q5_answered"
            case .conversationCompleted:    return "conversation_completed"
            case .revealDisplayed:          return "reveal_displayed"
            case .revealCtaTapped:          return "reveal_cta_tapped"
            case .revealProfileExplored:    return "reveal_profile_explored"
            case .floorplanDisplayed:       return "floorplan_displayed"
            case .floorplanAccepted:        return "floorplan_accepted"
            case .floorplanRescan:          return "floorplan_rescan"
            case .manualEntryStarted:       return "manual_entry_started"
            case .manualEntryCompleted:     return "manual_entry_completed"
            }
        }

        fileprivate var properties: [String: Any] {
            switch self {
            case .thresholdEntered(let previousRoomType):
                return ["previous_room_type": previousRoomType ?? "unknown"]
            case .scanProgressMilestone(let milestone):
                return ["milestone": milestone]
            case .scanCompleted(let duration, let quality):
                return ["duration_seconds": duration, "quality": quality]
            case .scanAbandoned(let progress):
                return ["progress": progress]
            case .scanPaused(let progress):
                return ["progress": progress]
            case .scanPartialAccepted(let progress):
                return ["progress": progress]
            case .q1Answered(let selection):
                return ["selection": selection]
            case .q2Answered(let selections):
                return ["selections": selections]
            case .q3Answered(let selections):
                return ["selections": selections]
            case .q4Answered(let tier):
                return ["tier": tier]
            case .q5Answered(let selection):
                return ["selection": selection]
            case .conversationCompleted(let totalSeconds):
                return ["total_seconds": totalSeconds]
            case .revealDisplayed(let aestheticName):
                return ["aesthetic_name": aestheticName]
            case .revealCtaTapped(let flagged):
                return ["flagged_for_designer": flagged]
            case .manualEntryCompleted(let roomType):
                return ["room_type": roomType]
            default:
                return [:]
            }
        }
    }

    // MARK: - Capture

    public func track(_ event: Event, extra: [String: Any] = [:]) {
        var props = event.properties
        for (key, value) in extra { props[key] = value }
        if let context = context {
            props = context.merged(into: props)
        }
        posthog.capture(event.name, properties: props)
    }
}

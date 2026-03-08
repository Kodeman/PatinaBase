//
//  StyleSignalService.swift
//  Patina
//
//  Computes style signals from room features, user responses, and behavior.
//  Generates insight phrases for the Walk Complete screen.
//

import Foundation
import Combine
import CoreGraphics
import RoomPlan

/// Service for computing style signals from walk data
@MainActor
public final class StyleSignalService: ObservableObject {

    // MARK: - Published State

    @Published public private(set) var signals = FirstWalkStyleSignals()
    @Published public private(set) var insights: [String] = []

    // MARK: - Behavior Tracking

    private var lingerStartTime: Date?
    private var lingerPosition: CGPoint?
    private var scanStartTime: Date?
    private var lastPosition: CGPoint?
    private var totalDistance: CGFloat = 0
    private var positionSamples: Int = 0

    // MARK: - Initialization

    public init() {}

    // MARK: - Signal Computation

    /// Compute signals from room data
    public func computeFromRoom(_ roomData: FirstWalkRoomData) {
        // Natural light from window count and size
        let windowCount = roomData.windowCount
        let hasLargeWindow = roomData.detectedFeatures.contains { $0.category == .largeWindow }

        signals.naturalLight = min(1.0, Float(windowCount) * 0.3 + (hasLargeWindow ? 0.3 : 0))

        // Openness from room volume
        let volume = roomData.dimensions.volume
        signals.openness = min(1.0, volume / 100.0) // Normalize to 100 cubic meters

        // Warmth from materials
        let hasFireplace = roomData.hasFireplace
        let hasWood = roomData.detectedFeatures.contains { $0.category == .hardwoodFloor }
        signals.warmth = (hasFireplace ? 0.4 : 0) + (hasWood ? 0.3 : 0) + 0.3 // Base warmth

        // Texture from layered elements
        let hasBookshelf = roomData.hasBookshelf
        signals.texture = (hasBookshelf ? 0.4 : 0) + (hasWood ? 0.3 : 0) + 0.3 // Base texture
    }

    /// Compute signals from captured room (RoomPlan)
    public func computeFromCapturedRoom(_ room: CapturedRoom) {
        // Natural light
        let windowArea = room.windows.reduce(0.0) { sum, window in
            sum + Double(window.dimensions.x * window.dimensions.y)
        }
        signals.naturalLight = min(1.0, Float(windowArea) / 5.0) // Normalize to 5 sq meters

        // Openness - estimate from wall count and spacing
        let wallCount = room.walls.count
        signals.openness = wallCount < 5 ? 0.7 : (wallCount < 8 ? 0.5 : 0.3)

        // Warmth - from detected objects
        let hasFireplace = room.objects.contains { $0.category == .fireplace }
        signals.warmth = hasFireplace ? 0.8 : 0.4

        // Texture - from variety of detected elements
        let objectVariety = Set(room.objects.map { $0.category }).count
        signals.texture = min(1.0, Float(objectVariety) / 5.0)
    }

    /// Apply question answers to signals
    public func applyAnswers(_ answers: [QuestionAnswer]) {
        for answer in answers {
            switch answer.questionId {
            case "time_of_day":
                signals.timeOfDay = TimePreference(rawValue: answer.value)

            case "light_preference":
                signals.lightPreference = LightStyle(rawValue: answer.value)
                // Adjust natural light signal based on preference
                if answer.value == "soft" {
                    signals.naturalLight = max(0.3, signals.naturalLight - 0.2)
                } else if answer.value == "direct" {
                    signals.naturalLight = min(1.0, signals.naturalLight + 0.2)
                }

            case "seating_preference":
                signals.seatingPreference = SeatingStyle(rawValue: answer.value)
                // Adjust warmth based on seating preference
                if answer.value == "sinking_in" {
                    signals.warmth = min(1.0, signals.warmth + 0.15)
                }

            case "room_feeling":
                signals.roomFeeling = answer.value

            default:
                break
            }
        }

        // Regenerate insights
        generateInsights()
    }

    /// Apply observation history to signals
    public func applyObservations(_ observations: [WalkObservation]) {
        for observation in observations {
            switch observation.styleSignal {
            case .naturalLight:
                signals.naturalLight = min(1.0, signals.naturalLight + observation.styleSignal.contribution)
            case .openness:
                signals.openness = min(1.0, signals.openness + observation.styleSignal.contribution)
            case .warmth:
                signals.warmth = min(1.0, signals.warmth + observation.styleSignal.contribution)
            case .texture:
                signals.texture = min(1.0, signals.texture + observation.styleSignal.contribution)
            }
        }

        // Regenerate insights
        generateInsights()
    }

    // MARK: - Behavior Tracking

    /// Record user starting to linger at a position
    public func startLinger(at position: CGPoint) {
        lingerStartTime = Date()
        lingerPosition = position
    }

    /// Record user stopping linger
    public func endLinger() {
        if let start = lingerStartTime, let position = lingerPosition {
            let duration = Date().timeIntervalSince(start)
            if duration >= 2.0 { // Significant linger
                signals.lingerSpots.append(position)
            }
        }
        lingerStartTime = nil
        lingerPosition = nil
    }

    /// Update position for pace calculation
    public func updatePosition(_ position: CGPoint) {
        if scanStartTime == nil {
            scanStartTime = Date()
        }

        if let last = lastPosition {
            let distance = hypot(position.x - last.x, position.y - last.y)
            totalDistance += distance
            positionSamples += 1
        }

        lastPosition = position
    }

    /// Finalize scan pace calculation
    public func finalizePace() {
        guard let start = scanStartTime else {
            signals.scanPace = .medium
            return
        }

        let duration = Date().timeIntervalSince(start)
        let averageSpeed = totalDistance / CGFloat(max(1, positionSamples))

        // Categorize pace based on average movement speed
        if averageSpeed < 0.5 {
            signals.scanPace = .slow
        } else if averageSpeed > 1.5 {
            signals.scanPace = .fast
        } else {
            signals.scanPace = .medium
        }
    }

    // MARK: - Insight Generation

    /// Generate insight phrases from current signals
    public func generateInsights() {
        insights = signals.insightPhrases
    }

    /// Get the final computed signals
    public func finalizeSignals() -> FirstWalkStyleSignals {
        finalizePace()
        generateInsights()
        return signals
    }

    // MARK: - Reset

    /// Reset for new walk
    public func reset() {
        signals = FirstWalkStyleSignals()
        insights = []
        lingerStartTime = nil
        lingerPosition = nil
        scanStartTime = nil
        lastPosition = nil
        totalDistance = 0
        positionSamples = 0
    }
}

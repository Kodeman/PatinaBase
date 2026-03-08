//
//  StyleSignals.swift
//  Patina
//
//  Style signals captured during the first walk.
//  Computed from room features, user responses, and behavioral data.
//

import Foundation
import CoreGraphics

/// Style signals captured during the first walk
public struct FirstWalkStyleSignals: Codable {

    // MARK: - Room Feature Signals (0.0 - 1.0)

    /// How much natural light the room has (from window detection)
    public var naturalLight: Float = 0.5

    /// How open/spacious the room feels (from volume/layout)
    public var openness: Float = 0.5

    /// Warmth of materials detected (wood, textiles)
    public var warmth: Float = 0.5

    /// Texture complexity (layered vs minimal)
    public var texture: Float = 0.5

    // MARK: - User Responses

    /// Preferred time of day to use the room
    public var timeOfDay: TimePreference?

    /// Preferred light style
    public var lightPreference: LightStyle?

    /// Preferred seating style
    public var seatingPreference: SeatingStyle?

    /// Free-form room feeling word from user
    public var roomFeeling: String?

    // MARK: - Behavioral Signals

    /// Points where user lingered during scan
    public var lingerSpots: [CGPoint] = []

    /// How fast the user scanned (affects recommendations)
    public var scanPace: ScanPace = .medium

    // MARK: - Initialization

    public init() {}

    // MARK: - Computed Properties

    /// Generate insight phrases for Walk Complete screen
    public var insightPhrases: [String] {
        var phrases: [String] = []

        if naturalLight > 0.6 {
            phrases.append("You value natural light.")
        }

        if openness > 0.6 {
            phrases.append("You like room to breathe.")
        }

        if warmth > 0.6 {
            phrases.append("Warmth matters to you.")
        }

        if texture > 0.6 {
            phrases.append("You notice texture.")
        }

        if openness < 0.4 {
            phrases.append("You appreciate intimate spaces.")
        }

        if texture < 0.4 {
            phrases.append("You prefer things pared down.")
        }

        // Add at least one insight
        if phrases.isEmpty {
            phrases.append("You have a thoughtful eye.")
        }

        // Limit to 4 insights
        return Array(phrases.prefix(4))
    }
}

// MARK: - Supporting Types

/// User's preferred time of day for the room
public enum TimePreference: String, Codable {
    case mornings
    case evenings
    case both
}

/// User's preferred light style
public enum LightStyle: String, Codable {
    case soft
    case direct
    case dependsOnMood = "depends"
}

/// User's preferred seating style
public enum SeatingStyle: String, Codable {
    case sittingUp = "sitting_up"
    case sinkingIn = "sinking_in"
}

/// Scan pace during walk
public enum ScanPace: String, Codable {
    case slow
    case medium
    case fast
}

// MARK: - Debug Description

extension FirstWalkStyleSignals: CustomStringConvertible {
    public var description: String {
        var parts: [String] = [
            "light: \(String(format: "%.1f", naturalLight))",
            "open: \(String(format: "%.1f", openness))",
            "warm: \(String(format: "%.1f", warmth))",
            "texture: \(String(format: "%.1f", texture))"
        ]

        if let time = timeOfDay {
            parts.append("time: \(time.rawValue)")
        }

        if let light = lightPreference {
            parts.append("light: \(light.rawValue)")
        }

        if let seating = seatingPreference {
            parts.append("seat: \(seating.rawValue)")
        }

        if let feeling = roomFeeling {
            parts.append("feeling: \"\(feeling)\"")
        }

        return "StyleSignals(\(parts.joined(separator: ", ")))"
    }
}

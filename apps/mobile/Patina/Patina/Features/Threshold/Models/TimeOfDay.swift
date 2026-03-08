//
//  TimeOfDay.swift
//  Patina
//
//  Time of day model for atmospheric lighting and Hero Frame color grading
//

import SwiftUI

/// Time of day for atmospheric lighting and Hero Frame color grading
public enum TimeOfDay: String, Codable, CaseIterable {
    case dawn       // 5:00 - 6:59
    case morning    // 7:00 - 10:59
    case day        // 11:00 - 13:59
    case afternoon  // 14:00 - 17:59
    case evening    // 18:00 - 20:59
    case night      // 21:00 - 4:59

    // MARK: - Greeting

    /// Greeting text for the time of day
    public var greeting: String {
        switch self {
        case .dawn:
            return "Early morning."
        case .morning:
            return "Good morning."
        case .day:
            return "Good day."
        case .afternoon:
            return "Good afternoon."
        case .evening:
            return "Good evening."
        case .night:
            return "Good night."
        }
    }

    // MARK: - Threshold Background Gradients

    /// Background gradient colors for Threshold view
    public var gradientColors: [Color] {
        switch self {
        case .dawn:
            return [
                Color(hex: "FFE4D6"), // Soft peach
                Color(hex: "FFB5A7"), // Warm pink
                Color(hex: "F8E0D0")  // Pale cream
            ]
        case .morning:
            return [
                Color(hex: "FFF5E6"), // Warm cream
                Color(hex: "FFE8D0"), // Light peach
                Color(hex: "F5E6D3")  // Soft beige
            ]
        case .day:
            return [
                Color(hex: "F5F2ED"), // Warm white
                Color(hex: "E8E2D9"), // Soft beige
                Color(hex: "DED6CC")  // Light taupe
            ]
        case .afternoon:
            return [
                Color(hex: "F8F2E8"), // Cream
                Color(hex: "E8DFD0"), // Warm beige
                Color(hex: "D8CCBB")  // Golden taupe
            ]
        case .evening:
            return [
                Color(hex: "C9A99B"), // Dusty rose
                Color(hex: "A3927C"), // Clay beige
                Color(hex: "7D6E63")  // Warm brown
            ]
        case .night:
            return [
                Color(hex: "3F3B37"), // Charcoal
                Color(hex: "2A2725"), // Deep brown
                Color(hex: "1A1816")  // Near black
            ]
        }
    }

    // MARK: - Hero Frame Overlay Gradients

    /// Overlay gradient for Hero Frame photo
    public var overlayGradient: LinearGradient {
        switch self {
        case .dawn:
            return LinearGradient(
                colors: [
                    Color(hex: "FFB48C").opacity(0.18),
                    Color(hex: "FFA064").opacity(0.08),
                    Color.clear
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        case .morning:
            return LinearGradient(
                colors: [
                    Color(hex: "FFD2A0").opacity(0.15),
                    Color(hex: "FFC382").opacity(0.06),
                    Color.clear
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        case .day:
            // Neutral - no overlay
            return LinearGradient(
                colors: [Color.clear],
                startPoint: .top,
                endPoint: .bottom
            )
        case .afternoon:
            return LinearGradient(
                colors: [
                    Color(hex: "FFF5DC").opacity(0.08),
                    Color.clear,
                    Color(hex: "C8B496").opacity(0.06)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        case .evening:
            return LinearGradient(
                colors: [
                    Color(hex: "503C2D").opacity(0.25),
                    Color(hex: "32261E").opacity(0.40)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        case .night:
            return LinearGradient(
                colors: [
                    Color(hex: "191614").opacity(0.45),
                    Color(hex: "0F0C0A").opacity(0.55)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        }
    }

    // MARK: - Color Temperature

    /// Color temperature adjustment in Kelvin (relative to neutral)
    /// Positive = warmer (golden), Negative = cooler (blue)
    public var colorTemperature: Float {
        switch self {
        case .dawn:      return 800   // Peachy gold
        case .morning:   return 400   // Golden
        case .day:       return 0     // Neutral
        case .afternoon: return 200   // Warm
        case .evening:   return 600   // Amber
        case .night:     return -200  // Cool
        }
    }

    /// Brightness adjustment (-1 to 1, 0 = no change)
    public var brightnessAdjustment: Float {
        switch self {
        case .dawn:      return 0
        case .morning:   return 0
        case .day:       return 0
        case .afternoon: return 0
        case .evening:   return -0.15
        case .night:     return -0.30
        }
    }

    // MARK: - Text Styling

    /// Text color for the time of day (dark on light backgrounds, light on dark backgrounds)
    public var textColor: Color {
        switch self {
        case .dawn:
            return Color(hex: "4A3830").opacity(0.90) // Warm dark brown
        case .morning:
            return Color(hex: "3D332B").opacity(0.88) // Soft dark brown
        case .day:
            return Color(hex: "2E2622").opacity(0.85) // Charcoal brown
        case .afternoon:
            return Color(hex: "3A302A").opacity(0.88) // Warm charcoal
        case .evening:
            return Color.white.opacity(0.90)
        case .night:
            return Color.white.opacity(0.85)
        }
    }

    /// Whether to use glass morphism styling for UI elements
    public var usesGlassMorphism: Bool {
        switch self {
        case .dawn, .morning, .day, .afternoon:
            return false
        case .evening, .night:
            return true
        }
    }

    // MARK: - Current Time

    /// Current time of day based on system time
    public static var current: TimeOfDay {
        let hour = Calendar.current.component(.hour, from: Date())

        switch hour {
        case 5..<7:   return .dawn
        case 7..<11:  return .morning
        case 11..<14: return .day
        case 14..<18: return .afternoon
        case 18..<21: return .evening
        default:      return .night
        }
    }

    // MARK: - Transitions

    /// Duration for transitioning between time states
    public static let transitionDuration: Double = 0.8

    /// Next time period in the cycle
    public var next: TimeOfDay {
        switch self {
        case .dawn:      return .morning
        case .morning:   return .day
        case .day:       return .afternoon
        case .afternoon: return .evening
        case .evening:   return .night
        case .night:     return .dawn
        }
    }
}

//
//  PatinaGradients.swift
//  Patina
//
//  Patina Design System - Gradient Fills
//  Used as placeholder image fills throughout the app
//

import SwiftUI

/// Patina Design System - Gradient Fills for placeholder images
public enum PatinaGradients {

    public static let warm = LinearGradient(
        colors: [PatinaColors.softCream, PatinaColors.clay],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let dusk = LinearGradient(
        colors: [PatinaColors.dustyBlue, PatinaColors.mocha],
        startPoint: .top, endPoint: .bottom
    )

    public static let earth = LinearGradient(
        colors: [PatinaColors.agedOak, PatinaColors.clay],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let sageGradient = LinearGradient(
        colors: [PatinaColors.sage, PatinaColors.pearl],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let leather = LinearGradient(
        colors: [Color(hex: "8B6F47"), Color(hex: "A3927C")],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let linen = LinearGradient(
        colors: [Color(hex: "D4CFC7"), Color(hex: "E5E2DD")],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let stone = LinearGradient(
        colors: [Color(hex: "9E9689"), Color(hex: "B8B0A5")],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let wood = LinearGradient(
        colors: [Color(hex: "6B5B4E"), Color(hex: "8B7355")],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let metal = LinearGradient(
        colors: [Color(hex: "7A7B80"), Color(hex: "A8A9AD")],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let rattan = LinearGradient(
        colors: [Color(hex: "B8A080"), Color(hex: "D4C4A8")],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    /// Daily Room hero — warm clay → aged oak → mocha
    public static let hero = LinearGradient(
        colors: [Color(hex: "B8A080"), Color(hex: "8B7355"), Color(hex: "5C4A3C")],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    /// Daily Room hero alt — sage → dustyBlue → mocha
    public static let hero2 = LinearGradient(
        colors: [PatinaColors.sage, PatinaColors.dustyBlue, PatinaColors.mocha],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    /// Walnut — alias of `wood`
    public static let walnut = LinearGradient(
        colors: [Color(hex: "6B5B4E"), Color(hex: "8B7355")],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    /// Cherry — warm reddish brown
    public static let cherry = LinearGradient(
        colors: [Color(hex: "8B5A3C"), Color(hex: "B8775C")],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let sunrise = LinearGradient(
        colors: [PatinaColors.offWhite, PatinaColors.goldenHour, PatinaColors.clay],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    /// Companion dock zone — fades content into background near the button
    public static func companionDock(warmTint: Color = PatinaColors.softCream) -> LinearGradient {
        LinearGradient(
            stops: [
                .init(color: warmTint.opacity(0),    location: 0.0),
                .init(color: warmTint.opacity(0.15), location: 0.25),
                .init(color: warmTint.opacity(0.50), location: 0.55),
                .init(color: warmTint.opacity(0.85), location: 0.80),
                .init(color: warmTint.opacity(1.0),  location: 1.0),
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    /// Map a server-supplied gradient key (e.g. `"hero"`, `"walnut"`) to one
    /// of our static gradients. Returns `nil` when the key is unknown so the
    /// caller can choose a default.
    public static func gradient(forKey key: String?) -> LinearGradient? {
        guard let key = key?.lowercased() else { return nil }
        switch key {
        case "warm":     return warm
        case "dusk":     return dusk
        case "earth":    return earth
        case "sage":     return sageGradient
        case "leather":  return leather
        case "linen":    return linen
        case "stone":    return stone
        case "wood":     return wood
        case "metal":    return metal
        case "rattan":   return rattan
        case "hero":     return hero
        case "hero2":    return hero2
        case "walnut":   return walnut
        case "cherry":   return cherry
        case "sunrise":  return sunrise
        default:         return nil
        }
    }
}

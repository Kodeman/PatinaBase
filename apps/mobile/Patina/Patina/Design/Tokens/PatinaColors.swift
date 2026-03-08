//
//  PatinaColors.swift
//  Patina
//
//  Patina Design System - Color Tokens
//  Brand: "Where Time Adds Value"
//

import SwiftUI

/// Patina Design System - Color Tokens
public enum PatinaColors {

    // MARK: - Core Palette

    /// Primary background - warm, inviting canvas
    public static let offWhite = Color(hex: "EDE9E4")

    /// Interactive elements, accents
    public static let clayBeige = Color(hex: "A3927C")

    /// Headlines, emphasis
    public static let mochaBrown = Color(hex: "655B52")

    /// Primary text, dark backgrounds
    public static let charcoal = Color(hex: "3F3B37")

    // MARK: - Extended Palette

    /// Card backgrounds, subtle surfaces
    public static let softCream = Color(hex: "F5F2ED")

    /// Hero sections, special backgrounds
    public static let warmWhite = Color(hex: "FAF7F2")

    // MARK: - Semantic Colors

    public enum Background {
        public static let primary = offWhite
        public static let secondary = softCream
        public static let tertiary = warmWhite
        public static let dark = charcoal
    }

    public enum Text {
        public static let primary = charcoal
        public static let secondary = mochaBrown
        public static let muted = clayBeige
        public static let inverse = offWhite
    }

    public enum Interactive {
        public static let `default` = clayBeige
        public static let hover = mochaBrown
        public static let active = charcoal
    }

    // MARK: - Strata Mark Colors

    public enum Strata {
        public static let line1 = mochaBrown
        public static let line2 = clayBeige
        public static let line3 = clayBeige.opacity(0.5)
    }
}

// MARK: - Color Extension for Hex Values

extension Color {
    /// Initialize with hex string
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 128, 128, 128)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

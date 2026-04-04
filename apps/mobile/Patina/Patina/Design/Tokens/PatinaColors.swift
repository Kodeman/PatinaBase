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
    public static let offWhite = Color(hex: "FAF7F2")

    /// Interactive elements, accents — warm clay gold
    public static let clay = Color(hex: "C4A57B")

    /// Muted text, metadata, secondary interactive
    public static let agedOak = Color(hex: "8B7355")

    /// Headlines, emphasis — rich brown
    public static let mocha = Color(hex: "5C4A3C")

    /// Primary text, dark backgrounds
    public static let charcoal = Color(hex: "2C2926")

    // MARK: - Extended Palette

    /// Card backgrounds, subtle surfaces
    public static let softCream = Color(hex: "F5F2ED")

    /// Hero sections, special backgrounds
    public static let warmWhite = Color(hex: "FAF7F2")

    /// Borders, dividers, inactive states
    public static let pearl = Color(hex: "E5E2DD")

    /// Extended — natural green
    public static let sage = Color(hex: "A8B5A0")

    /// Extended — cool accent
    public static let dustyBlue = Color(hex: "8B9CAD")

    /// Extended — warm accent
    public static let terracotta = Color(hex: "D4A090")

    /// AR light slider, highlights
    public static let goldenHour = Color(hex: "E8C547")

    // MARK: - Status Colors

    /// Success, match badges
    public static let success = Color(hex: "7A9B76")

    /// Warning states
    public static let warning = Color(hex: "D4A574")

    /// Error states
    public static let error = Color(hex: "C77B6E")

    // MARK: - Semantic Colors

    public enum Background {
        public static let primary = offWhite
        public static let secondary = softCream
        public static let tertiary = warmWhite
        public static let dark = charcoal
    }

    public enum Text {
        public static let primary = charcoal
        public static let secondary = mocha
        public static let muted = agedOak
        public static let inverse = offWhite
    }

    public enum Interactive {
        public static let `default` = clay
        public static let hover = agedOak
        public static let active = charcoal
    }

    // MARK: - Strata Mark Colors

    public enum Strata {
        public static let line1 = mocha
        public static let line2 = clay
        public static let line3 = clay.opacity(0.5)
    }

    // MARK: - Deprecated (use new names)

    @available(*, deprecated, renamed: "clay")
    public static let clayBeige = clay

    @available(*, deprecated, renamed: "mocha")
    public static let mochaBrown = mocha
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

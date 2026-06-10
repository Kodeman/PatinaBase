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

    /// Deeper clay for interactive text/affordances (accessible contrast)
    public static let clayDeep = Color(hex: "9F7E48")

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

    // MARK: - Dark Mode Palette
    //
    // Warm-graphite (not pure-black) dark surfaces and warmed text so the
    // brand reads as "aged warmth in the dark" rather than a cold OLED
    // void. Light values below are byte-identical to the historical
    // hard-coded tokens; only the dark side is new (PT-5-9).

    enum DarkPalette {
        /// Primary dark canvas — warm graphite, not #000
        static let background = Color(hex: "211E1B")
        /// Card / secondary surface — one notch lighter than the canvas
        static let backgroundSecondary = Color(hex: "2C2926")
        /// Primary text on dark — warm near-white
        static let textPrimary = Color(hex: "F2EDE6")
        /// Secondary text on dark — warm light clay
        static let textSecondary = Color(hex: "D8C9B4")
        /// Muted text on dark — kept above AA against the graphite canvas
        static let textMuted = Color(hex: "B5A487")
        /// Interactive text on dark — lighter clay reads better than clayDeep
        static let textInteractive = clay
    }

    // MARK: - Semantic Colors

    public enum Background {
        /// Primary canvas — light off-white / dark warm-graphite.
        public static let primary = Color.patinaDynamic(
            light: offWhite, dark: DarkPalette.background
        )
        /// Secondary surface (cards) — light soft-cream / dark warm-graphite.
        public static let secondary = Color.patinaDynamic(
            light: softCream, dark: DarkPalette.backgroundSecondary
        )
        /// Hero sections, special backgrounds — tracks the primary canvas in dark.
        public static let tertiary = Color.patinaDynamic(
            light: warmWhite, dark: DarkPalette.background
        )
        /// Deliberately dark surface (camera chrome, immersive overlays) — static by design.
        public static let dark = charcoal
    }

    public enum Text {
        public static let primary = Color.patinaDynamic(
            light: charcoal, dark: DarkPalette.textPrimary
        )
        public static let secondary = Color.patinaDynamic(
            light: mocha, dark: DarkPalette.textSecondary
        )
        public static let muted = Color.patinaDynamic(
            light: agedOak, dark: DarkPalette.textMuted
        )
        /// Text on inverted surfaces (e.g. charcoal buttons in light mode,
        /// light buttons in dark mode) — pairs with `Interactive.active`.
        public static let inverse = Color.patinaDynamic(
            light: offWhite, dark: DarkPalette.background
        )
        public static let interactive = Color.patinaDynamic(
            light: clayDeep, dark: DarkPalette.textInteractive
        )
    }

    public enum Interactive {
        /// Brand accent — clay reads correctly on both schemes.
        public static let `default` = clay
        public static let hover = Color.patinaDynamic(
            light: agedOak, dark: DarkPalette.textMuted
        )
        /// Filled control surface — pair its label with `Text.inverse`.
        public static let active = Color.patinaDynamic(
            light: charcoal, dark: DarkPalette.textPrimary
        )
    }

    // MARK: - Strata Mark Colors

    public enum Strata {
        public static let line1 = Color.patinaDynamic(
            light: mocha, dark: DarkPalette.textSecondary
        )
        public static let line2 = clay
        public static let line3 = clay.opacity(0.5)
    }
}

// MARK: - Dynamic (light / dark) Color Resolution

extension Color {
    /// Build a color that resolves to `light` in light mode and `dark` in
    /// dark mode, by bridging through `UIColor`'s trait-aware provider.
    /// Used by the semantic tokens so the brand adapts to system dark mode
    /// without every call site branching on the color scheme (PT-5-9).
    static func patinaDynamic(light: Color, dark: Color) -> Color {
        Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(dark)
                : UIColor(light)
        })
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

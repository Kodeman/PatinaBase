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

    /// Clay dark enough to be read, not merely seen: interactive labels, and
    /// any filled surface that carries a light label. `clayDeep` is 3.54:1 on
    /// the light canvas and `clay` is 2.18:1, so neither can hold text (A-73).
    public static let clayInk = Color(hex: "82612F")

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

    /// Error dark enough to carry a light label — `error` is 3.03:1 under
    /// `offWhite`, so the destructive button failed AA at every size (A-73).
    public static let errorDeep = Color(hex: "9C4C3F")

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
        /// A deliberately dark object sitting ON the page — the Companion orb
        /// and panel, the added-to-room toast, the budget bars, the
        /// consultation hero. Charcoal is 1.15:1 against this canvas, so in
        /// dark mode those objects had no body at all (C-01); two notches
        /// lighter gives them one without touching their light-mode look.
        static let surfaceDark = Color(hex: "524B44")
        /// Primary text on dark — warm near-white
        static let textPrimary = Color(hex: "F2EDE6")
        /// Secondary text on dark — warm light clay.
        /// C-20: raised from #D8C9B4. The old value computed 8.91:1 on the
        /// card and *rendered* at 4.27:1, because a 14 pt stroke antialiases
        /// to roughly half the distance from ground to ink. The bar is the
        /// headroom, not the arithmetic.
        static let textSecondary = Color(hex: "DFD2C0")
        /// Muted text on dark. C-20: raised from #B5A487, which rendered at
        /// 2.66:1 on the Today card's 10 pt mono meta.
        static let textMuted = Color(hex: "C7B99F")
        /// Interactive text on dark — lighter clay reads better than clayInk
        static let textInteractive = clay
        /// Error ink on dark. `errorDeep` is the light side's answer and is
        /// 2.78:1 on the dark canvas — darkening for one appearance blinds the
        /// other. This is `error` lifted until it clears the body bar on the
        /// card (5.53:1), which is where "Overdue" and every sheet's
        /// validation line actually sit.
        static let textError = Color(hex: "DE8A7B")
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
        /// A deliberately dark object drawn on the page — the Companion orb and
        /// panel, the toast, the budget bars, the consultation hero. Adaptive,
        /// not static: charcoal on the dark canvas is 1.15:1 and the object
        /// disappears (C-01). Its ink is `OnDark.*`, which does not flip.
        public static let dark = Color.patinaDynamic(
            light: charcoal, dark: DarkPalette.surfaceDark
        )
    }

    /// Ink for a surface that is dark in **both** appearances.
    ///
    /// `Text.*` flips with the system appearance, which is right on the page
    /// and wrong on a fixed dark panel: `Text.inverse` resolves to #211E1B in
    /// dark, and the Companion's status line — `Text.inverse.opacity(0.72)`
    /// over the panel — composited to 1.11:1 and vanished, while the title
    /// beside it stayed white because it used a static value (C-02).
    /// These are that static value, named.
    public enum OnDark {
        public static let primary = offWhite
        public static let secondary = Color(hex: "D8D2C8")
        public static let muted = Color(hex: "B7AE9F")
    }

    /// Opaque grounds that guarantee a contrast ratio regardless of what is
    /// behind them.
    public enum Scrim {
        /// The ground under chrome drawn over an image. `.ultraThinMaterial`
        /// over a light tile inverts to a light-on-light wash — the heart and
        /// ⋯ measured 2.01:1 and the match pill 1.86:1 over a blank cream tile
        /// (C-27). An opaque scrim makes the ratio independent of the photo.
        public static let chrome = Color(hex: "332F2B")
    }

    /// Rules and dividers.
    ///
    /// C3-01: `pearl` is a flat sRGB literal used 93× as the app's border
    /// colour. On the light canvas it is the 1.21:1 whisper it was drawn to
    /// be; on the dark canvas it is 12.84:1, so every card border, list
    /// separator, chip outline and field stroke was the brightest thing on the
    /// screen. `pearl` itself stays — 13 of its call sites use it as light ink
    /// on a permanently dark surface, and flipping the literal would blank
    /// them — and these are what a border reaches for instead.
    public enum Border {
        /// The whisper: card edges, list separators, the tab bar's top rule.
        public static let hairline = Color.patinaDynamic(
            light: pearl, dark: Color(hex: "322E29")
        )
        /// The rule a tester is meant to see: field outlines, selected edges.
        public static let strong = Color.patinaDynamic(
            light: Color(hex: "C8C3BB"), dark: Color(hex: "524C45")
        )
        /// A hairline on a `Background.dark` object, where the page behind is
        /// the thing it has to separate from.
        public static let onDark = Color(hex: "756B61")
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
        /// A-73: the light side was `clayDeep` at 3.54:1 — sub-AA for a label
        /// a tester is meant to tap. `clayDeep` itself is untouched; its three
        /// remaining call sites read it directly and a darker value would cost
        /// one of them its dark-mode contrast.
        public static let interactive = Color.patinaDynamic(
            light: clayInk, dark: DarkPalette.textInteractive
        )
        /// `A-73`. The status colour `error` is ink at fifteen sites —
        /// "Overdue" on the Today Record card, the past-due line on invoices,
        /// decisions and proposals, and every sheet's validation message — and
        /// it computes **3.03:1** on the light canvas, below AA for prose a
        /// tester has to read. `error` itself is untouched: it stays the
        /// non-text value for the error border and the 10 %-opacity washes,
        /// which take the 3:1 bar and pass it.
        public static let error = Color.patinaDynamic(
            light: errorDeep, dark: DarkPalette.textError
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

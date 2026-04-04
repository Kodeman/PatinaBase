//
//  PatinaTypography.swift
//  Patina
//
//  Patina Design System - Typography
//

import SwiftUI

/// Patina Design System - Typography
public enum PatinaTypography {

    // MARK: - Font Names

    private static let displayFont = "PlayfairDisplay"
    private static let bodyFont = "Inter"
    private static let monoFont = "DMMono"

    // MARK: - Display Styles (Playfair Display)

    public static let display1 = Font.custom(displayFont + "-Medium", size: 56, relativeTo: .largeTitle)

    public static let display2 = Font.custom(displayFont + "-Medium", size: 40, relativeTo: .largeTitle)

    public static let displaySmall = Font.custom(displayFont + "-Medium", size: 28, relativeTo: .title2)

    public static let h1 = Font.custom(displayFont + "-Medium", size: 32, relativeTo: .title)

    public static let h2 = Font.custom(displayFont + "-Regular", size: 26, relativeTo: .title2)

    public static let h3 = Font.custom(displayFont + "-Regular", size: 24, relativeTo: .title2)

    public static let h4 = Font.custom(displayFont + "-Regular", size: 22, relativeTo: .title3)

    public static let h5 = Font.custom(displayFont + "-Medium", size: 18, relativeTo: .title3)

    // MARK: - Headlines

    public static let headlineSerif = Font.custom(displayFont + "-Medium", size: 24, relativeTo: .headline)

    public static let headlineMedium = Font.custom(bodyFont + "-SemiBold", size: 18, relativeTo: .headline)

    // MARK: - Body Styles (Inter)

    public static let bodyLarge = Font.custom(bodyFont + "-Regular", size: 18, relativeTo: .body)

    public static let body = Font.custom(bodyFont + "-Regular", size: 16, relativeTo: .body)

    public static let bodyMedium = Font.custom(bodyFont + "-Medium", size: 16, relativeTo: .body)

    public static let bodySmall = Font.custom(bodyFont + "-Regular", size: 14, relativeTo: .subheadline)

    public static let bodySmallMedium = Font.custom(bodyFont + "-Medium", size: 14, relativeTo: .subheadline)

    public static let caption = Font.custom(bodyFont + "-Medium", size: 12, relativeTo: .caption)

    public static let captionMedium = Font.custom(bodyFont + "-SemiBold", size: 12, relativeTo: .caption)

    // MARK: - Mono Styles (DM Mono) — Metadata, Labels, Tags

    /// Standard metadata — 10px, categories, tags
    public static let mono = Font.custom(monoFont + "-Regular", size: 10, relativeTo: .caption2)

    /// Small metadata — 9px, timestamps, match percentages
    public static let monoSmall = Font.custom(monoFont + "-Regular", size: 9, relativeTo: .caption2)

    /// Tiny metadata — 8px, stat labels, step indicators
    public static let monoTiny = Font.custom(monoFont + "-Regular", size: 8, relativeTo: .caption2)

    /// Medium weight mono — 10px, section titles in settings
    public static let monoMedium = Font.custom(monoFont + "-Medium", size: 10, relativeTo: .caption2)

    // MARK: - Special Styles

    /// Uppercase tracking for labels
    public static let eyebrow = Font.custom(bodyFont + "-SemiBold", size: 12, relativeTo: .caption)

    /// Italic for Patina's voice — coaching text, quotes
    public static let patinaVoice = Font.custom(displayFont + "-Italic", size: 18, relativeTo: .body)

    /// Large italic — scan coaching text
    public static let patinaVoiceLarge = Font.custom(displayFont + "-Italic", size: 22, relativeTo: .title3)

    /// Wordmark style — splash screen
    public static let wordmark = Font.custom(displayFont + "-Medium", size: 38, relativeTo: .largeTitle)

    /// Auth logo
    public static let authLogo = Font.custom(displayFont + "-Medium", size: 32, relativeTo: .title)

    /// UI action labels
    public static let uiAction = Font.custom(bodyFont + "-Medium", size: 15, relativeTo: .body)

    /// Small UI labels
    public static let uiSmall = Font.custom(bodyFont + "-Medium", size: 13, relativeTo: .footnote)
}

// MARK: - View Modifiers

extension View {
    /// Apply Patina display style
    public func patinaDisplay(_ style: Font = PatinaTypography.display1) -> some View {
        self
            .font(style)
            .foregroundColor(PatinaColors.Text.primary)
    }

    /// Apply Patina body style
    public func patinaBody(_ style: Font = PatinaTypography.body) -> some View {
        self
            .font(style)
            .foregroundColor(PatinaColors.Text.secondary)
    }

    /// Apply eyebrow style (uppercase, tracked)
    public func patinaEyebrow() -> some View {
        self
            .font(PatinaTypography.eyebrow)
            .foregroundColor(PatinaColors.Text.muted)
            .textCase(.uppercase)
            .tracking(1.5)
    }

    /// Apply mono metadata style (DM Mono, uppercase, tracked)
    public func patinaMono(_ size: Font = PatinaTypography.mono) -> some View {
        self
            .font(size)
            .foregroundColor(PatinaColors.agedOak)
            .textCase(.uppercase)
            .tracking(0.5)
    }
}

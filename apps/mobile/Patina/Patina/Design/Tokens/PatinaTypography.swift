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

    // MARK: - Display Styles (Playfair Display)

    public static let display1 = Font.custom(displayFont + "-Medium", size: 56, relativeTo: .largeTitle)

    public static let display2 = Font.custom(displayFont + "-Medium", size: 40, relativeTo: .largeTitle)

    public static let displaySmall = Font.custom(displayFont + "-Medium", size: 28, relativeTo: .title2)

    public static let h1 = Font.custom(displayFont + "-Medium", size: 32, relativeTo: .title)

    public static let h2 = Font.custom(displayFont + "-Medium", size: 24, relativeTo: .title2)

    public static let h3 = Font.custom(displayFont + "-Medium", size: 20, relativeTo: .title3)

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

    // MARK: - Special Styles

    /// Uppercase tracking for labels
    public static let eyebrow = Font.custom(bodyFont + "-SemiBold", size: 12, relativeTo: .caption)

    /// Italic for Patina's voice
    public static let patinaVoice = Font.custom(displayFont + "-Italic", size: 18, relativeTo: .body)

    /// Wordmark style
    public static let wordmark = Font.custom(displayFont + "-Medium", size: 18, relativeTo: .headline)
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
}

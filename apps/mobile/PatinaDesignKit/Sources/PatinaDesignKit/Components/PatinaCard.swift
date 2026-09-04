//
//  PatinaCard.swift
//  Patina
//
//  Patina Design System - Card surface container (PT-5-1)
//

import SwiftUI

/// Surface styles available for `PatinaCard`.
public enum PatinaCardStyle {
    /// Soft cream fill — the default resting surface.
    case surface
    /// Off-white fill with a lift shadow — for content that floats.
    case elevated
    /// Transparent fill with a hairline border.
    case outline
}

/// Patina Design System - Card container wrapping content in a tokenized,
/// rounded surface.
public struct PatinaCard<Content: View>: View {
    let style: PatinaCardStyle
    @ViewBuilder let content: Content

    public init(style: PatinaCardStyle = .surface, @ViewBuilder content: () -> Content) {
        self.style = style
        self.content = content()
    }

    public var body: some View {
        content
            .padding(PatinaSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(backgroundColor)
            .clipShape(.rect(cornerRadius: PatinaRadius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: PatinaRadius.lg, style: .continuous)
                    .stroke(borderColor, lineWidth: style == .outline ? 1 : 0)
            )
            .modifier(CardShadow(style: style))
    }

    private var backgroundColor: Color {
        switch style {
        case .surface:
            return PatinaColors.Background.secondary
        case .elevated:
            return PatinaColors.Background.primary
        case .outline:
            return .clear
        }
    }

    private var borderColor: Color {
        switch style {
        case .outline:
            return PatinaColors.Border.hairline
        default:
            return .clear
        }
    }
}

/// Applies the elevation shadow only for the `.elevated` style.
private struct CardShadow: ViewModifier {
    let style: PatinaCardStyle

    func body(content: Content) -> some View {
        if style == .elevated {
            content.patinaShadow(PatinaShadows.md)
        } else {
            content
        }
    }
}

#Preview {
    VStack(spacing: PatinaSpacing.lg) {
        PatinaCard(style: .surface) {
            Text("Surface card")
                .font(PatinaTypography.bodyMedium)
                .foregroundStyle(PatinaColors.Text.primary)
        }

        PatinaCard(style: .elevated) {
            VStack(alignment: .leading, spacing: PatinaSpacing.xs) {
                Text("Elevated card")
                    .font(PatinaTypography.h5)
                    .foregroundStyle(PatinaColors.Text.primary)
                Text("Floats above the canvas with a soft lift.")
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
        }

        PatinaCard(style: .outline) {
            Text("Outline card")
                .font(PatinaTypography.bodyMedium)
                .foregroundStyle(PatinaColors.Text.primary)
        }
    }
    .padding(PatinaSpacing.xl)
    .background(PatinaColors.Background.primary)
}

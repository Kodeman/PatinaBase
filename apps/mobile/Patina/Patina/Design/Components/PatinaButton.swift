//
//  PatinaButton.swift
//  Patina
//
//  Patina Design System - Button Components
//

import SwiftUI

/// Button styles available in Patina
public enum PatinaButtonStyle {
    case primary
    case secondary
    case ghost
}

/// Patina Design System - Custom Button
public struct PatinaButton: View {
    let title: String
    let style: PatinaButtonStyle
    let action: () -> Void

    @State private var isPressed = false

    public init(
        _ title: String,
        style: PatinaButtonStyle = .primary,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.style = style
        self.action = action
    }

    public var body: some View {
        Button(action: {
            HapticManager.shared.impact(.light)
            action()
        }) {
            Text(title)
                .font(PatinaTypography.bodyMedium)
                .foregroundColor(foregroundColor)
                .padding(.horizontal, PatinaSpacing.lg)
                .padding(.vertical, PatinaSpacing.md)
                .frame(maxWidth: style == .ghost ? nil : .infinity)
                .background(backgroundColor)
                .cornerRadius(PatinaRadius.lg)
                .overlay(
                    RoundedRectangle(cornerRadius: PatinaRadius.lg)
                        .stroke(borderColor, lineWidth: style == .secondary ? 1.5 : 0)
                )
        }
        .buttonStyle(PressableButtonStyle())
    }

    private var foregroundColor: Color {
        switch style {
        case .primary:
            return PatinaColors.Text.inverse
        case .secondary:
            return PatinaColors.Text.primary
        case .ghost:
            return PatinaColors.Text.secondary
        }
    }

    private var backgroundColor: Color {
        switch style {
        case .primary:
            return PatinaColors.Interactive.active
        case .secondary:
            return .clear
        case .ghost:
            return .clear
        }
    }

    private var borderColor: Color {
        switch style {
        case .primary:
            return .clear
        case .secondary:
            return PatinaColors.Interactive.default
        case .ghost:
            return .clear
        }
    }
}

// MARK: - Pressable Button Style

struct PressableButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .opacity(configuration.isPressed ? 0.9 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: PatinaSpacing.lg) {
        PatinaButton("Primary Button", style: .primary) {
            print("Primary tapped")
        }

        PatinaButton("Secondary Button", style: .secondary) {
            print("Secondary tapped")
        }

        PatinaButton("Ghost Button", style: .ghost) {
            print("Ghost tapped")
        }
    }
    .padding(PatinaSpacing.xl)
    .background(PatinaColors.Background.primary)
}

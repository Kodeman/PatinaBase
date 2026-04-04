//
//  PatinaButton.swift
//  Patina
//
//  Patina Design System - Button Components
//

import SwiftUI

/// Button styles available in Patina
public enum PatinaButtonStyle {
    case primary      // Charcoal bg, full-width, 52px height
    case secondary    // Pearl border, transparent bg
    case ghost        // No bg, text only
    case clay         // Clay bg, for "Done" / confirm actions
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
                .font(PatinaTypography.uiAction)
                .foregroundColor(foregroundColor)
                .frame(maxWidth: style == .ghost ? nil : .infinity)
                .frame(height: 52)
                .background(backgroundColor)
                .clipShape(Capsule())
                .overlay(
                    Capsule()
                        .stroke(borderColor, lineWidth: style == .secondary ? 1.5 : 0)
                )
        }
        .buttonStyle(PressableButtonStyle())
    }

    private var foregroundColor: Color {
        switch style {
        case .primary:
            return PatinaColors.offWhite
        case .secondary:
            return PatinaColors.charcoal
        case .ghost:
            return PatinaColors.clay
        case .clay:
            return PatinaColors.offWhite
        }
    }

    private var backgroundColor: Color {
        switch style {
        case .primary:
            return PatinaColors.charcoal
        case .secondary:
            return PatinaColors.offWhite
        case .ghost:
            return .clear
        case .clay:
            return PatinaColors.clay
        }
    }

    private var borderColor: Color {
        switch style {
        case .secondary:
            return PatinaColors.pearl
        default:
            return .clear
        }
    }
}

// MARK: - Auth Button (specific style for auth screen)

struct AuthButton: View {
    let title: String
    let icon: String?
    let style: AuthButtonVariant
    let action: () -> Void

    enum AuthButtonVariant {
        case apple, google, email
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if let icon {
                    Text(icon)
                        .font(.system(size: 16))
                }
                Text(title)
                    .font(PatinaTypography.uiAction)
            }
            .foregroundColor(style == .apple ? PatinaColors.offWhite : PatinaColors.charcoal)
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(style == .apple ? PatinaColors.charcoal : PatinaColors.offWhite)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(PatinaColors.pearl, lineWidth: style == .apple ? 0 : 1.5)
            )
        }
        .buttonStyle(PressableButtonStyle())
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
        PatinaButton("Start Your Journey", style: .primary) {}
        PatinaButton("Continue", style: .secondary) {}
        PatinaButton("Skip", style: .ghost) {}
        PatinaButton("Done", style: .clay) {}

        AuthButton(title: "Continue with Apple", icon: "", style: .apple) {}
        AuthButton(title: "Continue with Google", icon: "G", style: .google) {}
        AuthButton(title: "Continue with Email", icon: "✉", style: .email) {}
    }
    .padding(PatinaSpacing.xl)
    .background(PatinaColors.Background.primary)
}

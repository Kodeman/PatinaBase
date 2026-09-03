//
//  PatinaButton.swift
//  Patina
//
//  Patina Design System - Button Components
//

import SwiftUI

/// Button styles available in Patina
public enum PatinaButtonStyle: CaseIterable {
    case primary      // The one filled commitment style
    case secondary    // Hairline border, page-coloured fill
    case ghost        // No bg, text only
    case clay         // Kept as a name; renders `.primary` (C-41)
    case destructive  // Error-tinted bg, for irreversible actions

    /// The styles that paint a fill behind their label, and therefore owe a
    /// contrast ratio. `.ghost` has no fill and is excluded.
    public static let filledCases: [PatinaButtonStyle] = [
        .primary, .secondary, .clay, .destructive
    ]

    /// C-41: two primary treatments shipped at once — solid tan on
    /// "Sign proposal" and "Pay $4,250.00", near-white on everything else —
    /// while the same tan was the DISABLED fill on two auth buttons. There is
    /// one filled commitment style now, and `.clay` is it; the case survives
    /// so its five call sites keep compiling until their owning lanes rename
    /// them.
    public var patinaFillColor: Color {
        switch self {
        case .primary, .clay:
            return PatinaColors.Interactive.active
        case .secondary:
            return PatinaColors.Background.primary
        case .ghost:
            return .clear
        case .destructive:
            return PatinaColors.errorDeep
        }
    }

    public var patinaLabelColor: Color {
        switch self {
        case .primary, .clay:
            return PatinaColors.Text.inverse
        case .secondary:
            return PatinaColors.Text.primary
        case .ghost:
            return PatinaColors.Text.interactive
        case .destructive:
            return PatinaColors.OnDark.primary
        }
    }

    public var patinaBorderColor: Color {
        self == .secondary ? PatinaColors.Border.strong : .clear
    }
}

/// Patina Design System - Custom Button
///
/// Supports a leading `icon`, a `.isLoading` spinner state (taps are
/// suppressed while loading), and an `.isEnabled` flag that dims the
/// control and blocks the action without callers needing a separate
/// `.disabled(...)` modifier (PT-5-6).
public struct PatinaButton: View {
    let title: String
    let style: PatinaButtonStyle
    let icon: Image?
    let isLoading: Bool
    let isEnabled: Bool
    let action: () -> Void

    public init(
        _ title: String,
        style: PatinaButtonStyle = .primary,
        icon: Image? = nil,
        isLoading: Bool = false,
        isEnabled: Bool = true,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.style = style
        self.icon = icon
        self.isLoading = isLoading
        self.isEnabled = isEnabled
        self.action = action
    }

    private var isInteractive: Bool { isEnabled && !isLoading }

    public var body: some View {
        Button(action: {
            guard isInteractive else { return }
            HapticManager.shared.impact(.light)
            action()
        }) {
            HStack(spacing: PatinaSpacing.sm) {
                if isLoading {
                    ProgressView()
                        .tint(foregroundColor)
                } else {
                    if let icon {
                        icon
                            .font(PatinaTypography.uiAction)
                    }
                    Text(title)
                        .font(PatinaTypography.uiAction)
                }
            }
            .foregroundStyle(foregroundColor)
            // A-63 (L1-F's note L1F→D-1): the capsule had no horizontal padding
            // at all — its width came only from `maxWidth: .infinity`. Under
            // `.fixedSize()` (which `PatinaEmptyState` applies to every CTA)
            // that collapses to exactly the label's width, and a 26 pt corner
            // radius on a 50 pt box is a circle that cuts its own text. The
            // padding is inside the frame, so an intrinsically-sized capsule is
            // always wider than its label; an `.infinity`-width call site
            // absorbs it and is unchanged.
            .padding(.horizontal, PatinaSpacing.lg)
            .frame(maxWidth: style == .ghost ? nil : .infinity)
            .frame(height: 52)
            .background(backgroundColor)
            .clipShape(Capsule())
            // GAP1B-07 (L1-C's note D-L1C-2): `.ghost` has a clear background,
            // so its accessibility frame collapsed to the text's own bounds —
            // 17.6 pt on both decision-sheet Cancels. The hit region is the
            // 52 pt capsule for every style now, not just the filled ones.
            .contentShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(borderColor, lineWidth: style == .secondary ? 1.5 : 0)
            )
            .opacity(isEnabled ? 1.0 : 0.5)
        }
        .buttonStyle(PressableButtonStyle())
        .disabled(!isInteractive)
        .animation(.easeInOut(duration: 0.15), value: isLoading)
        .animation(.easeInOut(duration: 0.15), value: isEnabled)
    }

    private var foregroundColor: Color { style.patinaLabelColor }

    private var backgroundColor: Color { style.patinaFillColor }

    private var borderColor: Color { style.patinaBorderColor }
}

// MARK: - Auth Button (thin wrapper retained for the auth screens)
//
// Historically a bespoke component; now a thin adapter over `PatinaButton`
// so the auth surfaces (`AuthScreenView`, `AuthenticationView`) keep their
// existing call sites while sharing the design-system button (PT-5-6).
// The remaining feature-view migrations off `AuthButton` are tracked in a
// later T-DS call-site batch.

public struct AuthButton: View {
    let title: String
    let icon: String?
    let style: AuthButtonVariant
    let action: () -> Void

    public init(title: String, icon: String?, style: AuthButtonVariant, action: @escaping () -> Void) {
        self.title = title
        self.icon = icon
        self.style = style
        self.action = action
    }

    public enum AuthButtonVariant {
        case apple, google, email
    }

    private var iconImage: Image? {
        guard let icon, !icon.isEmpty else { return nil }
        return Image(systemName: icon)
    }

    public var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if let icon, !icon.isEmpty {
                    Text(icon)
                        .font(.system(size: 16))
                }
                Text(title)
                    .font(PatinaTypography.uiAction)
            }
            .foregroundStyle(style == .apple ? PatinaColors.Text.inverse : PatinaColors.Text.primary)
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(style == .apple ? PatinaColors.Interactive.active : PatinaColors.Background.primary)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(PatinaColors.Border.strong, lineWidth: style == .apple ? 0 : 1.5)
            )
        }
        .buttonStyle(PressableButtonStyle())
    }
}

// MARK: - Pressable Button Style

public struct PressableButtonStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
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
        PatinaButton("Continue", style: .secondary, icon: Image(systemName: "arrow.right")) {}
        PatinaButton("Skip", style: .ghost) {}
        PatinaButton("Done", style: .clay) {}
        PatinaButton("Delete Room", style: .destructive, icon: Image(systemName: "trash")) {}
        PatinaButton("Saving…", style: .primary, isLoading: true) {}
        PatinaButton("Unavailable", style: .primary, isEnabled: false) {}

        AuthButton(title: "Continue with Apple", icon: "", style: .apple) {}
        AuthButton(title: "Continue with Google", icon: "G", style: .google) {}
        AuthButton(title: "Continue with Email", icon: "✉", style: .email) {}
    }
    .padding(PatinaSpacing.xl)
    .background(PatinaColors.Background.primary)
}

//
//  AccessibleHitTarget.swift
//  Patina
//
//  Patina Design System - Accessibility
//
//  Enforces the 44x44pt minimum touch target (Apple HIG / WCAG 2.5.5) and
//  attaches a clean button-style accessibility element to any tappable view.
//  Additive foundation (PT-2-1) — call sites adopt it in later waves.
//

import SwiftUI

/// Minimum interactive target size per Apple HIG / WCAG 2.5.5.
private let minimumHitTarget: CGFloat = 44

/// Wraps a tappable view in a 44x44pt minimum hit target and an accessible
/// button element with a label and optional hint.
struct AccessibleHitTargetModifier: ViewModifier {
    let label: String
    let hint: String?

    func body(content: Content) -> some View {
        content
            .frame(minWidth: minimumHitTarget, minHeight: minimumHitTarget)
            .contentShape(Rectangle())
            .accessibilityElement(children: .combine)
            .accessibilityLabel(label)
            .accessibilityHint(hint ?? "")
            .accessibilityAddTraits(.isButton)
    }
}

extension View {
    /// Enforces a 44x44pt minimum hit target and exposes the view to
    /// assistive technologies as a labelled button.
    ///
    /// - Parameters:
    ///   - label: The accessibility label spoken by VoiceOver.
    ///   - hint: An optional accessibility hint describing the result of activating.
    func accessibleHitTarget(label: String, hint: String? = nil) -> some View {
        modifier(AccessibleHitTargetModifier(label: label, hint: hint))
    }
}

#Preview {
    VStack(spacing: PatinaSpacing.lg) {
        Image(systemName: "xmark")
            .font(PatinaTypography.bodyMedium)
            .foregroundStyle(PatinaColors.charcoal)
            .accessibleHitTarget(label: "Close", hint: "Dismisses this screen")

        Image(systemName: "heart")
            .font(PatinaTypography.bodyMedium)
            .foregroundStyle(PatinaColors.clay)
            .accessibleHitTarget(label: "Save to favorites")
    }
    .padding(PatinaSpacing.xl)
    .background(PatinaColors.Background.primary)
}

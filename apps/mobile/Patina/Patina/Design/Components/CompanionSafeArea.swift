//
//  CompanionSafeArea.swift
//  Patina
//
//  Patina Design System - Layout
//
//  Adds bottom padding so scrollable content clears the floating Companion
//  affordance docked at the bottom of the screen (PT-6-14). Additive
//  foundation — call sites adopt `.companionSafeArea()` in a later wave.
//

import SwiftUI

/// Spatial contract for the invisible Companion Hearth. The Hearth is a
/// reserved layout region, never a painted bar or persistent piece of chrome.
public enum CompanionHearthMetrics {
    public static let collapsedDiameter: CGFloat = 64
    public static let hintAllowance: CGFloat = 36
    public static let verticalSpacing: CGFloat = 20

    /// Content clearance above the home-indicator safe area.
    public static let reservedHeight: CGFloat =
        collapsedDiameter + hintAllowance + verticalSpacing
}

extension View {
    /// Reserves the invisible Hearth so scrollable content cannot settle under
    /// the centered Companion circle and contextual hint.
    func companionHearthReservation() -> some View {
        safeAreaPadding(.bottom, CompanionHearthMetrics.reservedHeight)
    }

    /// Source-compatible name retained for existing and in-flight call sites.
    func companionSafeArea() -> some View {
        companionHearthReservation()
    }
}

#Preview {
    ScrollView {
        VStack(spacing: PatinaSpacing.md) {
            ForEach(0..<12, id: \.self) { index in
                Text("Row \(index)")
                    .font(PatinaTypography.body)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .frame(maxWidth: .infinity)
                    .padding(PatinaSpacing.md)
                    .background(PatinaColors.Background.secondary)
                    .clipShape(.rect(cornerRadius: PatinaRadius.lg))
            }
        }
        .padding(PatinaSpacing.md)
        .companionSafeArea()
    }
    .background(PatinaColors.Background.primary)
}

//
//  CompanionSafeArea.swift
//  Patina
//
//  Patina Design System - Layout
//
//  Adds bottom padding so app content clears the floating Companion
//  affordance docked at the bottom of the screen (PT-6-14).
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

    /// Root overlay ownership policy. Scan and quiz render their own in-flow
    /// Companion, so reserving the root Hearth there would create dead space.
    static func reservesRootHearth(for route: AppRoute) -> Bool {
        switch route {
        case .scanFlow, .styleQuiz:
            return false
        default:
            return true
        }
    }
}

extension View {
    /// Reserves the invisible Hearth so scrollable content cannot settle under
    /// the centered Companion circle and contextual hint.
    func companionHearthReservation(isActive: Bool = true) -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) {
            if isActive {
                Color.clear
                    .frame(height: CompanionHearthMetrics.reservedHeight)
                    .background {
                        PatinaColors.Background.primary
                            .ignoresSafeArea(edges: .bottom)
                    }
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
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

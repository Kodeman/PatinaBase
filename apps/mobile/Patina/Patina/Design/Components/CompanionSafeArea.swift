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

/// Bottom inset (pt) reserved so content scrolls clear of the Companion.
private let companionSafeAreaInset: CGFloat = 120

extension View {
    /// Reserves bottom space so scrollable content is not obscured by the
    /// floating Companion. Use on the scroll content of screens that present
    /// the Companion.
    func companionSafeArea() -> some View {
        safeAreaPadding(.bottom, companionSafeAreaInset)
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
                    .background(PatinaColors.softCream)
                    .clipShape(.rect(cornerRadius: PatinaRadius.lg))
            }
        }
        .padding(PatinaSpacing.md)
        .companionSafeArea()
    }
    .background(PatinaColors.Background.primary)
}

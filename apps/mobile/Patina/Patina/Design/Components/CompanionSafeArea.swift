//
//  CompanionSafeArea.swift
//  Patina
//
//  Patina Design System - Layout
//
//  Adds bottom padding so app content clears the tab bar that owns the
//  bottom edge of the screen (PT-6-14, B-2).
//

import SwiftUI

/// Spatial contract for the bottom edge. The four-tab root's bar replaces the
/// floating Companion dock (B-2), and the bar's trailing slot is the collapsed
/// Companion.
public enum CompanionHearthMetrics {

    /// The bar's tappable row, above the bottom safe area.
    ///
    /// The figure belongs to `PatinaTabBar.itemHeight`; it is restated here so
    /// the Design layer does not reach into `Features/Navigation` for it, and
    /// `HouseFirstRootTests` pins the two equal.
    public static let barRowHeight: CGFloat = 49

    /// The bottom clearance a screen with a pinned money act must reserve.
    ///
    /// Measured from the **bottom safe area**, because a `safeAreaInset` on the
    /// root — the bar — does not reach a `NavigationStack`'s pushed
    /// destinations. Measured on `dr-w3-int`: a money screen's content ends
    /// this far above the home indicator rather than above the bar. So a pushed
    /// screen clears the bar's 49 pt row by itself — not zero: the bar is drawn
    /// over the screen, not reserved out of it — plus the air.
    public static let pinnedFooterClearance: CGFloat = barRowHeight + clearanceAir

    /// The breathing room a scroll container leaves under its last block, over
    /// and above whatever chrome owns the bottom edge.
    public static let clearanceAir: CGFloat = 8
}

/// The one bottom clearance a scroll container reserves for the bar that owns
/// the bottom edge (`C9-04`).
///
/// Twenty screens used to carry their own figure: 100 here, 120 there, 190
/// somewhere else, none of them derived from `CompanionHearthMetrics`, so a
/// change to the bar re-collided silently. `MoneyScreenChrome` named that
/// defect and fixed it for the ten money screens; this is the same answer for
/// the rest, and `CompanionInsetTests` is what stops the twenty coming back.
private struct CompanionBottomClearanceModifier: ViewModifier {
    func body(content: Content) -> some View {
        content.padding(.bottom, CompanionHearthMetrics.pinnedFooterClearance)
    }
}

extension View {
    /// Bottom clearance for a scroll container under the bar.
    func companionBottomClearance() -> some View {
        modifier(CompanionBottomClearanceModifier())
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
        .companionBottomClearance()
    }
    .background(PatinaColors.Background.primary)
}

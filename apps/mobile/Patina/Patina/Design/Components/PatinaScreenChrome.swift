//
//  PatinaScreenChrome.swift
//  Patina
//
//  U18 — one chrome for every pushed screen. Before this, 17 pushed
//  destinations hid the system nav bar and hand-rolled their own pinned
//  `BackChevronButton` overlay (top: 8, leading: 18), 8 kept the system
//  bar with no title (empty bar + default Back), and a couple did both
//  at once. `.patinaScreen(title:style:)` is the one place that slot now
//  lives: it hides the system bar and overlays the chevron in the exact
//  spot the majority already used, so every pushed screen matches.
//
//  Screens that already render their own eyebrow/H-title near the top
//  pass `title: nil` — the chevron floats over that content without a
//  second title. `title` is for the few screens with no in-body header
//  of their own.
//

import SwiftUI

extension View {
    /// Standard pushed-destination chrome: hides the system navigation bar
    /// and pins a `BackChevronButton` top-leading, matching the slot every
    /// consolidated Group-A screen already used. `.interactivePopGestureEnabled()`
    /// (applied once at the NavigationStack root) is unaffected by this —
    /// hiding the bar per-screen is exactly what that helper already expects.
    func patinaScreen(title: String? = nil, style: BackChevronButton.Style = .light) -> some View {
        modifier(PatinaScreenChrome(title: title, style: style))
    }
}

private struct PatinaScreenChrome: ViewModifier {
    let title: String?
    let style: BackChevronButton.Style

    @Environment(\.appCoordinator) private var coordinator

    func body(content: Content) -> some View {
        content
            .toolbar(.hidden, for: .navigationBar)
            .overlay(alignment: .topLeading) {
                HStack(spacing: 12) {
                    BackChevronButton(style: style) { coordinator.goBack() }
                    if let title {
                        Text(title)
                            .font(PatinaTypography.h5)
                            .foregroundStyle(titleColor)
                            .lineLimit(1)
                    }
                }
                .padding(.top, 8)
                .padding(.leading, 18)
            }
    }

    private var titleColor: Color {
        style == .light ? PatinaColors.Text.primary : PatinaColors.offWhite
    }
}

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

    /// Reserves the status-bar region on a scroll container so scrolled
    /// content passes BEHIND the clock rather than over it.
    ///
    /// One pattern, one owner (W1b ruling 1). This began life as a modifier of
    /// its own beside the money screens; every pushed screen has the same
    /// hidden-navigation-bar ScrollView and the same problem, so
    /// `.patinaScreen(…)` applies it for the nine pushed destinations and the
    /// three money **sheets** — which must not grow a coordinator back
    /// chevron — call this directly.
    func patinaTopBand() -> some View {
        safeAreaInset(edge: .top, spacing: 0) {
            Color.clear
                .frame(height: 0)
                .background {
                    PatinaColors.Background.primary
                        .ignoresSafeArea(edges: .top)
                }
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }

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
            .patinaTopBand()
            .toolbar(.hidden, for: .navigationBar)
            .overlay(alignment: .topLeading) {
                HStack(spacing: 12) {
                    BackChevronButton(style: style) { coordinator.goBack() }
                    if let title {
                        // SP-19 / b-notes §3: the chevron and title float over a
                        // ScrollView with the system bar hidden, so on a scrolled
                        // screen the title sat directly on live content (the
                        // re-walk caught the slot over INV-2026-0142). The
                        // chevron carries its own pill; the title had nothing.
                        Text(title)
                            .font(PatinaTypography.h5)
                            .foregroundStyle(titleColor)
                            .lineLimit(1)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(
                                Capsule(style: .continuous)
                                    .fill(.ultraThinMaterial)
                            )
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

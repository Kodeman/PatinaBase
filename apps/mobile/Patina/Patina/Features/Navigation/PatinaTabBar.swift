//
//  PatinaTabBar.swift
//  Patina
//
//  The house-first bar (B-1, drawn as M1 §6). Four words and a fifth slot.
//
//  It is hand-rolled rather than a `TabView` because the fifth slot holds the
//  Companion's Strata mark, which is not a tab — a cost B-1 names and accepts.
//  Everything `TabView` would have given us for free is therefore explicit
//  here: the container carries `.isTabBar`, each item is a button that carries
//  `.isSelected` when it is the selected one, and each item's VoiceOver label
//  is the destination's canonical name in full (B-7 a), never the shortened
//  word printed on the bar.
//
//  Geometry, off the mock: 49 pt of row over the 34 pt home-indicator safe
//  area — 83 pt in total, which is what replaces the Hearth's 120 (B-2). A
//  `pearl` hairline on top, the primary canvas behind, 6 pt of side padding,
//  and a 54 pt trailing slot. No icons.
//

import SwiftUI

public struct PatinaTabBar<Trailing: View>: View {

    /// The tappable row, above the bottom safe area.
    public static var itemHeight: CGFloat { 49 }

    /// M1's drawn height: the row plus a 34 pt home indicator. Nothing lays
    /// out against it — the bar frames itself at `itemHeight` and lets
    /// `safeAreaInset` add whatever the device's bottom inset actually is, so
    /// on a home-button device the bar is 49. It is published for callers
    /// sizing content against the mock, and it is the figure B-2 compares to
    /// the Hearth's 120.
    public static var barHeight: CGFloat { 83 }

    private static var trailingSlotWidth: CGFloat { 54 }

    private let selected: PatinaTab
    private let onSelect: (PatinaTab) -> Void
    private let trailing: Trailing

    public init(
        selected: PatinaTab,
        onSelect: @escaping (PatinaTab) -> Void,
        @ViewBuilder trailing: () -> Trailing
    ) {
        self.selected = selected
        self.onSelect = onSelect
        self.trailing = trailing()
    }

    public var body: some View {
        HStack(spacing: 0) {
            ForEach(PatinaTab.allCases) { tab in
                item(tab)
            }
            trailing
                .frame(width: Self.trailingSlotWidth, height: Self.itemHeight)
        }
        .padding(.horizontal, 6)
        .frame(height: Self.itemHeight)
        .frame(maxWidth: .infinity)
        .background(alignment: .top) {
            PatinaColors.Background.primary
                .ignoresSafeArea(edges: .bottom)
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(PatinaColors.pearl)
                        .frame(height: 1)
                }
        }
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isTabBar)
    }

    private func item(_ tab: PatinaTab) -> some View {
        Button {
            onSelect(tab)
        } label: {
            Text(tab.title)
                .font(PatinaTypography.uiSmall)
                .foregroundStyle(
                    tab == selected ? PatinaColors.Text.primary : PatinaColors.Text.muted
                )
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .frame(maxWidth: .infinity)
                .frame(height: Self.itemHeight)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        // The word on the bar is short (B-7 a); the name VoiceOver speaks is
        // the canonical one, in full.
        .accessibilityLabel(tab.canonicalName)
        .accessibilityAddTraits(tab == selected ? [.isSelected] : [])
    }
}

#Preview {
    VStack {
        Spacer()
        PatinaTabBar(selected: .today, onSelect: { _ in }) {
            StrataMarkView(color: PatinaColors.mocha, scale: 0.8, accessibility: .decorative)
        }
    }
    .background(PatinaColors.Background.primary)
}

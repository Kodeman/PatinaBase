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
                        .fill(PatinaColors.Border.hairline)
                        .frame(height: 1)
                }
        }
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isTabBar)
    }

    /// B-8's step 3 points at the Studio tab, so the `.studio` arm carries the
    /// tour's anchor. The raw value stays `profile-monogram` — it keys the
    /// Sanity document behind that step (steward §7·F) — and the modifier is a
    /// structural no-op outside a `FirstLaunchTour` host, which is what keeps
    /// the previews below working.
    @ViewBuilder
    private func item(_ tab: PatinaTab) -> some View {
        let control = Button {
            onSelect(tab)
        } label: {
            Text(tab.title)
                .font(PatinaTypography.uiSmall)
                .foregroundStyle(
                    tab == selected ? PatinaColors.Text.primary : PatinaColors.Text.muted
                )
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                // Four words share one 402 pt row beside a fixed 54 pt slot,
                // so the label's growth is capped and each word is given its
                // own gutter: uncapped, `Spaces` truncated mid-word and every
                // label touched its neighbour at accessibility XXL
                // (`w3-n2-09`, `w3-n3-11`). The cap is on the drawn word only
                // — VoiceOver still speaks `tab.canonicalName` in full, and
                // nothing else in the app is capped.
                .dynamicTypeSize(...DynamicTypeSize.accessibility2)
                .padding(.horizontal, 4)
                .frame(maxWidth: .infinity)
                .frame(height: Self.itemHeight)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        // The word on the bar is short (B-7 a); the name VoiceOver speaks is
        // the canonical one, in full.
        .accessibilityLabel(tab.canonicalName)
        .accessibilityAddTraits(tab == selected ? [.isSelected] : [])

        if tab == .studio {
            control.firstLaunchTourAnchor(.profileMonogram)
        } else {
            control
        }
    }
}

#Preview {
    VStack {
        Spacer()
        PatinaTabBar(
            selected: .today,
            onSelect: { _ in },
            trailing: {
                StrataMarkView(color: PatinaColors.mocha, scale: 0.8, accessibility: .decorative)
            }
        )
    }
    .background(PatinaColors.Background.primary)
}

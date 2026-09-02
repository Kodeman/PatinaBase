//
//  RoomTypePillRow.swift
//  Patina
//
//  Selectable room-type chips. Used by Name Your Room, Manual Entry,
//  and Room Settings.
//

import SwiftUI

struct RoomTypePillRow: View {
    @Binding var selected: String

    /// C6-18: the chips measured ~24 pt against the 44 pt floor — caption type
    /// with 6 pt of vertical padding and nothing else.
    static let chipMinHeight: CGFloat = 44

    static let allTypes: [(raw: String, label: String)] = [
        ("living",  "Living"),
        ("bedroom", "Bedroom"),
        ("office",  "Office"),
        ("dining",  "Dining"),
        ("kitchen", "Kitchen"),
        ("other",   "Other")
    ]

    var body: some View {
        // Six fixed chips in one HStack are wider than the screen at an
        // accessibility text size, so they compressed to unreadable slivers.
        // The row fits where it fits and scrolls where it does not — the same
        // answer `RecommendationsView`'s filter bar already takes (SP-02).
        ViewThatFits(in: .horizontal) {
            chips
            ScrollView(.horizontal, showsIndicators: false) { chips }
        }
    }

    private var chips: some View {
        HStack(spacing: 6) {
            ForEach(Self.allTypes, id: \.raw) { item in
                chip(raw: item.raw, label: item.label)
            }
        }
    }

    private func chip(raw: String, label: String) -> some View {
        let isSelected = raw == selected
        return Button {
            selected = raw
        } label: {
            Text(label)
                .font(PatinaTypography.caption)
                .foregroundStyle(isSelected ? PatinaColors.offWhite : PatinaColors.Text.secondary)
                .lineLimit(1)
                .padding(.horizontal, 14)
                .frame(minHeight: Self.chipMinHeight)
                .background(
                    Capsule()
                        .fill(isSelected ? PatinaColors.clay : PatinaColors.Background.secondary)
                )
                .overlay(
                    Capsule()
                        .stroke(isSelected ? PatinaColors.clay : PatinaColors.pearl, lineWidth: 1.5)
                )
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        // Selection was colour alone, and the chips carried no label at all —
        // VoiceOver read six room names with no way to tell which was chosen.
        .accessibilityLabel(label)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : [.isButton])
    }
}

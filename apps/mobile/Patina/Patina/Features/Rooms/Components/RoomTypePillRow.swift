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
        //
        // The first answer here was one row or a horizontal scroll, and raising
        // each chip to the 44 pt floor pushed the single row's ideal width past
        // the screen — so `ViewThatFits` began picking the scroll at the
        // DEFAULT text size, clipping "Kitchen" and putting "Other" off screen
        // entirely, with `showsIndicators: false` removing the only sign the
        // row moved (shots/w1-review-l1c/19-room-chips-large.png). C6-18 asks
        // the row to *wrap*; a wrapped arm sits between the two, and the scroll
        // is the last resort with its indicator showing.
        ViewThatFits(in: .horizontal) {
            chips
            wrappedChips
            ScrollView(.horizontal, showsIndicators: true) { chips }
        }
    }

    private var chips: some View {
        HStack(spacing: 6) {
            ForEach(Self.allTypes, id: \.raw) { item in
                chip(raw: item.raw, label: item.label)
            }
        }
    }

    /// Two rows of three. Every chip stays the size it is; only the line breaks.
    private var wrappedChips: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach([Array(Self.allTypes.prefix(3)), Array(Self.allTypes.suffix(3))],
                    id: \.first!.raw) { row in
                HStack(spacing: 6) {
                    ForEach(row, id: \.raw) { item in
                        chip(raw: item.raw, label: item.label)
                    }
                }
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
                .foregroundStyle(isSelected ? PatinaColors.Text.inverse : PatinaColors.Text.secondary)
                .lineLimit(1)
                .padding(.horizontal, 14)
                .frame(minHeight: Self.chipMinHeight)
                .background(
                    Capsule()
                        .fill(isSelected ? PatinaColors.Interactive.active : PatinaColors.Background.secondary)
                )
                .overlay(
                    Capsule()
                        .stroke(isSelected ? PatinaColors.Interactive.active : PatinaColors.Border.strong, lineWidth: 1.5)
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

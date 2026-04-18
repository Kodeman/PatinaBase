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

    static let allTypes: [(raw: String, label: String)] = [
        ("living",  "Living"),
        ("bedroom", "Bedroom"),
        ("office",  "Office"),
        ("dining",  "Dining"),
        ("kitchen", "Kitchen"),
        ("other",   "Other")
    ]

    var body: some View {
        HStack(spacing: 6) {
            ForEach(Self.allTypes, id: \.raw) { item in
                let isSelected = item.raw == selected
                Button {
                    selected = item.raw
                } label: {
                    Text(item.label)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(isSelected ? .white : PatinaColors.mocha)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(
                            Capsule()
                                .fill(isSelected ? PatinaColors.clay : PatinaColors.softCream)
                        )
                        .overlay(
                            Capsule()
                                .stroke(isSelected ? PatinaColors.clay : PatinaColors.pearl, lineWidth: 1.5)
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }
}

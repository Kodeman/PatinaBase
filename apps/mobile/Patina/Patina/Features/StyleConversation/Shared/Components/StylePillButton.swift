//
//  StylePillButton.swift
//  Patina
//
//  Reusable pill button for Q2 Lifestyle Reality.
//  Per PRD §4.6.2.
//

import SwiftUI

struct StylePillButton: View {

    let label: String
    let emoji: String
    let isSelected: Bool
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            HStack(spacing: 8) {
                Text(emoji)
                    .font(.system(size: 18))
                Text(label)
                    .font(.custom("Inter-Regular", size: 14))
            }
            .foregroundColor(isSelected ? PatinaColors.offWhite : PatinaColors.charcoal)
            .padding(.vertical, 14)
            .padding(.horizontal, 18)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(isSelected ? PatinaColors.charcoal : PatinaColors.softCream)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(
                        isSelected ? PatinaColors.charcoal : PatinaColors.pearl,
                        lineWidth: 1.5
                    )
            )
        }
        .buttonStyle(.plain)
        .frame(minHeight: 44)
        .accessibilityLabel(Text(label))
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}

#Preview {
    VStack {
        StylePillButton(
            label: "Love having people over",
            emoji: "🍷",
            isSelected: false,
            onToggle: {}
        )
        StylePillButton(
            label: "My quiet sanctuary",
            emoji: "🧘",
            isSelected: true,
            onToggle: {}
        )
    }
    .padding()
    .background(PatinaColors.offWhite)
}

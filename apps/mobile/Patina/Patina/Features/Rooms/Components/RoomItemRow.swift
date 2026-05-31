//
//  RoomItemRow.swift
//  Patina
//
//  One saved-item row inside Room Project view. 64×64 thumbnail,
//  optional AR badge, maker + name + price, trailing ⋯ action button.
//

import SwiftUI

struct RoomItemRow: View {
    let item: SavedItem
    var onActions: () -> Void = {}

    var body: some View {
        HStack(spacing: 12) {
            ZStack(alignment: .bottomTrailing) {
                item.placeholderGradient
                    .frame(width: 64, height: 64)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                if item.hasAR {
                    Circle()
                        .fill(PatinaColors.clay)
                        .frame(width: 18, height: 18)
                        .overlay(
                            Text("◎")
                                .font(.system(size: 9))
                                .foregroundStyle(PatinaColors.offWhite)
                        )
                        .padding(3)
                }
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(item.makerName)
                    .font(PatinaTypography.bodySmall)
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.agedOak)
                Text(item.productName)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(PatinaColors.charcoal)
                    .lineLimit(2)
                Text(item.fullFormattedPrice)
                    .font(.custom("PlayfairDisplay-Medium", size: 15))
                    .foregroundStyle(PatinaColors.charcoal)
            }

            Spacer(minLength: 0)

            Button(action: onActions) {
                Text("⋯")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(PatinaColors.charcoal)
                    .frame(width: 28, height: 28)
                    .background(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(PatinaColors.softCream)
                    )
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("More actions")
            .accessibilityHint("Shows options for \(item.productName).")
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
    }
}

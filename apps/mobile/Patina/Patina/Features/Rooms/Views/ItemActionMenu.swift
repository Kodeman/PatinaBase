//
//  ItemActionMenu.swift
//  Patina
//
//  Bottom sheet shown when ⋯ (or long-press) is tapped on a RoomItemRow.
//

import SwiftUI

struct ItemActionMenu: View {
    enum Action: Hashable {
        case viewAR, viewDetail, move, copy, findSimilar, remove
    }

    let item: SavedItem
    var onSelect: (Action) -> Void

    var body: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(PatinaColors.pearl)
                .frame(width: 36, height: 4)
                .padding(.top, 10)

            header
                .padding(.horizontal, 24)
                .padding(.vertical, 14)

            VStack(spacing: 1) {
                row("◎", "View in AR",               .viewAR)
                row("↗", "View Product Detail",      .viewDetail)
                row("⇄", "Move to Another Room",     .move)
                row("⊞", "Copy to Another Room",     .copy)
                row("✦", "Find Similar",             .findSimilar)
                row("✕", "Remove from Room",         .remove, destructive: true)
            }
            .background(PatinaColors.pearl)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .padding(.horizontal, 20)
            .padding(.bottom, 36)
        }
        .background(PatinaColors.offWhite)
    }

    private var header: some View {
        HStack(spacing: 10) {
            item.placeholderGradient
                .frame(width: 44, height: 44)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(item.productName)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(PatinaColors.charcoal)
                Text("\(item.makerName) · \(item.fullFormattedPrice)")
                    .font(.custom("DMMono-Regular", size: 8))
                    .tracking(0.3)
                    .foregroundColor(PatinaColors.agedOak)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(PatinaColors.softCream)
        )
    }

    private func row(_ glyph: String, _ title: String, _ action: Action, destructive: Bool = false) -> some View {
        Button {
            onSelect(action)
        } label: {
            HStack(spacing: 12) {
                Text(glyph)
                    .font(.system(size: 16))
                    .frame(width: 24)
                Text(title)
                    .font(.system(size: 13))
                Spacer()
            }
            .foregroundColor(destructive ? PatinaColors.terracotta : PatinaColors.charcoal)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PatinaColors.offWhite)
        }
        .buttonStyle(.plain)
    }
}

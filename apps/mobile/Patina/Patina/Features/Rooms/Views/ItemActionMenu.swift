//
//  ItemActionMenu.swift
//  Patina
//
//  Bottom sheet shown when ⋯ (or long-press) is tapped on a RoomItemRow.
//

import SwiftUI

struct ItemActionMenu: View {
    enum Action: Hashable {
        case viewAR, viewDetail, move, copy, remove
    }

    let item: SavedItem
    var onSelect: (Action) -> Void

    var body: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(PatinaColors.Border.strong)
                .frame(width: 36, height: 4)
                .padding(.top, 10)

            header
                .padding(.horizontal, 24)
                .padding(.vertical, 14)

            VStack(spacing: 1) {
                row("arkit", "View in AR",                          .viewAR)
                row("arrow.up.right", "View Product Detail",        .viewDetail)
                row("arrow.left.arrow.right", "Move to Another Room", .move)
                row("plus.square.on.square", "Copy to Another Room", .copy)
                row("xmark", "Remove from Room",                    .remove, destructive: true)
            }
            .background(PatinaColors.Border.hairline)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .padding(.horizontal, 20)
            .padding(.bottom, 36)
        }
        .background(PatinaColors.Background.primary)
    }

    private var header: some View {
        HStack(spacing: 10) {
            item.placeholderGradient
                .frame(width: 44, height: 44)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(item.productName)
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.primary)
                Text("\(item.makerName) · \(item.fullFormattedPrice)")
                    .font(PatinaTypography.monoLabel)
                    .tracking(0.3)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(PatinaColors.Background.secondary)
        )
    }

    private func row(_ systemImage: String, _ title: String, _ action: Action, destructive: Bool = false) -> some View {
        Button {
            onSelect(action)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .font(.system(size: 16))
                    .frame(width: 24)
                Text(title)
                    .font(PatinaTypography.bodySmall)
                Spacer()
            }
            .foregroundStyle(destructive ? PatinaColors.terracotta : PatinaColors.Text.primary)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PatinaColors.Background.primary)
        }
        .buttonStyle(.plain)
    }
}

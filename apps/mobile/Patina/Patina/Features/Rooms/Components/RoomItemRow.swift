//
//  RoomItemRow.swift
//  Patina
//
//  One saved-item row inside Room Project view. 64×64 thumbnail,
//  optional AR badge, maker + name + price, trailing ⋯ action button.
//  The row body itself is a Button (R10) — tapping anywhere outside the
//  ⋯ overflow opens the piece detail via the `onTap` closure.
//

import SwiftUI

struct RoomItemRow: View {
    let item: SavedItem
    var onTap: () -> Void = {}
    var onActions: () -> Void = {}

    var body: some View {
        HStack(spacing: PatinaSpacing.xsm) {
            // R10: the row content is a real Button so saved items can be
            // opened. The inner ⋯ Button stays a separate sibling target —
            // both use .buttonStyle(.plain) so the two don't conflict.
            Button(action: onTap) {
                HStack(spacing: PatinaSpacing.xsm) {
                    ZStack(alignment: .bottomTrailing) {
                        item.placeholderGradient
                            .frame(width: 64, height: 64)
                            .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.md, style: .continuous))
                        if item.hasAR {
                            Circle()
                                .fill(PatinaColors.clayInk)
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
                            .foregroundStyle(PatinaColors.Text.muted)
                        Text(item.productName)
                            .font(PatinaTypography.uiSmall)
                            .foregroundStyle(PatinaColors.Text.primary)
                            .lineLimit(2)
                        Text(item.fullFormattedPrice)
                            .font(PatinaTypography.h5)
                            .foregroundStyle(PatinaColors.Text.primary)
                    }

                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(rowAccessibilityLabel)
            .accessibilityHint("Opens the detail page for \(item.productName).")

            Button(action: onActions) {
                Text("⋯")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(PatinaColors.Text.primary)
                    .frame(width: 28, height: 28)
                    .background(
                        RoundedRectangle(cornerRadius: PatinaRadius.md, style: .continuous)
                            .fill(PatinaColors.Background.secondary)
                    )
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("More actions")
            .accessibilityHint("Shows options for \(item.productName).")
        }
        .padding(.horizontal, PatinaSpacing.mdLarge)
        .padding(.vertical, 10)
    }

    /// Aggregated VoiceOver label: maker + name + price, with AR state when present,
    /// so focus lands once on the whole row instead of stopping on each Text.
    private var rowAccessibilityLabel: String {
        var parts: [String] = [item.productName, "by \(item.makerName)", item.fullFormattedPrice]
        if item.hasAR { parts.append("AR ready") }
        return parts.joined(separator: ", ")
    }
}

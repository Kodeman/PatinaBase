//
//  SavedDoorRow.swift
//  Patina
//
//  M9's labelled `Saved` row — the door at the top of the Pieces tab that
//  cannot hide.
//
//  Two rules it exists to keep:
//
//   • F14: the door disappeared at a zero count, so the one screen that would
//     have taught a new reader what Saved is was invisible until they had
//     already found it another way. This row draws at every count, and says
//     "Nothing yet" rather than a zero.
//   • B-7 (b): Saved stays a canonical surface of its own, not a segment of
//     the grid — so the row carries its own accessibility label and never
//     answers to the Pieces tab's.
//
//  The count is whatever the browse screen actually knows: the local saved
//  rows merged with the account's `saved_items`. Nothing here invents a number.
//

import SwiftUI

struct SavedDoorRow: View {

    let count: Int
    let action: () -> Void

    /// The canonical name of the surface this row opens — deliberately not the
    /// Pieces tab's name (B-7 b).
    static let title = "Saved"

    static func meta(count: Int) -> String {
        guard count > 0 else { return "Nothing yet" }
        return "\(count) piece\(count == 1 ? "" : "s")"
    }

    static func accessibilityLabel(count: Int) -> String {
        "\(title), \(meta(count: count).lowercased())"
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Text(Self.title)
                    .font(PatinaTypography.h5)
                    .foregroundStyle(PatinaColors.Text.primary)

                MonoLabel(text: Self.meta(count: count))
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .lineLimit(1)

                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 13)
            .frame(minHeight: 44)
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.accessibilityLabel(count: count))
        .accessibilityHint("Opens your saved pieces, in boards and as a list.")
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("Pieces.SavedDoorRow")
    }
}

#Preview {
    VStack(spacing: 12) {
        SavedDoorRow(count: 3) {}
        SavedDoorRow(count: 1) {}
        SavedDoorRow(count: 0) {}
    }
    .padding(24)
    .background(PatinaColors.Background.primary)
}

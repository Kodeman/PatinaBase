//
//  SpatialMetadataRow.swift
//  Patina
//
//  Chip row showing the room's spatial context (orientation, windows, doors)
//  — used on the empty-state Room Project view.
//
//  The dimensions are NOT here. `RoomHero` prints them one line above, as
//  `14 × 18 ft`; this row printed the same two numbers again in the other
//  order and the other idiom, `18' × 14'` (h1-notes.md §6.5,
//  integration.md §6.4). The room says its size once, in the hero's words.
//

import SwiftUI

struct SpatialMetadataRow: View {
    let room: RoomModel

    /// With the dimensions gone, a room that knows nothing else about itself
    /// would have drawn an empty card. It draws no card.
    static func hasContent(_ room: RoomModel) -> Bool {
        !room.orientationLabel.isEmpty || room.windowCount > 0 || room.doorCount > 0
    }

    var body: some View {
        if Self.hasContent(room) {
            HStack(spacing: 16) {
                if !room.orientationLabel.isEmpty {
                    item(icon: "🧭", text: room.orientationLabel)
                }
                if room.windowCount > 0 {
                    item(icon: "🪟", text: "\(room.windowCount) window\(room.windowCount == 1 ? "" : "s")")
                }
                if room.doorCount > 0 {
                    item(icon: "🚪", text: "\(room.doorCount) door\(room.doorCount == 1 ? "" : "s")")
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(PatinaColors.Background.secondary)
            )
        }
    }

    private func item(icon: String, text: String) -> some View {
        HStack(spacing: 6) {
            Text(icon).font(.system(size: 14))
            Text(text)
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.secondary)
        }
    }
}

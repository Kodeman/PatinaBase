//
//  SpatialMetadataRow.swift
//  Patina
//
//  Chip row showing the room's spatial context (dimensions, orientation,
//  windows, doors) — used on the empty-state Room Project view.
//

import SwiftUI

struct SpatialMetadataRow: View {
    let room: RoomModel

    var body: some View {
        HStack(spacing: 16) {
            if let dim = dimensionsString {
                item(icon: "📐", text: dim, bold: true)
            }
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
                .fill(PatinaColors.softCream)
        )
    }

    private func item(icon: String, text: String, bold: Bool = false) -> some View {
        HStack(spacing: 6) {
            Text(icon).font(.system(size: 14))
            Text(text)
                .font(.system(size: 11, weight: bold ? .medium : .regular))
                .foregroundColor(bold ? PatinaColors.charcoal : PatinaColors.mocha)
        }
    }

    private var dimensionsString: String? {
        guard let w = room.width, let l = room.length else { return nil }
        let wFt = w / 0.3048
        let lFt = l / 0.3048
        return String(format: "%.0f' × %.0f'", lFt, wFt)
    }
}

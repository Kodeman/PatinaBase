//
//  WholeHomeCrossRoomBar.swift
//  Patina
//
//  Top-of-gallery bar summarising every scanned/manual room in the home.
//  Tapping it opens the Cross-Room view.
//

import SwiftUI

struct WholeHomeCrossRoomBar: View {
    let roomCount: Int
    let itemCount: Int
    let totalCents: Int
    var onTap: () -> Void = {}

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(PatinaColors.clay)
                        .frame(width: 44, height: 44)
                    Text("⌂")
                        .font(.system(size: 18))
                        .foregroundStyle(PatinaColors.offWhite)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("Whole Home")
                        .font(PatinaTypography.h5)
                        .foregroundStyle(PatinaColors.offWhite)
                    Text(summary)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.OnDark.secondary)
                }
                Spacer(minLength: 0)
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(PatinaColors.Background.dark)
            )
        }
        .buttonStyle(.plain)
    }

    private var summary: String {
        let dollars = totalCents / 100
        let dollarString: String
        if dollars >= 1000 {
            dollarString = "$\(String(format: "%.1f", Double(dollars) / 1000))K"
        } else {
            dollarString = "$\(dollars)"
        }
        let roomWord = roomCount == 1 ? "room" : "rooms"
        let itemWord = itemCount == 1 ? "item" : "items"
        return "\(roomCount) \(roomWord) · \(itemCount) \(itemWord) · \(dollarString) total"
    }
}

//
//  RoomBudgetBar.swift
//  Patina
//
//  Charcoal budget card shown in Room Project view. Fills only after the
//  room reaches 50% of the user's stated budget range.
//

import SwiftUI

struct RoomBudgetBar: View {
    let totalCents: Int
    let minCents: Int
    let maxCents: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text("Room investment")
                    .font(.system(size: 11))
                    .foregroundStyle(PatinaColors.pearl)
                Spacer()
                Text(formatted(totalCents))
                    .font(.custom("PlayfairDisplay-Medium", size: 22))
                    .foregroundStyle(PatinaColors.offWhite)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(PatinaColors.offWhite.opacity(0.15))
                    Capsule()
                        .fill(PatinaColors.clay)
                        .frame(width: geo.size.width * fillFraction)
                }
            }
            .frame(height: 4)

            HStack {
                Text(formatted(0))
                Spacer()
                Text("Your range: \(formatted(minCents))–\(formatted(maxCents))")
                Spacer()
                Text(formatted(maxCents * 2))
            }
            .font(.custom("DMMono-Regular", size: 7))
            .tracking(0.3)
            .foregroundStyle(PatinaColors.Text.interactive)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(PatinaColors.charcoal)
        )
    }

    private var fillFraction: CGFloat {
        let ceiling = Double(maxCents * 2)
        guard ceiling > 0 else { return 0 }
        return CGFloat(min(1.0, Double(totalCents) / ceiling))
    }

    private func formatted(_ cents: Int) -> String {
        let dollars = cents / 100
        if dollars == 0 { return "$0" }
        if dollars >= 1000 {
            return "$\(String(format: "%.1f", Double(dollars) / 1000))K"
        }
        return "$\(dollars)"
    }
}

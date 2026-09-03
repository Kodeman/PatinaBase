//
//  RoomBudgetBar.swift
//  Patina
//
//  Charcoal budget card shown in Room Project view. Fills only after the
//  room reaches 50% of the budget its owner set.
//
//  It used to measure against a hard-coded $2,000–$5,000 and print a compact
//  "K" range under a fill derived from it — a range nobody had given (C5,
//  integration.md §6.3). It measures against `rooms.budget_cents` now, and
//  where there is no budget the bar does not draw at all. Its figures go
//  through `PatinaCurrency` like every other amount in the app (C5-14).
//

import SwiftUI

struct RoomBudgetBar: View {
    let totalCents: Int
    let budgetCents: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text("Room investment")
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.OnDark.secondary)
                Spacer()
                Text(Self.figure(totalCents: totalCents, budgetCents: budgetCents))
                    .font(PatinaTypography.h4Medium)
                    .foregroundStyle(PatinaColors.offWhite)
            }

            ZStack(alignment: .leading) {
                Capsule()
                    .fill(PatinaColors.offWhite.opacity(0.15))
                if fillFraction > 0 {
                    Capsule()
                        .fill(PatinaColors.clay)
                        .frame(maxWidth: fillFraction * .infinity)
                }
            }
            .frame(height: 4)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(PatinaColors.Background.dark)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "Room investment. \(Self.figure(totalCents: totalCents, budgetCents: budgetCents))."
        )
    }

    /// `$2.4K of $9.0K` — the two figures the room actually holds, in that
    /// order, and no third.
    static func figure(totalCents: Int, budgetCents: Int) -> String {
        "\(money(totalCents)) of \(money(budgetCents))"
    }

    private var fillFraction: CGFloat {
        guard budgetCents > 0 else { return 0 }
        return CGFloat(min(1.0, Double(totalCents) / Double(budgetCents)))
    }

    private static func money(_ cents: Int) -> String {
        PatinaCurrency.formatWholeDollars(cents: cents)
    }

}

//
//  InvestmentPerspectiveView.swift
//  Patina
//
//  Q4: Investment Perspective. Vertical type-forward list.
//  Per PRD §4.6.4.
//

import SwiftUI

struct InvestmentPerspectiveView: View {

    var viewModel: StyleConversationViewModel

    var body: some View {
        VStack(spacing: 0) {
            ForEach(InvestmentTier.allCases) { tier in
                investmentRow(tier)
            }
        }
        .padding(.horizontal, 24)
    }

    @ViewBuilder
    private func investmentRow(_ tier: InvestmentTier) -> some View {
        let isDiscussRow = tier == .budgetDesigner

        Button {
            viewModel.answerQ4(tier)
        } label: {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(tier.displayName)
                        .font(.custom(
                            isDiscussRow ? "PlayfairDisplay-Italic" : "PlayfairDisplay-Regular",
                            size: 18,
                            relativeTo: .body
                        ))
                        .foregroundStyle(PatinaColors.Text.primary)
                    Text(tier.descriptionText)
                        .font(.custom("Inter-Light", size: 12, relativeTo: .caption))
                        .foregroundStyle(PatinaColors.Text.muted)
                }

                Spacer()

                Text(tier.rangeLabel)
                    .font(.custom("DMMono-Regular", size: 11, relativeTo: .caption2))
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.interactive)
            }
            .padding(.vertical, 20)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(PatinaColors.pearl)
                .frame(height: 1)
        }
        .accessibilityLabel(Text("\(tier.displayName), \(tier.rangeLabel)"))
    }
}

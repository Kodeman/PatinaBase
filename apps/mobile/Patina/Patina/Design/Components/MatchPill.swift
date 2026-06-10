//
//  MatchPill.swift
//  Patina
//
//  Top-right "% match" badge for Daily Room product cards.
//

import SwiftUI

struct MatchPill: View {
    let score: Int

    var body: some View {
        Text("\(score)% match")
            .font(PatinaTypography.monoTiny)
            .tracking(0.5)
            .textCase(.uppercase)
            .foregroundStyle(PatinaColors.Text.secondary)
            .padding(.vertical, 3)
            .padding(.horizontal, 8)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(PatinaColors.Background.primary.opacity(0.92))
            )
    }
}

#Preview {
    MatchPill(score: 92)
        .padding()
        .background(PatinaGradients.hero)
}

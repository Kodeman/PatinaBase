//
//  MatchPill.swift
//  Patina
//
//  Top-right "% match" badge for Daily Room product cards.
//

import SwiftUI

public struct MatchPill: View {
    let score: Int

    public init(score: Int) {
        self.score = score
    }

    public var body: some View {
        Text("\(score)% match")
            .font(PatinaTypography.monoLabel)
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

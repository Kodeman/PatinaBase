//
//  TierPill.swift
//  Patina
//
//  Top-left tier badge for Daily Room product cards.
//

import SwiftUI

struct TierPill: View {
    let tier: DailyRecommendation.Tier

    var body: some View {
        if tier == .standard {
            EmptyView()
        } else {
            Text(tier.label)
                .font(PatinaTypography.monoTiny)
                .tracking(0.5)
                .textCase(.uppercase)
                .foregroundStyle(PatinaColors.offWhite)
                .padding(.vertical, 3)
                .padding(.horizontal, 8)
                .background(PatinaColors.clay.opacity(0.85))
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
    }
}

#Preview {
    VStack(spacing: 8) {
        TierPill(tier: .designerSelection)
        TierPill(tier: .editorPick)
        TierPill(tier: .standard)
    }
    .padding()
    .background(PatinaColors.softCream)
}

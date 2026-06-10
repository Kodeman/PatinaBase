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
                .font(PatinaTypography.monoLabel)
                .tracking(0.5)
                .textCase(.uppercase)
                .foregroundStyle(PatinaColors.offWhite)
                .padding(.vertical, 3)
                .padding(.horizontal, PatinaSpacing.sm)
                .background(PatinaColors.clay.opacity(0.85))
                // 6pt reads capsule-like at this pill height — kept off-grid
                // deliberately (sm=4 looks boxy, md=8 fully rounds it).
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
    .background(PatinaColors.Background.secondary)
}

//
//  TierPill.swift
//  Patina
//
//  Top-left tier badge for Daily Room product cards.
//

import SwiftUI

struct TierPill: View {
    let tier: DailyRecommendation.Tier

    /// C3-05: a 10 pt uppercase label on a `clay` fill is 2.18:1 — the exact
    /// shape the finding measured across ~15 selected-state controls. The
    /// design system already ships the pairing that works.
    static let fillColor = PatinaColors.Interactive.active
    static let labelColor = PatinaColors.Text.inverse

    var body: some View {
        if tier == .standard {
            EmptyView()
        } else {
            Text(tier.label)
                .font(PatinaTypography.monoLabel)
                .tracking(0.5)
                .textCase(.uppercase)
                .foregroundStyle(Self.labelColor)
                .padding(.vertical, 3)
                .padding(.horizontal, PatinaSpacing.sm)
                .background(Self.fillColor)
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

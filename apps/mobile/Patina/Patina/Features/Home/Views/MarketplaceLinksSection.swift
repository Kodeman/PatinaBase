//
//  MarketplaceLinksSection.swift
//  Patina
//
//  U24: the marketplace doors, kept open past `.discovering`.
//
//  Browse and Saved live inside `WorkWithDesignerCTA`, which the home swaps
//  out the moment a client engages a designer — so the act of hiring took
//  the whole marketplace away with it. This block restores both entries in
//  the hub language, mounted under `StudioHubSection`, so the shopping half
//  of Patina survives the transition to the project half.
//

import SwiftUI

struct MarketplaceLinksSection: View {

    private struct MarketplaceRow {
        let title: String
        let meta: String
        let route: AppRoute
        let hint: String
        /// PostHog `row` property captured on `marketplace_row_tapped`.
        let analyticsKey: String
    }

    @Environment(\.appCoordinator) private var coordinator

    private let rows: [MarketplaceRow] = [
        MarketplaceRow(
            title: "Browse pieces",
            meta: "The full collection",
            route: .emergence(pieceId: nil),
            hint: "Opens the full collection.",
            analyticsKey: "browse_pieces"
        ),
        MarketplaceRow(
            title: "Saved",
            meta: "Everything you've kept",
            route: .table,
            hint: "Opens your saved pieces.",
            analyticsKey: "saved"
        )
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Marketplace")
                .font(PatinaTypography.monoMedium)
                .tracking(1)
                .textCase(.uppercase)
                .foregroundStyle(PatinaColors.Text.muted)
                .accessibilityAddTraits(.isHeader)
                .padding(.bottom, PatinaSpacing.xs)

            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.title) { index, model in
                    if index > 0 { hairline }
                    row(model)
                }
            }
        }
        .padding(.horizontal, PatinaSpacing.mdLarge)
        .padding(.top, PatinaSpacing.lg)
    }

    private func row(_ model: MarketplaceRow) -> some View {
        Button {
            PostHogService.shared.capture("marketplace_row_tapped", properties: [
                "row": model.analyticsKey
            ])
            coordinator.navigate(to: model.route)
        } label: {
            HStack(spacing: PatinaSpacing.sm) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.title)
                        .font(PatinaTypography.h5)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Text(model.meta)
                        .font(PatinaTypography.monoLabel)
                        .tracking(0.4)
                        .textCase(.uppercase)
                        .foregroundStyle(PatinaColors.Text.muted)
                }

                Spacer(minLength: PatinaSpacing.sm)

                Image(systemName: "chevron.right")
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .accessibilityHidden(true)
            }
            .padding(.vertical, PatinaSpacing.xsm)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(model.title)
        .accessibilityValue(model.meta)
        .accessibilityHint(model.hint)
        .accessibilityIdentifier("MarketplaceLinksSection.\(model.title)")
    }

    private var hairline: some View {
        Rectangle()
            .fill(PatinaColors.Text.muted.opacity(0.18))
            .frame(height: 1)
    }
}

#Preview {
    ScrollView {
        MarketplaceLinksSection()
            .environment(\.appCoordinator, AppCoordinator())
    }
    .background(PatinaColors.Background.primary)
}

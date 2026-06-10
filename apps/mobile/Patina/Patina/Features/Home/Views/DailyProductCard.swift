//
//  DailyProductCard.swift
//  Patina
//

import SwiftUI

struct DailyProductCard: View {
    let recommendation: DailyRecommendation
    var namespace: Namespace.ID?
    var isExpanded: Bool = false
    var onExpand: (() -> Void)? = nil
    let onAdd: () -> Void
    /// Spatial "why it fits" copy from the room-aware feed, keyed by
    /// context type ("scale", "light", "pairing", …). First non-empty
    /// value renders as a pill under the product name.
    var spatialContext: [String: String] = [:]

    var body: some View {
        Button {
            onExpand?()
        } label: {
            VStack(spacing: 0) {
                imageArea
                    .modifier(MatchedImage(namespace: namespace, id: recommendation.id, isSource: !isExpanded))
                bodyArea
            }
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.xl, style: .continuous))
            .padding(.bottom, PatinaSpacing.md)
            .opacity(isExpanded ? 0 : 1)
        }
        .buttonStyle(.plain)
        .disabled(onExpand == nil)
    }

    // MARK: - Image area

    private var firstSpatialCopy: String? {
        for key in ["scale", "light", "pairing", "style", "fit"] {
            if let v = spatialContext[key], !v.isEmpty { return v }
        }
        return spatialContext.values.first(where: { !$0.isEmpty })
    }

    private var imageArea: some View {
        ZStack(alignment: .topLeading) {
            // R15: real product photo through PatinaAsyncImage when the feed
            // provides one (branded strata placeholder while loading / on
            // failure); the category gradient stays the no-URL fallback.
            Group {
                if let imageURL = recommendation.product.imageURL,
                   let url = URL(string: imageURL) {
                    PatinaAsyncImage(url: url)
                } else {
                    recommendation.product.placeholderGradient
                }
            }
            .frame(height: 210)
            .frame(maxWidth: .infinity)
            .clipped()

            // Why caption overlay (bottom)
            VStack {
                Spacer()
                ZStack(alignment: .bottomLeading) {
                    LinearGradient(
                        colors: [PatinaColors.charcoal.opacity(0.75), .clear],
                        startPoint: .bottom,
                        endPoint: .top
                    )
                    .frame(height: 70)
                    Text(recommendation.whyCopy)
                        // No 11pt italic token exists (patinaVoice is 18pt and
                        // would overflow the 70pt gradient band) — keep the
                        // size but scale with Dynamic Type via relativeTo.
                        .font(.custom("PlayfairDisplay-Italic", size: 11, relativeTo: .caption))
                        .foregroundStyle(PatinaColors.offWhite)
                        .lineSpacing(2)
                        .padding(.horizontal, PatinaSpacing.md)
                        .padding(.bottom, PatinaSpacing.xsm)
                }
            }

            // Tier and Match pills are Patina concepts but live INSIDE the
            // outer card Button, which would swallow any `.onTapGesture` we
            // attach via HelpTooltip. The full explanations are surfaced
            // via the contextual help panel (`?` button in the greeting
            // header) instead, keyed on the same surface keys
            // (`SurfaceKeys.IOSApp.Home.tierPill`, `…/match-pill`). The
            // detail view (`DailyProductDetailView` / `ProductDetailView`)
            // can attach HelpTooltip directly to the pills because those
            // screens render pills outside an outer Button.
            TierPill(tier: recommendation.tier)
                .padding(.top, PatinaSpacing.sm)
                .padding(.leading, PatinaSpacing.sm)

            MatchPill(score: recommendation.matchScore)
                .padding(.top, PatinaSpacing.sm)
                .padding(.trailing, PatinaSpacing.sm)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .frame(height: 210)
        .clipped()
    }

    // MARK: - Body area

    private var bodyArea: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: PatinaSpacing.sm) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(recommendation.product.makerName)
                        .font(PatinaTypography.monoSmall)
                        .tracking(0.5)
                        .textCase(.uppercase)
                        .foregroundStyle(PatinaColors.Text.muted)
                    Text(recommendation.product.name)
                        .font(PatinaTypography.uiSmall)
                        .foregroundStyle(PatinaColors.Text.primary)
                        .lineLimit(2)
                        .padding(.bottom, PatinaSpacing.xxxs)
                    Text(recommendation.product.formattedPrice)
                        .font(PatinaTypography.h5)
                        .foregroundStyle(PatinaColors.Text.primary)

                    if let spatial = firstSpatialCopy {
                        Text(spatial)
                            .font(PatinaTypography.caption)
                            .foregroundStyle(PatinaColors.Text.muted)
                            .lineLimit(2)
                            .padding(.top, PatinaSpacing.xxxs)
                    }
                }
                Spacer(minLength: 0)
                Button {
                    onAdd()
                } label: {
                    HStack(spacing: 5) {
                        Text("+")
                            .font(PatinaTypography.caption)
                        Text("Add")
                            .font(PatinaTypography.caption)
                    }
                    .foregroundStyle(PatinaColors.Text.inverse)
                    .padding(.vertical, PatinaSpacing.sm)
                    .padding(.horizontal, PatinaSpacing.md)
                    .background(Capsule().fill(PatinaColors.Interactive.active))
                }
                .buttonStyle(.plain)
            }

            if let insight = recommendation.insight {
                insightRow(insight)
                    .padding(.top, PatinaSpacing.sm)
            }
            if let pairing = recommendation.pairing {
                pairingRow(pairing)
                    .padding(.top, PatinaSpacing.sm)
            }
        }
        .padding(.horizontal, PatinaSpacing.md)
        .padding(.vertical, PatinaSpacing.xsm)
    }

    private func insightRow(_ insight: DailyRecommendation.Insight) -> some View {
        HStack(alignment: .top, spacing: PatinaSpacing.sm) {
            Image(systemName: insight.icon)
                .font(.system(size: 11))
                .foregroundStyle(PatinaColors.Text.secondary)
                .padding(.top, 1)
            Text(insight.text)
                .font(PatinaTypography.captionSmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .lineSpacing(2)
            Spacer(minLength: 0)
        }
        .padding(.vertical, PatinaSpacing.sm)
        .padding(.horizontal, PatinaSpacing.xsm)
        .background(
            RoundedRectangle(cornerRadius: PatinaRadius.lg, style: .continuous)
                .fill(PatinaColors.Background.primary)
        )
    }

    private func pairingRow(_ pairing: DailyRecommendation.Pairing) -> some View {
        HStack(alignment: .center, spacing: PatinaSpacing.sm) {
            RoundedRectangle(cornerRadius: PatinaRadius.md, style: .continuous)
                .fill(pairing.thumbGradient)
                .frame(width: 32, height: 32)
            Text(pairing.text)
                .font(PatinaTypography.captionSmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .lineSpacing(2)
            Spacer(minLength: 0)
        }
        .padding(.vertical, PatinaSpacing.sm)
        .padding(.horizontal, PatinaSpacing.xsm)
        .background(
            RoundedRectangle(cornerRadius: PatinaRadius.lg, style: .continuous)
                .fill(PatinaColors.sage.opacity(0.10))
        )
    }
}

private struct MatchedImage: ViewModifier {
    let namespace: Namespace.ID?
    let id: String
    let isSource: Bool

    func body(content: Content) -> some View {
        if let namespace {
            content.matchedGeometryEffect(
                id: "card-image-\(id)",
                in: namespace,
                isSource: isSource
            )
        } else {
            content
        }
    }
}

#Preview {
    ScrollView {
        VStack {
            ForEach(DailyRecommendation.previewAll) { rec in
                DailyProductCard(recommendation: rec, onAdd: {})
            }
        }
        .padding(20)
    }
    .background(PatinaColors.Background.primary)
}

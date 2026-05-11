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
            .background(PatinaColors.softCream)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .padding(.bottom, 14)
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
            recommendation.product.placeholderGradient
                .frame(height: 210)
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
                        .font(.custom("PlayfairDisplay-Italic", size: 11))
                        .foregroundColor(PatinaColors.offWhite)
                        .lineSpacing(2)
                        .padding(.horizontal, 14)
                        .padding(.bottom, 10)
                }
            }

            // Tier pill
            TierPill(tier: recommendation.tier)
                .padding(.top, 9)
                .padding(.leading, 9)

            // Match pill
            MatchPill(score: recommendation.matchScore)
                .padding(.top, 9)
                .padding(.trailing, 9)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .frame(height: 210)
        .clipped()
    }

    // MARK: - Body area

    private var bodyArea: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(recommendation.product.makerName)
                        .font(.custom("DMMono-Regular", size: 7))
                        .tracking(0.5)
                        .textCase(.uppercase)
                        .foregroundColor(PatinaColors.agedOak)
                    Text(recommendation.product.name)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(PatinaColors.charcoal)
                        .lineLimit(2)
                        .padding(.bottom, 2)
                    Text(recommendation.product.formattedPrice)
                        .font(.custom("PlayfairDisplay-Medium", size: 16))
                        .foregroundColor(PatinaColors.charcoal)

                    if let spatial = firstSpatialCopy {
                        Text(spatial)
                            .font(.system(size: 11))
                            .foregroundColor(PatinaColors.agedOak)
                            .lineLimit(2)
                            .padding(.top, 2)
                    }
                }
                Spacer(minLength: 0)
                Button {
                    onAdd()
                } label: {
                    HStack(spacing: 5) {
                        Text("+")
                            .font(.system(size: 12, weight: .medium))
                        Text("Add")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(PatinaColors.offWhite)
                    .padding(.vertical, 8)
                    .padding(.horizontal, 14)
                    .background(Capsule().fill(PatinaColors.charcoal))
                }
                .buttonStyle(.plain)
            }

            if let insight = recommendation.insight {
                insightRow(insight)
                    .padding(.top, 8)
            }
            if let pairing = recommendation.pairing {
                pairingRow(pairing)
                    .padding(.top, 8)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    private func insightRow(_ insight: DailyRecommendation.Insight) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: insight.icon)
                .font(.system(size: 11))
                .foregroundColor(PatinaColors.mocha)
                .padding(.top, 1)
            Text(insight.text)
                .font(.system(size: 10))
                .foregroundColor(PatinaColors.mocha)
                .lineSpacing(2)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(PatinaColors.offWhite)
        )
    }

    private func pairingRow(_ pairing: DailyRecommendation.Pairing) -> some View {
        HStack(alignment: .center, spacing: 8) {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(pairing.thumbGradient)
                .frame(width: 32, height: 32)
            Text(pairing.text)
                .font(.system(size: 10))
                .foregroundColor(PatinaColors.mocha)
                .lineSpacing(2)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
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
    .background(PatinaColors.offWhite)
}

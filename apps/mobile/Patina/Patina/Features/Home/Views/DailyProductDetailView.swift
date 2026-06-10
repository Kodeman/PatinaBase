//
//  DailyProductDetailView.swift
//  Patina
//
//  Full-screen product detail that morphs from a DailyProductCard via matchedGeometryEffect.
//

import SwiftUI

struct DailyProductDetailView: View {
    let recommendation: DailyRecommendation
    let namespace: Namespace.ID
    let onDismiss: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var chromeVisible = false
    @State private var dragOffset: CGFloat = 0

    private var product: Product { recommendation.product }

    private var dismissProgress: CGFloat {
        min(1, max(0, dragOffset / 240))
    }

    var body: some View {
        ZStack(alignment: .top) {
            PatinaColors.Background.primary
                .ignoresSafeArea()
                .opacity(chromeVisible ? 1 - dismissProgress * 0.4 : 0)

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    hero
                        .frame(height: 420)
                        .frame(maxWidth: .infinity)
                        .clipped()
                        .matchedGeometryEffect(
                            id: "card-image-\(recommendation.id)",
                            in: namespace,
                            isSource: false
                        )

                    body(content: {
                        VStack(alignment: .leading, spacing: 18) {
                            makerHeader
                            nameAndPrice
                            whyQuote
                            if let insight = recommendation.insight {
                                insightBlock(insight)
                            }
                            if let pairing = recommendation.pairing {
                                pairingBlock(pairing)
                            }
                            Divider().background(PatinaColors.Text.muted.opacity(0.25))
                            // R25: only render the story section when the
                            // maker actually has one — no canned filler copy
                            // pretending to be provenance.
                            if let story = product.makerStory {
                                description(story)
                            }
                            specsGrid
                            Spacer(minLength: 140)
                        }
                        .padding(.horizontal, 24)
                        .padding(.top, 22)
                    })
                    .opacity(chromeVisible ? 1 : 0)
                    .offset(y: chromeVisible ? 0 : 16)
                }
            }
            .scrollDisabled(dragOffset > 0)

            topBar
                .opacity(chromeVisible ? 1 : 0)

            stickyAddBar
                .opacity(chromeVisible ? 1 : 0)
        }
        .offset(y: dragOffset)
        .scaleEffect(1 - dismissProgress * 0.05, anchor: .center)
        .gesture(dragToDismiss)
        .onAppear {
            withAnimation(reduceMotion ? nil : .patinaChrome) {
                chromeVisible = true
            }
        }
        .statusBarHidden(true)
        // R07: presented as a conditional sibling over the home surface, so
        // assistive tech needs the modal trait (background is also hidden by
        // DailyRoomView) and the standard two-finger-scrub escape gesture.
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape) { dismiss() }
    }

    // MARK: - Hero

    private var hero: some View {
        ZStack(alignment: .topLeading) {
            // R15: real product photo through PatinaAsyncImage when the feed
            // provides one; the category gradient stays as the deliberate
            // no-URL fallback. Matches the card's image area so the
            // matchedGeometryEffect morph stays visually continuous.
            if let imageURL = product.imageURL, let url = URL(string: imageURL) {
                PatinaAsyncImage(url: url)
            } else {
                product.placeholderGradient
            }

            LinearGradient(
                colors: [PatinaColors.charcoal.opacity(0.55), .clear],
                startPoint: .bottom,
                endPoint: .center
            )

            VStack {
                Spacer()
                Text(recommendation.whyCopy)
                    .font(PatinaTypography.patinaVoice)
                    .foregroundStyle(PatinaColors.offWhite)
                    .lineSpacing(4)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 24)
                    .opacity(chromeVisible ? 1 : 0)
            }

            // Tier + Match pills are Patina vocabulary — wrap each in a
            // HelpTooltip so a tap on the pill reveals a one-paragraph
            // explanation pulled from Sanity (fallback inline when CMS
            // hasn't shipped yet). Same surface keys are referenced by
            // the help panel attached to the parent `DailyRoomView`.
            HStack(alignment: .top) {
                HelpTooltip(
                    surfaceKey: SurfaceKeys.IOSApp.Home.tierPill,
                    fallback: "Tier signals how this piece reached Patina — Maker Piece (designer + maker collaboration), Designer's Pick, or Sourced from a vetted catalog."
                ) {
                    TierPill(tier: recommendation.tier)
                }
                Spacer()
                HelpTooltip(
                    surfaceKey: SurfaceKeys.IOSApp.Home.matchPill,
                    fallback: "Match score blends your room's dimensions, style cues, and palette against this piece. Higher means a better fit for the room you're viewing."
                ) {
                    MatchPill(score: recommendation.matchScore)
                }
            }
            .padding(.top, 64)
            .padding(.horizontal, 18)
            .opacity(chromeVisible ? 1 : 0)
        }
    }

    // MARK: - Chrome

    private var topBar: some View {
        HStack {
            BackChevronButton(style: .light) { dismiss() }
            Spacer()
        }
        .padding(.top, 52)
        .padding(.horizontal, 18)
    }

    private func body<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
    }

    private var makerHeader: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(PatinaGradients.earth)
                .frame(width: 34, height: 34)
            VStack(alignment: .leading, spacing: 1) {
                Text(product.makerName)
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.primary)
                Text(product.makerLocation ?? "")
                    .font(PatinaTypography.monoSmall)
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
        }
    }

    private var nameAndPrice: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(product.name)
                .font(PatinaTypography.displaySmall)
                .foregroundStyle(PatinaColors.Text.primary)
                .lineSpacing(2)
            Text(product.formattedPrice)
                // Playfair Medium 22 (matches ProfileView stat values) — no
                // exact token; nearest (h4) drops the Medium weight the price
                // needs, so keep size + scale via relativeTo.
                .font(.custom("PlayfairDisplay-Medium", size: 22, relativeTo: .title2))
                .foregroundStyle(PatinaColors.Text.primary)
        }
    }

    private var whyQuote: some View {
        Text("“\(recommendation.whyCopy)”")
            .font(.custom("PlayfairDisplay-Italic", size: 15, relativeTo: .subheadline))
            .foregroundStyle(PatinaColors.Text.secondary)
            .lineSpacing(4)
    }

    private func insightBlock(_ insight: DailyRecommendation.Insight) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: insight.icon)
                .font(.system(size: 13))
                .foregroundStyle(PatinaColors.Text.secondary)
                .padding(.top, 2)
            Text(insight.text)
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.secondary)
                .lineSpacing(3)
            Spacer(minLength: 0)
        }
        .padding(PatinaSpacing.xsm)
        .background(
            RoundedRectangle(cornerRadius: PatinaRadius.lg, style: .continuous)
                .fill(PatinaColors.Background.secondary)
        )
    }

    private func pairingBlock(_ pairing: DailyRecommendation.Pairing) -> some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(pairing.thumbGradient)
                .frame(width: 40, height: 40)
            Text(pairing.text)
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.secondary)
                .lineSpacing(3)
            Spacer(minLength: 0)
        }
        .padding(PatinaSpacing.xsm)
        .background(
            RoundedRectangle(cornerRadius: PatinaRadius.lg, style: .continuous)
                .fill(PatinaColors.sage.opacity(0.12))
        )
    }

    private func description(_ story: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("About this piece")
                .font(PatinaTypography.monoSmall)
                .tracking(0.8)
                .textCase(.uppercase)
                .foregroundStyle(PatinaColors.Text.muted)
            Text(story)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .lineSpacing(5)
        }
    }

    private var specsGrid: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Details")
                .font(PatinaTypography.monoSmall)
                .tracking(0.8)
                .textCase(.uppercase)
                .foregroundStyle(PatinaColors.Text.muted)
            LazyVGrid(
                columns: [GridItem(.flexible()), GridItem(.flexible())],
                alignment: .leading,
                spacing: 12
            ) {
                specCell(
                    label: "Material",
                    value: product.materialTags.first?.capitalized ?? "Solid wood",
                    helpSurfaceKey: SurfaceKeys.IOSApp.ProductDetail.materials,
                    helpFallback: "Material is what the piece is made of — surfaced from the maker's spec sheet and any third-party certifications we've verified."
                )
                specCell(label: "Style", value: product.styleTags.first?.capitalized ?? "Warm minimal")
                specCell(label: "Lead time", value: "4–6 weeks")
                specCell(label: "Origin", value: product.makerLocation ?? "USA")
            }
        }
    }

    /// Renders one cell in the specs grid. When `helpSurfaceKey` is
    /// non-nil and the label is non-obvious (e.g. "Lead time"), a small
    /// HelpInfoIcon is rendered next to the label so the user can learn
    /// what the value means.
    private func specCell(
        label: String,
        value: String,
        helpSurfaceKey: SurfaceKey? = nil,
        helpFallback: String? = nil
    ) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(label)
                    .font(PatinaTypography.monoSmall)
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.muted)
                if let helpSurfaceKey {
                    HelpInfoIcon(
                        surfaceKey: helpSurfaceKey,
                        fallback: helpFallback,
                        size: 10
                    )
                }
            }
            Text(value)
                .font(PatinaTypography.uiSmall)
                .foregroundStyle(PatinaColors.Text.primary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var stickyAddBar: some View {
        VStack {
            Spacer()
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(product.formattedPrice)
                        .font(PatinaTypography.h5)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Text("\(recommendation.matchScore)% match for your room")
                        .font(PatinaTypography.captionSmall)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
                Spacer()
                Button {
                    // Add-to-room action wired from parent in a follow-up.
                } label: {
                    Text("Add to Room")
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.inverse)
                        .padding(.horizontal, 22)
                        .padding(.vertical, 14)
                        .background(Capsule().fill(PatinaColors.Interactive.active))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 20)
            .padding(.top, 14)
            .padding(.bottom, 34)
            .background(
                PatinaColors.Background.primary
                    .opacity(0.96)
                    .overlay(
                        Rectangle()
                            .frame(height: 0.5)
                            .foregroundStyle(PatinaColors.Text.muted.opacity(0.25)),
                        alignment: .top
                    )
                    .ignoresSafeArea(edges: .bottom)
            )
        }
    }

    // MARK: - Gesture

    private var dragToDismiss: some Gesture {
        DragGesture(minimumDistance: 12, coordinateSpace: .local)
            .onChanged { value in
                guard value.translation.height > 0 else { return }
                dragOffset = value.translation.height
            }
            .onEnded { value in
                if value.translation.height > 120 || value.predictedEndTranslation.height > 240 {
                    dismiss()
                } else {
                    withAnimation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.82)) {
                        dragOffset = 0
                    }
                }
            }
    }

    private func dismiss() {
        withAnimation(reduceMotion ? nil : .easeIn(duration: 0.15)) {
            chromeVisible = false
        }
        // Kick off parent dismissal in the same frame so matched geometry reverses.
        onDismiss()
    }

}

#Preview {
    struct PreviewWrapper: View {
        @Namespace var ns
        var body: some View {
            DailyProductDetailView(
                recommendation: DailyRecommendation.previewAll[0],
                namespace: ns,
                onDismiss: {}
            )
        }
    }
    return PreviewWrapper()
}

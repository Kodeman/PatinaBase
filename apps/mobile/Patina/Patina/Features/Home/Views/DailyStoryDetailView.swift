//
//  DailyStoryDetailView.swift
//  Patina
//

import SwiftUI

struct DailyStoryDetailView: View {
    let story: DailyStory
    let featuredProduct: Product?
    var namespace: Namespace.ID? = nil
    var onDismiss: (() -> Void)? = nil

    @Environment(\.dismiss) private var dismissEnv
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var chromeVisible = false
    @State private var dragOffset: CGFloat = 0

    private var dismissProgress: CGFloat {
        min(1, max(0, dragOffset / 240))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                hero
                bodySection
                    .opacity(chromeVisible ? 1 : 0)
                    .offset(y: chromeVisible ? 0 : 16)
            }
        }
        // SP-18: opening the story is what takes its dot off, and what moves
        // the home on to a story the reader has not read.
        .task { StoryReadStore().markRead(storyId: story.id) }
        .scrollDisabled(dragOffset > 0)
        .background(
            // Deliberately dark immersive reader — stays charcoal in both
            // modes. Not `Background.dark`: that token lifts to a warm grey in
            // dark mode so an *object* drawn on the page can separate from it
            // (C-01). This ground has nothing to separate from — it is the
            // page — so it takes the literal, and its ink is `OnDark.*`.
            PatinaColors.charcoal
                .ignoresSafeArea()
                .opacity(chromeVisible ? 1 - dismissProgress * 0.3 : 0)
        )
        .offset(y: dragOffset)
        .scaleEffect(1 - dismissProgress * 0.05)
        .gesture(dragToDismiss)
        .onAppear {
            withAnimation(reduceMotion ? nil : .patinaChrome) {
                chromeVisible = true
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .statusBar(hidden: true)
        // R07: presented as a conditional sibling over the home surface, so
        // assistive tech needs the modal trait (background is also hidden by
        // DailyRoomView) and the standard two-finger-scrub escape gesture.
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape) { dismiss() }
    }

    private var hero: some View {
        ZStack(alignment: .bottomLeading) {
            Group {
                if let namespace {
                    storyArtwork
                        .matchedGeometryEffect(
                            id: "story-hero-\(story.id)",
                            in: namespace,
                            isSource: false
                        )
                } else {
                    storyArtwork
                }
            }
            .frame(height: 340)

            LinearGradient(
                colors: [PatinaColors.charcoal, .clear],
                startPoint: .bottom,
                endPoint: .top
            )
            .frame(height: 153)
            .frame(maxWidth: .infinity, alignment: .bottom)

            VStack(alignment: .leading, spacing: 5) {
                Text(story.tag)
                    .font(PatinaTypography.monoSmall)
                    .tracking(0.6)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.interactive)
                Text(story.title)
                    .font(PatinaTypography.h2)
                    .foregroundStyle(PatinaColors.offWhite)
                    .lineSpacing(2)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 18)
            .opacity(chromeVisible ? 1 : 0)

            BackChevronButton(style: .dark) { dismiss() }
                .padding(.top, 52)
                .padding(.leading, 14)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .opacity(chromeVisible ? 1 : 0)
        }
        .frame(height: 340)
        .clipped()
    }

    @ViewBuilder
    private var storyArtwork: some View {
        if let heroImageURL = story.heroImageURL {
            PatinaAsyncImage(url: heroImageURL, contentMode: .fill)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()
        } else {
            story.heroGradient
        }
    }

    private var bodySection: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Circle()
                    .fill(story.makerAvatarGradient)
                    .frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 1) {
                    Text(story.makerName)
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.offWhite)
                    Text(story.makerLocation)
                        .font(PatinaTypography.monoSmall)
                        .tracking(0.5)
                        .textCase(.uppercase)
                        .foregroundStyle(PatinaColors.Text.interactive)
                }
            }
            .padding(.bottom, 16)

            Text(story.body)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.OnDark.secondary)
                .lineSpacing(8)
                .padding(.bottom, 18)

            if let product = featuredProduct {
                productCard(product)
            }
        }
        .padding(.top, 22)
        .padding(.horizontal, 20)
        .padding(.bottom, 100)
    }

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
        if let onDismiss {
            onDismiss()
        } else {
            dismissEnv()
        }
    }

    private func productCard(_ product: Product) -> some View {
        VStack(spacing: 0) {
            PatinaAsyncImage(
                url: product.imageURL.flatMap(URL.init(string:)),
                caption: product.name
            )
            .frame(height: 160)
            .clipped()
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(product.name)
                        .font(PatinaTypography.uiSmall)
                        .foregroundStyle(PatinaColors.offWhite)
                    Text(product.formattedPrice)
                        .font(PatinaTypography.h5)
                        .foregroundStyle(PatinaColors.offWhite)
                }
                Spacer()
                Text("View")
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.offWhite)
                    .padding(.vertical, 8)
                    .padding(.horizontal, 14)
                    .background(Capsule().fill(PatinaColors.clayInk))
            }
            .padding(12)
        }
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(PatinaColors.offWhite.opacity(0.06))
        )
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

#if DEBUG
#Preview {
    NavigationStack {
        DailyStoryDetailView(story: .preview, featuredProduct: Product.previewProducts[0])
    }
}
#endif

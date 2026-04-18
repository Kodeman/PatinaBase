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
        .scrollDisabled(dragOffset > 0)
        .background(
            PatinaColors.charcoal
                .ignoresSafeArea()
                .opacity(chromeVisible ? 1 - dismissProgress * 0.3 : 0)
        )
        .offset(y: dragOffset)
        .scaleEffect(1 - dismissProgress * 0.05)
        .gesture(dragToDismiss)
        .onAppear {
            withAnimation(.patinaChrome) {
                chromeVisible = true
            }
        }
        .navigationBarHidden(true)
        .statusBar(hidden: true)
        .toolbar(.hidden, for: .navigationBar)
    }

    private var hero: some View {
        ZStack(alignment: .bottomLeading) {
            Group {
                if let namespace {
                    story.heroGradient
                        .matchedGeometryEffect(
                            id: "story-hero-\(story.id)",
                            in: namespace,
                            isSource: false
                        )
                } else {
                    story.heroGradient
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
                    .font(.custom("DMMono-Regular", size: 8))
                    .tracking(0.6)
                    .textCase(.uppercase)
                    .foregroundColor(PatinaColors.clay)
                Text(story.title)
                    .font(.custom("PlayfairDisplay-Regular", size: 26))
                    .foregroundColor(PatinaColors.offWhite)
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

    private var bodySection: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Circle()
                    .fill(story.makerAvatarGradient)
                    .frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 1) {
                    Text(story.makerName)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(PatinaColors.offWhite)
                    Text(story.makerLocation)
                        .font(.custom("DMMono-Regular", size: 8))
                        .tracking(0.5)
                        .textCase(.uppercase)
                        .foregroundColor(PatinaColors.clay)
                }
            }
            .padding(.bottom, 16)

            Text(story.body)
                .font(.system(size: 14))
                .foregroundColor(PatinaColors.pearl)
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
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                        dragOffset = 0
                    }
                }
            }
    }

    private func dismiss() {
        withAnimation(.easeIn(duration: 0.15)) {
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
            product.placeholderGradient
                .frame(height: 160)
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(product.name)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(PatinaColors.offWhite)
                    Text(product.formattedPrice)
                        .font(.custom("PlayfairDisplay-Medium", size: 16))
                        .foregroundColor(PatinaColors.offWhite)
                }
                Spacer()
                Text("View")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(PatinaColors.offWhite)
                    .padding(.vertical, 8)
                    .padding(.horizontal, 14)
                    .background(Capsule().fill(PatinaColors.clay))
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

#Preview {
    NavigationStack {
        DailyStoryDetailView(story: .mock, featuredProduct: Product.mockProducts[0])
    }
}

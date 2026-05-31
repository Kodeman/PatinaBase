//
//  RecommendationsView.swift
//  Patina
//
//  Product recommendations grid with filter chips, match scores, and swipe gestures
//

import SwiftUI
import SwiftData

struct RecommendationsView: View {
    @Environment(\.appCoordinator) private var coordinator
    @Environment(\.modelContext) private var modelContext
    @State private var viewModel = RecommendationsViewModel()

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            VStack(alignment: .leading, spacing: 4) {
                Text("Perfect for your space")
                    .font(PatinaTypography.h4)
                    .foregroundStyle(PatinaColors.charcoal)

                Text(viewModel.headerSubtitle)
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.agedOak)
            }
            .padding(.top, 56)
            .padding(.horizontal, 24)
            .padding(.bottom, 12)

            // Filter bar
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(viewModel.filters, id: \.self) { filter in
                        FilterChip(title: filter, isActive: filter == viewModel.activeFilter) {
                            withAnimation(.spring(response: 0.3)) {
                                viewModel.activeFilter = filter
                            }
                        }
                    }
                }
                .padding(.horizontal, 24)
            }
            .padding(.bottom, 12)

            // Product grid
            if viewModel.isLoading {
                loadingView
            } else {
                ScrollView(showsIndicators: false) {
                    LazyVGrid(columns: [
                        GridItem(.flexible(), spacing: 12),
                        GridItem(.flexible(), spacing: 12)
                    ], spacing: 12) {
                        ForEach(viewModel.filteredProducts) { product in
                            productCard(product)
                                .onAppear { viewModel.trackView(product) }
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.bottom, 120)
                }
            }
        }
        .background(PatinaColors.offWhite)
        .toolbarTitleDisplayMode(.inline)
        .task {
            await viewModel.loadRecommendations()
        }
    }

    // MARK: - Product Card

    private func productCard(_ product: Product) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Image with overlays
            ZStack(alignment: .topLeading) {
                // Product image or gradient placeholder
                if let imageURL = product.imageURL, let url = URL(string: imageURL) {
                    AsyncImage(url: url) { image in
                        image.resizable().aspectRatio(contentMode: .fill)
                    } placeholder: {
                        product.placeholderGradient
                    }
                    .frame(height: 160)
                    .clipped()
                } else {
                    product.placeholderGradient
                        .frame(height: 160)
                }

                // Match badge
                Text(product.matchLabel)
                    .font(PatinaTypography.monoSmall)
                    .foregroundStyle(PatinaColors.mocha)
                    .tracking(0.3)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(.ultraThinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .padding(8)

                // Save button
                VStack {
                    HStack {
                        Spacer()
                        Button {
                            viewModel.saveProduct(product, context: modelContext)
                        } label: {
                            Circle()
                                .fill(.ultraThinMaterial)
                                .frame(width: 30, height: 30)
                                .overlay(
                                    Image(systemName: "heart")
                                        .font(.system(size: 14))
                                        .foregroundStyle(PatinaColors.mocha)
                                )
                                .contentShape(Rectangle())
                        }
                        .accessibilityLabel("Save to favorites")
                        .accessibilityHint("Saves \(product.name) to your collection.")
                        .padding(8)
                    }
                }
            }

            // Info
            VStack(alignment: .leading, spacing: 2) {
                MonoLabel(text: product.makerName, size: PatinaTypography.monoSmall)

                Text(product.name)
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.charcoal)
                    .lineLimit(2)
                    .padding(.top, 2)

                Text(product.fullFormattedPrice)
                    .font(PatinaTypography.h5)
                    .foregroundStyle(PatinaColors.charcoal)
                    .padding(.top, 4)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
        .background(PatinaColors.softCream)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .onTapGesture {
            coordinator.navigate(to: .pieceDetail(pieceId: product.id))
        }
        // Swipe gestures
        .gesture(
            DragGesture(minimumDistance: 50)
                .onEnded { value in
                    let horizontal = value.translation.width
                    let vertical = value.translation.height

                    if abs(horizontal) > abs(vertical) {
                        if horizontal > 0 {
                            // Swipe right → save
                            viewModel.saveProduct(product, context: modelContext)
                        } else {
                            // Swipe left → skip
                            viewModel.skipProduct(product)
                        }
                    } else if vertical < -50 {
                        // Swipe up → share (future)
                    }
                }
        )
        // PT-2-5: collapse maker/name/price into one VoiceOver stop.
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(product.name) by \(product.makerName), \(product.fullFormattedPrice), \(product.matchLabel)")
        .accessibilityHint("Double-tap to view details.")
        // PT-2-4: expose the swipe-to-save / swipe-to-skip gestures as
        // VoiceOver actions, since the swipe itself is inaccessible.
        .accessibilityAction(named: "Save") {
            viewModel.saveProduct(product, context: modelContext)
        }
        .accessibilityAction(named: "Skip") {
            viewModel.skipProduct(product)
        }
    }

    // MARK: - Loading View

    private var loadingView: some View {
        VStack(spacing: 16) {
            Spacer()
            // Strata Mark loading animation
            VStack(spacing: 4) {
                ForEach(0..<3, id: \.self) { i in
                    Capsule()
                        .fill(PatinaColors.clay.opacity(Double(3 - i) / 3))
                        .frame(width: CGFloat(60 - i * 12), height: 2)
                }
            }
            Text("Curating your pieces...")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.agedOak)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
}

#Preview {
    RecommendationsView()
        .environment(\.appCoordinator, AppCoordinator())
}

//
//  RecommendationsView.swift
//  Patina
//
//  Product recommendations grid with filter chips and match scores
//

import SwiftUI

struct RecommendationsView: View {
    @State private var activeFilter = "All"

    private let filters = ["All", "Seating", "Tables", "Lighting", "Storage"]

    private let products: [PlaceholderProduct] = [
        PlaceholderProduct(name: "Walnut Lounge Chair", maker: "Chilton Furniture", price: "$2,850", match: "92% match", gradient: PatinaGradients.leather),
        PlaceholderProduct(name: "Linen Sectional Sofa", maker: "Shoppe Amber", price: "$3,200", match: "88% match", gradient: PatinaGradients.linen),
        PlaceholderProduct(name: "Cherry Coffee Table", maker: "Thos. Moser", price: "$1,890", match: "85% match", gradient: PatinaGradients.wood),
        PlaceholderProduct(name: "Woven Floor Lamp", maker: "Lostine", price: "$475", match: "82% match", gradient: PatinaGradients.rattan),
        PlaceholderProduct(name: "Marble Side Table", maker: "Blu Dot", price: "$1,200", match: "79% match", gradient: PatinaGradients.stone),
        PlaceholderProduct(name: "Brass Pendant Light", maker: "Schoolhouse", price: "$550", match: "76% match", gradient: PatinaGradients.metal),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            VStack(alignment: .leading, spacing: 4) {
                Text("Perfect for your space")
                    .font(PatinaTypography.h4)
                    .foregroundColor(PatinaColors.charcoal)

                Text("18 pieces curated for your living room")
                    .font(PatinaTypography.uiSmall)
                    .foregroundColor(PatinaColors.agedOak)
            }
            .padding(.top, 56)
            .padding(.horizontal, 24)
            .padding(.bottom, 12)

            // Filter bar
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(filters, id: \.self) { filter in
                        FilterChip(title: filter, isActive: filter == activeFilter) {
                            activeFilter = filter
                        }
                    }
                }
                .padding(.horizontal, 24)
            }
            .padding(.bottom, 12)

            // Product grid
            ScrollView(showsIndicators: false) {
                LazyVGrid(columns: [
                    GridItem(.flexible(), spacing: 12),
                    GridItem(.flexible(), spacing: 12)
                ], spacing: 12) {
                    ForEach(products) { product in
                        productCard(product)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 120) // Companion space
            }
        }
        .background(PatinaColors.offWhite)
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Product Card

    private func productCard(_ product: PlaceholderProduct) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Image
            ZStack(alignment: .topLeading) {
                product.gradient
                    .frame(height: 160)

                // Match badge
                Text(product.match)
                    .font(PatinaTypography.monoSmall)
                    .foregroundColor(PatinaColors.mocha)
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
                        Circle()
                            .fill(.ultraThinMaterial)
                            .frame(width: 30, height: 30)
                            .overlay(
                                Image(systemName: "heart")
                                    .font(.system(size: 14))
                                    .foregroundColor(PatinaColors.mocha)
                            )
                            .padding(8)
                    }
                }
            }

            // Info
            VStack(alignment: .leading, spacing: 2) {
                MonoLabel(text: product.maker, size: PatinaTypography.monoSmall)

                Text(product.name)
                    .font(PatinaTypography.uiSmall)
                    .foregroundColor(PatinaColors.charcoal)
                    .lineLimit(2)
                    .padding(.top, 2)

                Text(product.price)
                    .font(PatinaTypography.h5)
                    .foregroundColor(PatinaColors.charcoal)
                    .padding(.top, 4)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
        .background(PatinaColors.softCream)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

// MARK: - Placeholder Data

struct PlaceholderProduct: Identifiable {
    let id = UUID()
    let name: String
    let maker: String
    let price: String
    let match: String
    let gradient: LinearGradient
}

#Preview {
    RecommendationsView()
}

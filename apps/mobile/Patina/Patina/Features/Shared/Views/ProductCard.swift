//
//  ProductCard.swift
//  Patina
//
//  Shared product card used in Collections (saved items, board previews)
//  and anywhere a compact, tappable product summary is needed.
//
//  The editorial variant used on the daily home lives in
//  Features/Home/Views/DailyProductCard.swift — it's tightly coupled to
//  DailyRecommendation (why-copy, tier, match, insight, pairing, matched
//  geometry) and intentionally kept separate. This file handles the
//  non-editorial cases so Collections stops rolling its own row layout.
//

import SwiftUI

// MARK: - Data

/// Minimal data a compact product card needs. Adapters keep view models
/// free from UI concerns.
public struct ProductCardData: Identifiable, Hashable {
    public let id: String
    public let name: String
    public let makerName: String?
    public let formattedPrice: String?
    public let imageURL: String?

    public init(
        id: String,
        name: String,
        makerName: String? = nil,
        formattedPrice: String? = nil,
        imageURL: String? = nil
    ) {
        self.id = id
        self.name = name
        self.makerName = makerName
        self.formattedPrice = formattedPrice
        self.imageURL = imageURL
    }
}

// MARK: - Card

/// Compact product card. Matches the visual language of `DailyProductCard`
/// (PlayfairDisplay price, DMMono maker line, softCream background,
/// 14pt corner radius) without the editorial overlays.
public struct ProductCard: View {
    public enum Style {
        /// Standalone card used in lists (saved items tab).
        case list
        /// Small tile used in grid board previews.
        case tile
    }

    let data: ProductCardData
    let style: Style
    let onTap: () -> Void

    public init(
        data: ProductCardData,
        style: Style = .list,
        onTap: @escaping () -> Void
    ) {
        self.data = data
        self.style = style
        self.onTap = onTap
    }

    public var body: some View {
        Button(action: onTap) {
            switch style {
            case .list:
                listLayout
            case .tile:
                tileLayout
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - List (saved items)

    private var listLayout: some View {
        HStack(spacing: 14) {
            thumbnail
                .frame(width: 72, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                if let maker = data.makerName, !maker.isEmpty {
                    Text(maker)
                        .font(.custom("DMMono-Regular", size: 7))
                        .tracking(0.5)
                        .textCase(.uppercase)
                        .foregroundColor(PatinaColors.agedOak)
                }
                Text(data.name)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(PatinaColors.charcoal)
                    .lineLimit(2)
                if let price = data.formattedPrice {
                    Text(price)
                        .font(.custom("PlayfairDisplay-Medium", size: 16))
                        .foregroundColor(PatinaColors.charcoal)
                        .padding(.top, 2)
                }
            }

            Spacer(minLength: 0)

            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(PatinaColors.agedOak)
        }
        .padding(12)
        .background(PatinaColors.softCream)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    // MARK: - Tile (board preview grid)

    private var tileLayout: some View {
        thumbnail
            .aspectRatio(1, contentMode: .fill)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(alignment: .bottomLeading) {
                if let price = data.formattedPrice {
                    Text(price)
                        .font(.custom("PlayfairDisplay-Medium", size: 11))
                        .foregroundColor(PatinaColors.offWhite)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(
                            Capsule().fill(PatinaColors.charcoal.opacity(0.7))
                        )
                        .padding(6)
                }
            }
    }

    // MARK: - Thumbnail

    @ViewBuilder
    private var thumbnail: some View {
        if let urlString = data.imageURL, let url = URL(string: urlString) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                case .failure, .empty:
                    PatinaGradients.warm
                @unknown default:
                    PatinaGradients.warm
                }
            }
        } else {
            PatinaGradients.warm
        }
    }
}

// MARK: - Adapters

public extension ProductCardData {
    init(tableItem item: TableItemModel) {
        self.init(
            id: item.id.uuidString,
            name: item.name,
            makerName: item.brandName,
            formattedPrice: item.formattedPrice,
            imageURL: item.imageURL
        )
    }
}

//
//  TableItemCard.swift
//  Patina
//
//  A draggable card representing a furniture piece on the Table
//

import SwiftUI

/// A draggable card for items on the Table
public struct TableItemCard: View {

    // MARK: - Properties

    let item: TableItemModel
    let isSelected: Bool
    let onTap: () -> Void
    let onDragChanged: (CGPoint) -> Void
    let onDragEnded: (CGPoint, CGPoint) -> Void // position, velocity

    @State private var isDragging = false
    @State private var dragOffset: CGSize = .zero

    // MARK: - Constants

    private let cardSize: CGSize = CGSize(width: 140, height: 160)

    // MARK: - Body

    public var body: some View {
        VStack(spacing: 0) {
            // Image area
            imageArea

            // Info area
            infoArea
        }
        .frame(width: cardSize.width, height: cardSize.height)
        .patinaEffect(days: item.daysSinceSaved)
        .scaleEffect(isDragging ? 1.05 : (isSelected ? 1.02 : 1.0))
        .shadow(
            color: .black.opacity(isDragging ? 0.3 : 0.1),
            radius: isDragging ? 12 : 6,
            x: 0,
            y: isDragging ? 8 : 3
        )
        .offset(dragOffset)
        .gesture(dragGesture)
        .onTapGesture {
            onTap()
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isDragging)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isSelected)
    }

    // MARK: - Subviews

    private var imageArea: some View {
        ZStack {
            // Background
            PatinaColors.offWhite

            // Image or placeholder
            if let imageURL = item.imageURL, let url = URL(string: imageURL) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    case .failure:
                        imagePlaceholder
                    case .empty:
                        ProgressView()
                            .tint(PatinaColors.clayBeige)
                    @unknown default:
                        imagePlaceholder
                    }
                }
            } else {
                imagePlaceholder
            }

            // Patina badge
            VStack {
                HStack {
                    Spacer()
                    PatinaBadge(level: PatinaLevel(days: item.daysSinceSaved))
                        .padding(PatinaSpacing.xxs)
                }
                Spacer()
            }

            // Selection indicator
            if isSelected {
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(PatinaColors.mochaBrown, lineWidth: 3)
            }
        }
        .frame(height: cardSize.height * 0.65)
        .clipped()
    }

    private var imagePlaceholder: some View {
        VStack(spacing: PatinaSpacing.xxs) {
            Image(systemName: "chair.lounge.fill")
                .font(.system(size: 32))
                .foregroundStyle(PatinaColors.clayBeige)

            Text(item.name.prefix(1))
                .font(PatinaTypography.displaySmall)
                .foregroundStyle(PatinaColors.clayBeige.opacity(0.5))
        }
    }

    private var infoArea: some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.xxxs) {
            // Name
            Text(item.name)
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.charcoal)
                .lineLimit(1)

            // Brand or price
            HStack {
                if let brand = item.brandName {
                    Text(brand)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.mochaBrown)
                        .lineLimit(1)
                }

                Spacer()

                if let price = item.formattedPrice {
                    Text(price)
                        .font(PatinaTypography.captionMedium)
                        .foregroundStyle(PatinaColors.charcoal)
                }
            }

            // Age indicator
            Text(item.ageDescription)
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.clayBeige)
        }
        .padding(.horizontal, PatinaSpacing.xs)
        .padding(.vertical, PatinaSpacing.xxs)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.offWhite)
    }

    // MARK: - Gestures

    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                if !isDragging {
                    isDragging = true
                    HapticManager.shared.impact(.medium)
                }

                dragOffset = value.translation
                let currentPosition = CGPoint(
                    x: item.position.x + value.translation.width,
                    y: item.position.y + value.translation.height
                )
                onDragChanged(currentPosition)
            }
            .onEnded { value in
                isDragging = false

                let finalPosition = CGPoint(
                    x: item.position.x + value.translation.width,
                    y: item.position.y + value.translation.height
                )
                let velocity = CGPoint(
                    x: value.velocity.width,
                    y: value.velocity.height
                )

                onDragEnded(finalPosition, velocity)
                dragOffset = .zero
            }
    }
}

// MARK: - Compact Card Variant

/// A smaller card variant for list views
public struct TableItemCardCompact: View {

    let item: TableItemModel
    let onTap: () -> Void

    public var body: some View {
        HStack(spacing: PatinaSpacing.sm) {
            // Thumbnail
            thumbnailView
                .frame(width: 60, height: 60)
                .patinaEffect(days: item.daysSinceSaved, animated: false)

            // Info
            VStack(alignment: .leading, spacing: PatinaSpacing.xxxs) {
                Text(item.name)
                    .font(PatinaTypography.bodyMedium)
                    .foregroundStyle(PatinaColors.charcoal)
                    .lineLimit(1)

                if let brand = item.brandName {
                    Text(brand)
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.mochaBrown)
                }

                HStack {
                    PatinaBadge(level: PatinaLevel(days: item.daysSinceSaved))

                    Spacer()

                    if let price = item.formattedPrice {
                        Text(price)
                            .font(PatinaTypography.bodySmallMedium)
                            .foregroundStyle(PatinaColors.charcoal)
                    }
                }
            }

            Spacer()

            // Chevron
            Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(PatinaColors.clayBeige)
        }
        .padding(PatinaSpacing.sm)
        .background(PatinaColors.offWhite)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .onTapGesture {
            onTap()
        }
    }

    private var thumbnailView: some View {
        ZStack {
            PatinaColors.clayBeige.opacity(0.2)

            if let imageURL = item.imageURL, let url = URL(string: imageURL) {
                AsyncImage(url: url) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } placeholder: {
                    ProgressView()
                        .tint(PatinaColors.clayBeige)
                }
            } else {
                Image(systemName: "chair.lounge.fill")
                    .font(.system(size: 24))
                    .foregroundStyle(PatinaColors.clayBeige)
            }
        }
        .clipped()
    }
}

// MARK: - Preview

#Preview("Table Item Card") {
    let item = TableItemModel(
        name: "Mid-Century Lounge Chair",
        productId: "123",
        savedAt: Date().addingTimeInterval(-86400 * 15),
        brandName: "Herman Miller",
        priceInCents: 289900
    )

    VStack(spacing: 20) {
        TableItemCard(
            item: item,
            isSelected: false,
            onTap: {},
            onDragChanged: { _ in },
            onDragEnded: { _, _ in }
        )

        TableItemCard(
            item: item,
            isSelected: true,
            onTap: {},
            onDragChanged: { _ in },
            onDragEnded: { _, _ in }
        )

        TableItemCardCompact(item: item, onTap: {})
            .padding(.horizontal)
    }
    .padding()
    .background(Color.gray.opacity(0.1))
}

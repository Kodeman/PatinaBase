//
//  ProductDetailView.swift
//  Patina
//
//  Product detail screen with hero image, maker story, and action bar
//

import SwiftUI

struct ProductDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var isSaved = false

    // Placeholder data
    let productName: String
    let maker: String
    let location: String
    let price: String
    let match: String
    let gradient: LinearGradient

    init(
        productName: String = "Walnut Lounge Chair",
        maker: String = "Chilton Furniture",
        location: String = "Freeport, ME",
        price: String = "$2,850",
        match: String = "92% match",
        gradient: LinearGradient = PatinaGradients.leather
    ) {
        self.productName = productName
        self.maker = maker
        self.location = location
        self.price = price
        self.match = match
        self.gradient = gradient
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    // Hero image
                    ZStack(alignment: .top) {
                        gradient
                            .frame(height: 340)

                        // Top bar
                        HStack {
                            Button { dismiss() } label: {
                                floatingCircleButton(icon: "chevron.left")
                            }

                            Spacer()

                            Button {} label: {
                                floatingCircleButton(icon: "square.and.arrow.up")
                            }

                            Button { isSaved.toggle() } label: {
                                floatingCircleButton(icon: isSaved ? "heart.fill" : "heart")
                            }
                        }
                        .padding(.top, 56)
                        .padding(.horizontal, 16)
                    }

                    // Content
                    VStack(alignment: .leading, spacing: 0) {
                        // Maker tag
                        MonoLabel(text: "\(maker) · \(location)", color: PatinaColors.clay)
                            .padding(.bottom, 6)

                        // Product name
                        Text(productName)
                            .font(PatinaTypography.h2)
                            .foregroundColor(PatinaColors.charcoal)
                            .padding(.bottom, 4)

                        Text("Hand-turned in Maine since 1904")
                            .font(PatinaTypography.bodySmall)
                            .foregroundColor(PatinaColors.agedOak)
                            .padding(.bottom, 16)

                        // Price row
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text(price)
                                .font(.custom("PlayfairDisplay-Medium", size: 28))
                                .foregroundColor(PatinaColors.charcoal)

                            Text(match)
                                .font(PatinaTypography.mono)
                                .foregroundColor(PatinaColors.success)
                                .tracking(0.3)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(PatinaColors.success.opacity(0.12))
                                .clipShape(Capsule())
                        }
                        .padding(.bottom, 16)

                        // Material badges
                        FlowLayout(spacing: 8) {
                            materialBadge(icon: "🌿", text: "FSC Certified")
                            materialBadge(icon: "✋", text: "Handcrafted")
                            materialBadge(icon: "📍", text: "Made in USA")
                        }
                        .padding(.bottom, 20)

                        // Maker story
                        makerStoryCard
                            .padding(.bottom, 120) // Bottom bar space
                    }
                    .padding(24)
                }
            }

            // Bottom action bar
            bottomBar
        }
        .background(PatinaColors.offWhite)
        .navigationBarHidden(true)
    }

    // MARK: - Components

    private func floatingCircleButton(icon: String) -> some View {
        Circle()
            .fill(.ultraThinMaterial)
            .frame(width: 36, height: 36)
            .overlay(
                Image(systemName: icon)
                    .font(.system(size: 16))
                    .foregroundColor(PatinaColors.charcoal)
            )
    }

    private func materialBadge(icon: String, text: String) -> some View {
        HStack(spacing: 5) {
            Text(icon)
                .font(.system(size: 12))
            Text(text)
                .font(.system(size: 11))
                .foregroundColor(PatinaColors.mocha)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(PatinaColors.softCream)
        .clipShape(Capsule())
    }

    private var makerStoryCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Circle()
                    .fill(PatinaGradients.earth)
                    .frame(width: 44, height: 44)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Jonathan Chilton")
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundColor(PatinaColors.charcoal)

                    MonoLabel(text: "Third-Generation Woodworker", size: PatinaTypography.monoSmall)
                }
            }

            Text("\u{201C}Each chair starts as a conversation with the wood. Walnut tells you where it wants to bend.\u{201D}")
                .font(PatinaTypography.bodySmall)
                .foregroundColor(PatinaColors.mocha)
                .italic()
                .lineSpacing(4)
        }
        .padding(20)
        .background(PatinaColors.softCream)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var bottomBar: some View {
        HStack(spacing: 12) {
            // AR button
            Button {} label: {
                Circle()
                    .fill(PatinaColors.softCream)
                    .frame(width: 50, height: 50)
                    .overlay(
                        Image(systemName: "arkit")
                            .font(.system(size: 18))
                            .foregroundColor(PatinaColors.charcoal)
                    )
            }

            // Add to room button
            Button {} label: {
                Text("Add to Room")
                    .font(PatinaTypography.uiAction)
                    .foregroundColor(PatinaColors.offWhite)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(PatinaColors.charcoal)
                    .clipShape(Capsule())
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
        .padding(.bottom, 36)
        .background(
            PatinaColors.offWhite
                .shadow(color: PatinaColors.mocha.opacity(0.08), radius: 8, y: -4)
        )
    }
}

// MARK: - Flow Layout

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrange(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(proposal: proposal, subviews: subviews)
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y), proposal: .unspecified)
        }
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var maxHeight: CGFloat = 0
        var rowMaxY: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth && x > 0 {
                x = 0
                y = rowMaxY + spacing
            }
            positions.append(CGPoint(x: x, y: y))
            rowMaxY = max(rowMaxY, y + size.height)
            x += size.width + spacing
            maxHeight = max(maxHeight, y + size.height)
        }

        return (CGSize(width: maxWidth, height: maxHeight), positions)
    }
}

#Preview {
    ProductDetailView()
}

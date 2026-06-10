//
//  ProductDetailView.swift
//  Patina
//
//  Product detail screen with hero image, maker story, and action bar
//

import SwiftUI
import SwiftData

struct ProductDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appCoordinator) private var coordinator
    @Environment(\.modelContext) private var modelContext
    @State private var viewModel = ProductDetailViewModel()

    /// Drives the contextual help-panel sheet for the Product Detail surface.
    /// Triggered by the `?` floating button in the top bar.
    @State private var isHelpPanelPresented: Bool = false

    /// Product ID to load (from navigation)
    var productId: String?

    /// Direct product injection (for previews or when already loaded)
    var product: Product?

    /// Room context preserved from the entry point (Daily Room chip, search, etc.)
    var roomLocalId: UUID?
    var roomRemoteId: String?
    var spatialContext: [String: String] = [:]

    private var displayProduct: Product? {
        product ?? viewModel.product
    }

    var body: some View {
        Group {
            if let product = displayProduct {
                productContent(product)
            } else if viewModel.isLoading {
                loadingView
            } else {
                errorView
            }
        }
        .background(PatinaColors.Background.primary)
        .toolbar(.hidden, for: .navigationBar)
        // Contextual help panel — `?` floating button in the top bar
        // toggles `isHelpPanelPresented`. Empty state ships until Sanity
        // authoring catches up (Sprint 2 expectation).
        .helpPanel(
            isPresented: $isHelpPanelPresented,
            surfaceKey: SurfaceKeys.IOSApp.ProductDetail.root
        )
        .task {
            viewModel.attachRoomContext(
                localId: roomLocalId,
                remoteId: roomRemoteId,
                spatialContext: spatialContext
            )
            if product == nil, let productId {
                await viewModel.loadProduct(id: productId)
            }
            viewModel.trackView()
        }
    }

    // MARK: - Product Content

    private func productContent(_ product: Product) -> some View {
        ZStack(alignment: .bottom) {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    // Hero image — rendered through PatinaAsyncImage (R15)
                    // so loading/failure states show the branded strata
                    // placeholder instead of a bare rectangle. The category
                    // gradient remains the deliberate no-URL fallback.
                    ZStack(alignment: .top) {
                        if let imageURL = product.imageURL, let url = URL(string: imageURL) {
                            PatinaAsyncImage(url: url)
                                .frame(height: 340)
                                .frame(maxWidth: .infinity)
                                .clipped()
                        } else {
                            product.placeholderGradient
                                .frame(height: 340)
                        }

                        // Top bar — back, help, share, and save actions.
                        HStack(spacing: 8) {
                            Button { dismiss() } label: {
                                floatingCircleButton(icon: "chevron.left")
                            }
                            .accessibilityLabel("Back")

                            Spacer()

                            // Contextual help panel — tap the `?` chip to open
                            // a sheet listing every help article for this
                            // surface (`ios-app/product-detail`).
                            Button {
                                isHelpPanelPresented = true
                            } label: {
                                floatingCircleButton(icon: "questionmark")
                            }
                            .accessibilityLabel("Help")
                            .accessibilityHint("Opens the help panel for this product.")
                            .accessibilityIdentifier("ProductDetailView.HelpButton")

                            // Share button — real ShareLink (R25) sharing the
                            // product name + its portal URL. Not wrapped in
                            // HelpTooltip: the tooltip's tap-to-reveal gesture
                            // would conflict with the ShareLink's own tap
                            // (same pattern as the AR button below), so the
                            // share-action help copy ships through the help
                            // panel (`?` button) instead.
                            ShareLink(
                                item: Self.shareURL(for: product),
                                subject: Text(product.name),
                                message: Text("\(product.name) by \(product.makerName) on Patina")
                            ) {
                                floatingCircleButton(icon: "square.and.arrow.up")
                            }
                            .simultaneousGesture(TapGesture().onEnded {
                                viewModel.trackShare()
                            })
                            .accessibilityLabel("Share")
                            .accessibilityHint("Shares a link to this piece.")
                            .accessibilityIdentifier("ProductDetailView.ShareButton")

                            Button { viewModel.toggleSave(context: modelContext) } label: {
                                floatingCircleButton(icon: viewModel.isSaved ? "heart.fill" : "heart")
                            }
                            .accessibilityLabel(viewModel.isSaved ? "Remove from saved" : "Save")
                        }
                        .padding(.top, 56)
                        .padding(.horizontal, 16)
                    }

                    // Content
                    VStack(alignment: .leading, spacing: 0) {
                        // Maker tag
                        MonoLabel(
                            text: [product.makerName, product.makerLocation].compactMap { $0 }.joined(separator: " · "),
                            color: PatinaColors.clay
                        )
                        .padding(.bottom, 6)

                        // Product name
                        Text(product.name)
                            .font(PatinaTypography.h2)
                            .foregroundStyle(PatinaColors.Text.primary)
                            .padding(.bottom, 4)

                        // Subtitle (provenance)
                        if !product.materialTags.isEmpty {
                            Text(product.materialTags.map { $0.capitalized }.joined(separator: " · "))
                                .font(PatinaTypography.bodySmall)
                                .foregroundStyle(PatinaColors.Text.muted)
                                .padding(.bottom, 16)
                        }

                        // Price row — full price + room-aware match label.
                        // The match pill is wrapped in HelpTooltip because
                        // the percentage is a Patina concept (computed
                        // against the active room's dimensions, style
                        // cues, and palette).
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text(product.fullFormattedPrice)
                                .font(PatinaTypography.displaySmall)
                                .foregroundStyle(PatinaColors.Text.primary)

                            HelpTooltip(
                                surfaceKey: SurfaceKeys.IOSApp.Home.matchPill,
                                fallback: "Match score blends your room's dimensions, style cues, and palette against this piece. Higher means a better fit for the room you're viewing."
                            ) {
                                Text(product.matchLabel)
                                    .font(PatinaTypography.mono)
                                    .foregroundStyle(PatinaColors.success)
                                    .tracking(0.3)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 4)
                                    .background(PatinaColors.success.opacity(0.12))
                                    .clipShape(Capsule())
                            }
                        }
                        .padding(.bottom, 16)

                        // Room-aware "Place in your room" header + spatial pills.
                        // Patina-specific concept — the pills explain why
                        // the piece fits this specific room. A HelpInfoIcon
                        // surfaces the deeper "what is spatial context"
                        // explanation without taking screen space.
                        if viewModel.roomContextRemoteId != nil {
                            HStack(alignment: .firstTextBaseline, spacing: 4) {
                                Text("Place in your room")
                                    .font(PatinaTypography.caption)
                                    .foregroundStyle(PatinaColors.Text.secondary)
                                HelpInfoIcon(
                                    surfaceKey: SurfaceKeys.IOSApp.ProductDetail.spatialContext,
                                    fallback: "Spatial cues compare the piece against your room's scale, lighting, and existing palette. Pills below summarize what fits and what to watch for.",
                                    size: 12
                                )
                            }
                            .padding(.bottom, 6)
                        }
                        if !viewModel.spatialContext.isEmpty {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 6) {
                                    ForEach(
                                        Array(viewModel.spatialContext.sorted(by: { $0.key < $1.key })),
                                        id: \.key
                                    ) { _, value in
                                        Text(value)
                                            .font(PatinaTypography.caption)
                                            .foregroundStyle(PatinaColors.Text.primary)
                                            .padding(.horizontal, 10)
                                            .padding(.vertical, 5)
                                            .background(
                                                Capsule().fill(PatinaColors.sage.opacity(0.15))
                                            )
                                    }
                                }
                            }
                            .padding(.bottom, 16)
                        }

                        // Material badges — sustainability + origin claims
                        // (FSC, handcrafted, Made in USA, etc.). HelpInfoIcon
                        // lets the user dig into what each claim means and
                        // how Patina verifies them.
                        if !product.badges.isEmpty {
                            HStack(alignment: .center, spacing: 6) {
                                Text("Provenance")
                                    .font(PatinaTypography.monoSmall)
                                    .tracking(0.5)
                                    .textCase(.uppercase)
                                    .foregroundStyle(PatinaColors.Text.muted)
                                HelpInfoIcon(
                                    surfaceKey: SurfaceKeys.IOSApp.ProductDetail.materials,
                                    fallback: "Provenance badges signal verified claims about materials, craft, and origin. Tap a badge family to read how Patina vets each one.",
                                    size: 12
                                )
                                Spacer()
                            }
                            .padding(.bottom, 6)

                            FlowLayout(spacing: 8) {
                                ForEach(product.badges, id: \.self) { badge in
                                    materialBadge(text: badge.badgeDisplayName)
                                }
                            }
                            .padding(.bottom, 20)
                        }

                        // Maker story
                        if let story = product.makerStory {
                            makerStoryCard(
                                name: product.makerName,
                                location: product.makerLocation,
                                story: story
                            )
                            .padding(.bottom, 120)
                        } else {
                            Spacer()
                                .frame(height: 120)
                        }
                    }
                    .padding(24)
                }
            }

            // Bottom action bar
            bottomBar(product: product)
        }
    }

    // MARK: - Components

    /// Portal deep link for a piece — matches the designer-portal product
    /// detail route at `app/(portal)/portal/catalog/[id]` on app.patina.cloud.
    private static func shareURL(for product: Product) -> URL {
        PatinaPortalLinks.productURL(forProductId: product.id)
    }

    private func floatingCircleButton(icon: String) -> some View {
        Circle()
            .fill(.ultraThinMaterial)
            .frame(width: 36, height: 36)
            .overlay(
                Image(systemName: icon)
                    .font(.system(size: 16))
                    .foregroundStyle(PatinaColors.Text.primary)
            )
    }

    private func materialBadge(text: String) -> some View {
        HStack(spacing: 5) {
            Text(text)
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(PatinaColors.Background.secondary)
        .clipShape(Capsule())
    }

    private func makerStoryCard(name: String, location: String?, story: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Circle()
                    .fill(PatinaGradients.earth)
                    .frame(width: 44, height: 44)

                VStack(alignment: .leading, spacing: 2) {
                    Text(name)
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.primary)

                    if let location {
                        MonoLabel(text: location, size: PatinaTypography.monoSmall)
                    }
                }
            }

            Text("\u{201C}\(story)\u{201D}")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .italic()
                .lineSpacing(4)
        }
        .padding(20)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private func bottomBar(product: Product) -> some View {
        HStack(spacing: 12) {
            // AR placement button — icon-only action. Real navigation
            // action lives in `simultaneousGesture`-friendly Button, and
            // an explicit `accessibilityLabel` keeps VoiceOver clear.
            // Contextual copy ships through the help panel (`?` button
            // in the top bar) rather than tooltip-wrapping the Button
            // (which would conflict with the Button's tap gesture).
            if product.hasARModel {
                Button {
                    coordinator.navigate(
                        to: .arPlacement(
                            productId: product.id,
                            roomRemoteId: viewModel.roomContextRemoteId
                        )
                    )
                } label: {
                    Circle()
                        .fill(PatinaColors.Background.secondary)
                        .frame(width: 50, height: 50)
                        .overlay(
                            Image(systemName: "arkit")
                                .font(.system(size: 18))
                                .foregroundStyle(PatinaColors.Text.primary)
                        )
                }
                .accessibilityLabel("Place in AR")
                .accessibilityHint("Preview this piece in your room with augmented reality.")
                .accessibilityIdentifier("ProductDetailView.ARButton")
            }

            // Add to room button
            Button {
                if viewModel.roomContextRemoteId != nil {
                    Task { await viewModel.addToAttachedRoom(context: modelContext) }
                } else {
                    viewModel.toggleSave(context: modelContext)
                }
            } label: {
                Text(viewModel.isSaved ? "Saved ✓" : "Add to Room")
                    .font(PatinaTypography.uiAction)
                    .foregroundStyle(PatinaColors.Text.inverse)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(viewModel.isSaved ? PatinaColors.clay : PatinaColors.Interactive.active)
                    .clipShape(Capsule())
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
        .padding(.bottom, 36)
        // PT-5-7: Liquid Glass action bar. `.glassEffect(.regular)` renders
        // the translucent, light-reactive material behind the bar (iOS 26+),
        // replacing the flat off-white + shadow. A hairline top divider keeps
        // the bar grounded against the scroll content above it.
        .background(alignment: .top) {
            Rectangle()
                .frame(height: 0.5)
                .foregroundStyle(PatinaColors.pearl)
        }
        .modifier(GlassActionBarBackground())
    }

    // MARK: - Loading

    private var loadingView: some View {
        VStack {
            Spacer()
            ProgressView()
                .tint(PatinaColors.Text.interactive)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Error

    private var errorView: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 28))
                .foregroundStyle(PatinaColors.Text.muted)
            Text(viewModel.error ?? "Couldn't load this piece")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .multilineTextAlignment(.center)
            if let productId {
                Button("Let's try that again") {
                    Task { await viewModel.loadProduct(id: productId) }
                }
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.interactive)
            }
            Spacer()
        }
        .padding(.horizontal, 32)
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Badge Display Names

private extension String {
    var badgeDisplayName: String {
        switch self {
        case "fsc_certified": return "🌿 FSC Certified"
        case "handcrafted": return "✋ Handcrafted"
        case "made_in_usa": return "📍 Made in USA"
        case "sustainable": return "♻️ Sustainable"
        default: return self.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
}

// MARK: - Glass Action Bar Background (PT-5-7)

/// Applies the Liquid Glass material behind the product-detail action bar on
/// iOS 26+, and falls back to the prior flat off-white + soft shadow on older
/// OS versions. Gated with `#available` because `.glassEffect` is iOS 26.0+
/// while the app still deploys to iOS 18.
private struct GlassActionBarBackground: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(.regular, in: .rect)
        } else {
            content.background(
                PatinaColors.Background.primary
                    .shadow(color: PatinaColors.mocha.opacity(0.08), radius: 8, y: -4)
            )
        }
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
    ProductDetailView(product: Product.previewProducts[0])
}

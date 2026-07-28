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

    /// U06/U07: when set, this browse is scoped to a single room — the
    /// header subtitle picks up the scoping language and saves mirror into
    /// this room rather than being dropped on the floor. This is the room's
    /// LOCAL SwiftData id (`RoomModel.id`, as threaded by `.roomEmergence`),
    /// NOT the remote id the `get_recommendations` RPC and the
    /// `saved_items.room_id` FK actually expect — `roomRemoteId` below
    /// resolves that translation before either is used.
    var roomId: String? = nil

    /// Resolved once at load: `roomId` translated from the local SwiftData
    /// id to the room's synced `RoomModel.remoteId`. `nil` when `roomId` is
    /// nil or the room hasn't synced yet — both fall back to the unscoped
    /// marketplace rather than sending a local id that would silently no-op
    /// the RPC's room filter and violate the `saved_items` FK on every save.
    @State private var roomRemoteId: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            VStack(alignment: .leading, spacing: 4) {
                // Glossary: "Browse pieces" replaces "Perfect for your
                // space" as this screen's H2; the subtitle stays.
                Text("Browse pieces")
                    .font(PatinaTypography.h4)
                    .foregroundStyle(PatinaColors.Text.primary)

                Text(viewModel.headerSubtitle)
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            .padding(.top, 56)
            .padding(.horizontal, 24)
            .padding(.bottom, 12)

            // U29: brief inline notice when a save's remote mirror fails —
            // the heart/menu state has already reverted by the time this
            // shows.
            if let saveFailureMessage = viewModel.saveFailureMessage {
                Text(saveFailureMessage)
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(PatinaColors.Background.secondary)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .padding(.horizontal, 24)
                    .padding(.bottom, 8)
                    .transition(.opacity)
            }

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

            content
        }
        .background(PatinaColors.Background.primary)
        .toolbarTitleDisplayMode(.inline)
        .task {
            roomRemoteId = resolveRoomRemoteId()
            // U29 fix: seed already-saved state (prior visit, another
            // screen, another device) before the grid renders, so the
            // heart/menu never offer "Save" on something already saved.
            async let seed: Void = viewModel.seedSavedState(context: modelContext)
            async let load: Void = viewModel.loadRecommendations(roomId: roomRemoteId)
            _ = await (seed, load)
        }
    }

    /// U06/U07 fix: `roomId` is the local `RoomModel.id`; resolve it to the
    /// room's synced `remoteId` before it reaches the RPC or a save.
    private func resolveRoomRemoteId() -> String? {
        guard let roomId, let localId = UUID(uuidString: roomId) else { return nil }
        return RoomStore(context: modelContext).room(id: localId)?.remoteId
    }

    // MARK: - Content states (U39)

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading {
            PatinaLoadingState(label: "Finding pieces for you…")
                .padding(.top, 80)
        } else if let error = viewModel.error {
            PatinaErrorState(message: error, action: { viewModel.retry() })
                .padding(.top, 80)
                .padding(.horizontal, 24)
        } else if viewModel.filteredProducts.isEmpty {
            PatinaEmptyState(
                icon: "sparkles",
                title: "Nothing here yet",
                message: "Save pieces you love or take the style quiz to tune what shows up.",
                ctaTitle: "Take the style quiz",
                ctaAction: { coordinator.navigate(to: .styleQuiz) }
            )
            .padding(.top, 60)
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

    // MARK: - Product Card

    private func productCard(_ product: Product) -> some View {
        Button {
            coordinator.navigate(to: .pieceDetail(pieceId: product.id))
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                // Image with overlays
                ZStack(alignment: .topLeading) {
                    // Product image via PatinaAsyncImage (R15) — branded strata
                    // placeholder for loading/failure; category gradient remains
                    // the deliberate no-URL fallback.
                    if let imageURL = product.imageURL, let url = URL(string: imageURL) {
                        PatinaAsyncImage(url: url)
                            .frame(height: 160)
                            .frame(maxWidth: .infinity)
                            .clipped()
                    } else {
                        product.placeholderGradient
                            .frame(height: 160)
                    }

                    // Match badge
                    Text(product.matchLabel)
                        .font(PatinaTypography.monoSmall)
                        .foregroundStyle(PatinaColors.Text.secondary)
                        .tracking(0.3)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(.ultraThinMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                        .padding(8)

                    // Save (accelerator) + ⋯ menu (U14: every card's actions
                    // must be visible, not just reachable via long-press).
                    VStack {
                        HStack(spacing: 6) {
                            Spacer()
                            saveButton(product)
                            menuButton(product)
                        }
                        .padding(8)
                    }
                }

                // Info
                VStack(alignment: .leading, spacing: 2) {
                    MonoLabel(text: product.makerName, size: PatinaTypography.monoSmall)

                    Text(product.name)
                        .font(PatinaTypography.uiSmall)
                        .foregroundStyle(PatinaColors.Text.primary)
                        .lineLimit(2)
                        .padding(.top, 2)

                    Text(product.fullFormattedPrice)
                        .font(PatinaTypography.h5)
                        .foregroundStyle(PatinaColors.Text.primary)
                        .padding(.top, 4)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
            }
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        // R26 + U14: the long-press menu is an accelerator, but every action
        // in it must also exist in the visible ⋯ menu — both pull from the
        // same `cardMenuActions` so they can't drift apart.
        .contextMenu {
            cardMenuActions(product)
        }
        // Swipe gestures (accelerators for save/skip; the dead swipe-up
        // "share" branch — never implemented, never reachable — is gone).
        // `.simultaneousGesture` (not `.gesture`) so the drag recognizer
        // doesn't take exclusive precedence over the card's own Button —
        // both need to keep working now that the card is a real Button.
        .simultaneousGesture(
            DragGesture(minimumDistance: 50)
                .onEnded { value in
                    let horizontal = value.translation.width
                    let vertical = value.translation.height

                    guard abs(horizontal) > abs(vertical) else { return }
                    if horizontal > 0 {
                        // Swipe right → save, or unsave when already saved
                        // (matches saveButton's toggle — a plain save call
                        // here would create a duplicate saved_items row).
                        if viewModel.isSaved(product) {
                            viewModel.unsaveProduct(product, context: modelContext)
                        } else {
                            viewModel.saveProduct(product, context: modelContext, roomRemoteId: roomRemoteId)
                        }
                    } else {
                        // Swipe left → skip
                        viewModel.skipProduct(product)
                    }
                }
        )
        // PT-2-5: collapse maker/name/price into one VoiceOver stop.
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(product.name) by \(product.makerName), \(product.fullFormattedPrice), \(product.matchLabel)")
        .accessibilityHint("Double-tap to view details.")
        // PT-2-4: expose the swipe-to-save / swipe-to-skip gestures as
        // VoiceOver actions, since the swipe itself is inaccessible. Toggles
        // to "Unsave" → unsaveProduct when already saved, same as the
        // visible save button, so VoiceOver can't create a duplicate
        // saved_items row.
        .accessibilityAction(named: viewModel.isSaved(product) ? "Unsave" : "Save") {
            if viewModel.isSaved(product) {
                viewModel.unsaveProduct(product, context: modelContext)
            } else {
                viewModel.saveProduct(product, context: modelContext, roomRemoteId: roomRemoteId)
            }
        }
        .accessibilityAction(named: "Skip") {
            viewModel.skipProduct(product)
        }
    }

    // MARK: - Card actions (U14 parity: visible ⋯ menu and long-press share this)

    @ViewBuilder
    private func cardMenuActions(_ product: Product) -> some View {
        if viewModel.isSaved(product) {
            Button(role: .destructive) {
                viewModel.unsaveProduct(product, context: modelContext)
            } label: {
                Label("Unsave", systemImage: "heart.slash")
            }
        } else {
            Button {
                viewModel.saveProduct(product, context: modelContext, roomRemoteId: roomRemoteId)
            } label: {
                Label("Save", systemImage: "heart")
            }
        }
        ShareLink(
            item: PatinaPortalLinks.productURL(forProductId: product.id),
            subject: Text(product.name),
            message: Text("\(product.name) by \(product.makerName) on Patina")
        ) {
            Label("Share", systemImage: "square.and.arrow.up")
        }
        Button {
            viewModel.skipProduct(product)
        } label: {
            Label("Not for me", systemImage: "hand.thumbsdown")
        }
        Button {
            coordinator.navigate(to: .pieceDetail(pieceId: product.id))
        } label: {
            Label("View details", systemImage: "arrow.up.right")
        }
    }

    private func saveButton(_ product: Product) -> some View {
        let isSaved = viewModel.isSaved(product)
        return Button {
            if isSaved {
                viewModel.unsaveProduct(product, context: modelContext)
            } else {
                viewModel.saveProduct(product, context: modelContext, roomRemoteId: roomRemoteId)
            }
        } label: {
            Circle()
                .fill(.ultraThinMaterial)
                .frame(width: 30, height: 30)
                .overlay(
                    Image(systemName: isSaved ? "heart.fill" : "heart")
                        .font(.system(size: 14))
                        .foregroundStyle(PatinaColors.Text.secondary)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isSaved ? "Remove from saved" : "Save to favorites")
        .accessibilityHint(isSaved ? "Removes \(product.name) from your collection." : "Saves \(product.name) to your collection.")
    }

    /// U14: the visible ⋯ affordance — same actions as the long-press menu.
    private func menuButton(_ product: Product) -> some View {
        Menu {
            cardMenuActions(product)
        } label: {
            Circle()
                .fill(.ultraThinMaterial)
                .frame(width: 30, height: 30)
                .overlay(
                    Image(systemName: "ellipsis")
                        .font(.system(size: 14))
                        .foregroundStyle(PatinaColors.Text.secondary)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("More actions")
        .accessibilityHint("Save, share, or view details for \(product.name).")
    }
}

#Preview {
    RecommendationsView()
        .environment(\.appCoordinator, AppCoordinator())
}

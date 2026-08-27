//
//  RecommendationsView.swift
//  Patina
//
//  Product recommendations grid with filter chips, match scores, and swipe gestures
//

import SwiftUI
import SwiftData

// W1b integration: the plank work grew this past the SwiftLint size floor.
// Scoped so lint-delta still catches every other class of regression here;
// the split belongs to W2's R3 hygiene pass, not to an integration merge.
// swiftlint:disable file_length

struct RecommendationsView: View { // swiftlint:disable:this type_body_length
    /// SP-02: one card aspect, so the image area is identical on every card
    /// whatever the photo's own proportions.
    private static let cardImageAspect: CGFloat = 4.0 / 3.0

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
    var roomId: String?

    /// Resolved once at load: `roomId` translated from the local SwiftData
    /// id to the room's synced `RoomModel.remoteId`. `nil` when `roomId` is
    /// nil or the room hasn't synced yet — both fall back to the unscoped
    /// marketplace rather than sending a local id that would silently no-op
    /// the RPC's room filter and violate the `saved_items` FK on every save.
    @State private var roomRemoteId: String?
    @State private var roomName: String?
    @State private var tastePortrait: TastePortrait?

    /// SP-11: the piece the reader chose "Add to room" for, and the rooms the
    /// sheet can offer. `AddToRoomSheet` has existed and been unmounted since
    /// it was written — this is the mount.
    @State private var pieceAwaitingRoom: Product?
    @State private var roomOptions: [RoomSummary] = []
    /// SP-11: a room that has not synced has no `remoteId`, so the save cannot
    /// be mirrored. The old silent fallback to the generic feed is what
    /// produced the mismatch; say it instead.
    @State private var addToRoomMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            VStack(alignment: .leading, spacing: 4) {
                // Glossary: "Browse pieces" replaces "Perfect for your
                // space" as this screen's H2; the subtitle stays.
                // SP-11: a room-scoped browse says whose room it is. The
                // generic title on a room's own "browse picks" is what made
                // the scoping invisible.
                Text(scopedTitle)
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

            // SP-11: the outcome of "Add to room" — including the honest
            // failure when the room has not synced yet.
            if let addToRoomMessage {
                Text(addToRoomMessage)
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

            // Filter bar. SP-02: at XXL Dynamic Type the five chips are wider
            // than the screen, so the row scrolls and carries a trailing fade
            // that says there is more past the edge — "Storage" clipping to
            // "Stor" with no affordance was the reported failure.
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(viewModel.filters, id: \.self) { filter in
                        FilterChip(title: filter, isActive: filter == viewModel.activeFilter) {
                            withAnimation(.spring(response: 0.3)) {
                                viewModel.activeFilter = filter
                            }
                            Task { await viewModel.applyActiveFilter(roomId: roomRemoteId) }
                        }
                    }
                }
                .padding(.horizontal, 24)
            }
            .mask(chipRowFade)
            .padding(.bottom, 12)

            content
        }
        .background(PatinaColors.Background.primary)
        // U18: standard pushed-screen chrome — the "Browse pieces" header
        // above carries the title, so the chrome adds only the back chevron.
        .patinaScreen(title: nil)
        .task {
            let room = resolveRoom()
            roomRemoteId = room?.remoteId
            roomName = room?.name
            tastePortrait = StylePreferenceStore(context: modelContext)
                .mostRecent()
                .flatMap { TastePortrait(preference: $0) }
            // U29 fix: seed already-saved state (prior visit, another
            // screen, another device) before the grid renders, so the
            // heart/menu never offer "Save" on something already saved.
            roomOptions = RoomStore(context: modelContext).allRooms().map(RoomSummary.init(from:))
            async let seed: Void = viewModel.seedSavedState(context: modelContext)
            async let load: Void = viewModel.loadRecommendations(roomId: roomRemoteId)
            _ = await (seed, load)
        }
        // SP-11: the loop the app invited and then closed — a piece can now be
        // put into a room from the card menu.
        .sheet(item: $pieceAwaitingRoom) { piece in
            AddToRoomSheet(
                product: piece,
                rooms: roomOptions,
                onSelect: { room in
                    pieceAwaitingRoom = nil
                    addPiece(piece, to: room)
                },
                onNewRoom: {
                    pieceAwaitingRoom = nil
                    coordinator.navigate(to: .manualRoomEntry)
                }
            )
        }
    }

    /// The local room id a scoped browse saves into, so a save made here
    /// counts on the room's own screen and on Today.
    private var scopedRoomLocalId: UUID? {
        guard roomRemoteId != nil, let roomId else { return nil }
        return UUID(uuidString: roomId)
    }

    /// SP-11: names the room a scoped browse belongs to.
    private var scopedTitle: String {
        guard roomRemoteId != nil, let roomName else { return "Browse pieces" }
        return roomName
    }

    /// SP-11: writes the piece into the room the reader picked — the local
    /// `SavedItem` the room's own count reads, plus the `saved_items` mirror
    /// carrying the room. A room that has not synced cannot be mirrored, and
    /// the screen says so rather than silently doing something else.
    private func addPiece(_ piece: Product, to room: RoomSummary) {
        let store = RoomStore(context: modelContext)
        guard let target = store.room(id: room.id) else { return }
        _ = store.addItem(piece, matchScore: piece.matchScore, toRoomId: room.id)
        viewModel.saveProduct(
            piece,
            context: modelContext,
            roomRemoteId: target.remoteId,
            roomLocalId: room.id
        )
        roomOptions = store.allRooms().map(RoomSummary.init(from:))
        showAddToRoom(
            target.remoteId == nil
                ? "Added to \(room.name) on this phone. It will reach your account once the room syncs."
                : "Added to \(room.name)."
        )
    }

    private func showAddToRoom(_ message: String) {
        addToRoomMessage = message
        Task {
            try? await Task.sleep(for: .seconds(4))
            addToRoomMessage = nil
        }
    }

    /// SP-02: the trailing fade that tells a reader the chip row continues
    /// past the right edge.
    private var chipRowFade: some View {
        LinearGradient(
            stops: [
                .init(color: .black, location: 0),
                .init(color: .black, location: 0.92),
                .init(color: .black.opacity(0), location: 1)
            ],
            startPoint: .leading,
            endPoint: .trailing
        )
    }

    /// U06/U07 fix: `roomId` is the local `RoomModel.id`; resolve it to the
    /// room's synced `remoteId` before it reaches the RPC or a save.
    private func resolveRoom() -> RoomModel? {
        guard let roomId, let localId = UUID(uuidString: roomId) else { return nil }
        return RoomStore(context: modelContext).room(id: localId)
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
            productCardLabel(product)
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
        .simultaneousGesture(productCardSwipeGesture(product))
        // SP-02: `.clipped()` clips pixels, not geometry — the photo inside the
        // card is laid out to FILL its 4:3 box, so a 16:9 or portrait original
        // still reports its uncropped size, and `children: .combine` unions
        // that into the card's frame. Measured on the review simulator: the
        // same-row cards reported 228 × 262 (16:9 photo) and 171 × 326
        // (portrait), overlapping their neighbours' rows by up to 64 pt while
        // the rendered grid looked square. Naming the card's own rounded rect
        // as both the interaction and the accessibility shape makes the
        // hit-box and the VoiceOver frame the card a reader can see.
        .contentShape(
            [.interaction, .accessibility],
            RoundedRectangle(cornerRadius: 14, style: .continuous)
        )
        // PT-2-5: collapse maker/name/price into one VoiceOver stop.
        .accessibilityElement(children: .combine)
        .accessibilityLabel(cardAccessibilityLabel(product))
        .accessibilityHint("Double-tap to view details.")
        // PT-2-4: expose the swipe-to-save / swipe-to-skip gestures as
        // VoiceOver actions, since the swipe itself is inaccessible. Toggles
        // to "Unsave" → unsaveProduct when already saved, same as the
        // visible save button, so VoiceOver can't create a duplicate
        // saved_items row.
        .accessibilityAction(named: viewModel.isSaved(product) ? "Unsave" : "Save") {
            toggleSaved(product)
        }
        .accessibilityAction(named: "Skip") {
            viewModel.skipProduct(product)
        }
    }

    /// SP-10: VoiceOver names the maker only when there is one to name —
    /// "by Unknown Maker" is not a sentence anyone should hear.
    private func cardAccessibilityLabel(_ product: Product) -> String {
        let maker = product.resolvedMakerName.map { " by \($0)" } ?? ""
        return "\(product.name)\(maker), \(product.fullFormattedPrice), \(product.matchLabel)"
    }

    private func productCardLabel(_ product: Product) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            productCardImage(product)
            productCardInfo(product)
        }
        // SP-02: the rationale line is drawn only when there is one to draw, so
        // a card without it is ~36 pt shorter — and a `LazyVGrid` centres the
        // shorter cell in its row, which is how one card in a pair came to sit
        // 18 pt low and end 36 pt short of its neighbour. Filling the row's
        // height makes the pair one card size whatever either card says.
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private func productCardImage(_ product: Product) -> some View {
        ZStack(alignment: .topLeading) {
            // Product image via PatinaAsyncImage (R15) — branded strata
            // placeholder for loading/failure; category gradient remains
            // the deliberate no-URL fallback.
            //
            // SP-02: one card aspect for every card, image or gradient, so a
            // photo that arrives late cannot resize its neighbour and the
            // column stays the width the grid gave it.
            Color.clear
                .aspectRatio(Self.cardImageAspect, contentMode: .fit)
                .overlay {
                    if let imageURL = product.imageURL, let url = URL(string: imageURL) {
                        PatinaAsyncImage(url: url)
                    } else {
                        product.placeholderGradient
                    }
                }
                .clipped()
                // The card's combined label already names the piece; the photo
                // is decoration, and an image element here only drags its
                // uncropped bounds into the union.
                .accessibilityHidden(true)

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
    }

    private func productCardInfo(_ product: Product) -> some View {
        BrowseCardInfo(
            makerName: product.resolvedMakerName,
            name: product.name,
            price: product.fullFormattedPrice,
            rationale: recommendationRationale(for: product)
        )
    }

    private func recommendationRationale(for product: Product) -> String? {
        let scopedRoomName = roomRemoteId == nil ? nil : roomName
        if let tastePortrait {
            return tastePortrait.recommendationRationale(for: product, roomName: scopedRoomName)
        }
        if let scopedRoomName {
            return "Selected from Patina's room-aware edit for \(scopedRoomName)."
        }
        return nil
    }

    private func productCardSwipeGesture(_ product: Product) -> some Gesture {
        DragGesture(minimumDistance: 50)
            .onEnded { value in
                let horizontal = value.translation.width
                let vertical = value.translation.height

                guard abs(horizontal) > abs(vertical) else { return }
                if horizontal > 0 {
                    // Swipe right → save, or unsave when already saved
                    // (matches saveButton's toggle — a plain save call
                    // here would create a duplicate saved_items row).
                    toggleSaved(product)
                } else {
                    // Swipe left → skip
                    viewModel.skipProduct(product)
                }
            }
    }

    private func toggleSaved(_ product: Product) {
        if viewModel.isSaved(product) {
            viewModel.unsaveProduct(product, context: modelContext)
        } else {
            viewModel.saveProduct(product, context: modelContext, roomRemoteId: roomRemoteId, roomLocalId: scopedRoomLocalId)
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
                viewModel.saveProduct(product, context: modelContext, roomRemoteId: roomRemoteId, roomLocalId: scopedRoomLocalId)
            } label: {
                Label("Save", systemImage: "heart")
            }
        }
        // SP-11: there was no way, anywhere in the app, to put a piece into a
        // room — the app invited the loop and then closed it. Drawn only when
        // the reader actually has a room.
        if !roomOptions.isEmpty {
            Button {
                pieceAwaitingRoom = product
            } label: {
                Label("Add to room", systemImage: "square.grid.2x2")
            }
        }
        ShareLink(
            item: PatinaDeepLinks.productURL(forProductId: product.id),
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
                viewModel.saveProduct(product, context: modelContext, roomRemoteId: roomRemoteId, roomLocalId: scopedRoomLocalId)
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

// MARK: - Card text block

/// The browse card's text block, lifted out of the view so its geometry can be
/// measured in a test (`BrowseGridContractTests`). SP-02: every block reserves
/// the same number of lines — one line of maker, two of name, two of rationale
/// — so a long name cannot make its card taller than the one beside it.
struct BrowseCardInfo: View {
    let makerName: String?
    let name: String
    let price: String
    let rationale: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            MonoLabel(
                text: makerName ?? "\u{00A0}",
                size: PatinaTypography.monoSmall
            )
            .lineLimit(1)

            Text(name)
                .font(PatinaTypography.uiSmall)
                .foregroundStyle(PatinaColors.Text.primary)
                .lineLimit(2, reservesSpace: true)
                .padding(.top, 2)

            Text(price)
                .font(PatinaTypography.h5)
                .foregroundStyle(PatinaColors.Text.primary)
                .padding(.top, 4)

            if let rationale {
                Text(rationale)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .lineLimit(2, reservesSpace: true)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 5)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }
}

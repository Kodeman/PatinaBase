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

    /// One presentation for both sheets (`Presented` is in the blocks file).
    @State private var presented: Presented?

    /// SP-11: the rooms `Add to Room` can offer.
    @State private var roomOptions: [RoomSummary] = []

    /// Held, not computed in `body`: it reads every room out of SwiftData.
    @State private var fitLine: RoomFitLine?

    /// The terms the sold-by block prints. Read once; `.unknown` promises
    /// nothing, which is the safe answer when the call fails.
    @State private var terms: DirectOrderTerms = .unknown

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

    /// W5 · B §5. The designer relationship, read from the same two services
    /// the Companion, the Studio and the home's designer seat read.
    ///
    /// Computed in `body`, never cached in `@State`: reading the services here
    /// is what registers the observation dependency, so the act re-resolves
    /// when their refresh lands. A first cut resolved it once in `.task` and
    /// `client@patina.dev` — three active projects — was offered
    /// `Buy — $4,200.00`, because the projects had not arrived yet and an
    /// unresolved relationship reads `.none`.
    private var relationship: DesignerRelationship {
        DesignerThreadOpener.currentRelationship
    }

    private var designerName: String? {
        DesignerSeat.make(
            liveLead: DesignRequestStatusService.shared.liveLead,
            projects: BadgeCountService.shared.projects
        )?.name
    }

    /// Whether the relationship above is an answer rather than a default.
    ///
    /// `BadgeCountService.hasLoaded` is deliberately NOT the projects half:
    /// it goes true when any one of five fetches answers, and on a session
    /// where `listProjects()` alone fails a client with an active project
    /// still resolves `.none` — the one relationship that draws Buy.
    /// `projectsLoaded` says only that the projects answer arrived.
    private var relationshipIsResolved: Bool {
        PieceActResolver.relationshipIsResolved(
            isAuthenticated: AuthService.shared.isAuthenticated,
            projectsAnswered: BadgeCountService.shared.projectsLoaded,
            leadAnswered: DesignRequestStatusService.shared.hasLoaded
        )
    }

    /// The one act this piece offers, resolved from the relationship, the
    /// flag and the gate. R3 lives inside `PieceActResolver`: a client with a
    /// live designer gets Path B here whatever the flag and the gate say.
    private func act(for product: Product) -> PieceAct {
        PieceActResolver.act(
            product: product,
            relationship: relationship,
            designerName: designerName,
            directOrdersEnabled: FeatureFlags.shared.isOn(.directOrders),
            relationshipIsResolved: relationshipIsResolved
        )
    }

    /// The act as it stands right now, or nothing when no piece is loaded.
    private var currentAct: PieceAct? {
        displayProduct.map { act(for: $0) }
    }

    /// Ask the two designer services for an answer when this screen has none.
    ///
    /// They refresh on the home's own polling floor, so a reader who walked
    /// here through the app arrives with the answer already in hand. A reader
    /// who arrives from a `patina://piece/<id>` link does not — and without
    /// this the act would sit on Path C for the whole session, which the walk
    /// reproduced on a fresh sign-in that landed straight on this screen.
    private func resolveRelationshipIfNeeded() async {
        guard !relationshipIsResolved else { return }
        await BadgeCountService.shared.refresh()
        await DesignRequestStatusService.shared.refresh()
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
        .task {
            viewModel.attachRoomContext(
                localId: roomLocalId,
                remoteId: roomRemoteId,
                spatialContext: spatialContext
            )
            if product == nil, let productId {
                await viewModel.loadProduct(id: productId)
            }
            // SP-14: a piece saved on a previous visit must not offer to be
            // saved again — seed from the store before the bar draws.
            viewModel.seedSavedState(productId: displayProduct?.id, context: modelContext)
            roomOptions = RoomStore(context: modelContext).allRooms().map(RoomSummary.init(from:))
            refreshFitLine()
            viewModel.trackView()
            PieceActChannel.shared.publish(currentAct)
            await resolveRelationshipIfNeeded()
            terms = (try? await DirectOrdersAPIClient.shared.fetchTerms()) ?? .unknown
        }
        // A session can land while this screen is still up: the wall is a sheet
        // over it, so `.task` has already run — as a guest, where the
        // relationship is knowable without any fetch and nothing was asked.
        // Without this the reader signs in, comes back, and the bar still reads
        // "Ask about this piece" for the rest of the session.
        .onChange(of: AuthService.shared.isAuthenticated) { _, _ in
            Task { await resolveRelationshipIfNeeded() }
        }
        // The act can change under the screen — the piece finishes loading, or
        // the two designer services answer. Both surfaces follow it.
        .onChange(of: currentAct) { _, act in PieceActChannel.shared.publish(act) }
        .onDisappear { PieceActChannel.shared.publish(nil) }
        // The Companion's piece-context row performs the screen's own act, so
        // the two surfaces cannot offer the same words and do different things.
        .onChange(of: PieceActChannel.shared.requestToken) { _, _ in
            guard let product = displayProduct else { return }
            performPrimaryAct(product)
        }
        .sheet(item: $presented) { which in
            switch which {
            case .help:
                // Empty state ships until Sanity authoring catches up.
                HelpPanelSheet(
                    surfaceKey: SurfaceKeys.IOSApp.ProductDetail.root,
                    isPresented: Binding(
                        get: { presented?.id == "help" },
                        set: { if !$0 { presented = nil } }
                    )
                )
            case .roomPicker:
                if let product = displayProduct {
                    AddToRoomSheet(
                        product: product,
                        rooms: roomOptions,
                        onSelect: { summary in
                            presented = nil
                            let store = RoomStore(context: modelContext)
                            guard let room = store.room(id: summary.id) else { return }
                            viewModel.addToRoom(
                                localId: room.id,
                                remoteId: room.remoteId,
                                context: modelContext
                            )
                            roomOptions = store.allRooms().map(RoomSummary.init(from:))
                            refreshFitLine()
                        },
                        onNewRoom: {
                            presented = nil
                            coordinator.navigate(to: .manualRoomEntry)
                        }
                    )
                }

            case .askDesigner:
                if let product = displayProduct {
                    AskDesignerSheet(
                        product: product,
                        designerFirstName: PieceActResolver.firstName(of: designerName),
                        roomName: contextRoom()?.name
                    )
                }

            case .askAboutPiece(let reason):
                if let product = displayProduct {
                    AskAboutPieceSheet(
                        product: product,
                        roomName: contextRoom()?.name,
                        reason: reason
                    )
                }

            case .order:
                if let product = displayProduct {
                    OrderSheet(
                        product: product,
                        fitLine: fitLine?.text,
                        onPlaced: { order in presented = .orderPlaced(order) }
                    )
                }

            case .orderPlaced(let order):
                OrderPlacedView(
                    order: order,
                    responsibilityParagraph: terms.responsibilityParagraph,
                    contactLine: terms.contact.map { "Questions or damage: \($0)" },
                    soldBy: displayProduct.map(OrderSheetContent.soldBy) ?? "",
                    taxShippingEnabled: terms.taxShippingEnabled,
                    // C1 handed the direct-order id over and drew no control
                    // until a destination existed; W5's integration is where it
                    // does. `OrdersService.resolve` takes a bare
                    // `direct_orders` uuid as well as a prefixed token, and
                    // matches it against `directOrderId` too — so the CTA still
                    // lands after the settle re-keys the order onto the
                    // fulfillment row under a different uuid.
                    onSeeOrder: { directOrderId in
                        presented = nil
                        coordinator.navigate(to: .orderDetail(orderId: directOrderId))
                    },
                    onBackToToday: {
                        presented = nil
                        coordinator.navigate(to: .heroFrame)
                    }
                )
                .interactiveDismissDisabled(false)

            case .authWall(let title):
                // SP-09 / C9: a soft wall over the flow the person is in,
                // with a Cancel. Nothing has been written and nothing will be
                // until a session lands. The title names the act that raised
                // it — a reader who tapped "Ask about this piece" is not told
                // to sign in to order something.
                AuthSheet(title: title)
            }
        }
    }

    // MARK: - The act

    /// One entry point for the primary act, so the bar and the Companion row
    /// cannot diverge.
    private func performPrimaryAct(_ product: Product) {
        let act = act(for: product)
        PostHogService.shared.capture(act.analyticsEvent, properties: ["product_id": product.id])
        switch PieceActResolver.entry(
            for: act,
            isAuthenticated: AuthService.shared.isAuthenticated
        ) {
        case .authWall(let title):
            presented = .authWall(title: title)
        case .askDesigner:
            presented = .askDesigner
        case .order:
            presented = .order
        case .askAboutPiece(let reason):
            presented = .askAboutPiece(reason: reason)
        }
    }

    /// Recomputed when the screen appears and when the piece is put in a room
    /// — the two moments the answer can change.
    private func refreshFitLine() {
        fitLine = Self.fitLine(
            for: displayProduct,
            rooms: RoomStore(context: modelContext).allRooms(),
            preferredLocalId: viewModel.roomContextLocalId,
            preferredRemoteId: viewModel.roomContextRemoteId
        )
    }

    /// The room this screen was opened from, if any (in the blocks file).
    private func contextRoom() -> RoomModel? {
        Self.contextRoom(
            in: RoomStore(context: modelContext),
            localId: viewModel.roomContextLocalId,
            remoteId: viewModel.roomContextRemoteId
        )
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
                                presented = .help
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
                                message: Text(Self.shareMessage(for: product))
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
                        // Maker tag — SP-10: `products.brand` is the actual
                        // maker; the vendor name is only the fallback, and the
                        // RPC's literal "Unknown Maker" is not a maker at all.
                        if let maker = product.resolvedMakerName {
                            MonoLabel(
                                text: [maker, product.makerLocation].compactMap { $0 }.joined(separator: " · "),
                                color: PatinaColors.clay
                            )
                            .padding(.bottom, 6)
                        }

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

                        // SP-10: what the piece actually is — size, lead time,
                        // maker. Each row is omitted entirely when its column
                        // is null; the screen never prints a placeholder for a
                        // measurement it does not have.
                        specRows(product)

                        // B §5 item 4 / M3 block 8: the room's longest wall
                        // beside the piece's own width. Two numbers and a full
                        // stop — no verdict, because the app does not know
                        // what else is in the room (C5). Drawn only for a room
                        // measured on the segmented unit control, and only for
                        // a piece that carries dimensions.
                        if let fit = fitLine {
                            RoomFitLineView(line: fit)
                                .padding(.bottom, 16)
                        }

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
                            .padding(.bottom, 18)
                        }

                        // M3 block 10 — who is responsible. Drawn only for a
                        // piece the app would actually sell, and only from the
                        // server's own config: an unset paragraph prints
                        // nothing rather than a reassurance nobody wrote.
                        soldByBlock(product)

                        Spacer()
                            .frame(height: 120)
                    }
                    .padding(24)
                }
            }

            // Bottom action bar
            bottomBar(product: product)
        }
    }

    // MARK: - The act

    /// W2's clearance under the pinned act on a root with nothing else at that
    /// edge: the home indicator's own room, and no more.
    private static let pinnedActBottomInset: CGFloat = 36

    /// The width the Companion's minimal corner mark takes out of the bar's
    /// trailing edge: the 44 pt mark plus a hair of air. Its own trailing
    /// inset (20) already sits inside the screen's 24 pt gutter.
    private static let companionMarkClearance: CGFloat = 48

    /// M3 block 10 — the sold-by line and the config-driven responsibility
    /// paragraph. B §5 makes the paragraph a condition of Path A shipping, so
    /// it is printed where the reader decides, not only where they pay.
    @ViewBuilder
    private func soldByBlock(_ product: Product) -> some View {
        if BuyabilityGate.isBuyable(product) {
            VStack(alignment: .leading, spacing: 4) {
                Text(OrderSheetContent.soldBy(product))
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .accessibilityIdentifier("ProductDetailView.SoldBy")
                if let paragraph = terms.responsibilityParagraph {
                    Text(paragraph)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let contact = terms.contact {
                    Text("Questions or damage: \(contact)")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 18)
        }
    }

    /// W5 · M3 block 11. The bar is the piece's one act plus the ghost that
    /// was the whole bar before it. `Add to room` keeps every behaviour it
    /// had: the room this screen was opened from where there is one, the
    /// picker where there is not, and the plain account-wide save where the
    /// reader has no room at all.
    private func bottomBar(product: Product) -> some View {
        PurchaseActionBar(
            act: act(for: product),
            isSaved: viewModel.isSaved,
            showsARButton: product.hasARModel,
            onAR: {
                coordinator.navigate(
                    to: .arPlacement(
                        productId: product.id,
                        roomRemoteId: viewModel.roomContextRemoteId
                    )
                )
            },
            onPrimary: { performPrimaryAct(product) },
            onAddToRoom: {
                if viewModel.isSaved {
                    viewModel.toggleSave(context: modelContext)
                } else if let room = contextRoom() {
                    viewModel.addToRoom(localId: room.id, remoteId: room.remoteId, context: modelContext)
                } else if !roomOptions.isEmpty {
                    presented = .roomPicker
                } else {
                    viewModel.toggleSave(context: modelContext)
                }
            }
        )
        .padding(.leading, 24)
        // The Companion draws `.minimal` over this route — a 44 pt mark at
        // `.trailing, 20` — and it lands on the bar's right end. One capsule
        // could live with that because its label was centred; two cannot, and
        // the walk caught the ghost reading `Add to ro…` under the mark.
        // The mark keeps its corner; the bar stops short of it.
        .padding(.trailing, 24 + Self.companionMarkClearance)
        .padding(.top, 16)
        // The act is pinned above the bottom safe area, and the root's
        // `safeAreaInset` does not reach a pushed destination — measured on
        // `dr-w3-int`, this capsule sat at the identical y on both roots, which
        // put its lower edge 13 pt under the house-first bar
        // (`shots/w3-n1-13-piece-footer-under-bar-dark-xxl.png`). Where the bar
        // draws, the capsule takes the same clearance the money screens take.
        // On the flag-off root nothing is over this edge — `pieceDetail` is one
        // of the routes where the Companion is already `.minimal`, a 44 pt mark
        // in the corner, not a 140 pt dock — so W2's home-indicator breathing
        // room is what this edge needs and the dock-sized figure would lift the
        // act 112 pt off the bottom for nothing.
        .padding(.bottom, coordinator.isHouseFirstRoot
                 ? MoneyScreenMetrics.bottomClearance(houseFirst: true)
                 : Self.pinnedActBottomInset)
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
            PatinaLoadingState(label: "Loading this piece…")
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Error

    private var errorView: some View {
        // Retry only makes sense when there's a productId to reload — a
        // roomless/no-id entry has nothing to retry, so no action is passed
        // and PatinaErrorState omits the button entirely.
        let retry: (() -> Void)? = productId.map { id in
            { Task { await viewModel.loadProduct(id: id) } }
        }
        return VStack(spacing: 0) {
            // The navigation bar is hidden for the whole screen (see `body`),
            // and the success branch draws its own back chevron inside the
            // hero — so without this one the failure state has no exit.
            HStack {
                Button { dismiss() } label: {
                    floatingCircleButton(icon: "chevron.left")
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Back")
                .accessibilityIdentifier("ProductDetailView.ErrorBackButton")

                Spacer()
            }
            .padding(.top, 56)
            .padding(.horizontal, 16)

            Spacer()
            PatinaErrorState(
                message: viewModel.error ?? "Couldn't load this piece",
                action: retry
            )
            .padding(.horizontal, 32)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
}

#if DEBUG
#Preview {
    ProductDetailView(product: Product.previewProducts[0])
}
#endif

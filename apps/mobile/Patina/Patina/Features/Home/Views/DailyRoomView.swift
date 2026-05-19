//
//  DailyRoomView.swift
//  Patina
//
//  The Daily Room — editorial home screen for Patina iOS.
//

import SwiftUI

struct DailyRoomView: View {
    @Environment(\.appCoordinator) private var coordinator
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase
    @State private var viewModel = DailyRoomViewModel()
    @State private var expandedStory: DailyStory?
    @State private var expandedRecommendation: DailyRecommendation?
    /// Drives the contextual help-panel sheet attached to the Home surface.
    /// Set true by the `?` affordance in `DailyGreetingHeader`.
    @State private var isHelpPanelPresented: Bool = false
    @Namespace private var cardNamespace

    var body: some View {
        // First-launch tour wraps the entire screen so the three coachmark
        // anchors (greeting header / saved heart / profile monogram) all
        // receive the orchestrator via SwiftUI environment. The orchestrator
        // auto-starts the 3-step sequence on the first launch and persists
        // resolution state so subsequent launches DO NOT re-trigger.
        FirstLaunchTour {
            screenBody
        }
    }

    private var screenBody: some View {
        ZStack(alignment: .bottom) {
            PatinaColors.offWhite.ignoresSafeArea()

            if viewModel.rooms.isEmpty {
                DailyRoomEmptyState {
                    coordinator.navigate(to: .walk)
                }
            } else {
                content
            }

            if let toast = viewModel.toastMessage, expandedRecommendation == nil {
                AddedToRoomToast(message: toast) {
                    // No-op for now; could navigate to room project view.
                }
                .padding(.bottom, 90)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            if let rec = expandedRecommendation {
                DailyProductDetailView(
                    recommendation: rec,
                    namespace: cardNamespace,
                    onDismiss: {
                        withAnimation(.patinaHero) {
                            expandedRecommendation = nil
                        }
                    }
                )
                .zIndex(10)
                .transition(.identity)
            }

            if let story = expandedStory {
                let featured = viewModel.allRecommendations
                    .first(where: { $0.product.id == story.featuredProductID })?.product
                DailyStoryDetailView(
                    story: story,
                    featuredProduct: featured,
                    namespace: cardNamespace,
                    onDismiss: {
                        withAnimation(.patinaHero) {
                            expandedStory = nil
                        }
                    }
                )
                .zIndex(10)
                .transition(.identity)
            }
        }
        .animation(.easeOut(duration: 0.25), value: viewModel.toastMessage)
        .navigationBarHidden(true)
        .task {
            viewModel.modelContext = modelContext
            if viewModel.rooms.isEmpty {
                viewModel.load()
            }
        }
        .onAppear {
            // mainHomeView can resolve to DailyRoomView implicitly (no
            // navigate call), e.g. when a dual-role user flips Workspace
            // back to Consumer. Without this, the Companion context can
            // be stuck at .designerHome from a prior session and the
            // sheet will show the designer action set on the consumer
            // home. Mirror of the DesignerHomeView fix.
            if coordinator.currentScreen != .heroFrame {
                coordinator.navigate(to: .heroFrame)
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                viewModel.load()
            }
        }
        .sheet(item: $viewModel.presentingAddFor) { product in
            AddToRoomSheet(
                product: product,
                rooms: viewModel.rooms,
                onSelect: { room in
                    viewModel.addProduct(product, to: room)
                },
                onNewRoom: {
                    viewModel.presentingAddFor = nil
                    coordinator.navigate(to: .newRoom)
                }
            )
        }
        // Contextual help panel — surfaces every Sanity article whose
        // surfaceKey is `ios-app/home` or a child of it. Empty state is
        // displayed when content hasn't shipped yet (Sprint 2 default).
        .helpPanel(
            isPresented: $isHelpPanelPresented,
            surfaceKey: SurfaceKeys.IOSApp.Home.root
        )
    }

    private var content: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                DailyGreetingHeader(
                    dateString: viewModel.greetingDate.uppercased(),
                    monogram: "K",
                    onHelpTap: { isHelpPanelPresented = true }
                )

                if let story = viewModel.todayStory {
                    Button {
                        withAnimation(.patinaHero) {
                            expandedStory = story
                        }
                    } label: {
                        DailyStoryCard(
                            story: story,
                            namespace: cardNamespace,
                            isExpanded: expandedStory?.id == story.id
                        )
                    }
                    .buttonStyle(.plain)
                }

                RoomChipRail(
                    rooms: viewModel.rooms,
                    selectedID: viewModel.selectedRoomID,
                    onSelect: { viewModel.selectRoom($0) }
                )

                RoomContextBar(
                    room: viewModel.selectedRoom,
                    filters: viewModel.categoryFilters,
                    activeFilterID: viewModel.activeFilterID,
                    onSelectFilter: { viewModel.selectFilter($0) }
                )

                LazyVStack(spacing: 0) {
                    ForEach(Array(viewModel.recommendations.enumerated()), id: \.element.id) { index, rec in
                        let card = DailyProductCard(
                            recommendation: rec,
                            namespace: cardNamespace,
                            isExpanded: expandedRecommendation?.id == rec.id,
                            onExpand: {
                                withAnimation(.patinaHero) {
                                    expandedRecommendation = rec
                                }
                            },
                            onAdd: {
                                viewModel.presentAdd(for: rec.product)
                            },
                            spatialContext: viewModel.spatialContext[rec.product.id] ?? [:]
                        )
                        if index == 0 {
                            // First-launch tour anchor — Step 2's popover
                            // attaches to the topmost daily product card, the
                            // surface that carries the heart/save affordance
                            // the step describes. Only the first card carries
                            // the anchor so the popover doesn't render
                            // multiple times for users with a long feed.
                            card.firstLaunchTourAnchor(.savedHeart)
                        } else {
                            card
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 6)

                Spacer().frame(height: 120)
            }
        }
    }
}

#Preview {
    NavigationStack {
        DailyRoomView()
            .environment(\.appCoordinator, AppCoordinator())
    }
}

//
//  HouseFirstRoot.swift
//  Patina
//
//  The root the `house-first` flag chooses (B-1, R2). Four `NavigationStack`s
//  under one bar, where the flag-off root has one stack under a floating orb.
//
//  Two things this root deliberately does NOT do:
//
//   • It never applies `companionHearthReservation`. The 83 pt bar replaces the
//     120 pt Hearth (B-2); reserving both would put 203 pt of dead space under
//     every screen.
//   • It does not re-read the flag. `ContentView` asks `AppCoordinator` once,
//     and the coordinator resolved it in `init` — a payload landing late can
//     never swap the root under a session that is already running.
//
//  Tabs mount lazily and then stay mounted, which is what `TabView` does: a tab
//  you have never opened costs nothing on launch, and one you have opened keeps
//  its scroll position and its stack when you come back to it.
//

import SwiftUI

public struct HouseFirstRoot: View {

    @Environment(\.appCoordinator) private var coordinator

    /// Tabs whose content has been built at least once. Today is built at
    /// launch; the other three wait for their first tap so a cold launch pays
    /// for one surface, not four.
    @State private var mounted: Set<PatinaTab> = [.today]

    public init() {}

    public var body: some View {
        ZStack {
            PatinaColors.Background.primary
                .ignoresSafeArea()

            tabContent
                .safeAreaInset(edge: .bottom, spacing: 0) { bar }
                .accessibilityHidden(coordinator.isCompanionExpanded)

            CompanionOverlay()
        }
        .onChange(of: coordinator.tabs.selected, initial: true) { _, tab in
            mounted.insert(tab)
        }
        .onChange(of: coordinator.tabs.visibleRoute) { _, route in
            coordinator.syncCurrentScreen(to: route)
        }
    }

    // MARK: - The four stacks

    private var tabContent: some View {
        ZStack {
            ForEach(PatinaTab.allCases) { tab in
                if mounted.contains(tab) {
                    stack(for: tab)
                        .opacity(tab == coordinator.tabs.selected ? 1 : 0)
                        .allowsHitTesting(tab == coordinator.tabs.selected)
                        .accessibilityHidden(tab != coordinator.tabs.selected)
                }
            }
        }
    }

    private func stack(for tab: PatinaTab) -> some View {
        NavigationStack(path: path(for: tab)) {
            root(for: tab)
                .navigationDestination(for: AppRoute.self) { route in
                    destinationView(for: route)
                }
                // R04: pushed destinations hide the system nav bar, which
                // disables UIKit's edge-swipe-back. Re-enable it per stack.
                .interactivePopGestureEnabled()
        }
    }

    private func path(for tab: PatinaTab) -> Binding<NavigationPath> {
        Binding(
            get: { coordinator.tabs.paths[tab] ?? NavigationPath() },
            set: { coordinator.tabs.paths[tab] = $0 }
        )
    }

    /// Each tab's root is a wrapper from `TabRoot.swift` (W3 · N2), which
    /// carries the destination's canonical name (C4) and tells the screen it
    /// is a root rather than a pushed copy of itself — a tab root draws no
    /// back chevron, and the Pieces root draws M9's `Saved` door.
    @ViewBuilder
    private func root(for tab: PatinaTab) -> some View {
        switch tab {
        case .today:
            DailyRoomView()
        case .spaces:
            SpacesTabRoot()
        case .pieces:
            PiecesTabRoot()
        case .studio:
            StudioTabRoot()
        }
    }

    // MARK: - The bar

    private var bar: some View {
        PatinaTabBar(selected: coordinator.tabs.selected) { tab in
            coordinator.selectTab(tab)
        } trailing: {
            companionSlot
        }
    }

    /// M1 §6's fifth slot — the Strata mark, and the Companion's only door on
    /// this root (B-2).
    ///
    /// Expanding the panel is `CompanionOverlay.expandToPanel()`, file-private
    /// to that view, so the door is `isCompanionExpanded`: this writes it and
    /// the overlay observes it. N1 shipped this slot as a mark and NOT a
    /// control because nothing observed the flag yet — a tap presented nothing
    /// while `accessibilityHidden(isCompanionExpanded)` above took all four
    /// stacks out of the VoiceOver tree. N3 added the observer first
    /// (`CompanionOverlay`'s `.onChange(of: coordinator.isCompanionExpanded)`),
    /// which is what makes this button safe; the three lines are N1's own,
    /// written out in `waves/w3/n1-notes.md` §2a step 3.
    private var companionSlot: some View {
        Button {
            coordinator.toggleCompanion()
        } label: {
            StrataMarkView(
                color: PatinaColors.mocha,
                scale: 0.8,
                accessibility: .decorative
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Companion")
        .accessibilityHint("Opens quick actions for this screen.")
    }
}

// MARK: - Navigation Destinations

// A verbatim second copy of `ContentView`'s dispatcher. It is duplicated rather
// than shared on purpose: W3's acceptance is that the flag-off root renders
// byte-for-byte as W2 left it, which is easiest to prove when `ContentView`'s
// existing branch is not edited at all. Both copies are exhaustive over
// `AppRoute` with no `default:`, so a new route breaks compilation in both.
// This copy dies with the flag-off root, one release from now.
extension HouseFirstRoot {

    @ViewBuilder
    fileprivate func destinationView(for route: AppRoute) -> some View {
        switch route {
        case .heroFrame, .yourSpaces, .roomProject,
             .roomSettings, .crossRoom, .manualRoomEntry, .roomSavedItems:
            roomsDestination(for: route)

        case .scanFlow, .emergence, .roomEmergence, .table, .pieceDetail:
            discoveryDestination(for: route)

        case .styleQuiz, .styleResult, .arPlacement:
            styleDestination(for: route)

        case .profile, .notifications, .designerConsultation, .designRequests,
             .projectList, .projectDetail, .decisionList, .decisionDetail:
            workCoreDestination(for: route)

        case .threadList, .threadDetail, .proposalList, .proposalDetail,
             .invoiceList, .invoiceDetail, .budget, .documentList:
            workDocumentsDestination(for: route)
        }
    }

    @ViewBuilder
    fileprivate func roomsDestination(for route: AppRoute) -> some View {
        switch route {
        case .yourSpaces:
            YourSpacesView()

        case .roomProject(let roomId):
            RoomProjectView(roomId: roomId)

        case .roomSettings(let roomId):
            RoomSettingsView(roomId: roomId)

        case .crossRoom:
            CrossRoomView()

        case .manualRoomEntry:
            ManualRoomEntryView()

        case .roomSavedItems(let roomId):
            CollectionsView(roomId: roomId)

        default:
            EmptyView() // unreachable — dispatched only for the cases above
        }
    }

    @ViewBuilder
    fileprivate func discoveryDestination(for route: AppRoute) -> some View {
        switch route {
        case .scanFlow:
            QuietConversationFlowHost()
                .toolbar(.hidden, for: .navigationBar)

        case .emergence(let pieceId):
            if let pieceId {
                ProductDetailView(productId: pieceId)
                    .toolbar(.hidden, for: .navigationBar)
            } else {
                RecommendationsView()
            }

        case .roomEmergence(let roomId):
            RecommendationsView(roomId: roomId.uuidString)

        case .table:
            CollectionsView()

        case .pieceDetail(let pieceId):
            ProductDetailView(productId: pieceId)
                .toolbar(.hidden, for: .navigationBar)

        default:
            EmptyView() // unreachable — dispatched only for the cases above
        }
    }

    @ViewBuilder
    fileprivate func styleDestination(for route: AppRoute) -> some View {
        switch route {
        case .styleQuiz:
            StyleQuizView()
                .toolbar(.hidden, for: .navigationBar)

        case .styleResult(let result):
            StyleResultView(result: result, showsChrome: true)

        case .arPlacement(let productId, let roomRemoteId):
            ARPlacementView(productId: productId, roomRemoteId: roomRemoteId)
                .toolbar(.hidden, for: .navigationBar)

        default:
            EmptyView() // unreachable — dispatched only for the cases above
        }
    }

    @ViewBuilder
    fileprivate func workCoreDestination(for route: AppRoute) -> some View {
        switch route {
        case .profile:
            ProfileView()

        case .notifications:
            NotificationFeedView()

        case .designerConsultation:
            DesignerConsultationView()

        case .designRequests(let focusLeadId):
            DesignRequestStatusView(focusLeadId: focusLeadId)

        case .projectList:
            ProjectListView()

        case .projectDetail(let projectId):
            ProjectDetailView(projectId: projectId)

        case .decisionList:
            DecisionListView()

        case .decisionDetail(let decisionId):
            DecisionDetailView(decisionId: decisionId)

        default:
            EmptyView() // unreachable — dispatched only for the cases above
        }
    }

    @ViewBuilder
    fileprivate func workDocumentsDestination(for route: AppRoute) -> some View {
        switch route {
        case .threadList:
            ThreadListView()

        case .threadDetail(let threadId):
            ThreadDetailView(threadId: threadId)

        case .proposalList:
            ProposalListView()

        case .proposalDetail(let proposalId):
            ProposalDetailView(proposalId: proposalId)

        case .invoiceList:
            InvoiceListView()

        case .invoiceDetail(let invoiceId):
            InvoiceDetailView(invoiceId: invoiceId)

        case .budget:
            BudgetView()

        case .documentList:
            DocumentListView()

        default:
            EmptyView() // unreachable — dispatched only for the cases above
        }
    }
}

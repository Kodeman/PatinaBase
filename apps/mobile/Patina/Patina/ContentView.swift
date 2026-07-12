//
//  ContentView.swift
//  Patina
//
//  Created by Kody Kochaver on 1/18/26.
//

import SwiftUI

/// Main content view that manages navigation based on app state
struct ContentView: View {
    @Environment(\.appCoordinator) private var coordinator

    /// Sheet presentation flags for the `.auth` phase's email/sign-up
    /// affordances. Apple, Google, and Guest all complete in-place; only
    /// the email paths still open a nested form sheet.
    @State private var showingEmailAuth = false
    @State private var showingEmailSignUp = false

    var body: some View {
        ZStack {
            // Root view is selected purely from the derived phase. No
            // imperative dismiss, no overlay-while-also-routing — the
            // observer in AppCoordinator drives every transition.
            switch coordinator.phase {
            case .launching:
                SplashView {
                    // Splash's intrinsic 2s onComplete fires after the
                    // animation. The phase observer is what actually
                    // transitions out of `.launching` (gated on auth
                    // readiness + `splashMinimumDeadline`); this closure
                    // is a no-op kept only because SplashView's API
                    // requires one.
                }

            case .auth:
                AuthScreenView(
                    onSignInWithApple: { result in
                        Task {
                            let viewModel = AuthViewModel()
                            await viewModel.handleAppleSignIn(result: result)
                        }
                    },
                    onSignInWithGoogle: {
                        Task {
                            try? await AuthService.shared.signInWithGoogle()
                        }
                    },
                    onSignInWithEmail: { showingEmailAuth = true },
                    onCreateAccount: { showingEmailSignUp = true },
                    onBrowseAsGuest: { coordinator.guestModeOptIn = true }
                )
                .transition(.opacity)
                .sheet(isPresented: $showingEmailAuth) {
                    AuthenticationView()
                }
                .sheet(isPresented: $showingEmailSignUp) {
                    AuthenticationView(initialMode: .signUp)
                }

            case .onboarding:
                OnboardingFlowHost()
                    .transition(.opacity)

            case .main:
                mainContent
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.5), value: coordinator.phase)
        // PT-3-8 / PT-0-5: one sheet driver for all app-level modals,
        // replacing five boolean flags + five manual `Binding(get:set:)`
        // blocks. SwiftUI clears `presentedSheet` on dismiss.
        .sheet(item: Binding(
            get: { coordinator.presentedSheet },
            set: { coordinator.presentedSheet = $0 }
        )) { sheet in
            sheetContent(for: sheet)
        }
    }

    // MARK: - Sheet Content

    @ViewBuilder
    private func sheetContent(for sheet: AppCoordinator.PresentedSheet) -> some View {
        switch sheet {
        case .settings:
            // PT-0-5: the real SettingsView (notifications / haptics /
            // cellular upload). AccountView is reachable from inside it.
            SettingsView()
        case .qr:
            QRScannerView()
        case .designServices(let roomId, let preselectedScanIds):
            DesignRequestFlowView(
                preselectedScanIds: preselectedScanIds,
                preselectedRoomId: roomId,
                onClose: { coordinator.presentedSheet = nil },
                onTrack: { leadId in
                    coordinator.navigate(to: .designRequests(focusLeadId: leadId))
                }
            )
        case .newRoom:
            NewRoomSheet()
                .presentationDetents([.medium])
                // PT-5-11: every detent sheet sets the 24pt corner radius.
                .presentationCornerRadius(24)
        case .moveItem(let itemId):
            MoveOrCopyItemSheet(itemId: itemId)
                .presentationDetents([.medium, .large])
                // PT-5-11: every detent sheet sets the 24pt corner radius.
                .presentationCornerRadius(24)
        }
    }

    // MARK: - Main Content

    private var mainContent: some View {
        ZStack {
            PatinaColors.Background.primary
                .ignoresSafeArea()

            // Navigation stack for main features
            NavigationStack(path: Binding(
                get: { coordinator.navigationPath },
                set: { newValue in
                    #if DEBUG
                    if newValue.count != coordinator.navigationPath.count {
                        PatinaLog.nav.debug("[ContentView] navigationPath.count \(coordinator.navigationPath.count) → \(newValue.count)")
                    }
                    #endif
                    coordinator.navigationPath = newValue
                }
            )) {
                mainHomeView
                    .navigationDestination(for: AppRoute.self) { route in
                        destinationView(for: route)
                    }
                    // R04: pushed destinations hide the system nav bar,
                    // which disables UIKit's edge-swipe-back. Re-enable it
                    // for the whole stack (guarded to never fire at root).
                    .interactivePopGestureEnabled()
            }

            // Companion is always present in the `.main` phase. The
            // `.auth` and `.onboarding` phases live in their own root
            // branches above, so this overlay is only reached when the
            // user is already in the main app.
            CompanionOverlay()
        }
        .onChange(of: coordinator.phase) { old, new in
            #if DEBUG
            PatinaLog.nav.debug("[ContentView] phase \(old) → \(new)")
            #endif
        }
    }

    // MARK: - Home View

    /// The client home surface. Patina is a client-only app, so every
    /// signed-in user lands on the DailyRoom.
    @ViewBuilder
    private var mainHomeView: some View {
        DailyRoomView()
    }

    // MARK: - Navigation Destinations

    @ViewBuilder
    private func destinationView(for route: AppRoute) -> some View {
        switch route {
        case .heroFrame:
            // `.heroFrame` is a root-reset (it clears the nav path); it is
            // never pushed as a destination, so this arm is unreachable.
            // The home surface is rendered by `mainHomeView`.
            EmptyView()

        case .roomList, .yourSpaces:
            YourSpacesView()
                .toolbar(.hidden, for: .navigationBar)

        case .roomDetail(let roomId), .roomProject(let roomId):
            RoomProjectView(roomId: roomId)
                .toolbar(.hidden, for: .navigationBar)

        case .roomSettings(let roomId):
            RoomSettingsView(roomId: roomId)
                .toolbarTitleDisplayMode(.inline)

        case .crossRoom:
            CrossRoomView()
                .toolbar(.hidden, for: .navigationBar)

        case .manualRoomEntry:
            ManualRoomEntryView()
                .toolbar(.hidden, for: .navigationBar)

        case .roomSavedItems:
            CollectionsView()
                .toolbarTitleDisplayMode(.inline)

        case .scanFlow:
            // The single Quiet Conversation entry. The host owns the entire
            // internal step sequence (threshold → walk → review → … →
            // floorPlan) so the movements share one RoomScanSession without
            // the nav stack losing data between steps (PT-3-5 / PT-3-6).
            QuietConversationFlowHost()
                .toolbar(.hidden, for: .navigationBar)

        case .emergence(let pieceId):
            if let pieceId {
                ProductDetailView(productId: pieceId)
                    .toolbar(.hidden, for: .navigationBar)
            } else {
                RecommendationsView()
                    .toolbarTitleDisplayMode(.inline)
            }

        case .roomEmergence:
            RecommendationsView()
                .toolbarTitleDisplayMode(.inline)

        case .table:
            CollectionsView()
                .toolbarTitleDisplayMode(.inline)

        case .pieceDetail(let pieceId):
            ProductDetailView(productId: pieceId)
                .toolbar(.hidden, for: .navigationBar)

        case .styleQuiz:
            StyleQuizView()
                .toolbar(.hidden, for: .navigationBar)

        case .styleResult(let result):
            StyleResultView(result: result)
                .toolbar(.hidden, for: .navigationBar)

        case .arPlacement(let productId, let roomRemoteId):
            ARPlacementView(productId: productId, roomRemoteId: roomRemoteId)
                .toolbar(.hidden, for: .navigationBar)

        case .preScanChecklist:
            PreScanChecklistView {
                coordinator.navigate(to: .scanFlow(reason: .fresh))
            }
            .toolbar(.hidden, for: .navigationBar)

        case .profile:
            ProfileView()
                .toolbarTitleDisplayMode(.inline)

        case .notifications:
            NotificationFeedView()
                .toolbarTitleDisplayMode(.inline)

        case .designerConsultation:
            DesignerConsultationView()
                .toolbar(.hidden, for: .navigationBar)

        case .designRequests(let focusLeadId):
            DesignRequestStatusView(focusLeadId: focusLeadId)
                .toolbar(.hidden, for: .navigationBar)

        case .projectList:
            ProjectListView()
                .toolbar(.hidden, for: .navigationBar)

        case .projectDetail(let projectId):
            ProjectDetailView(projectId: projectId)
                .toolbar(.hidden, for: .navigationBar)

        case .decisionList:
            DecisionListView()
                .toolbar(.hidden, for: .navigationBar)

        case .decisionDetail(let decisionId):
            DecisionDetailView(decisionId: decisionId)
                .toolbar(.hidden, for: .navigationBar)

        case .threadList:
            ThreadListView()
                .toolbar(.hidden, for: .navigationBar)

        case .threadDetail(let threadId):
            ThreadDetailView(threadId: threadId)
                .toolbarTitleDisplayMode(.inline)

        case .proposalList:
            ProposalListView()
                .toolbar(.hidden, for: .navigationBar)

        case .proposalDetail(let proposalId):
            ProposalDetailView(proposalId: proposalId)
                .toolbar(.hidden, for: .navigationBar)

        case .invoiceList:
            InvoiceListView()
                .toolbar(.hidden, for: .navigationBar)

        case .invoiceDetail(let invoiceId):
            InvoiceDetailView(invoiceId: invoiceId)
                .toolbar(.hidden, for: .navigationBar)

        case .budget:
            BudgetView()
                .toolbar(.hidden, for: .navigationBar)

        case .documentList:
            DocumentListView()
                .toolbar(.hidden, for: .navigationBar)
        }
    }
}

// MARK: - Preview

#Preview {
    ContentView()
        .environment(\.appCoordinator, AppCoordinator())
}

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
        .sheet(isPresented: Binding(
            get: { coordinator.showingDesignServices },
            set: { coordinator.showingDesignServices = $0 }
        )) {
            RequestDesignServicesSheet(
                roomId: coordinator.designServicesRoomId,
                roomName: nil,
                onDismiss: { coordinator.showingDesignServices = false }
            )
        }
        .sheet(isPresented: Binding(
            get: { coordinator.showingQRScanner },
            set: { coordinator.showingQRScanner = $0 }
        )) {
            QRScannerView()
        }
        .sheet(isPresented: Binding(
            get: { coordinator.showingSettings },
            set: { coordinator.showingSettings = $0 }
        )) {
            AccountView()
        }
        .sheet(isPresented: Binding(
            get: { coordinator.showingNewRoom },
            set: { coordinator.showingNewRoom = $0 }
        )) {
            NewRoomSheet()
                .presentationDetents([.medium])
        }
        .sheet(isPresented: Binding(
            get: { coordinator.showingMoveItem },
            set: { coordinator.showingMoveItem = $0 }
        )) {
            if let id = coordinator.movingItemId {
                MoveOrCopyItemSheet(itemId: id)
                    .presentationDetents([.medium, .large])
            }
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
                        print("[ContentView] navigationPath.count \(coordinator.navigationPath.count) → \(newValue.count)")
                    }
                    #endif
                    coordinator.navigationPath = newValue
                }
            )) {
                mainHomeView
                    .navigationDestination(for: AppRoute.self) { route in
                        destinationView(for: route)
                    }
            }

            // Companion is always present in the `.main` phase. The
            // `.auth` and `.onboarding` phases live in their own root
            // branches above, so this overlay is only reached when the
            // user is already in the main app.
            CompanionOverlay()
        }
        .onChange(of: coordinator.phase) { old, new in
            #if DEBUG
            print("[ContentView] phase \(old) → \(new)")
            #endif
        }
    }

    // MARK: - Home View

    /// Home view chosen by the signed-in user's role and saved home
    /// preference. Designers (and dual-role users in auto mode) land on
    /// the designer dashboard; consumers (and dual-role users who opted
    /// into consumer mode) land on the DailyRoom. Roles come from
    /// `ProfileService.shared`; the dual-role preference comes from
    /// `SettingsService.shared.preferredHomeMode`.
    @ViewBuilder
    private var mainHomeView: some View {
        let roles = ProfileService.shared.roles
        let hasDesigner = roles.contains("designer")
        let hasConsumer = roles.contains("consumer") || roles.isEmpty
        let preferred = SettingsService.shared.preferredHomeMode

        switch (hasDesigner, hasConsumer, preferred) {
        case (true, _, .designer):
            DesignerHomeView()
        case (true, false, _):
            DesignerHomeView()
        case (true, true, .auto):
            DesignerHomeView()
        default:
            DailyRoomView()
        }
    }

    // MARK: - Navigation Destinations

    @ViewBuilder
    private func destinationView(for route: AppRoute) -> some View {
        switch route {
        case .heroFrame:
            EmptyView()

        case .conversation:
            ConversationView()
                .toolbarTitleDisplayMode(.inline)

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

        case .newRoom, .moveItem:
            EmptyView()

        case .roomSavedItems:
            CollectionsView()
                .toolbarTitleDisplayMode(.inline)

        case .roomOptions:
            EmptyView()

        case .walk, .walkSession, .rescan:
            // Legacy entry points — route into the new Quiet Conversation flow
            quietConversationEntry
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

        case .settings:
            EmptyView()

        case .designServicesRequest:
            EmptyView()

        case .threshold, .authentication:
            EmptyView()

        case .qrScanner, .qrApproval:
            EmptyView()

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
                coordinator.navigate(to: .walk)
            }
            .toolbar(.hidden, for: .navigationBar)

        case .floorPlanPreview:
            // FloorPlanPreview needs room data passed from Walk; placeholder for now
            EmptyView()

        case .profile:
            ProfileView()
                .toolbarTitleDisplayMode(.inline)

        case .notifications:
            NotificationFeedView()
                .toolbarTitleDisplayMode(.inline)

        case .designerConsultation:
            DesignerConsultationView()
                .toolbar(.hidden, for: .navigationBar)

        case .walkInvitation, .cameraPermission, .walkComplete, .firstEmergence, .roomNaming:
            EmptyView()

        // MARK: - Quiet Conversation flow (v2.0)

        case .scanThreshold:
            quietConversationEntry
                .toolbar(.hidden, for: .navigationBar)

        case .scanWalk:
            EmptyView()    // handled inline via quietConversationEntry state

        case .scanReview:
            EmptyView()    // handled inline via quietConversationEntry state

        case .scanSoftLanding:
            EmptyView()    // handled inline via quietConversationEntry state

        case .scanConversation:
            EmptyView()    // handled inline via quietConversationEntry state

        case .scanReveal:
            EmptyView()    // handled inline via quietConversationEntry state

        case .scanFloorPlan:
            EmptyView()    // handled inline via quietConversationEntry state

        case .scanFallbackEntry:
            quietConversationEntry
                .toolbar(.hidden, for: .navigationBar)

        case .designerHome:
            DesignerHomeView()
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

        case .receiveDelivery:
            ReceiveDeliveryView()
                .toolbar(.hidden, for: .navigationBar)
        }
    }

    // MARK: - Quiet Conversation Entry

    /// Single container that owns the entire Quiet Conversation flow state
    /// so the 5 movements can share a RoomScanSession without the nav stack
    /// losing data between routes.
    private var quietConversationEntry: some View {
        QuietConversationFlowHost()
    }
}

// MARK: - Preview

#Preview {
    ContentView()
        .environment(\.appCoordinator, AppCoordinator())
}

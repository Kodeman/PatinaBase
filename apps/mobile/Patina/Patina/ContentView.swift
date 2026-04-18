//
//  ContentView.swift
//  Patina
//
//  Created by Kody Kochaver on 1/18/26.
//

import SwiftUI

/// Tracks where the user is in the first-launch onboarding journey
private enum OnboardingStep {
    case carousel    // 3-page Philosophy/Promise/Permission
    case auth        // Sign in with Apple / Guest
    case styleQuiz   // 5-question style quiz
    case styleResult(StyleProfileResult) // Quiz result screen
}

/// Main content view that manages navigation based on app state
struct ContentView: View {
    @Environment(\.appCoordinator) private var coordinator

    /// Current step in the first-launch onboarding flow
    @State private var onboardingStep: OnboardingStep = .carousel
    @State private var showingEmailAuth = false
    @State private var showingEmailSignUp = false

    var body: some View {
        ZStack {
            // Main content based on phase
            switch coordinator.phase {
            case .launching:
                SplashView {
                    withAnimation(.easeInOut(duration: 0.5)) {
                        coordinator.completeThreshold()
                    }
                }

            case .threshold:
                mainContent
                    .transition(.opacity)

            case .main:
                mainContent
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.5), value: coordinator.phase)
        .sheet(isPresented: Binding(
            get: { coordinator.showingAuth },
            set: { coordinator.showingAuth = $0 }
        )) {
            AuthScreenView(
                onSignInWithApple: { result in
                    Task {
                        let viewModel = AuthViewModel(coordinator: coordinator)
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
                onBrowseAsGuest: { coordinator.showingAuth = false }
            )
            .sheet(isPresented: $showingEmailAuth) {
                AuthenticationView()
            }
            .sheet(isPresented: $showingEmailSignUp) {
                AuthenticationView(initialMode: .signUp)
            }
        }
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
                set: { coordinator.navigationPath = $0 }
            )) {
                mainHomeView
                    .navigationDestination(for: AppRoute.self) { route in
                        destinationView(for: route)
                    }
            }

            // First Launch overlay — multi-step onboarding
            if coordinator.isFirstLaunch {
                firstLaunchOverlay
                    .transition(.opacity)
            }

            // The Companion — always present (hidden during first launch)
            if !coordinator.isFirstLaunch {
                CompanionOverlay()
            }
        }
        .animation(.easeInOut(duration: 0.3), value: coordinator.isFirstLaunch)
    }

    // MARK: - First Launch Overlay

    @ViewBuilder
    private var firstLaunchOverlay: some View {
        switch onboardingStep {
        case .carousel:
            OnboardingFlowView(
                onComplete: {
                    withAnimation(.easeInOut(duration: 0.4)) {
                        onboardingStep = .auth
                    }
                },
                onSkip: {
                    // Skip goes straight to auth (still need an account)
                    withAnimation(.easeInOut(duration: 0.4)) {
                        onboardingStep = .auth
                    }
                }
            )
            .transition(.asymmetric(
                insertion: .opacity,
                removal: .move(edge: .leading).combined(with: .opacity)
            ))

        case .auth:
            AuthScreenView(
                onSignInWithApple: { result in
                    // Only advance to quiz on successful auth
                    guard case .success = result else { return }
                    Task {
                        let viewModel = AuthViewModel()
                        await viewModel.handleAppleSignIn(result: result)
                        await MainActor.run {
                            withAnimation(.easeInOut(duration: 0.4)) {
                                onboardingStep = .styleQuiz
                            }
                        }
                    }
                },
                onSignInWithGoogle: {
                    Task {
                        do {
                            try await AuthService.shared.signInWithGoogle()
                            await MainActor.run {
                                withAnimation(.easeInOut(duration: 0.4)) {
                                    onboardingStep = .styleQuiz
                                }
                            }
                        } catch {
                            // Stay on auth screen if Google sign-in fails
                        }
                    }
                },
                onSignInWithEmail: {
                    showingEmailAuth = true
                },
                onCreateAccount: {
                    showingEmailSignUp = true
                },
                onBrowseAsGuest: {
                    // Guest users still take the quiz for recommendations
                    withAnimation(.easeInOut(duration: 0.4)) {
                        onboardingStep = .styleQuiz
                    }
                }
            )
            .sheet(isPresented: $showingEmailAuth, onDismiss: {
                if AuthService.shared.isAuthenticated {
                    withAnimation(.easeInOut(duration: 0.4)) {
                        onboardingStep = .styleQuiz
                    }
                }
            }) {
                AuthenticationView()
            }
            .sheet(isPresented: $showingEmailSignUp, onDismiss: {
                if AuthService.shared.isAuthenticated {
                    withAnimation(.easeInOut(duration: 0.4)) {
                        onboardingStep = .styleQuiz
                    }
                }
            }) {
                AuthenticationView(initialMode: .signUp)
            }
            .transition(.asymmetric(
                insertion: .move(edge: .trailing).combined(with: .opacity),
                removal: .move(edge: .leading).combined(with: .opacity)
            ))

        case .styleQuiz:
            StyleQuizView(onComplete: { result in
                withAnimation(.easeInOut(duration: 0.4)) {
                    onboardingStep = .styleResult(result)
                }
            })
            .transition(.asymmetric(
                insertion: .move(edge: .trailing).combined(with: .opacity),
                removal: .move(edge: .leading).combined(with: .opacity)
            ))

        case .styleResult(let result):
            StyleResultView(result: result, onViewRecommendations: {
                // Complete onboarding and go to Home
                coordinator.completeFirstLaunch()
            })
            .transition(.asymmetric(
                insertion: .move(edge: .trailing).combined(with: .opacity),
                removal: .opacity
            ))
        }
    }

    // MARK: - Home View

    /// Home: The Daily Room (handles its own empty state)
    private var mainHomeView: some View {
        DailyRoomView()
    }

    // MARK: - Navigation Destinations

    @ViewBuilder
    private func destinationView(for route: AppRoute) -> some View {
        switch route {
        case .heroFrame:
            EmptyView()

        case .conversation:
            ConversationView()
                .navigationBarTitleDisplayMode(.inline)

        case .roomList, .yourSpaces:
            YourSpacesView()
                .navigationBarHidden(true)

        case .roomDetail(let roomId), .roomProject(let roomId):
            RoomProjectView(roomId: roomId)
                .navigationBarHidden(true)

        case .roomSettings(let roomId):
            RoomSettingsView(roomId: roomId)
                .navigationBarTitleDisplayMode(.inline)

        case .crossRoom:
            CrossRoomView()
                .navigationBarHidden(true)

        case .manualRoomEntry:
            ManualRoomEntryView()
                .navigationBarHidden(true)

        case .newRoom, .moveItem:
            EmptyView()

        case .roomSavedItems:
            CollectionsView()
                .navigationBarTitleDisplayMode(.inline)

        case .roomOptions:
            EmptyView()

        case .walk, .walkSession, .rescan:
            // Legacy entry points — route into the new Quiet Conversation flow
            quietConversationEntry
                .navigationBarHidden(true)

        case .emergence(let pieceId):
            if let pieceId {
                ProductDetailView(productId: pieceId)
                    .navigationBarHidden(true)
            } else {
                RecommendationsView()
                    .navigationBarTitleDisplayMode(.inline)
            }

        case .roomEmergence:
            RecommendationsView()
                .navigationBarTitleDisplayMode(.inline)

        case .table:
            CollectionsView()
                .navigationBarTitleDisplayMode(.inline)

        case .pieceDetail(let pieceId):
            ProductDetailView(productId: pieceId)
                .navigationBarHidden(true)

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
                .navigationBarHidden(true)

        case .styleResult(let result):
            StyleResultView(result: result)
                .navigationBarHidden(true)

        case .arPlacement(let productId, let roomRemoteId):
            ARPlacementView(productId: productId, roomRemoteId: roomRemoteId)
                .navigationBarHidden(true)

        case .preScanChecklist:
            PreScanChecklistView {
                coordinator.navigate(to: .walk)
            }
            .navigationBarHidden(true)

        case .floorPlanPreview:
            // FloorPlanPreview needs room data passed from Walk; placeholder for now
            EmptyView()

        case .profile:
            ProfileView()
                .navigationBarTitleDisplayMode(.inline)

        case .notifications:
            NotificationFeedView()
                .navigationBarTitleDisplayMode(.inline)

        case .designerConsultation:
            DesignerConsultationView()
                .navigationBarHidden(true)

        case .walkInvitation, .cameraPermission, .walkComplete, .firstEmergence, .roomNaming:
            EmptyView()

        // MARK: - Quiet Conversation flow (v2.0)

        case .scanThreshold:
            quietConversationEntry
                .navigationBarHidden(true)

        case .scanWalk:
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
                .navigationBarHidden(true)
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

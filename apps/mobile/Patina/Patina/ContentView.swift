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
                onSignInWithApple: { /* Auth handled by existing AuthService */ },
                onSignInWithGoogle: {},
                onSignInWithEmail: {},
                onBrowseAsGuest: { coordinator.showingAuth = false }
            )
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

            // First Launch overlay
            if coordinator.isFirstLaunch {
                OnboardingFlowView(
                    onComplete: {
                        coordinator.completeFirstLaunch()
                    },
                    onSkip: {
                        coordinator.completeFirstLaunch()
                    }
                )
                .transition(.opacity)
            }

            // The Companion — always present (hidden during first launch)
            if !coordinator.isFirstLaunch {
                CompanionOverlay()
            }
        }
        .animation(.easeInOut(duration: 0.3), value: coordinator.isFirstLaunch)
    }

    // MARK: - Home View

    private var mainHomeView: some View {
        HomeDiscoverView()
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

        case .roomList:
            RoomListView()
                .navigationBarTitleDisplayMode(.inline)

        case .roomDetail(let roomId):
            RoomDetailView(roomId: roomId)
                .navigationBarTitleDisplayMode(.inline)

        case .roomSavedItems:
            CollectionsView()
                .navigationBarTitleDisplayMode(.inline)

        case .roomOptions:
            EmptyView()

        case .walk:
            WalkView()
                .navigationBarTitleDisplayMode(.inline)

        case .walkSession:
            WalkView()
                .navigationBarTitleDisplayMode(.inline)

        case .rescan:
            WalkView()
                .navigationBarTitleDisplayMode(.inline)

        case .emergence(let pieceId):
            if pieceId != nil {
                ProductDetailView()
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

        case .pieceDetail:
            ProductDetailView()
                .navigationBarHidden(true)

        case .settings:
            EmptyView()

        case .designServicesRequest:
            EmptyView()

        case .threshold, .authentication:
            EmptyView()

        case .qrScanner, .qrApproval:
            EmptyView()

        case .walkInvitation, .cameraPermission, .walkComplete, .firstEmergence, .roomNaming:
            EmptyView()
        }
    }
}

// MARK: - Preview

#Preview {
    ContentView()
        .environment(\.appCoordinator, AppCoordinator())
}

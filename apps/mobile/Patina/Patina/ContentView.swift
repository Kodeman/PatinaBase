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
                launchingView

            case .threshold:
                // Legacy threshold phase - redirect to main (Hero Page handles empty state)
                // FirstLaunchContainerView is shown over Hero Page if needed
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
            AuthenticationView()
        }
        .sheet(isPresented: Binding(
            get: { coordinator.showingDesignServices },
            set: { coordinator.showingDesignServices = $0 }
        )) {
            RequestDesignServicesSheet(
                roomId: coordinator.designServicesRoomId,
                roomName: nil, // Could fetch room name if needed
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

    // MARK: - Launching View

    private var launchingView: some View {
        ZStack {
            PatinaColors.Background.primary
                .ignoresSafeArea()

            StrataMarkView(color: PatinaColors.mochaBrown, scale: 1.5, breathing: true)
        }
    }

    // MARK: - Main Content

    private var mainContent: some View {
        ZStack {
            // Background
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

            // First Launch overlay - shown over Hero Page during onboarding
            if coordinator.isFirstLaunch {
                FirstLaunchContainerView()
                    .transition(.opacity)
            }

            // Companion overlay - always present (hidden during first launch)
            if !coordinator.isFirstLaunch {
                CompanionOverlay()
            }
        }
        .animation(.easeInOut(duration: 0.3), value: coordinator.isFirstLaunch)
    }

    // MARK: - Home View

    private var mainHomeView: some View {
        // Unified Hero Page handles both empty (new users) and populated (returning users) states
        UnifiedHeroPageView { intent in
            handleHeroFrameIntent(intent)
        } onExpandCompanion: {
            coordinator.toggleCompanion()
        }
    }

    /// Handle navigation intents from HeroFrameView
    private func handleHeroFrameIntent(_ intent: HeroFrameIntent) {
        if intent == .expandCompanion {
            coordinator.toggleCompanion()
        } else if let route = intent.toAppRoute() {
            coordinator.navigate(to: route)
        }
    }

    // MARK: - Navigation Destinations

    @ViewBuilder
    private func destinationView(for route: AppRoute) -> some View {
        switch route {
        case .heroFrame:
            // Hero Frame is the root, shouldn't be pushed
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

        case .roomSavedItems(let roomId):
            // Placeholder for saved items view
            placeholderScreen(
                title: "Saved Items",
                icon: "bookmark.fill",
                subtitle: "Items saved for this room"
            )

        case .roomOptions:
            // Handled by sheet, not navigation destination
            EmptyView()

        case .walk:
            WalkView()
                .navigationBarTitleDisplayMode(.inline)

        case .walkSession:
            WalkView()
                .navigationBarTitleDisplayMode(.inline)

        case .rescan(let roomId):
            // Re-scan is same as walk but for existing room
            WalkView()
                .navigationBarTitleDisplayMode(.inline)

        case .emergence(let pieceId):
            EmergenceView(pieceId: pieceId)
                .navigationBarTitleDisplayMode(.inline)

        case .roomEmergence(let roomId):
            // Room-specific emergence view
            EmergenceView(pieceId: nil)
                .navigationBarTitleDisplayMode(.inline)

        case .table:
            TableView()
                .navigationBarTitleDisplayMode(.inline)

        case .pieceDetail(let pieceId):
            // Piece detail view - use emergence for now
            EmergenceView(pieceId: pieceId)
                .navigationBarTitleDisplayMode(.inline)

        case .settings:
            // Handled by sheet, not navigation destination
            EmptyView()

        case .designServicesRequest:
            // Handled by sheet, not navigation destination
            EmptyView()

        case .threshold, .authentication:
            EmptyView()

        case .qrScanner, .qrApproval:
            // Handled by sheet, not navigation destination
            EmptyView()

        // First Launch routes are handled by FirstLaunchContainerView
        case .walkInvitation, .cameraPermission, .walkComplete, .firstEmergence, .roomNaming:
            EmptyView()
        }
    }

    private func placeholderScreen(title: String, icon: String, subtitle: String? = nil) -> some View {
        VStack(spacing: PatinaSpacing.lg) {
            Image(systemName: icon)
                .font(.system(size: 48))
                .foregroundColor(PatinaColors.clayBeige)

            Text(title)
                .font(PatinaTypography.h2)
                .foregroundColor(PatinaColors.Text.primary)

            if let subtitle {
                Text(subtitle)
                    .font(PatinaTypography.body)
                    .foregroundColor(PatinaColors.Text.secondary)
            }

            Text("Coming soon")
                .font(PatinaTypography.caption)
                .foregroundColor(PatinaColors.Text.muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(PatinaColors.Background.primary)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Preview

#Preview {
    ContentView()
        .environment(\.appCoordinator, AppCoordinator())
}

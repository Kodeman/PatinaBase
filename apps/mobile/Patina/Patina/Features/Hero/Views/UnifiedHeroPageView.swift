//
//  UnifiedHeroPageView.swift
//  Patina
//
//  Unified Hero Page that serves as the app entry point
//  Handles both empty state (new users) and populated state (returning users)
//

import SwiftUI
import SwiftData

/// Unified Hero Page - the app's main entry point
/// Shows empty state for new users, room carousel for returning users
public struct UnifiedHeroPageView: View {

    // MARK: - Environment

    @Environment(\.modelContext) private var modelContext
    @Environment(\.appCoordinator) private var coordinator

    // MARK: - State

    @State private var pageState: HeroPageState = .loading
    @State private var showingAuth = false
    @State private var showingLearnAboutPatina = false
    @State private var pendingGuestRoomId: UUID?

    // MARK: - Query

    @Query(sort: \RoomModel.updatedAt, order: .reverse)
    private var rooms: [RoomModel]

    // MARK: - Callbacks

    /// Callback for navigation intents
    public var onNavigate: ((HeroFrameIntent) -> Void)?

    /// Callback for expanding companion
    public var onExpandCompanion: (() -> Void)?

    // MARK: - Body

    public var body: some View {
        ZStack {
            content
                .transition(.opacity.combined(with: .scale(scale: 0.98)))

            // Profile button overlay
            if AuthService.shared.isAuthenticated {
                VStack {
                    HStack {
                        Spacer()
                        profileButton
                    }
                    .padding(.horizontal, PatinaSpacing.lg)
                    .padding(.top, PatinaSpacing.sm)
                    Spacer()
                }
            }

            // Post-scan prompt overlay
            if case .postScanPrompt(let roomId) = pageState {
                postScanPromptOverlay(roomId: roomId)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.4), value: pageState)
        .onAppear {
            updatePageState()
        }
        .onChange(of: rooms.count) { _, _ in
            updatePageState()
        }
        .sheet(isPresented: $showingAuth) {
            authSheet
        }
        .sheet(isPresented: $showingLearnAboutPatina) {
            LearnAboutPatinaView(
                onStartWalk: {
                    showingLearnAboutPatina = false
                    // Small delay to let sheet dismiss before navigating
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        handleStartWalk()
                    }
                },
                onDismiss: {
                    showingLearnAboutPatina = false
                }
            )
            .presentationDetents([.large])
        }
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        switch pageState {
        case .loading:
            loadingView

        case .emptyWelcome:
            HeroEmptyStateView(
                onStartWalk: handleStartWalk,
                onSignIn: handleSignIn,
                onLearnMore: handleLearnMore
            )

        case .guestWalkActive:
            // Walk view would be presented full-screen by coordinator
            HeroEmptyStateView(
                onStartWalk: handleStartWalk,
                onSignIn: handleSignIn,
                onLearnMore: handleLearnMore
            )

        case .postScanPrompt:
            // Show the room carousel behind the prompt
            HeroFrameView(
                onNavigate: { intent in
                    handleIntent(intent)
                },
                onExpandCompanion: onExpandCompanion
            )

        case .roomCarousel:
            HeroFrameView(
                onNavigate: { intent in
                    handleIntent(intent)
                },
                onExpandCompanion: onExpandCompanion
            )

        case .error(let message):
            errorView(message: message)
        }
    }

    // MARK: - Profile Button

    private var profileButton: some View {
        Button {
            coordinator.navigate(to: .settings)
        } label: {
            Image(systemName: "person.circle")
                .font(.system(size: 28))
                .foregroundColor(TimeOfDay.current.textColor.opacity(0.8))
        }
    }

    // MARK: - Loading View

    private var loadingView: some View {
        ZStack {
            LinearGradient(
                colors: TimeOfDay.current.gradientColors,
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            StrataMarkView(
                color: TimeOfDay.current.textColor,
                scale: 1.5,
                breathing: true,
                useSpecColors: false
            )
        }
    }

    // MARK: - Error View

    private func errorView(message: String) -> some View {
        ZStack {
            LinearGradient(
                colors: TimeOfDay.current.gradientColors,
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: PatinaSpacing.lg) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 48))
                    .foregroundColor(TimeOfDay.current.textColor.opacity(0.7))

                Text(message)
                    .font(PatinaTypography.body)
                    .foregroundColor(TimeOfDay.current.textColor.opacity(0.8))
                    .multilineTextAlignment(.center)

                Button("Try Again") {
                    updatePageState()
                }
                .font(PatinaTypography.bodyMedium)
                .foregroundColor(TimeOfDay.current.textColor)
            }
            .padding()
        }
    }

    // MARK: - Post-Scan Prompt Overlay

    private func postScanPromptOverlay(roomId: UUID) -> some View {
        VStack {
            Spacer()

            VStack(spacing: PatinaSpacing.lg) {
                // Success message
                VStack(spacing: PatinaSpacing.sm) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 48))
                        .foregroundColor(.green)

                    Text("Room Captured!")
                        .font(PatinaTypography.h2)
                        .foregroundColor(PatinaColors.Text.primary)

                    Text("Create an account to sync your room across devices and access design services.")
                        .font(PatinaTypography.bodySmall)
                        .foregroundColor(PatinaColors.Text.secondary)
                        .multilineTextAlignment(.center)
                }

                // Action buttons
                VStack(spacing: PatinaSpacing.md) {
                    PatinaButton("Create Free Account", style: .primary) {
                        handleCreateAccount(pendingRoomId: roomId)
                    }

                    PatinaButton("Continue as Guest", style: .secondary) {
                        handleContinueAsGuest(roomId: roomId)
                    }
                }
            }
            .padding(PatinaSpacing.xl)
            .background(
                RoundedRectangle(cornerRadius: PatinaRadius.xxl)
                    .fill(PatinaColors.Background.primary)
                    .shadow(color: .black.opacity(0.15), radius: 20, y: -5)
            )
            .padding(.horizontal, PatinaSpacing.md)
            .padding(.bottom, PatinaSpacing.xl)
        }
        .background(
            Color.black.opacity(0.3)
                .ignoresSafeArea()
                .onTapGesture {
                    // Dismiss by tapping outside
                    handleContinueAsGuest(roomId: roomId)
                }
        )
    }

    // MARK: - Auth Sheet

    private var authSheet: some View {
        AuthenticationView()
            .presentationDetents([.large])
    }

    // MARK: - State Management

    private func updatePageState() {
        if rooms.isEmpty {
            pageState = .emptyWelcome
        } else {
            pageState = .roomCarousel
        }
    }

    // MARK: - Action Handlers

    private func handleStartWalk() {
        coordinator.navigate(to: .walk)
    }

    private func handleSignIn() {
        showingAuth = true
    }

    private func handleLearnMore() {
        showingLearnAboutPatina = true
    }

    private func handleIntent(_ intent: HeroFrameIntent) {
        if let route = intent.toAppRoute() {
            coordinator.navigate(to: route)
        } else if intent == .expandCompanion {
            onExpandCompanion?()
        }

        onNavigate?(intent)
    }

    private func handleCreateAccount(pendingRoomId: UUID) {
        self.pendingGuestRoomId = pendingRoomId
        showingAuth = true
    }

    private func handleContinueAsGuest(roomId: UUID) {
        // Dismiss the prompt and show carousel
        withAnimation {
            pageState = .roomCarousel
        }
    }

    /// Called after a guest walk completes to show the post-scan prompt
    public func showPostScanPrompt(roomId: UUID) {
        withAnimation {
            pageState = .postScanPrompt(roomId: roomId)
        }
    }
}

// MARK: - Preview

#Preview("Empty State") {
    UnifiedHeroPageView()
        .modelContainer(for: RoomModel.self, inMemory: true)
}

#Preview("With Rooms") {
    UnifiedHeroPageView()
        .modelContainer(for: RoomModel.self, inMemory: true)
}

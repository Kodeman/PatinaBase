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

    /// Sheet presentation flags for the `.auth` phase. Apple, Google, and
    /// Guest complete in-place; the email-code flow and the password fallback
    /// each open a form sheet.
    @State private var showingEmailCode = false
    @State private var showingPasswordSignIn = false

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
                    onSignInWithApple: { result, rawNonce in
                        Task {
                            let viewModel = AuthViewModel()
                            await viewModel.handleAppleSignIn(result: result, rawNonce: rawNonce)
                        }
                    },
                    onSignInWithGoogle: {
                        // Failures set AuthService.errorMessage, which the
                        // welcome screen's error banner surfaces.
                        Task {
                            try? await AuthService.shared.signInWithGoogle()
                        }
                    },
                    onContinueWithEmail: {
                        AuthService.shared.clearError()
                        showingEmailCode = true
                    },
                    onBrowseAsGuest: { coordinator.guestModeOptIn = true },
                    onUsePassword: {
                        AuthService.shared.clearError()
                        showingPasswordSignIn = true
                    },
                    // P-29: the root renders only what the root raised. A
                    // failure typed into either sheet below stays there.
                    errorMessage: AuthService.shared.rootErrorMessage,
                    isLoading: AuthService.shared.isLoading,
                    // L1F→A-2: second in the slot's precedence, so a held
                    // link is acknowledged only when nothing has gone wrong.
                    pendingLinkNotice: coordinator.pendingLinkNotice
                )
                .transition(.opacity)
                // Passwordless email code (unified sign-up + sign-in).
                .sheet(isPresented: $showingEmailCode) {
                    AuthenticationView(initialMode: .magicLink)
                }
                // Password fallback for returning users.
                .sheet(isPresented: $showingPasswordSignIn) {
                    AuthenticationView(initialMode: .signIn)
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
        // Option B context memory: remember only a coarse activity kind,
        // opaque identifier, and timestamp when a meaningful route changes.
        // The store intentionally receives no room notes, messages, imagery,
        // scan geometry, or other user-authored content.
        .onChange(of: coordinator.currentScreen, initial: true) { _, screen in
            ContextMemoryStore.shared.remember(route: screen)
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
        case .auth:
            AuthSheet()
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

    /// The four-tab root (B-1, R2).
    private var mainContent: some View {
        HouseFirstRoot()
    }
}

// MARK: - Preview

#Preview {
    ContentView()
        .appCoordinator(AppCoordinator())
}

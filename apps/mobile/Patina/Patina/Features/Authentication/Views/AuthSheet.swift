//
//  AuthSheet.swift
//  Patina
//
//  Modal sign-in over the current context. Dismisses itself when a session
//  lands. For phase-level ejection clear AppCoordinator.guestModeOptIn.
//

import SwiftUI

/// Wraps `AuthScreenView` for in-context sign-in prompts (the design-request
/// upload gate, and other callers that need auth without leaving their
/// current screen). Guests can still browse (no-op) but the presenting flow
/// only continues on a real sign-in.
struct AuthSheet: View {
    @Environment(\.dismiss) private var dismiss

    @State private var showingEmailCode = false
    @State private var showingPasswordSignIn = false

    var body: some View {
        AuthScreenView(
            onSignInWithApple: { result, rawNonce in
                Task {
                    let viewModel = AuthViewModel()
                    await viewModel.handleAppleSignIn(result: result, rawNonce: rawNonce)
                }
            },
            onSignInWithGoogle: {
                Task { try? await AuthService.shared.signInWithGoogle() }
            },
            onContinueWithEmail: {
                AuthService.shared.clearError()
                showingEmailCode = true
            },
            onUsePassword: {
                AuthService.shared.clearError()
                showingPasswordSignIn = true
            },
            // Upload requires a real account, so hide the guest affordance.
            showGuest: false,
            errorMessage: AuthService.shared.errorMessage
        )
        .sheet(isPresented: $showingEmailCode) {
            AuthenticationView(initialMode: .magicLink)
        }
        .sheet(isPresented: $showingPasswordSignIn) {
            AuthenticationView(initialMode: .signIn)
        }
        .onChange(of: AuthService.shared.isAuthenticated) { _, isAuth in
            if isAuth { dismiss() }
        }
    }
}

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

    /// SP-09: when the sheet is a SOFT wall over a flow the person is already
    /// in, it says what it is gating and offers a Cancel. `nil` keeps the
    /// bare presentation the app-level `.auth` sheet uses.
    var title: String? = nil

    @State private var showingEmailCode = false
    @State private var showingPasswordSignIn = false

    var body: some View {
        if let title {
            NavigationStack {
                gate
                    .navigationTitle(title)
                    .toolbarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { dismiss() }
                                .foregroundStyle(PatinaColors.Text.muted)
                                .accessibilityIdentifier("auth.sheet.cancel")
                        }
                    }
            }
        } else {
            // No title means this is not a soft wall over a flow in progress:
            // it is the app-level `.auth` sheet the Studio hub CTA, the feed's
            // guest CTA and the Companion prompt all raise. Those keep the bare
            // presentation they have always had — a nav bar carrying a blank
            // title would read as an unfinished screen.
            gate
        }
    }

    private var gate: some View {
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

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
    var title: String?

    @State private var showingEmailCode = false
    @State private var showingPasswordSignIn = false

    var body: some View {
        sheet
            // W1-B-12: the grabber `C-23` gave every other sheet. Applied to
            // both presentations, so a new caller cannot ship without it.
            .presentationDragIndicator(.visible)
    }

    @ViewBuilder
    private var sheet: some View {
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
            //
            // W1-B-12: bare is not the same as no way out. This sheet
            // presented with no dismiss control and no drag indicator — the
            // exact pair `A-100` / `C-23` had just given Settings — so a reader
            // who does not know to swipe down had no visible exit. It keeps its
            // blank-nav-bar-free presentation and gains the two affordances.
            gate
                .overlay(alignment: .topTrailing) {
                    Button("Done") { dismiss() }
                        .font(PatinaTypography.uiAction)
                        .foregroundStyle(PatinaColors.Text.interactive)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                        .padding(.trailing, PatinaSpacing.md)
                        .padding(.top, PatinaSpacing.xsm)
                        .accessibilityIdentifier("auth.sheet.done")
                }
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
            // P-29: same rule as the root — a nested sheet's failure belongs
            // to the nested sheet.
            errorMessage: AuthService.shared.rootErrorMessage,
            isLoading: AuthService.shared.isLoading,
            // L1F→A-2: a link held while this modal is up is acknowledged by
            // the sheet dismissing into the destination, not by this slot.
            pendingLinkNotice: nil
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

//
//  CompanionAuthPanel.swift
//  Patina
//
//  Auth panel shown when unauthenticated user taps Companion
//  Prompts login with value proposition messaging
//

import SwiftUI
import AuthenticationServices

/// Auth panel shown when unauthenticated user taps Companion
public struct CompanionAuthPanel: View {
    @Environment(\.appCoordinator) private var coordinator
    @State private var isLoading = false
    @State private var errorMessage: String?

    var onAuthComplete: (() -> Void)?
    var onDismiss: (() -> Void)?

    public init(onAuthComplete: (() -> Void)? = nil, onDismiss: (() -> Void)? = nil) {
        self.onAuthComplete = onAuthComplete
        self.onDismiss = onDismiss
    }

    public var body: some View {
        VStack(spacing: 0) {
            // Header with Strata Mark
            header
                .padding(.top, PatinaSpacing.lg)

            // Value proposition
            valueProp
                .padding(.top, PatinaSpacing.md)

            // Error message (if any)
            if let error = errorMessage {
                errorView(error)
                    .padding(.top, PatinaSpacing.md)
            }

            // Auth buttons
            authButtons
                .padding(.top, PatinaSpacing.xl)

            // Sign in link
            signInLink
                .padding(.top, PatinaSpacing.lg)

            Spacer(minLength: PatinaSpacing.xl)
        }
        .padding(.horizontal, PatinaSpacing.lg)
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: PatinaSpacing.md) {
            // Strata Mark
            StrataMarkView(color: PatinaColors.mochaBrown, scale: 1.2)
                .accessibilityHidden(true)

            // Title
            Text("Your design journey awaits")
                .font(PatinaTypography.h3)
                .foregroundColor(PatinaColors.Text.primary)
                .multilineTextAlignment(.center)
                .dynamicTypeSize(...DynamicTypeSize.accessibility2) // Cap at 150%
                .accessibilityAddTraits(.isHeader)
        }
    }

    // MARK: - Value Proposition

    private var valueProp: some View {
        Text("Sign in to unlock personalized recommendations, save your scanned rooms, and get assistance tailored to your unique style.")
            .font(PatinaTypography.body)
            .foregroundColor(PatinaColors.Text.secondary)
            .multilineTextAlignment(.center)
            .lineSpacing(4)
            .dynamicTypeSize(...DynamicTypeSize.accessibility2) // Cap at 150%
    }

    // MARK: - Error View

    private func errorView(_ message: String) -> some View {
        Text(message)
            .font(PatinaTypography.bodySmall)
            .foregroundColor(.red)
            .padding(PatinaSpacing.sm)
            .frame(maxWidth: .infinity)
            .background(Color.red.opacity(0.1))
            .cornerRadius(PatinaRadius.md)
    }

    // MARK: - Auth Buttons

    private var authButtons: some View {
        VStack(spacing: PatinaSpacing.md) {
            // Apple Sign In (Primary - black background per Apple guidelines)
            PatinaSignInWithAppleButton { result in
                Task {
                    await handleAppleSignIn(result: result)
                }
            }
            .frame(minHeight: 44) // Minimum touch target
            .disabled(isLoading)
            .accessibilityLabel(isLoading ? "Signing in with Apple" : "Sign in with Apple")
            .accessibilityHint("Uses your Apple ID for quick authentication")

            // Email Sign In (Secondary - outlined)
            Button {
                showEmailAuth()
            } label: {
                HStack(spacing: PatinaSpacing.sm) {
                    Image(systemName: "envelope")
                        .font(.system(size: 16, weight: .medium))
                        .accessibilityHidden(true)

                    Text("Continue with Email")
                        .font(PatinaTypography.bodyMedium)
                        .dynamicTypeSize(...DynamicTypeSize.accessibility2)
                }
                .foregroundColor(PatinaColors.Text.primary)
                .frame(maxWidth: .infinity, minHeight: 44) // Minimum touch target
                .padding(.vertical, PatinaSpacing.md)
                .background(Color.clear)
                .cornerRadius(PatinaRadius.lg)
                .overlay(
                    RoundedRectangle(cornerRadius: PatinaRadius.lg)
                        .stroke(PatinaColors.clayBeige, lineWidth: 1.5)
                )
            }
            .buttonStyle(PressableButtonStyle())
            .disabled(isLoading)
            .accessibilityLabel("Continue with Email")
            .accessibilityHint("Sign in or create account with email and password")
        }
    }

    // MARK: - Sign In Link

    private var signInLink: some View {
        HStack(spacing: PatinaSpacing.xs) {
            Text("Already have an account?")
                .font(PatinaTypography.bodySmall)
                .foregroundColor(PatinaColors.Text.muted)
                .dynamicTypeSize(...DynamicTypeSize.accessibility2)

            Button("Sign In") {
                showEmailAuth()
            }
            .font(PatinaTypography.bodySmallMedium)
            .foregroundColor(PatinaColors.mochaBrown)
            .dynamicTypeSize(...DynamicTypeSize.accessibility2)
            .accessibilityLabel("Sign in to existing account")
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: - Actions

    private func handleAppleSignIn(result: Result<ASAuthorization, Error>) async {
        switch result {
        case .success(let authorization):
            if let credential = authorization.credential as? ASAuthorizationAppleIDCredential {
                isLoading = true
                errorMessage = nil

                do {
                    try await AuthService.shared.signInWithApple(credential: credential)
                    HapticManager.shared.impact(.medium)

                    // Track successful auth
                    CompanionAnalytics.shared.trackAuthCompleted(
                        method: .apple,
                        isNewUser: credential.email != nil // New users have email in credential
                    )

                    // Identify user in analytics
                    if let userId = AuthService.shared.currentUserId {
                        PostHogService.shared.identify(userId: userId, properties: [
                            "auth_method": "apple"
                        ])
                    }

                    onAuthComplete?()
                } catch {
                    errorMessage = "Sign in failed. Please try again."
                    HapticManager.shared.impact(.rigid)

                    // Track auth failure
                    CompanionAnalytics.shared.trackAuthFailed(
                        method: .apple,
                        errorCode: String(describing: type(of: error))
                    )
                }

                isLoading = false
            }
        case .failure(let error):
            // User cancelled or other error
            if (error as NSError).code != ASAuthorizationError.canceled.rawValue {
                errorMessage = "Apple Sign In failed. Please try again."

                // Track auth failure
                CompanionAnalytics.shared.trackAuthFailed(
                    method: .apple,
                    errorCode: String((error as NSError).code)
                )
            }
        }
    }

    private func showEmailAuth() {
        HapticManager.shared.impact(.light)
        coordinator.showingAuth = true
        onDismiss?()
    }
}

// MARK: - Preview

#Preview("Auth Panel") {
    VStack {
        Spacer()
        CompanionAuthPanel()
            .frame(height: 400)
            .background(PaperBackground(cornerRadius: 24, textureIntensity: 0.4))
            .clipShape(RoundedRectangle(cornerRadius: 24))
            .padding()
    }
    .background(PatinaColors.Background.primary)
}

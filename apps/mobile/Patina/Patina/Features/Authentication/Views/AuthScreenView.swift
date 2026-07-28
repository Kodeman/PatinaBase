//
//  AuthScreenView.swift
//  Patina
//
//  Welcome / authentication screen. Passwordless-first: Apple is the hero,
//  email uses a one-time code (no password, no confirmation round-trip), and a
//  prominent "Look around first" fully defers the account (soft wall). Password
//  is a de-emphasized fallback for returning users.
//

import SwiftUI
import AuthenticationServices

struct AuthScreenView: View {
    /// Apple completion carries the raw nonce so the service can pass it to
    /// `signInWithIdToken(nonce:)`.
    var onSignInWithApple: (Result<ASAuthorization, Error>, _ rawNonce: String) -> Void = { _, _ in }
    var onSignInWithGoogle: () -> Void = {}
    /// Opens the passwordless email-code flow (unified sign-up + sign-in).
    var onContinueWithEmail: () -> Void = {}
    /// Soft wall — browse the marketplace without an account.
    var onBrowseAsGuest: () -> Void = {}
    /// De-emphasized fallback for returning password users.
    var onUsePassword: () -> Void = {}
    /// Whether to show the "Look around first" guest affordance. Hidden when
    /// the screen is used as a hard gate (e.g. the design-request upload step),
    /// where browsing without an account isn't a meaningful action.
    var showGuest: Bool = true
    /// Latest auth error (Apple/Google/service). Rendered as a small banner.
    var errorMessage: String? = nil

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
                .frame(height: 80)

            // PATINA wordmark
            Text("PATINA")
                .font(PatinaTypography.authLogo)
                .foregroundStyle(PatinaColors.Text.primary)
                .tracking(6)

            // Strata mini mark
            VStack(spacing: 3) {
                Capsule().fill(PatinaColors.Strata.line1).frame(width: 40, height: 1.5)
                Capsule().fill(PatinaColors.Strata.line2).frame(width: 32, height: 1.5)
                Capsule().fill(PatinaColors.Strata.line3).frame(width: 24, height: 1.5)
            }
            .padding(.top, 10)
            .padding(.bottom, 40)

            // Welcome text
            Text("Welcome home")
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.Text.primary)
                .padding(.bottom, 6)

            Text("Start with a piece you love")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.muted)
                .padding(.bottom, 24)

            // Error banner — surfaces Apple/Google/service failures that the
            // welcome screen previously swallowed. User-cancellation is silent.
            if let errorMessage {
                Text(errorMessage)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 28)
                    .padding(.bottom, 16)
                    .accessibilityIdentifier("auth.welcome.errorBanner")
            }

            // Primary auth methods — Apple hero, then Google, then email code.
            VStack(spacing: 12) {
                PatinaSignInWithAppleButton { result, rawNonce in
                    onSignInWithApple(result, rawNonce)
                }
                .accessibilityIdentifier("auth.welcome.appleButton")

                AuthButton(title: "Continue with Google", icon: "G", style: .google, action: onSignInWithGoogle)
                    .accessibilityIdentifier("auth.welcome.googleButton")

                AuthButton(title: "Continue with email", icon: "✉", style: .email, action: onContinueWithEmail)
                    .accessibilityIdentifier("auth.welcome.emailButton")
            }
            .padding(.horizontal, 28)

            if showGuest {
                // Divider
                HStack(spacing: 16) {
                    Rectangle().fill(PatinaColors.Text.muted.opacity(0.25)).frame(height: 1)
                    Text("or")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                    Rectangle().fill(PatinaColors.Text.muted.opacity(0.25)).frame(height: 1)
                }
                .padding(.horizontal, 28)
                .padding(.vertical, 20)

                // Soft wall — prominent "look around" that fully works without
                // an account (browse + save via the marketplace home).
                Button(action: onBrowseAsGuest) {
                    HStack(spacing: 8) {
                        Text("Look around first")
                        Image(systemName: "arrow.right")
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .font(PatinaTypography.uiAction)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(PatinaColors.Background.secondary)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(PatinaColors.pearl, lineWidth: 1.5)
                    )
                }
                .buttonStyle(PressableButtonStyle())
                .padding(.horizontal, 28)
                .accessibilityIdentifier("auth.welcome.guestButton")
            }

            // Password fallback — de-emphasized, for returning password users.
            Button(action: onUsePassword) {
                (Text("Have a password? ")
                    .foregroundStyle(PatinaColors.Text.muted)
                 + Text("Sign in")
                    .foregroundStyle(PatinaColors.Text.interactive))
                    .font(PatinaTypography.caption)
            }
            .padding(.top, 16)
            .accessibilityIdentifier("auth.welcome.passwordButton")

            Spacer()

            // Footer — U05: these read as links, so they behave as links. Both
            // resolve to the combined Terms & Privacy page, the same URL the
            // Settings Support group opens; the app knows no separate privacy
            // route, and a link to a page that exists beats one that doesn't.
            VStack(spacing: 2) {
                Text("By continuing, you agree to our")
                    .foregroundStyle(PatinaColors.Text.muted)

                HStack(spacing: 4) {
                    Link("Terms of Service", destination: Self.termsURL)
                        .accessibilityIdentifier("auth.welcome.termsLink")
                    Text("and")
                        .foregroundStyle(PatinaColors.Text.muted)
                    Link("Privacy Policy", destination: Self.privacyURL)
                        .accessibilityIdentifier("auth.welcome.privacyLink")
                }
                .foregroundStyle(PatinaColors.Text.interactive)
            }
            .font(PatinaTypography.caption)
            .multilineTextAlignment(.center)
            .lineSpacing(2)
            .padding(.horizontal, 28)
            .padding(.bottom, 40)
        }
        .frame(maxWidth: .infinity)
        .background(PatinaColors.Background.primary)
    }

    /// Combined Terms & Privacy page — mirrors the URL behind SettingsView's
    /// "Terms & Privacy" Support row.
    private static let termsURL = URL(string: "https://patina.cloud/terms")!
    private static let privacyURL = URL(string: "https://patina.cloud/terms")!
}

#Preview {
    AuthScreenView(errorMessage: nil)
}

#Preview("With error") {
    AuthScreenView(errorMessage: "Apple Sign In couldn't be completed. Please try again.")
}

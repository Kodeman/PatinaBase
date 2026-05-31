//
//  AuthScreenView.swift
//  Patina
//
//  Authentication screen matching the new design — wordmark, strata, auth buttons
//

import SwiftUI
import AuthenticationServices

struct AuthScreenView: View {
    var onSignInWithApple: (Result<ASAuthorization, Error>) -> Void = { _ in }
    var onSignInWithGoogle: () -> Void = {}
    var onSignInWithEmail: () -> Void = {}
    var onCreateAccount: () -> Void = {}
    var onBrowseAsGuest: () -> Void = {}

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
                .frame(height: 80)

            // PATINA wordmark
            Text("PATINA")
                .font(PatinaTypography.authLogo)
                .foregroundStyle(PatinaColors.charcoal)
                .tracking(6)

            // Strata mini mark
            VStack(spacing: 3) {
                Capsule().fill(PatinaColors.mocha).frame(width: 40, height: 1.5)
                Capsule().fill(PatinaColors.clay).frame(width: 32, height: 1.5)
                Capsule().fill(PatinaColors.clay.opacity(0.5)).frame(width: 24, height: 1.5)
            }
            .padding(.top, 10)
            .padding(.bottom, 40)

            // Welcome text
            Text("Welcome home")
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.charcoal)
                .padding(.bottom, 6)

            Text("Join thousands of design enthusiasts")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.agedOak)
                .padding(.bottom, 32)

            // Auth buttons
            VStack(spacing: 12) {
                SignInWithAppleButton(.signIn) { request in
                    request.requestedScopes = [.email, .fullName]
                } onCompletion: { result in
                    onSignInWithApple(result)
                }
                .signInWithAppleButtonStyle(.black)
                .frame(maxWidth: .infinity, minHeight: 50, maxHeight: 50)
                .clipShape(RoundedRectangle(cornerRadius: 12))

                AuthButton(title: "Continue with Google", icon: "G", style: .google, action: onSignInWithGoogle)
                    .accessibilityIdentifier("auth.welcome.googleButton")
                AuthButton(title: "Sign in with Email", icon: "✉", style: .email, action: onSignInWithEmail)
                    .accessibilityIdentifier("auth.welcome.emailButton")
                AuthButton(title: "Create Account", icon: "+", style: .email, action: onCreateAccount)
                    .accessibilityIdentifier("auth.welcome.createAccountButton")
            }
            .padding(.horizontal, 28)

            // Divider
            HStack(spacing: 16) {
                Rectangle().fill(PatinaColors.pearl).frame(height: 1)
                Text("or")
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.agedOak)
                Rectangle().fill(PatinaColors.pearl).frame(height: 1)
            }
            .padding(.horizontal, 28)
            .padding(.vertical, 20)

            // Browse as guest
            Button {
                onBrowseAsGuest()
            } label: {
                Text("Browse as Guest")
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.clay)
            }
            .accessibilityIdentifier("auth.welcome.guestButton")

            Spacer()

            // Footer
            Text("By continuing, you agree to our Terms of Service\nand Privacy Policy")
                .font(.system(size: 11))
                .foregroundStyle(PatinaColors.agedOak)
                .multilineTextAlignment(.center)
                .lineSpacing(2)
                .padding(.bottom, 40)
        }
        .frame(maxWidth: .infinity)
        .background(PatinaColors.offWhite)
    }
}

#Preview {
    AuthScreenView()
}

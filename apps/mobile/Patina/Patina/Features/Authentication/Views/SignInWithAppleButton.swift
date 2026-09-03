//
//  SignInWithAppleButton.swift
//  Patina
//
//  Sign in with Apple button component
//

import SwiftUI
import AuthenticationServices

/// Patina-styled Sign in with Apple button.
///
/// Generates a per-instance nonce, sets its SHA256 on the authorization
/// request, and hands the RAW nonce back through the completion callback so
/// the auth service can pass it to `signInWithIdToken(nonce:)` — the required
/// replay-protection for the Apple id-token flow.
public struct PatinaSignInWithAppleButton: View {
    let onCompletion: (Result<ASAuthorization, Error>, _ rawNonce: String) -> Void

    /// Raw nonce for the current attempt. Read in the `request` closure
    /// (hashed) and returned (unhashed) on completion, so both halves of the
    /// flow reference the same value. Rotated after each attempt.
    @State private var rawNonce: String = AppleSignInNonce.random()

    /// P-35 / C3-03: the button was hard-coded `.black`. Against the warm
    /// near-black canvas that is 1.27:1 — on the app's first screen, its first
    /// tap target reads as a hole while the two outlined buttons beneath it
    /// become the most visible things on the page. Apple's HIG asks for
    /// `.white` on a dark ground.
    @Environment(\.colorScheme) private var colorScheme

    public init(
        onCompletion: @escaping (Result<ASAuthorization, Error>, _ rawNonce: String) -> Void
    ) {
        self.onCompletion = onCompletion
    }

    public var body: some View {
        SignInWithAppleButton(.signIn) { request in
            request.requestedScopes = [.email, .fullName]
            request.nonce = AppleSignInNonce.sha256(rawNonce)
        } onCompletion: { result in
            onCompletion(result, rawNonce)
            // Rotate so a second attempt in the same view lifetime gets a
            // fresh nonce.
            rawNonce = AppleSignInNonce.random()
        }
        .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
        // `SignInWithAppleButton` wraps `ASAuthorizationAppleIDButton`, whose
        // style is fixed when the UIView is made. Sim-verified: a cold launch
        // picks the right style, but flipping the system appearance while the
        // screen is up left the old one. Changing the view's identity with the
        // scheme is what rebuilds it.
        .id(colorScheme)
        .frame(maxWidth: .infinity, minHeight: 50, maxHeight: 50)
        .fixedSize(horizontal: false, vertical: true)
        .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.lg))
    }
}

// MARK: - Preview

#Preview {
    VStack {
        PatinaSignInWithAppleButton { result, _ in
            PatinaLog.auth.debug("Apple sign in result: \(result)")
        }
        .padding()
    }
    .background(PatinaColors.Background.primary)
}

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
        .signInWithAppleButtonStyle(.black)
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

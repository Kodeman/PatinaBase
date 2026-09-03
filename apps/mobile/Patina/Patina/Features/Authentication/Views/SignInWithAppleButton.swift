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

    /// W1-A-05 / D-L1A-1 — `ASAuthorizationAppleIDButton` derives its title
    /// size from its own frame height, and the frame was pinned at 50 pt. At
    /// `accessibility-extra-large` every neighbour on the Welcome screen
    /// scaled — "Continue with email" wrapped to two lines inside its button —
    /// while "Sign in with Apple" stayed at its default size and became the
    /// SMALLEST text on the screen, directly above them. `@ScaledMetric` ties
    /// the height to the reader's text size, which is the only lever the
    /// system button exposes.
    @ScaledMetric(relativeTo: .body) private var scaledHeight: CGFloat = 50

    /// Ceiling on that growth. At `accessibility5` the metric reaches ~155 pt,
    /// which would make the first control on the screen taller than the two
    /// beneath it put together; 84 pt is the height at which the Apple label
    /// matches "Continue with email" at the same size.
    private static let maximumHeight: CGFloat = 84

    private var buttonHeight: CGFloat {
        min(max(scaledHeight, 50), Self.maximumHeight)
    }

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
        .frame(maxWidth: .infinity, minHeight: buttonHeight, maxHeight: buttonHeight)
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

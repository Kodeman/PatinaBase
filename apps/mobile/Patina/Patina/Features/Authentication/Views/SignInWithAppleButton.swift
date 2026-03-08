//
//  SignInWithAppleButton.swift
//  Patina
//
//  Sign in with Apple button component
//

import SwiftUI
import AuthenticationServices

/// Patina-styled Sign in with Apple button
public struct PatinaSignInWithAppleButton: View {
    let onCompletion: (Result<ASAuthorization, Error>) -> Void

    public init(onCompletion: @escaping (Result<ASAuthorization, Error>) -> Void) {
        self.onCompletion = onCompletion
    }

    public var body: some View {
        SignInWithAppleButton(.signIn) { request in
            request.requestedScopes = [.email, .fullName]
        } onCompletion: { result in
            onCompletion(result)
        }
        .signInWithAppleButtonStyle(.black)
        .frame(maxWidth: .infinity, minHeight: 50, maxHeight: 50)
        .fixedSize(horizontal: false, vertical: true)
        .cornerRadius(PatinaRadius.lg)
    }
}

// MARK: - Preview

#Preview {
    VStack {
        PatinaSignInWithAppleButton { result in
            print("Apple sign in result: \(result)")
        }
        .padding()
    }
    .background(PatinaColors.Background.primary)
}

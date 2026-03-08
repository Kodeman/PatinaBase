//
//  AuthViewModel.swift
//  Patina
//
//  ViewModel for authentication views
//

import Foundation
import AuthenticationServices
import Auth

/// ViewModel for authentication
@Observable
public final class AuthViewModel {

    // MARK: - State

    /// Current auth mode
    public var mode: AuthMode = .signIn

    /// Email input
    public var email = ""

    /// Password input
    public var password = ""

    /// Display name for sign up
    public var displayName = ""

    /// Whether form is valid
    public var isFormValid: Bool {
        switch mode {
        case .signIn:
            return isValidEmail && password.count >= 6
        case .signUp:
            return isValidEmail && password.count >= 8 && !displayName.isEmpty
        case .magicLink, .resetPassword:
            return isValidEmail
        }
    }

    /// Loading state
    public var isLoading: Bool {
        authService.isLoading
    }

    /// Error message
    public var errorMessage: String? {
        authService.errorMessage
    }

    /// Success message (e.g., for password reset)
    public var successMessage: String?

    /// Whether password reset was successful
    public var showResetSuccess: Bool = false

    /// Whether magic link was sent
    public var magicLinkSent: Bool = false

    /// Email used for magic link (for resend)
    public var magicLinkEmail: String = ""

    /// Cooldown timer for magic link resend
    public var magicLinkCooldown: Int = 0

    // MARK: - Private

    private let authService = AuthService.shared
    private var coordinator: AppCoordinator?

    // MARK: - Initialization

    public init(coordinator: AppCoordinator? = nil) {
        self.coordinator = coordinator
    }

    // MARK: - Validation

    private var isValidEmail: Bool {
        let emailRegex = #"^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$"#
        let predicate = NSPredicate(format: "SELF MATCHES[c] %@", emailRegex)
        return predicate.evaluate(with: email)
    }

    // MARK: - Actions

    /// Sign in with email/password
    @MainActor
    public func signIn() async {
        do {
            try await authService.signIn(email: email, password: password)
            coordinator?.setAuthState(.authenticated(userId: authService.currentUser?.id.uuidString ?? ""))
        } catch {
            // Error is already set in authService
        }
    }

    /// Sign up with email/password
    @MainActor
    public func signUp() async {
        do {
            try await authService.signUp(email: email, password: password, displayName: displayName)
            coordinator?.setAuthState(.authenticated(userId: authService.currentUser?.id.uuidString ?? ""))
        } catch {
            // Error is already set in authService
        }
    }

    /// Reset password
    @MainActor
    public func resetPassword() async {
        do {
            try await authService.resetPassword(email: email)
            successMessage = "Check your email for a password reset link"
            showResetSuccess = true
            // Return to sign in mode after showing success
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
                self?.mode = .signIn
                self?.showResetSuccess = false
                self?.successMessage = nil
            }
        } catch {
            // Error is already set in authService
        }
    }

    /// Send magic link
    @MainActor
    public func sendMagicLink() async {
        do {
            try await authService.sendMagicLink(email: email)
            magicLinkSent = true
            magicLinkEmail = email
            magicLinkCooldown = 60
            successMessage = "Check your email for a magic link"
            startCooldownTimer()
        } catch {
            // Error is already set in authService
        }
    }

    /// Resend magic link
    @MainActor
    public func resendMagicLink() async {
        guard magicLinkCooldown == 0 else { return }
        do {
            try await authService.sendMagicLink(email: magicLinkEmail)
            magicLinkCooldown = 60
            startCooldownTimer()
        } catch {
            // Error is already set in authService
        }
    }

    /// Start cooldown timer for magic link resend
    private func startCooldownTimer() {
        Task { @MainActor in
            while magicLinkCooldown > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                magicLinkCooldown -= 1
            }
        }
    }

    /// Handle Sign in with Apple credential
    @MainActor
    public func handleAppleSignIn(result: Result<ASAuthorization, Error>) async {
        switch result {
        case .success(let authorization):
            if let credential = authorization.credential as? ASAuthorizationAppleIDCredential {
                do {
                    try await authService.signInWithApple(credential: credential)
                    coordinator?.setAuthState(.authenticated(userId: authService.currentUser?.id.uuidString ?? ""))
                } catch {
                    // Error is already set in authService
                }
            }
        case .failure(let error):
            print("Apple Sign In failed: \(error.localizedDescription)")
        }
    }

    /// Clear form
    public func clearForm() {
        email = ""
        password = ""
        displayName = ""
        successMessage = nil
        showResetSuccess = false
        magicLinkSent = false
        magicLinkEmail = ""
        magicLinkCooldown = 0
    }
}

// MARK: - Auth Mode

public enum AuthMode: String, CaseIterable {
    case signIn = "Sign In"
    case signUp = "Sign Up"
    case magicLink = "Magic Link"
    case resetPassword = "Reset Password"
}

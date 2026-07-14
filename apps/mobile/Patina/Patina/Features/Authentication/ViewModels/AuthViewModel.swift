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

    /// Email whose verification we're awaiting. When set, the view should
    /// render the "check your inbox" recovery panel instead of the form.
    /// Production has `mailer_autoconfirm: false`, so fresh signups can't
    /// password-sign-in until they click the verification link.
    public var emailAwaitingVerification: String?

    /// Whether the resend-verification request is in flight. Distinct from
    /// `authService.isLoading` so the recovery panel can show its own
    /// spinner without re-disabling the rest of the form.
    public var isResendingVerification: Bool = false

    /// Cooldown timer (seconds) for resend-verification to prevent rapid
    /// taps against GoTrue's rate limits.
    public var verificationResendCooldown: Int = 0

    /// Transient success message shown after a verification email resend.
    public var verificationResendSuccess: Bool = false

    /// Whether the "Enter code instead" OTP entry panel is shown in place
    /// of the magic-link confirmation. Toggled by the user from the
    /// post-send panel when they can't click the email link (shared-email
    /// setups, broken universal links, etc.).
    public var showOtpEntry: Bool = false

    /// 6-digit OTP code bound to the entry field. Non-digits are stripped
    /// by the view's `onChange` so the regex check stays simple.
    public var otpToken: String = ""

    /// Whether an OTP verify is currently in flight. Distinct from
    /// `authService.isLoading` so the verify button can disable itself
    /// without blocking the rest of the panel.
    public var isVerifyingOtp: Bool = false

    // MARK: - Private

    private let authService = AuthService.shared
    private var cooldownTask: Task<Void, Never>?
    private var verificationCooldownTask: Task<Void, Never>?

    /// Cancel-safe handle for the in-flight OTP verify so rapid taps
    /// don't fan out into concurrent verify requests (Task 1.5 pattern).
    private var verifyOtpTask: Task<Void, Never>?

    // MARK: - Initialization

    public init(initialMode: AuthMode = .signIn) {
        self.mode = initialMode
    }

    // MARK: - Validation

    private var isValidEmail: Bool {
        let emailRegex = #"^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$"#
        let predicate = NSPredicate(format: "SELF MATCHES[c] %@", emailRegex)
        return predicate.evaluate(with: email)
    }

    // MARK: - Actions

    /// Sign in with email/password. The session lands via the auth
    /// state listener in `AuthService`, which is observed by
    /// `AppCoordinator.recomputePhase()` — so the view layer transitions
    /// away from `.auth` without this view model needing to push state.
    @MainActor
    public func signIn() async {
        do {
            try await authService.signIn(email: email, password: password)
        } catch AuthServiceError.emailNotConfirmed(let unverifiedEmail) {
            // Route to the "check your inbox" recovery panel. Clear the
            // generic error banner from authService so it doesn't shadow
            // the new UI, and stash the email for the resend action.
            emailAwaitingVerification = unverifiedEmail
            authService.clearError()
        } catch {
            // Error is already set in authService
        }
    }

    /// Sign up with email/password. Session lands via auth state
    /// listener → phase observer; no coordinator push needed.
    @MainActor
    public func signUp() async {
        do {
            try await authService.signUp(email: email, password: password, displayName: displayName)
        } catch AuthServiceError.emailNotConfirmed(let unverifiedEmail) {
            // Production returns a user but no session on signup (email
            // confirmation on). Route to the same "check your inbox" recovery
            // panel the sign-in path uses instead of stranding the user.
            emailAwaitingVerification = unverifiedEmail
            authService.clearError()
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
            Task { [weak self] in
                try? await Task.sleep(for: .seconds(2))
                self?.mode = .signIn
                self?.showResetSuccess = false
                self?.successMessage = nil
            }
        } catch {
            // Error is already set in authService
        }
    }

    /// Request a passwordless sign-in code and go straight to the code-entry
    /// surface. We lead with the 6-digit code (not the "click the link" panel)
    /// because the code is the lowest-friction, redirect-free path — the emailed
    /// link is a fallback the user can still reach from the "← Back" affordance.
    @MainActor
    public func sendMagicLink() async {
        do {
            try await authService.sendMagicLink(email: email)
            magicLinkSent = true
            magicLinkEmail = email
            magicLinkCooldown = 60
            showOtpEntry = true
            otpToken = ""
            successMessage = "We emailed you a 6-digit code"
            startCooldownTimer()
        } catch {
            // Error is already set in authService
        }
    }

    /// Show the "Enter code instead" OTP entry panel from the magic-link
    /// post-send view. Clears any existing error so the previous send's
    /// failure (if any) doesn't shadow the new entry surface, but keeps
    /// `magicLinkEmail` since that's the address the OTP was sent to.
    @MainActor
    public func showOtpEntryForMagicLink() {
        showOtpEntry = true
        otpToken = ""
        isVerifyingOtp = false
        authService.clearError()
    }

    /// Verify the 6-digit OTP code the user pasted from their email.
    ///
    /// Coalesces rapid taps via a stored task handle (Task 1.5 pattern):
    /// if a verify is already in flight, this is a no-op. On success the
    /// auth state listener in `AuthService` sets the session, and the
    /// phase observer in `AppCoordinator` transitions away from `.auth`.
    /// On failure `authService.errorMessage` surfaces through the same
    /// error banner the rest of the form uses.
    @MainActor
    public func verifyOtp() async {
        guard !isVerifyingOtp else { return }
        guard otpToken.count == 6 else { return }
        verifyOtpTask?.cancel()

        let email = magicLinkEmail
        let token = otpToken
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            self.isVerifyingOtp = true
            defer { self.isVerifyingOtp = false }
            do {
                try await self.authService.verifyOtp(email: email, token: token)
            } catch {
                // authService.errorMessage is already set; clear the
                // entered token so the user can retype without backspacing
                // through six digits.
                self.otpToken = ""
            }
        }
        verifyOtpTask = task
        await task.value
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
        cooldownTask?.cancel()
        cooldownTask = Task { @MainActor in
            while magicLinkCooldown > 0 {
                guard !Task.isCancelled else { break }
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                magicLinkCooldown = max(0, magicLinkCooldown - 1)
            }
        }
    }

    /// Resend the signup verification email for the address the user
    /// just attempted to sign in with. No-ops if there's no email
    /// awaiting verification or a resend is already in flight.
    @MainActor
    public func resendVerificationEmail() async {
        guard let email = emailAwaitingVerification else { return }
        guard !isResendingVerification else { return }
        guard verificationResendCooldown == 0 else { return }

        isResendingVerification = true
        verificationResendSuccess = false
        authService.clearError()
        defer { isResendingVerification = false }

        do {
            try await authService.resendVerificationEmail(email)
            verificationResendSuccess = true
            verificationResendCooldown = 60
            startVerificationResendCooldownTimer()
        } catch {
            // authService.errorMessage is already set; the recovery panel
            // surfaces it via the same error banner the form uses.
        }
    }

    /// Tick down the verification-resend cooldown. Mirrors the magic-link
    /// cooldown pattern so the two resend flows feel consistent.
    private func startVerificationResendCooldownTimer() {
        verificationCooldownTask?.cancel()
        verificationCooldownTask = Task { @MainActor in
            while verificationResendCooldown > 0 {
                guard !Task.isCancelled else { break }
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                verificationResendCooldown = max(0, verificationResendCooldown - 1)
            }
        }
    }

    /// Handle Sign in with Google (OAuth web flow). Session lands via
    /// auth state listener → phase observer.
    @MainActor
    public func handleGoogleSignIn() async {
        do {
            try await authService.signInWithGoogle()
        } catch {
            // Error is already set in authService
        }
    }

    /// Handle Sign in with Apple credential. Session lands via auth
    /// state listener → phase observer; this used to imperatively push
    /// auth state to the coordinator, which is exactly the pattern that
    /// left the view re-rendering instead of dismissing on success.
    @MainActor
    public func handleAppleSignIn(
        result: Result<ASAuthorization, Error>,
        rawNonce: String?
    ) async {
        switch result {
        case .success(let authorization):
            if let credential = authorization.credential as? ASAuthorizationAppleIDCredential {
                do {
                    try await authService.signInWithApple(credential: credential, rawNonce: rawNonce)
                } catch {
                    // Error is already set in authService
                }
            }
        case .failure(let error):
            // A user-cancelled prompt is not an error and must stay silent;
            // anything else surfaces on the shared auth banner so the welcome
            // screen no longer swallows Apple failures.
            if (error as? ASAuthorizationError)?.code != .canceled {
                authService.reportExternalError(
                    "Apple Sign In couldn't be completed. Please try again."
                )
            }
            PatinaLog.auth.error("Apple Sign In failed: \(error.localizedDescription)")
        }
    }

    /// Clear form
    public func clearForm() {
        email = ""
        password = ""
        displayName = ""
        successMessage = nil
        showResetSuccess = false
        authService.clearError()
        magicLinkSent = false
        magicLinkEmail = ""
        magicLinkCooldown = 0
        emailAwaitingVerification = nil
        isResendingVerification = false
        verificationResendCooldown = 0
        verificationResendSuccess = false
        verifyOtpTask?.cancel()
        verifyOtpTask = nil
        showOtpEntry = false
        otpToken = ""
        isVerifyingOtp = false
    }
}

// MARK: - Auth Mode

public enum AuthMode: String, CaseIterable {
    case signIn = "Sign In"
    case signUp = "Sign Up"
    case magicLink = "Magic Link"
    case resetPassword = "Reset Password"
}

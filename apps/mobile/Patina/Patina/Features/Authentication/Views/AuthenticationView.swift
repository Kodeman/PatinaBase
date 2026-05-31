//
//  AuthenticationView.swift
//  Patina
//
//  Main authentication view with sign in, sign up, and password reset
//

import SwiftUI

/// Main authentication view
public struct AuthenticationView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: AuthViewModel
    @State private var didBootstrapUITestAuth = false

    public init(initialMode: AuthMode = .signIn) {
        _viewModel = State(wrappedValue: AuthViewModel(initialMode: initialMode))
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: PatinaSpacing.xl) {
                    // Header
                    header

                    // Form
                    formContent

                    // Sign in with Apple
                    if viewModel.mode != .resetPassword
                        && viewModel.emailAwaitingVerification == nil {
                        divider
                        appleSignIn
                    }

                    // Mode switcher — hidden while the user is in the
                    // email-verification recovery flow; the recovery panel
                    // owns the "use a different email" affordance.
                    if viewModel.emailAwaitingVerification == nil {
                        modeSwitcher
                    }
                }
                .padding(PatinaSpacing.xl)
            }
            .background(PatinaColors.Background.primary)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundColor(PatinaColors.Text.secondary)
                }
            }
            .task {
                await runUITestAuthBootstrapIfNeeded()
            }
        }
    }

    /// Drive the magic-link → OTP flow end-to-end when running under XCUITest
    /// with `UITEST_AUTH_EMAIL` + `UITEST_AUTH_OTP` set. This is best-effort:
    /// it requires the backing Supabase project to accept the provided OTP
    /// for the given email (typically a seeded test account, or a fixed
    /// dev-mode token). On any failure we leave the form in whatever state
    /// it lands in so a human running the simulator can take over.
    ///
    /// Idempotent — guarded by `didBootstrapUITestAuth` so re-renders don't
    /// retrigger the verify call.
    @MainActor
    private func runUITestAuthBootstrapIfNeeded() async {
        guard !didBootstrapUITestAuth else { return }
        guard let email = PatinaApp.uitestingAuthEmail,
              let otp = PatinaApp.uitestingAuthOtp else {
            return
        }
        didBootstrapUITestAuth = true

        // Switch into magic-link mode (overrides whatever `initialMode` was)
        // and send the magic link to the seeded test inbox.
        viewModel.mode = .magicLink
        viewModel.email = email
        await viewModel.sendMagicLink()

        // Brief settle so the magic-link-sent panel renders before we flip
        // into the OTP entry surface; supabase-swift's sendMagicLink
        // returns synchronously after the request but the UI mutations
        // happen on the main actor on the next runloop tick.
        try? await Task.sleep(nanoseconds: 250_000_000)

        viewModel.showOtpEntry = true
        viewModel.otpToken = otp
        await viewModel.verifyOtp()
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: PatinaSpacing.md) {
            StrataMarkView(color: PatinaColors.mocha, scale: 1.2)
                .padding(.bottom, PatinaSpacing.sm)

            Text(headerTitle)
                .font(PatinaTypography.h2)
                .foregroundColor(PatinaColors.Text.primary)

            Text(headerSubtitle)
                .font(PatinaTypography.body)
                .foregroundColor(PatinaColors.Text.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.top, PatinaSpacing.xl)
    }

    private var headerTitle: String {
        if viewModel.emailAwaitingVerification != nil {
            return "Verify your email"
        }
        return viewModel.mode.rawValue
    }

    private var headerSubtitle: String {
        if viewModel.emailAwaitingVerification != nil {
            return "One last step before you can sign in"
        }
        switch viewModel.mode {
        case .signIn:
            return "Welcome back to Patina"
        case .signUp:
            return "Join the furniture discovery journey"
        case .magicLink:
            return "Sign in with a magic link"
        case .resetPassword:
            return "We'll send you a reset link"
        }
    }

    // MARK: - Form

    private var formContent: some View {
        VStack(spacing: PatinaSpacing.md) {
            // Success message (e.g., password reset, magic link sent)
            if let success = viewModel.successMessage {
                HStack(spacing: PatinaSpacing.sm) {
                    Image(systemName: viewModel.magicLinkSent ? "envelope.fill" : "checkmark.circle.fill")
                        .foregroundColor(.green)
                    Text(success)
                        .font(PatinaTypography.bodySmall)
                        .foregroundColor(.green)
                }
                .padding(PatinaSpacing.md)
                .frame(maxWidth: .infinity)
                .background(Color.green.opacity(0.1))
                .cornerRadius(PatinaRadius.md)
            }

            // Error message
            if let error = viewModel.errorMessage {
                Text(error)
                    .font(PatinaTypography.bodySmall)
                    .foregroundColor(.red)
                    .padding(PatinaSpacing.md)
                    .background(Color.red.opacity(0.1))
                    .cornerRadius(PatinaRadius.md)
                    .accessibilityIdentifier("auth.form.errorBanner")
            }

            // Email-not-confirmed recovery state (production blocks
            // password sign-in until the verification link is clicked).
            if viewModel.emailAwaitingVerification != nil {
                emailVerificationNeededView
            } else if viewModel.mode == .magicLink
                        && viewModel.magicLinkSent
                        && viewModel.showOtpEntry {
                otpEntryView
            } else if viewModel.mode == .magicLink && viewModel.magicLinkSent {
                magicLinkSentView
            } else {
                // Display name (sign up only)
                if viewModel.mode == .signUp {
                    PatinaTextField(
                        "Display Name",
                        text: $viewModel.displayName,
                        icon: "person"
                    )
                    .accessibilityIdentifier("auth.form.displayNameField")
                }

                // Email
                PatinaTextField(
                    "Email",
                    text: $viewModel.email,
                    icon: "envelope",
                    keyboardType: .emailAddress,
                    autocapitalization: .never
                )
                .accessibilityIdentifier("auth.form.emailField")

                // Password (not for reset or magic link)
                if viewModel.mode != .resetPassword && viewModel.mode != .magicLink {
                    PatinaTextField(
                        "Password",
                        text: $viewModel.password,
                        icon: "lock",
                        isSecure: true
                    )
                    .accessibilityIdentifier("auth.form.passwordField")
                }

                // Submit button
                submitButton
            }
        }
    }

    // MARK: - Magic Link Sent

    private var magicLinkSentView: some View {
        VStack(spacing: PatinaSpacing.lg) {
            // Email icon
            Image(systemName: "envelope.open.fill")
                .font(.system(size: 48))
                .foregroundColor(PatinaColors.mocha)
                .padding(.bottom, PatinaSpacing.sm)

            Text("Check your email")
                .font(PatinaTypography.h3)
                .foregroundColor(PatinaColors.Text.primary)

            Text("We sent a magic link to")
                .font(PatinaTypography.body)
                .foregroundColor(PatinaColors.Text.secondary)

            Text(viewModel.magicLinkEmail)
                .font(PatinaTypography.bodyMedium)
                .foregroundColor(PatinaColors.Text.primary)

            Text("Click the link in the email to sign in.")
                .font(PatinaTypography.bodySmall)
                .foregroundColor(PatinaColors.Text.muted)
                .multilineTextAlignment(.center)

            // Resend button
            Button {
                Task {
                    await viewModel.resendMagicLink()
                }
            } label: {
                HStack {
                    if viewModel.isLoading {
                        ProgressView()
                            .tint(PatinaColors.mocha)
                    } else {
                        Text(viewModel.magicLinkCooldown > 0
                             ? "Resend in \(viewModel.magicLinkCooldown)s"
                             : "Resend magic link")
                    }
                }
                .font(PatinaTypography.bodyMedium)
                .foregroundColor(PatinaColors.mocha)
                .frame(maxWidth: .infinity)
                .padding(.vertical, PatinaSpacing.md)
                .background(PatinaColors.Background.secondary)
                .cornerRadius(PatinaRadius.lg)
                .overlay(
                    RoundedRectangle(cornerRadius: PatinaRadius.lg)
                        .stroke(PatinaColors.mocha, lineWidth: 1)
                )
            }
            .disabled(viewModel.magicLinkCooldown > 0 || viewModel.isLoading)

            // Enter code instead — for users who can't click the email
            // link in-app (Android-for-email + iPhone-for-app, broken
            // universal-link handling, etc.). Takes them to the OTP
            // entry surface that wraps supabase-swift's verifyOTP.
            Button {
                viewModel.showOtpEntryForMagicLink()
            } label: {
                Text("Enter code instead")
                    .font(PatinaTypography.bodySmall)
                    .foregroundColor(PatinaColors.mocha)
            }
            .accessibilityIdentifier("auth.magicLink.enterCodeButton")

            // Use different email button
            Button {
                viewModel.magicLinkSent = false
                viewModel.successMessage = nil
            } label: {
                Text("Use a different email")
                    .font(PatinaTypography.bodySmall)
                    .foregroundColor(PatinaColors.Text.muted)
            }
        }
        .padding(.vertical, PatinaSpacing.lg)
    }

    // MARK: - OTP Entry

    private var otpEntryView: some View {
        VStack(spacing: PatinaSpacing.lg) {
            // Number-pad / lock icon
            Image(systemName: "number")
                .font(.system(size: 48))
                .foregroundColor(PatinaColors.mocha)
                .padding(.bottom, PatinaSpacing.sm)

            Text("Enter your sign-in code")
                .font(PatinaTypography.h3)
                .foregroundColor(PatinaColors.Text.primary)

            Text("Enter the 6-digit code from your email")
                .font(PatinaTypography.body)
                .foregroundColor(PatinaColors.Text.secondary)
                .multilineTextAlignment(.center)

            Text(viewModel.magicLinkEmail)
                .font(PatinaTypography.bodyMedium)
                .foregroundColor(PatinaColors.Text.primary)

            // 6-digit code field
            TextField("000000", text: $viewModel.otpToken)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .font(.system(.title2, design: .monospaced))
                .multilineTextAlignment(.center)
                .padding(PatinaSpacing.md)
                .background(PatinaColors.Background.secondary)
                .cornerRadius(PatinaRadius.lg)
                .overlay(
                    RoundedRectangle(cornerRadius: PatinaRadius.lg)
                        .stroke(PatinaColors.clay.opacity(0.2), lineWidth: 1)
                )
                .onChange(of: viewModel.otpToken) { _, newValue in
                    // Strip any non-digit characters (paste, autofill,
                    // anything else) and cap at 6 characters.
                    let digits = newValue.filter(\.isNumber)
                    let trimmed = String(digits.prefix(6))
                    if trimmed != newValue {
                        viewModel.otpToken = trimmed
                    }
                }
                .accessibilityIdentifier("auth.otp.tokenField")

            // Verify button. On success the auth state listener sets the
            // session and the phase observer in AppCoordinator tears down
            // the sheet automatically — no `dismiss()` needed here.
            Button {
                Task {
                    await viewModel.verifyOtp()
                }
            } label: {
                HStack {
                    if viewModel.isVerifyingOtp {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Text("Verify")
                    }
                }
                .font(PatinaTypography.bodyMedium)
                .foregroundColor(PatinaColors.Text.inverse)
                .frame(maxWidth: .infinity)
                .padding(.vertical, PatinaSpacing.md)
                .background(
                    (viewModel.otpToken.count == 6 && !viewModel.isVerifyingOtp)
                    ? PatinaColors.charcoal
                    : PatinaColors.clay
                )
                .cornerRadius(PatinaRadius.lg)
            }
            .disabled(viewModel.otpToken.count != 6 || viewModel.isVerifyingOtp)
            .accessibilityIdentifier("auth.otp.verifyButton")

            // Back to email link — returns to the magic-link-sent panel
            // without losing the sent state (so the user can still resend
            // or try a different email from there).
            Button {
                viewModel.showOtpEntry = false
                viewModel.otpToken = ""
            } label: {
                Text("← Back to email")
                    .font(PatinaTypography.bodySmall)
                    .foregroundColor(PatinaColors.Text.muted)
            }
            .accessibilityIdentifier("auth.otp.backButton")
        }
        .padding(.vertical, PatinaSpacing.lg)
    }

    // MARK: - Email Verification Needed

    private var emailVerificationNeededView: some View {
        let unverifiedEmail = viewModel.emailAwaitingVerification ?? ""

        return VStack(spacing: PatinaSpacing.lg) {
            // Inbox icon
            Image(systemName: "envelope.badge.fill")
                .font(.system(size: 48))
                .foregroundColor(PatinaColors.mocha)
                .padding(.bottom, PatinaSpacing.sm)

            Text("Check your inbox")
                .font(PatinaTypography.h3)
                .foregroundColor(PatinaColors.Text.primary)

            Text("We sent a verification link to")
                .font(PatinaTypography.body)
                .foregroundColor(PatinaColors.Text.secondary)

            Text(unverifiedEmail)
                .font(PatinaTypography.bodyMedium)
                .foregroundColor(PatinaColors.Text.primary)
                .accessibilityIdentifier("auth.verification.emailLabel")

            Text("Tap the link in that email, then come back here to sign in.")
                .font(PatinaTypography.bodySmall)
                .foregroundColor(PatinaColors.Text.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            // Resend success indicator
            if viewModel.verificationResendSuccess {
                HStack(spacing: PatinaSpacing.sm) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                    Text("Verification email sent")
                        .font(PatinaTypography.bodySmall)
                        .foregroundColor(.green)
                }
                .padding(PatinaSpacing.md)
                .frame(maxWidth: .infinity)
                .background(Color.green.opacity(0.1))
                .cornerRadius(PatinaRadius.md)
            }

            // Resend button
            Button {
                Task {
                    await viewModel.resendVerificationEmail()
                }
            } label: {
                HStack {
                    if viewModel.isResendingVerification {
                        ProgressView()
                            .tint(PatinaColors.mocha)
                    } else {
                        Text(viewModel.verificationResendCooldown > 0
                             ? "Resend in \(viewModel.verificationResendCooldown)s"
                             : "Resend verification email")
                    }
                }
                .font(PatinaTypography.bodyMedium)
                .foregroundColor(PatinaColors.mocha)
                .frame(maxWidth: .infinity)
                .padding(.vertical, PatinaSpacing.md)
                .background(PatinaColors.Background.secondary)
                .cornerRadius(PatinaRadius.lg)
                .overlay(
                    RoundedRectangle(cornerRadius: PatinaRadius.lg)
                        .stroke(PatinaColors.mocha, lineWidth: 1)
                )
            }
            .disabled(viewModel.isResendingVerification
                      || viewModel.verificationResendCooldown > 0)
            .accessibilityIdentifier("auth.verification.resendButton")

            // Use different email button — returns to the sign-in form
            // so the user can try a different account.
            Button {
                viewModel.mode = .signIn
                viewModel.clearForm()
            } label: {
                Text("Use a different email")
                    .font(PatinaTypography.bodySmall)
                    .foregroundColor(PatinaColors.Text.muted)
            }
            .accessibilityIdentifier("auth.verification.useDifferentEmailButton")
        }
        .padding(.vertical, PatinaSpacing.lg)
    }

    private var submitButton: some View {
        Button {
            Task {
                await submitForm()
            }
        } label: {
            HStack {
                if viewModel.isLoading {
                    ProgressView()
                        .tint(.white)
                } else {
                    Text(submitButtonTitle)
                }
            }
            .font(PatinaTypography.bodyMedium)
            .foregroundColor(PatinaColors.Text.inverse)
            .frame(maxWidth: .infinity)
            .padding(.vertical, PatinaSpacing.md)
            .background(viewModel.isFormValid ? PatinaColors.charcoal : PatinaColors.clay)
            .cornerRadius(PatinaRadius.lg)
        }
        .disabled(!viewModel.isFormValid || viewModel.isLoading)
        .accessibilityIdentifier("auth.form.primaryButton")
    }

    private var submitButtonTitle: String {
        switch viewModel.mode {
        case .signIn:
            return "Sign In"
        case .signUp:
            return "Create Account"
        case .magicLink:
            return "Send Magic Link"
        case .resetPassword:
            return "Send Reset Link"
        }
    }

    private func submitForm() async {
        // The phase observer in `AppCoordinator` drives the transition
        // away from the `.auth` phase once `AuthService.session` is set,
        // which tears down the AuthenticationView sheet automatically.
        // No imperative `dismiss()` is required — and previously, an
        // unconditional `if isAuthenticated { dismiss() }` could race
        // a stale session against magic-link send and skip the OTP
        // entry surface.
        switch viewModel.mode {
        case .signIn:
            await viewModel.signIn()
        case .signUp:
            await viewModel.signUp()
        case .magicLink:
            await viewModel.sendMagicLink()
        case .resetPassword:
            await viewModel.resetPassword()
        }
    }

    // MARK: - Divider

    private var divider: some View {
        HStack(spacing: PatinaSpacing.md) {
            Rectangle()
                .fill(PatinaColors.clay.opacity(0.3))
                .frame(height: 1)

            Text("or")
                .font(PatinaTypography.caption)
                .foregroundColor(PatinaColors.Text.muted)

            Rectangle()
                .fill(PatinaColors.clay.opacity(0.3))
                .frame(height: 1)
        }
    }

    // MARK: - Apple Sign In

    private var appleSignIn: some View {
        PatinaSignInWithAppleButton { result in
            Task {
                await viewModel.handleAppleSignIn(result: result)
            }
        }
    }

    // MARK: - Mode Switcher

    private var modeSwitcher: some View {
        VStack(spacing: PatinaSpacing.sm) {
            if viewModel.mode == .signIn {
                HStack(spacing: PatinaSpacing.md) {
                    Button("Forgot password?") {
                        viewModel.mode = .resetPassword
                        viewModel.clearForm()
                    }
                    .font(PatinaTypography.bodySmall)
                    .foregroundColor(PatinaColors.Text.secondary)

                    Text("·")
                        .foregroundColor(PatinaColors.Text.muted)

                    Button("Use magic link") {
                        viewModel.mode = .magicLink
                        viewModel.clearForm()
                    }
                    .font(PatinaTypography.bodySmall)
                    .foregroundColor(PatinaColors.Text.secondary)
                }
            }

            if viewModel.mode == .magicLink && !viewModel.magicLinkSent {
                Button("Use password instead") {
                    viewModel.mode = .signIn
                    viewModel.clearForm()
                }
                .font(PatinaTypography.bodySmall)
                .foregroundColor(PatinaColors.Text.secondary)
            }

            HStack(spacing: PatinaSpacing.xs) {
                Text(viewModel.mode == .signIn || viewModel.mode == .magicLink
                     ? "Don't have an account?"
                     : "Already have an account?")
                    .font(PatinaTypography.bodySmall)
                    .foregroundColor(PatinaColors.Text.muted)

                Button(viewModel.mode == .signIn || viewModel.mode == .magicLink ? "Sign Up" : "Sign In") {
                    viewModel.mode = (viewModel.mode == .signIn || viewModel.mode == .magicLink) ? .signUp : .signIn
                    viewModel.clearForm()
                }
                .font(PatinaTypography.bodySmallMedium)
                .foregroundColor(PatinaColors.mocha)
                .accessibilityIdentifier("auth.form.modeSwitcherButton")
            }
        }
        .padding(.top, PatinaSpacing.md)
    }
}

// MARK: - Patina Text Field

struct PatinaTextField: View {
    let placeholder: String
    @Binding var text: String
    var icon: String? = nil
    var isSecure: Bool = false
    var keyboardType: UIKeyboardType = .default
    var autocapitalization: TextInputAutocapitalization = .sentences

    init(
        _ placeholder: String,
        text: Binding<String>,
        icon: String? = nil,
        isSecure: Bool = false,
        keyboardType: UIKeyboardType = .default,
        autocapitalization: TextInputAutocapitalization = .sentences
    ) {
        self.placeholder = placeholder
        self._text = text
        self.icon = icon
        self.isSecure = isSecure
        self.keyboardType = keyboardType
        self.autocapitalization = autocapitalization
    }

    var body: some View {
        HStack(spacing: PatinaSpacing.md) {
            if let icon {
                Image(systemName: icon)
                    .foregroundColor(PatinaColors.Text.muted)
                    .frame(width: 20)
            }

            if isSecure {
                SecureField(placeholder, text: $text)
                    .foregroundColor(PatinaColors.Text.primary)
                    .tint(PatinaColors.mocha)
            } else {
                TextField(placeholder, text: $text)
                    .keyboardType(keyboardType)
                    .textInputAutocapitalization(autocapitalization)
                    .foregroundColor(PatinaColors.Text.primary)
                    .tint(PatinaColors.mocha)
            }
        }
        .font(PatinaTypography.body)
        .padding(PatinaSpacing.md)
        .background(PatinaColors.Background.secondary)
        .cornerRadius(PatinaRadius.lg)
        .overlay(
            RoundedRectangle(cornerRadius: PatinaRadius.lg)
                .stroke(PatinaColors.clay.opacity(0.2), lineWidth: 1)
        )
    }
}

// MARK: - Preview

#Preview {
    AuthenticationView()
}

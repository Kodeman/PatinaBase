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
            .dismissKeyboardOnScroll()
            .background(PatinaColors.Background.primary)
            .toolbarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Cancel") {
                        // P-29: this sheet's failure dies with this sheet.
                        // Without the clear, "Invalid login credentials"
                        // survived the dismiss and rendered on the Welcome
                        // root, shifting the button stack 33 pt.
                        viewModel.clearForm()
                        dismiss()
                    }
                    .foregroundStyle(PatinaColors.Text.secondary)
                }
            }
            .task {
                await runUITestAuthBootstrapIfNeeded()
            }
            .onDisappear {
                AuthService.shared.clearError()
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
            StrataMarkView(color: PatinaColors.Strata.line1, scale: 1.2)
                .padding(.bottom, PatinaSpacing.sm)

            Text(headerTitle)
                .font(PatinaTypography.h2)
                .foregroundStyle(PatinaColors.Text.primary)

            Text(headerSubtitle)
                .font(PatinaTypography.body)
                .foregroundStyle(PatinaColors.Text.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.top, PatinaSpacing.xl)
    }

    private var headerTitle: String {
        if viewModel.emailAwaitingVerification != nil {
            return "Verify your email"
        }
        if viewModel.mode == .magicLink {
            return "Continue with email"
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
            return "Save your rooms and pieces, and pick them up on any device."
        case .magicLink:
            return "We'll email you a sign-in code — no password needed"
        case .resetPassword:
            return "We'll send you a reset link"
        }
    }

    // MARK: - Form

    private var formContent: some View {
        VStack(spacing: PatinaSpacing.md) {
            statusRegion

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
                    AuthTextField(
                        "Display Name",
                        text: $viewModel.displayName,
                        icon: "person"
                    )
                    .accessibilityIdentifier("auth.form.displayNameField")
                }

                // Email
                VStack(alignment: .leading, spacing: PatinaSpacing.xs) {
                    AuthTextField(
                        "Email",
                        text: $viewModel.email,
                        icon: "envelope",
                        keyboardType: .emailAddress,
                        autocapitalization: .never
                    )
                    .accessibilityIdentifier("auth.form.emailField")

                    // P-20: the button is inert and now says why. Silent
                    // until something has been typed.
                    if let message = viewModel.emailValidationMessage {
                        Text(message)
                            .font(PatinaTypography.caption)
                            .foregroundStyle(PatinaColors.Text.muted)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("auth.form.emailValidation")
                    }
                }

                // Password (not for reset or magic link)
                if viewModel.mode != .resetPassword && viewModel.mode != .magicLink {
                    AuthTextField(
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

    // MARK: - Status (P-22)

    /// ONE region. A failure replaces the send's success line rather than
    /// stacking under it; both used to show at once, in different widths, and
    /// together they pushed Verify off the bottom of the sheet.
    ///
    /// The message carries its own meaning; the tint is a second-order cue,
    /// not the carrier (VISION §6). Neither case fills a coloured panel.
    @ViewBuilder
    private var statusRegion: some View {
        if let status = viewModel.status {
            HStack(alignment: .top, spacing: PatinaSpacing.sm) {
                Image(systemName: status.isFailure ? "exclamationmark.circle" : "envelope")
                    .font(.system(size: 15, weight: .regular))
                Text(status.message)
                    .font(PatinaTypography.bodySmall)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .foregroundStyle(
                status.isFailure ? PatinaColors.terracotta : PatinaColors.Text.secondary
            )
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityIdentifier(
                status.isFailure ? "auth.form.errorBanner" : "auth.form.statusBanner"
            )
        }
    }

    // MARK: - Sign-in code sent

    private var magicLinkSentView: some View {
        VStack(spacing: PatinaSpacing.lg) {
            // Email icon
            Image(systemName: "envelope.open.fill")
                .font(.system(size: 48))
                .foregroundStyle(PatinaColors.Text.secondary)
                .padding(.bottom, PatinaSpacing.sm)

            Text("Check your email")
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.Text.primary)

            Text("We sent a sign-in code to")
                .font(PatinaTypography.body)
                .foregroundStyle(PatinaColors.Text.secondary)

            Text(viewModel.magicLinkEmail)
                .font(PatinaTypography.bodyMedium)
                .foregroundStyle(PatinaColors.Text.primary)

            Text("Open the email and enter the code to sign in.")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.muted)
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
                            .tint(PatinaColors.Text.secondary)
                    } else {
                        Text(viewModel.magicLinkCooldown > 0
                             ? "Resend in \(viewModel.magicLinkCooldown)s"
                             : "Resend the code")
                    }
                }
                .font(PatinaTypography.bodyMedium)
                .foregroundStyle(PatinaColors.Text.secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, PatinaSpacing.md)
                .background(PatinaColors.Background.secondary)
                .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.lg))
                .overlay(
                    RoundedRectangle(cornerRadius: PatinaRadius.lg)
                        .stroke(PatinaColors.Text.secondary, lineWidth: 1)
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
                    .foregroundStyle(PatinaColors.Text.secondary)
            }
            .accessibilityIdentifier("auth.magicLink.enterCodeButton")

            // Use different email button
            Button {
                viewModel.magicLinkSent = false
                viewModel.successMessage = nil
            } label: {
                Text("Use a different email")
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.muted)
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
                .foregroundStyle(PatinaColors.Text.secondary)
                .padding(.bottom, PatinaSpacing.sm)

            Text("Enter your sign-in code")
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.Text.primary)

            Text("Enter the 6-digit code from your email")
                .font(PatinaTypography.body)
                .foregroundStyle(PatinaColors.Text.secondary)
                .multilineTextAlignment(.center)

            Text(viewModel.magicLinkEmail)
                .font(PatinaTypography.bodyMedium)
                .foregroundStyle(PatinaColors.Text.primary)

            // 6-digit code field. C9-08: a number pad has no Return key, so
            // it gets the shared Done bar.
            TextField("000000", text: $viewModel.otpToken)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .font(.system(.title2, design: .monospaced))
                .multilineTextAlignment(.center)
                .padding(PatinaSpacing.md)
                .background(PatinaColors.Background.secondary)
                .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.lg))
                .overlay(
                    RoundedRectangle(cornerRadius: PatinaRadius.lg)
                        .stroke(PatinaColors.clay.opacity(0.2), lineWidth: 1)
                )
                .keyboardDoneToolbar()
                .onChange(of: viewModel.otpToken) { _, newValue in
                    // C1-37: strips non-digits, caps at six — and the sixth
                    // digit IS the submit. The reader no longer has to put a
                    // number pad away to reach a button it is covering.
                    Task { await viewModel.otpTokenChanged(newValue) }
                }
                .accessibilityIdentifier("auth.otp.tokenField")

            // Verify button, directly under the field. On success the auth
            // state listener sets the session and the phase observer in
            // AppCoordinator tears down the sheet — no `dismiss()` here.
            Button {
                Task {
                    await viewModel.verifyOtp()
                }
            } label: {
                HStack {
                    if viewModel.isVerifyingOtp {
                        ProgressView()
                            .tint(PatinaColors.Text.inverse)
                    } else {
                        Text("Verify")
                    }
                }
                .font(PatinaTypography.bodyMedium)
                .frame(maxWidth: .infinity)
                .padding(.vertical, PatinaSpacing.md)
            }
            .buttonStyle(AuthFilledButtonStyle(
                isEnabled: viewModel.otpToken.count == 6 && !viewModel.isVerifyingOtp
            ))
            .disabled(viewModel.otpToken.count != 6 || viewModel.isVerifyingOtp)
            .accessibilityIdentifier("auth.otp.verifyButton")

            // Resend the code (cooldown-gated, mirrors the send throttle).
            Button {
                Task { await viewModel.resendMagicLink() }
            } label: {
                Text(viewModel.magicLinkCooldown > 0
                     ? "Resend code in \(viewModel.magicLinkCooldown)s"
                     : "Resend code")
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
            }
            .disabled(viewModel.magicLinkCooldown > 0 || viewModel.isLoading)
            .accessibilityIdentifier("auth.otp.resendButton")

            // Change email — returns to the email-entry field (not the old
            // "click the link" panel, which the code-first flow bypasses).
            Button {
                viewModel.showOtpEntry = false
                viewModel.magicLinkSent = false
                viewModel.otpToken = ""
                viewModel.successMessage = nil
            } label: {
                Text("← Use a different email")
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.muted)
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
                .foregroundStyle(PatinaColors.Text.secondary)
                .padding(.bottom, PatinaSpacing.sm)

            Text("Check your inbox")
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.Text.primary)

            Text("We sent a verification link to")
                .font(PatinaTypography.body)
                .foregroundStyle(PatinaColors.Text.secondary)

            Text(unverifiedEmail)
                .font(PatinaTypography.bodyMedium)
                .foregroundStyle(PatinaColors.Text.primary)
                .accessibilityIdentifier("auth.verification.emailLabel")

            Text("Tap the link in that email, then come back here to sign in.")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            // Resend confirmation. The third colour-coded panel on this screen
            // until P-22 collapsed the other two: same shape as `statusRegion`,
            // so the sheet has one way of saying a thing happened.
            if viewModel.verificationResendSuccess {
                HStack(alignment: .top, spacing: PatinaSpacing.sm) {
                    Image(systemName: "envelope")
                        .font(.system(size: 15, weight: .regular))
                    Text("Verification email sent")
                        .font(PatinaTypography.bodySmall)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                .foregroundStyle(PatinaColors.Text.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
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
                            .tint(PatinaColors.Text.secondary)
                    } else {
                        Text(viewModel.verificationResendCooldown > 0
                             ? "Resend in \(viewModel.verificationResendCooldown)s"
                             : "Resend verification email")
                    }
                }
                .font(PatinaTypography.bodyMedium)
                .foregroundStyle(PatinaColors.Text.secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, PatinaSpacing.md)
                .background(PatinaColors.Background.secondary)
                .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.lg))
                .overlay(
                    RoundedRectangle(cornerRadius: PatinaRadius.lg)
                        .stroke(PatinaColors.Text.secondary, lineWidth: 1)
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
                    .foregroundStyle(PatinaColors.Text.muted)
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
                        .tint(PatinaColors.Text.inverse)
                } else {
                    Text(submitButtonTitle)
                }
            }
            .font(PatinaTypography.bodyMedium)
            .frame(maxWidth: .infinity)
            .padding(.vertical, PatinaSpacing.md)
        }
        .buttonStyle(AuthFilledButtonStyle(isEnabled: viewModel.isFormValid && !viewModel.isLoading))
        .disabled(!viewModel.isFormValid || viewModel.isLoading)
        .accessibilityIdentifier("auth.form.primaryButton")
    }

    private var submitButtonTitle: String {
        switch viewModel.mode {
        case .signIn:
            return "Sign in"
        case .signUp:
            return "Create account"
        case .magicLink:
            return "Email me a code"
        case .resetPassword:
            return "Send reset link"
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
                .foregroundStyle(PatinaColors.Text.muted)

            Rectangle()
                .fill(PatinaColors.clay.opacity(0.3))
                .frame(height: 1)
        }
    }

    // MARK: - Apple Sign In

    private var appleSignIn: some View {
        PatinaSignInWithAppleButton { result, rawNonce in
            Task {
                await viewModel.handleAppleSignIn(result: result, rawNonce: rawNonce)
            }
        }
    }

    // MARK: - Mode Switcher
    //
    // GAP1B-08 (L1-C's note A-L1C-1, applied here because this is L1-A's file):
    // these links measured 17.0 pt. A Button whose label is bare Text hit-tests
    // the glyph bounds, so each one gets its own `.frame(minHeight: 44)` plus
    // `.contentShape(Rectangle())` — per link, never per row, so the two that
    // sit side by side stay separately targetable.

    private var modeSwitcher: some View {
        VStack(spacing: PatinaSpacing.sm) {
            if viewModel.mode == .signIn {
                HStack(spacing: PatinaSpacing.md) {
                    Button("Forgot password?") {
                        viewModel.mode = .resetPassword
                        viewModel.clearForm()
                    }
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())

                    Text("·")
                        .foregroundStyle(PatinaColors.Text.muted)

                    Button("Email me a code") {
                        viewModel.mode = .magicLink
                        viewModel.clearForm()
                    }
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
            }

            if viewModel.mode == .magicLink && !viewModel.magicLinkSent {
                Button("Use a password instead") {
                    viewModel.mode = .signIn
                    viewModel.clearForm()
                }
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }

            // The email-code path unifies sign-up and sign-in, so it never
            // shows the password "Sign Up / Sign In" account toggle — that
            // only belongs to the password fallback form.
            if viewModel.mode != .magicLink {
                HStack(spacing: PatinaSpacing.xs) {
                    Text(viewModel.mode == .signIn
                         ? "Don't have an account?"
                         : "Already have an account?")
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.muted)

                    Button(viewModel.mode == .signIn ? "Sign up" : "Sign in") {
                        viewModel.mode = viewModel.mode == .signIn ? .signUp : .signIn
                        viewModel.clearForm()
                    }
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                    .accessibilityIdentifier("auth.form.modeSwitcherButton")
                }
            }
        }
        .padding(.top, PatinaSpacing.md)
    }
}

// MARK: - Filled button (C3-06)
//
// The auth form painted its DISABLED state in `PatinaColors.clay` — the
// warmest, most tappable-looking colour in the palette — and its ENABLED
// state in neutral charcoal. There was no other disabled affordance: no
// opacity change, and the label stayed `Text.inverse` either way. One filled
// style, dimmed when it is dead.

struct AuthFilledButtonStyle: ButtonStyle {
    let isEnabled: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(PatinaColors.Text.inverse)
            .background(PatinaColors.Interactive.active)
            .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.lg))
            .opacity(isEnabled ? (configuration.isPressed ? 0.9 : 1.0) : 0.4)
            .scaleEffect(configuration.isPressed && isEnabled ? 0.98 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

// MARK: - Auth Text Field
//
// Auth-screen-local field. The richer, label/helper/error-aware
// `PatinaTextField` lives in `Design/Components/PatinaTextField.swift`;
// this lightweight variant is retained for the compact icon-prefixed
// rows the auth form uses. Renamed from `PatinaTextField` (PT-5-2) to
// resolve the name collision with the shipped design-system component.

struct AuthTextField: View {
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
                    .foregroundStyle(PatinaColors.Text.muted)
                    .frame(width: 20)
            }

            if isSecure {
                SecureField(placeholder, text: $text)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .tint(PatinaColors.Text.secondary)
            } else {
                TextField(placeholder, text: $text)
                    .keyboardType(keyboardType)
                    .textInputAutocapitalization(autocapitalization)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .tint(PatinaColors.Text.secondary)
            }
        }
        .font(PatinaTypography.body)
        .padding(PatinaSpacing.md)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.lg))
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

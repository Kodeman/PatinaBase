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
    /// Not `private`: the three post-send panels read it from
    /// `AuthenticationView+Panels.swift`.
    @State var viewModel: AuthViewModel
    @State private var didBootstrapUITestAuth = false
    /// A3-06 — the same catalog the Welcome root reads. Resolved once per
    /// process, so this surface joins the answer rather than asking again.
    @State private var catalog = AuthProviderCatalog.shared

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

                    // Sign in with Apple. A3-06's rule is the app's, not one
                    // screen's: a provider GoTrue does not report is never
                    // rendered, on this surface as much as on the Welcome root.
                    if viewModel.mode != .resetPassword
                        && viewModel.emailAwaitingVerification == nil
                        && catalog.providers.contains(.apple) {
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
                await catalog.resolveIfNeeded()
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
        // C5-10 — its own strings, not `AuthMode.rawValue`. The raw values are
        // Title Case ("Sign In"), which left the header disagreeing with the
        // submit button ("Sign in") two controls below it.
        switch viewModel.mode {
        case .signIn:
            return "Sign in"
        case .signUp:
            return "Create account"
        case .magicLink:
            return "Continue with email"
        case .resetPassword:
            return "Reset password"
        }
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
                // This button is inside the sheet, so its failure is the
                // sheet's — it must not survive onto the Welcome root.
                await viewModel.handleAppleSignIn(
                    result: result,
                    rawNonce: rawNonce,
                    scope: .sheet
                )
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

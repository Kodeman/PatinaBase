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
    @State private var viewModel = AuthViewModel()

    public init() {}

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: PatinaSpacing.xl) {
                    // Header
                    header

                    // Form
                    formContent

                    // Sign in with Apple
                    if viewModel.mode != .resetPassword {
                        divider
                        appleSignIn
                    }

                    // Mode switcher
                    modeSwitcher
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
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: PatinaSpacing.md) {
            StrataMarkView(color: PatinaColors.mochaBrown, scale: 1.2)
                .padding(.bottom, PatinaSpacing.sm)

            Text(viewModel.mode.rawValue)
                .font(PatinaTypography.h2)
                .foregroundColor(PatinaColors.Text.primary)

            Text(headerSubtitle)
                .font(PatinaTypography.body)
                .foregroundColor(PatinaColors.Text.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.top, PatinaSpacing.xl)
    }

    private var headerSubtitle: String {
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
            }

            // Magic link sent state
            if viewModel.mode == .magicLink && viewModel.magicLinkSent {
                magicLinkSentView
            } else {
                // Display name (sign up only)
                if viewModel.mode == .signUp {
                    PatinaTextField(
                        "Display Name",
                        text: $viewModel.displayName,
                        icon: "person"
                    )
                }

                // Email
                PatinaTextField(
                    "Email",
                    text: $viewModel.email,
                    icon: "envelope",
                    keyboardType: .emailAddress,
                    autocapitalization: .never
                )

                // Password (not for reset or magic link)
                if viewModel.mode != .resetPassword && viewModel.mode != .magicLink {
                    PatinaTextField(
                        "Password",
                        text: $viewModel.password,
                        icon: "lock",
                        isSecure: true
                    )
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
                .foregroundColor(PatinaColors.mochaBrown)
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
                            .tint(PatinaColors.mochaBrown)
                    } else {
                        Text(viewModel.magicLinkCooldown > 0
                             ? "Resend in \(viewModel.magicLinkCooldown)s"
                             : "Resend magic link")
                    }
                }
                .font(PatinaTypography.bodyMedium)
                .foregroundColor(PatinaColors.mochaBrown)
                .frame(maxWidth: .infinity)
                .padding(.vertical, PatinaSpacing.md)
                .background(PatinaColors.Background.secondary)
                .cornerRadius(PatinaRadius.lg)
                .overlay(
                    RoundedRectangle(cornerRadius: PatinaRadius.lg)
                        .stroke(PatinaColors.mochaBrown, lineWidth: 1)
                )
            }
            .disabled(viewModel.magicLinkCooldown > 0 || viewModel.isLoading)

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
            .background(viewModel.isFormValid ? PatinaColors.charcoal : PatinaColors.clayBeige)
            .cornerRadius(PatinaRadius.lg)
        }
        .disabled(!viewModel.isFormValid || viewModel.isLoading)
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
                .fill(PatinaColors.clayBeige.opacity(0.3))
                .frame(height: 1)

            Text("or")
                .font(PatinaTypography.caption)
                .foregroundColor(PatinaColors.Text.muted)

            Rectangle()
                .fill(PatinaColors.clayBeige.opacity(0.3))
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
                .foregroundColor(PatinaColors.mochaBrown)
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
            } else {
                TextField(placeholder, text: $text)
                    .keyboardType(keyboardType)
                    .textInputAutocapitalization(autocapitalization)
            }
        }
        .font(PatinaTypography.body)
        .padding(PatinaSpacing.md)
        .background(PatinaColors.Background.secondary)
        .cornerRadius(PatinaRadius.lg)
        .overlay(
            RoundedRectangle(cornerRadius: PatinaRadius.lg)
                .stroke(PatinaColors.clayBeige.opacity(0.2), lineWidth: 1)
        )
    }
}

// MARK: - Preview

#Preview {
    AuthenticationView()
}

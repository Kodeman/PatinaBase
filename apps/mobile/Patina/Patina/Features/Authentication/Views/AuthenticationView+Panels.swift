//
//  AuthenticationView+Panels.swift
//  Patina
//
//  The three post-send panels — the sent confirmation, the six-digit code
//  entry (C1-37, C9-08) and the email-verification recovery state — lifted out
//  of `AuthenticationView.swift` so that file stays inside the 500-line
//  budgets `.swiftlint.yml` sets. Same code, same view, one file over.
//

import SwiftUI

extension AuthenticationView {

    // MARK: - Sign-in code sent

    var magicLinkSentView: some View {
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

    var otpEntryView: some View {
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

    var emailVerificationNeededView: some View {
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
}

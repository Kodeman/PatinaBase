//
//  AuthStatusRegionTests.swift
//  PatinaTests
//
//  P-22 — after a failed code the green "✉ We emailed you a 6-digit code"
//  banner stayed on screen directly above the red "Token has expired or is
//  invalid". Two banners, different widths and alignments, both pushing the
//  layout down until Verify left the bottom of the sheet.
//
//  C1-37 — six digits entered did not verify: the field caps at six and Verify
//  enables at six, but nothing submitted, so the reader had to put away a
//  number pad that was covering the button.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct AuthStatusRegionTests {

    /// The sign-in sheet is two files: the form and the three post-send panels.
    private func sheetSource() throws -> String {
        try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView.swift")
            + SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView+Panels.swift")
    }

    // MARK: - P-22 · one region, one message

    @Test("an error replaces the success line rather than stacking under it")
    func errorReplacesSuccess() {
        let viewModel = AuthViewModel(initialMode: .magicLink)
        viewModel.successMessage = "We emailed you a 6-digit sign-in code"
        #expect(viewModel.status == .success("We emailed you a 6-digit sign-in code"))
        #expect(viewModel.status?.isFailure == false)

        // With an error present, the success line is not what the region says.
        AuthService.shared.reportExternalError("Token has expired or is invalid")
        defer { AuthService.shared.clearError() }
        #expect(viewModel.status?.isFailure == true)
        #expect(viewModel.status?.message == "Token has expired or is invalid")
    }

    @Test("nothing to say renders nothing")
    func noStatusWhenSilent() {
        AuthService.shared.clearError()
        let viewModel = AuthViewModel()
        viewModel.successMessage = nil
        #expect(viewModel.status == nil)
    }

    @Test("the view renders ONE status region, not a success banner plus an error banner")
    func viewHasASingleStatusRegion() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView.swift")
        #expect(source.contains("private var statusRegion: some View {"))
        #expect(source.contains("if let status = viewModel.status {"))
        // The two stacked banners are gone, and with them every filled
        // colour-coded panel on the sheet (VISION §6) — including the third,
        // the verification-resend confirmation, which was the same shape and
        // now lives in the panels file.
        let sheet = try sheetSource()
        #expect(!sheet.contains("if let success = viewModel.successMessage {"))
        #expect(!sheet.contains("Color.green.opacity"))
        #expect(!sheet.contains("Color.red.opacity"))
        #expect(!sheet.contains(".foregroundStyle(.green)"))
        // And the region is declared once and drawn once, above the form.
        let code = source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
        #expect(code.components(separatedBy: "statusRegion").count - 1 == 2)
    }

    @Test("a verify clears the send's success line before it starts")
    func verifyClearsTheSuccessLine() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/ViewModels/AuthViewModel.swift")
        let start = try #require(source.range(of: "self.isVerifyingOtp = true"))
        let block = String(source[start.lowerBound...].prefix(500))
        #expect(block.contains("self.successMessage = nil"))
    }

    @Test("the status carries its meaning in words, not in red-and-green (VISION §6)")
    func statusIsNotAColourCode() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView.swift")
        let start = try #require(source.range(of: "private var statusRegion: some View {"))
        let end = try #require(source.range(of: "private var submitButton: some View {"))
        let region = String(source[start.lowerBound..<end.lowerBound])
        #expect(!region.contains(".green"))
        #expect(!region.contains(".red"))
        #expect(region.contains("Text(status.message)"))
    }

    // MARK: - C1-37 · the sixth digit is the submit

    @Test("six digits verify without a second tap")
    func sixthDigitSubmits() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/ViewModels/AuthViewModel.swift")
        let start = try #require(source.range(of: "public func otpTokenChanged("))
        let block = String(source[start.lowerBound...].prefix(600))
        #expect(block.contains("guard trimmed.count == 6"))
        #expect(block.contains("await verifyOtp()"))

        let view = try sheetSource()
        #expect(view.contains("Task { await viewModel.otpTokenChanged(newValue) }"))
    }

    @Test("fewer than six digits does not fire, and a verify already in flight is not doubled")
    func autoVerifyIsGuarded() async {
        let viewModel = AuthViewModel(initialMode: .magicLink)
        viewModel.magicLinkEmail = "someone@example.test"
        await viewModel.otpTokenChanged("12345")
        #expect(viewModel.otpToken == "12345")
        #expect(!viewModel.isVerifyingOtp)
    }

    @Test("non-digits are still stripped and the field still caps at six")
    func inputIsStillNormalised() async {
        let viewModel = AuthViewModel(initialMode: .magicLink)
        await viewModel.otpTokenChanged("1a2b3")
        #expect(viewModel.otpToken == "123")
    }

    @Test("Verify sits directly under the field, not below the resend and the back link")
    func verifyIsPinnedUnderTheField() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView+Panels.swift")
        let field = try #require(source.range(of: "auth.otp.tokenField"))
        let verify = try #require(source.range(of: "auth.otp.verifyButton"))
        let resend = try #require(source.range(of: "auth.otp.resendButton"))
        #expect(field.lowerBound < verify.lowerBound)
        #expect(verify.lowerBound < resend.lowerBound)
    }
}

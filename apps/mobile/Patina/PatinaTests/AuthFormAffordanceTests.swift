//
//  AuthFormAffordanceTests.swift
//  PatinaTests
//
//  P-20 — `tester@@patina.` produced no message at all. The submit button
//  stayed `enabled:false` with no inline validation text, no field colouring
//  and no helper copy: the sheet was pixel-identical to the empty state except
//  for the typed characters.
//
//  C3-06 — and the button the reader was staring at was painted in
//  `PatinaColors.clay` while DISABLED and neutral charcoal while ENABLED. Clay
//  is the warmest, most tappable-looking colour in the palette, there was no
//  other disabled affordance, and the label stayed `Text.inverse` either way.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct AuthFormAffordanceTests {

    // MARK: - P-20 · the button says why it is inert

    @Test("a malformed address gets a message")
    func malformedAddressExplainsItself() {
        let viewModel = AuthViewModel(initialMode: .magicLink)
        viewModel.email = "tester@@patina."
        #expect(!viewModel.isFormValid)
        #expect(viewModel.emailValidationMessage != nil)
    }

    @Test("an untouched field is not scolded")
    func emptyFieldIsSilent() {
        let viewModel = AuthViewModel(initialMode: .magicLink)
        viewModel.email = ""
        #expect(viewModel.emailValidationMessage == nil)
    }

    @Test("a good address clears the message")
    func validAddressIsSilent() {
        let viewModel = AuthViewModel(initialMode: .magicLink)
        viewModel.email = "leah@example.com"
        #expect(viewModel.isFormValid)
        #expect(viewModel.emailValidationMessage == nil)
    }

    @Test("the message never prints a server or vendor string")
    func messageIsOurOwnWords() {
        let viewModel = AuthViewModel(initialMode: .magicLink)
        viewModel.email = "not-an-address"
        let message = viewModel.emailValidationMessage ?? ""
        #expect(!message.isEmpty)
        #expect(!message.lowercased().contains("nspredicate"))
        #expect(!message.lowercased().contains("error"))
        #expect(!message.contains("regex"))
    }

    @Test("the view renders it, under the field")
    func viewRendersTheValidationCopy() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView.swift")
        #expect(source.contains("auth.form.emailValidation"))
        let field = try #require(source.range(of: "auth.form.emailField"))
        let message = try #require(source.range(of: "auth.form.emailValidation"))
        #expect(field.lowerBound < message.lowerBound)
    }

    // MARK: - C3-06 · one filled style

    @Test("the filled style is charcoal, and disabled is a dimmed version of it")
    func oneFilledStyle() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView.swift")
        let start = try #require(source.range(of: "struct AuthFilledButtonStyle: ButtonStyle {"))
        let end = try #require(source.range(of: "// MARK: - Auth Text Field"))
        let style = String(source[start.lowerBound..<end.lowerBound])
        #expect(style.contains("PatinaColors.Interactive.active"))
        #expect(style.contains("opacity(isEnabled ?"))
        #expect(style.contains("0.4"))
        // The accent is not what a dead control is painted in.
        #expect(!style.contains("PatinaColors.clay"))
    }

    @Test("neither the submit nor Verify paints its disabled state in the brand accent")
    func noClayOnDeadControls() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView.swift")
        #expect(!source.contains("viewModel.isFormValid ? PatinaColors.Interactive.active : PatinaColors.clay"))
        #expect(!source.contains(": PatinaColors.clay\n                )"))
        // Both controls now go through the one style.
        let uses = source.components(separatedBy: ".buttonStyle(AuthFilledButtonStyle(").count - 1
        #expect(uses == 2, "expected the submit and Verify to share one style, found \(uses)")
    }

    @Test("the submit button still refuses an invalid form")
    func submitStaysDisabledWhenInvalid() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView.swift")
        #expect(source.contains(".disabled(!viewModel.isFormValid || viewModel.isLoading)"))
    }
}

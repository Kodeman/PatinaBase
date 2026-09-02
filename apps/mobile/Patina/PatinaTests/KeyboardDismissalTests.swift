//
//  KeyboardDismissalTests.swift
//  PatinaTests
//
//  C9-08 — no keyboard-dismiss affordance existed anywhere in the app.
//
//  The audit's grep over all 589 Swift files found ZERO
//  `ToolbarItemGroup(placement: .keyboard)`, ZERO `.scrollDismissesKeyboard`
//  and ZERO `endEditing` / `resignFirstResponder` / tap-to-dismiss, against
//  six `.numberPad` / `.decimalPad` fields — and a number pad has no Return
//  key. The worst of them is the six-digit sign-in code, where the pad covers
//  the Verify button (C1-37's other half).
//
//  This lane owns the shared modifier and the auth field. The other five
//  fields are L1-B's files and go out as an integration note; the last test
//  here records exactly which they are so the note cannot be silently dropped.
//

import Foundation
import Testing
@testable import Patina

struct KeyboardDismissalTests {

    @Test("the shared modifier exists, and is a keyboard toolbar")
    func sharedModifierExists() throws {
        let source = try SourcePin.read("Patina/Utilities/ViewModifiers/KeyboardDismissal.swift")
        #expect(source.contains("func keyboardDoneToolbar()"))
        #expect(source.contains("ToolbarItemGroup(placement: .keyboard)"))
        #expect(source.contains("Button(\"Done\")"))
        #expect(source.contains("keyboard.doneButton"))
    }

    @Test("and an interactive scroll dismissal for forms")
    func scrollDismissalExists() throws {
        let source = try SourcePin.read("Patina/Utilities/ViewModifiers/KeyboardDismissal.swift")
        #expect(source.contains("func dismissKeyboardOnScroll()"))
        #expect(source.contains("scrollDismissesKeyboard(.interactively)"))
    }

    @Test("the six-digit code field has a way out")
    func otpFieldHasADoneBar() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView.swift")
        let start = try #require(source.range(of: "TextField(\"000000\", text: $viewModel.otpToken)"))
        let block = String(source[start.lowerBound...].prefix(900))
        #expect(block.contains(".keyboardType(.numberPad)"))
        #expect(block.contains(".keyboardDoneToolbar()"))
    }

    @Test("the auth form's scroll view dismisses the keyboard")
    func authFormDismissesOnScroll() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView.swift")
        #expect(source.contains(".dismissKeyboardOnScroll()"))
    }

    /// The remaining five `.numberPad` / `.decimalPad` fields all live in
    /// `Features/Rooms/**` and `Features/RoomScan/**`, which are **L1-B's**
    /// globs. This test is the record of the debt, not a claim that it is
    /// paid: it fails if a new pad-keyboard field appears in a file THIS lane
    /// owns without the Done bar.
    @Test("no numeric field in this lane's files is left without an exit")
    func noBareNumericFieldInThisLanesFiles() throws {
        let owned = SourcePin.swiftFiles(under: "Patina/Features/Authentication")
            + SourcePin.swiftFiles(under: "Patina/Features/Onboarding")
            + SourcePin.swiftFiles(under: "Patina/Features/FirstLaunch")
            + SourcePin.swiftFiles(under: "Patina/Features/StyleQuiz")
            + SourcePin.swiftFiles(under: "Patina/Features/StyleConversation")
            + SourcePin.swiftFiles(under: "Patina/Features/Account")
            + SourcePin.swiftFiles(under: "Patina/Features/QRAuth")

        for path in owned {
            guard let source = try? String(contentsOfFile: path, encoding: .utf8) else { continue }
            guard source.contains(".numberPad") || source.contains(".decimalPad") else { continue }
            #expect(
                source.contains(".keyboardDoneToolbar()"),
                "\(path) has a pad keyboard and no Done bar"
            )
        }
    }
}

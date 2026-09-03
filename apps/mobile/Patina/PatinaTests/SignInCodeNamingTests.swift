//
//  SignInCodeNamingTests.swift
//  PatinaTests
//
//  P-30 — one mechanism, three names, and one of them was factually wrong.
//
//  The Welcome button said "Continue with email"; the sheet said "We'll email
//  you a sign-in code" and "Email me a code"; the password sheet's footer said
//  "Use magic link"; the sent panel said "We sent a magic link to" and "Click
//  the link in the email to sign in". The app sends a six-digit code. There is
//  no link to click.
//
//  The name is **sign-in code**. "Continue with email" stays on the Welcome
//  screen because it names the METHOD (which door), not the mechanism.
//

import Foundation
import SwiftUI
import Testing
@testable import Patina

struct SignInCodeNamingTests {

    private static let authFiles = [
        "Patina/Features/Authentication/Views/AuthScreenView.swift",
        "Patina/Features/Authentication/Views/AuthenticationView.swift",
        "Patina/Features/Authentication/Views/AuthenticationView+Panels.swift",
        "Patina/Features/Authentication/ViewModels/AuthViewModel.swift"
    ]

    /// The sign-in sheet is two files: the form and the three post-send panels.
    /// Every naming pin reads both, so a split cannot hide a name from it.
    private func sheetSource() throws -> String {
        try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView.swift")
            + SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView+Panels.swift")
    }

    /// Reader-facing string literals: everything inside double quotes that is
    /// not an accessibility identifier, an SF Symbol, a URL or a storage key.
    ///
    /// Comment lines are dropped FIRST. A naive quote walk pairs the closing
    /// quote of one literal with the opening quote of the next and calls the
    /// prose between them a string — so `// Password (not for reset or magic
    /// link)` reads as a literal and reddens this suite for a sentence no
    /// reader will ever see.
    private func readerStrings(in source: String) -> [String] {
        let code = source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { line in
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                return !trimmed.hasPrefix("//") && !trimmed.hasPrefix("*")
            }
            .joined(separator: "\n")

        var out: [String] = []
        var rest = Substring(code)
        while let open = rest.firstIndex(of: "\"") {
            let after = rest.index(after: open)
            guard let close = rest[after...].firstIndex(of: "\"") else { break }
            out.append(String(rest[after..<close]))
            rest = rest[rest.index(after: close)...]
        }
        return out.filter { literal in
            !literal.contains(".")            // identifiers, URLs, symbol names
                && !literal.contains("_")
                && literal.contains(" ")      // a phrase, not a token
        }
    }

    @Test("no reader ever sees the words 'magic link'")
    func noMagicLinkInReaderCopy() throws {
        for path in Self.authFiles {
            let source = try SourcePin.read(path)
            for literal in readerStrings(in: source) {
                #expect(
                    !literal.lowercased().contains("magic link"),
                    "\(path) still shows the reader: \(literal)"
                )
            }
        }
    }

    @Test("nothing tells the reader to click a link the app never sends")
    func noClickTheLink() throws {
        let source = try sheetSource()
        #expect(!source.contains("Click the link in the email"))
        #expect(!source.contains("We sent a magic link to"))
        #expect(source.contains("We sent a sign-in code to"))
    }

    @Test("the mechanism has one name on every surface that names it")
    func oneNameEverywhere() throws {
        let view = try sheetSource()
        // RL3A-11 — U+2019 now, like every other sentence on this sheet.
        #expect(view.contains("We’ll email you a sign-in code"))
        #expect(view.contains("Enter your sign-in code"))
        // L1-E's copy deck keeps the submit button at "Email me a code" — the
        // short form of the same name, after the subtitle has said it in full.
        #expect(view.contains("Email me a code"))
        #expect(view.contains("Resend the code"))
        #expect(!view.contains("Use magic link"))

        let viewModel = try SourcePin.read("Patina/Features/Authentication/ViewModels/AuthViewModel.swift")
        #expect(viewModel.contains("We emailed you a 6-digit sign-in code"))
        #expect(viewModel.contains("We emailed you a new sign-in code"))
    }

    @Test("'Continue with email' still names the door, on both screens")
    func theDoorKeepsItsName() throws {
        let welcome = try SourcePin.read("Patina/Features/Authentication/Views/AuthScreenView.swift")
        #expect(welcome.contains("title: \"Continue with email\""))
        let sheet = try sheetSource()
        #expect(sheet.contains("return \"Continue with email\""))
    }

    /// VISION §6 forbids the word in anything a tester reads. The compiled
    /// sweep is clean today and this lane rewrote a lot of copy.
    @Test("no lane copy reintroduces the AI label")
    func noAILabelInThisLanesCopy() throws {
        let banned = ["artificial intelligence", "machine learning"]
        for path in Self.authFiles + [
            "Patina/Features/Account/AccountDeletionService.swift",
            "Patina/Features/Account/AccountView.swift",
            "Patina/Features/StyleQuiz/Views/StyleQuizView.swift",
            "Patina/Features/Onboarding/Views/OnboardingFlowView.swift"
        ] {
            let source = try SourcePin.read(path)
            for literal in readerStrings(in: source) {
                let lower = literal.lowercased()
                for phrase in banned {
                    #expect(!lower.contains(phrase), "\(path): \(literal)")
                }
                #expect(!literal.contains(" AI "), "\(path): \(literal)")
            }
        }
    }

    // MARK: - C5-10 · the header the casing sweep left behind

    /// `headerTitle` returned `AuthMode.rawValue` — "Sign In" / "Sign Up" —
    /// above a submit button reading "Sign in" and a switcher reading
    /// "Sign up". The deck named the button and the switcher; this was the
    /// residue.
    @Test("the sheet's header is sentence case, like everything under it")
    func everyHeaderIsSentenceCase() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView.swift")
        #expect(!source.contains("return viewModel.mode.rawValue"))
        #expect(source.contains("return \"Sign in\""))
        #expect(source.contains("return \"Create account\""))
        #expect(source.contains("return \"Reset password\""))
    }

    // MARK: - P-25 · the field announces what is actually typed

    /// `scan_ui` on the EMPTY field returned `AXValue: "000000"`, so VoiceOver
    /// read a six-digit code back to someone who had typed nothing — and the
    /// placeholder was itself a plausible code. Empty and filled also differed
    /// only in text opacity.
    @Test("the empty sign-in code field announces no code")
    func theEmptyFieldAnnouncesNoCode() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView+Panels.swift")
        #expect(!source.contains("TextField(\"000000\""))
        #expect(source.contains("prompt: Text(\"\u{2013} \u{2013} \u{2013} \u{2013} \u{2013} \u{2013}\")"))
        #expect(source.contains(".accessibilityLabel(\"Sign-in code\")"))
        #expect(source.contains("? \"Empty\""))
        #expect(source.contains("of 6 digits entered"))
        // Filled differs by more than opacity: the outline changes with it.
        #expect(source.contains("lineWidth: viewModel.otpToken.isEmpty ? 1 : 1.5"))
    }

    /// RL2A-03 — the round-one prompt was a 21-character sentence set in
    /// `.title2` monospaced with `.tracking(8)`, in a 339 pt field. It rendered
    /// "E n t e r   t h e   6 – d …" — an unreadable placeholder on the screen
    /// every tester walks. Measured, not asserted about the string.
    @Test("the empty field's prompt fits inside the field")
    @MainActor
    func theEmptyFieldsPromptIsNotClipped() throws {
        // The observed field is 339 pt wide (AXFrame, iPhone 16 Pro sheet);
        // `.padding(PatinaSpacing.md)` — 16 pt — takes that off each side.
        let available: CGFloat = 339 - 32

        func idealWidth(_ string: String) -> CGFloat {
            let text = Text(string)
                .font(.system(.title2, design: .monospaced))
                .tracking(8)
                .fixedSize()
            return UIHostingController(rootView: text).sizeThatFits(
                in: CGSize(width: CGFloat.greatestFiniteMagnitude,
                           height: CGFloat.greatestFiniteMagnitude)
            ).width
        }

        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView+Panels.swift")
        let start = try #require(source.range(of: "prompt: Text(\""))
        let rest = source[start.upperBound...]
        let end = try #require(rest.range(of: "\""))
        let prompt = String(rest[..<end.lowerBound])

        let needed = idealWidth(prompt)
        #expect(needed <= available, "prompt \"\(prompt)\" needs \(needed) pt of \(available) pt")
        // And the sentence it replaces is proven to be what could not fit.
        #expect(idealWidth("Enter the 6-digit code") > available)
    }

    /// The sentence still exists — two rows above the field, at full size,
    /// where it has the width to be read.
    @Test("the instruction is still on the screen, just not inside the field")
    func theInstructionSentenceSurvives() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView+Panels.swift")
        #expect(source.contains("Text(\"Enter the 6-digit code from your email\")"))
    }
}

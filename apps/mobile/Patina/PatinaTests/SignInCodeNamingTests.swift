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
import Testing
@testable import Patina

struct SignInCodeNamingTests {

    private static let authFiles = [
        "Patina/Features/Authentication/Views/AuthScreenView.swift",
        "Patina/Features/Authentication/Views/AuthenticationView.swift",
        "Patina/Features/Authentication/ViewModels/AuthViewModel.swift"
    ]

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
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView.swift")
        #expect(!source.contains("Click the link in the email"))
        #expect(!source.contains("We sent a magic link to"))
        #expect(source.contains("We sent a sign-in code to"))
    }

    @Test("the mechanism has one name on every surface that names it")
    func oneNameEverywhere() throws {
        let view = try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView.swift")
        #expect(view.contains("We'll email you a sign-in code"))
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
        let sheet = try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView.swift")
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
}

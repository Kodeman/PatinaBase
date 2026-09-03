//
//  AuthAndQuizCopyTests.swift
//  PatinaTests
//
//  The four L1-E round-two copy rows addressed to L1-A (`l1-a-notes.md`
//  Tasks A-L1E-8 … A-L1E-11), applied in this lane because both lanes had
//  been told the other one would.
//
//  Deliberately NOT named `SentenceCaseTests` / `BrandVoiceLintTests` /
//  `ApostropheSweepTests`: L1-E's notes name those three suites as its own,
//  it merges last, and two branches creating the same new file is a conflict
//  for no benefit. `l1a-notes-out-round3.md` tells L1-E these pins exist.
//

import Foundation
import Testing
@testable import Patina

struct AuthAndQuizCopyTests {

    /// The files this lane owns that the copy deck names by path.
    private static let deckedFiles = [
        "Patina/Features/Onboarding/Views/OnboardingFlowView.swift",
        "Patina/Features/StyleQuiz/Views/StyleQuizView.swift",
        "Patina/Features/StyleQuiz/Views/StyleResultView.swift",
        "Patina/Features/StyleQuiz/Models/QuizModels.swift",
        "Patina/Features/Account/AccountView.swift",
        "Patina/Features/Account/AccountDeletionService.swift",
        "Patina/Features/Authentication/ViewModels/AuthViewModel.swift"
    ]

    // MARK: - A-L1E-8 · C5-10

    /// The primary button on the screen every first-run tester lands on after
    /// the quiz shipped Title Case, and named a class of thing rather than the
    /// thing: "View Recommendations".
    @Test("the taste portrait's primary CTA is sentence case, and names pieces")
    func stylePortraitCTAIsSentenceCase() throws {
        let source = try SourcePin.read("Patina/Features/StyleQuiz/Views/StyleResultView.swift")
        #expect(source.contains("Text(\"See your pieces\")"))
        #expect(!source.contains("View Recommendations"))
    }

    // MARK: - A-L1E-9 · C5-20

    /// "Curated" is on the deck's banned lexicon, and the app shipped it twice
    /// on the mandatory first-run quiz. The `key:` values are spectrum-mapping
    /// and budget-lookup inputs (`StyleQuizViewModel` matches on them) and must
    /// survive the relabel untouched.
    @Test("the quiz says nothing is curated, and both lookup keys survive")
    func styleQuizIsClean() throws {
        let source = try SourcePin.read("Patina/Features/StyleQuiz/Models/QuizModels.swift")
        #expect(!source.lowercased().contains("label: \"eclectic curated\""))
        #expect(!source.lowercased().contains("label: \"curated comfort\""))
        #expect(source.contains("label: \"Collected Eclectic\""))
        #expect(source.contains("label: \"Considered Comfort\""))
        // The two keys the view model matches on.
        #expect(source.contains("key: \"eclectic_curated\""))
        #expect(source.contains("key: \"curated_comfort\""))

        let viewModel = try SourcePin.read("Patina/Features/StyleQuiz/ViewModels/StyleQuizViewModel.swift")
        #expect(viewModel.contains("eclectic_curated"))
        #expect(viewModel.contains("curated_comfort"))
    }

    // MARK: - A-L1E-10 · A-06

    /// One apostrophe glyph app-wide, in the files the deck names. The sweep's
    /// W1 scope is "every user-facing string in a file the deck names"
    /// (`A-L1E-10`'s ruling); the app-wide pass is W2 · L1-E's. Comments are
    /// out of scope — nobody reads them.
    @Test("no straight apostrophe survives in a string in a file the deck names")
    func noStraightApostropheInTheDeckedFiles() throws {
        for path in Self.deckedFiles {
            let source = try SourcePin.read(path)
            for (index, line) in source.split(separator: "\n", omittingEmptySubsequences: false).enumerated() {
                guard !line.trimmingCharacters(in: .whitespaces).hasPrefix("//") else { continue }
                for literal in Self.stringLiterals(in: String(line)) {
                    #expect(
                        !literal.contains("'"),
                        "straight apostrophe at \(path):\(index + 1) — \"\(literal)\""
                    )
                }
            }
        }
    }

    /// Every double-quoted literal on one line, escapes respected.
    private static func stringLiterals(in line: String) -> [String] {
        var results: [String] = []
        var current = ""
        var inside = false
        var escaped = false
        for character in line {
            if escaped { if inside { current.append(character) }; escaped = false; continue }
            if character == "\\" { escaped = true; continue }
            if character == "\"" {
                if inside { results.append(current); current = "" }
                inside.toggle()
                continue
            }
            if inside { current.append(character) }
        }
        return results
    }

    // MARK: - A-L1E-11 · C5-10

    /// One screen shipped both spellings: the alert said "Sign Out" while the
    /// button that opens it said "Sign out". The `?` is not a casing change —
    /// it is the difference between a title and a command.
    @Test("the sign-out alert agrees with the button that opens it")
    func theSignOutAlertAgreesWithItsButton() throws {
        let source = try SourcePin.read("Patina/Features/Account/AccountView.swift")
        #expect(source.contains(".alert(\"Sign out?\", isPresented: $showingSignOutAlert)"))
        #expect(source.contains("Button(\"Sign out\") {"))
        #expect(!source.contains("\"Sign Out\""))
    }
}

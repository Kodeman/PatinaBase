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
        "Patina/Features/Authentication/ViewModels/AuthViewModel.swift",
        // RL3A-11 — three more files this lane owns. The sign-in sheet was
        // rendering both glyphs at once: a straight-apostrophe header subtitle
        // ("We'll email you a sign-in code") over the curly-apostrophe failure
        // sentences round two introduced two rows below it.
        "Patina/Features/Authentication/Views/AuthenticationView.swift",
        "Patina/Features/StyleConversation/ViewModels/StyleConversationViewModel.swift",
        "Patina/Features/QRAuth/Models/QRAuthModels.swift"
    ]

    // MARK: - A-L1E-8 · C5-10

    /// The primary button on the screen every first-run tester lands on after
    /// the quiz shipped Title Case, and named a class of thing rather than the
    /// thing: "View Recommendations".
    @Test("the taste portrait’s primary CTA is sentence case, and names pieces")
    func stylePortraitCTAIsSentenceCase() throws {
        let source = try SourcePin.read("Patina/Features/StyleQuiz/Views/StyleResultView.swift")
        #expect(source.contains("Text(\"See your pieces\")"))
        #expect(!source.contains("View Recommendations"))
    }

    // MARK: - A-L1E-9 · C5-20 · RL4A-01

    /// The deck's banned lexicon, over every string the quiz renders.
    ///
    /// Round two asserted six hand-written `contains` clauses about the two
    /// "Curated" labels it already knew about — and "journey" sat on question
    /// five of five (`QuizModels.swift:112`, "What's driving your design
    /// journey?") through three review rounds because no assertion ever read
    /// the rest of the file. This lints the whole file instead.
    ///
    /// `key:` values are excluded from the lint and pinned separately:
    /// `eclectic_curated` and `curated_comfort` both contain "curated", they
    /// are the wire values `StyleQuizViewModel` matches on (`:221`, `:242`,
    /// `:296`), and they must survive every relabel untouched.
    @Test("nothing the quiz says is on the banned lexicon, and both lookup keys survive")
    func styleQuizIsClean() throws {
        let path = "Patina/Features/StyleQuiz/Models/QuizModels.swift"
        let source = try SourcePin.read(path)
        var wireKeys: Set<String> = []

        for (index, line) in source.split(separator: "\n", omittingEmptySubsequences: false).enumerated() {
            guard !line.trimmingCharacters(in: .whitespaces).hasPrefix("//") else { continue }
            for literal in Self.labelledStringLiterals(in: String(line)) {
                guard literal.argument != "key" else {
                    wireKeys.insert(literal.value)
                    continue
                }
                for banned in Self.bannedLexicon {
                    #expect(
                        !literal.value.lowercased().contains(banned),
                        "\"\(banned)\" at \(path):\(index + 1) — \"\(literal.value)\""
                    )
                }
            }
        }

        #expect(wireKeys.contains("eclectic_curated"), "the spectrum key was renamed: \(wireKeys.sorted())")
        #expect(wireKeys.contains("curated_comfort"), "the budget key was renamed: \(wireKeys.sorted())")

        let viewModel = try SourcePin.read("Patina/Features/StyleQuiz/ViewModels/StyleQuizViewModel.swift")
        #expect(viewModel.contains("eclectic_curated"))
        #expect(viewModel.contains("curated_comfort"))
    }

    /// `l1-e-copy-deck.md`'s header list, matched case-insensitively.
    ///
    /// Not "AI": as a bare substring it fires on "chair", "detail" and
    /// "available". `AuthFailureCopyTests.everySentenceIsInVoice` can afford
    /// the case-sensitive check because it runs over seven known sentences; a
    /// whole-file lint cannot.
    private static let bannedLexicon = [
        "curated", "journey", "elevated", "disrupt", "revolutionize",
        "artificial intelligence", "machine learning"
    ]

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
        labelledStringLiterals(in: line).map(\.value)
    }

    /// The same scan, keeping the argument label that introduces each literal:
    /// `key: "eclectic_curated"` → `("key", "eclectic_curated")`. A literal
    /// that is not an argument's value carries an empty label.
    private static func labelledStringLiterals(in line: String) -> [(argument: String, value: String)] {
        var results: [(argument: String, value: String)] = []
        var outside = ""
        var current = ""
        var argument = ""
        var inside = false
        var escaped = false
        for character in line {
            if escaped { if inside { current.append(character) }; escaped = false; continue }
            if character == "\\" { escaped = true; continue }
            if character == "\"" {
                if inside {
                    results.append((argument, current))
                    current = ""
                } else {
                    argument = trailingArgumentLabel(of: outside)
                    outside = ""
                }
                inside.toggle()
                continue
            }
            if inside { current.append(character) } else { outside.append(character) }
        }
        return results
    }

    /// `", gradient: PatinaGradients.rattan, key: "` → `"key"`. Anything that
    /// does not end in an argument colon has no label.
    private static func trailingArgumentLabel(of prefix: String) -> String {
        let trimmed = prefix.trimmingCharacters(in: .whitespaces)
        guard trimmed.hasSuffix(":") else { return "" }
        let token = trimmed.dropLast().split { !$0.isLetter && !$0.isNumber && $0 != "_" }.last
        return token.map(String.init) ?? ""
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

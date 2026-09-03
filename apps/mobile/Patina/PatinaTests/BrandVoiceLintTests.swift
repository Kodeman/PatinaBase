//
//  BrandVoiceLintTests.swift
//  PatinaTests
//
//  C5-20: "Start Your Journey" and "Join the furniture discovery journey"
//  are brand-voice violations — `.claude/skills/patina-brand-voice/SKILL.md`'s
//  lexicon bans "journey", "curated", "elevated", "disrupt", "revolutionize"
//  in consumer copy, and the app-wide sweep (assignment note 9) is already
//  clean of the AI-word set.
//
//  A-06: the apostrophe half. The finding's fix line is "sweep every
//  user-facing string for U+2019; **add a lint rule**" —
//  `apostrophesAreCurly` is that rule.
//
//  The lint reads **double-quoted string literals only**, never comments or
//  identifiers: a future `elevatedSurface` token or a comment quoting a
//  finding title is not user-facing copy and must not fail the gate. The
//  charter scopes this to "any user-facing string".
//
//  Scoped to the files this wave's deck touches, not the whole app — W2 ·
//  L1-E's 48-row table is the full sweep. Assertions on files another lane
//  owns are wrapped in `withKnownIssue` (see `ErrorVoiceTests`'s header for
//  why, and for the unwrap signal).
//

import Testing
import Foundation

struct BrandVoiceLintTests {

    private static let bannedWords = [
        "journey", "curated", "curation", "elevated", "disrupt", "revolutioniz"
    ]

    private static let aiWords = [
        "artificial intelligence", "machine learning", " gpt", " llm"
    ]

    /// Every double-quoted string literal in a Swift source, with line
    /// comments, block comments and identifiers excluded. Multi-line (`"""`)
    /// literals are returned as one string each.
    static func stringLiterals(in source: String) -> [String] {
        let chars = Array(source)
        var literals: [String] = []
        var index = 0
        while index < chars.count {
            if let next = endOfComment(chars, at: index) {
                index = next
            } else if let (literal, next) = literal(chars, at: index) {
                literals.append(literal)
                index = next
            } else {
                index += 1
            }
        }
        return literals
    }

    /// The index just past a `//` or `/* */` comment starting at `index`,
    /// or `nil` if one does not start there.
    private static func endOfComment(_ chars: [Character], at index: Int) -> Int? {
        guard chars[index] == "/", index + 1 < chars.count else { return nil }
        if chars[index + 1] == "/" {
            var cursor = index
            while cursor < chars.count, chars[cursor] != "\n" { cursor += 1 }
            return cursor
        }
        guard chars[index + 1] == "*" else { return nil }
        var cursor = index + 2
        while cursor + 1 < chars.count, !(chars[cursor] == "*" && chars[cursor + 1] == "/") {
            cursor += 1
        }
        return min(cursor + 2, chars.count)
    }

    private static func literal(_ chars: [Character], at index: Int) -> (String, Int)? {
        guard chars[index] == "\"" else { return nil }
        if isTripleQuote(chars, at: index) { return multilineLiteral(chars, at: index) }
        return singleLineLiteral(chars, at: index)
    }

    private static func isTripleQuote(_ chars: [Character], at index: Int) -> Bool {
        index + 2 < chars.count
            && chars[index] == "\"" && chars[index + 1] == "\"" && chars[index + 2] == "\""
    }

    private static func multilineLiteral(_ chars: [Character], at index: Int) -> (String, Int) {
        var cursor = index + 3
        var current = ""
        while cursor + 2 < chars.count, !isTripleQuote(chars, at: cursor) {
            current.append(chars[cursor])
            cursor += 1
        }
        return (current, min(cursor + 3, chars.count))
    }

    private static func singleLineLiteral(_ chars: [Character], at index: Int) -> (String, Int) {
        var cursor = index + 1
        var current = ""
        while cursor < chars.count, chars[cursor] != "\"", chars[cursor] != "\n" {
            if chars[cursor] == "\\", cursor + 1 < chars.count {
                current.append(chars[cursor])
                cursor += 1
            }
            current.append(chars[cursor])
            cursor += 1
        }
        let closed = cursor < chars.count && chars[cursor] == "\""
        return (current, closed ? cursor + 1 : cursor)
    }

    private static func lint(_ source: String, file: String) {
        for literal in stringLiterals(in: source) {
            let lower = literal.lowercased()
            for word in bannedWords {
                #expect(!lower.contains(word), "\(file) ships \"\(literal)\" — banned lexicon word \"\(word)\"")
            }
            for word in aiWords {
                #expect(!lower.contains(word), "\(file) ships \"\(literal)\" — AI-label phrase \"\(word)\"")
            }
            #expect(
                literal.range(of: #"(?<![A-Za-z])AI(?![A-Za-z])"#, options: .regularExpression) == nil,
                "\(file) ships \"\(literal)\" — the standalone word AI"
            )
        }
    }

    /// A-06's lint rule: one apostrophe glyph, U+2019, in anything a reader
    /// sees. Only apostrophes *between letters* are checked, so a literal
    /// carrying a Swift selector or a possessive-free path is untouched.
    private static func lintApostrophes(_ source: String, file: String) {
        for literal in stringLiterals(in: source) {
            #expect(
                literal.range(of: "[A-Za-z]'[A-Za-z]", options: .regularExpression) == nil,
                "\(file) ships \"\(literal)\" with a straight apostrophe (U+0027); A-06 wants U+2019"
            )
        }
    }

    /// The files whose copy this wave's deck rewrites, and which this lane
    /// owns outright. `PatinaDesignKit` sits beside the app target, hence the
    /// `../` prefix `SourcePin` resolves.
    private static let deckFiles = [
        "Patina/Design/Components/PatinaErrorState.swift",
        "../PatinaDesignKit/Sources/PatinaDesignKit/Tokens/TimeOfDay.swift",
        "Patina/Features/ARPlacement/Views/ARPlacementView.swift",
        "Patina/Features/ARPlacement/ViewModels/ARPlacementViewModel.swift",
        "Patina/Services/DesignServices/DesignServicesService.swift",
        "Patina/Features/DesignServices/DesignRequestFlowView+Steps.swift",
        "Patina/Services/Companion/Models/CompanionAPIModels.swift",
        "Patina/App/Coordinators/Coordinator.swift",
        "Patina/Features/Collections/Views/CollectionsView.swift"
    ]

    @Test("every file this wave's copy deck touches carries no brand-voice violation")
    func deckFilesAreClean() throws {
        for path in Self.deckFiles {
            Self.lint(try SourcePin.read(path), file: path)
        }
    }

    @Test("every file this lane owns types its apostrophes as U+2019 (A-06)")
    func apostrophesAreCurly() throws {
        for path in Self.deckFiles {
            Self.lintApostrophes(try SourcePin.read(path), file: path)
        }
    }

    @Test("the onboarding carousel carries no brand-voice violation")
    func onboardingIsClean() throws {
        withKnownIssue("deck row C5-20 / OnboardingFlowView.swift:32 is L1-A's; unwrap after L1-A merges") {
            let path = "Patina/Features/Onboarding/Views/OnboardingFlowView.swift"
            Self.lint(try SourcePin.read(path), file: path)
        }
    }

    @Test("the authentication screens carry no brand-voice violation")
    func authenticationIsClean() throws {
        withKnownIssue("deck row C5-20 / AuthenticationView.swift:134 is L1-A's; unwrap after L1-A merges") {
            let path = "Patina/Features/Authentication/Views/AuthenticationView.swift"
            Self.lint(try SourcePin.read(path), file: path)
        }
    }

    /// The style quiz says "Curated" twice on the mandatory first-run path —
    /// question 1 of 5 and question 4 of 5 — while this suite's own lexicon
    /// bans the word. `Features/StyleQuiz/**` is L1-A's.
    @Test("the style quiz's option labels carry no brand-voice violation")
    func styleQuizIsClean() throws {
        withKnownIssue("deck rows C5-20 / QuizModels.swift:73,105 are L1-A's; unwrap after L1-A merges") {
            let source = try SourcePin.read("Patina/Features/StyleQuiz/Models/QuizModels.swift")
            #expect(!source.contains("label: \"Eclectic Curated\""))
            #expect(!source.contains("label: \"Curated Comfort\""))
            #expect(source.contains("label: \"Collected Eclectic\""))
            #expect(source.contains("label: \"Considered Comfort\""))
            // The wire keys feed the spectrum mapping and the budget lookup —
            // they are not copy and must survive the rename untouched.
            #expect(source.contains("key: \"eclectic_curated\""))
            #expect(source.contains("key: \"curated_comfort\""))
        }
    }
}

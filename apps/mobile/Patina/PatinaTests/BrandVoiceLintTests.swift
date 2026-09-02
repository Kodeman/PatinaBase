//
//  BrandVoiceLintTests.swift
//  PatinaTests
//
//  C5-20: "Start Your Journey" and "Join the furniture discovery journey"
//  are brand-voice violations — `.claude/skills/patina-brand-voice/SKILL.md`'s
//  lexicon bans "journey", "curated", "elevated", "disrupt", "revolutionize"
//  in consumer copy, and the app-wide sweep (assignment note 9) is already
//  clean of the AI-word set. This suite is what keeps both clean.
//
//  Scoped to the files this deck's rows touch, not the whole app — W2 ·
//  L1-E's 48-row table is the full sweep. The Onboarding/Authentication
//  assertions are L1-A's files (source-scanned, not `@testable import`ed,
//  since those types are not this lane's to construct) and stay red on this
//  lane's own clone until L1-A applies its rows from the deck — expected,
//  same reasoning as `ErrorVoiceTests`.
//

import Testing
import Foundation

struct BrandVoiceLintTests {

    private static let bannedWords = [
        "journey", "curated", "curation", "elevated", "disrupt", "revolutioniz",
    ]

    private static let aiWords = [
        "artificial intelligence", "machine learning", " gpt", " llm",
    ]

    private static func lint(_ source: String, file: String) {
        let lower = source.lowercased()
        for word in bannedWords {
            #expect(!lower.contains(word), "\(file) contains banned lexicon word \"\(word)\"")
        }
        for word in aiWords {
            #expect(!lower.contains(word), "\(file) contains an AI-label phrase \"\(word)\"")
        }
        // Standalone "AI" as a word, not inside "Patina"/"waiting"/etc.
        #expect(
            source.range(
                of: #"(?<![A-Za-z])AI(?![A-Za-z])"#,
                options: .regularExpression
            ) == nil,
            "\(file) contains the standalone word AI"
        )
    }

    @Test("the onboarding carousel carries no brand-voice violation")
    func onboardingIsClean() throws {
        let path = "Patina/Features/Onboarding/Views/OnboardingFlowView.swift"
        lint(try SourcePin.read(path), file: path)
    }

    @Test("the authentication screens carry no brand-voice violation")
    func authenticationIsClean() throws {
        let path = "Patina/Features/Authentication/Views/AuthenticationView.swift"
        lint(try SourcePin.read(path), file: path)
    }

    @Test("every file this wave's copy deck touches carries no brand-voice violation")
    func deckFilesAreClean() throws {
        let paths = [
            "Patina/Design/Components/PatinaErrorState.swift",
            "PatinaDesignKit/Sources/PatinaDesignKit/Tokens/TimeOfDay.swift", // resolved via ".."
            "Patina/Features/ARPlacement/Views/ARPlacementView.swift",
            "Patina/Features/ARPlacement/ViewModels/ARPlacementViewModel.swift",
            "Patina/Services/DesignServices/DesignServicesService.swift",
            "Patina/Features/DesignServices/DesignRequestFlowView+Steps.swift",
            "Patina/Services/Companion/Models/CompanionAPIModels.swift",
        ]
        for path in paths {
            let relative = path.hasPrefix("PatinaDesignKit/") ? "../\(path)" : path
            lint(try SourcePin.read(relative), file: path)
        }
    }
}

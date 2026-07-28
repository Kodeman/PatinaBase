//
//  StyleProfilePersistenceTests.swift
//  PatinaTests
//
//  Pins the style-profile write path. Both routes to a taste profile — the
//  5-question Style Quiz and the scan flow's Style Conversation — must land a
//  `StylePreferenceModel` row, because that row is the only thing
//  `DailyRoomViewModel.hasStyleProfile` and `ProfileViewModel.styleBadge`
//  read. `persistToSwiftData` shipped with zero call sites, so every surface
//  behind that row was unreachable.
//

import Testing
import Foundation
import SwiftData
@testable import Patina

@MainActor
struct StyleProfilePersistenceTests {

    private func makeContext() throws -> ModelContext {
        let schema = Schema([StylePreferenceModel.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        return ModelContext(try ModelContainer(for: schema, configurations: [config]))
    }

    /// Exactly what `DailyRoomViewModel.load()` evaluates for `hasStyleProfile`.
    private func homeSeesStyleProfile(_ context: ModelContext) -> Bool {
        ((try? context.fetchCount(FetchDescriptor<StylePreferenceModel>())) ?? 0) > 0
    }

    private func completedQuiz(
        paletteWarmth: String = "Warm",
        confidence: Double = 0.8
    ) -> StyleQuizViewModel {
        let viewModel = StyleQuizViewModel()
        // Q1 warm_minimal · Q2 entertaining + work_from_home · Q3 soft_linen
        // Q4 curated_comfort · Q5 making_it_mine
        viewModel.selections = [0: [0], 1: [0, 2], 2: [1], 3: [1], 4: [1]]
        viewModel.result = StyleProfileResult(
            primaryStyle: "warm_minimal",
            secondaryStyle: nil,
            primaryMaterial: "Soft Linen",
            paletteWarmth: paletteWarmth,
            budgetLabel: "$2K–$5K",
            budgetMin: 2000,
            budgetMax: 5000,
            confidence: confidence
        )
        return viewModel
    }

    // MARK: - Style Quiz

    @Test
    func quizCompletionPersistsAProfileHomeCanSee() throws {
        let context = try makeContext()
        #expect(homeSeesStyleProfile(context) == false)

        completedQuiz().persistToSwiftData(context: context)

        #expect(homeSeesStyleProfile(context) == true)
    }

    @Test
    func quizSnapshotMapsAnswersOntoTheTasteRow() throws {
        let context = try makeContext()
        completedQuiz().persistToSwiftData(context: context)

        let saved = try #require(StylePreferenceStore(context: context).mostRecent())
        // Profile's style badge renders keywords.first verbatim.
        #expect(saved.keywords.first == "Warm Minimal")
        #expect(saved.keywords.contains("entertaining"))
        #expect(saved.keywords.contains("work_from_home"))
        #expect(saved.keywords.contains("making_it_mine"))
        #expect(saved.materials == ["soft_linen"])
        #expect(saved.budgetRange == "2000-5000")
        #expect(saved.confidence == 0.8)
        #expect(saved.warmth > 0.5)
    }

    @Test
    func quizWithoutAResultWritesNothing() throws {
        let context = try makeContext()
        let viewModel = StyleQuizViewModel()
        viewModel.selections = [0: [0]]
        viewModel.result = nil

        viewModel.persistToSwiftData(context: context)

        #expect(homeSeesStyleProfile(context) == false)
    }

    @Test
    func retakingTheQuizOverwritesInsteadOfDuplicating() throws {
        let context = try makeContext()
        completedQuiz(paletteWarmth: "Warm", confidence: 0.8)
            .persistToSwiftData(context: context)
        completedQuiz(paletteWarmth: "Cool", confidence: 0.6)
            .persistToSwiftData(context: context)

        let rowCount = try context.fetchCount(FetchDescriptor<StylePreferenceModel>())
        #expect(rowCount == 1)
        let saved = try #require(StylePreferenceStore(context: context).mostRecent())
        #expect(saved.confidence == 0.6)
        #expect(saved.warmth < 0.5)
    }

    // MARK: - Style Conversation (scan flow)

    private var conversationResponses: StyleResponseModel {
        StyleResponseModel(
            visualResonance: .warmMinimal,
            lifestyleFactors: [.sanctuary],
            materialPreferences: [.softLinen, .weatheredOak],
            investmentTier: .budgetMid,
            priority: .rest
        )
    }

    private func conversationProfile(
        aestheticName: String = "Quiet Warmth",
        confidence: Float = 0.72
    ) -> StyleProfileResponse {
        StyleProfileResponse(
            profileId: "profile-1",
            aestheticName: aestheticName,
            spectrumValues: [0.6, 0.4, 0.2, 0.5, 0.3],
            tags: ["calm", "linen"],
            confidence: confidence,
            matchingProducts: 120
        )
    }

    @Test
    func conversationCompletionPersistsAProfileHomeCanSee() throws {
        let context = try makeContext()
        #expect(homeSeesStyleProfile(context) == false)

        let snapshot = StyleConversationViewModel.styleSnapshot(
            profile: conversationProfile(),
            responses: conversationResponses
        )
        StylePreferenceStore(context: context).upsert(snapshot)

        #expect(homeSeesStyleProfile(context) == true)
    }

    @Test
    func conversationSnapshotMapsAnswersOntoTheTasteRow() throws {
        let snapshot = StyleConversationViewModel.styleSnapshot(
            profile: conversationProfile(),
            responses: conversationResponses
        )

        // Profile's style badge renders keywords.first verbatim — the engine's
        // aesthetic name, not a raw answer key.
        #expect(snapshot.keywords.first == "Quiet Warmth")
        #expect(snapshot.keywords.contains("sanctuary"))
        #expect(snapshot.keywords.contains("rest"))
        #expect(snapshot.materials == ["soft_linen", "weathered_oak"])
        // Same dollar shape the quiz writes.
        #expect(snapshot.budgetRange == "2000-5000")
        #expect(abs(snapshot.confidence - 0.72) < 0.0001)
        // Warm Minimal + linen + oak + rest is unambiguously warm and casual.
        #expect(snapshot.warmth > 0.5)
        #expect(snapshot.formality < 0.5)
    }

    @Test
    func conversationDeferredBudgetNamesNoRange() {
        var responses = conversationResponses
        responses.investmentTier = .budgetDesigner

        let snapshot = StyleConversationViewModel.styleSnapshot(
            profile: conversationProfile(),
            responses: responses
        )

        #expect(snapshot.budgetRange == nil)
    }

    @Test
    func conversationResolvingTwiceLeavesOneRow() throws {
        // The container resolves through both the view model's `onFinished`
        // and the Contemplative Pause's own scoring; the upsert absorbs it.
        let context = try makeContext()
        let store = StylePreferenceStore(context: context)
        let responses = conversationResponses

        store.upsert(StyleConversationViewModel.styleSnapshot(
            profile: conversationProfile(aestheticName: "Quiet Warmth", confidence: 0.72),
            responses: responses
        ))
        store.upsert(StyleConversationViewModel.styleSnapshot(
            profile: conversationProfile(aestheticName: "Quiet Warmth", confidence: 0.72),
            responses: responses
        ))

        let rowCount = try context.fetchCount(FetchDescriptor<StylePreferenceModel>())
        #expect(rowCount == 1)
    }

    // MARK: - Cross-path

    @Test
    func aQuizProfileIsReplacedByALaterConversationProfile() throws {
        let context = try makeContext()
        completedQuiz().persistToSwiftData(context: context)

        StylePreferenceStore(context: context).upsert(
            StyleConversationViewModel.styleSnapshot(
                profile: conversationProfile(aestheticName: "Quiet Warmth"),
                responses: conversationResponses
            )
        )

        let rowCount = try context.fetchCount(FetchDescriptor<StylePreferenceModel>())
        #expect(rowCount == 1)
        let saved = try #require(StylePreferenceStore(context: context).mostRecent())
        #expect(saved.keywords.first == "Quiet Warmth")
    }
}

//
//  ContextualExperienceTests.swift
//  PatinaTests
//
//  Pins Option B's deterministic context, taste, and Today decisions.
//

import Foundation
import SwiftData
import Testing
@testable import Patina

@MainActor
struct ContextualExperienceTests {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private struct MemoryFixture {
        let store: ContextMemoryStore
        let defaults: UserDefaults
        let suite: String
    }

    private func makeMemoryStore(
        owner: String = "owner-a",
        enabled: Bool = true
    ) throws -> MemoryFixture {
        let suite = "ContextualExperienceTests.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        let store = ContextMemoryStore(
            defaults: defaults,
            ownerIDProvider: { owner },
            nowProvider: { now }
        )
        if enabled {
            store.setEnabled(true)
        }
        return MemoryFixture(store: store, defaults: defaults, suite: suite)
    }

    private func room(
        id: UUID = UUID(),
        name: String,
        updatedAt: Date,
        itemCount: Int = 0,
        hasBeenScanned: Bool = true
    ) -> ContextRoomCandidate {
        ContextRoomCandidate(
            id: id,
            name: name,
            updatedAt: updatedAt,
            itemCount: itemCount,
            hasBeenScanned: hasBeenScanned
        )
    }

    private func makeStyleContext() throws -> ModelContext {
        let schema = Schema([StylePreferenceModel.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        return ModelContext(try ModelContainer(for: schema, configurations: [config]))
    }

    private func product(
        materialTags: [String] = [],
        styleTags: [String] = []
    ) -> Product {
        Product(
            id: "product-1",
            name: "Lounge Chair",
            priceCents: 180_000,
            matchScore: 92,
            makerName: "Maker",
            makerLocation: nil,
            makerStory: nil,
            imageURL: nil,
            usdzURL: nil,
            styleTags: styleTags,
            materialTags: materialTags,
            badges: [],
            category: .seating,
            tier: .styleMatch
        )
    }

    // MARK: - Context memory

    @Test
    func contextualMemoryRequiresAnExplicitFirstRunOptIn() throws {
        let fixture = try makeMemoryStore(enabled: false)
        defer { fixture.defaults.removePersistentDomain(forName: fixture.suite) }

        let ignored = room(name: "Bedroom", updatedAt: now.addingTimeInterval(-300))
        let freshest = room(name: "Living Room", updatedAt: now)
        fixture.store.rememberRoom(id: ignored.id)

        #expect(fixture.store.isEnabled == false)
        #expect(fixture.store.latestActivity(of: .room) == nil)
        #expect(
            fixture.store.activeRoom(from: [ignored, freshest], currentSelectionID: nil)?.id
                == freshest.id
        )
    }

    @Test
    func currentRoomSelectionWinsOverRememberedAndFreshestRooms() throws {
        let fixture = try makeMemoryStore()
        defer { fixture.defaults.removePersistentDomain(forName: fixture.suite) }

        let selected = room(name: "Library", updatedAt: now.addingTimeInterval(-300))
        let remembered = room(name: "Bedroom", updatedAt: now.addingTimeInterval(-200))
        let freshest = room(name: "Living Room", updatedAt: now)
        fixture.store.rememberRoom(id: remembered.id)

        let resolved = fixture.store.activeRoom(
            from: [selected, remembered, freshest],
            currentSelectionID: selected.id
        )

        #expect(resolved?.id == selected.id)
    }

    @Test
    func rememberedRoomWinsWhenThereIsNoCurrentSelection() throws {
        let fixture = try makeMemoryStore()
        defer { fixture.defaults.removePersistentDomain(forName: fixture.suite) }

        let remembered = room(name: "Bedroom", updatedAt: now.addingTimeInterval(-300))
        let freshest = room(name: "Living Room", updatedAt: now)
        fixture.store.rememberRoom(id: remembered.id)

        let resolved = fixture.store.activeRoom(
            from: [remembered, freshest],
            currentSelectionID: nil
        )

        #expect(resolved?.id == remembered.id)
    }

    @Test
    func expiredMemoryFallsBackToFreshestRealRoom() throws {
        let fixture = try makeMemoryStore()
        defer { fixture.defaults.removePersistentDomain(forName: fixture.suite) }

        let expired = room(name: "Bedroom", updatedAt: now.addingTimeInterval(-300))
        let freshest = room(name: "Living Room", updatedAt: now, itemCount: 2)
        fixture.store.rememberRoom(
            id: expired.id,
            at: now.addingTimeInterval(-(91 * 24 * 60 * 60))
        )

        let resolved = fixture.store.activeRoom(
            from: [expired, freshest],
            currentSelectionID: nil
        )

        #expect(resolved?.id == freshest.id)
        #expect(fixture.store.latestActivity(of: .room) == nil)
    }

    @Test
    func disablingMemoryPurgesContextAndStopsUsingIt() throws {
        let fixture = try makeMemoryStore()
        defer { fixture.defaults.removePersistentDomain(forName: fixture.suite) }

        let remembered = room(name: "Bedroom", updatedAt: now.addingTimeInterval(-300))
        let freshest = room(name: "Living Room", updatedAt: now)
        fixture.store.rememberRoom(id: remembered.id)

        fixture.store.setEnabled(false)
        fixture.store.setEnabled(true)

        #expect(fixture.store.latestActivity(of: .room) == nil)
        #expect(
            fixture.store.activeRoom(from: [remembered, freshest], currentSelectionID: nil)?.id
                == freshest.id
        )
    }

    // MARK: - Taste portrait

    @Test
    func portraitExplainsOnlyPersistedTasteSignals() throws {
        let context = try makeStyleContext()
        let preference = StylePreferenceStore(context: context).upsert(
            StylePreferenceSnapshot(
                keywords: ["Quiet Warmth", "sanctuary", "rest"],
                warmth: 0.74,
                formality: 0.35,
                materials: ["soft_linen", "weathered_oak"],
                eras: [],
                confidence: 0.82,
                budgetRange: "2000-5000"
            )
        )

        let portrait = try #require(TastePortrait(preference: preference))

        #expect(portrait.title == "Quiet Warmth")
        #expect(portrait.summary == "Quiet Warmth, grounded in Soft Linen and Weathered Oak.")
        #expect(portrait.evidence.contains(
            "Your sanctuary and rest answers point toward quiet, restorative pieces."
        ))
        #expect(portrait.evidence.contains(
            "Your answers lean warm, so the edit will favor softened neutrals and warmer finishes."
        ))
        #expect(portrait.evidence.contains(
            "Your $2,000–$5,000 room range keeps the edit grounded in the investment you named."
        ))
    }

    @Test
    func recommendationRationaleRequiresARealMatchOrRoomScope() throws {
        let context = try makeStyleContext()
        let preference = StylePreferenceStore(context: context).upsert(
            StylePreferenceSnapshot(
                keywords: ["Quiet Warmth", "warm_minimal"],
                warmth: 0.74,
                formality: 0.35,
                materials: ["soft_linen"],
                eras: [],
                confidence: 0.82,
                budgetRange: nil
            )
        )
        let portrait = try #require(TastePortrait(preference: preference))

        #expect(
            portrait.recommendationRationale(
                for: product(materialTags: ["linen"]),
                roomName: nil
            ) == "Soft Linen matches a material you chose."
        )
        #expect(
            portrait.recommendationRationale(
                for: product(materialTags: ["brass"]),
                roomName: nil
            ) == nil
        )
        #expect(
            portrait.recommendationRationale(
                for: product(materialTags: ["brass"]),
                roomName: "Library"
            ) == "Selected from Patina's room-aware edit for Library."
        )
    }

    @Test
    func tasteTuningIsPersistedAndBounded() throws {
        let context = try makeStyleContext()
        let store = StylePreferenceStore(context: context)
        store.upsert(
            StylePreferenceSnapshot(
                keywords: ["Quiet Warmth"],
                warmth: 0.95,
                formality: 0.05,
                materials: ["linen"],
                eras: [],
                confidence: 0.82,
                budgetRange: nil
            )
        )

        store.tune(.warmer)
        store.tune(.moreRelaxed)

        let tuned = try #require(store.mostRecent())
        #expect(tuned.warmth == 1)
        #expect(tuned.formality == 0)
    }

    // MARK: - Today priority

    @Test
    func savedDesignRequestDraftIsAlwaysTheSingleTopPriority() {
        let move = TodayExperience.nextMove(for: TodayPriorityInput(
            hasPendingDesignDraft: true,
            resumableScanPhotoCount: 3,
            promotedDesignRequestID: "lead-1",
            pendingDecisionCount: 4,
            unreadMessageCount: 8,
            hasStyleProfile: true,
            activeRoom: room(name: "Living Room", updatedAt: now, itemCount: 2)
        ))

        #expect(move.kind == .resumeDesignRequest)
    }

    @Test
    func projectDecisionOutranksRoomWork() {
        let move = TodayExperience.nextMove(for: TodayPriorityInput(
            pendingDecisionCount: 1,
            unreadMessageCount: 3,
            hasStyleProfile: true,
            activeRoom: room(name: "Living Room", updatedAt: now, itemCount: 2)
        ))

        #expect(move.kind == .reviewDecisions)
        #expect(move.detail == "1 decision needs your eye.")
    }

    @Test
    func roomlessTodayStartsWithAScan() {
        let move = TodayExperience.nextMove(for: TodayPriorityInput(
            hasStyleProfile: true,
            activeRoom: nil
        ))

        #expect(move.kind == .scanFirstRoom)
    }

    @Test
    func activeRoomProgressChangesTheRoomMove() {
        let emptyRoom = room(name: "Library", updatedAt: now, itemCount: 0)
        let buildingRoom = room(name: "Library", updatedAt: now, itemCount: 2)

        let explore = TodayExperience.nextMove(for: TodayPriorityInput(
            hasStyleProfile: true,
            activeRoom: emptyRoom
        ))
        let review = TodayExperience.nextMove(for: TodayPriorityInput(
            hasStyleProfile: true,
            activeRoom: buildingRoom
        ))

        #expect(explore.kind == .exploreActiveRoom)
        #expect(review.kind == .reviewActiveRoom)
    }
}

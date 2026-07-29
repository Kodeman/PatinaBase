//
//  StylePreferenceStore.swift
//  Patina
//
//  Single writer for `StylePreferenceModel` — the SwiftData row that Home
//  (`DailyRoomViewModel.hasStyleProfile`) and Profile (the style badge) read.
//  Both roads to a taste profile land here: the 5-question Style Quiz and the
//  scan flow's Style Conversation.
//
//  Distinct from `StyleProfileStore`, which keeps the Aesthete Engine's full
//  `StyleProfileResponse` in UserDefaults for the Reveal and the Soft Landing.
//  That one carries the engine's output; this one carries the durable taste
//  row the rest of the app reads.
//

import Foundation
import SwiftData

/// The value shape a feature hands the store. Features own the mapping from
/// their own answer models onto this; the store owns the SwiftData row.
public struct StylePreferenceSnapshot: Equatable {

    /// `keywords[0]` is display-ready — `ProfileViewModel.styleBadge` renders
    /// it verbatim. Everything after it is a machine key.
    public var keywords: [String]

    /// 0 (cool) ... 1 (warm).
    public var warmth: Double

    /// 0 (casual) ... 1 (formal).
    public var formality: Double

    public var materials: [String]
    public var eras: [String]
    public var confidence: Double

    /// `"{min}-{max}"` in whole dollars, or nil when the user deferred to a
    /// designer.
    public var budgetRange: String?

    public init(
        keywords: [String],
        warmth: Double,
        formality: Double,
        materials: [String],
        eras: [String],
        confidence: Double,
        budgetRange: String?
    ) {
        self.keywords = keywords
        self.warmth = warmth
        self.formality = formality
        self.materials = materials
        self.eras = eras
        self.confidence = confidence
        self.budgetRange = budgetRange
    }
}

@MainActor
public final class StylePreferenceStore {

    public let context: ModelContext

    public init(context: ModelContext) {
        self.context = context
    }

    // MARK: - Reads

    /// The freshest profile — the same row `ProfileViewModel` fetches.
    public func mostRecent() -> StylePreferenceModel? {
        var descriptor = FetchDescriptor<StylePreferenceModel>(
            sortBy: [SortDescriptor(\.updatedAt, order: .reverse)]
        )
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    // MARK: - Writes

    /// Overwrite the newest row rather than inserting a second one. Consumers
    /// read "the most recent", and completion can fire more than once per run
    /// (the Style Conversation resolves through both its view model and the
    /// Contemplative Pause), so insert-per-completion would pile up rows that
    /// nobody reads and only `LocalStoreReset` ever sweeps.
    @discardableResult
    public func upsert(_ snapshot: StylePreferenceSnapshot) -> StylePreferenceModel {
        let profile: StylePreferenceModel
        if let existing = mostRecent() {
            profile = existing
        } else {
            profile = StylePreferenceModel()
            context.insert(profile)
        }

        profile.keywords = snapshot.keywords
        profile.warmth = snapshot.warmth
        profile.formality = snapshot.formality
        profile.materials = snapshot.materials
        profile.eras = snapshot.eras
        profile.confidence = snapshot.confidence
        profile.budgetRange = snapshot.budgetRange
        profile.updatedAt = Date()

        save()
        return profile
    }

    /// Applies an explicit user-authored tuning to the durable taste row.
    /// Adjustments are deliberately small and bounded: they refine the answers
    /// already given rather than replacing the portrait with a guess.
    @discardableResult
    public func tune(_ adjustment: TasteAdjustment) -> StylePreferenceModel? {
        guard let profile = mostRecent() else { return nil }
        switch adjustment {
        case .warmer:
            profile.warmth = min(1, profile.warmth + 0.1)
        case .cooler:
            profile.warmth = max(0, profile.warmth - 0.1)
        case .moreRelaxed:
            profile.formality = max(0, profile.formality - 0.1)
        case .moreTailored:
            profile.formality = min(1, profile.formality + 0.1)
        }
        profile.updatedAt = Date()
        save()
        return profile
    }

    // MARK: - Persistence

    private func save() {
        do {
            try context.save()
        } catch {
            #if DEBUG
            PatinaLog.ui.error("[StylePreferenceStore] save error: \(error.localizedDescription)")
            #endif
        }
    }
}

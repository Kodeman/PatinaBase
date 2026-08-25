//  SmartGuessTests.swift
//  CaptureTests
//
//  Two contracts the viewfinder's smart guess rests on, both moved into
//  CaptureKit so capture-gate.sh can see them (C1 — CaptureTests links
//  CaptureKit alone, and HeuristicSmartGuessService is app-side):
//
//  1. The Vision-label → category table. The Vision call itself is
//     device-verified; the mapping is pure and belongs under the gate.
//  2. What counts as an UNCONFIRMED guess. Until now every capture carried a
//     hardcoded seating@0.72, so hasUnconfirmedGuess was always true and S3
//     recommended Inbox for every capture ever taken. hasUnconfirmedGuess
//     itself does not change in this wave (ruling 2026-08-24: no confidence
//     floor) — it is still provenance-only. What changes is that a label the
//     reader cannot place now writes nothing at all, so there is genuinely
//     nothing left to confirm; a real guess, however confident, still is.

import Foundation
import Testing
@testable import CaptureKit

struct SmartGuessKeywordTests {

    @Test func visionLabelsMapToTheCategoryTheyName() {
        #expect(SmartGuessKeywords.category(forVisionLabel: "armchair") == .seating)
        #expect(SmartGuessKeywords.category(forVisionLabel: "Coffee Table") == .table)
        #expect(SmartGuessKeywords.category(forVisionLabel: "wall sconce") == .lighting)
        #expect(SmartGuessKeywords.category(forVisionLabel: "area rug") == .rug)
        #expect(SmartGuessKeywords.category(forVisionLabel: "brass knob") == .hardware)
    }

    @Test func anUnknownLabelMapsToNothingRatherThanAGuess() {
        #expect(SmartGuessKeywords.category(forVisionLabel: "baseboard") == nil)
        #expect(SmartGuessKeywords.category(forVisionLabel: "") == nil)
        #expect(SmartGuessKeywords.category(forVisionLabel: "drywall seam") == nil)
    }

    @Test func matchingIsCaseInsensitiveAndSubstringBased() {
        #expect(SmartGuessKeywords.category(forVisionLabel: "OAK DINING CHAIR") == .seating)
        #expect(SmartGuessKeywords.category(forVisionLabel: "chairlift") == .seating)
    }

    @Test func everyKeywordInTheTableResolvesToItsOwnCategory() {
        // Matching is first-match-wins over an ordered table, so a keyword can
        // be swallowed by an earlier entry it happens to contain — move "tile"
        // above "textile" and "textile" starts reading as .tile. Asserting the
        // category, not merely non-nil, is what pins the current ordering.
        for entry in SmartGuessKeywords.table {
            #expect(SmartGuessKeywords.category(forVisionLabel: entry.keyword) == entry.category,
                    "\(entry.keyword) does not resolve to \(entry.category) through its own table")
        }
    }

    @Test func anUnknownCategoryIsNeverWorthRecording() {
        let blank = SmartGuess(category: .unknown, categoryConfidence: 0, fields: [
            FieldSuggestion(key: .category, value: SpecimenCategory.unknown.rawValue,
                            confidence: 0)
        ])
        #expect(blank.fieldsWorthRecording.isEmpty)
    }

    @Test func aRealReadIsWorthRecording() {
        let read = SmartGuess(category: .seating, categoryConfidence: 0.81, fields: [
            FieldSuggestion(key: .category, value: SpecimenCategory.seating.rawValue,
                            confidence: 0.81),
            FieldSuggestion(key: .material, value: "Oak", confidence: 0.55),
            FieldSuggestion(key: .colorway, value: "Ecru", confidence: 0)
        ])
        let keys = read.fieldsWorthRecording.map(\.key)
        #expect(keys == [.category, .material])
    }
}

struct UnconfirmedGuessTests {

    /// The viewfinder's recording loop, mirrored: filter the read, write what
    /// survives, and pin a confidence only where the write actually took.
    /// `ViewfinderModel` itself is app-side and unreachable under C1, so the
    /// loop is reproduced here rather than called.
    @MainActor private func record(_ guess: SmartGuess, onto specimen: Specimen) {
        for suggestion in guess.fieldsWorthRecording {
            specimen.setValue(suggestion.value, for: suggestion.key, source: suggestion.source)
            guard specimen.provenance(for: suggestion.key) == suggestion.source else { continue }
            specimen.setConfidence(suggestion.confidence, for: suggestion.key)
        }
    }

    @Test @MainActor func aCaptureWithNoGuessHasNothingToConfirm() throws {
        let store = try CaptureStore.inMemory()
        let s = store.newDraft()
        #expect(s.hasUnconfirmedGuess == false)
    }

    @Test @MainActor func anUnplaceableLabelWritesNothingSoThereIsNothingToConfirm() throws {
        // The wall-defect case (spec Flow 6), run end to end: the filter drops an
        // unplaceable label, so nothing reaches setValue, so provenance never
        // carries smartGuess and there is nothing to confirm. Fails if either
        // half regresses — the filter or the accessors underneath it.
        let store = try CaptureStore.inMemory()

        let unplaceable = SmartGuess(category: .unknown, categoryConfidence: 0, fields: [
            FieldSuggestion(key: .category, value: SpecimenCategory.unknown.rawValue,
                            confidence: 0)
        ])
        let baseboard = store.newDraft()
        record(unplaceable, onto: baseboard)
        #expect(baseboard.hasUnconfirmedGuess == false)
        #expect(baseboard.category == .unknown)
        #expect(baseboard.guessConfidenceRaw.isEmpty)

        // And the other direction: a label the table places does leave something
        // to confirm, so the drop above is the filter working, not a dead path.
        let placeable = SmartGuess(category: .seating, categoryConfidence: 0.81, fields: [
            FieldSuggestion(key: .category, value: SpecimenCategory.seating.rawValue,
                            confidence: 0.81)
        ])
        let armchair = store.newDraft()
        record(placeable, onto: armchair)
        #expect(armchair.hasUnconfirmedGuess)
        #expect(armchair.category == .seating)
        #expect(armchair.guessConfidenceRaw[FieldKey.category.rawValue] == 0.81)
    }

    @Test @MainActor func aReadNeverPinsAConfidenceToAValueItDidNotWrite() throws {
        // setValue refuses to let a guess clobber a typed value. The confidence
        // must be refused with it, or the record ships provenance "manual"
        // alongside a guess confidence for a value the read never wrote.
        let store = try CaptureStore.inMemory()
        let s = store.newDraft()
        s.setValue("Walnut", for: .material, source: .manual)

        let read = SmartGuess(category: .seating, categoryConfidence: 0.81, fields: [
            FieldSuggestion(key: .material, value: "Oak", confidence: 0.55)
        ])
        record(read, onto: s)

        #expect(s.materialNote == "Walnut")
        #expect(s.provenance(for: .material) == .manual)
        #expect(s.guessConfidenceRaw[FieldKey.material.rawValue] == nil)
        #expect(s.hasUnconfirmedGuess == false)
    }

    @Test @MainActor func aShakyGuessIsUnconfirmed() throws {
        let store = try CaptureStore.inMemory()
        let s = store.newDraft()
        s.setValue(SpecimenCategory.textile.rawValue, for: .category, source: .smartGuess)
        s.setConfidence(0.31, for: .category)
        #expect(s.hasUnconfirmedGuess)
    }

    @Test @MainActor func aConfidentGuessIsStillUnconfirmed() throws {
        // No confidence floor (ruling 2026-08-24): a confident read still needs
        // her to confirm it, exactly like a shaky one. Confidence orders the
        // list and pre-selects in the confirm sheet; it never commits (FC-R12).
        let store = try CaptureStore.inMemory()
        let s = store.newDraft()
        s.setValue(SpecimenCategory.seating.rawValue, for: .category, source: .smartGuess)
        s.setConfidence(0.92, for: .category)
        #expect(s.hasUnconfirmedGuess)
    }

    @Test @MainActor func aGuessWithNoRecordedConfidenceIsStillUnconfirmed() throws {
        let store = try CaptureStore.inMemory()
        let s = store.newDraft()
        s.setValue("Walnut", for: .material, source: .smartGuess)
        #expect(s.hasUnconfirmedGuess)
    }

    @Test @MainActor func aTypedValueIsNeverAGuessHoweverConfident() throws {
        let store = try CaptureStore.inMemory()
        let s = store.newDraft()
        s.setValue("Lostine armchair", for: .title, source: .manual)
        s.setConfidence(0.1, for: .title)
        #expect(s.hasUnconfirmedGuess == false)
    }
}

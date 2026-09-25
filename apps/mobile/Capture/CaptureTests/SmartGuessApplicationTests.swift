//  SmartGuessApplicationTests.swift
//  CaptureTests
//
//  N5's orchestration (`SmartGuessApplication`, CaptureKit). The sheet that
//  calls it is app-side and out of reach, so these pin the two things it used
//  to get wrong: the guess was handed empty OCR and code arrays, and the sheet
//  showed its own guess whether or not the piece accepted it.

import Foundation
import Testing
@testable import CaptureKit
import CaptureKitMocks

struct SmartGuessApplicationTests {

    static let maker = OCRObservation(text: "Holloway & Co.", confidence: 0.94,
                                      boundingBox: .init(x: 0.1, y: 0.2, width: 0.5, height: 0.06),
                                      suggestedField: .maker)
    static let gtin = "0012345678905"
    static let frame = CaptureImage(data: Data(), width: 1170, height: 1560)
    static let heuristic = SmartGuess(category: .seating, categoryConfidence: 0.81, fields: [
        FieldSuggestion(key: .category, value: PieceCategory.seating.rawValue, confidence: 0.81),
        FieldSuggestion(key: .material, value: "Oak", confidence: 0.55)
    ])

    private func application(_ guess: RecordingSmartGuessService) -> SmartGuessApplication {
        SmartGuessApplication(ocr: MockTagOCRService(observations: [Self.maker]),
                              codes: MockCodeScanService(),
                              smartGuess: guess)
    }

    @Test func theGuessReceivesTheFramesOCRAndTheScannedCodes() async {
        let guess = RecordingSmartGuessService(returning: Self.heuristic)
        _ = await application(guess).observe(image: Self.frame, scannedCodeTags: ["gtin:\(Self.gtin)"])

        let ocr = await guess.receivedOCR
        let codes = await guess.receivedCodes
        #expect(ocr?.map(\.text) == ["Holloway & Co."])
        #expect(codes == [ScannedCode(payload: Self.gtin, symbology: "gtin", kind: .gtin(Self.gtin))])
    }

    @Test func eachSuggestionCarriesTheSourceThatProducedIt() async {
        let guess = RecordingSmartGuessService(returning: Self.heuristic)
        let observed = await application(guess).observe(image: Self.frame,
                                                        scannedCodeTags: ["gtin:\(Self.gtin)"])
        let sources = Dictionary(uniqueKeysWithValues: observed.suggestions.map { ($0.key, $0.source) })
        #expect(sources == [.maker: .ocr, .sku: .code, .category: .smartGuess, .material: .smartGuess])
    }

    @Test @MainActor func whatComesBackIsWhatThePieceHolds() async throws {
        let store = try CaptureStore.inMemory()
        let piece = store.newDraft()
        piece.scannedCodes = ["gtin:\(Self.gtin)"]

        let guess = RecordingSmartGuessService(returning: Self.heuristic)
        let observed = await application(guess).observe(image: Self.frame, scannedCodeTags: piece.scannedCodes)
        let results = SmartGuessApplication.apply(observed.suggestions, to: piece)

        #expect(results.count == 4)
        for (key, result) in results {
            #expect(result.isApplied, "\(key) did not land")
            #expect(result.persistedValue == piece.fieldValue(for: key))
            #expect(piece.provenance(for: key) == result.source)
        }
        #expect(piece.maker == "Holloway & Co.")
        #expect(piece.sku == Self.gtin)
        #expect(piece.materialNote == "Oak")
        // A confidence belongs to a guess, never to a read.
        #expect(piece.guessConfidenceRaw[FieldKey.material.rawValue] == 0.55)
        #expect(piece.guessConfidenceRaw[FieldKey.maker.rawValue] == nil)
        #expect(piece.guessConfidenceRaw[FieldKey.sku.rawValue] == nil)
    }

    @Test @MainActor func aConfirmedFieldSurvivesAConflictingGuessAsNotApplied() throws {
        let store = try CaptureStore.inMemory()
        let piece = store.newDraft()
        piece.recordSmartGuess([FieldSuggestion(key: .material, value: "Walnut", confidence: 0.6)])
        piece.acceptReview([GuessReview(key: .material, value: "Walnut", proposed: "Walnut")], by: "user-1")
        piece.setValue("Soane", for: .maker, source: .manual)
        piece.confirm(.maker, by: "user-1")

        let results = SmartGuessApplication.apply([
            FieldSuggestion(key: .material, value: "Oak", confidence: 0.9),
            FieldSuggestion(key: .maker, value: "Holloway & Co.", confidence: 0.94, source: .ocr)
        ], to: piece)

        #expect(results[.material]?.outcome == .notApplied(persisted: "Walnut"))
        #expect(results[.maker]?.outcome == .notApplied(persisted: "Soane"))
        #expect(piece.materialNote == "Walnut")
        #expect(piece.isConfirmed(.material))
        #expect(piece.guessConfidenceRaw[FieldKey.material.rawValue] == 0.6)
        #expect(piece.maker == "Soane")
        #expect(piece.provenance(for: .maker) == .manual)
        #expect(piece.isConfirmed(.maker))
    }

    @Test @MainActor func aReadDoesNotOverwriteAnotherOriginEvenUnconfirmed() throws {
        let store = try CaptureStore.inMemory()
        let piece = store.newDraft()
        piece.setValue("LQ-3S-OAK", for: .sku, source: .ocr)

        let results = SmartGuessApplication.apply(
            [FieldSuggestion(key: .sku, value: Self.gtin, confidence: 1, source: .code)], to: piece)

        #expect(results[.sku]?.outcome == .notApplied(persisted: "LQ-3S-OAK"))
        #expect(piece.provenance(for: .sku) == .ocr)
    }

    // MARK: - The shutter's read (C3, W1A-07 F2)
    //
    // ViewfinderModel.applySmartGuess hands every Release capture's frame to
    // `applyShutterRead`. It used to call `guess(image:ocr: [], codes: [])`.

    @Test func theViewfinderShutterTakesThisRead() throws {
        let source = SourcePin.code(try SourcePin.read("Capture/Features/Capture/ViewfinderModel.swift"))
        #expect(source.contains(".applyShutterRead(image:"))
        #expect(source.contains("scannedCodeTags: codeTags"))
        #expect(!source.contains("ocr: [], codes: []"))
    }

    @Test @MainActor func theShutterReadRunsOCRAndTheDraftsScannedCodes() async throws {
        let store = try CaptureStore.inMemory()
        let draft = store.newDraft()
        draft.scannedCodes = ["gtin:\(Self.gtin)"]
        let guess = RecordingSmartGuessService(returning: Self.heuristic)

        let results = await application(guess).applyShutterRead(
            image: Self.frame, scannedCodeTags: draft.scannedCodes, to: { draft })

        let ocr = await guess.receivedOCR
        let codes = await guess.receivedCodes
        #expect(ocr?.isEmpty == false)
        #expect(codes?.isEmpty == false)
        #expect(results?[.maker]?.isApplied == true)
        #expect(results?[.sku]?.isApplied == true)
        #expect(draft.maker == "Holloway & Co.")
        #expect(draft.provenance(for: .maker) == .ocr)
        #expect(draft.sku == Self.gtin)
        #expect(draft.provenance(for: .sku) == .code)
        #expect(draft.provenance(for: .material) == .smartGuess)
    }

    @Test @MainActor func theShutterReadLeavesAPieceThatHasLeftTheDevice() async throws {
        let store = try CaptureStore.inMemory()
        let piece = store.newDraft()
        piece.scannedCodes = ["gtin:\(Self.gtin)"]
        // She routed it while the read was running.
        piece.status = .queued
        #expect(piece.transferState.phase != .local)
        let guess = RecordingSmartGuessService(returning: Self.heuristic)

        let results = await application(guess).applyShutterRead(
            image: Self.frame, scannedCodeTags: piece.scannedCodes, to: { piece })

        #expect(results == nil)
        #expect(piece.maker == nil)
        #expect(piece.sku == nil)
        #expect(piece.materialNote == nil)
        for key in [FieldKey.maker, .sku, .material, .category] {
            #expect(piece.provenance(for: key) == nil)
        }
    }
}

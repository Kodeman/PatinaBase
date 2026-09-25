//  SmartGuessApplication.swift
//  CaptureKit
//
//  The smart-guess read's orchestration, lifted out of the retired N5 sheet so
//  CaptureTests (which links CaptureKit and the mocks, never the app) can reach
//  it. The C3 card's post-shutter read (`ViewfinderModel`) is its caller.
//
//  1. `observe` reads the captured frame: OCR runs on that frame, the
//     codes already scanned onto the piece are parsed, and both reach
//     `SmartGuessService.guess(image:ocr:codes:)`. N5 used to pass
//     empty arrays, so the guess never saw the tag or the barcode.
//  2. `apply` writes each suggestion through `Piece.setValue` and reports what
//     the PIECE holds afterwards, so the surface shows what persisted rather
//     than what it proposed. A refused suggestion comes back `notApplied`
//     with the persisted value beside it.
//
//  Sources: a line OCR tagged as maker/SKU is `.ocr`, a decoded GTIN is
//  `.code` (what N1 and N2 write), and the guess service's own vocabulary
//  hints stay `.smartGuess` — inferences, not reads.

import Foundation

/// One suggestion N5 tried to write, and what the piece holds after the try.
public struct SmartGuessFieldResult: Equatable, Sendable {
    public enum Outcome: Equatable, Sendable {
        /// The suggestion landed; the value is read back from the piece.
        case applied(String)
        /// The piece kept what it had — a tag, a scan, a typed value, or a
        /// value she confirmed. `persisted` is that value.
        case notApplied(persisted: String?)
    }

    public let key: FieldKey
    public let source: ProvenanceSource
    public let proposed: String
    public let confidence: Double
    public let outcome: Outcome

    public var isApplied: Bool {
        if case .applied = outcome { return true }
        return false
    }

    /// What the piece holds for this field, applied or not.
    public var persistedValue: String? {
        switch outcome {
        case .applied(let value): return value
        case .notApplied(let persisted): return persisted
        }
    }
}

/// What one pass over a frame produced, before anything is written.
public struct SmartGuessObservation: Sendable {
    public let ocr: [OCRObservation]
    public let codes: [ScannedCode]
    public let guess: SmartGuess
    /// One per field, in precedence order: a decoded code, then an OCR read,
    /// then the guess service's inference.
    public let suggestions: [FieldSuggestion]
}

public struct SmartGuessApplication: Sendable {
    private let ocr: any TagOCRService
    private let codes: any CodeScanService
    private let smartGuess: any SmartGuessService

    public init(ocr: any TagOCRService, codes: any CodeScanService, smartGuess: any SmartGuessService) {
        self.ocr = ocr
        self.codes = codes
        self.smartGuess = smartGuess
    }

    /// Runs OCR on `image`, parses the piece's `scannedCodes` tags
    /// ("<kind>:<value>", as N2 stores them) and hands both to the guess.
    public func observe(image: CaptureImage, scannedCodeTags: [String]) async -> SmartGuessObservation {
        let observations = (try? await ocr.recognizeText(in: image)) ?? []
        let scanned = scannedCodeTags.compactMap(parse)
        let guess = await smartGuess.guess(image: image, ocr: observations, codes: scanned)

        var suggestions: [FieldSuggestion] = []
        func add(_ suggestion: FieldSuggestion) {
            guard !suggestions.contains(where: { $0.key == suggestion.key }) else { return }
            suggestions.append(suggestion)
        }
        for code in scanned {
            if case .gtin(let gtin) = code.kind {
                add(FieldSuggestion(key: .sku, value: gtin, confidence: 1, source: .code))
            }
        }
        for line in observations {
            guard let field = line.suggestedField, field == .maker || field == .sku else { continue }
            add(FieldSuggestion(key: field, value: line.text, confidence: line.confidence, source: .ocr))
        }
        guess.fieldsWorthRecording.forEach(add)

        return SmartGuessObservation(ocr: observations, codes: scanned, guess: guess,
                                     suggestions: suggestions)
    }

    /// Writes each suggestion through `setValue` and reads the field back.
    ///
    /// `setValue` itself refuses a `.smartGuess` write over any other origin or
    /// over a confirmed value. It lets `.ocr` and `.code` through, because on
    /// N1 and N2 those writes are her explicit "use this read". Here nobody
    /// asked, so they get the same rule before they reach `setValue`. A
    /// confidence is pinned only to a guess that landed; N1 and N2 pin none.
    @MainActor
    public static func apply(_ suggestions: [FieldSuggestion], to piece: Piece) -> [FieldKey: SmartGuessFieldResult] {
        var results: [FieldKey: SmartGuessFieldResult] = [:]
        for suggestion in suggestions {
            let key = suggestion.key
            let existing = piece.provenance(for: key)
            let unasked = suggestion.source != .smartGuess
            let keepsExisting = existing.map { $0 != suggestion.source || piece.isConfirmed(key) } ?? false
            if !(unasked && keepsExisting) {
                piece.setValue(suggestion.value, for: key, source: suggestion.source)
            }

            let persisted = piece.fieldValue(for: key)
            let landed = piece.provenance(for: key) == suggestion.source
                && !piece.isConfirmed(key)
                && persisted == suggestion.value
            if landed, suggestion.source == .smartGuess {
                piece.setConfidence(suggestion.confidence, for: key)
            }
            results[key] = SmartGuessFieldResult(
                key: key,
                source: suggestion.source,
                proposed: suggestion.value,
                confidence: suggestion.confidence,
                outcome: landed ? .applied(persisted ?? suggestion.value) : .notApplied(persisted: persisted))
        }
        return results
    }

    /// The shutter's read: C3 is the surface every Release capture shows, so
    /// this is `observe` then `apply` for the frame just taken. `piece` is
    /// resolved AFTER the read — she can route the capture while it runs, and
    /// once it has left the device (`transferState.phase` is no longer
    /// `.local`) it is not rewritten. Nil when nothing was written.
    @MainActor
    public func applyShutterRead(image: CaptureImage, scannedCodeTags: [String],
                                 to piece: () -> Piece?) async -> [FieldKey: SmartGuessFieldResult]? {
        let observed = await observe(image: image, scannedCodeTags: scannedCodeTags)
        guard !observed.suggestions.isEmpty,
              let current = piece(),
              current.transferState.phase == .local else { return nil }
        return Self.apply(observed.suggestions, to: current)
    }

    private func parse(_ tag: String) -> ScannedCode? {
        guard let sep = tag.firstIndex(of: ":") else { return nil }
        let value = String(tag[tag.index(after: sep)...])
        guard !value.isEmpty else { return nil }
        return codes.parse(value, symbology: String(tag[..<sep]))
    }
}

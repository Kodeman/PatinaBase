//  VisionTagOCRService.swift
//  Capture
//
//  N1 — real tag/label OCR. Runs VNRecognizeTextRequest (Vision) over a captured
//  still and tags each text block with the field it most likely belongs to
//  (vendor / SKU / price). Vision compiles AND runs on the iphonesimulator SDK,
//  so no availability gate is needed here; an empty/unreadable frame just yields
//  no observations and the N1 sheet falls through to its R2 manual path.

import Foundation
import CoreGraphics
import ImageIO
import Vision
import CaptureKit

public struct VisionTagOCRService: TagOCRService {
    public init() {}

    public func recognizeText(in image: CaptureImage) async throws -> [OCRObservation] {
        guard let cg = Self.cgImage(from: image.data) else { return [] }

        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true

        let handler = VNImageRequestHandler(cgImage: cg, orientation: .up, options: [:])
        try handler.perform([request])

        let lines: [OCRObservation] = (request.results ?? []).compactMap { obs in
            guard let candidate = obs.topCandidates(1).first else { return nil }
            let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return nil }
            return OCRObservation(
                text: text,
                confidence: Double(candidate.confidence),
                boundingBox: obs.boundingBox,
                suggestedField: nil
            )
        }
        return Self.assignFields(to: lines)
    }

    // MARK: - Field heuristics

    /// Tag the highest-signal lines as price / sku / maker so the N1 card can
    /// light them up in brass. Everything else is returned untyped.
    static func assignFields(to lines: [OCRObservation]) -> [OCRObservation] {
        var sawMaker = false
        // Maker = the highest-confidence line that isn't a price/sku.
        let makerLine = lines
            .filter { classify($0.text) == nil }
            .max(by: { $0.confidence < $1.confidence })?.text

        return lines.map { line in
            if let field = classify(line.text) {
                return line.retagged(field)
            }
            if !sawMaker, line.text == makerLine {
                sawMaker = true
                return line.retagged(.maker)
            }
            return line
        }
    }

    /// Returns a field for price/sku-shaped text, nil otherwise.
    static func classify(_ text: String) -> FieldKey? {
        if isPrice(text) { return .price }
        if isSKU(text) { return .sku }
        return nil
    }

    static func isPrice(_ text: String) -> Bool {
        if text.range(of: #"[$£€]\s?\d"#, options: .regularExpression) != nil { return true }
        if text.range(of: #"^\d[\d,]*\.\d{2}$"#, options: .regularExpression) != nil { return true }
        return false
    }

    static func isSKU(_ text: String) -> Bool {
        let t = text.uppercased()
        // e.g. LQ-3S-OAK, FRO-2213, A1B2-009
        return t.range(of: #"^[A-Z0-9]{2,}(-[A-Z0-9]+)+$"#, options: .regularExpression) != nil
    }

    static func cgImage(from data: Data) -> CGImage? {
        guard !data.isEmpty,
              let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(source, 0, nil)
    }
}

private extension OCRObservation {
    func retagged(_ field: FieldKey) -> OCRObservation {
        OCRObservation(text: text, confidence: confidence, boundingBox: boundingBox, suggestedField: field)
    }
}

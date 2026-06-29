//  HeuristicSmartGuessService.swift
//  Capture
//
//  N5 — on-device smart field guess. Runs Apple Vision's VNClassifyImageRequest
//  over the still, maps the top labels to a SpecimenCategory via a keyword table,
//  then folds in OCR text and scanned codes for material / colour hints. Vision
//  classification compiles AND runs on the iphonesimulator SDK (an empty frame
//  simply yields .unknown), so no availability gate is needed.

import Foundation
import CoreGraphics
import ImageIO
import Vision
import CaptureKit

public struct HeuristicSmartGuessService: SmartGuessService {
    public init() {}

    public func guess(image: CaptureImage, ocr: [OCRObservation], codes: [ScannedCode]) async -> SmartGuess {
        let (category, categoryConfidence) = classifyCategory(image)

        var fields: [FieldSuggestion] = []
        fields.append(FieldSuggestion(key: .category, value: category.rawValue, confidence: categoryConfidence))

        if let material = materialHint(from: ocr) {
            fields.append(FieldSuggestion(key: .material, value: material.value, confidence: material.confidence))
        }
        if let colour = colourHint(from: ocr) {
            fields.append(FieldSuggestion(key: .colorway, value: colour.value, confidence: colour.confidence))
        }

        return SmartGuess(category: category, categoryConfidence: categoryConfidence, fields: fields)
    }

    // MARK: - Vision category classification

    private func classifyCategory(_ image: CaptureImage) -> (SpecimenCategory, Double) {
        guard let cg = cgImage(from: image.data) else { return (.unknown, 0) }
        let request = VNClassifyImageRequest()
        let handler = VNImageRequestHandler(cgImage: cg, orientation: .up, options: [:])
        do {
            try handler.perform([request])
        } catch {
            return (.unknown, 0)
        }
        let observations = (request.results ?? [])
            .filter { $0.confidence > 0.1 }
            .sorted { $0.confidence > $1.confidence }

        for obs in observations {
            if let category = Self.categoryForKeyword(obs.identifier) {
                return (category, Double(obs.confidence))
            }
        }
        return (.unknown, 0)
    }

    static func categoryForKeyword(_ identifier: String) -> SpecimenCategory? {
        let id = identifier.lowercased()
        for (keyword, category) in keywordTable where id.contains(keyword) {
            return category
        }
        return nil
    }

    private static let keywordTable: [(String, SpecimenCategory)] = [
        ("armchair", .seating), ("chair", .seating), ("sofa", .seating), ("couch", .seating),
        ("stool", .seating), ("bench", .seating), ("seat", .seating),
        ("table", .table), ("desk", .table), ("nightstand", .table),
        ("lamp", .lighting), ("light", .lighting), ("chandelier", .lighting), ("sconce", .lighting),
        ("cabinet", .storage), ("shelf", .storage), ("bookcase", .storage), ("dresser", .storage),
        ("wardrobe", .storage), ("credenza", .storage),
        ("rug", .rug), ("carpet", .rug),
        ("curtain", .textile), ("fabric", .textile), ("textile", .textile), ("pillow", .textile),
        ("cushion", .textile), ("drapery", .textile),
        ("vase", .decor), ("bowl", .decor), ("sculpture", .decor), ("mirror", .decor),
        ("painting", .art), ("artwork", .art), ("print", .art),
        ("faucet", .plumbing), ("sink", .plumbing), ("tap", .plumbing),
        ("tile", .tile),
        ("knob", .hardware), ("handle", .hardware), ("hinge", .hardware)
    ]

    // MARK: - OCR-driven hints

    private func materialHint(from ocr: [OCRObservation]) -> (value: String, confidence: Double)? {
        let materials = ["oak", "walnut", "ash", "teak", "marble", "brass", "leather",
                         "bouclé", "boucle", "linen", "velvet", "wool", "cotton", "rattan", "cane"]
        let found = matches(in: ocr, against: materials)
        guard !found.isEmpty else { return nil }
        return (found.map { $0.capitalized }.joined(separator: " / "), 0.55)
    }

    private func colourHint(from ocr: [OCRObservation]) -> (value: String, confidence: Double)? {
        let colours = ["fog", "ivory", "charcoal", "sage", "ochre", "rust", "navy",
                       "cream", "ecru", "olive", "terracotta", "slate"]
        let found = matches(in: ocr, against: colours)
        guard let first = found.first else { return nil }
        return (first.capitalized, 0.5)
    }

    private func matches(in ocr: [OCRObservation], against vocab: [String]) -> [String] {
        let haystack = ocr.map { $0.text.lowercased() }.joined(separator: " ")
        return vocab.filter { haystack.contains($0) }
    }

    private func cgImage(from data: Data) -> CGImage? {
        guard !data.isEmpty,
              let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(source, 0, nil)
    }
}

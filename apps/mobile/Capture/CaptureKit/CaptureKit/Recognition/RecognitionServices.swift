//  RecognitionServices.swift
//  CaptureKit
//
//  Enrich-in-place seams (N1–N5). Value types + async (non-UI) methods live
//  here; the VisionKit/ARKit UIViewControllerRepresentable wrappers are built
//  app-side (Team C) and conform to ScannerPresentable.

import Foundation
import CoreGraphics
import SwiftUI

/// A captured still handed to recognition without leaking UIImage across the seam.
public struct CaptureImage: Sendable {
    public let data: Data
    public let width: Int
    public let height: Int
    public init(data: Data, width: Int, height: Int) {
        self.data = data; self.width = width; self.height = height
    }
}

// ── N1 Tag / label OCR (VisionKit / VNRecognizeTextRequest) ──
public struct OCRObservation: Sendable {
    public let text: String
    public let confidence: Double
    public let boundingBox: CGRect
    public let suggestedField: FieldKey?
    public init(text: String, confidence: Double, boundingBox: CGRect, suggestedField: FieldKey? = nil) {
        self.text = text; self.confidence = confidence
        self.boundingBox = boundingBox; self.suggestedField = suggestedField
    }
}

public protocol TagOCRService: Sendable {
    func recognizeText(in image: CaptureImage) async throws -> [OCRObservation]
}

// ── N2 Barcode / QR (DataScannerViewController) ──
public enum CodeKind: Sendable, Equatable {
    case url(URL), gtin(String), text(String)
}
public struct ScannedCode: Sendable, Equatable {
    public let payload: String
    public let symbology: String
    public let kind: CodeKind
    public init(payload: String, symbology: String, kind: CodeKind) {
        self.payload = payload; self.symbology = symbology; self.kind = kind
    }
}
public protocol CodeScanService: Sendable {
    func parse(_ payload: String, symbology: String) -> ScannedCode
}

// ── N3 Measure (ARKit + manual fallback) ──
public protocol MeasureService: Sendable {
    var isARSupported: Bool { get }
    func manual(axis: MeasurementAxis, millimeters: Double) -> CaptureMeasurement
}

// ── N4 Voice note (Speech, live transcribe) ──
public struct TranscriptChunk: Sendable {
    public let text: String
    public let isFinal: Bool
    public init(text: String, isFinal: Bool) { self.text = text; self.isFinal = isFinal }
}
public struct VoiceNoteResult: Sendable {
    public let transcript: String
    public let audioFilename: String?
    public let durationSeconds: Double
    public init(transcript: String, audioFilename: String?, durationSeconds: Double) {
        self.transcript = transcript; self.audioFilename = audioFilename
        self.durationSeconds = durationSeconds
    }
}
public protocol VoiceNoteService: Sendable {
    func requestAuthorization() async -> Bool
    @MainActor func startLiveTranscription() throws -> AsyncThrowingStream<TranscriptChunk, Error>
    @MainActor func finish() async -> VoiceNoteResult
}

// ── N5 Smart field guess (STUB now; Core ML later) ──
public struct FieldSuggestion: Sendable {
    public let key: FieldKey
    public let value: String
    public let confidence: Double
    public let source: ProvenanceSource
    public init(key: FieldKey, value: String, confidence: Double, source: ProvenanceSource = .smartGuess) {
        self.key = key; self.value = value; self.confidence = confidence; self.source = source
    }
}
public struct SmartGuess: Sendable {
    public let category: SpecimenCategory
    public let categoryConfidence: Double
    public let fields: [FieldSuggestion]
    public init(category: SpecimenCategory, categoryConfidence: Double, fields: [FieldSuggestion]) {
        self.category = category; self.categoryConfidence = categoryConfidence; self.fields = fields
    }
}
public protocol SmartGuessService: Sendable {
    func guess(image: CaptureImage, ocr: [OCRObservation], codes: [ScannedCode]) async -> SmartGuess
}

/// A recognition view (DataScanner/ARKit host) the app builds and the feature presents.
@MainActor
public protocol ScannerPresentable {
    associatedtype Body: View
    @ViewBuilder func makeBody() -> Body
}

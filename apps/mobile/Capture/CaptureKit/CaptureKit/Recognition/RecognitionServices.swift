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
    /// Segment 0. Every shipped reader (payload, store, sync) keeps using this.
    public let audioFilename: String?
    /// Ordered audio segments. Later segments exist only when an interruption
    /// split the note; empty when no audio was written at all.
    public let audioSegments: [String]
    /// Whether recognition actually ran on-device. Recorded, not merely set:
    /// voice.finish reports it, and the shipped permission string promises it.
    public let onDevice: Bool
    public let durationSeconds: Double
    /// The 20-minute / 24-segment cap ended this note, not the designer. The
    /// surfaces read it to say so: §15.4 forbids a silent stop, and the cap is
    /// otherwise indistinguishable from a normal end because it finishes the
    /// stream NORMALLY.
    public let endedAtCap: Bool
    public init(transcript: String, audioFilename: String?,
                audioSegments: [String] = [], onDevice: Bool = false,
                durationSeconds: Double, endedAtCap: Bool = false) {
        self.transcript = transcript
        self.audioFilename = audioFilename
        self.audioSegments = audioSegments.isEmpty
            ? (audioFilename.map { [$0] } ?? [])
            : audioSegments
        self.onDevice = onDevice
        self.durationSeconds = durationSeconds
        self.endedAtCap = endedAtCap
    }
}
public protocol VoiceNoteService: Sendable {
    func requestAuthorization() async -> Bool
    @MainActor func startLiveTranscription() throws -> AsyncThrowingStream<TranscriptChunk, Error>
    @MainActor func finish() async -> VoiceNoteResult
    /// Whether the note that just started is also being TRANSCRIBED. False
    /// when the recognizer is unavailable or unauthorized: §15.4 — the note
    /// still records, and the surface says the honest line instead of a
    /// placeholder promising words that are never coming.
    @MainActor var isTranscribing: Bool { get }
    /// FC-R11: the consent posture the NEXT note starts under. The recorder's
    /// own `voice.start` is the consent rule's ONLY audit trail, so the surface
    /// that knows the posture has to tell the recorder before it starts —
    /// otherwise every conversation note is logged as a solo one.
    @MainActor func setNoteSetting(_ setting: FieldNoteSetting)
}

public extension VoiceNoteService {
    /// A conformer that always transcribes need say nothing.
    @MainActor var isTranscribing: Bool { true }
    /// A surface that never offers the choice records nothing but solo notes,
    /// and a conformer that keeps no telemetry has nothing to record it in.
    @MainActor func setNoteSetting(_ setting: FieldNoteSetting) {}
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

public extension SmartGuess {
    /// The suggestions worth writing onto a record. Drops `.unknown` (which
    /// means "could not tell", not "is unknown") and anything the reader had no
    /// confidence in at all — so a capture never carries a guess nothing
    /// computed. Confidence orders and pre-selects; per ruling 2026-08-24 it
    /// never gates what gets recorded or what counts as confirmed (FC-R12:
    /// nothing auto-applies at any confidence).
    var fieldsWorthRecording: [FieldSuggestion] {
        fields.filter { suggestion in
            guard suggestion.confidence > 0 else { return false }
            guard !suggestion.value.isEmpty else { return false }
            if suggestion.key == .category,
               suggestion.value == SpecimenCategory.unknown.rawValue { return false }
            return true
        }
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

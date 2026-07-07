//  CaptureKitMocks.swift
//  CaptureKitMocks
//
//  In-memory / mock conformer for every CaptureKit seam, so all 33 screens
//  render in the simulator without camera/LiDAR/Speech/network. Wired by
//  AppContainer when -CaptureUseMocks is set; also used by previews + tests.

import Foundation
import CoreGraphics
import CaptureKit

@MainActor
public final class MockCameraService: CameraService {
    public private(set) var currentMode: CameraMode = .photo
    public var isLowLight: Bool = false
    private let sampleHEIC: Data

    public init(sampleHEIC: Data = Data()) { self.sampleHEIC = sampleHEIC }

    public func configure(mode: CameraMode) async throws { currentMode = mode }
    public func start() async {}
    public func stop() {}
    public func setTorch(_ mode: TorchMode) {}
    public func capture() async throws -> CapturedFrame {
        CapturedFrame(data: sampleHEIC, width: 1170, height: 1560, mode: currentMode, isLowLight: isLowLight)
    }
    public var frameState: AsyncStream<CameraFrameState> {
        AsyncStream { continuation in
            continuation.yield(CameraFrameState(roll: 0, pitch: 0, isLevel: true, luma: 0.6))
            continuation.finish()
        }
    }
}

public struct MockTagOCRService: TagOCRService {
    public init() {}
    public func recognizeText(in image: CaptureImage) async throws -> [OCRObservation] {
        [
            OCRObservation(text: "Holloway & Co.", confidence: 0.94,
                           boundingBox: .init(x: 0.1, y: 0.2, width: 0.5, height: 0.06), suggestedField: .maker),
            OCRObservation(text: "LQ-3S-OAK", confidence: 0.91,
                           boundingBox: .init(x: 0.1, y: 0.3, width: 0.4, height: 0.06), suggestedField: .sku),
            OCRObservation(text: "$3,120", confidence: 0.88,
                           boundingBox: .init(x: 0.1, y: 0.4, width: 0.3, height: 0.06), suggestedField: .price)
        ]
    }
}

public struct MockCodeScanService: CodeScanService {
    public init() {}
    public func parse(_ payload: String, symbology: String) -> ScannedCode {
        if let url = URL(string: payload), payload.hasPrefix("http") {
            return ScannedCode(payload: payload, symbology: symbology, kind: .url(url))
        }
        if payload.allSatisfy(\.isNumber) {
            return ScannedCode(payload: payload, symbology: symbology, kind: .gtin(payload))
        }
        return ScannedCode(payload: payload, symbology: symbology, kind: .text(payload))
    }
}

public struct MockMeasureService: MeasureService {
    public init() {}
    public var isARSupported: Bool { false }
    public func manual(axis: MeasurementAxis, millimeters: Double) -> CaptureMeasurement {
        CaptureMeasurement(axisRaw: axis.rawValue, millimeters: millimeters, sourceRaw: MeasureSource.manual.rawValue)
    }
}

public final class MockVoiceNoteService: VoiceNoteService {
    public init() {}
    public func requestAuthorization() async -> Bool { true }
    @MainActor public func startLiveTranscription() throws -> AsyncThrowingStream<TranscriptChunk, Error> {
        AsyncThrowingStream { continuation in
            continuation.yield(TranscriptChunk(text: "Oak base, the warmer bouclé…", isFinal: false))
            continuation.yield(TranscriptChunk(text: "Oak base, the warmer bouclé, rep is Dana.", isFinal: true))
            continuation.finish()
        }
    }
    @MainActor public func finish() async -> VoiceNoteResult {
        VoiceNoteResult(transcript: "Oak base, the warmer bouclé, rep is Dana.",
                        audioFilename: nil, durationSeconds: 6)
    }
}

/// The v0.1 smart-guess stub stand-in for previews (the real heuristic is app-side).
public struct StubSmartGuessService: SmartGuessService {
    public init() {}
    public func guess(image: CaptureImage, ocr: [OCRObservation], codes: [ScannedCode]) async -> SmartGuess {
        SmartGuess(category: .seating, categoryConfidence: 0.72, fields: [
            FieldSuggestion(key: .category, value: SpecimenCategory.seating.rawValue, confidence: 0.72),
            FieldSuggestion(key: .material, value: "Oak / bouclé", confidence: 0.6)
        ])
    }
}

public final class InMemoryCaptureSyncService: CaptureSyncService {
    public init() {}
    public func enqueue(_ specimenID: UUID) async {}
    public func drain() async {}
    public func commit(_ specimenID: UUID) async throws -> CommitReceipt {
        CommitReceipt(remoteId: UUID().uuidString, productId: UUID().uuidString,
                      destination: .library, created: true)
    }
    public func route(_ specimenID: UUID, to destination: CaptureDestination) async throws {}
    public var snapshots: AsyncStream<SyncSnapshot> {
        AsyncStream { $0.yield(SyncSnapshot(queued: 0, uploading: 0, failed: 0)); $0.finish() }
    }
}

@MainActor
public final class MockSessionProviding: SessionProviding {
    public var isAuthenticated: Bool = true
    public var userID: String? = "00000000-0000-0000-0000-000000000001"
    public var workspaceID: String? = "00000000-0000-0000-0000-0000000000aa"
    public var workspaceName: String? = "Walbridge Studio"
    public var userEmail: String? = "ava@walbridge.studio"
    public var displayName: String? = "Ava Walbridge"
    public init() {}
    public func waitForReady() async {}
    public func selectWorkspace(id: String) { workspaceID = id }
    public func signOut() async {
        isAuthenticated = false
        userID = nil
        workspaceID = nil
        workspaceName = nil
    }
}

@MainActor
public final class MockLocationService: LocationService {
    public init() {}
    public func requestWhenInUse() async -> Bool { true }
    public func currentVenue() async -> VenueStamp? {
        VenueStamp(latitude: 35.9707, longitude: -79.9931, accuracyMeters: 8,
                   placemarkName: "High Point · Showroom 214")
    }
}

public struct MockCaptureAnalytics: CaptureAnalytics {
    public init() {}
    public func screen(_ name: String, _ properties: [String: String]) {}
    public func event(_ name: String, _ properties: [String: String]) {}
}

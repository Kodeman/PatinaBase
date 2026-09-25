//  RecognitionScreens.swift
//  Capture
//
//  Team C registrar — Flow 3 "enrich in place" (N1–N4). Wires the four
//  recognition sheets into the RouteRegistry, each binding the real recognition
//  service (Vision / DataScanner / ARKit / Speech) and resolving the piece
//  UUID carried by the sheet case. The smart field guess has no sheet: it runs
//  on the C3 card after the shutter (`ViewfinderModel` → `SmartGuessApplication`).
//  The integration owner adds one line:
//      RecognitionScreens.register(into: r, container: container, coordinator: coordinator)

import SwiftUI
import CaptureKit

enum RecognitionScreens {
    @MainActor
    static func register(into r: RouteRegistry, container: AppContainer, coordinator: CaptureCoordinator) {

        // N1 · .ocr — tag/label OCR (Vision)
        r.registerSheet(CaptureSheet.ocr(UUID()).registryKey) { sheet in
            guard case let .ocr(id) = sheet else { return AnyView(EmptyView()) }
            return AnyView(TagOCRSheet(
                pieceID: id,
                store: container.store,
                session: container.session,
                camera: container.camera,
                ocr: VisionTagOCRService(),
                analytics: container.analytics,
                coordinator: coordinator
            ))
        }

        // N2 · .code — barcode/QR (DataScanner)
        r.registerSheet(CaptureSheet.code(UUID()).registryKey) { sheet in
            guard case let .code(id) = sheet else { return AnyView(EmptyView()) }
            return AnyView(CodeScanSheet(
                pieceID: id,
                store: container.store,
                session: container.session,
                codeService: DataScannerCodeService(),
                analytics: container.analytics,
                coordinator: coordinator
            ))
        }

        // N3 · .measure — AR + manual measure (ARKit)
        r.registerSheet(CaptureSheet.measure(UUID()).registryKey) { sheet in
            guard case let .measure(id) = sheet else { return AnyView(EmptyView()) }
            return AnyView(MeasureSheet(
                pieceID: id,
                store: container.store,
                session: container.session,
                measureService: ARKitMeasureService(),
                analytics: container.analytics,
                coordinator: coordinator
            ))
        }

        // N4 · .voice — live voice note (Speech)
        r.registerSheet(CaptureSheet.voice(UUID()).registryKey) { sheet in
            guard case let .voice(id) = sheet else { return AnyView(EmptyView()) }
            return AnyView(VoiceNoteSheet(
                pieceID: id,
                store: container.store,
                session: container.session,
                voice: SpeechVoiceNoteService(mediaDirectory: container.store.mediaDirectory(),
                                              analytics: container.analytics,
                                              surface: "n4"),
                analytics: container.analytics,
                coordinator: coordinator
            ))
        }
    }
}

//  TagOCRScanner.swift
//  Capture
//
//  N1 — the ScannerPresentable seam for tag/label OCR. The live camera is owned
//  by the CameraService behind the sheet; this renders the brass reticle the
//  designer frames the label inside while VisionTagOCRService reads the still.

import SwiftUI
import CaptureKit

struct TagOCRScanner: ScannerPresentable {
    var prompt: String
    var isReading: Bool

    @ViewBuilder func makeBody() -> some View {
        RecognitionViewport(prompt: prompt, tint: CaptureColor.goldenHour, isActive: isReading)
    }
}

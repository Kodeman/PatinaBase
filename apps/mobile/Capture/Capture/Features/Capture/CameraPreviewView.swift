//  CameraPreviewView.swift
//  Capture
//
//  The C1 live feed: a thin SwiftUI wrapper over an AVCaptureVideoPreviewLayer.
//  The layer *is* the view's backing layer (`layerClass`), so there is no
//  per-frame work here — AVFoundation renders the running session directly.

import SwiftUI
import UIKit
import AVFoundation

struct CameraPreviewView: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        // The backing layer is always the preview layer (see `layerClass`); the
        // `if let` is the non-forced way to reach it. Bound once — no updates.
        if let previewLayer = view.layer as? AVCaptureVideoPreviewLayer {
            previewLayer.session = session
            previewLayer.videoGravity = .resizeAspectFill
        }
        return view
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {}

    // Not `final`: overriding UIView's `class var layerClass` requires the
    // `class` keyword (a `static` override is illegal), which swiftlint's
    // static_over_final_class rule would otherwise reject on a final class.
    class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    }
}

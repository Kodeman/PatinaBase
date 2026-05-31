//
//  RoomCaptureSessionDriver.swift
//  Patina
//
//  Owns the RoomPlan `RoomCaptureView` and drives the underlying
//  RoomCaptureSession + ARSession lifecycle (create / run / stop). Extracted
//  from `RoomCaptureService` (PT-6-2) so the service can compose the session
//  mechanics without owning the RoomPlan/ARKit plumbing directly.
//
//  This type holds NO observable state and performs NO analysis — it is a thin
//  driver around the RoomPlan view and its sessions. `RoomCaptureService`
//  remains the delegate for both `RoomCaptureSession` and `ARSession`; this
//  driver simply wires those delegates and forwards run/stop calls.
//

import Foundation
import UIKit
import RoomPlan
import ARKit

/// Drives the RoomPlan `RoomCaptureView` and its RoomCaptureSession / ARSession
/// lifecycle. Behavior-preserving extraction of the session plumbing previously
/// inlined in `RoomCaptureService`.
@MainActor
final class RoomCaptureSessionDriver {

    /// The capture view — creates and owns the session. Created lazily in
    /// `init` (mirrors the original `setupCaptureView()` in init).
    private(set) var captureView: RoomCaptureView?

    /// Access to the capture session (from the view).
    var captureSession: RoomCaptureSession? {
        captureView?.captureSession
    }

    /// The shared delegate for both the RoomCaptureSession and the ARSession.
    /// Held weakly to avoid a retain cycle with `RoomCaptureService`, which
    /// owns this driver.
    private weak var sessionDelegate: (RoomCaptureSessionDelegate & ARSessionDelegate)?

    /// - Parameter delegate: the object (the `RoomCaptureService` façade) that
    ///   conforms to both `RoomCaptureSessionDelegate` and `ARSessionDelegate`.
    init(delegate: (RoomCaptureSessionDelegate & ARSessionDelegate)?) {
        self.sessionDelegate = delegate
        setupCaptureView()
    }

    // PT-6-7: The container (RoomCaptureViewRepresentable) sizes this view, so
    // creating it at `.zero` avoids depending on `UIScreen.main.bounds` (which
    // is incorrect under multi-scene / unknown-frame-size conditions).
    private func setupCaptureView() {
        // Create view first - it owns the session
        let view = RoomCaptureView(frame: .zero)
        view.captureSession.delegate = sessionDelegate
        captureView = view
    }

    /// Return the RoomCaptureView for embedding in SwiftUI, recreating it if it
    /// somehow became nil.
    func getRoomCaptureView() -> RoomCaptureView {
        guard let view = captureView else {
            // Fallback - create if somehow nil
            setupCaptureView()
            return captureView!
        }
        return view
    }

    /// Run the RoomCaptureSession with a default configuration and wire the
    /// ARSession delegate so frame capture can begin.
    /// - Returns: `true` if the session was started, `false` if the capture
    ///   view was not available.
    @discardableResult
    func run() -> Bool {
        guard let view = captureView else { return false }
        // Configure and start the session from the view
        let config = RoomCaptureSession.Configuration()
        view.captureSession.run(configuration: config)
        // Set up AR session delegate for frame capture
        view.captureSession.arSession.delegate = sessionDelegate
        return true
    }

    /// Stop the running RoomCaptureSession (no-op if the view is nil).
    func stop() {
        captureView?.captureSession.stop()
    }
}

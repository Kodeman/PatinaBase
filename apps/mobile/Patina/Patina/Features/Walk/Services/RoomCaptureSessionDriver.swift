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

    /// The ARSession Patina owns and hands to RoomPlan.
    ///
    /// Created here but deliberately NOT run until `run()`, so the camera still
    /// starts exactly when it did before — at scan start, not at driver init.
    ///
    /// Why we own it at all: `RoomCaptureSession.Configuration` has exactly one
    /// member, `isCoachingEnabled` (verified against the iOS 26.5 SDK
    /// interface). It exposes no scene-reconstruction and no depth knob, so
    /// `sceneReconstruction = .mesh` is unreachable through RoomPlan. Owning
    /// the ARSession is the only way to ask for scene mesh, and
    /// `RoomCaptureView(frame:arSession:)` is Apple's supported seam for it.
    ///
    /// Device readout before this change (iPhone 17 Pro Max, 3623-frame scan):
    /// `sceneDepth=3605 smoothedSceneDepth=3605 meshAnchors=0` — RoomPlan's
    /// default session was already vending depth, but never a mesh anchor, so
    /// `SceneMeshExporter` had nothing to export and the mesh-anchor-fed
    /// coaching hints were dark.
    private let arSession = ARSession()

    // PT-6-7: The container (RoomCaptureViewRepresentable) sizes this view, so
    // creating it at `.zero` avoids depending on `UIScreen.main.bounds` (which
    // is incorrect under multi-scene / unknown-frame-size conditions).
    private func setupCaptureView() {
        // Create view first - it owns the session. Hand it OUR ARSession so the
        // configuration in `makeConfiguration()` is the one that runs.
        let view = RoomCaptureView(frame: .zero, arSession: arSession)
        view.captureSession.delegate = sessionDelegate
        captureView = view
    }

    /// The ARKit configuration Patina runs the shared session with.
    ///
    /// Mirrors Field's `SharedARCaptureRig.makeConfiguration()`. Every capability
    /// is behind its own support check so a non-LiDAR device degrades instead of
    /// throwing.
    ///
    /// ⚠ The frame semantics are NOT optional extras. Before this change depth
    /// arrived for free from RoomPlan's default configuration; the moment we
    /// supply our own, depth becomes our responsibility. Dropping these lines
    /// would trade a dead mesh lane for a dead depth lane.
    ///
    /// `worldAlignment = .gravity` is stated explicitly but is also
    /// `ARWorldTrackingConfiguration`'s default — it is not a change of
    /// coordinate convention, and stored `camera_transform` values keep their
    /// existing meaning.
    static func makeConfiguration() -> ARWorldTrackingConfiguration {
        let config = ARWorldTrackingConfiguration()
        config.worldAlignment = .gravity
        config.planeDetection = [.horizontal, .vertical]

        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
            config.sceneReconstruction = .mesh
        }

        var semantics: ARConfiguration.FrameSemantics = []
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth) {
            semantics.insert(.smoothedSceneDepth)
        }
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
            semantics.insert(.sceneDepth)
        }
        config.frameSemantics = semantics
        return config
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
    /// The ordering below is load-bearing and is Field's, learned the hard way
    /// (`SharedARCaptureRig`):
    ///
    ///   1. Run OUR ARSession with the mesh/depth configuration FIRST, so the
    ///      settings are live before RoomPlan attaches to the same session.
    ///      Apple's contract is that RoomPlan preserves an existing session's
    ///      settings; Field verified that on device on this same iPhone model.
    ///   2. THEN let RoomPlan start.
    ///   3. Claim the frame delegate LAST — after RoomPlan's `run(...)` — so
    ///      RoomPlan cannot overwrite it. A wrong order here does not error; it
    ///      silently kills every frame-fed lane in the app.
    ///
    /// Step 3 was already correct before this change; steps 1 and 2 are new.
    @discardableResult
    func run() -> Bool {
        guard let view = captureView else { return false }
        // 1. Our configuration goes live first.
        arSession.run(Self.makeConfiguration())
        // 2. RoomPlan starts on the session we just configured.
        let config = RoomCaptureSession.Configuration()
        view.captureSession.run(configuration: config)
        // 3. Claim the ARSession delegate last so RoomPlan cannot take it.
        view.captureSession.arSession.delegate = sessionDelegate
        return true
    }

    /// Stop the running RoomCaptureSession (no-op if the view is nil).
    ///
    /// The explicit `pause()` is new and necessary: RoomPlan pauses a session it
    /// created, but this one is ours, so stopping the capture session alone
    /// would leave the camera running after the scan ends. Field pauses for the
    /// same reason. Pausing after `stop()` does not disturb RoomPlan's
    /// post-process, which runs off the captured room, not off live frames.
    func stop() {
        captureView?.captureSession.stop()
        arSession.pause()
    }
}

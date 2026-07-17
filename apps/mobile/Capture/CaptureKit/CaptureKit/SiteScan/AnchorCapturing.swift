//  AnchorCapturing.swift
//  CaptureKit
//
//  The seam the anchor-entry UI (item 6) drives, implemented by the real
//  `RoomPlanScanSession` (raycasts the SHARED rig ARSession) and by
//  `MockScanSession` (scripted points, so the Simulator walk still exercises the
//  step). Kept in CaptureKit so both the app target and CaptureKitMocks conform.
//
//  The tap→raycast→type loop: `tapAnchorPoint` places up to two endpoint taps
//  (a third resets), `pendingSpanMeters` gives the live readout, and `commitAnchor`
//  turns the two points + the typed value into an `AnchorRecord`. Uses CoreGraphics
//  `CGPoint`/`CGSize` for the screen tap (a system framework, ARKit-free).

import Foundation
import CoreGraphics

@MainActor
public protocol AnchorCapturing: AnyObject {

    /// Anchors committed so far.
    var capturedAnchors: [AnchorRecord] { get }
    /// The in-progress endpoint taps (0, 1, or 2 world points, metres).
    var pendingEndpoints: [SIMD3<Float>] { get }
    /// Live tap-to-tap distance once two points are placed (metres), else nil.
    var pendingSpanMeters: Double? { get }

    /// Raycast a screen tap to a world point and append it (max 2; a 3rd clears and
    /// starts over). Returns true on a surface hit. Device: real ARSession raycast;
    /// mock: scripted point.
    @discardableResult
    func tapAnchorPoint(screenPoint: CGPoint, viewport: CGSize) -> Bool

    /// Commit the two pending endpoints + a typed value (mm) as an anchor. Returns
    /// the record, or nil if fewer than two points or a non-positive value.
    @discardableResult
    func commitAnchor(measuredValueMillimetres: Int, label: String) -> AnchorRecord?

    /// Discard the in-progress taps (retap).
    func clearPendingAnchor()

    /// Entering the anchor-entry step: quiesce the depth + posed-photo lanes (A4 —
    /// the scene is static and the user is typing) while keeping the ARSession +
    /// keyframe lane live (deliberate framing near a ground-truth span is high-value
    /// for the P2 solver). Idempotent; a no-op on the mock.
    func beginAnchoringPhase()
}

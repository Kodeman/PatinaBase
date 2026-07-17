//  ContextCapturing.swift
//  CaptureKit
//
//  The seam the F2 context-capture affordance (item 7) uses to grab a detail photo
//  + camera pose from the live session, implemented by `RoomPlanScanSession` (the
//  shared rig's current ARFrame + pose) and `MockScanSession` (a scripted
//  placeholder, so the Simulator walk exercises the flow). The captured media +
//  provenance are then handed to `ContextCaptureService` (the testable enqueue).

import Foundation

/// A captured context-photo frame + its pose (nil pose on non-Pro / mock).
public struct ContextFrameSnapshot: Sendable {
    public let imageData: Data
    public let width: Int
    public let height: Int
    /// Row-major 4×4 camera pose (length 16), or nil when no ARKit pose is available.
    public let poseRowMajor: [Double]?
    public let filenameExtension: String

    public init(imageData: Data, width: Int, height: Int,
                poseRowMajor: [Double]?, filenameExtension: String = "jpg") {
        self.imageData = imageData
        self.width = width
        self.height = height
        self.poseRowMajor = poseRowMajor
        self.filenameExtension = filenameExtension
    }
}

@MainActor
public protocol ContextCapturing: AnyObject {
    /// Stable client-side scan-session id — the provenance correlation key that ties
    /// context captures to this scan run (the remote scan id isn't minted until upload).
    var scanSessionId: String { get }

    /// Grab the current camera frame as a detail photo + pose. Returns nil if no
    /// frame is available (e.g. the session hasn't produced one yet).
    func captureContextFrame() -> ContextFrameSnapshot?
}

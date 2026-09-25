//  CameraService.swift
//  CaptureKit
//
//  The single arbiter of the AVCaptureSession / AVAudioSession / ARSession.
//  Team B (capture), Team C (measure/voice), Team D (torch/low-light) all go
//  through this so they never fight over the capture device.

import Foundation
import CoreGraphics

public enum TorchMode: Sendable { case off, on, auto }

/// Camera permission, as every `CameraService` conformer reports it — a test
/// seam, not a flag. Before this the viewfinder could only read denial by
/// downcasting to the concrete `AVFoundationCameraService`, which a
/// `MockCameraService` never satisfies, so the denied → import path had no
/// way to be driven from a test. `.restricted` (parental controls/MDM) folds
/// into `.denied` at the conformer — both mean "no live feed, offer Settings."
public enum CameraAuthorizationState: Sendable { case notDetermined, authorized, denied }

public struct CapturedFrame: Sendable {
    public let data: Data            // HEIC bytes
    public let width: Int
    public let height: Int
    public let mode: CameraMode
    public let isLowLight: Bool
    public init(data: Data, width: Int, height: Int, mode: CameraMode, isLowLight: Bool) {
        self.data = data; self.width = width; self.height = height
        self.mode = mode; self.isLowLight = isLowLight
    }
}

/// Level/framing telemetry for the C2 guides.
public struct CameraFrameState: Sendable {
    public let roll: Double
    public let pitch: Double
    public let isLevel: Bool
    public let luma: Double          // 0...1, drives R1 low-light affordance
    public init(roll: Double, pitch: Double, isLevel: Bool, luma: Double) {
        self.roll = roll; self.pitch = pitch; self.isLevel = isLevel; self.luma = luma
    }
}

@MainActor
public protocol CameraService: AnyObject {
    /// Owns session teardown/rebuild on a mode switch (Photo↔Tag↔Measure↔Scan).
    func configure(mode: CameraMode) async throws
    func start() async
    func stop()
    func setTorch(_ mode: TorchMode)
    /// Tap shutter — writes a HEIC frame and returns it.
    func capture() async throws -> CapturedFrame
    var currentMode: CameraMode { get }
    var isLowLight: Bool { get }
    var frameState: AsyncStream<CameraFrameState> { get }
    /// Test seam: the denied notice reads this, never a concrete-type cast.
    var authorizationState: CameraAuthorizationState { get }
}

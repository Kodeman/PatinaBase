//  CameraService.swift
//  CaptureKit
//
//  The single arbiter of the AVCaptureSession / AVAudioSession / ARSession.
//  Team B (capture), Team C (measure/voice), Team D (torch/low-light) all go
//  through this so they never fight over the capture device.

import Foundation
import CoreGraphics

public enum TorchMode: Sendable { case off, on, auto }

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
}

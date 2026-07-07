//  AVFoundationCameraService.swift
//  Capture
//
//  The concrete CameraService backed by a real AVCaptureSession + photo output,
//  with CoreMotion level telemetry and a mean-luma low-light read off a video
//  data output. NOT wired into AppContainer yet — the integrator switches
//  AppContainer.camera from MockCameraService to this once camera entitlements
//  and the just-in-time permission prime (O3) are in place.
//
//  Simulator note: AVCaptureDevice.default(...) returns nil on the simulator, so
//  the session never starts and `capture()` throws `.unavailable`. Everything
//  here still compiles against the iOS simulator SDK; no device-only framework
//  (ARKit / DataScanner / Speech / ActivityKit) is used, so no availability
//  gating is required — only graceful nil handling.

import Foundation
import AVFoundation
import CoreMotion
import CoreVideo
import CaptureKit

enum AVFoundationCameraError: Error, Sendable {
    case unavailable        // no capture device (e.g. simulator) or session not running
    case encodingFailed     // photo produced no file data
}

/// Real camera. `@MainActor` to satisfy the `CameraService` seam; all hardware
/// work is delegated to `CaptureCameraEngine` on its own serial queue.
@MainActor
public final class AVFoundationCameraService: NSObject, CameraService {
    public private(set) var currentMode: CameraMode = .photo
    public private(set) var isLowLight: Bool = false

    public let frameState: AsyncStream<CameraFrameState>
    private let frameContinuation: AsyncStream<CameraFrameState>.Continuation
    private let engine = CaptureCameraEngine()

    public override init() {
        var continuation: AsyncStream<CameraFrameState>.Continuation!
        self.frameState = AsyncStream(bufferingPolicy: .bufferingNewest(1)) { continuation = $0 }
        self.frameContinuation = continuation
        super.init()

        // Level telemetry can be yielded from any thread — the continuation is Sendable.
        engine.onFrameState = { [frameContinuation] state in
            frameContinuation.yield(state)
        }
        // Low-light is read on the MainActor by callers, so hop back.
        engine.onLowLightChange = { [weak self] low in
            Task { @MainActor in self?.isLowLight = low }
        }
        engine.configureSession()
    }

    public func configure(mode: CameraMode) async throws {
        // Photo/Tag/Scan share the wide-angle back camera; Measure swaps to ARKit
        // app-side (Team C). We only record the active mode here so each frame is
        // stamped with how it was shot.
        currentMode = mode
    }

    public func start() async { engine.start() }
    public func stop() { engine.stop() }
    public func setTorch(_ mode: TorchMode) { engine.setTorch(mode) }

    public func capture() async throws -> CapturedFrame {
        let mode = currentMode
        return try await withCheckedThrowingContinuation { cont in
            engine.capturePhoto(mode: mode) { result in
                cont.resume(with: result)
            }
        }
    }
}

// MARK: - Hardware engine (off the main actor)

/// Owns the AVCaptureSession and all the things that must run off the main
/// thread. `@unchecked Sendable`: its mutable state is confined to `sessionQueue`
/// or guarded by `lock`, and the AVFoundation objects are only touched there.
private final class CaptureCameraEngine: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, @unchecked Sendable {
    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private let videoOutput = AVCaptureVideoDataOutput()
    private let sessionQueue = DispatchQueue(label: "cloud.patina.field.camera.session")
    private let videoQueue = DispatchQueue(label: "cloud.patina.field.camera.video")
    private let motion = CMMotionManager()
    private let motionQueue = OperationQueue()

    private let lock = NSLock()
    private var luma: Double = 0.5
    private var lowLight = false

    private var deviceInput: AVCaptureDeviceInput?
    private var retainedDelegate: AVCapturePhotoCaptureDelegate?

    var onFrameState: ((CameraFrameState) -> Void)?
    var onLowLightChange: ((Bool) -> Void)?

    func configureSession() {
        sessionQueue.async { [self] in
            session.beginConfiguration()
            session.sessionPreset = .photo

            if let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
               let input = try? AVCaptureDeviceInput(device: device),
               session.canAddInput(input) {
                session.addInput(input)
                deviceInput = input
            }

            if session.canAddOutput(photoOutput) {
                session.addOutput(photoOutput)
            }

            videoOutput.videoSettings = [
                kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_420YpCbCr8BiPlanarFullRange)
            ]
            videoOutput.alwaysDiscardsLateVideoFrames = true
            videoOutput.setSampleBufferDelegate(self, queue: videoQueue)
            if session.canAddOutput(videoOutput) {
                session.addOutput(videoOutput)
            }

            session.commitConfiguration()
        }
    }

    func start() {
        sessionQueue.async { [self] in
            if !session.isRunning { session.startRunning() }
        }
        startMotion()
    }

    func stop() {
        sessionQueue.async { [self] in
            if session.isRunning { session.stopRunning() }
        }
        motion.stopDeviceMotionUpdates()
    }

    func setTorch(_ mode: TorchMode) {
        sessionQueue.async { [self] in
            guard let device = deviceInput?.device, device.hasTorch,
                  (try? device.lockForConfiguration()) != nil else { return }
            switch mode {
            case .off:  device.torchMode = .off
            case .auto: device.torchMode = .auto
            case .on:   try? device.setTorchModeOn(level: 1.0)
            }
            device.unlockForConfiguration()
        }
    }

    func capturePhoto(mode: CameraMode, completion: @escaping (Result<CapturedFrame, Error>) -> Void) {
        sessionQueue.async { [self] in
            guard session.isRunning, deviceInput != nil else {
                completion(.failure(AVFoundationCameraError.unavailable)); return
            }
            let settings = makeSettings()
            let low = currentLowLight()
            let delegate = PhotoCaptureDelegate(mode: mode, isLowLight: low) { [weak self] result in
                completion(result)
                self?.sessionQueue.async { self?.retainedDelegate = nil }
            }
            retainedDelegate = delegate                        // output holds the delegate weakly
            photoOutput.capturePhoto(with: settings, delegate: delegate)
        }
    }

    private func makeSettings() -> AVCapturePhotoSettings {
        if photoOutput.availablePhotoCodecTypes.contains(.hevc) {
            return AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.hevc])
        }
        return AVCapturePhotoSettings()
    }

    private func currentLowLight() -> Bool {
        lock.lock(); defer { lock.unlock() }
        return lowLight
    }

    // MARK: Level telemetry

    private func startMotion() {
        guard motion.isDeviceMotionAvailable else { return }
        motion.deviceMotionUpdateInterval = 1.0 / 30.0
        motion.startDeviceMotionUpdates(to: motionQueue) { [weak self] deviceMotion, _ in
            guard let self, let dm = deviceMotion else { return }
            let roll = dm.attitude.roll
            let pitch = dm.attitude.pitch
            let level = abs(roll) < 0.04 && abs(pitch) < 0.06
            let luma: Double = { self.lock.lock(); defer { self.lock.unlock() }; return self.luma }()
            self.onFrameState?(CameraFrameState(roll: roll, pitch: pitch, isLevel: level, luma: luma))
        }
    }

    // MARK: Mean-luma low-light read

    func captureOutput(_ output: AVCaptureOutput,
                       didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0) else { return }

        let width = CVPixelBufferGetWidthOfPlane(pixelBuffer, 0)
        let height = CVPixelBufferGetHeightOfPlane(pixelBuffer, 0)
        let bytesPerRow = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
        let ptr = base.assumingMemoryBound(to: UInt8.self)

        let stepX = max(width / 16, 1)
        let stepY = max(height / 16, 1)
        var total = 0, count = 0
        var y = 0
        while y < height {
            var x = 0
            while x < width {
                total += Int(ptr[y * bytesPerRow + x]); count += 1
                x += stepX
            }
            y += stepY
        }
        guard count > 0 else { return }

        let meanLuma = Double(total) / Double(count) / 255.0
        let low = meanLuma < 0.18
        var changed = false
        lock.lock()
        luma = meanLuma
        if low != lowLight { lowLight = low; changed = true }
        lock.unlock()
        if changed { onLowLightChange?(low) }
    }
}

// MARK: - Photo delegate

/// File-scoped one-shot delegate; AVCapturePhotoOutput retains it only weakly so
/// the engine keeps a strong ref until `didFinishProcessingPhoto`.
private final class PhotoCaptureDelegate: NSObject, AVCapturePhotoCaptureDelegate, @unchecked Sendable {
    private let mode: CameraMode
    private let isLowLight: Bool
    private let completion: (Result<CapturedFrame, Error>) -> Void

    init(mode: CameraMode, isLowLight: Bool, completion: @escaping (Result<CapturedFrame, Error>) -> Void) {
        self.mode = mode
        self.isLowLight = isLowLight
        self.completion = completion
    }

    func photoOutput(_ output: AVCapturePhotoOutput,
                     didFinishProcessingPhoto photo: AVCapturePhoto,
                     error: Error?) {
        if let error { completion(.failure(error)); return }
        guard let data = photo.fileDataRepresentation() else {
            completion(.failure(AVFoundationCameraError.encodingFailed)); return
        }
        let dimensions = photo.resolvedSettings.photoDimensions
        completion(.success(CapturedFrame(
            data: data,
            width: Int(dimensions.width),
            height: Int(dimensions.height),
            mode: mode,
            isLowLight: isLowLight
        )))
    }
}

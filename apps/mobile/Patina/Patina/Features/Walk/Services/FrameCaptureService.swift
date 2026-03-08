//
//  FrameCaptureService.swift
//  Patina
//
//  Created for Hero Frame feature
//

import Foundation
import ARKit
import Combine
import CoreMotion
import UIKit
import os.log

/// Service responsible for capturing, scoring, and selecting hero frames during AR Walk sessions.
/// Frames are captured at regular intervals and scored on quality metrics to select the best one.
@MainActor
public final class FrameCaptureService: ObservableObject {

    // MARK: - Published Properties

    /// Candidate frames captured during the current session (in-memory only)
    @Published public private(set) var candidateFrames: [CapturedFrame] = []

    /// The selected hero frame after scoring
    @Published public private(set) var selectedHeroFrame: CapturedFrame?

    /// Current capture state
    @Published public private(set) var isCapturing = false

    /// Number of frames captured in current session
    @Published public private(set) var captureCount: Int = 0

    // MARK: - Configuration

    /// Maximum number of candidate frames to store
    private let maxFrames = 20

    /// Minimum interval between captures (seconds)
    private let captureInterval: TimeInterval = 2.0

    /// Target HEIC compression quality (0-1)
    private let compressionQuality: CGFloat = 0.8

    /// Target image dimension (longest side)
    private let targetImageSize: CGFloat = 1080

    // MARK: - Private Properties

    private var lastCaptureTime: Date?
    private let motionManager = CMMotionManager()
    private var currentGyroMotion: Float = 0
    public let scoringEngine = FrameScoringEngine()
    private let logger = Logger(subsystem: "com.patina.app", category: "FrameCapture")

    // MARK: - Initialization

    public init() {
        setupMotionManager()
    }

    deinit {
        motionManager.stopDeviceMotionUpdates()
    }

    // MARK: - Public Methods

    /// Starts the frame capture session.
    public func startCapture() {
        guard !isCapturing else { return }

        isCapturing = true
        candidateFrames = []
        selectedHeroFrame = nil
        captureCount = 0
        lastCaptureTime = nil

        startMotionUpdates()
        logger.info("Frame capture session started")
    }

    /// Stops the frame capture session.
    public func stopCapture() {
        guard isCapturing else { return }

        isCapturing = false
        stopMotionUpdates()
        logger.info("Frame capture session stopped with \(self.captureCount) frames")
    }

    /// Attempts to capture a frame from the current AR session.
    /// - Parameter arFrame: The current ARFrame from the session
    /// - Returns: True if a frame was captured, false if skipped (too soon or max reached)
    @discardableResult
    public func captureFrame(from arFrame: ARFrame) async -> Bool {
        guard isCapturing else { return false }
        guard candidateFrames.count < maxFrames else {
            logger.debug("Max frames reached, skipping capture")
            return false
        }

        // Check time interval
        let now = Date()
        if let lastTime = lastCaptureTime,
           now.timeIntervalSince(lastTime) < captureInterval {
            return false
        }

        // Capture the frame
        let frame = await processARFrame(arFrame)
        guard frame.imageData != nil else {
            logger.warning("Failed to process AR frame")
            return false
        }

        candidateFrames.append(frame)
        captureCount += 1
        lastCaptureTime = now

        logger.debug("Captured frame \(self.captureCount)/\(self.maxFrames)")
        return true
    }

    /// Scores all captured frames and selects the best one.
    /// - Returns: The selected hero frame, or nil if no frames meet quality threshold
    public func scoreAndSelectHeroFrame() async -> CapturedFrame? {
        guard !candidateFrames.isEmpty else {
            logger.warning("No frames to score")
            return nil
        }

        logger.info("Scoring \(self.candidateFrames.count) frames")

        // Score all frames
        let scoredFrames = await scoringEngine.scoreFrames(candidateFrames)
        candidateFrames = scoredFrames

        // Log scoring results
        for frame in scoredFrames {
            logger.debug("\(frame.debugDescription)")
        }

        // Select best frame
        if let bestFrame = scoringEngine.selectBestFrame(from: scoredFrames) {
            selectedHeroFrame = bestFrame
            logger.info("Selected hero frame with score: \(String(format: "%.2f", bestFrame.totalScore))")
            return bestFrame
        } else {
            // No frames meet threshold - select highest scoring anyway
            if let fallback = scoredFrames.max(by: { $0.totalScore < $1.totalScore }) {
                selectedHeroFrame = fallback
                logger.warning("No frames meet quality threshold, using best available: \(String(format: "%.2f", fallback.totalScore))")
                return fallback
            }
        }

        logger.error("Failed to select any hero frame")
        return nil
    }

    /// Exports the selected hero frame as HEIC data.
    /// - Returns: HEIC compressed image data, or nil if no frame selected
    public func exportHeroFrame() -> Data? {
        guard let frame = selectedHeroFrame else {
            logger.warning("No hero frame selected for export")
            return nil
        }
        return frame.imageData
    }

    /// Clears candidate frames from memory (called after selection to free memory).
    public func clearCandidates() {
        let count = candidateFrames.count
        candidateFrames = []

        // Keep only the selected frame
        if selectedHeroFrame != nil {
            logger.info("Cleared \(count) candidate frames, keeping hero frame")
        } else {
            logger.info("Cleared \(count) candidate frames")
        }
    }

    /// Resets the service for a new session.
    public func reset() {
        stopCapture()
        candidateFrames = []
        selectedHeroFrame = nil
        captureCount = 0
        lastCaptureTime = nil
    }

    // MARK: - Private Methods

    private func setupMotionManager() {
        motionManager.deviceMotionUpdateInterval = 0.1  // 10 Hz
    }

    private func startMotionUpdates() {
        guard motionManager.isDeviceMotionAvailable else {
            logger.warning("Device motion not available")
            return
        }

        motionManager.startDeviceMotionUpdates(to: .main) { [weak self] motion, error in
            guard let self = self, let motion = motion else { return }

            // Calculate total rotational velocity (rad/s)
            let rotationRate = motion.rotationRate
            let totalMotion = sqrt(
                pow(rotationRate.x, 2) +
                pow(rotationRate.y, 2) +
                pow(rotationRate.z, 2)
            )
            self.currentGyroMotion = Float(totalMotion)
        }
    }

    private func stopMotionUpdates() {
        motionManager.stopDeviceMotionUpdates()
    }

    /// Processes an ARFrame into a CapturedFrame with compressed image data.
    private func processARFrame(_ arFrame: ARFrame) async -> CapturedFrame {
        // Get light estimate
        let lightEstimate = arFrame.lightEstimate?.ambientIntensity ?? 1000

        // Create frame with metadata
        var frame = CapturedFrame(
            orientation: UIDevice.current.orientation,
            lightEstimate: Float(lightEstimate),
            gyroMotion: currentGyroMotion
        )

        // Convert ARFrame pixel buffer to UIImage
        let pixelBuffer = arFrame.capturedImage
        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)

        // Apply orientation correction
        let orientedImage = ciImage.oriented(forExifOrientation: imageOrientationForDeviceOrientation())

        // Resize for storage efficiency
        let resizedImage = resizeImage(orientedImage, targetSize: targetImageSize)

        // Convert to UIImage and compress to HEIC
        let context = CIContext()
        if let cgImage = context.createCGImage(resizedImage, from: resizedImage.extent) {
            let uiImage = UIImage(cgImage: cgImage)

            // Compress to HEIC
            if let heicData = uiImage.heicData(compressionQuality: compressionQuality) {
                frame.imageData = heicData
                logger.debug("Compressed frame to \(heicData.count / 1024)KB HEIC")
            } else if let jpegData = uiImage.jpegData(compressionQuality: compressionQuality) {
                // Fallback to JPEG if HEIC fails
                frame.imageData = jpegData
                logger.debug("Compressed frame to \(jpegData.count / 1024)KB JPEG (HEIC fallback)")
            }
        }

        return frame
    }

    /// Resizes a CIImage to fit within target dimensions while maintaining aspect ratio.
    private func resizeImage(_ image: CIImage, targetSize: CGFloat) -> CIImage {
        let extent = image.extent
        let maxDimension = max(extent.width, extent.height)

        guard maxDimension > targetSize else {
            return image  // Already small enough
        }

        let scale = targetSize / maxDimension
        return image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    }

    /// Returns the EXIF orientation value for the current device orientation.
    private func imageOrientationForDeviceOrientation() -> Int32 {
        switch UIDevice.current.orientation {
        case .portrait:
            return 6  // Rotate 90° CW
        case .portraitUpsideDown:
            return 8  // Rotate 90° CCW
        case .landscapeLeft:
            return 1  // Normal
        case .landscapeRight:
            return 3  // Rotate 180°
        default:
            return 6  // Default to portrait
        }
    }
}

// MARK: - UIImage HEIC Extension

private extension UIImage {
    /// Compresses the image to HEIC format.
    /// - Parameter compressionQuality: Quality from 0-1
    /// - Returns: HEIC data or nil if encoding fails
    func heicData(compressionQuality: CGFloat) -> Data? {
        guard let cgImage = self.cgImage else { return nil }

        let mutableData = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(
            mutableData,
            "public.heic" as CFString,
            1,
            nil
        ) else {
            return nil
        }

        let options: [CFString: Any] = [
            kCGImageDestinationLossyCompressionQuality: compressionQuality
        ]

        CGImageDestinationAddImage(destination, cgImage, options as CFDictionary)

        guard CGImageDestinationFinalize(destination) else {
            return nil
        }

        return mutableData as Data
    }
}

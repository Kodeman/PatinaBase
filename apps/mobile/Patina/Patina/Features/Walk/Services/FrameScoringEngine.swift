//
//  FrameScoringEngine.swift
//  Patina
//
//  Created for Hero Frame feature
//

import Foundation
import CoreImage
import CoreImage.CIFilterBuiltins
import UIKit
import Accelerate

/// Analyzes captured frames and computes quality scores for hero frame selection.
/// Uses Core Image for GPU-accelerated image analysis.
public actor FrameScoringEngine {

    // MARK: - Properties

    private let context: CIContext

    // MARK: - Scoring Thresholds

    /// Laplacian variance thresholds for sharpness scoring
    private let sharpnessIdealVariance: Float = 500
    private let sharpnessRejectVariance: Float = 100

    /// Brightness histogram thresholds
    private let brightnessIdealRange: ClosedRange<Float> = 0.35...0.65
    private let brightnessAcceptableRange: ClosedRange<Float> = 0.15...0.85

    /// Gyro motion threshold for stability (rad/s)
    private let motionIdealThreshold: Float = 0.1
    private let motionRejectThreshold: Float = 0.5

    // MARK: - Initialization

    public init() {
        // Use Metal for GPU acceleration when available
        if let device = MTLCreateSystemDefaultDevice() {
            self.context = CIContext(mtlDevice: device)
        } else {
            self.context = CIContext()
        }
    }

    // MARK: - Public Scoring Methods

    /// Scores a single captured frame on all quality metrics.
    /// - Parameter frame: The frame to score
    /// - Returns: A frame with all scores populated
    func scoreFrame(_ frame: CapturedFrame) async -> CapturedFrame {
        var scoredFrame = frame

        guard let imageData = frame.imageData,
              let uiImage = UIImage(data: imageData),
              let ciImage = CIImage(image: uiImage) else {
            // Return frame with zero scores if image data is invalid
            scoredFrame.setScores(sharpness: 0, brightness: 0, composition: 0, stability: 0)
            return scoredFrame
        }

        // Compute each score
        let sharpness = await computeSharpnessScore(ciImage)
        let brightness = await computeBrightnessScore(ciImage)
        let composition = await computeCompositionScore(ciImage)
        let stability = computeStabilityScore(gyroMotion: frame.gyroMotion)

        scoredFrame.setScores(
            sharpness: sharpness,
            brightness: brightness,
            composition: composition,
            stability: stability
        )

        return scoredFrame
    }

    /// Scores multiple frames in parallel.
    /// - Parameter frames: Array of frames to score
    /// - Returns: Array of scored frames
    public func scoreFrames(_ frames: [CapturedFrame]) async -> [CapturedFrame] {
        await withTaskGroup(of: CapturedFrame.self) { group in
            for frame in frames {
                group.addTask {
                    await self.scoreFrame(frame)
                }
            }

            var scoredFrames: [CapturedFrame] = []
            for await scoredFrame in group {
                scoredFrames.append(scoredFrame)
            }

            // Maintain original order by sorting by timestamp
            return scoredFrames.sorted { $0.timestamp < $1.timestamp }
        }
    }

    /// Selects the best frame from a collection of scored frames.
    /// - Parameter frames: Array of scored frames
    /// - Returns: The best frame, or nil if no frames meet quality threshold
    nonisolated public func selectBestFrame(from frames: [CapturedFrame]) -> CapturedFrame? {
        frames
            .filter { $0.meetsQualityThreshold }
            .max(by: { $0.totalScore < $1.totalScore })
    }

    // MARK: - Individual Score Computations

    /// Computes sharpness score using Laplacian variance method.
    /// Higher variance indicates sharper edges (less blur).
    private func computeSharpnessScore(_ image: CIImage) async -> Float {
        // Apply Laplacian filter to detect edges
        let laplacian = CIFilter.convolution3X3()
        laplacian.inputImage = image
        // Laplacian kernel: detects edges by computing second derivative
        laplacian.weights = CIVector(values: [0, 1, 0, 1, -4, 1, 0, 1, 0], count: 9)
        laplacian.bias = 0

        guard let outputImage = laplacian.outputImage else {
            return 0
        }

        // Compute variance of the Laplacian output
        let variance = computeImageVariance(outputImage)

        // Normalize variance to 0-1 score
        // Higher variance = sharper image
        if variance < sharpnessRejectVariance {
            return 0
        } else if variance >= sharpnessIdealVariance {
            return 1.0
        } else {
            // Linear interpolation between reject and ideal
            let normalized = (variance - sharpnessRejectVariance) / (sharpnessIdealVariance - sharpnessRejectVariance)
            return min(1.0, max(0, normalized))
        }
    }

    /// Computes brightness score from image histogram.
    /// Ideal brightness is mid-range (0.5), penalizes too dark or too bright.
    private func computeBrightnessScore(_ image: CIImage) async -> Float {
        // Calculate average luminance
        let averageLuminance = computeAverageLuminance(image)

        // Score based on distance from ideal (0.5)
        let idealBrightness: Float = 0.5

        if brightnessIdealRange.contains(averageLuminance) {
            // Within ideal range: high score
            let distance = abs(averageLuminance - idealBrightness)
            return 1.0 - (distance / 0.15) * 0.2  // Small penalty within ideal range
        } else if brightnessAcceptableRange.contains(averageLuminance) {
            // Outside ideal but acceptable
            let idealEdge = averageLuminance < idealBrightness ? brightnessIdealRange.lowerBound : brightnessIdealRange.upperBound
            let acceptableEdge = averageLuminance < idealBrightness ? brightnessAcceptableRange.lowerBound : brightnessAcceptableRange.upperBound
            let distance = abs(averageLuminance - idealEdge)
            let maxDistance = abs(acceptableEdge - idealEdge)
            return 0.8 - (distance / maxDistance) * 0.5  // Score from 0.8 down to 0.3
        } else {
            // Outside acceptable range
            return 0.1
        }
    }

    /// Computes composition score based on feature distribution.
    /// Good composition has features spread across all quadrants.
    private func computeCompositionScore(_ image: CIImage) async -> Float {
        // Use edge detection to find features
        let edges = CIFilter.edges()
        edges.inputImage = image
        edges.intensity = 1.0

        guard let edgeImage = edges.outputImage else {
            return 0.5  // Default middle score if analysis fails
        }

        // Analyze feature distribution across quadrants
        let extent = edgeImage.extent
        let quadrants = [
            CGRect(x: extent.minX, y: extent.midY, width: extent.width/2, height: extent.height/2),  // Top-left
            CGRect(x: extent.midX, y: extent.midY, width: extent.width/2, height: extent.height/2),  // Top-right
            CGRect(x: extent.minX, y: extent.minY, width: extent.width/2, height: extent.height/2),  // Bottom-left
            CGRect(x: extent.midX, y: extent.minY, width: extent.width/2, height: extent.height/2)   // Bottom-right
        ]

        var quadrantScores: [Float] = []
        for quadrant in quadrants {
            let cropped = edgeImage.cropped(to: quadrant)
            let intensity = computeAverageLuminance(cropped)
            quadrantScores.append(intensity)
        }

        // Good composition: all quadrants have some features
        // Calculate variance of quadrant intensities (lower = more even distribution)
        let mean = quadrantScores.reduce(0, +) / Float(quadrantScores.count)
        let variance = quadrantScores.reduce(0) { $0 + pow($1 - mean, 2) } / Float(quadrantScores.count)

        // Also check that there are features (not a blank image)
        let totalIntensity = mean

        if totalIntensity < 0.01 {
            // Very few features detected
            return 0.3
        }

        // Lower variance = better distribution = higher score
        // Normalize: variance of 0 = score 1.0, variance of 0.1 = score 0.5
        let distributionScore = max(0, 1.0 - (variance * 5))

        // Combine feature presence and distribution
        return min(1.0, distributionScore * 0.7 + min(totalIntensity * 3, 0.3))
    }

    /// Computes stability score from gyroscope motion data.
    /// Lower motion during capture = higher stability = less motion blur.
    private func computeStabilityScore(gyroMotion: Float) -> Float {
        if gyroMotion <= motionIdealThreshold {
            return 1.0
        } else if gyroMotion >= motionRejectThreshold {
            return 0
        } else {
            // Linear interpolation
            let normalized = (gyroMotion - motionIdealThreshold) / (motionRejectThreshold - motionIdealThreshold)
            return 1.0 - normalized
        }
    }

    // MARK: - Helper Methods

    /// Computes the variance of pixel intensities in an image.
    private func computeImageVariance(_ image: CIImage) -> Float {
        // Render to bitmap for analysis
        let extent = image.extent
        guard extent.width > 0, extent.height > 0 else { return 0 }

        // Scale down for performance
        let scale = min(1.0, 200.0 / max(extent.width, extent.height))
        let scaledImage = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let scaledExtent = scaledImage.extent

        let width = Int(scaledExtent.width)
        let height = Int(scaledExtent.height)
        guard width > 0, height > 0 else { return 0 }

        var bitmap = [UInt8](repeating: 0, count: width * height)
        context.render(
            scaledImage,
            toBitmap: &bitmap,
            rowBytes: width,
            bounds: scaledExtent,
            format: .L8,
            colorSpace: CGColorSpaceCreateDeviceGray()
        )

        // Convert to float and compute variance
        let floatPixels = bitmap.map { Float($0) }
        let mean = floatPixels.reduce(0, +) / Float(floatPixels.count)
        let variance = floatPixels.reduce(0) { $0 + pow($1 - mean, 2) } / Float(floatPixels.count)

        return variance
    }

    /// Computes the average luminance of an image (0-1).
    private func computeAverageLuminance(_ image: CIImage) -> Float {
        let extent = image.extent
        guard extent.width > 0, extent.height > 0 else { return 0.5 }

        // Use CIAreaAverage for efficient mean calculation
        let areaAverage = CIFilter.areaAverage()
        areaAverage.inputImage = image
        areaAverage.extent = extent

        guard let outputImage = areaAverage.outputImage else {
            return 0.5
        }

        // Render single pixel result
        var pixel = [UInt8](repeating: 0, count: 4)
        context.render(
            outputImage,
            toBitmap: &pixel,
            rowBytes: 4,
            bounds: CGRect(x: 0, y: 0, width: 1, height: 1),
            format: .RGBA8,
            colorSpace: CGColorSpaceCreateDeviceRGB()
        )

        // Convert RGB to luminance
        let r = Float(pixel[0]) / 255.0
        let g = Float(pixel[1]) / 255.0
        let b = Float(pixel[2]) / 255.0

        // Standard luminance formula
        return 0.299 * r + 0.587 * g + 0.114 * b
    }
}

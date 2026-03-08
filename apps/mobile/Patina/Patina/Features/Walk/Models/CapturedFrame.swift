//
//  CapturedFrame.swift
//  Patina
//
//  Created for Hero Frame feature
//

import Foundation
import UIKit

/// Represents a single frame captured during the AR Walk session.
/// Frames are scored based on quality metrics and the best one is selected as the hero frame.
public struct CapturedFrame: Codable, Identifiable {
    public let id: UUID
    public let timestamp: Date
    public let orientationRawValue: Int
    public let lightEstimate: Float
    public let gyroMotion: Float

    /// HEIC compressed image data (~200KB target)
    public var imageData: Data?

    // MARK: - Scoring Metadata

    /// Sharpness score from Laplacian variance (0-1)
    public var sharpnessScore: Float?

    /// Brightness score from histogram analysis (0-1, ideal is 0.5)
    public var brightnessScore: Float?

    /// Composition score from feature point spread (0-1)
    public var compositionScore: Float?

    /// Stability score from gyro motion (0-1, inverse of motion)
    public var stabilityScore: Float?

    // MARK: - Computed Properties

    public var orientation: UIDeviceOrientation {
        UIDeviceOrientation(rawValue: orientationRawValue) ?? .portrait
    }

    /// Weighted total quality score
    /// Weights: Sharpness 30%, Brightness 25%, Composition 25%, Stability 20%
    public var totalScore: Float {
        guard let s = sharpnessScore,
              let b = brightnessScore,
              let c = compositionScore,
              let st = stabilityScore else {
            return 0
        }
        return (s * 0.30) + (b * 0.25) + (c * 0.25) + (st * 0.20)
    }

    /// Whether all quality scores have been computed
    public var isScored: Bool {
        sharpnessScore != nil &&
        brightnessScore != nil &&
        compositionScore != nil &&
        stabilityScore != nil
    }

    /// Whether this frame meets minimum quality thresholds
    public var meetsQualityThreshold: Bool {
        guard isScored else { return false }

        // Reject if sharpness is too low (likely motion blur)
        guard let sharpness = sharpnessScore, sharpness >= 0.2 else { return false }

        // Reject if brightness is extreme (too dark or too bright)
        guard let brightness = brightnessScore,
              brightness >= 0.15 && brightness <= 0.85 else { return false }

        // Reject if motion was too high during capture
        guard let stability = stabilityScore, stability >= 0.3 else { return false }

        return true
    }

    // MARK: - Initialization

    public init(
        id: UUID = UUID(),
        timestamp: Date = Date(),
        orientation: UIDeviceOrientation,
        lightEstimate: Float,
        gyroMotion: Float,
        imageData: Data? = nil
    ) {
        self.id = id
        self.timestamp = timestamp
        self.orientationRawValue = orientation.rawValue
        self.lightEstimate = lightEstimate
        self.gyroMotion = gyroMotion
        self.imageData = imageData
    }

    // MARK: - Mutating Methods

    /// Updates all quality scores at once
    public mutating func setScores(
        sharpness: Float,
        brightness: Float,
        composition: Float,
        stability: Float
    ) {
        self.sharpnessScore = sharpness
        self.brightnessScore = brightness
        self.compositionScore = composition
        self.stabilityScore = stability
    }
}

// MARK: - Quality Grade

extension CapturedFrame {
    /// Quality grade based on total score
    public enum QualityGrade: String {
        case excellent  // >= 0.8
        case good       // >= 0.6
        case acceptable // >= 0.4
        case poor       // < 0.4

        public var description: String {
            switch self {
            case .excellent: return "Excellent quality"
            case .good: return "Good quality"
            case .acceptable: return "Acceptable quality"
            case .poor: return "Poor quality"
            }
        }
    }

    public var qualityGrade: QualityGrade {
        let score = totalScore
        switch score {
        case 0.8...: return .excellent
        case 0.6..<0.8: return .good
        case 0.4..<0.6: return .acceptable
        default: return .poor
        }
    }
}

// MARK: - Comparable

extension CapturedFrame: Comparable {
    public static func < (lhs: CapturedFrame, rhs: CapturedFrame) -> Bool {
        lhs.totalScore < rhs.totalScore
    }
}

// MARK: - Debug Description

extension CapturedFrame: CustomDebugStringConvertible {
    public var debugDescription: String {
        """
        CapturedFrame(
            id: \(id.uuidString.prefix(8)),
            timestamp: \(timestamp),
            totalScore: \(String(format: "%.2f", totalScore)),
            grade: \(qualityGrade.rawValue),
            scores: [sharp: \(sharpnessScore.map { String(format: "%.2f", $0) } ?? "nil"), \
        bright: \(brightnessScore.map { String(format: "%.2f", $0) } ?? "nil"), \
        comp: \(compositionScore.map { String(format: "%.2f", $0) } ?? "nil"), \
        stable: \(stabilityScore.map { String(format: "%.2f", $0) } ?? "nil")]
        )
        """
    }
}

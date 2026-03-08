//
//  QualityMonitor.swift
//  Patina
//
//  Tracks scan quality metrics over time during room capture.
//  Monitors confidence levels and incomplete surfaces.
//

import Foundation
import RoomPlan

/// Monitors and tracks scan quality during room capture
public actor QualityMonitor {

    // MARK: - Types

    /// Quality grade based on scan metrics
    public enum QualityGrade: String, Sendable, Codable {
        case excellent = "excellent"  // >90% quality
        case good = "good"            // 75-90%
        case acceptable = "acceptable" // 50-75%
        case poor = "poor"            // <50%

        public var displayName: String {
            switch self {
            case .excellent: return "Excellent"
            case .good: return "Good"
            case .acceptable: return "Acceptable"
            case .poor: return "Needs Improvement"
            }
        }
    }

    /// Quality metrics result
    public struct QualityMetrics: Equatable, Sendable {
        /// Average confidence across all detected objects
        public let averageConfidence: Float

        /// Number of objects with low confidence
        public let lowConfidenceCount: Int

        /// Number of incomplete wall edges
        public let incompleteEdges: Int

        /// Number of missing corners (walls that don't connect)
        public let disconnectedWalls: Int

        /// Overall quality grade
        public let grade: QualityGrade

        public static let zero = QualityMetrics(
            averageConfidence: 0,
            lowConfidenceCount: 0,
            incompleteEdges: 0,
            disconnectedWalls: 0,
            grade: .poor
        )
    }

    /// Internal sample for tracking quality over time
    private struct QualitySample {
        let timestamp: Date
        let objectConfidences: [CapturedRoom.Confidence]
        let incompleteEdges: Int
        let wallCount: Int
    }

    // MARK: - Private State

    private var samples: [QualitySample] = []
    private let maxSamples = 60 // ~1 sample per second for 60 seconds

    // MARK: - Public Methods

    /// Evaluate quality from current room state
    /// - Parameter room: The CapturedRoom from RoomPlan
    public func evaluate(_ room: CapturedRoom) async {
        let sample = QualitySample(
            timestamp: Date(),
            objectConfidences: room.objects.map(\.confidence),
            incompleteEdges: countIncompleteEdges(room),
            wallCount: room.walls.count
        )

        samples.append(sample)
        if samples.count > maxSamples {
            samples.removeFirst()
        }
    }

    /// Get final quality metrics
    public func finalMetrics() async -> QualityMetrics {
        guard let lastSample = samples.last else {
            return .zero
        }

        let avgConfidence = calculateAverageConfidence(lastSample.objectConfidences)
        let lowCount = lastSample.objectConfidences.filter { $0 == .low }.count
        let disconnectedWalls = estimateDisconnectedWalls(wallCount: lastSample.wallCount)
        let grade = calculateGrade(
            confidence: avgConfidence,
            incompleteEdges: lastSample.incompleteEdges,
            disconnectedWalls: disconnectedWalls
        )

        return QualityMetrics(
            averageConfidence: avgConfidence,
            lowConfidenceCount: lowCount,
            incompleteEdges: lastSample.incompleteEdges,
            disconnectedWalls: disconnectedWalls,
            grade: grade
        )
    }

    /// Get current quality metrics (may be incomplete)
    public func currentMetrics() async -> QualityMetrics {
        return await finalMetrics()
    }

    /// Reset the monitor for a new scan
    public func reset() {
        samples = []
    }

    /// Get quality trend (improving, stable, degrading)
    public func qualityTrend() async -> QualityTrend {
        guard samples.count >= 5 else { return .stable }

        let recentSamples = samples.suffix(5)
        let confidences = recentSamples.map { sample in
            calculateAverageConfidence(sample.objectConfidences)
        }

        guard let first = confidences.first, let last = confidences.last else {
            return .stable
        }

        let delta = last - first
        if delta > 0.1 {
            return .improving
        } else if delta < -0.1 {
            return .degrading
        } else {
            return .stable
        }
    }

    public enum QualityTrend: String, Sendable {
        case improving
        case stable
        case degrading
    }

    // MARK: - Private Methods

    private func countIncompleteEdges(_ room: CapturedRoom) -> Int {
        room.walls.reduce(0) { count, wall in
            count + (4 - wall.completedEdges.count)
        }
    }

    private func calculateAverageConfidence(_ confidences: [CapturedRoom.Confidence]) -> Float {
        guard !confidences.isEmpty else { return 1.0 } // No objects = assume good

        let sum = confidences.reduce(0.0) { result, confidence in
            switch confidence {
            case .high: return result + 1.0
            case .medium: return result + 0.7
            case .low: return result + 0.3
            @unknown default: return result + 0.5
            }
        }

        return Float(sum) / Float(confidences.count)
    }

    private func estimateDisconnectedWalls(wallCount: Int) -> Int {
        // Heuristic: in a proper room, walls should connect
        // 4 walls should have 0 disconnections
        // Fewer walls might indicate missing connections
        if wallCount >= 4 {
            return 0
        } else if wallCount == 3 {
            return 1
        } else if wallCount == 2 {
            return 2
        } else {
            return wallCount
        }
    }

    private func calculateGrade(
        confidence: Float,
        incompleteEdges: Int,
        disconnectedWalls: Int
    ) -> QualityGrade {
        // Weighted score calculation
        // - Confidence: 70% weight (most important for object detection)
        // - Edge completeness: 20% weight
        // - Wall connectivity: 10% weight

        let confidenceScore = confidence

        // Edge score: penalize incomplete edges (max 16 edges for 4 walls)
        let edgeScore = 1.0 - Float(min(incompleteEdges, 12)) / 12.0

        // Wall score: penalize disconnected walls
        let wallScore = 1.0 - Float(min(disconnectedWalls, 4)) / 4.0

        let totalScore = (confidenceScore * 0.7) + (edgeScore * 0.2) + (wallScore * 0.1)

        switch totalScore {
        case 0.9...: return .excellent
        case 0.75..<0.9: return .good
        case 0.5..<0.75: return .acceptable
        default: return .poor
        }
    }
}

// MARK: - Convenience Extensions

extension QualityMonitor.QualityMetrics: CustomStringConvertible {
    public var description: String {
        let confidencePct = Int(averageConfidence * 100)
        return "Quality: \(grade.displayName) (confidence: \(confidencePct)%, \(incompleteEdges) incomplete edges)"
    }
}

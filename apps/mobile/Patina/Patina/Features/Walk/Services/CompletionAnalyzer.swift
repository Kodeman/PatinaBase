//
//  CompletionAnalyzer.swift
//  Patina
//
//  Determines when a room scan meets completion thresholds.
//  Provides recommendations for continuing or finishing the scan.
//

import Foundation
import RoomPlan

/// Analyzes scan completion status and provides recommendations
public actor CompletionAnalyzer {

    // MARK: - Types

    /// Completion criteria thresholds
    public struct CompletionCriteria: Sendable {
        /// Minimum coverage to consider scan valid
        public static let minimumCoverage: Float = 0.85

        /// Minimum number of walls for valid scan
        public static let minimumWalls: Int = 3

        /// Minimum floor coverage
        public static let minimumFloorCoverage: Float = 0.70

        /// Minimum average confidence
        public static let minimumConfidence: Float = 0.6

        /// Coverage for "good" scan
        public static let goodCoverage: Float = 0.92

        /// Coverage for "excellent" scan
        public static let excellentCoverage: Float = 0.97
    }

    /// Recommendation for what to do next
    public enum CompletionRecommendation: String, Sendable, Equatable {
        /// Excellent coverage - ready to complete
        case complete

        /// Good coverage - can complete or continue for better quality
        case acceptAndContinue

        /// Missing some areas - suggest scanning more
        case suggestMoreScanning

        /// Below minimum threshold - must continue
        case requireMoreScanning

        public var companionMessage: String {
            switch self {
            case .complete:
                return "I think I have it. We can move on whenever you're ready."
            case .acceptAndContinue:
                return "We have a good scan. Want to capture a bit more for better accuracy?"
            case .suggestMoreScanning:
                return "I'm missing a few areas. Mind looking around a bit more?"
            case .requireMoreScanning:
                return "I need a bit more to work with. Let's keep going."
            }
        }

        public var canComplete: Bool {
            switch self {
            case .complete, .acceptAndContinue, .suggestMoreScanning:
                return true
            case .requireMoreScanning:
                return false
            }
        }
    }

    /// Areas that haven't been fully scanned
    public enum MissingArea: Sendable, Equatable {
        case incompleteWall(wallId: UUID, missingEdges: Int)
        case lowCoverage
        case insufficientWalls(current: Int, required: Int)
        case lowConfidence
    }

    /// Complete status result
    public struct CompletionStatus: Sendable, Equatable {
        /// Whether the scan meets minimum requirements
        public let isComplete: Bool

        /// Overall coverage percentage
        public let coveragePercentage: Float

        /// Quality grade of the scan
        public let qualityGrade: QualityMonitor.QualityGrade

        /// Recommendation for next action
        public let recommendation: CompletionRecommendation

        /// Areas that need more scanning
        public let missingAreas: [MissingArea]

        public static let incomplete = CompletionStatus(
            isComplete: false,
            coveragePercentage: 0,
            qualityGrade: .poor,
            recommendation: .requireMoreScanning,
            missingAreas: [.lowCoverage]
        )
    }

    // MARK: - Private State

    private var lastStatus: CompletionStatus = .incomplete

    // MARK: - Public Methods

    /// Analyze completion status
    /// - Parameters:
    ///   - room: The CapturedRoom from RoomPlan
    ///   - coverage: Coverage analysis result
    ///   - quality: Quality metrics result
    /// - Returns: Completion status with recommendation
    public func analyze(
        room: CapturedRoom,
        coverage: CoverageAnalyzer.CoverageResult,
        quality: QualityMonitor.QualityMetrics
    ) async -> CompletionStatus {

        // Check if minimum requirements are met
        let meetsMinimumCoverage = coverage.overallCoverage >= CompletionCriteria.minimumCoverage
        let meetsMinimumWalls = room.walls.count >= CompletionCriteria.minimumWalls
        let meetsMinimumConfidence = quality.averageConfidence >= CompletionCriteria.minimumConfidence
        let meetsMinimumFloor = coverage.floorCoverage >= CompletionCriteria.minimumFloorCoverage

        let meetsMinimum = meetsMinimumCoverage && meetsMinimumWalls && meetsMinimumConfidence && meetsMinimumFloor

        // Determine recommendation based on coverage and meeting minimum
        let recommendation = determineRecommendation(
            coverage: coverage.overallCoverage,
            meetsMinimum: meetsMinimum
        )

        // Identify what's missing
        let missingAreas = identifyMissingAreas(
            room: room,
            coverage: coverage,
            quality: quality,
            meetsMinimumCoverage: meetsMinimumCoverage,
            meetsMinimumWalls: meetsMinimumWalls,
            meetsMinimumConfidence: meetsMinimumConfidence
        )

        let status = CompletionStatus(
            isComplete: meetsMinimum,
            coveragePercentage: coverage.overallCoverage,
            qualityGrade: quality.grade,
            recommendation: recommendation,
            missingAreas: missingAreas
        )

        lastStatus = status
        return status
    }

    /// Get last computed status without recomputing
    public func lastResult() async -> CompletionStatus {
        return lastStatus
    }

    /// Reset for a new scan
    public func reset() {
        lastStatus = .incomplete
    }

    /// Quick check if scan can be completed now
    public func canComplete() async -> Bool {
        return lastStatus.isComplete
    }

    // MARK: - Private Methods

    private func determineRecommendation(coverage: Float, meetsMinimum: Bool) -> CompletionRecommendation {
        switch (coverage, meetsMinimum) {
        case (CompletionCriteria.excellentCoverage..., true):
            return .complete
        case (CompletionCriteria.goodCoverage..., true):
            return .acceptAndContinue
        case (_, true):
            return .suggestMoreScanning
        case (_, false):
            return .requireMoreScanning
        }
    }

    private func identifyMissingAreas(
        room: CapturedRoom,
        coverage: CoverageAnalyzer.CoverageResult,
        quality: QualityMonitor.QualityMetrics,
        meetsMinimumCoverage: Bool,
        meetsMinimumWalls: Bool,
        meetsMinimumConfidence: Bool
    ) -> [MissingArea] {
        var missing: [MissingArea] = []

        // Check for incomplete walls
        for wall in room.walls where wall.completedEdges.count < 4 {
            missing.append(.incompleteWall(
                wallId: wall.identifier,
                missingEdges: 4 - wall.completedEdges.count
            ))
        }

        // Check overall coverage
        if !meetsMinimumCoverage {
            missing.append(.lowCoverage)
        }

        // Check wall count
        if !meetsMinimumWalls {
            missing.append(.insufficientWalls(
                current: room.walls.count,
                required: CompletionCriteria.minimumWalls
            ))
        }

        // Check confidence
        if !meetsMinimumConfidence {
            missing.append(.lowConfidence)
        }

        return missing
    }
}

// MARK: - Guidance Generation

extension CompletionAnalyzer {
    /// Generate user-facing guidance based on missing areas
    public func generateGuidance(for status: CompletionStatus) async -> String? {
        guard !status.missingAreas.isEmpty else { return nil }

        // Prioritize the most actionable issue
        for area in status.missingAreas {
            switch area {
            case .incompleteWall:
                return "Try moving along the walls slowly to capture more detail."
            case .lowCoverage:
                return "I haven't seen all of this space yet. Mind exploring a bit more?"
            case .insufficientWalls(let current, let required):
                let remaining = required - current
                return "I'm only seeing \(current) wall\(current == 1 ? "" : "s"). Can you show me \(remaining) more?"
            case .lowConfidence:
                return "Some areas are a bit unclear. Moving more slowly might help."
            }
        }

        return nil
    }
}

// MARK: - Convenience Extensions

extension CompletionAnalyzer.CompletionStatus: CustomStringConvertible {
    public var description: String {
        let pct = Int(coveragePercentage * 100)
        return "Completion: \(pct)%, \(recommendation.rawValue) (\(missingAreas.count) issues)"
    }
}

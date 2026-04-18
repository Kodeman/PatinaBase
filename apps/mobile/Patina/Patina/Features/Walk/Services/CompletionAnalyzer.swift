//
//  CompletionAnalyzer.swift
//  Patina
//
//  Determines when a room scan meets completion thresholds.
//  Provides recommendations for continuing or finishing the scan.
//

import Foundation
import RoomPlan

/// Snapshot of ambient capture conditions used to extend completion gating
/// beyond pure geometry — lighting and device-motion stability.
public struct CaptureEnvironmentSnapshot: Sendable, Equatable {
    /// Estimated ambient light in lumens. `nil` when no estimate is available.
    public let lightEstimateLumens: Double?
    /// Current motion quality grade. `nil` when no quality data has been collected yet.
    public let motionGrade: QualityMonitor.QualityGrade?

    public nonisolated init(
        lightEstimateLumens: Double? = nil,
        motionGrade: QualityMonitor.QualityGrade? = nil
    ) {
        self.lightEstimateLumens = lightEstimateLumens
        self.motionGrade = motionGrade
    }
}

/// Same-module ordering helper for `QualityMonitor.QualityGrade`.
/// Higher rank = better quality. Used by the composite completion gate.
extension QualityMonitor.QualityGrade {
    internal nonisolated var rawRank: Int {
        switch self {
        case .excellent: return 3
        case .good: return 2
        case .acceptable: return 1
        case .poor: return 0
        }
    }
}

/// Analyzes scan completion status and provides recommendations
public actor CompletionAnalyzer {

    // MARK: - Types

    /// Completion criteria thresholds
    public struct CompletionCriteria: Sendable {
        /// Minimum coverage to consider scan valid
        public static let minimumCoverage: Float = 0.75

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

        // Instance-level tunables for the composite completion gate.
        // Values <= 0 (for lumens) disable the lighting gate.

        /// Minimum estimated ambient light (lumens) required to consider
        /// a scan complete. Defaults to `40.0`. Set `<= 0` to disable the gate.
        public var minimumLightingLumens: Double

        /// Minimum acceptable motion-quality grade. Defaults to `.acceptable`.
        public var motionQualityMinimum: QualityMonitor.QualityGrade

        public init(
            minimumLightingLumens: Double = 40.0,
            motionQualityMinimum: QualityMonitor.QualityGrade = .acceptable
        ) {
            self.minimumLightingLumens = minimumLightingLumens
            self.motionQualityMinimum = motionQualityMinimum
        }
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
        case insufficientLighting(lumens: Double)
        case excessiveMotion(grade: QualityMonitor.QualityGrade)
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
    ///   - environment: Optional ambient capture snapshot (lighting, motion).
    ///                  Missing signals pass by default — the gate is additive,
    ///                  not punitive, when data is unavailable.
    /// - Returns: Completion status with recommendation
    public func analyze(
        room: CapturedRoom,
        coverage: CoverageAnalyzer.CoverageResult,
        quality: QualityMonitor.QualityMetrics,
        environment: CaptureEnvironmentSnapshot = .init()
    ) async -> CompletionStatus {

        let criteria = CompletionCriteria()

        // Check if minimum requirements are met
        let meetsMinimumCoverage = coverage.overallCoverage >= CompletionCriteria.minimumCoverage
        let meetsMinimumWalls = room.walls.count >= CompletionCriteria.minimumWalls
        let meetsMinimumConfidence = quality.averageConfidence >= CompletionCriteria.minimumConfidence
        let meetsMinimumFloor = coverage.floorCoverage >= CompletionCriteria.minimumFloorCoverage

        // Lighting gate — pass if no estimate is available or the gate is disabled.
        let meetsLighting: Bool
        if let lumens = environment.lightEstimateLumens, criteria.minimumLightingLumens > 0 {
            meetsLighting = lumens >= criteria.minimumLightingLumens
        } else {
            meetsLighting = true
        }

        // Motion gate — pass if no motion grade has been sampled yet.
        let meetsMotion: Bool
        if let grade = environment.motionGrade {
            meetsMotion = grade.rawRank >= criteria.motionQualityMinimum.rawRank
        } else {
            meetsMotion = true
        }

        let meetsComposite = meetsMinimumCoverage
            && meetsMinimumWalls
            && meetsMinimumConfidence
            && meetsMinimumFloor
            && meetsLighting
            && meetsMotion

        // Determine recommendation based on coverage and composite gate
        let recommendation = determineRecommendation(
            coverage: coverage.overallCoverage,
            meetsMinimum: meetsComposite
        )

        // Identify what's missing
        let missingAreas = identifyMissingAreas(
            room: room,
            coverage: coverage,
            quality: quality,
            environment: environment,
            meetsMinimumCoverage: meetsMinimumCoverage,
            meetsMinimumWalls: meetsMinimumWalls,
            meetsMinimumConfidence: meetsMinimumConfidence,
            meetsLighting: meetsLighting,
            meetsMotion: meetsMotion
        )

        let status = CompletionStatus(
            isComplete: meetsComposite,
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
        environment: CaptureEnvironmentSnapshot,
        meetsMinimumCoverage: Bool,
        meetsMinimumWalls: Bool,
        meetsMinimumConfidence: Bool,
        meetsLighting: Bool,
        meetsMotion: Bool
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

        // Lighting — only reportable when we actually have an estimate.
        if !meetsLighting, let lumens = environment.lightEstimateLumens {
            missing.append(.insufficientLighting(lumens: lumens))
        }

        // Motion — only reportable when we have a grade sample.
        if !meetsMotion, let grade = environment.motionGrade {
            missing.append(.excessiveMotion(grade: grade))
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
            case .insufficientLighting:
                return "The room's a bit dim — mind turning on a light?"
            case .excessiveMotion:
                return "I'm having trouble tracking your motion. Mind slowing your sweeps?"
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

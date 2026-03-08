//
//  CoverageAnalyzer.swift
//  Patina
//
//  Analyzes scan coverage from CapturedRoom data.
//  Provides coverage metrics based on wall completeness and floor area.
//

import Foundation
import RoomPlan
import simd

/// Analyzes scan coverage from RoomPlan CapturedRoom data
public actor CoverageAnalyzer {

    // MARK: - Types

    /// Result of coverage analysis
    public struct CoverageResult: Equatable, Sendable {
        /// Overall coverage percentage (0.0 - 1.0)
        public let overallCoverage: Float

        /// Wall-specific coverage (based on completedEdges)
        public let wallCoverage: Float

        /// Floor-specific coverage estimate
        public let floorCoverage: Float

        /// Total number of detected surfaces
        public let detectedSurfaces: Int

        /// Number of surfaces with incomplete edges
        public let incompleteSurfaces: Int

        /// Display phase for UI
        public var displayPhase: ProgressPhase {
            switch overallCoverage {
            case 0..<0.15: return .beginning
            case 0.15..<0.40: return .exploring
            case 0.40..<0.70: return .developing
            case 0.70..<0.90: return .refining
            default: return .complete
            }
        }

        /// Smoothstep fill level for organic progress indicator
        public var fillLevel: Float {
            let x = overallCoverage
            return 3 * pow(x, 2) - 2 * pow(x, 3)
        }

        public static let zero = CoverageResult(
            overallCoverage: 0,
            wallCoverage: 0,
            floorCoverage: 0,
            detectedSurfaces: 0,
            incompleteSurfaces: 0
        )
    }

    /// Progress phase for companion narration
    public enum ProgressPhase: String, Sendable {
        case beginning    // "Let's begin"
        case exploring    // "Good start"
        case developing   // "We're getting somewhere"
        case refining     // "Nearly there"
        case complete     // "I think I have it"

        public var narration: String {
            switch self {
            case .beginning: return "Let's begin"
            case .exploring: return "Good start"
            case .developing: return "We're getting somewhere"
            case .refining: return "Nearly there"
            case .complete: return "I think I have it"
            }
        }
    }

    // MARK: - Private State

    private var lastAnalysis: CoverageResult = .zero
    private var expectedWallCount: Int = 4 // Default for rectangular room

    // MARK: - Public Methods

    /// Analyze coverage from a CapturedRoom
    /// - Parameter room: The CapturedRoom from RoomPlan
    /// - Returns: Coverage analysis result
    public func analyze(_ room: CapturedRoom) async -> CoverageResult {
        // Calculate wall coverage based on completedEdges
        let wallCoverageScore = calculateWallCoverage(room.walls)

        // Calculate floor coverage (estimate based on floor detection)
        let floorCoverageScore = calculateFloorCoverage(room.floors)

        // Count surfaces with incomplete edges
        let incompleteSurfaces = room.walls.filter { wall in
            wall.completedEdges.count < 4
        }.count

        // Total detected surfaces
        let detectedSurfaces = room.walls.count + room.floors.count + room.doors.count + room.windows.count

        // Overall coverage: weighted combination
        // - Walls are most important (60%)
        // - Floor coverage matters too (30%)
        // - Having detected surfaces indicates progress (10%)
        let surfaceBonus = min(0.1, Float(detectedSurfaces) * 0.01)
        let overall = (wallCoverageScore * 0.6) + (floorCoverageScore * 0.3) + surfaceBonus

        let result = CoverageResult(
            overallCoverage: min(1.0, overall),
            wallCoverage: wallCoverageScore,
            floorCoverage: floorCoverageScore,
            detectedSurfaces: detectedSurfaces,
            incompleteSurfaces: incompleteSurfaces
        )

        lastAnalysis = result
        return result
    }

    /// Get the last analysis result without recomputing
    public func lastResult() async -> CoverageResult {
        return lastAnalysis
    }

    /// Reset the analyzer state
    public func reset() {
        lastAnalysis = .zero
        expectedWallCount = 4
    }

    /// Update expected wall count based on room shape
    public func setExpectedWallCount(_ count: Int) {
        expectedWallCount = max(3, count)
    }

    // MARK: - Private Methods

    private func calculateWallCoverage(_ walls: [CapturedRoom.Surface]) -> Float {
        guard !walls.isEmpty else { return 0 }

        // Each wall can have 4 completed edges
        // completedEdges is a Set<Edge> with values like .top, .bottom, .left, .right
        let maxEdges = walls.count * 4
        let completedEdges = walls.reduce(0) { count, wall in
            count + wall.completedEdges.count
        }

        // Base coverage from edge completion
        let edgeCoverage = Float(completedEdges) / Float(max(1, maxEdges))

        // Bonus for having multiple walls detected
        // (having 3+ walls is a good sign)
        let wallCountBonus: Float
        switch walls.count {
        case 0: wallCountBonus = 0
        case 1: wallCountBonus = 0.1
        case 2: wallCountBonus = 0.2
        case 3: wallCountBonus = 0.3
        default: wallCountBonus = 0.4 // 4+ walls
        }

        // Combine edge coverage with wall count bonus
        // Max out at 1.0
        return min(1.0, edgeCoverage * 0.7 + wallCountBonus * 0.3 + (walls.count >= expectedWallCount ? 0.1 : 0))
    }

    private func calculateFloorCoverage(_ floors: [CapturedRoom.Surface]) -> Float {
        guard !floors.isEmpty else { return 0 }

        // Having at least one floor detected is a good start
        // Multiple floor surfaces might indicate a complex space

        // Estimate floor area from dimensions
        var totalArea: Float = 0
        for floor in floors {
            let area = floor.dimensions.x * floor.dimensions.z
            totalArea += area
        }

        // Base score for having floors
        var coverage: Float = 0.5

        // Bonus for floor completeness (based on edges)
        let floorEdgeCoverage = floors.reduce(0.0) { sum, floor in
            sum + Float(floor.completedEdges.count) / 4.0
        } / Float(floors.count)
        coverage += floorEdgeCoverage * 0.3

        // Bonus for reasonable floor area (5-100 sq meters)
        if totalArea >= 5 && totalArea <= 100 {
            coverage += 0.2
        } else if totalArea > 100 {
            coverage += 0.1
        }

        return min(1.0, coverage)
    }
}

// MARK: - Convenience Extensions

extension CoverageAnalyzer.CoverageResult: CustomStringConvertible {
    public var description: String {
        let pct = Int(overallCoverage * 100)
        return "Coverage: \(pct)% (\(displayPhase.rawValue))"
    }
}

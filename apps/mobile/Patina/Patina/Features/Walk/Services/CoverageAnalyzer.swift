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

    /// Serializable snapshot of the coverage heatmap grid.
    /// Wave 3 serializes this to JSON for persistence / debugging.
    public struct CoverageHeatmap: Codable, Equatable, Sendable {
        public let schemaVersion: Int
        public let gridWidth: Int
        public let gridHeight: Int
        public let bounds: Bounds
        public let cells: [[Float]]   // [gridHeight][gridWidth], values in [0, 1]

        public struct Bounds: Codable, Equatable, Sendable {
            public let minX: Float
            public let maxX: Float
            public let minZ: Float
            public let maxZ: Float
        }
    }

    /// A directional coaching hint suggesting where the user should look next.
    public struct CoachingHint: Sendable, Equatable {
        public enum Direction: String, Sendable, CaseIterable {
            case northeast, north, northwest, east, west, southeast, south, southwest, up, down
        }
        public let direction: Direction
        public let message: String
    }

    // MARK: - Private State

    private var lastAnalysis: CoverageResult = .zero
    private var expectedWallCount: Int = 4 // Default for rectangular room

    // MARK: - Heatmap Grid State

    private let gridWidth: Int = 8
    private let gridHeight: Int = 8
    private var cells: [[Float]] = Array(
        repeating: Array(repeating: 0, count: 8),
        count: 8
    )
    private var gridBoundsMinX: Float = .greatestFiniteMagnitude
    private var gridBoundsMaxX: Float = -.greatestFiniteMagnitude
    private var gridBoundsMinZ: Float = .greatestFiniteMagnitude
    private var gridBoundsMaxZ: Float = -.greatestFiniteMagnitude
    private var hasAnyCentroid: Bool = false

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
        cells = Array(
            repeating: Array(repeating: 0, count: gridWidth),
            count: gridHeight
        )
        gridBoundsMinX = .greatestFiniteMagnitude
        gridBoundsMaxX = -.greatestFiniteMagnitude
        gridBoundsMinZ = .greatestFiniteMagnitude
        gridBoundsMaxZ = -.greatestFiniteMagnitude
        hasAnyCentroid = false
    }

    /// Update expected wall count based on room shape
    public func setExpectedWallCount(_ count: Int) {
        expectedWallCount = max(3, count)
    }

    // MARK: - Heatmap Ingest

    /// Ingest a batch of mesh-anchor centroids in world space. Each centroid
    /// contributes +0.1 (saturating at 1.0) to the grid cell covering its (X, Z).
    ///
    /// Bounds expand on each call to accommodate new centroids. On the very
    /// first ingest the bounds collapse to a single point; subsequent ingests
    /// establish a usable range before any mapping happens.
    public func ingestMeshAnchorCentroids(_ centroids: [SIMD3<Float>]) {
        guard !centroids.isEmpty else { return }

        // Expand bounds to include every centroid.
        for c in centroids {
            if c.x < gridBoundsMinX { gridBoundsMinX = c.x }
            if c.x > gridBoundsMaxX { gridBoundsMaxX = c.x }
            if c.z < gridBoundsMinZ { gridBoundsMinZ = c.z }
            if c.z > gridBoundsMaxZ { gridBoundsMaxZ = c.z }
        }

        let spanX = gridBoundsMaxX - gridBoundsMinX
        let spanZ = gridBoundsMaxZ - gridBoundsMinZ

        // Guard against a degenerate (zero-area) span — wait for more data.
        guard spanX > 0, spanZ > 0 else {
            hasAnyCentroid = true
            return
        }

        let wF = Float(gridWidth)
        let hF = Float(gridHeight)

        for c in centroids {
            let colRaw = Int(((c.x - gridBoundsMinX) / spanX) * wF)
            let rowRaw = Int(((c.z - gridBoundsMinZ) / spanZ) * hF)
            let col = min(max(colRaw, 0), gridWidth - 1)
            let row = min(max(rowRaw, 0), gridHeight - 1)
            let next = cells[row][col] + 0.1
            cells[row][col] = next > 1.0 ? 1.0 : next
        }
        hasAnyCentroid = true
    }

    /// Snapshot the current heatmap grid. Returns zero-bounds if no centroids
    /// have been ingested yet.
    public func currentHeatmap() -> CoverageHeatmap {
        let bounds: CoverageHeatmap.Bounds
        if hasAnyCentroid,
           gridBoundsMinX.isFinite,
           gridBoundsMaxX.isFinite,
           gridBoundsMinZ.isFinite,
           gridBoundsMaxZ.isFinite {
            bounds = CoverageHeatmap.Bounds(
                minX: gridBoundsMinX,
                maxX: gridBoundsMaxX,
                minZ: gridBoundsMinZ,
                maxZ: gridBoundsMaxZ
            )
        } else {
            bounds = CoverageHeatmap.Bounds(minX: 0, maxX: 0, minZ: 0, maxZ: 0)
        }

        return CoverageHeatmap(
            schemaVersion: 1,
            gridWidth: gridWidth,
            gridHeight: gridHeight,
            bounds: bounds,
            cells: cells
        )
    }

    /// Suggest the next area the user should pan toward, or nil if it's too
    /// early (mean coverage < 0.3) or the grid is already saturated
    /// (no cell ≤ 0.1).
    public func nextCoachingHint() -> CoachingHint? {
        guard hasAnyCentroid else { return nil }

        // Compute mean and find the minimum-valued cell.
        var total: Float = 0
        var count: Float = 0
        var minValue: Float = .greatestFiniteMagnitude
        var minRow: Int = 0
        var minCol: Int = 0

        for row in 0..<gridHeight {
            for col in 0..<gridWidth {
                let v = cells[row][col]
                total += v
                count += 1
                if v < minValue {
                    minValue = v
                    minRow = row
                    minCol = col
                }
            }
        }

        guard count > 0 else { return nil }
        let mean = total / count

        // Only coach once the user has meaningful coverage, and only if there
        // is still a clearly under-covered cell.
        guard mean >= 0.3, minValue <= 0.1 else { return nil }

        let direction = directionForCell(row: minRow, col: minCol)
        return CoachingHint(direction: direction, message: message(for: direction))
    }

    // MARK: - Private Methods

    /// Map a grid cell to a compass direction using a 3×3 region split.
    /// Row 0 is north (far Z), row gridHeight-1 is south (near Z).
    /// Col 0 is west (min X), col gridWidth-1 is east (max X).
    /// Center cell returns `.up` (suggest a ceiling sweep — no strong bearing).
    private func directionForCell(row: Int, col: Int) -> CoachingHint.Direction {
        let rowThird = Int((Float(row) / Float(gridHeight)) * 3.0)
        let colThird = Int((Float(col) / Float(gridWidth)) * 3.0)
        let r = min(max(rowThird, 0), 2)
        let c = min(max(colThird, 0), 2)

        switch (r, c) {
        case (0, 0): return .northwest
        case (0, 1): return .north
        case (0, 2): return .northeast
        case (1, 0): return .west
        case (1, 1): return .up       // center → ceiling sweep
        case (1, 2): return .east
        case (2, 0): return .southwest
        case (2, 1): return .south
        case (2, 2): return .southeast
        default:     return .up
        }
    }

    /// Short, calm whisper-style copy for each direction.
    private func message(for direction: CoachingHint.Direction) -> String {
        switch direction {
        case .northeast: return "Drift toward the northeast corner."
        case .north:     return "Turn gently north."
        case .northwest: return "Drift toward the northwest corner."
        case .east:      return "Pan slowly east."
        case .west:      return "Pan slowly west."
        case .southeast: return "Drift toward the southeast corner."
        case .south:     return "Turn gently south."
        case .southwest: return "Drift toward the southwest corner."
        case .up:        return "Sweep upward to cover the ceiling."
        case .down:      return "Glance down to capture the floor."
        }
    }


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

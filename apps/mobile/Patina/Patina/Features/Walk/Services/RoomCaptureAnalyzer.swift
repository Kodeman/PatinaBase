//
//  RoomCaptureAnalyzer.swift
//  Patina
//
//  Quality / coverage / completion metrics for a live room scan. Extracted
//  from `RoomCaptureService` (PT-6-2). Owns the three analysis actors
//  (CoverageAnalyzer, QualityMonitor, CompletionAnalyzer) and the pure-geometry
//  helpers (dimension extraction, object→feature mapping) that drive narration
//  feature emission.
//
//  This type computes and returns values; it does NOT own the service's
//  `@Observable` state and does NOT emit features or fire callbacks — the
//  `RoomCaptureService` façade applies the returned metrics to its published
//  state and decides what to emit. Behavior is preserved 1:1 with the original
//  inline implementation.
//

import Foundation
import RoomPlan
import ARKit
import simd

/// Coordinates the per-frame analysis actors for a scan and exposes the
/// pure-geometry helpers used to derive room dimensions and narration features.
@MainActor
final class RoomCaptureAnalyzer {

    // MARK: - Analysis Result

    /// Combined output of a single `didUpdate room:` analysis pass. The façade
    /// applies these to its published state.
    struct AnalysisResult {
        let coverage: CoverageAnalyzer.CoverageResult
        let quality: QualityMonitor.QualityMetrics
        let completion: CompletionAnalyzer.CompletionStatus
    }

    // MARK: - Analyzers

    private let coverageAnalyzer = CoverageAnalyzer()
    private let qualityMonitor = QualityMonitor()
    private let completionAnalyzer = CompletionAnalyzer()

    // MARK: - Lifecycle

    /// Reset all three analyzers for a fresh scan. Mirrors the `Task { … }`
    /// block in the original `startCapture`.
    func reset() async {
        await coverageAnalyzer.reset()
        await qualityMonitor.reset()
        await completionAnalyzer.reset()
    }

    // MARK: - Per-frame Analysis

    /// Run the full coverage → quality → completion pipeline for an in-progress
    /// `CapturedRoom`, using the supplied AR frame for ambient-light gating.
    /// Returns the combined metrics; the caller applies them to observable state.
    func analyze(room: CapturedRoom, frame: ARFrame?) async -> AnalysisResult {
        // Analyze coverage using CoverageAnalyzer
        let coverage = await coverageAnalyzer.analyze(room)

        // Evaluate quality
        await qualityMonitor.evaluate(room)
        let quality = await qualityMonitor.finalMetrics()

        // Analyze completion status — extend the pure-geometry gate
        // with ambient lighting + motion snapshots so low-light or
        // shaky-pan scans can't auto-complete prematurely.
        let envSnapshot = CaptureEnvironmentSnapshot(
            lightEstimateLumens: frame?.lightEstimate.map { Double($0.ambientIntensity) } ?? nil,
            motionGrade: quality.grade
        )
        let completion = await completionAnalyzer.analyze(
            room: room,
            coverage: coverage,
            quality: quality,
            environment: envSnapshot
        )

        return AnalysisResult(coverage: coverage, quality: quality, completion: completion)
    }

    // MARK: - Mesh anchor ingestion / coaching

    /// Feed mesh-anchor centroids into the coverage analyzer and return the
    /// freshest coaching hint.
    func ingestMeshAnchorCentroids(_ centroids: [SIMD3<Float>]) async -> CoverageAnalyzer.CoachingHint? {
        await coverageAnalyzer.ingestMeshAnchorCentroids(centroids)
        return await coverageAnalyzer.nextCoachingHint()
    }

    // MARK: - Final / on-demand metrics

    /// The final quality grade (used at scan end + for telemetry).
    func finalQualityGrade() async -> QualityMonitor.QualityGrade {
        await qualityMonitor.finalMetrics().grade
    }

    /// The latest full quality metrics snapshot.
    func finalQualityMetrics() async -> QualityMonitor.QualityMetrics {
        await qualityMonitor.finalMetrics()
    }

    /// Whether the completion analyzer says the scan can be completed now.
    func canComplete() async -> Bool {
        await completionAnalyzer.canComplete()
    }

    /// The current coverage heatmap snapshot (for the bundle artifact).
    func currentHeatmap() async -> CoverageAnalyzer.CoverageHeatmap {
        await coverageAnalyzer.currentHeatmap()
    }

    // MARK: - Pure-geometry helpers

    /// Compute clamped room dimensions from the captured walls.
    func extractDimensions(from room: CapturedRoom) -> WalkRoomDimensions {
        // Calculate room bounds from walls
        var minX: Float = .greatestFiniteMagnitude
        var maxX: Float = -.greatestFiniteMagnitude
        var minZ: Float = .greatestFiniteMagnitude
        var maxZ: Float = -.greatestFiniteMagnitude
        var maxY: Float = 2.7 // Default ceiling height

        for wall in room.walls {
            let transform = wall.transform
            let position = SIMD3<Float>(transform.columns.3.x, transform.columns.3.y, transform.columns.3.z)
            let halfWidth = wall.dimensions.x / 2
            let halfDepth = wall.dimensions.z / 2

            minX = min(minX, position.x - halfWidth)
            maxX = max(maxX, position.x + halfWidth)
            minZ = min(minZ, position.z - halfDepth)
            maxZ = max(maxZ, position.z + halfDepth)
            maxY = max(maxY, position.y + wall.dimensions.y)
        }

        let width = maxX - minX
        let length = maxZ - minZ
        let height = maxY

        // Clamp to reasonable values
        return WalkRoomDimensions(
            width: max(2.0, min(width, 20.0)),
            length: max(2.0, min(length, 20.0)),
            height: max(2.0, min(height, 5.0))
        )
    }

    /// Map a detected RoomPlan object to a narration feature, or nil if it
    /// shouldn't trigger narration.
    func mapObjectToFeature(_ object: CapturedRoom.Object) -> DetectedFeature? {
        switch object.category {
        case .fireplace:
            return DetectedFeature(category: .fireplace)
        case .storage:
            // Check if it might be a bookshelf based on dimensions
            if object.dimensions.y > 1.0 && object.dimensions.x > 0.5 {
                return DetectedFeature(category: .bookshelf)
            }
            return nil
        case .sofa, .chair:
            return DetectedFeature(category: .seatingArea)
        default:
            return nil
        }
    }
}

//  SurfaceCoverageTracker.swift
//  CaptureKit
//
//  Pure per-surface coverage accounting for the coach + QA gate (Field Capture P1 ·
//  item 5, deck SC-09). A surface counts OBSERVED once the camera has dwelt on it —
//  in-frame (inside a forward cone) and within ~4 m — for enough accumulated time.
//  Parametric-first: the surfaces come from the live RoomPlan graph, not the mesh,
//  so this is a lightweight bookkeeping loop rather than Metal mesh painting (P1
//  scope call — see FieldCoverageCoach).
//
//  Pure + testable: feed synthetic surfaces + camera poses (position + forward +
//  dt) and assert observed/unobserved — including the AC case (a wall never looked
//  at stays unobserved → a non-green verdict names it). No RoomPlan, no ARKit.
//
//  Dwell is keyed by the surface's STABLE id, so re-emitting the surface set each
//  RoomPlan update (via `setSurfaces`) preserves progress.

import Foundation

/// One surface's observed state.
public struct SurfaceCoverage: Sendable, Equatable {
    public let surface: CaptureSurface
    public let observed: Bool
    public let dwellSeconds: TimeInterval
}

public final class SurfaceCoverageTracker {

    public struct Config: Sendable {
        /// Max camera→surface distance to count as looked-at (deck: ~4 m).
        public var maxDistanceMeters: Float
        /// Half-angle of the forward cone the surface must fall inside (radians).
        public var fovHalfAngleRadians: Float
        /// Accumulated in-view seconds before a surface flips to observed.
        public var dwellSecondsToObserve: TimeInterval

        public init(maxDistanceMeters: Float = 4.0,
                    fovHalfAngleRadians: Float = 35.0 * .pi / 180.0,
                    dwellSecondsToObserve: TimeInterval = 1.2) {
            self.maxDistanceMeters = maxDistanceMeters
            self.fovHalfAngleRadians = fovHalfAngleRadians
            self.dwellSecondsToObserve = dwellSecondsToObserve
        }
    }

    private let config: Config
    private var order: [String] = []                    // surface ids in insertion order
    private var surfaces: [String: CaptureSurface] = [:]
    private var dwell: [String: TimeInterval] = [:]

    public init(config: Config = Config()) {
        self.config = config
    }

    /// Replace the tracked surface set (called on each RoomPlan graph update).
    /// Dwell for ids that persist is kept; dwell for vanished ids is dropped.
    public func setSurfaces(_ newSurfaces: [CaptureSurface]) {
        var nextOrder: [String] = []
        var nextSurfaces: [String: CaptureSurface] = [:]
        for surface in newSurfaces where nextSurfaces[surface.id] == nil {
            nextOrder.append(surface.id)
            nextSurfaces[surface.id] = surface
        }
        surfaces = nextSurfaces
        order = nextOrder
        dwell = dwell.filter { nextSurfaces[$0.key] != nil }
    }

    /// Accumulate `dt` seconds of observation from a camera pose. A surface gains
    /// dwell when it is within `maxDistanceMeters` AND inside the forward cone.
    public func observe(cameraPosition: SIMD3<Float>, cameraForward: SIMD3<Float>, dt: TimeInterval) {
        guard dt > 0 else { return }
        let fLen = Self.length(cameraForward)
        guard fLen > 0 else { return }
        let forward = cameraForward / fLen
        let cosCone = Foundation.cos(config.fovHalfAngleRadians)

        for (id, surface) in surfaces {
            let toSurface = surface.center - cameraPosition
            let dist = Self.length(toSurface)
            guard dist > 0.0001, dist <= config.maxDistanceMeters else { continue }
            let dir = toSurface / dist
            guard Self.dot(forward, dir) >= cosCone else { continue }
            dwell[id, default: 0] += dt
        }
    }

    /// Per-surface observed state, in insertion order.
    public var coverage: [SurfaceCoverage] {
        order.compactMap { id in
            guard let surface = surfaces[id] else { return nil }
            let d = dwell[id] ?? 0
            return SurfaceCoverage(surface: surface, observed: d >= config.dwellSecondsToObserve, dwellSeconds: d)
        }
    }

    /// Surfaces not yet observed (for naming gaps).
    public var unobserved: [CaptureSurface] {
        coverage.filter { !$0.observed }.map { $0.surface }
    }

    /// Surface-weighted coverage percentage (observed surfaces / total).
    public var coveragePct: Int {
        let all = coverage
        guard !all.isEmpty else { return 0 }
        let observed = all.filter { $0.observed }.count
        return Int((Double(observed) / Double(all.count) * 100).rounded())
    }

    // MARK: - Vector helpers (stdlib SIMD only — no `import simd`)

    private static func length(_ v: SIMD3<Float>) -> Float {
        (v.x * v.x + v.y * v.y + v.z * v.z).squareRoot()
    }
    private static func dot(_ a: SIMD3<Float>, _ b: SIMD3<Float>) -> Float {
        a.x * b.x + a.y * b.y + a.z * b.z
    }
}

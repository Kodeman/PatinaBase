//  SurfaceCoverageTracker.swift
//  CaptureKit
//
//  Pure per-surface coverage accounting for the coach + QA gate (Field Capture P1 ·
//  item 5, deck SC-09). A surface counts OBSERVED once the camera has dwelt on it —
//  ANY of its extent sample points in-frame (inside a forward cone) and within range
//  — for enough accumulated time. Parametric-first: the surfaces come from the live
//  RoomPlan graph, not the mesh, so this is a lightweight bookkeeping loop rather
//  than Metal mesh painting (P1 scope call — see FieldCoverageCoach).
//
//  Pure + testable: feed synthetic surfaces + camera poses (position + forward + dt)
//  and assert observed/unobserved — including the AC case (a wall never looked at
//  stays unobserved → a non-green verdict names it) and the big-room case (a floor is
//  observed via its footprint samples even while the camera sweeps at eye level).
//
//  Dwell survives the graph re-emitting the surface set (`setSurfaces`): persistent
//  ids keep progress, and a surface re-issued under a NEW UUID inherits the dwell of
//  the vanished same-kind surface nearest it (item-5 review F3).

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
        /// Floor/ceiling are big horizontal targets seen obliquely at eye level, so
        /// they get a relaxed range (× this) — prevents a large room's floor/ceiling
        /// centroid from never accruing dwell (F1).
        public var floorCeilingRangeMultiplier: Float
        /// A surface re-issued within this distance of a vanished same-kind surface
        /// inherits its dwell (UUID churn re-keying, F3).
        public var rekeyToleranceMeters: Float

        public init(maxDistanceMeters: Float = 4.0,
                    fovHalfAngleRadians: Float = 35.0 * .pi / 180.0,
                    dwellSecondsToObserve: TimeInterval = 1.2,
                    floorCeilingRangeMultiplier: Float = 1.6,
                    rekeyToleranceMeters: Float = 0.6) {
            self.maxDistanceMeters = maxDistanceMeters
            self.fovHalfAngleRadians = fovHalfAngleRadians
            self.dwellSecondsToObserve = dwellSecondsToObserve
            self.floorCeilingRangeMultiplier = floorCeilingRangeMultiplier
            self.rekeyToleranceMeters = rekeyToleranceMeters
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
    public func setSurfaces(_ newSurfaces: [CaptureSurface]) {
        var nextOrder: [String] = []
        var nextSurfaces: [String: CaptureSurface] = [:]
        for surface in newSurfaces where nextSurfaces[surface.id] == nil {
            nextOrder.append(surface.id)
            nextSurfaces[surface.id] = surface
        }

        // Re-key dwell. Persistent ids keep their dwell; a NEW id inherits the dwell
        // of the vanished same-kind surface nearest it (within tolerance), so a
        // RoomPlan UUID re-issue doesn't reset progress (F3).
        let newIds = Set(nextSurfaces.keys)
        let vanished = surfaces.filter { !newIds.contains($0.key) }
        var claimed: Set<String> = []
        var nextDwell: [String: TimeInterval] = [:]
        for (id, surface) in nextSurfaces {
            if let existing = dwell[id] {
                nextDwell[id] = existing
            } else if let match = Self.nearestMatch(for: surface, in: vanished,
                                                    excluding: claimed,
                                                    tolerance: config.rekeyToleranceMeters) {
                nextDwell[id] = dwell[match] ?? 0
                claimed.insert(match)
            }
        }

        surfaces = nextSurfaces
        order = nextOrder
        dwell = nextDwell
    }

    /// Accumulate `dt` seconds of observation from a camera pose. A surface gains
    /// dwell when ANY of its sample points is within range AND inside the forward
    /// cone (floor/ceiling get a relaxed range).
    public func observe(cameraPosition: SIMD3<Float>, cameraForward: SIMD3<Float>, dt: TimeInterval) {
        guard dt > 0 else { return }
        let fLen = Self.length(cameraForward)
        guard fLen > 0 else { return }
        let forward = cameraForward / fLen
        let cosCone = Foundation.cos(config.fovHalfAngleRadians)

        for (id, surface) in surfaces {
            let range = (surface.kind == .floor || surface.kind == .ceiling)
                ? config.maxDistanceMeters * config.floorCeilingRangeMultiplier
                : config.maxDistanceMeters
            var inView = false
            for point in surface.effectiveSamplePoints {
                let toPoint = point - cameraPosition
                let dist = Self.length(toPoint)
                guard dist > 0.0001, dist <= range else { continue }
                if Self.dot(forward, toPoint / dist) >= cosCone { inView = true; break }
            }
            if inView { dwell[id, default: 0] += dt }
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

    // MARK: - Helpers (stdlib SIMD only — no `import simd`)

    private static func nearestMatch(for surface: CaptureSurface, in vanished: [String: CaptureSurface],
                                     excluding claimed: Set<String>, tolerance: Float) -> String? {
        var bestId: String?
        var bestDist = tolerance
        for (vid, vsurf) in vanished where !claimed.contains(vid) && vsurf.kind == surface.kind {
            let d = length(vsurf.center - surface.center)
            if d <= bestDist { bestDist = d; bestId = vid }
        }
        return bestId
    }

    private static func length(_ v: SIMD3<Float>) -> Float {
        (v.x * v.x + v.y * v.y + v.z * v.z).squareRoot()
    }
    private static func dot(_ a: SIMD3<Float>, _ b: SIMD3<Float>) -> Float {
        a.x * b.x + a.y * b.y + a.z * b.z
    }
}

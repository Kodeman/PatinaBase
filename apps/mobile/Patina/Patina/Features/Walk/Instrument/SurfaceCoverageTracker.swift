//
//  SurfaceCoverageTracker.swift
//  Patina
//
//  PORTED VERBATIM FROM Patina Field:
//    apps/mobile/Capture/CaptureKit/CaptureKit/SiteScan/SurfaceCoverageTracker.swift
//
//  Pure per-surface coverage accounting for the coach + QA gate. A surface counts
//  OBSERVED once the camera has dwelt on it — ANY of its extent sample points
//  in-frame (inside a forward cone) and within range — for enough accumulated time.
//  Parametric-first: the surfaces come from the live RoomPlan graph, not the mesh,
//  so this is a lightweight bookkeeping loop rather than Metal mesh painting.
//
//  Pure + testable: feed synthetic surfaces + camera poses (position + forward + dt)
//  and assert observed/unobserved — including the AC case (a wall never looked at
//  stays unobserved → a non-green verdict names it) and the big-room case (a floor
//  is observed via its footprint samples even while the camera sweeps at eye level).
//
//  Dwell survives the graph re-emitting the surface set (`setSurfaces`): persistent
//  ids keep progress, and a surface re-issued under a NEW UUID inherits the dwell of
//  the vanished same-kind surface nearest it.
//
//  ISOLATION — `nonisolated`, and deliberately NOT `Sendable`. This type carries
//  mutable per-surface dwell state and no lock; Field confines it to a single
//  isolation domain (its `@MainActor FieldCoverageCoach` owns the only instance) and
//  so must the later wiring wave. Marking it `@unchecked Sendable` would be a lie.
//  Without the explicit `nonisolated`, Patina's project-level
//  SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor would bind it to the main actor, which
//  would force every frame-rate `observe(...)` call to hop.
//

import Foundation

/// One surface's observed state.
nonisolated public struct SurfaceCoverage: Sendable, Equatable {
    public let surface: CaptureSurface
    public let observed: Bool
    public let dwellSeconds: TimeInterval

    public init(surface: CaptureSurface, observed: Bool, dwellSeconds: TimeInterval) {
        self.surface = surface
        self.observed = observed
        self.dwellSeconds = dwellSeconds
    }
}

nonisolated public final class SurfaceCoverageTracker {

    public struct Config: Sendable {
        /// Max camera→surface distance to count as looked-at (~4 m).
        public var maxDistanceMeters: Float
        /// Half-angle of the forward cone the surface must fall inside (radians).
        public var fovHalfAngleRadians: Float
        /// Accumulated in-view seconds before a surface flips to observed.
        public var dwellSecondsToObserve: TimeInterval
        /// Floor/ceiling are big horizontal targets seen obliquely at eye level, so
        /// they get a relaxed range (× this) — prevents a large room's floor/ceiling
        /// centroid from never accruing dwell.
        public var floorCeilingRangeMultiplier: Float
        /// A surface re-issued within this distance of a vanished same-kind surface
        /// inherits its dwell (UUID churn re-keying).
        public var rekeyToleranceMeters: Float

        /// Defaults carried across from Field unchanged; pinned by value in
        /// `InstrumentCoverageTests`.
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
        // RoomPlan UUID re-issue doesn't reset progress.
        let newIds = Set(nextSurfaces.keys)
        let vanished = surfaces.filter { !newIds.contains($0.key) }
        var claimed: Set<String> = []
        var nextDwell: [String: TimeInterval] = [:]
        for (id, surface) in nextSurfaces {
            if let existing = dwell[id] {
                nextDwell[id] = existing
            } else if let match = SurfaceCoverageTracker.nearestMatch(
                for: surface,
                in: vanished,
                excluding: claimed,
                tolerance: config.rekeyToleranceMeters
            ) {
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
        let forwardLength = SurfaceCoverageTracker.length(cameraForward)
        guard forwardLength > 0 else { return }
        let forward = cameraForward / forwardLength
        let cosCone = Foundation.cos(config.fovHalfAngleRadians)

        for (id, surface) in surfaces {
            let range = (surface.kind == .floor || surface.kind == .ceiling)
                ? config.maxDistanceMeters * config.floorCeilingRangeMultiplier
                : config.maxDistanceMeters
            var inView = false
            for point in surface.effectiveSamplePoints {
                let toPoint = point - cameraPosition
                let dist = SurfaceCoverageTracker.length(toPoint)
                guard dist > 0.0001, dist <= range else { continue }
                if SurfaceCoverageTracker.dot(forward, toPoint / dist) >= cosCone {
                    inView = true
                    break
                }
            }
            if inView { dwell[id, default: 0] += dt }
        }
    }

    /// Per-surface observed state, in insertion order.
    public var coverage: [SurfaceCoverage] {
        order.compactMap { id in
            guard let surface = surfaces[id] else { return nil }
            let dwelt = dwell[id] ?? 0
            return SurfaceCoverage(surface: surface,
                                   observed: dwelt >= config.dwellSecondsToObserve,
                                   dwellSeconds: dwelt)
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
        for (vanishedId, vanishedSurface) in vanished
        where !claimed.contains(vanishedId) && vanishedSurface.kind == surface.kind {
            let dist = length(vanishedSurface.center - surface.center)
            if dist <= bestDist {
                bestDist = dist
                bestId = vanishedId
            }
        }
        return bestId
    }

    private static func length(_ vector: SIMD3<Float>) -> Float {
        (vector.x * vector.x + vector.y * vector.y + vector.z * vector.z).squareRoot()
    }

    private static func dot(_ lhs: SIMD3<Float>, _ rhs: SIMD3<Float>) -> Float {
        lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z
    }
}

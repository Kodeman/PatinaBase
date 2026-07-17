//  CaptureCadence.swift
//  CaptureKit
//
//  Pure sample-throttle decision for the budget-conscious streams the Field
//  capture rig persists (Field Capture P1 · item 3, point 6: "throttle depth
//  persistence ... never block the AR frame pump"). Depth frames arrive at the
//  full AR frame rate (~60 Hz); persisting every one would blow the 300–600 MB
//  bundle budget (SC-12) and thrash the IO queue. The mesh snapshot is far more
//  expensive still. Both gate through this one interval decision so the tested
//  cadence and the live sampler can never drift apart — the same discipline
//  `FieldPhotoGate.shouldCapture` applies to the posed-photo lane.
//
//  Distinct from `FieldPhotoGate` on purpose: the photo gate also owns a hard
//  count cap (silent stop at 60) and a "first frame always" rule tuned to the
//  posed-photo product decision (I76). Depth/mesh want a plain minimum-interval
//  throttle with no cap (the whole session's depth timeline matters) — a
//  different policy, so a different pure type rather than an overloaded one.
//
//  Pure Foundation, `Sendable`, no ARKit — unit-tested in CaptureTests.

import Foundation

/// A minimum-interval throttle. `shouldSample` is true for the first sample and
/// thereafter only once `minimumInterval` has elapsed since the last accepted
/// sample. Compares against a caller-supplied clock value (either wall-clock
/// `TimeInterval` since session start, or the raw monotonic `ARFrame.timestamp`
/// — the recorder picks one and stays consistent).
public struct CaptureCadence: Sendable, Equatable {

    /// Minimum seconds between accepted samples.
    public let minimumInterval: TimeInterval

    public init(minimumInterval: TimeInterval) {
        precondition(minimumInterval >= 0, "cadence interval must be non-negative")
        self.minimumInterval = minimumInterval
    }

    /// Whether a sample arriving at `now` should be persisted.
    /// - Parameters:
    ///   - now: the arriving sample's clock value.
    ///   - last: the clock value of the last accepted sample, or `nil` if none yet.
    /// - Returns: `true` for the first sample, else `true` iff
    ///   `now - last >= minimumInterval`. Monotonic clocks only (a `now` earlier
    ///   than `last` returns `false` — a regressed/duplicate frame is dropped).
    public func shouldSample(now: TimeInterval, last: TimeInterval?) -> Bool {
        guard let last else { return true }
        return now - last >= minimumInterval
    }

    // MARK: - Locked v1 cadences (documented constants — item 3, point 6)

    /// Depth persistence: ~1 Hz, mirroring the client app's `DepthFrameRecorder`
    /// default. The item-4 keyframe recorder will gate full-res captures on
    /// motion; this fixed cadence is the item-3 depth-evidence floor.
    public static let depth = CaptureCadence(minimumInterval: 1.0)

    /// Scene-mesh snapshot to `mesh.ply`: every 10 s. The full accumulated mesh
    /// is rewritten each snapshot (overwrite, not append) as a crash-resilience
    /// checkpoint, plus a forced authoritative final write at session end — so the
    /// on-disk `mesh.ply` is bounded in size (it tracks the room, not the session
    /// length) and the AR frame pump is never blocked (writes hop to a background
    /// queue). A slower cadence than depth because a full-mesh rewrite is far more
    /// expensive than one depth frame.
    public static let meshSnapshot = CaptureCadence(minimumInterval: 10.0)
}

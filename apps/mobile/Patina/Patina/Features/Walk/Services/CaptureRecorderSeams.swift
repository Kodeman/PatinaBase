//
//  CaptureRecorderSeams.swift
//  Patina
//
//  PORTED FROM Patina Field:
//    apps/mobile/Capture/Capture/Features/SiteScan/CaptureRecorderSeams.swift
//
//  The recorder seam protocols the capture path fans out to. These are the ONLY
//  surface an instrument recorder touches to observe a live scan — no recorder
//  reaches the `ARSession`, the `RoomCaptureSession`, or `RoomCaptureService`'s
//  internals. The owner computes the shared-clock timestamp ONCE per sample (via
//  `CaptureTimebase`) and hands it to every sink, so no sink recomputes the clock
//  and all streams agree on t = 0 (Field deck SC-07, "one clock").
//
//  App-side (not in `Features/Walk/Instrument/`) because they carry `ARFrame` /
//  `ARMeshAnchor` / `CapturedRoom` — the substrate rule keeps ARKit/RoomPlan
//  types out of the framework-free instrument directory, and
//  `InstrumentIsolationTests.theSubstrateImportsNoCaptureFramework` enforces it.
//  The generic, ARKit-free fan-out lives in the substrate
//  (`Instrument/CaptureSinkRegistry.swift`).
//
//  ── Why a seam at all, when `RoomCaptureService` is already the delegate ─────
//  Because a recorder wired straight to `ARSessionDelegate` is not testable
//  without a device: `ARFrame` cannot be constructed, and a delegate method is
//  not a value you can hand a fake to. The seam does not make ARFrame
//  constructible either — but it makes the REGISTRATION, the ORDERING, and the
//  ONE-TIMESTAMP-PER-SAMPLE rule testable with stub sinks, and it keeps the
//  session plumbing out of every recorder. That is the property that makes
//  Field's version maintainable, and it is the reason the substrate is wired
//  through here rather than into the delegate directly.
//
//  ⚠ Patina's THREE PRE-EXISTING per-frame lanes — `FrameCaptureService`,
//  `PosedPhotoService` and `DepthFrameRecorder` — are deliberately NOT migrated
//  onto this seam in this wave. They are called inline from
//  `RoomCaptureService.session(_:didUpdate:)` today, one of them with an
//  `await` in the middle, and moving them is a behaviour-preserving refactor of
//  the shipping capture path with its own verification burden. The seam is
//  additive: instrument sinks ride it, the legacy lanes keep their inline calls,
//  and both are driven from the same callback so ordering is unchanged.
//

import Foundation
import ARKit
import RoomPlan

/// How a batch of scene-mesh anchors changed on the ARSession.
///
/// `nonisolated` because it crosses isolation domains as a value and Patina sets
/// SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor — an unmarked enum here would be
/// implicitly main-actor-isolated while also claiming `Sendable`.
nonisolated enum CaptureMeshChange: Sendable {
    case added
    case updated
    case removed
}

/// Receives every ARFrame from the capture session, on the MainActor, stamped on
/// the shared clock. Sinks must return QUICKLY — heavy work (encode, IO) hops to
/// a background queue so the AR frame pump is never blocked.
@MainActor
protocol CaptureFrameSink: AnyObject {
    func capture(frame: ARFrame, timestampSeconds: TimeInterval)
}

/// Receives scene-mesh (`ARMeshAnchor`) add/update/remove batches from the
/// capture session, on the MainActor, stamped on the shared clock.
@MainActor
protocol CaptureMeshSink: AnyObject {
    func capture(meshAnchors: [ARMeshAnchor], change: CaptureMeshChange, timestampSeconds: TimeInterval)
}

/// Receives live RoomPlan parametric-graph updates (`CapturedRoom`) from the
/// `RoomCaptureSessionDelegate`, on the MainActor, stamped on the shared clock.
/// This is the seam the coverage coach rebuilds its tracked surface set from.
@MainActor
protocol CaptureRoomUpdateSink: AnyObject {
    func capture(room: CapturedRoom, timestampSeconds: TimeInterval)
}

//  CaptureRecorderSeams.swift
//  Capture · Wave F (Pro site-scan) · Field Capture P1 · item 3
//
//  The recorder seam protocols the shared-ARSession rig (`SharedARCaptureRig`)
//  fans out to. These are the ONLY surface items 4–6 touch to observe the live
//  capture — none of them reach the ARSession, RoomCaptureSession, or the rig's
//  internals. The rig computes the shared-clock timestamp ONCE per sample (via
//  `CaptureTimebase`) and hands it to every sink, so no sink recomputes the clock
//  and all streams agree on t = 0 (SC-07, "one clock").
//
//  App-side (not CaptureKit) because they carry `ARFrame` / `ARMeshAnchor` /
//  `CapturedRoom` — the CaptureKit seam rule keeps SDK/ARKit types out of the
//  frozen framework; the generic, ARKit-free fan-out lives in CaptureKit
//  (`CaptureSinkRegistry`) and is unit-tested there.
//
//  Item 3 registers three sinks: `FieldDepthRecorder` (frame), `FieldSceneMeshRecorder`
//  (mesh), and the migrated `FieldPosedPhotoService` (frame). The room-update sink
//  currently has no item-3 consumer — it exists so item 5 (coach/QA) and item 6
//  (anchor entry against the live model) plug in without reopening this file.

import Foundation

#if canImport(ARKit)
import ARKit
#if canImport(RoomPlan)
import RoomPlan
#endif

/// How a batch of scene-mesh anchors changed on the ARSession.
enum CaptureMeshChange: Sendable {
    case added
    case updated
    case removed
}

/// Receives every ARFrame from the shared session, on the MainActor, stamped on
/// the shared clock. Sinks must return quickly — heavy work (encode, IO) hops to
/// a background queue so the AR frame pump is never blocked (item 3, point 6).
@MainActor
protocol CaptureFrameSink: AnyObject {
    func capture(frame: ARFrame, timestampSeconds: TimeInterval)
}

/// Receives scene-mesh (`ARMeshAnchor`) add/update/remove batches from the shared
/// session, on the MainActor, stamped on the shared clock.
@MainActor
protocol CaptureMeshSink: AnyObject {
    func capture(meshAnchors: [ARMeshAnchor], change: CaptureMeshChange, timestampSeconds: TimeInterval)
}

#if canImport(RoomPlan)
/// Receives live RoomPlan parametric-graph updates (`CapturedRoom`) from the
/// shared session's `RoomCaptureSessionDelegate`, on the MainActor, stamped on
/// the shared clock. The coverage heuristic already consumes these inline in
/// `RoomPlanScanSession`; the seam exists for items 5/6.
@MainActor
protocol CaptureRoomUpdateSink: AnyObject {
    func capture(room: CapturedRoom, timestampSeconds: TimeInterval)
}
#endif
#endif

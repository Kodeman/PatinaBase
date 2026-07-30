//
//  CaptureStreamProbe.swift
//  Patina
//
//  Counts which ARFrame streams the running capture session actually vends.
//  Diagnostic only: it decides nothing, writes nothing, and changes no capture
//  behaviour. It rides the recorder seam like any other sink.
//
//  ── Why this exists ──────────────────────────────────────────────────────────
//  Patina does NOT own its capture configuration. `RoomCaptureSessionDriver`
//  builds `RoomCaptureView(frame:)` and runs `RoomCaptureSession.Configuration()`
//  — a type with no depth or scene-reconstruction knobs — then attaches
//  `RoomCaptureService` as the delegate of the ARSession RoomPlan created. So
//  what `frame.sceneDepth` and `ARMeshAnchor` delivery do here is a property of
//  RoomPlan's internal configuration, which is neither documented nor asserted
//  anywhere in this repo.
//
//  Today that question is UNANSWERABLE from a finished scan, because both
//  dependent lanes fail silently and identically to being switched off:
//
//    • `DepthFrameRecorder.consume` opens with
//      `guard let depth = frame.sceneDepth else { return }` — no counter, no log.
//      `RoomCaptureBundleAdapter` then emits `sceneDepthFrameCount` only when
//      `framesWritten > 0`, so a scan that got zero depth frames produces a
//      manifest byte-identical to one where the user declined depth.
//    • `SceneMeshExporter` logs "No mesh anchors to export" at `info` and
//      returns; no `mesh.ply`, no error, no manifest artifact. `ARMeshAnchor`s
//      only exist when `sceneReconstruction = .mesh` is set on the RUNNING
//      configuration, and nothing in Patina's scan path sets it (the one
//      assignment in the app is in the unrelated AR furniture-placement
//      feature, on its own ARView session).
//
//  Two silences that look exactly like success is the worst shape a diagnostic
//  can have. This probe makes them audible for the cost of three integer
//  increments per frame, so a single scan on a LiDAR device answers it.
//
//  It deliberately reads `smoothedSceneDepth` too: Field's depth recorder falls
//  back smoothed → plain, and its rig enables `.smoothedSceneDepth` explicitly.
//  Knowing WHICH of the two (if either) RoomPlan's default session vends is the
//  difference between "Patina can record depth as-is" and "Patina must own the
//  configuration to get depth at all".
//
//  ⚠ This probe answers the DEPTH-AVAILABILITY question only. Mesh-anchor
//  arrival is already observable without it — `RoomCaptureService.meshAnchors`
//  is non-empty iff scene reconstruction is on — and `summaryLine` reports the
//  count it is handed rather than subscribing to a mesh seam of its own.
//

import Foundation
import ARKit

@MainActor
final class CaptureStreamProbe: CaptureFrameSink {

    /// ARFrames seen.
    private(set) var frames = 0
    /// Frames carrying plain `sceneDepth`.
    private(set) var framesWithSceneDepth = 0
    /// Frames carrying `smoothedSceneDepth`.
    private(set) var framesWithSmoothedDepth = 0

    /// Whether the session ever vended either depth flavour.
    var sawAnyDepth: Bool { framesWithSceneDepth > 0 || framesWithSmoothedDepth > 0 }

    // MARK: - CaptureFrameSink

    func capture(frame: ARFrame, timestampSeconds: TimeInterval) {
        frames += 1
        if frame.sceneDepth != nil { framesWithSceneDepth += 1 }
        if frame.smoothedSceneDepth != nil { framesWithSmoothedDepth += 1 }
    }

    // MARK: - Reporting

    /// One line, safe to log: pure counts, no imagery, no pose, no identifiers.
    /// `meshAnchorCount` is passed in by the caller (the service already holds
    /// the anchor set) rather than observed here.
    func summaryLine(meshAnchorCount: Int) -> String {
        """
        [CaptureStreamProbe] frames=\(frames) \
        sceneDepth=\(framesWithSceneDepth) \
        smoothedSceneDepth=\(framesWithSmoothedDepth) \
        meshAnchors=\(meshAnchorCount)
        """
    }
}

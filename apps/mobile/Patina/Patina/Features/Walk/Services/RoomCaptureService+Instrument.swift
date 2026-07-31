//
//  RoomCaptureService+Instrument.swift
//  Patina
//
//  The instrument lane's behaviour, split out of `RoomCaptureService` so the
//  façade's body stays under the type-length gate. The lane's stored state
//  (`captureTimebase`, the two sink registries, the coach, the keyframe
//  recorder, the stream probe, the thermal-peak recorder, `instrumentLayer`)
//  has to live on the class itself — Swift has no stored properties in
//  extensions — so read that block in `RoomCaptureService.swift` alongside
//  this file.
//
//  Registration happens in `startCapture`; the fan-out happens in the two
//  delegate callbacks. This file holds what happens at the ends: the live
//  snapshot, and closing the lane when the session finishes.
//

import Foundation
import ARKit

extension RoomCaptureService {

    /// Live instrument coverage state (checklist + machine warnings). Nil
    /// outside a scan.
    ///
    /// INSTRUMENT-INTERNAL. `coveragePct` on this snapshot is per-surface DWELL,
    /// not the progress figure. `CoverageAnalyzer.overallCoverage` (i.e.
    /// `scanProgress`) remains the only coverage number the UI and analytics
    /// show — see the header of `RoomCoverageCoach.swift`.
    func instrumentCoverageSnapshot() -> CoverageSnapshot? { coverageCoach?.snapshot() }

    /// Close the instrument lane: build the QA scorecard from the coach's dwell
    /// state + the keyframe lane's sharp-frame ratio, assemble the rest of the
    /// manifest's instrument layer, and log what the session actually vended.
    ///
    /// The layer is held on `instrumentLayer` until seal, where
    /// `RoomCaptureBundleAdapter.applyReviewAndSeal` folds it into manifest.json
    /// (`ScanBundleWriter.applyInstrumentLayer`). It is NOT written at freeze
    /// and no `scorecard.json` / `anchors.json` file is produced — see the
    /// writer method for both reasons.
    ///
    /// The old gate on doing this at all (`ScanRecoveryService` DELETING a
    /// bundle whose manifest would not decode, so one unrecognized enum value
    /// meant deleted user data) has been LIFTED: unreadable bundles are
    /// quarantined, and an unknown value inside an optional instrument key
    /// degrades that key to nil via `ScanManifest.init(from:)`. See the
    /// numbered note in `RoomCoverageCoach.swift`.
    ///
    /// Internal rather than private only because it lives in this file and is
    /// called from the delegate conformance in `RoomCaptureService.swift`.
    ///
    /// Idempotent: safe if the session ends more than once.
    ///
    /// - Parameter arSession: the shared ARSession the capture ran on. Passed
    ///   in rather than reached for because the delegate callback holds it and
    ///   the driver keeps it private; its `identifier` is the honest value for
    ///   `session.sessionId`, which spec §3.2 defines as the ARSession run id
    ///   ("distinct from scanId"). Field puts its scan id in that slot; this is
    ///   the real thing.
    func finalizeInstrumentLane(arSession: ARSession) {
        guard let coach = coverageCoach else { return }

        // Patina has NO anchor-entry UI: nothing in this app can mint an
        // `AnchorRecord`, so a client scan has zero typed ground-truth spans.
        // The honest emission is an EMPTY ARRAY — not an absent key (validator
        // §10.6: "'anchors' must be an array"), and not invented anchors. The
        // consequence is that `AnchorGate.isUnverified(0)` is true and every
        // client scan is stamped UNVERIFIED, which is the accurate, unflattering
        // description of a scan with no tape-measure truth in it.
        let anchors: [AnchorRecord] = []

        let scorecard = coach.finalize(
            sharpFrameRatio: keyframeRecorder?.sharpFrameRatio ?? 1.0,
            anchorCount: anchors.count
        )

        // The keyframe DECISION lane's real counters. `keyframeRecorder` is
        // registered in the same breath as the coach, so a nil here means the
        // lane never ran and the zeros describe exactly that.
        let telemetry = keyframeRecorder?.telemetry ?? KeyframeTelemetry()

        instrumentLayer = ScanManifest.InstrumentLayer(
            session: makeInstrumentSession(arSession: arSession),
            anchors: anchors,
            scorecard: scorecard,
            // nodeCount / edgeCount / loopClosures / meanTranslationDriftPct are
            // omitted, not zeroed: this app builds no pose graph. See
            // `ScanManifest.PoseGraphSummary`.
            poseGraphSummary: ScanManifest.PoseGraphSummary(
                keyframeCount: telemetry.fired,
                blurRejectedCount: telemetry.blurRejected,
                rawBlurFailures: telemetry.rawBlurFailures,
                encodeDropped: telemetry.encodeDropped
            )
        )
        #if DEBUG
        // Both lines below go out on TWO channels on purpose, and the reason is
        // worth stating because it cost a device pass to learn:
        //
        //   • `PatinaLog.scan.info` -> the unified log, readable in Console.app.
        //     `.debug` was the original level and it is the wrong one here —
        //     debug records are memory-only and are filtered out of Console by
        //     default, so the line existed but could not be read.
        //   • `print` -> stdout, which is the ONLY channel
        //     `devicectl device process launch --console` captures. os_log of
        //     any level never reaches it, which is why a scan that ran fine
        //     produced no probe output at all.
        //
        // A diagnostic that cannot be read on a device is not a diagnostic.
        // DEBUG-only, so neither channel exists in a release build.
        if let probe = streamProbe {
            // The one line that answers "does RoomPlan's default session vend
            // depth to us at all" — see `CaptureStreamProbe.swift`.
            let line = probe.summaryLine(meshAnchorCount: meshAnchors.count)
            PatinaLog.scan.info(line)
            print(line)
        }
        let fired = keyframeRecorder?.telemetry.fired ?? 0
        let instrumentLine = "[Instrument] verdict=\(scorecard.verdict.rawValue) "
            + "surfaces=\(scorecard.surfaceChecklist.count) "
            + "coveragePct=\(scorecard.coveragePct) keyframesFired=\(fired)"
        PatinaLog.scan.info(instrumentLine)
        print(instrumentLine)
        #endif
    }

    /// Per-session provenance (spec §3.2). Every field is read off something
    /// this app genuinely holds:
    ///
    ///  * `sessionId` — the shared `ARSession`'s own `identifier`. Spec §3.2
    ///    calls for "ARSession run id; distinct from scanId"; Field puts its
    ///    scan id there, this is the actual session.
    ///  * `startedAt` — `captureTimebase.start`, the scan's t = 0. That single
    ///    clock is what every capture stream already stamps against
    ///    (`CaptureTimebase`), so the manifest agrees with the samples.
    ///  * `endedAt` — now, i.e. `didEndWith`. NOT `manifest.completedAt`, which
    ///    is stamped later, when the user finishes the review step; the session
    ///    ended when the camera stopped, not when the user stopped reading.
    ///  * `arWorldTrackingConfig` — the constant `"shared-roomcapture"`, which
    ///    describes what `RoomCaptureSessionDriver` actually does: it owns an
    ///    `ARSession` and hands it to `RoomCaptureView(frame:arSession:)`,
    ///    Apple's shared-session seam, mirroring Field's `SharedARCaptureRig`.
    ///  * `thermalPeak` — the highest state `ThermalPeakRecorder` observed
    ///    across the capture, not the instantaneous reading at the end.
    ///
    /// `appVersion`/`appBuild` fall back to `"0"` exactly as Field's assembler
    /// does, so an Info.plist without them reads the same on both sides.
    private func makeInstrumentSession(arSession: ARSession) -> ScanManifest.Session {
        let started = captureTimebase.start
        let ended = Date()
        let info = Bundle.main.infoDictionary
        return ScanManifest.Session(
            sessionId: arSession.identifier.uuidString,
            appVersion: info?["CFBundleShortVersionString"] as? String ?? "0",
            appBuild: info?["CFBundleVersion"] as? String ?? "0",
            startedAt: Self.instrumentTimestampFormatter.string(from: started),
            endedAt: Self.instrumentTimestampFormatter.string(from: ended),
            // Truncated, matching Field. Floored at 0 so a clock that moved
            // backwards mid-scan cannot emit a negative duration.
            captureDurationSeconds: max(0, Int(ended.timeIntervalSince(started))),
            arWorldTrackingConfig: Self.sharedRoomCaptureConfigLabel,
            // The fallback is unreachable in practice — the recorder is
            // registered in the same block as the coach this method already
            // guarded on — and it is not a fabrication if it is ever reached:
            // one reading is the peak OF ONE SAMPLE, which is all we would have.
            thermalPeak: thermalPeakRecorder?.peakLabel
                ?? ThermalPeakRecorder.label(for: ProcessInfo.processInfo.thermalState)
        )
    }

    /// The instrument layer's timestamps are ISO8601 STRINGS, not `Date`s — see
    /// the type note on `ScanManifest`. This formatter's default options
    /// (`.withInternetDateTime`, UTC) produce `2026-07-17T15:04:00Z`, the same
    /// shape Field writes and the same shape `JSONEncoder`'s `.iso8601` strategy
    /// gives the inherited `createdAt`/`completedAt`, so one manifest does not
    /// carry two timestamp formats.
    private static let instrumentTimestampFormatter = ISO8601DateFormatter()

    /// Field's label for the iOS 17 shared-session pattern (spec §3.2 / SC-07).
    private static let sharedRoomCaptureConfigLabel = "shared-roomcapture"
}

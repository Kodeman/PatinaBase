//
//  RoomCaptureService+Instrument.swift
//  Patina
//
//  The instrument lane's behaviour, split out of `RoomCaptureService` so the
//  façade's body stays under the type-length gate. The lane's stored state
//  (`captureTimebase`, the two sink registries, the coach, the keyframe
//  recorder, the stream probe, `instrumentScorecard`) has to live on the class
//  itself — Swift has no stored properties in extensions — so read that block
//  in `RoomCaptureService.swift` alongside this file.
//
//  Registration happens in `startCapture`; the fan-out happens in the two
//  delegate callbacks. This file holds what happens at the ends: the live
//  snapshot, and closing the lane when the session finishes.
//

import Foundation

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
    /// state + the keyframe lane's sharp-frame ratio, and log what the session
    /// actually vended.
    ///
    /// ⚠ The scorecard is held IN MEMORY on `instrumentScorecard` and goes no
    /// further. It is NOT written to `scorecard.json` and NOT assigned to
    /// `manifest.scorecard`, because `ScanRecoveryService` deletes a bundle and
    /// its SwiftData row when `manifest.json` fails to decode — so the first
    /// producer of instrument fields turns any future unrecognized enum value
    /// into deleted user data on next launch. That guard has to be made lenient
    /// before this becomes a write. See `RoomCoverageCoach.swift`.
    ///
    /// Internal rather than private only because it lives in this file and is
    /// called from the delegate conformance in `RoomCaptureService.swift`.
    ///
    /// Idempotent: safe if the session ends more than once.
    func finalizeInstrumentLane() {
        guard let coach = coverageCoach else { return }
        let scorecard = coach.finalize(
            sharpFrameRatio: keyframeRecorder?.sharpFrameRatio ?? 1.0,
            // Anchor entry is not wired in this app; `AnchorGate.isUnverified(0)`
            // is true, which is the honest answer for a scan with no anchors.
            anchorCount: 0
        )
        instrumentScorecard = scorecard
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
}

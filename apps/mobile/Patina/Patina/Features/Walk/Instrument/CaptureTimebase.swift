//
//  CaptureTimebase.swift
//  Patina
//
//  PORTED VERBATIM FROM Patina Field:
//    apps/mobile/Capture/CaptureKit/CaptureKit/SiteScan/CaptureTimebase.swift
//
//  THE ONE CLOCK for a capture session (Field deck SC-07: "four streams, one
//  clock"). Every stream a capture session records — the RoomPlan parametric
//  graph, the scene mesh, per-frame depth, the posed-photo lane, the keyframe
//  lane — stamps its samples in SECONDS SINCE SESSION START, computed through
//  this single value. Nothing needs aligning later that wasn't aligned at birth.
//
//  Why a wall-clock (`Date`) origin and not `ARFrame.timestamp`: Patina's
//  posed-photo lane already stamps `timestampSeconds` as
//  `Date().timeIntervalSince(scanStartTime)` (`PosedPhotoService`), and so does
//  `DepthFrameRecorder`. Unifying every stream onto the same Date origin keeps
//  those two lanes byte-identical while giving the instrument lanes the same
//  zero. The raw monotonic `ARFrame.timestamp` is still what the keyframe gate's
//  debounce and the coach's dt use — that is a DURATION clock, not a session
//  clock, and the two are deliberately different things.
//
//  ISOLATION: `nonisolated` — see the note in `KeyframeGate.swift`. Patina's
//  project-level SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor would otherwise bind
//  this to the main actor, and the fan-out point stamps every sample with it.
//

import Foundation

/// The shared session clock. All capture streams express their timestamps as
/// `seconds(at:)` — seconds elapsed since `start`.
nonisolated public struct CaptureTimebase: Sendable, Equatable {

    /// Wall-clock instant the capture session began (t = 0).
    public let start: Date

    public init(start: Date = Date()) {
        self.start = start
    }

    /// Seconds since session start for a wall-clock instant. Never negative for
    /// an instant at or after `start`; a pre-start instant yields a negative
    /// value (callers pass `Date()` at sample time, so this is the elapsed time).
    public func seconds(at instant: Date) -> TimeInterval {
        instant.timeIntervalSince(start)
    }

    /// Convenience: seconds since start, evaluated now.
    public func secondsNow(_ clock: () -> Date = Date.init) -> TimeInterval {
        seconds(at: clock())
    }
}

//  CaptureTimebase.swift
//  CaptureKit
//
//  THE ONE CLOCK for the Field capture rig (Field Capture P1 · item 3, SC-07:
//  "four streams, one clock"). Every stream the shared-ARSession rig records —
//  the RoomPlan parametric graph, the LiDAR scene mesh, smoothed per-frame depth,
//  and the posed-photo lane — stamps its samples in **seconds since session
//  start**, computed through this single value. Nothing needs aligning later that
//  wasn't aligned at birth.
//
//  Why a wall-clock (Date) origin and not `ARFrame.timestamp`:
//    • The posed-photo lane already stamps `timestampSeconds` as
//      `Date().timeIntervalSince(startTime)` (FieldPhotoEntry), and item 3 must
//      preserve that lane's behavior UNCHANGED. Unifying every stream onto the
//      same Date origin keeps posed-photo timestamps byte-identical while giving
//      depth + mesh the same zero.
//    • The raw monotonic `ARFrame.timestamp` is ALSO persisted per depth frame
//      (see `FieldDepthRecorder`) so a server can do sub-frame alignment; the
//      Date-relative value is the human/telemetry-facing session clock.
//
//  Pure Foundation, `Sendable`, no ARKit — unit-tested in CaptureTests.

import Foundation

/// The shared session clock. All capture streams express their timestamps as
/// `seconds(at:)` — seconds elapsed since `start`.
public struct CaptureTimebase: Sendable, Equatable {

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

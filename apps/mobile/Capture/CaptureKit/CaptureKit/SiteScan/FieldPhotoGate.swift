//  FieldPhotoGate.swift
//  CaptureKit
//
//  Pure capture-gating decision for the Field pro-site-scan posed-photo lane
//  (Room View PHOTOS, I76). Extracted out of the app-target
//  `FieldPosedPhotoService` so the interval / cap / active-state matrix is
//  unit-testable with no ARKit, no device, and no I/O — CaptureTests links
//  CaptureKit only (the same seam `FieldCapturePayloadTests` uses).
//
//  Locked v1 policy (I76/I82):
//    • AUTO-interval capture ONLY — no shutter path in v1.
//    • one sample every `autoInterval` seconds while the scan is live;
//    • HARD cap at `maxPhotos` with a SILENT stop (the client app is uncapped —
//      that gap is deliberately NOT ported here).
//
//  The app-target service delegates its per-frame decision to `shouldCapture`
//  so the live sampler and this tested function can never drift apart.

import Foundation

public enum FieldPhotoGate {

    /// Minimum spacing between auto samples, in seconds.
    public static let autoInterval: TimeInterval = 2.0

    /// Hard cap on auto photos per scan. Once reached the sampler stops
    /// SILENTLY — no error, no UI. (Client app is uncapped; not ported.)
    public static let maxPhotos = 60

    /// Whether the frame arriving at `now` should be captured.
    ///
    /// Pure: the only inputs are the clock, the last capture time, the running
    /// count, and whether the sampler is active.
    ///   - inactive            → never
    ///   - count >= maxPhotos  → never (silent stop)
    ///   - no prior capture    → yes (first frame while active)
    ///   - otherwise           → only once `autoInterval` has elapsed
    public static func shouldCapture(now: Date, lastCapture: Date?, count: Int, isActive: Bool) -> Bool {
        guard isActive else { return false }
        guard count < maxPhotos else { return false }
        guard let last = lastCapture else { return true }
        return now.timeIntervalSince(last) >= autoInterval
    }
}

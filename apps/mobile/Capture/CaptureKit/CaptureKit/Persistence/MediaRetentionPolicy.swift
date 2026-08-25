//  MediaRetentionPolicy.swift
//  CaptureKit
//
//  FC-R19 — there was no local media lifecycle at all: `uploadMedia` never
//  cleared a local file after a successful commit, and the only
//  `removeItem` in the app was for scan bundles. At 240 KB/min a single
//  30-minute walk-through adds ~7 MB, on top of photos that already
//  accumulate. This is the pure soft-cap math; `CaptureStore` reads it to
//  drive the sweep over already-receipted media files.

import Foundation

public enum MediaRetentionPolicy {
    /// Above this, the sweep deletes oldest-first among files that are already
    /// receipted. Nothing un-receipted is ever deleted.
    public static let softCapBytes: Int64 = 512 * 1024 * 1024
    public static func overage(totalBytes: Int64) -> Int64 {
        max(0, totalBytes - softCapBytes)
    }
}

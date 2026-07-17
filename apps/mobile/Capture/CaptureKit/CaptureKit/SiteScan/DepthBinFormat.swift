//  DepthBinFormat.swift
//  CaptureKit
//
//  The wire contract for the Field depth `.bin` file's fixed header (Field Capture
//  P1 · item 3). Kept in CaptureKit — pure Foundation, no ARKit/CoreVideo — so the
//  on-device writer (`FieldDepthRecorder`) and any future reader share ONE definition
//  of the magic/version/flags, and the flag byte is unit-testable (the app-target
//  recorder that reads CVPixelBuffers is not). Same wire-contract-in-CaptureKit
//  pattern as `FieldPhotoEntry` / `RoomScanStoragePath`.
//
//  Header layout (little-endian), followed by the depth + optional confidence planes:
//    magic   : 4 bytes  "PFD1"
//    version : UInt16   = 1
//    flags   : UInt16   bit0 = smoothed source, bit1 = confidence plane present
//    width   : UInt32
//    height  : UInt32
//
//  The `flags` byte is the single source of truth for whether a confidence plane
//  follows; the recorder derives BOTH this flag AND the index NDJSON's
//  `hasConfidence` field from the same packed-plane result, so they can never
//  disagree (a resolution-mismatched confidence map drops the plane AND clears the
//  flag AND clears the index field in lockstep).

import Foundation

public enum DepthBinFormat {

    /// File magic ("Patina Field Depth v1").
    public static let magic = "PFD1"
    /// Header version.
    public static let version: UInt16 = 1
    /// Depth was sourced from `smoothedSceneDepth` (vs plain `sceneDepth`).
    public static let smoothedFlag: UInt16 = 0x0001
    /// A confidence plane follows the depth plane.
    public static let confidenceFlag: UInt16 = 0x0002

    /// Compose the header flag byte. `hasConfidence` MUST be derived from whether a
    /// confidence plane was actually packed (not merely whether the source map was
    /// present), so the flag and the index field stay in lockstep.
    public static func flags(smoothed: Bool, hasConfidence: Bool) -> UInt16 {
        var f: UInt16 = 0
        if smoothed { f |= smoothedFlag }
        if hasConfidence { f |= confidenceFlag }
        return f
    }
}

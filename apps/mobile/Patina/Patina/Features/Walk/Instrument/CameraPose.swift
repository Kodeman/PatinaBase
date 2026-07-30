//
//  CameraPose.swift
//  Patina
//
//  Row-major 4×4 camera-transform accessors for the instrument substrate.
//
//  PORTED FROM Patina Field:
//    - apps/mobile/Capture/Capture/Features/SiteScan/FieldKeyframeRecorder.swift
//      (`rowMajorFloat(_:)`, lines 194–201) — the ARKit `simd_float4x4` → row-major
//      `[Float]` flatten every Field index lane uses.
//    - apps/mobile/Capture/Capture/Features/SiteScan/FieldCoverageCoach.swift
//      (lines 77–80) — camera position from `transform.columns.3` and the forward
//      vector as the NEGATED `columns.2` ("ARKit camera looks down its local -Z").
//
//  Field derives both directly from `ARFrame.camera.transform`; that step is the
//  only ARKit-bound part and stays in the later wiring wave. What lives here is the
//  pure index arithmetic — the part that is easy to get silently wrong (a sign flip
//  on `forward`, or reading the translation from a column-major layout) and is
//  therefore worth pinning in a test now.
//
//  Row-major layout (length 16), matching `KeyframeGate`:
//      [ m00 m01 m02 tx ]   indices  0  1  2  3
//      [ m10 m11 m12 ty ]            4  5  6  7
//      [ m20 m21 m22 tz ]            8  9 10 11
//      [  0   0   0   1 ]           12 13 14 15
//
//  `nonisolated` is deliberate: Patina builds with
//  SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor, so an unmarked declaration here would
//  become implicitly `@MainActor` — wrong for something a capture callback calls at
//  frame rate. Same reason `ScanManifest.swift` carries `nonisolated`.
//

import Foundation

nonisolated public enum CameraPose {

    /// Element count of a row-major 4×4 transform.
    public static let elementCount = 16

    /// World-space camera position — the translation column (indices 3, 7, 11).
    /// `nil` when the array is too short to carry a translation.
    public static func position(_ transform: [Float]) -> SIMD3<Float>? {
        guard transform.count >= 12 else { return nil }
        return SIMD3<Float>(transform[3], transform[7], transform[11])
    }

    /// World-space camera forward — the NEGATED third basis column
    /// (indices 2, 6, 10). ARKit's camera looks down its local -Z, so the forward
    /// vector is `-columns.2`; dropping the negation points the coverage cone
    /// backwards and every surface silently reads unobserved.
    public static func forward(_ transform: [Float]) -> SIMD3<Float>? {
        guard transform.count >= CameraPose.elementCount else { return nil }
        return SIMD3<Float>(-transform[2], -transform[6], -transform[10])
    }
}

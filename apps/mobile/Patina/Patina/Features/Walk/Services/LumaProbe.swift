//
//  LumaProbe.swift
//  Patina
//
//  PORTED FROM Patina Field:
//    apps/mobile/Capture/Capture/Features/SiteScan/LumaProbe.swift
//
//  Cheap decimated-luma extraction from an ARFrame's Y plane, shared by the
//  keyframe gate's sharpness decision and the coverage coach's blur-streak
//  warning — one nearest-sample decimation, no duplication. The pure metric
//  (`Sharpness.varianceOfLaplacian`) consumes `LumaGrid.samples`.
//
//  ── The decimation arithmetic is NOT restated here ───────────────────────────
//  Field's probe inlines `step = max(1, w / targetWidth); outW = w / step; …`.
//  That arithmetic decides the sample count, and therefore the absolute scale of
//  every sharpness score — which `KeyframeGate.standard.sharpnessThreshold =
//  10.0` is calibrated against. A second copy that drifted would move every
//  score out from under the threshold with no test noticing, so the port put it
//  in the substrate as `LumaDecimation.plan(sourceWidth:sourceHeight:)` /
//  `sourceIndex(column:row:bytesPerRow:)` (pinned in `InstrumentSharpnessTests`)
//  and this file calls it. What is left here is the part that genuinely needs
//  CoreVideo: locking the buffer and reading plane 0.
//
//  `nonisolated` — the keyframe lane calls this at up to ~10 Hz off the gate's
//  debounce, and Patina sets SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor.
//

import Foundation
import CoreVideo

/// A decimated single-channel luma grid.
nonisolated struct LumaGrid: Sendable, Equatable {
    let samples: [UInt8]
    let width: Int
    let height: Int
}

nonisolated enum LumaProbe {

    /// Decimate the Y (luma) plane to ~`targetWidth` wide by nearest-sample
    /// decimation — a coarse proxy (documented as such), enough to separate
    /// sharp from blurred without touching the full-res image.
    ///
    /// Returns `nil` for a non-planar buffer, an unreadable base address, or a
    /// grid that would be smaller than 3×3 (below which
    /// `Sharpness.varianceOfLaplacian` has no interior and returns 0 anyway).
    static func decimatedLuma(_ pixelBuffer: CVPixelBuffer,
                              targetWidth: Int = LumaDecimation.defaultTargetWidth) -> LumaGrid? {
        guard CVPixelBufferGetPlaneCount(pixelBuffer) >= 1 else { return nil }
        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0) else { return nil }

        let sourceWidth = CVPixelBufferGetWidthOfPlane(pixelBuffer, 0)
        let sourceHeight = CVPixelBufferGetHeightOfPlane(pixelBuffer, 0)
        let bytesPerRow = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
        guard let plan = LumaDecimation.plan(sourceWidth: sourceWidth,
                                             sourceHeight: sourceHeight,
                                             targetWidth: targetWidth) else { return nil }

        let pointer = base.assumingMemoryBound(to: UInt8.self)
        var samples = [UInt8](repeating: 0, count: plan.width * plan.height)
        for row in 0..<plan.height {
            for column in 0..<plan.width {
                samples[row * plan.width + column] =
                    pointer[plan.sourceIndex(column: column, row: row, bytesPerRow: bytesPerRow)]
            }
        }
        return LumaGrid(samples: samples, width: plan.width, height: plan.height)
    }
}

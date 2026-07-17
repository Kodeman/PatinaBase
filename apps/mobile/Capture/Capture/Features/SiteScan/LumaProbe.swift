//  LumaProbe.swift
//  Capture · Wave F (Pro site-scan) · Field Capture P1 · item 4/5
//
//  Cheap decimated-luma extraction from an ARFrame's Y plane, shared by the
//  keyframe recorder's sharpness gate (item 4) and the coach's blur-streak warning
//  (item 5) — one nearest-sample decimation, no duplication. The pure sharpness
//  metric (`Sharpness.varianceOfLaplacian`, CaptureKit) consumes `LumaGrid.samples`.

import Foundation

#if canImport(ARKit)
import CoreVideo

/// A decimated single-channel luma grid.
struct LumaGrid {
    let samples: [UInt8]
    let width: Int
    let height: Int
}

enum LumaProbe {

    /// Decimate the Y (luma) plane to ~`targetWidth` wide by nearest-sample
    /// decimation — a coarse proxy (documented), enough to separate sharp from
    /// blurred without touching the full-res image. Returns nil for a non-planar or
    /// too-small buffer.
    static func decimatedLuma(_ pixelBuffer: CVPixelBuffer, targetWidth: Int = 160) -> LumaGrid? {
        guard CVPixelBufferGetPlaneCount(pixelBuffer) >= 1 else { return nil }
        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0) else { return nil }
        let w = CVPixelBufferGetWidthOfPlane(pixelBuffer, 0)
        let h = CVPixelBufferGetHeightOfPlane(pixelBuffer, 0)
        let stride = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
        let step = max(1, w / targetWidth)
        let outW = w / step
        let outH = h / step
        guard outW >= 3, outH >= 3 else { return nil }
        let ptr = base.assumingMemoryBound(to: UInt8.self)
        var samples = [UInt8](repeating: 0, count: outW * outH)
        for oy in 0..<outH {
            let srcRow = (oy * step) * stride
            for ox in 0..<outW {
                samples[oy * outW + ox] = ptr[srcRow + ox * step]
            }
        }
        return LumaGrid(samples: samples, width: outW, height: outH)
    }
}
#endif

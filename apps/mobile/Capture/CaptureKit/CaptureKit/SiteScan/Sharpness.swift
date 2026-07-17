//  Sharpness.swift
//  CaptureKit
//
//  Pure image-sharpness metric for the Field keyframe gate (Field Capture P1 ·
//  item 4). Variance of the discrete Laplacian over a single-channel (luma) buffer
//  — the classic "variance of Laplacian" focus measure: a blurred frame has little
//  high-frequency energy so its Laplacian is near-flat (low variance); a sharp
//  frame has strong edges (high variance).
//
//  Operates on a plain `[UInt8]` luma buffer abstraction so it is PURE Foundation
//  and unit-testable with hand-built grids (no CVPixelBuffer, no vImage, no
//  device). The app-target keyframe recorder extracts a small DECIMATED luma grid
//  from the ARFrame's Y plane (cheap, sparse — only on motion-triggered frames) and
//  feeds it here, so the expensive per-pixel work stays off the full-res image.
//
//  The absolute value is content- and downsample-dependent (it is a proxy, not a
//  calibrated blur measurement — documented like the coverage heuristic); the gate
//  compares it against a tunable threshold and records the rejection ratio.

import Foundation

public enum Sharpness {

    /// Variance of the 4-neighbour discrete Laplacian over the interior pixels of a
    /// row-major single-channel buffer. Higher = sharper. Returns 0 for a buffer
    /// too small to have an interior (< 3×3) or an undersized backing array.
    ///
    /// - Parameters:
    ///   - luma: row-major luma samples, length ≥ `width * height`.
    ///   - width: buffer width in samples (≥ 3 for a non-zero result).
    ///   - height: buffer height in samples (≥ 3 for a non-zero result).
    public static func varianceOfLaplacian(luma: [UInt8], width: Int, height: Int) -> Double {
        guard width >= 3, height >= 3, luma.count >= width * height else { return 0 }

        // Single-pass Welford — population variance of the interior 4-neighbour
        // Laplacian, no intermediate array.
        var count = 0
        var mean = 0.0
        var m2 = 0.0
        for y in 1..<(height - 1) {
            let rowUp = (y - 1) * width
            let row = y * width
            let rowDown = (y + 1) * width
            for x in 1..<(width - 1) {
                let center = Double(luma[row + x])
                let up = Double(luma[rowUp + x])
                let down = Double(luma[rowDown + x])
                let left = Double(luma[row + x - 1])
                let right = Double(luma[row + x + 1])
                let laplacian = up + down + left + right - 4 * center
                count += 1
                let delta = laplacian - mean
                mean += delta / Double(count)
                m2 += delta * (laplacian - mean)
            }
        }
        return count > 0 ? m2 / Double(count) : 0
    }
}

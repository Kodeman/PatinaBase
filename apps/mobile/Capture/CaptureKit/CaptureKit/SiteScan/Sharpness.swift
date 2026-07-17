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

        let interiorCount = (width - 2) * (height - 2)
        var laplacians = [Double](repeating: 0, count: interiorCount)
        var k = 0
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
                laplacians[k] = up + down + left + right - 4 * center
                k += 1
            }
        }

        guard interiorCount > 0 else { return 0 }
        let mean = laplacians.reduce(0, +) / Double(interiorCount)
        let variance = laplacians.reduce(0) { $0 + ($1 - mean) * ($1 - mean) } / Double(interiorCount)
        return variance
    }
}

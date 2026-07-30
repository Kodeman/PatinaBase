//
//  Sharpness.swift
//  Patina
//
//  PORTED FROM Patina Field:
//    - apps/mobile/Capture/CaptureKit/CaptureKit/SiteScan/Sharpness.swift
//      (`varianceOfLaplacian` — carried verbatim)
//    - apps/mobile/Capture/Capture/Features/SiteScan/LumaProbe.swift
//      (the decimation ARITHMETIC only — see `LumaDecimation` below)
//
//  Variance of the discrete Laplacian over a single-channel (luma) buffer — the
//  classic "variance of Laplacian" focus measure: a blurred frame has little
//  high-frequency energy so its Laplacian is near-flat (low variance); a sharp
//  frame has strong edges (high variance).
//
//  Operates on a plain `[UInt8]` luma buffer so it is PURE Foundation and
//  unit-testable with hand-built grids (no CVPixelBuffer, no vImage, no device).
//  The live wiring wave extracts a small DECIMATED luma grid from the ARFrame's Y
//  plane (cheap, sparse — only on motion-triggered frames) and feeds it here.
//
//  The absolute value is content- and downsample-dependent (a proxy, not a
//  calibrated blur measurement); the gate compares it against a tunable threshold.
//
//  ISOLATION: `nonisolated` — Patina's project-level
//  SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor would otherwise bind this to the main
//  actor. See the note in `KeyframeGate.swift`.
//

import Foundation

nonisolated public enum Sharpness {

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

        // Single-pass Welford — POPULATION variance (divide by count, not count-1)
        // of the interior 4-neighbour Laplacian, no intermediate array.
        var count = 0
        var mean = 0.0
        var sumSquares = 0.0
        for row in 1..<(height - 1) {
            let rowUpBase = (row - 1) * width
            let rowBase = row * width
            let rowDownBase = (row + 1) * width
            for column in 1..<(width - 1) {
                let center = Double(luma[rowBase + column])
                let up = Double(luma[rowUpBase + column])
                let down = Double(luma[rowDownBase + column])
                let left = Double(luma[rowBase + column - 1])
                let right = Double(luma[rowBase + column + 1])
                let laplacian = up + down + left + right - 4 * center
                count += 1
                let delta = laplacian - mean
                mean += delta / Double(count)
                sumSquares += delta * (laplacian - mean)
            }
        }
        return count > 0 ? sumSquares / Double(count) : 0
    }
}

// MARK: - Luma decimation plan

/// The pure half of Field's `LumaProbe.decimatedLuma(_:targetWidth:)`.
///
/// Field's probe locks a `CVPixelBuffer`, reads plane 0, and walks it with a
/// nearest-sample stride. The CVPixelBuffer access CANNOT be expressed without
/// CoreVideo and stays in the later wiring wave; the STRIDE ARITHMETIC (which
/// decides the sample count, and therefore the absolute scale of every sharpness
/// score the thresholds are calibrated against) is pure and lives here so the
/// wiring wave cannot silently pick a different decimation and shift the scores
/// out from under `KeyframeGate.standard.sharpnessThreshold`.
nonisolated public struct LumaDecimation: Sendable, Equatable {

    /// Nearest-sample stride in source pixels.
    public let step: Int
    /// Decimated grid width in samples.
    public let width: Int
    /// Decimated grid height in samples.
    public let height: Int

    public init(step: Int, width: Int, height: Int) {
        self.step = step
        self.width = width
        self.height = height
    }

    /// Field's default target width for the decimated grid
    /// (`LumaProbe.decimatedLuma(_:targetWidth: 160)`).
    public static let defaultTargetWidth = 160

    /// Plan the decimation for a source plane, or `nil` when the resulting grid
    /// would be smaller than 3×3 (the minimum `Sharpness.varianceOfLaplacian`
    /// needs an interior for). Mirrors LumaProbe.swift lines 35–38 exactly:
    ///     step = max(1, w / targetWidth); outW = w / step; outH = h / step
    ///     guard outW >= 3, outH >= 3
    public static func plan(sourceWidth: Int,
                            sourceHeight: Int,
                            targetWidth: Int = LumaDecimation.defaultTargetWidth) -> LumaDecimation? {
        guard sourceWidth > 0, sourceHeight > 0, targetWidth > 0 else { return nil }
        let step = max(1, sourceWidth / targetWidth)
        let outWidth = sourceWidth / step
        let outHeight = sourceHeight / step
        guard outWidth >= 3, outHeight >= 3 else { return nil }
        return LumaDecimation(step: step, width: outWidth, height: outHeight)
    }

    /// Index into the SOURCE plane for decimated sample (`column`, `row`), given the
    /// plane's bytes-per-row. Mirrors LumaProbe.swift lines 41–46.
    public func sourceIndex(column: Int, row: Int, bytesPerRow: Int) -> Int {
        (row * step) * bytesPerRow + column * step
    }
}

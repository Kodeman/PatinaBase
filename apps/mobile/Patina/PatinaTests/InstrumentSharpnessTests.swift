//
//  InstrumentSharpnessTests.swift
//  PatinaTests
//
//  Pins the ported variance-of-Laplacian focus measure and the luma decimation
//  plan against Patina Field
//  (apps/mobile/Capture/CaptureKit/CaptureKit/SiteScan/Sharpness.swift and
//  apps/mobile/Capture/Capture/Features/SiteScan/LumaProbe.swift).
//
//  The absolute values matter: `KeyframeGate.standard.sharpnessThreshold` (10.0) and
//  `CoverageCoachRules.coachSharpnessFloor` (8.0) are calibrated against THIS
//  metric on a grid decimated by THIS plan. Both are pinned by value here so a
//  reimplementation (sample variance instead of population, a 3×3 kernel instead of
//  4-neighbour, a different decimation) fails loudly instead of quietly moving
//  every score.
//

import Testing
import Foundation
@testable import Patina

struct InstrumentSharpnessTests {

    /// Row-major grid from a per-pixel generator.
    private static func grid(width: Int, height: Int, _ make: (Int, Int) -> UInt8) -> [UInt8] {
        var out = [UInt8]()
        out.reserveCapacity(width * height)
        for row in 0..<height {
            for column in 0..<width { out.append(make(column, row)) }
        }
        return out
    }

    // MARK: - Absolute values

    @Test
    func checkerboardVarianceIsPinnedByValue() {
        // 5×5 black/white checkerboard: 9 interior Laplacians of ±1020, five of them
        // negative. Population variance = 1020² − (1020/9)² = 1027555.5555555555…
        // Computed independently, not derived from the implementation.
        let luma = Self.grid(width: 5, height: 5) { column, row in
            (row + column).isMultiple(of: 2) ? 255 : 0
        }
        let value = Sharpness.varianceOfLaplacian(luma: luma, width: 5, height: 5)
        #expect(abs(value - 1_027_555.5555555555) < 1e-6)
    }

    @Test
    func hardAndSoftEdgesArePinnedAndOrdered() {
        // A step edge and the same edge smeared over two columns. Real numbers, not
        // just "sharp > blurred" — the ratio is what the 10.0 threshold rides on.
        let smear: [UInt8] = [0, 0, 85, 170, 255, 255]
        let hard = Self.grid(width: 6, height: 6) { column, _ in column < 3 ? 0 : 255 }
        let soft = Self.grid(width: 6, height: 6) { column, _ in smear[column] }
        let hardValue = Sharpness.varianceOfLaplacian(luma: hard, width: 6, height: 6)
        let softValue = Sharpness.varianceOfLaplacian(luma: soft, width: 6, height: 6)
        #expect(abs(hardValue - 32_512.5) < 1e-6)
        #expect(abs(softValue - 3_612.5) < 1e-6)
        #expect(hardValue > softValue)
    }

    @Test
    func aLinearRampHasExactlyZeroVariance() {
        // A first-derivative metric would report a large value here. The Laplacian of
        // a linear ramp is identically zero, so this separates the two.
        let luma = Self.grid(width: 8, height: 8) { column, _ in UInt8(column * 32) }
        #expect(Sharpness.varianceOfLaplacian(luma: luma, width: 8, height: 8) == 0)
    }

    @Test
    func aFlatFieldHasZeroVariance() {
        let luma = [UInt8](repeating: 128, count: 64)
        #expect(Sharpness.varianceOfLaplacian(luma: luma, width: 8, height: 8) == 0)
    }

    // MARK: - Guards

    @Test
    func gridsWithoutAnInteriorReturnZero() {
        let tiny = [UInt8](repeating: 255, count: 4)
        #expect(Sharpness.varianceOfLaplacian(luma: tiny, width: 2, height: 2) == 0)
        #expect(Sharpness.varianceOfLaplacian(luma: tiny, width: 4, height: 1) == 0)
        #expect(Sharpness.varianceOfLaplacian(luma: [], width: 0, height: 0) == 0)
    }

    @Test
    func anUndersizedBackingArrayReturnsZeroRatherThanTrapping() {
        // 5×5 claimed, 10 samples supplied — must not index out of bounds.
        let short = [UInt8](repeating: 200, count: 10)
        #expect(Sharpness.varianceOfLaplacian(luma: short, width: 5, height: 5) == 0)
    }

    @Test
    func scoreIsInvariantToExtraTrailingSamples() {
        let exact = Self.grid(width: 5, height: 5) { column, row in
            (row + column).isMultiple(of: 2) ? 255 : 0
        }
        let padded = exact + [UInt8](repeating: 7, count: 11)
        #expect(Sharpness.varianceOfLaplacian(luma: exact, width: 5, height: 5)
                == Sharpness.varianceOfLaplacian(luma: padded, width: 5, height: 5))
    }

    // MARK: - Luma decimation plan

    @Test
    func decimationTargetWidthIsCarriedAcross() {
        #expect(LumaDecimation.defaultTargetWidth == 160)
    }

    @Test
    func decimationStridesToTheTargetWidth() {
        // 1920×1440 (a typical ARKit Y plane) decimates 12:1 to 160×120.
        let plan = LumaDecimation.plan(sourceWidth: 1920, sourceHeight: 1440)
        #expect(plan == LumaDecimation(step: 12, width: 160, height: 120))
        // 640×480 ⇒ 4:1; 320×240 ⇒ 2:1.
        #expect(LumaDecimation.plan(sourceWidth: 640, sourceHeight: 480)
                == LumaDecimation(step: 4, width: 160, height: 120))
        #expect(LumaDecimation.plan(sourceWidth: 320, sourceHeight: 240)
                == LumaDecimation(step: 2, width: 160, height: 120))
    }

    @Test
    func aSourceNarrowerThanTheTargetIsNotUpsampled() {
        // step clamps at 1 — the grid is the source, never larger.
        #expect(LumaDecimation.plan(sourceWidth: 10, sourceHeight: 8)
                == LumaDecimation(step: 1, width: 10, height: 8))
    }

    @Test
    func planReturnsNilBelowTheThreeByThreeFloor() {
        #expect(LumaDecimation.plan(sourceWidth: 2, sourceHeight: 2) == nil)
        #expect(LumaDecimation.plan(sourceWidth: 100, sourceHeight: 2) == nil)
        #expect(LumaDecimation.plan(sourceWidth: 0, sourceHeight: 0) == nil)
    }

    @Test
    func sourceIndexWalksTheStrideAndHonoursRowPadding() {
        guard let plan = LumaDecimation.plan(sourceWidth: 640, sourceHeight: 480) else {
            Issue.record("plan should exist for 640×480")
            return
        }
        // step 4, bytesPerRow 704 (a padded plane, not width): row 2 of the decimated
        // grid reads source row 8, and column 3 reads source column 12.
        #expect(plan.sourceIndex(column: 0, row: 0, bytesPerRow: 704) == 0)
        #expect(plan.sourceIndex(column: 3, row: 0, bytesPerRow: 704) == 12)
        #expect(plan.sourceIndex(column: 0, row: 2, bytesPerRow: 704) == 8 * 704)
        #expect(plan.sourceIndex(column: 3, row: 2, bytesPerRow: 704) == 8 * 704 + 12)
    }
}

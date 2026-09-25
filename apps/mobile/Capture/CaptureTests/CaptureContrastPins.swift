//
//  CaptureContrastPins.swift
//  CaptureTests
//
//  W1A-06 (SQ-225): the Field contrast oracle. Two call sites drew a dynamic
//  ink (`CaptureColor.ink`, i.e. `Text.primary`) over a FIXED fill —
//  `CaptureColor.goldenHour` on the affirmation chip, `CaptureColor.warning`
//  on the offline queue banner's count pill. `Text.primary` is deliberately
//  light in dark mode, so on a fill that never darkens that measured ~1.6:1
//  (chip) and ~2.1:1 (pill) — both well under the 4.5:1 body-text bar. Both
//  were fixed the same way: fixed `PatinaColors.charcoal` ink on the fixed
//  fill, which holds in both appearances by construction. Every number below
//  is the real resolved token (see `CaptureContrast`), not a hex literal read
//  out of the source.
//
//  `CaptureTests` cannot `import PatinaDesignKit` directly — the generated
//  project links it into the `Capture` app target and the `CaptureKit`
//  framework only (scripts/generate_project.rb: "CaptureKit / CaptureKitMocks
//  / CaptureTests must NOT link these" — the SDK-linking rule extends to the
//  design package too, since `CaptureColor` is the intended facade). So the
//  fixed ink is pinned here as the resolved value `PatinaColors.charcoal`
//  is documented to be, and `charcoalSourceStillMatchesThePinnedValue` below
//  keeps that pin honest against the real source.
//

import Testing
import SwiftUI
import UIKit
import CaptureKit

struct CaptureContrastPins {

    /// `PatinaColors.charcoal` (apps/mobile/PatinaDesignKit/Sources/
    /// PatinaDesignKit/Tokens/PatinaColors.swift) — a fixed, non-adaptive
    /// token, so its value does not depend on which appearance it resolves
    /// in and pinning the literal here (rather than the token itself, which
    /// this target cannot link) is safe as long as the source pin below
    /// keeps agreeing with it.
    private static let charcoal = Color(hex: 0x2C2926)

    @Test("the pinned charcoal literal still matches PatinaColors.charcoal's source")
    func charcoalSourceStillMatchesThePinnedValue() throws {
        let source = try SourcePin.readCode(
            "../PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaColors.swift"
        )
        #expect(
            source.contains(#"charcoal = Color(hex: "2C2926")"#),
            "PatinaColors.charcoal's hex literal moved — update the pinned value in CaptureContrastPins"
        )
    }

    // MARK: - FieldAffirmationChip (Features/Capture/FieldAffirmationChip.swift:21)

    @Test("the affirmation chip's label ink clears AA on its fixed fill, in both appearances")
    func affirmationChipInkClearsAA() {
        for style in CaptureContrast.appearances {
            let measured = CaptureContrast.ratio(Self.charcoal, on: CaptureColor.goldenHour, style)
            #expect(
                measured >= 4.5,
                "PatinaColors.charcoal on CaptureColor.goldenHour in \(CaptureContrast.name(style)) is \(CaptureContrast.rounded(measured)):1, below the 4.5:1 body bar"
            )
        }
    }

    /// The counterfactual: the dynamic ink the chip used to draw, so "the
    /// token was fine" is met with the number rather than an opinion.
    @Test("the counterfactual: the chip's old dynamic ink still cannot carry goldenHour in dark mode")
    func affirmationChipDynamicInkStillFailsInDark() {
        let measured = CaptureContrast.ratio(CaptureColor.ink, on: CaptureColor.goldenHour, .dark)
        #expect(
            measured < 4.5,
            "CaptureColor.ink on CaptureColor.goldenHour in dark is now \(CaptureContrast.rounded(measured)):1 — if this passes, the finding's premise changed"
        )
    }

    @Test("the affirmation chip's source draws its label with the fixed charcoal ink")
    func affirmationChipSourceUsesFixedInk() throws {
        let source = try SourcePin.readCode("Capture/Features/Capture/FieldAffirmationChip.swift")
        #expect(source.contains("PatinaColors.charcoal"), "FieldAffirmationChip no longer references PatinaColors.charcoal")
        #expect(!source.contains(".foregroundStyle(CaptureColor.ink)"), "FieldAffirmationChip regressed to the dynamic CaptureColor.ink")
    }

    // MARK: - OfflineQueueBanner (Features/Resilience/OfflineQueueBanner.swift:49)

    @Test("the offline queue banner's count-pill ink clears AA on its fixed fill, in both appearances")
    func queueBannerPillInkClearsAA() {
        for style in CaptureContrast.appearances {
            let measured = CaptureContrast.ratio(Self.charcoal, on: CaptureColor.warning, style)
            #expect(
                measured >= 4.5,
                "PatinaColors.charcoal on CaptureColor.warning in \(CaptureContrast.name(style)) is \(CaptureContrast.rounded(measured)):1, below the 4.5:1 body bar"
            )
        }
    }

    /// The counterfactual: the dynamic ink the pill used to draw.
    @Test("the counterfactual: the pill's old dynamic ink still cannot carry warning in dark mode")
    func queueBannerDynamicInkStillFailsInDark() {
        let measured = CaptureContrast.ratio(CaptureColor.ink, on: CaptureColor.warning, .dark)
        #expect(
            measured < 4.5,
            "CaptureColor.ink on CaptureColor.warning in dark is now \(CaptureContrast.rounded(measured)):1 — if this passes, the finding's premise changed"
        )
    }

    @Test("the offline queue banner's source draws the count pill with the fixed charcoal ink")
    func queueBannerSourceUsesFixedInk() throws {
        let source = try SourcePin.readCode("Capture/Features/Resilience/OfflineQueueBanner.swift")
        #expect(source.contains("PatinaColors.charcoal"), "OfflineQueueBanner no longer references PatinaColors.charcoal")
        #expect(!source.contains(".foregroundStyle(CaptureColor.ink)"), "OfflineQueueBanner regressed to the dynamic CaptureColor.ink")
    }
}

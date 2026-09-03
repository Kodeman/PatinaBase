//
//  ContrastTests.swift
//  PatinaTests
//
//  The contrast bar this program set, applied to the tokens the design system
//  publishes, in BOTH appearances (PROGRAM.md §3 · L1-D):
//
//    body text                    >= 4.5:1
//    meta / de-emphasised text    >= 3:1
//    filled-button label on fill  >= 4.5:1
//
//  Every number in a failure message is the real resolved token, not a hex
//  literal read out of the source — see `PatinaContrast`.
//
//  Findings: A-73, A-90, C-20, C3-05, C3-06.
//

import Testing
import SwiftUI
import UIKit
@testable import Patina

struct ContrastTests {

    // The two grounds every screen paints on.
    private static let grounds: [(String, Color)] = [
        ("Background.primary", PatinaColors.Background.primary),
        ("Background.secondary", PatinaColors.Background.secondary)
    ]

    @Test("the instrument agrees with the arithmetic the findings were scored on")
    func theInstrumentIsCalibrated() {
        // A-73/A-90's number: offWhite on clay.
        let clay = PatinaContrast.ratio(PatinaColors.offWhite, on: PatinaColors.clay, .light)
        #expect(abs(clay - 2.18) < 0.02, "offWhite on clay measured \(PatinaContrast.rounded(clay)):1, the findings scored 2.18:1")

        // The pairing the design system already had right.
        let primary = PatinaContrast.ratio(PatinaColors.offWhite, on: PatinaColors.charcoal, .light)
        #expect(abs(primary - 13.53) < 0.05, "offWhite on charcoal measured \(PatinaContrast.rounded(primary)):1, expected 13.53:1")
    }

    @Test("body text clears AA on both grounds, in both appearances")
    func bodyTextClearsAA() {
        let body: [(String, Color)] = [
            ("Text.primary", PatinaColors.Text.primary),
            ("Text.secondary", PatinaColors.Text.secondary),
            // `Text.error` is ink at fifteen sites — "Overdue" on the Today
            // Record card, the past-due line on invoices, decisions and
            // proposals, and every sheet's validation message. It is prose a
            // tester has to read, so it takes the body bar, not the 3:1
            // non-text bar. `PatinaColors.error` itself computes 3.03:1 on the
            // light canvas, which is what put it here.
            ("Text.error", PatinaColors.Text.error)
        ]
        for style in PatinaContrast.appearances {
            for (inkName, ink) in body {
                for (groundName, ground) in Self.grounds {
                    let measured = PatinaContrast.ratio(ink, on: ground, style)
                    #expect(
                        measured >= 4.5,
                        "\(inkName) on \(groundName) in \(PatinaContrast.name(style)) is \(PatinaContrast.rounded(measured)):1, below the 4.5:1 body bar"
                    )
                }
            }
        }
    }

    @Test("meta text clears the 3:1 bar on both grounds, in both appearances")
    func metaTextClearsTheMetaBar() {
        for style in PatinaContrast.appearances {
            for (groundName, ground) in Self.grounds {
                let measured = PatinaContrast.ratio(PatinaColors.Text.muted, on: ground, style)
                #expect(
                    measured >= 3.0,
                    "Text.muted on \(groundName) in \(PatinaContrast.name(style)) is \(PatinaContrast.rounded(measured)):1, below the 3:1 meta bar"
                )
            }
        }
    }

    /// `C-20`. The rendered failure the walker measured — meta 2.66:1, body
    /// 4.27:1 on `shots/C/06-dark-launch-2.0s.png` — is a token with no
    /// headroom, not a call site with an opacity: a 10 pt DM Mono stroke
    /// antialiases to roughly 55 % of the way from ground to ink, so a 5.94:1
    /// token renders at 2.66:1. The bar below is the headroom that survives
    /// that, on the card, which is the surface those rows sit on.
    @Test("the dark de-emphasised ramp carries antialiasing headroom, and stays ordered")
    func darkModeDeEmphasisedInk() {
        let card = PatinaColors.Background.secondary
        let primary = PatinaContrast.ratio(PatinaColors.Text.primary, on: card, .dark)
        let secondary = PatinaContrast.ratio(PatinaColors.Text.secondary, on: card, .dark)
        let muted = PatinaContrast.ratio(PatinaColors.Text.muted, on: card, .dark)

        #expect(secondary >= 9.0, "dark Text.secondary on the card is \(PatinaContrast.rounded(secondary)):1; C-20 measured it rendering at 4.27:1")
        #expect(muted >= 7.0, "dark Text.muted on the card is \(PatinaContrast.rounded(muted)):1; C-20 measured it rendering at 2.66:1")

        // Raising the ramp must not flatten it.
        #expect(primary > secondary, "the dark ramp lost its order: primary \(PatinaContrast.rounded(primary)) is not above secondary \(PatinaContrast.rounded(secondary))")
        #expect(secondary > muted, "the dark ramp lost its order: secondary \(PatinaContrast.rounded(secondary)) is not above muted \(PatinaContrast.rounded(muted))")
    }

    /// `A-73`. `Text.interactive` is a label a tester is meant to tap, not
    /// decoration; it takes the body bar.
    @Test("interactive ink clears AA on both grounds, in both appearances")
    func interactiveInkClearsAA() {
        for style in PatinaContrast.appearances {
            for (groundName, ground) in Self.grounds {
                let measured = PatinaContrast.ratio(PatinaColors.Text.interactive, on: ground, style)
                #expect(
                    measured >= 4.5,
                    "Text.interactive on \(groundName) in \(PatinaContrast.name(style)) is \(PatinaContrast.rounded(measured)):1, below 4.5:1"
                )
            }
        }
    }

    /// `A-73`, `A-90`, `C3-05`. Every filled style the button component
    /// publishes, label against its own fill.
    ///
    /// `.secondary` is excluded here and measured separately below: its "fill"
    /// is `Background.primary`, i.e. the page colour, so measuring its label
    /// against it re-measures body-text-on-page — which `bodyTextClearsAA`
    /// already covers — and would stay green in the one case that can actually
    /// fail, a `.secondary` button placed on a card.
    @Test("every filled button puts its label at 4.5:1 or better on its own fill")
    func everyFilledButtonLabelClearsAA() {
        for style in PatinaContrast.appearances {
            for buttonStyle in PatinaButtonStyle.filledCases where buttonStyle != .secondary {
                let measured = PatinaContrast.ratio(
                    buttonStyle.patinaLabelColor,
                    on: buttonStyle.patinaFillColor,
                    style
                )
                #expect(
                    measured >= 4.5,
                    "PatinaButton .\(buttonStyle) label on its fill in \(PatinaContrast.name(style)) is \(PatinaContrast.rounded(measured)):1, below 4.5:1"
                )
            }
        }
    }

    /// `.secondary` paints no fill of its own — it takes the colour of
    /// whatever it is placed on. A secondary button sits on the page on the
    /// Welcome screen and on a card inside a sheet, so its label owes the body
    /// bar against **both** grounds, which is the case the `filledCases` loop
    /// above could not see.
    @Test("the outline button's label holds on both grounds it is used on")
    func secondaryButtonLabelHoldsOnEveryGround() {
        for style in PatinaContrast.appearances {
            for (groundName, ground) in Self.grounds {
                let label = PatinaContrast.ratio(
                    PatinaButtonStyle.secondary.patinaLabelColor, on: ground, style
                )
                #expect(
                    label >= 4.5,
                    "PatinaButton .secondary label on \(groundName) in \(PatinaContrast.name(style)) is \(PatinaContrast.rounded(label)):1, below 4.5:1"
                )
            }
        }
    }

    /// `C3-05`. The tier badge is a 10 pt uppercase numeral on a filled pill —
    /// the exact shape the finding measured at 2.33:1.
    @Test("the tier pill's label clears AA on its own fill")
    func tierPillLabelClearsAA() {
        for style in PatinaContrast.appearances {
            let measured = PatinaContrast.ratio(TierPill.labelColor, on: TierPill.fillColor, style)
            #expect(
                measured >= 4.5,
                "TierPill label on its fill in \(PatinaContrast.name(style)) is \(PatinaContrast.rounded(measured)):1, below 4.5:1"
            )
        }
    }
}

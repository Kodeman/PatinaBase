//
//  PrimaryButtonStyleTests.swift
//  PatinaTests
//
//  `C-41`, `A-90`, `A-73`, `C3-06`, `P-35`, `C3-03`.
//
//  Two competing primary treatments shipped at once: `PatinaButton .clay`
//  (solid tan, on "Sign proposal" and "Pay $4,250.00") and `.primary` (near
//  charcoal / near white). The same tan is also what two auth buttons use for
//  their DISABLED state, so on the app's first interactive screen the accent
//  means "inert" and on the invoice screen it means "commit".
//
//  One filled treatment; disabled is that treatment at reduced opacity; the
//  accent is never a state.
//

import Testing
import SwiftUI
@testable import Patina

struct PrimaryButtonStyleTests {

    /// `C-41`. Not "the two look similar" — the same resolved colour, in both
    /// appearances.
    @Test("there is one filled primary treatment, and .clay is it too")
    func onlyOneFilledPrimaryTreatment() {
        for style in PatinaContrast.appearances {
            let primaryFill = PatinaContrast.components(PatinaButtonStyle.primary.patinaFillColor, style)
            let clayFill = PatinaContrast.components(PatinaButtonStyle.clay.patinaFillColor, style)
            #expect(
                abs(primaryFill.red - clayFill.red) < 0.002
                    && abs(primaryFill.green - clayFill.green) < 0.002
                    && abs(primaryFill.blue - clayFill.blue) < 0.002,
                "in \(PatinaContrast.name(style)) .clay and .primary still fill with different colours — C-41's two competing primaries"
            )

            let primaryLabel = PatinaContrast.components(PatinaButtonStyle.primary.patinaLabelColor, style)
            let clayLabel = PatinaContrast.components(PatinaButtonStyle.clay.patinaLabelColor, style)
            #expect(
                abs(primaryLabel.red - clayLabel.red) < 0.002
                    && abs(primaryLabel.green - clayLabel.green) < 0.002
                    && abs(primaryLabel.blue - clayLabel.blue) < 0.002,
                "in \(PatinaContrast.name(style)) .clay and .primary label in different colours"
            )
        }
    }

    /// `A-90`. The accent tan is the disabled fill on two auth buttons today.
    /// No filled style may use it, so "disabled" can never be mistaken for
    /// "primary" again.
    @Test("no filled button style fills with the accent")
    func theAccentIsNeverAFill() {
        for style in PatinaContrast.appearances {
            let accent = PatinaContrast.components(PatinaColors.clay, style)
            for buttonStyle in PatinaButtonStyle.filledCases {
                let fill = PatinaContrast.components(buttonStyle.patinaFillColor, style)
                #expect(
                    !(abs(accent.red - fill.red) < 0.002 && abs(accent.green - fill.green) < 0.002 && abs(accent.blue - fill.blue) < 0.002),
                    "PatinaButton .\(buttonStyle) fills with the accent in \(PatinaContrast.name(style))"
                )
            }
        }
    }

    /// `A-90`'s second half: the disabled treatment must be a *dimming* of the
    /// enabled one, never a different hue.
    @Test("disabled is the enabled fill at reduced opacity, and nothing else")
    func disabledIsAnOpacityNotAHue() throws {
        let source = try SourcePin.read(
            "../PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaButton.swift"
        )
        #expect(source.contains("opacity(isEnabled ?"), "PatinaButton no longer dims its disabled state")
        // The disabled branch must not reach for a colour of its own.
        #expect(
            !source.contains("isEnabled ? PatinaColors"),
            "PatinaButton picks a different colour when disabled — that is the A-90 pattern"
        )
    }

    /// `A-63` (L1-F's note) and `GAP1B-07` (L1-C's note), both of which resolve
    /// to the same three lines of this lane's component.
    ///
    /// `A-63`: the capsule had no horizontal padding, so under the `.fixedSize()`
    /// `PatinaEmptyState` applies it collapsed to the label's own width — the
    /// guest bell's "Sign in" measured 50.17 × 53.5 pt, a circle cutting its own
    /// text. `GAP1B-07`: `.ghost` has a clear background and no content shape, so
    /// its hit region was the text's bounds — 17.6 pt on both decision sheets.
    @Test("the capsule is wider than its label, and every style's hit region is the capsule")
    func theCapsuleIsAControlNotAnOutline() throws {
        let source = try SourcePin.read(
            "../PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaButton.swift"
        )
        #expect(
            source.contains(".padding(.horizontal, PatinaSpacing.lg)"),
            "PatinaButton has no horizontal padding — A-63"
        )
        #expect(
            source.contains(".contentShape(Capsule())"),
            "PatinaButton's hit region is still the label's bounds for .ghost — GAP1B-07"
        )
        // The padding has to sit INSIDE the frame, or an .infinity-width call
        // site grows by 48 pt and every sheet footer moves.
        let padding = try #require(source.range(of: ".padding(.horizontal, PatinaSpacing.lg)"))
        let frame = try #require(source.range(of: ".frame(maxWidth: style == .ghost ? nil : .infinity)"))
        #expect(padding.lowerBound < frame.lowerBound, "the padding is applied outside the frame")
    }

    /// `P-35` / `C3-03`. Pure black on the warm near-black canvas is 1.27:1 —
    /// the app's first tap target reads as a hole.
    @Test("Sign in with Apple follows the colour scheme")
    func appleButtonStyleFollowsScheme() throws {
        let source = try SourcePin.read(
            "Patina/Features/Authentication/Views/SignInWithAppleButton.swift"
        )
        #expect(
            !source.contains(".signInWithAppleButtonStyle(.black)"),
            "the Apple button is still hard-coded .black — P-35 / C3-03"
        )
        #expect(
            source.contains("@Environment(\\.colorScheme)"),
            "the Apple button does not read the colour scheme"
        )
        #expect(
            source.contains("colorScheme == .dark ? .white : .black"),
            "the Apple button does not switch its style with the scheme"
        )
    }
}

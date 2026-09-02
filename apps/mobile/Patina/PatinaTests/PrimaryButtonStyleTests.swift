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
                abs(primaryFill.r - clayFill.r) < 0.002
                    && abs(primaryFill.g - clayFill.g) < 0.002
                    && abs(primaryFill.b - clayFill.b) < 0.002,
                "in \(PatinaContrast.name(style)) .clay and .primary still fill with different colours — C-41's two competing primaries"
            )

            let primaryLabel = PatinaContrast.components(PatinaButtonStyle.primary.patinaLabelColor, style)
            let clayLabel = PatinaContrast.components(PatinaButtonStyle.clay.patinaLabelColor, style)
            #expect(
                abs(primaryLabel.r - clayLabel.r) < 0.002
                    && abs(primaryLabel.g - clayLabel.g) < 0.002
                    && abs(primaryLabel.b - clayLabel.b) < 0.002,
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
                    !(abs(accent.r - fill.r) < 0.002 && abs(accent.g - fill.g) < 0.002 && abs(accent.b - fill.b) < 0.002),
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

//
//  CompanionOrbAppearanceTests.swift
//  PatinaTests
//
//  `C-01` and `C-02`, the two halves of the Companion in dark mode.
//
//  C-01: the orb's disc is `Background.dark`, a static charcoal. Sampled at
//  (44,41,38) in BOTH appearances — 13.53:1 against the light page and 1.15:1
//  against the dark one, so the disc vanishes and its glyph floats.
//
//  C-02: the panel's status line is `Text.inverse.opacity(0.72)`, and
//  `Text.inverse` flips to #211E1B in dark, which composites to (36,33,30) on
//  the panel — 1.11:1. The title above it stays legible because it uses a
//  static light value. The subtitle needs the same kind of token.
//
//  No shadow is added here. VISION §6 refuses shadows, and `C-01`'s fix line
//  offers "adaptive fill OR border/shadow" — the fill is the half taken.
//

import Testing
import SwiftUI
@testable import Patina

struct CompanionOrbAppearanceTests {

    /// `C-01`. The disc has to be an object on the page in both appearances.
    /// 1.15:1 is not an object.
    @Test("the companion surface is adaptive and reads against the page in both appearances")
    func theCompanionSurfaceIsAdaptive() {
        #expect(
            PatinaContrast.isAdaptive(PatinaColors.Background.dark),
            "Background.dark resolves identically in both appearances — this is C-01's root"
        )
        for style in PatinaContrast.appearances {
            let measured = PatinaContrast.ratio(
                PatinaColors.Background.dark,
                on: PatinaColors.Background.primary,
                style
            )
            #expect(
                measured >= 1.8,
                "the companion surface on the page in \(PatinaContrast.name(style)) is \(PatinaContrast.rounded(measured)):1; C-01 measured 1.15:1 in dark"
            )
        }
    }

    /// Whatever the disc becomes, the mark inside it has to stay legible.
    @Test("light ink on the companion surface stays clear of AA in both appearances")
    func theMarkStaysLegibleOnTheSurface() {
        for style in PatinaContrast.appearances {
            let measured = PatinaContrast.ratio(
                PatinaColors.OnDark.primary,
                on: PatinaColors.Background.dark,
                style
            )
            #expect(
                measured >= 4.5,
                "OnDark.primary on the companion surface in \(PatinaContrast.name(style)) is \(PatinaContrast.rounded(measured)):1"
            )
        }
    }

    /// `C-02`. The token the subtitle needs: static, and legible on the panel
    /// in both appearances — including at the 0.72 opacity the call site uses.
    @Test("the on-dark secondary ink survives the panel in both appearances")
    func onDarkTokensDoNotFlip() {
        for style in PatinaContrast.appearances {
            let flat = PatinaContrast.ratio(
                PatinaColors.OnDark.secondary,
                on: PatinaColors.Background.dark,
                style
            )
            #expect(
                flat >= 4.5,
                "OnDark.secondary on the panel in \(PatinaContrast.name(style)) is \(PatinaContrast.rounded(flat)):1"
            )

            let dimmed = PatinaContrast.ratio(
                PatinaColors.OnDark.secondary,
                opacity: 0.72,
                on: PatinaColors.Background.dark,
                style
            )
            #expect(
                dimmed >= 3.0,
                "OnDark.secondary at 0.72 on the panel in \(PatinaContrast.name(style)) is \(PatinaContrast.rounded(dimmed)):1; C-02 measured Text.inverse at the same opacity at 1.11:1"
            )
        }
    }

    /// The counterfactual that makes the finding, kept as an assertion so the
    /// day someone points the subtitle back at `Text.inverse` this suite says
    /// why it is wrong rather than going quietly green.
    @Test("Text.inverse is still the wrong token for a permanently dark panel")
    func textInverseIsStillWrongForThePanel() {
        let measured = PatinaContrast.ratio(
            PatinaColors.Text.inverse,
            opacity: 0.72,
            on: PatinaColors.Background.dark,
            .dark
        )
        #expect(
            measured < 3.0,
            "Text.inverse at 0.72 on the panel in dark now measures \(PatinaContrast.rounded(measured)):1 — if this passes, C-02's premise changed and the note to L1-C needs rewriting"
        )
    }

    // MARK: - The call sites
    //
    // The four assertions above measure tokens. A token that no screen uses
    // fixes nothing, and the first round of this lane shipped exactly that:
    // the right tokens, a counterfactual pinning the *premise*, and both call
    // sites untouched. These pin the fix.

    /// `C-02`. The panel's status line, by name.
    @Test("the companion panel's subtitle is painted with on-dark ink, not the flipping token")
    func thePanelSubtitleUsesOnDarkInk() throws {
        let source = try SourcePin.read(
            "Patina/Features/Companion/Components/CompanionHearthView.swift"
        )
        #expect(
            !source.contains("PatinaColors.Text.inverse"),
            "CompanionHearthView still paints the panel with Text.inverse, which resolves to #211E1B in dark — that is C-02, and it is 1.11:1"
        )
    }

    /// `C-01`. Every disc the Companion draws, including the Liquid Glass tint
    /// on the State-5 minimal pill, which the first round left as a hard-coded
    /// `charcoal.opacity(0.7)` on the dark canvas.
    @Test("no companion disc is tinted with a hard-coded charcoal")
    func everyCompanionDiscIsAdaptive() throws {
        for path in [
            "Patina/Features/Companion/Views/CompanionOverlay.swift",
            "Patina/Features/Companion/Components/CompanionHearthView.swift",
            "Patina/Features/Companion/Components/CompanionMarkView.swift"
        ] {
            let source = try SourcePin.read(path)
            #expect(
                !source.contains("PatinaColors.charcoal.opacity"),
                "\(path) tints a companion surface with a hard-coded charcoal — on the dark canvas that is C-01's 1.15:1 all over again"
            )
        }
    }
}

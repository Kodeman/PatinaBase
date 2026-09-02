//
//  DynamicTokenTests.swift
//  PatinaTests
//
//  `C3-01`. A token that resolves to the same value in both appearances is a
//  light-mode literal wearing a semantic name. `pearl` is one: #E5E2DD is a
//  1.21:1 whisper on the light canvas and a 12.84:1 shout on the dark one, and
//  it is the app's border/divider colour at 93 call sites.
//
//  This suite pins the semantic layer that replaces it — and pins that every
//  token whose job is to adapt actually does.
//

import Testing
import SwiftUI
@testable import Patina

struct DynamicTokenTests {

    @Test("the border tokens exist and adapt")
    func borderTokensAdapt() {
        #expect(PatinaContrast.isAdaptive(PatinaColors.Border.hairline), "Border.hairline resolves to the same value in both appearances — it is a literal, not a token")
        #expect(PatinaContrast.isAdaptive(PatinaColors.Border.strong), "Border.strong resolves to the same value in both appearances")
    }

    /// The hairline's job is to be *quiet*. In light mode `pearl` on `offWhite`
    /// is 1.21:1; the dark side has to be the same whisper against the dark
    /// canvas, not the 12.84:1 near-white rule that ships today.
    @Test("the hairline stays a whisper in both appearances")
    func hairlineStaysQuiet() {
        for style in PatinaContrast.appearances {
            for (name, ground) in [
                ("Background.primary", PatinaColors.Background.primary),
                ("Background.secondary", PatinaColors.Background.secondary)
            ] {
                let r = PatinaContrast.ratio(PatinaColors.Border.hairline, on: ground, style)
                #expect(
                    r <= 1.6,
                    "Border.hairline on \(name) in \(PatinaContrast.name(style)) is \(PatinaContrast.rounded(r)):1 — a rule, not a hairline"
                )
            }
        }
    }

    /// `Border.strong` is the one a tester should be able to see: a field
    /// outline, a selected chip's edge. Louder than the hairline, still not ink.
    @Test("the strong border reads more than the hairline, in both appearances")
    func strongBorderIsLouderThanTheHairline() {
        for style in PatinaContrast.appearances {
            let hairline = PatinaContrast.ratio(PatinaColors.Border.hairline, on: PatinaColors.Background.primary, style)
            let strong = PatinaContrast.ratio(PatinaColors.Border.strong, on: PatinaColors.Background.primary, style)
            #expect(
                strong > hairline,
                "in \(PatinaContrast.name(style)) Border.strong (\(PatinaContrast.rounded(strong)):1) is not louder than Border.hairline (\(PatinaContrast.rounded(hairline)):1)"
            )
        }
    }

    /// The tokens that carry the app's light/dark behaviour. Any one of these
    /// resolving identically means dark mode is not reaching that surface.
    @Test("every semantic token that has to adapt, adapts")
    func semanticTokensAdapt() {
        let mustAdapt: [(String, Color)] = [
            ("Background.primary", PatinaColors.Background.primary),
            ("Background.secondary", PatinaColors.Background.secondary),
            ("Background.tertiary", PatinaColors.Background.tertiary),
            ("Background.dark", PatinaColors.Background.dark),
            ("Text.primary", PatinaColors.Text.primary),
            ("Text.secondary", PatinaColors.Text.secondary),
            ("Text.muted", PatinaColors.Text.muted),
            ("Text.inverse", PatinaColors.Text.inverse),
            ("Text.interactive", PatinaColors.Text.interactive),
            ("Interactive.active", PatinaColors.Interactive.active),
            ("Border.hairline", PatinaColors.Border.hairline),
            ("Border.strong", PatinaColors.Border.strong)
        ]
        for (name, color) in mustAdapt {
            #expect(PatinaContrast.isAdaptive(color), "\(name) resolves identically in light and dark")
        }
    }

    /// The deliberate exceptions, stated so they are a decision rather than an
    /// oversight. `OnDark.*` is ink for a surface that is dark in *both*
    /// appearances (`C-02`); it must never flip.
    @Test("the on-dark ink is deliberately static, and says so")
    func onDarkInkIsStatic() {
        for (name, color) in [
            ("OnDark.primary", PatinaColors.OnDark.primary),
            ("OnDark.secondary", PatinaColors.OnDark.secondary),
            ("OnDark.muted", PatinaColors.OnDark.muted)
        ] {
            #expect(!PatinaContrast.isAdaptive(color), "\(name) adapts — it is ink for a permanently dark surface and must not")
        }
    }
}

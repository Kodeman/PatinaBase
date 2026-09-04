//
//  HouseRecordRowInkTests.swift
//  PatinaTests
//
//  `C-20`, the half a token bar cannot reach.
//
//  The finding is "dark-mode text contrast fails on the de-emphasised rows:
//  meta 2.66:1, body 4.27:1", measured on Today's MOVED rows. Round two raised
//  the dark ramp and `ContrastTests.darkModeDeEmphasisedInk` went green — and
//  the rendered rows did not move: body still 4.27:1, meta 3.01:1, and in light
//  2.96:1 / 1.86:1, which is worse than dark.
//
//  The reason is not in the palette. `HouseRecordCard` wrapped every row in a
//  plain `Button` and wrote `.disabled(row.route == nil)`; SwiftUI dims a
//  disabled plain button's ink to roughly half. `Text.primary` #F2EDE6 at 0.5
//  over the card #2C2926 is exactly 4.27:1 — the finding's own number — so the
//  token raise could not move the body at all and moved the meta only from
//  2.66 to 3.01. `describe_screen` showed the same thing from the other side:
//  the route-less row is an `AXGenericElement` with an empty role description
//  while every sibling is a `Button`.
//
//  So this suite renders. A row with no route and a row with a route are
//  rasterised through the same hosting controller, and their extreme ink is
//  compared. Equality, not a threshold: a dim is a multiplicative change to the
//  ink and shows up as a gap no font-rendering difference can produce.
//

import Testing
import SwiftUI
import UIKit
@testable import Patina

@MainActor
struct HouseRecordRowInkTests {

    private static let size = CGSize(width: 320, height: 72)

    private static func row(route: AppRoute?) -> HouseRecordRow {
        HouseRecordRow(
            id: "row:messageReceived",
            kind: .messageReceived,
            title: "A new story from the workshop.",
            detail: nil,
            date: Date(timeIntervalSince1970: 1_756_684_800),
            state: .none,
            isNew: false,
            isStandingCondition: false,
            route: route
        )
    }

    private static func rendered(
        route: AppRoute?,
        _ style: UIUserInterfaceStyle
    ) -> RenderPin.Raster {
        RenderPin.raster(
            HouseRecordRowView(row: row(route: route), now: Date(timeIntervalSince1970: 1_756_771_200))
                .padding(.horizontal, 16)
                .frame(width: size.width, height: size.height)
                .background(PatinaColors.Background.secondary),
            size: size,
            style: style
        )
    }

    /// The instrument's own calibration. If the renderer stopped resolving the
    /// trait-aware tokens against its environment, every assertion below would
    /// measure the light appearance twice and say nothing about dark mode.
    @Test("the raster resolves the semantic ground on the side of the appearance it was asked for")
    func groundIsTheToken() {
        for style in PatinaContrast.appearances {
            let expected = RenderPin.groundLuminance(PatinaColors.Background.secondary, style)
            let raster = RenderPin.raster(
                PatinaColors.Background.secondary, size: CGSize(width: 8, height: 8), style: style
            )
            let drawn = raster.luminance(x: 4, y: 4)
            #expect(
                abs(drawn - expected) < 0.01,
                "the card ground rasterised to \(PatinaContrast.rounded(drawn)) in \(PatinaContrast.name(style)) but the token resolves to \(PatinaContrast.rounded(expected))"
            )
        }
    }

    /// `RL1D-R3-01`. The row a tester cannot tap must still be a row a tester
    /// can read. Nothing about "there is nowhere to go from here" makes the
    /// sentence less true, and the Record's whole job is the sentence.
    @Test("a row with no route carries the same ink as a row with one, in both appearances")
    func aRouteLessRowIsNotDimmed() {
        for style in PatinaContrast.appearances {
            let ground = RenderPin.groundLuminance(PatinaColors.Background.secondary, style)
            let quietRaster = Self.rendered(route: nil, style)
            #expect(
                quietRaster.distinctTones > 4,
                "the raster carries \(quietRaster.distinctTones) tone(s) in \(PatinaContrast.name(style)) — nothing drew, so nothing here is measuring the row"
            )
            let quiet = quietRaster.extremeInk(from: ground)
            let tappable = Self.rendered(route: .threadList, style).extremeInk(from: ground)

            #expect(
                abs(quiet - tappable) < 0.02,
                """
                the route-less row’s ink is \(PatinaContrast.rounded(quiet)) and the tappable \
                row’s is \(PatinaContrast.rounded(tappable)) in \(PatinaContrast.name(style)) — \
                SwiftUI is dimming the disabled row, which is C-20's rendered 4.27:1
                """
            )
        }
    }

    /// The rendered bar itself, so the suite says what the finding asked for
    /// rather than only "the two rows match".
    @Test("the quiet row’s ink clears the body bar against the card it sits on")
    func theQuietRowClearsTheBodyBar() {
        for style in PatinaContrast.appearances {
            let ground = RenderPin.groundLuminance(PatinaColors.Background.secondary, style)
            let raster = Self.rendered(route: nil, style)
            #expect(raster.distinctTones > 4, "nothing drew in \(PatinaContrast.name(style))")
            let ink = raster.extremeInk(from: ground)
            let measured = (max(ink, ground) + 0.05) / (min(ink, ground) + 0.05)
            #expect(
                measured >= 4.5,
                "the MOVED row renders at \(PatinaContrast.rounded(measured)):1 on the card in \(PatinaContrast.name(style)); C-20 measured 4.27:1 dark and 2.96:1 light"
            )
        }
    }

    /// The modifier, by name, so a future `.disabled(` on this view is caught
    /// in the file rather than in a raster.
    @Test("the record card does not disable a row to say it has nowhere to go")
    func theCardDoesNotDisableItsRows() throws {
        let source = try SourcePin.readCode("Patina/Features/Home/Views/HouseRecordCard.swift")
        #expect(
            !source.contains(".disabled("),
            "HouseRecordCard disables a row again — SwiftUI halves a disabled plain button’s ink and that is C-20's rendered failure"
        )
    }
}

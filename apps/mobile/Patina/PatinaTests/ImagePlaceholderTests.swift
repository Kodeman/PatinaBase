//
//  ImagePlaceholderTests.swift
//  PatinaTests
//
//  `A-36`, `C-27`, `B-18`, `A3-01`.
//
//  Two of ten pieces on the browse grid are flat colour rectangles carrying a
//  heart, a ⋯ and a "45% match" badge over nothing, because the call sites fall
//  back to `product.placeholderGradient` — a bare fill — instead of the
//  component that already knows how to say "no photograph". On the Pieces tab
//  the same branch paints a cream slab on a near-black page and the chrome on
//  it measures 2.01:1.
//
//  The component is where the three states get names: loading, loaded, and
//  permanently missing. The call sites reach their owners as integration notes.
//

import Testing
import SwiftUI
@testable import Patina

struct ImagePlaceholderTests {

    @Test("the three states are three states, and none of them is a bare fill")
    func threeDistinctStates() throws {
        let source = try SourcePin.read(
            "../PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaAsyncImage.swift"
        )
        // Loading is not the same view as missing…
        #expect(source.contains("loadingPlaceholder"), "the loading state lost its own view")
        #expect(source.contains("missingPlaceholder"), "there is no permanently-missing state — A-36 asks for one distinct from loading")
        #expect(source.contains("failurePlaceholder"), "the failed-load state lost its own view")
        // …and each carries the mark, never a plain rectangle of colour.
        #expect(source.contains("StrataMarkView"), "the placeholder no longer draws the brand mark")
    }

    /// `A-36`'s "distinguish loading from permanently-missing": a URL that will
    /// never resolve is a different sentence from one that has not resolved yet.
    @Test("a piece with no image is a named state, not an absent one")
    func aMissingImageIsNamed() {
        #expect(PatinaAsyncImageState.missing.accessibilityLabel == "No photograph yet")
        #expect(PatinaAsyncImageState.failed.accessibilityLabel == "Image failed to load")
        #expect(PatinaAsyncImageState.loading.accessibilityLabel == "Loading image")
        #expect(PatinaAsyncImageState.missing != PatinaAsyncImageState.failed)
    }

    /// `C-27`'s surviving half: the heart / ⋯ / match pill sit on whatever the
    /// tile turns out to be, and over a light tile they measure 2.01:1. The
    /// scrim is what makes that a guarantee instead of a hope.
    @Test("overlay chrome on a light tile holds its contrast")
    func overlayChromeHoldsContrastOverALightTile() {
        for style in PatinaContrast.appearances {
            let measured = PatinaContrast.ratio(
                PatinaColors.OnDark.primary,
                on: PatinaColors.Scrim.chrome,
                style
            )
            #expect(
                measured >= 4.5,
                "chrome ink on the scrim in \(PatinaContrast.name(style)) is \(PatinaContrast.rounded(measured)):1; C-27 measured 2.01:1 over a blank tile"
            )
        }
    }

    /// `A3-01`. Production returns zero rows for every tester. Whether or not
    /// the catalogue lands (`D2`), the app has to say something true when it
    /// does — one sentence, in one place, so all four product surfaces say it
    /// the same way.
    @Test("the empty-catalogue state exists, says something true, and leads nowhere dead")
    func emptyCatalogueStateIsAvailable() {
        let state = PatinaEmptyStateContent.stillChoosingPieces
        #expect(state.title == "Nothing here yet")
        #expect(state.message == "Your designer is still choosing pieces for you. This fills in as they do.")
        #expect(state.ctaTitle == nil, "the empty-catalogue state must not offer an action there is nothing behind")
    }
}

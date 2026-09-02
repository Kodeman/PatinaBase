//
//  SheetChromeTests.swift
//  PatinaTests
//
//  One sheet pattern, one top-chrome pattern.
//
//   * `A-100` / `C-23` — Settings had no Done, no grabber and no way out but
//     an undiscoverable drag from the sheet's very top edge; the Help sheet
//     had both.
//   * `A-99`  — choosing Dark then Light left the Settings sheet black while
//     the window behind it was already light.
//   * `C5-05` — Settings → Help Center opened a network-verified 404 that
//     silently served the marketing homepage.
//   * `B-27`  — the Studio's title floated as a pinned capsule over scrolling
//     rows and cut words in half.
//   * `A-89`  — the circular back control floated over live content with
//     nothing behind it.
//   * `A-45`  — the product detail's Back / Share / Save row scrolled to
//     y = -43 after one swipe.
//   * `B-60`  — the add-room sheet mixed three grounds and two icon systems.
//   * `GAP4-16` — the Reveal's only CTA was charcoal on charcoal in light.
//

import Foundation
import Testing
@testable import Patina

@Suite("Sheet and screen chrome")
struct SheetChromeTests {

    // MARK: - Settings (A-100, C-23, A-99, C5-05)

    @Test("Settings has a dismiss control and a grabber, like every other sheet")
    func settingsHasADismissControl() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Settings/Views/SettingsView.swift")
        )
        #expect(code.contains("SettingsView.DoneButton"),
                "Settings still has no dismiss control (A-100)")
        #expect(code.contains("presentationDragIndicator(.visible)"),
                "Settings still has no grabber while Help has one (C-23)")
    }

    @Test("the Settings sheet follows the chosen appearance")
    func settingsFollowsTheChosenAppearance() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Settings/Views/SettingsView.swift")
        )
        // The sheet is its own presentation; the window-level override on
        // `ContentView` does not reliably reach back into it, which is why
        // "Light" left a black sheet over a light window (A-99).
        #expect(code.contains("preferredColorScheme("),
                "the Settings sheet does not apply the appearance it just set (A-99)")
    }

    @Test("Settings offers no link to a page that 404s")
    func settingsHasNoDeadHelpCentreRow() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Settings/Views/SettingsView.swift")
        )
        #expect(!code.contains("https://patina.cloud/help"),
                "the Help Center row still opens a 404 (C5-05)")
        // The two Support rows that do resolve stay.
        #expect(code.contains("mailto:hello@patina.cloud"))
        #expect(code.contains("https://patina.cloud/terms"))
    }

    // MARK: - Pushed-screen chrome (B-27, A-89)

    @Test("a tab root's title is an in-flow band, not a floating capsule")
    func theTabRootTitleIsABand() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Design/Components/PatinaScreenChrome.swift")
        )
        #expect(code.contains("safeAreaInset(edge: .top"),
                "the title still floats over scrolling content (B-27)")
        // A pushed screen keeps the floating chevron — it is 36 pt in a corner
        // over a hero, not a title band across the content column.
        #expect(code.contains("overlay(alignment: .topLeading)"))
    }

    @Test("the back control carries a material")
    func theBackControlCarriesAMaterial() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Design/Animations/PatinaTransitions.swift")
        )
        #expect(code.contains("Material") || code.contains("material"),
                "the back chevron still sits on live content with nothing behind it (A-89)")
    }

    // MARK: - Product detail (A-45)

    @Test("the product detail's top controls do not scroll away")
    func productDetailControlsArePinned() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/ProductDetail/Views/ProductDetailView.swift")
        )
        #expect(code.contains("topControls"),
                "the Back / Share / Save row is still built inline in the hero")
        #expect(code.contains("overlay(alignment: .top) {"),
                "the top controls still scroll with the hero (A-45)")
    }

    // MARK: - Add a new room (B-60)

    @Test("the add-room sheet has one ground, one detent and one icon system")
    func addRoomSheetIsOneMaterial() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Rooms/Views/NewRoomSheet.swift")
        )
        #expect(!code.contains("\"◎\""), "the glyph icon is still there (B-60)")
        #expect(!code.contains("\"📐\""), "the emoji icon is still there (B-60)")
        #expect(code.contains("Image(systemName:"))
        // The sheet claimed only its intrinsic height, so the detent's
        // remainder showed the grey presentation ground below it.
        #expect(code.contains("frame(maxHeight: .infinity, alignment: .top)"),
                "the sheet still leaves a second ground below its content (B-60)")
    }

    // MARK: - The Reveal (GAP4-16)

    @Test("the Reveal's CTA is painted for the ground it sits on")
    func theRevealCTAIsVisibleInLight() throws {
        let button = SourceScan.code(
            in: try SourcePin.read(
                "Patina/Features/StyleConversation/Shared/Components/StyleContinueButton.swift"
            )
        )
        #expect(button.contains("enum Ground"),
                "the CTA has no on-charcoal variant (GAP4-16)")

        let reveal = SourceScan.code(
            in: try SourcePin.read("Patina/Features/StyleReveal/Views/RevealView.swift")
        )
        #expect(reveal.contains("ground: .charcoal"),
                "the Reveal still fills its only CTA with charcoal on charcoal (GAP4-16)")
    }
}

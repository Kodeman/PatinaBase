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

    @Test("a tab root’s title is an in-flow band, not a floating capsule")
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

    /// `A-89`, walked. The disc's material blurs the 36 pt under itself and
    /// nothing else, so the rest of the line kept travelling under the control
    /// row at full contrast — the walk caught it on both of the finding's own
    /// screens, over "Room Name" on Room Settings and over "Timeline" on the
    /// proposal detail. A scroll-edge bar fades the content out as it reaches
    /// the control; a floating disc alone never did.
    @Test("a pushed screen fades its content out under the back control")
    func aPushedScreenHasAScrollEdgeScrim() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Design/Components/PatinaScreenChrome.swift")
        )
        #expect(code.contains("LinearGradient"),
                "content still passes under the chevron at full contrast (A-89)")
        // Drawn UNDER the chevron, or it would fade the control too. The two
        // overlays' ORDER is what decides that, so it is the order that is
        // pinned — not where the scrim's body happens to be written.
        let scrim = try #require(code.range(of: ".overlay(alignment: .top) { scrollEdgeScrim }"))
        let chevron = try #require(code.range(of: ".overlay(alignment: .topLeading) {"))
        #expect(scrim.lowerBound < chevron.lowerBound)
        // …and never over a dark hero, which is RL1C-07's mistake in reverse.
        #expect(code.contains("!isTabRoot && style == .light"))
    }

    // MARK: - Product detail (A-45)

    @Test("the product detail’s top controls do not scroll away")
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
        #expect(code.contains("frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)"),
                "the sheet still leaves a second ground below its content (B-60)")
    }

    // MARK: - The in-context auth sheet (W1-B-12)

    /// `A-100` / `C-23` gave Settings a Done and a grabber; the `.auth` sheet —
    /// the one the Studio hub CTA, the feed's guest CTA and the Companion
    /// prompt all raise — presented with neither, so a reader who does not
    /// know to swipe down had no visible way out (walk B re-walk shot 41).
    @Test("the in-context auth sheet has a dismiss control and a grabber")
    func authSheetHasAWayOut() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Authentication/Views/AuthSheet.swift")
        )
        #expect(code.contains("presentationDragIndicator(.visible)"),
                "the auth sheet still has no grabber (W1-B-12)")
        #expect(code.contains("auth.sheet.done"),
                "the untitled auth sheet still has no dismiss control (W1-B-12)")
        #expect(code.contains("auth.sheet.cancel"),
                "the titled auth sheet lost its Cancel")
    }

    // MARK: - The empty-Spaces CTA (W1-B-13)

    /// `B-60` replaced the `◎` glyph with an SF Symbol on the add-room sheet
    /// and the same character survived one screen away, on the CTA that opens
    /// that very sheet (walk B re-walk shot 43).
    @Test("the empty-Spaces CTA uses the icon system the add-room sheet uses")
    func emptySpacesCTAUsesAnSFSymbol() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Rooms/Views/YourSpacesView.swift")
        )
        #expect(!code.contains("\"◎\""), "the glyph icon is still there (W1-B-13)")
        #expect(code.contains("Image(systemName: \"camera.viewfinder\")"),
                "the CTA does not use the add-room sheet’s own scan symbol (W1-B-13)")
    }

    // MARK: - The Reveal (GAP4-16)

    @Test("the Reveal’s CTA is painted for the ground it sits on")
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

    // MARK: - RL1C-02

    @Test("the avatar monogram is centred in the disc it sits on")
    func theAvatarInitialIsCentred() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Profile/Views/ProfileView.swift")
        )
        // `.overlay` centres inside the bounds it is applied to, so a
        // `.padding(.top,)` BEFORE it draws the initial (padding / 2) above the
        // circle's centre — 22 pt on the pushed screen
        // (shots/w1-review-l1c/27-profile-pushed.png). The padding belongs to
        // the header column, not to the disc.
        let disc = try #require(code.range(of: "frame(width: 80, height: 80)")?.upperBound)
        let overlay = try #require(code.range(of: ".overlay(", range: disc..<code.endIndex)?.lowerBound)
        let between = String(code[disc..<overlay])
        #expect(!between.contains(".padding("),
                "the avatar pads before it overlays, so the initial is drawn off-centre")
    }

    // MARK: - RL1C-07

    @Test("the dark back chevron is not a light glyph on a light disc")
    func theDarkBackChevronHasItsOwnGround() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Design/Animations/PatinaTransitions.swift")
        )
        // A SwiftUI material resolves against the environment's colorScheme,
        // not the backdrop. In light appearance `.regularMaterial` renders
        // near-white, and the `.dark` style's 12%-opacity overlay left an
        // `offWhite` chevron on a pale disc over a dark hero
        // (shots/w1-review-l1c/29b-backchevron-crop.png). A-89's blur is right
        // for `.light`, where appearance and intent agree; `.dark` needs an
        // opaque ground of its own.
        #expect(code.contains("style == .light ? AnyShapeStyle(.regularMaterial)")
                || code.contains("case .light:"),
                "the material is still applied to both styles (RL1C-07)")
        #expect(code.contains("charcoal.opacity("),
                "the .dark disc has no opaque ground to carry an offWhite chevron")
    }
}

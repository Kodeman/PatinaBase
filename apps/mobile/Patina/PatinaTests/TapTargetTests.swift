//
//  TapTargetTests.swift
//  PatinaTests
//
//  `GAP1B-07` measured "Cancel" on both decision sheets at 17.6 pt against
//  Apple's 44 pt floor, because `PatinaButton(style: .ghost)` renders as bare
//  left-aligned text beside a full-width filled pill. `C6-18` measured the
//  room-type chips at ~24 pt with colour-only selection and no labels.
//
//  `PatinaButton` lives in PatinaDesignKit, which L1-D owns, so this lane
//  fixes the two measured call sites by moving them onto `.secondary` — full
//  width, 52 pt, same component — and sends L1-D the global `.ghost` floor as
//  a note. That is what these pins hold.
//

import Foundation
import Testing
@testable import Patina

@Suite("Tap targets")
struct TapTargetTests {

    // MARK: - GAP1B-07

    @Test("neither decision sheet leaves Cancel on the 17.6 pt ghost style")
    func decisionCancelsAreNotGhosts() throws {
        for file in ["Patina/Features/Decisions/Views/DecisionDetailView.swift",
                     "Patina/Features/Decisions/Views/DecisionDeferSheet.swift"] {
            let code = SourceScan.code(in: try SourcePin.read(file))
            let name = (file as NSString).lastPathComponent
            #expect(!code.contains("style: .ghost"),
                    "\(name) still draws Cancel as a 17.6 pt bare-text control (GAP1B-07)")
            #expect(code.contains("PatinaButton(\"Cancel\", style: .secondary"),
                    "\(name) has no full-width 52 pt Cancel")
        }
    }

    // MARK: - C6-18

    @Test("room-type chips reach the 44 pt floor")
    func roomTypeChipsAre44Points() {
        #expect(RoomTypePillRow.chipMinHeight >= 44)
    }

    @Test("room-type chips announce their selection and name themselves")
    func roomTypeChipsAnnounceSelection() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Rooms/Components/RoomTypePillRow.swift")
        )
        // Colour alone was the whole selection signal.
        #expect(code.contains("accessibilityAddTraits(.isSelected)")
                || code.contains("isSelected ? [.isButton, .isSelected] : [.isButton]"),
                "selection is still colour-only (C6-18)")
        #expect(code.contains("accessibilityLabel("))
        // Six fixed-width chips in one HStack cannot fit at an accessibility
        // size; the row has to be able to wrap or scroll.
        #expect(code.contains("ViewThatFits") || code.contains("ScrollView(.horizontal"),
                "six chips still sit in a fixed row that cannot fit (C6-18)")
    }

    @Test("all six room types are still offered")
    func everyRoomTypeSurvivedTheReflow() {
        #expect(RoomTypePillRow.allTypes.count == 6)
        #expect(RoomTypePillRow.allTypes.map(\.raw)
                == ["living", "bedroom", "office", "dining", "kitchen", "other"])
    }

    // MARK: - C-05, the header half

    @Test("the Spaces header carries exactly one help affordance")
    func spacesHeaderHasOneHelpAffordance() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Rooms/Views/YourSpacesView.swift")
        )
        // The `?` door is gone (B-L04-1) and the `+` button's sibling icon is
        // gone (C-05); the header keeps the one that explains the screen.
        #expect(!code.contains("YourSpacesView.HelpButton"))
        #expect(!code.contains("SurfaceKeys.IOSApp.Rooms.newRoom"))
        // And no two survivors share the default label.
        #expect(!code.contains("accessibilityLabel: \"More information\""))
        let defaultLabelled = code.components(separatedBy: "HelpInfoIcon(").dropFirst()
            .filter { !$0.prefix(400).contains("accessibilityLabel:") }
        #expect(defaultLabelled.isEmpty,
                "a HelpInfoIcon still falls back to \"More information\" (C-05)")
    }
}

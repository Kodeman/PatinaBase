//
//  HelpDoorRemovalTests.swift
//  PatinaTests
//
//  `C5-02`. Production Sanity holds 41 `helpArticle` documents and not one is
//  under `ios-app`, so all six `?` help doors opened on "No help articles yet
//  — Help content for this screen is on the way." Under D1 every one of them
//  is reachable on the four-tab root a round-one tester sees on day one.
//
//  Round one hides the trigger and keeps the wiring: `HelpPanelSheet` and the
//  `.helpPanel(…)` modifiers stay exactly where they are, because
//  `ProductDetailRoomSaveTests` and `CompanionSheetDriverTests` depend on the
//  sheet arms and W2 restores the buttons once the articles exist.
//
//  L0.4's Tasks C-L04-1…4 plus B-L04-1, moved here by steward ruling S-1.
//

import Foundation
import Testing
@testable import Patina

@Suite("Doorless help triggers are hidden, wiring is kept")
struct HelpDoorRemovalTests {

    // MARK: - The five triggers this lane owns

    @Test("Today passes no help closure")
    func todayPassesNoHelpClosure() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Home/Views/DailyRoomView.swift")
        )
        #expect(code.contains("onHelpTap: nil"))
        #expect(!code.contains("onHelpTap: { isHelpPanelPresented = true }"))
    }

    @Test("the Companion passes no help closure")
    func companionPassesNoHelpClosure() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Companion/Views/CompanionOverlay.swift")
        )
        #expect(code.contains("onHelp: nil"))
    }

    @Test("the piece detail draws no ? chip")
    func pieceDetailHasNoHelpChip() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/ProductDetail/Views/ProductDetailView.swift")
        )
        #expect(!code.contains("ProductDetailView.HelpButton"))
    }

    @Test("the Studio header draws no ? corner and reserves no row for one")
    func studioHasNoHelpCorner() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Profile/Views/ProfileView.swift")
        )
        #expect(!code.contains("ProfileView.HelpButton"))
        // An empty HStack with `.padding(.horizontal, 24)` would still reserve
        // the 44 pt row above the avatar; the note says do not leave one.
        #expect(!code.contains("HStack {\n                        Spacer()\n                    }"))
    }

    @Test("Spaces draws no ? door")
    func spacesHasNoHelpDoor() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Rooms/Views/YourSpacesView.swift")
        )
        #expect(!code.contains("YourSpacesView.HelpButton"))
        // The Spacer that separates the title cluster from "Add a room" stays.
        #expect(code.contains("Spacer()"))
    }

    // MARK: - The wiring that must survive

    @Test("every help-panel sheet arm is still mounted")
    func theHelpPanelWiringSurvives() throws {
        for file in ["Patina/Features/Home/Views/DailyRoomView.swift",
                     "Patina/Features/Profile/Views/ProfileView.swift",
                     "Patina/Features/Rooms/Views/YourSpacesView.swift"] {
            let code = SourceScan.code(in: try SourcePin.read(file))
            let name = (file as NSString).lastPathComponent
            #expect(code.contains(".helpPanel("), "\(name) lost its help-panel wiring")
        }
        let productDetail = SourceScan.code(
            in: try SourcePin.read("Patina/Features/ProductDetail/Views/ProductDetailView.swift")
        )
        #expect(productDetail.contains("HelpPanelSheet("))
        let companion = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Companion/Views/CompanionOverlay.swift")
        )
        #expect(companion.contains("HelpPanelSheet("))
    }

    // MARK: - The tooltip path is a different path and is untouched

    @Test("HelpInfoIcon tooltips stay mounted")
    func tooltipsStayMounted() throws {
        let spaces = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Rooms/Views/YourSpacesView.swift")
        )
        #expect(spaces.contains("HelpInfoIcon("))
        let header = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Home/Views/DailyGreetingHeader.swift")
        )
        #expect(header.contains("HelpInfoIcon("))
    }
}

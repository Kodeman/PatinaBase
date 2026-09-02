//
//  RecommendationsFillTests.swift
//  PatinaTests
//
//  `R-06`. Browse's root `VStack` never claimed the screen, so its cream
//  ground stopped where the content stopped: on an 874 pt window the whole
//  screen rendered between y=296 and y=613 with pure white above and below —
//  in the loading, error AND empty states, which is every state a round-one
//  tester sees while `A3-01`'s catalogue is still being seeded.
//
//  `A1-14` rides here because it is the same class of defect one screen over:
//  a card that claims something the screen cannot show.
//

import Foundation
import Testing
@testable import Patina

@Suite("Browse fills the screen")
struct RecommendationsFillTests {

    @Test("the Browse root claims the whole window before it paints its ground")
    func browseRootFillsTheWindow() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Recommendations/Views/RecommendationsView.swift")
        )
        let fill = code.range(of: "frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)")
        let ground = code.range(of: "background(PatinaColors.Background.primary)")
        #expect(fill != nil, "the cream band still floats in white (R-06)")
        #expect(ground != nil)
        if let fill, let ground {
            #expect(fill.lowerBound < ground.lowerBound,
                    "the ground is painted before the root claims the screen (R-06)")
        }
    }

    @Test("Browse can be pulled to refresh")
    func browseRefreshes() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Recommendations/Views/RecommendationsView.swift")
        )
        #expect(code.contains(".refreshable"), "C4-12 / R-03: Browse has no manual retry")
    }

    @Test("the other three roots L1-B named can be pulled to refresh")
    func theFourRootsRefresh() throws {
        for file in ["Patina/Features/Home/Views/DailyRoomView.swift",
                     "Patina/Features/Profile/Views/ProfileView.swift",
                     "Patina/Features/Rooms/Views/YourSpacesView.swift"] {
            let code = SourceScan.code(in: try SourcePin.read(file))
            let name = (file as NSString).lastPathComponent
            #expect(code.contains(".refreshable"), "\(name) has no manual retry (C4-12, R-03)")
        }
    }

    // MARK: - A1-14

    @Test("the design-help screen makes no promise it cannot keep")
    func noPlaceholderMatchedDesignerCard() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/DesignServices/DesignerConsultationView.swift")
        )
        #expect(!code.contains("Matched Designer"),
                "the hard-coded placeholder designer card is still there (A1-14)")
        #expect(!code.contains("Based on your style profile"))
        // The screen keeps its hero and its one door.
        #expect(code.contains("\"Work with a designer\""))
        #expect(code.contains("\"Start a request\""))
    }
}

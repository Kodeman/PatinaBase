//
//  RefreshableRootsTests.swift
//  PatinaTests
//
//  `C4-12` / `R-03`, from L1-B's integration notes `C-L1B-1` and `C-L1B-2`.
//
//  The notes give each surface an exact body, and the point of the exactness is
//  that a pull must do what a foreground does — otherwise the gesture answers
//  instantly with stale data and reads as "nothing happened". The first pass
//  shipped three surfaces short of the note: the Studio's refresh only re-read
//  local SwiftData, and Today's dropped two of the ten calls its own
//  `scenePhase` handler runs.
//

import Foundation
import Testing
@testable import Patina

@Suite("Pull to refresh actually refreshes")
struct RefreshableRootsTests {

    /// The body of the first `.refreshable { … }` in a file, brace-matched.
    private static func refreshableBody(of path: String) throws -> String {
        let code = SourceScan.code(in: try SourcePin.read(path))
        let start = try #require(code.range(of: ".refreshable {")?.upperBound,
                                 "\(path) has no .refreshable at all (C4-12)")
        var depth = 1
        var end = start
        var index = start
        while index < code.endIndex {
            let character = code[index]
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { end = index; break }
            }
            index = code.index(after: index)
        }
        return String(code[start..<end])
    }

    @Test("Today's pull runs what its foreground handler runs")
    func todayRefreshMatchesTheScenePhaseHandler() throws {
        let body = try Self.refreshableBody(of: "Patina/Features/Home/Views/DailyRoomView.swift")

        // The note's ten calls, minus `presentPushPrimerIfEarned()` — deliberately
        // excluded there and here: a pull is not the moment for a permission prompt.
        for call in ["viewModel.load()",
                     "badges.refresh()",
                     "requestStatus.refresh()",
                     "viewModel.refreshProjectRooms()",
                     "viewModel.refreshRecord()",
                     "ProfileService.shared.mirrorLastSeenIfNeeded()",
                     "viewModel.refreshNewThisWeek()",
                     "notificationsViewModel.load()"] {
            #expect(body.contains(call), "Today's refresh drops \(call) (C-L1B-1)")
        }
        #expect(body.components(separatedBy: "syncCompanionContext()").count - 1 == 2,
                "the note runs syncCompanionContext() twice, before and after the badge refresh")
        #expect(!body.contains("presentPushPrimerIfEarned"),
                "a pull-to-refresh must not put a permission prompt in front of someone")
    }

    @Test("the Studio's pull reaches the network, not only the local store")
    func studioRefreshRefetches() throws {
        let body = try Self.refreshableBody(of: "Patina/Features/Profile/Views/ProfileView.swift")
        #expect(body.contains("StudioHubViewModel.shared.load()"),
                """
                the Studio's refresh only re-read local SwiftData, so a failed \
                backend read could not be recovered from on a tab root (R-03)
                """)
        #expect(body.contains("viewModel.loadData(context: modelContext)"))
    }

    @Test("the decision detail can be pulled")
    func decisionDetailRefreshes() throws {
        let body = try Self.refreshableBody(of: "Patina/Features/Decisions/Views/DecisionDetailView.swift")
        #expect(body.contains("viewModel.load(decisionId: decisionId)"),
                "the refresh must call exactly what the screen's .task calls (C-L1B-2)")
    }

    @Test("the other two roots kept theirs")
    func spacesAndPiecesStillRefresh() throws {
        #expect(try !Self.refreshableBody(of: "Patina/Features/Rooms/Views/YourSpacesView.swift").isEmpty)
        #expect(try !Self.refreshableBody(
            of: "Patina/Features/Recommendations/Views/RecommendationsView.swift"
        ).isEmpty)
    }
}

//
//  TabNavigationModelTests.swift
//  PatinaTests
//
//  B-1: four stacks under one root. The behaviours pinned here are the ones a
//  single `NavigationPath` could not have: a tab keeps its own stack while you
//  are away from it, an in-app push never moves you between tabs, and a pop
//  SwiftUI performed itself still leaves the model able to say what is on
//  screen.
//

import Foundation
import SwiftUI
import Testing
@testable import Patina

@MainActor
struct TabNavigationModelTests {

    private static let roomId = UUID()

    // MARK: - navigate(to:) — the outside entry

    @Test
    func navigateSelectsTheRoutesTabAndPushesThere() {
        let model = TabNavigationModel()
        #expect(model.selected == .today)

        model.navigate(to: .invoiceDetail(invoiceId: "invoice-1"))

        #expect(model.selected == .studio)
        #expect(model.stack(for: .studio) == [.invoiceDetail(invoiceId: "invoice-1")])
        #expect(model.stack(for: .today).isEmpty)
        #expect(model.visibleRoute == .invoiceDetail(invoiceId: "invoice-1"))
    }

    @Test
    func navigateReachesTheSameTabFromAnyStartingTab() {
        for start in PatinaTab.allCases {
            let model = TabNavigationModel(selected: start)
            model.navigate(to: .pieceDetail(pieceId: "piece-1"))
            #expect(model.selected == .pieces, "from \(start.title)")
            #expect(model.visibleRoute == .pieceDetail(pieceId: "piece-1"))
        }
    }

    @Test
    func navigateToATabRootSelectsThatTabAndPopsItToRoot() {
        let model = TabNavigationModel()
        model.navigate(to: .roomProject(roomId: Self.roomId))
        #expect(model.selected == .spaces)
        #expect(model.stack(for: .spaces).count == 1)

        model.navigate(to: .yourSpaces)

        #expect(model.selected == .spaces)
        #expect(model.stack(for: .spaces).isEmpty, "a tab root pops its tab, it never pushes a second copy")
        #expect(model.visibleRoute == .yourSpaces)
    }

    @Test
    func heroFrameIsTheWayHome() {
        let model = TabNavigationModel()
        model.navigate(to: .invoiceDetail(invoiceId: "invoice-1"))
        model.navigate(to: .heroFrame)

        #expect(model.selected == .today)
        #expect(model.stack(for: .today).isEmpty)
        #expect(model.visibleRoute == .heroFrame)
        // Studio kept what was on it — going home is not a reset.
        #expect(model.stack(for: .studio).count == 1)
    }

    // MARK: - push(_:) — the in-app tap

    @Test
    func pushStaysOnTheTabYouAreOn() {
        let model = TabNavigationModel()

        // Today's record row opens an invoice. The invoice belongs to Studio
        // by the table, but tapping a row must not move the person: Back has
        // to return them to Today.
        model.push(.invoiceDetail(invoiceId: "invoice-1"))

        #expect(model.selected == .today)
        #expect(model.stack(for: .today) == [.invoiceDetail(invoiceId: "invoice-1")])
        #expect(model.stack(for: .studio).isEmpty)
    }

    @Test
    func aRoomsBrowseNeverLeavesSpaces() {
        // Steward §7·A: "Browse pieces for the Living Room", pushed from a room,
        // must not throw the person across tabs and strand the room behind a
        // tab switch.
        let model = TabNavigationModel()
        model.navigate(to: .roomProject(roomId: Self.roomId))
        model.push(.roomEmergence(roomId: Self.roomId))

        #expect(model.selected == .spaces)
        #expect(model.stack(for: .spaces).count == 2)
        #expect(model.visibleRoute == .roomEmergence(roomId: Self.roomId))
    }

    @Test
    func theBellPushesOntoTodayRatherThanJumpingToStudio() {
        // Steward §7·B: the bell lives in Today's header. If it changed tabs,
        // Today's own header would send you away from Today.
        let model = TabNavigationModel()
        model.push(.notifications)

        #expect(model.selected == .today)
        #expect(model.visibleRoute == .notifications)
    }

    @Test
    func pushingATabRootStillSwitches() {
        let model = TabNavigationModel()
        model.push(.yourSpaces)

        #expect(model.selected == .spaces)
        #expect(model.stack(for: .spaces).isEmpty)
        #expect(model.stack(for: .today).isEmpty, "the bar already carries that door")
    }

    // MARK: - select(_:) — the bar tap

    @Test
    func selectingAnotherTabKeepsBothStacks() {
        let model = TabNavigationModel()
        model.navigate(to: .roomProject(roomId: Self.roomId))
        model.select(.studio)
        model.push(.budget)
        model.select(.spaces)

        #expect(model.selected == .spaces)
        #expect(model.stack(for: .spaces) == [.roomProject(roomId: Self.roomId)])
        #expect(model.stack(for: .studio) == [.budget])
        #expect(model.visibleRoute == .roomProject(roomId: Self.roomId))
    }

    @Test
    func reTappingTheSelectedTabPopsItToRoot() {
        let model = TabNavigationModel()
        model.navigate(to: .roomProject(roomId: Self.roomId))
        model.push(.roomSettings(roomId: Self.roomId))
        #expect(model.stack(for: .spaces).count == 2)

        model.select(.spaces)

        #expect(model.stack(for: .spaces).isEmpty)
        #expect(model.visibleRoute == .yourSpaces)
    }

    @Test
    func everyTabIsOneTapFromItsCanonicalDestination() {
        // The acceptance line. From deep inside one tab, one tap on any other
        // tab opens that tab's canonical destination — no second tap, no
        // scrolling, nothing hidden behind a 36 pt control (F126, F134).
        let model = TabNavigationModel()
        model.push(.threadDetail(threadId: "thread-1"))
        model.push(.invoiceDetail(invoiceId: "invoice-1"))
        #expect(model.selected == .today)

        for tab in PatinaTab.allCases where tab != .today {
            model.select(tab)
            #expect(model.selected == tab)
            #expect(model.visibleRoute == RouteTabTable.rootRoute(for: tab), "\(tab.title)")
        }
    }

    // MARK: - Popping

    @Test
    func popOnlyTouchesTheSelectedTab() {
        let model = TabNavigationModel()
        model.navigate(to: .roomProject(roomId: Self.roomId))
        model.select(.studio)
        model.push(.budget)
        model.push(.documentList)

        model.pop()

        #expect(model.stack(for: .studio) == [.budget])
        #expect(model.stack(for: .spaces) == [.roomProject(roomId: Self.roomId)])
    }

    @Test
    func popAtRootIsANoOp() {
        let model = TabNavigationModel()
        model.pop()
        #expect(model.stack(for: .today).isEmpty)
        #expect(model.visibleRoute == .heroFrame)
    }

    /// What an edge swipe does: SwiftUI writes a shorter path straight into the
    /// binding. `NavigationPath` is opaque, so the mirror has to be trimmed off
    /// that write — otherwise `visibleRoute` keeps naming a screen that is gone
    /// and a companion nudge outlives the screen that earned it (R11).
    @Test
    func aShorterWriteIntoPathsTrimsTheMirror() {
        let model = TabNavigationModel()
        model.navigate(to: .roomProject(roomId: Self.roomId))
        model.push(.roomSettings(roomId: Self.roomId))
        #expect(model.visibleRoute == .roomSettings(roomId: Self.roomId))

        var path = model.paths[.spaces] ?? NavigationPath()
        path.removeLast()
        model.paths[.spaces] = path

        #expect(model.stack(for: .spaces) == [.roomProject(roomId: Self.roomId)])
        #expect(model.visibleRoute == .roomProject(roomId: Self.roomId))
    }

    @Test
    func swipingAllTheWayBackRevealsTheTabRoot() {
        let model = TabNavigationModel()
        model.navigate(to: .roomProject(roomId: Self.roomId))
        model.paths[.spaces] = NavigationPath()

        #expect(model.stack(for: .spaces).isEmpty)
        #expect(model.visibleRoute == .yourSpaces)
    }

    // MARK: - visibleRoute

    @Test
    func anEmptyTabShowsItsRootRoute() {
        let model = TabNavigationModel()
        for tab in PatinaTab.allCases {
            model.select(tab)
            #expect(model.visibleRoute == RouteTabTable.rootRoute(for: tab))
        }
    }

    // MARK: - The tour's auto-start gate (R6)

    /// The tour describes Today. On the flag-off root `navigationPath.isEmpty`
    /// asks the whole question, because there is one stack; on this root that
    /// path is inert and permanently empty, so the gate read `true` while
    /// another tab was on screen and the tour auto-started over Pieces after
    /// onboarding pushed it (`shots/w3-n3-13`, n1-notes §3c). Both halves are
    /// pinned here — the tab AND the depth.
    @Test
    func theTourGateIsClosedWhileAnotherTabIsOnScreen() {
        let model = TabNavigationModel()
        #expect(model.isShowingTodayRoot)

        model.select(.pieces)
        #expect(!model.isShowingTodayRoot, "Today is not the tab on screen")

        model.select(.today)
        #expect(model.isShowingTodayRoot)

        model.push(.invoiceDetail(invoiceId: "invoice-1"))
        #expect(!model.isShowingTodayRoot, "Today has something pushed over it")

        model.pop()
        #expect(model.isShowingTodayRoot)
    }

    /// The gate lives on the model, so the root reads one expression rather
    /// than re-deriving it — the shape that let the two halves drift apart.
    @Test
    func theHouseFirstRootReadsTheGateFromTheModel() throws {
        let source = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Navigation/HouseFirstRoot.swift")
        )
        #expect(source.contains("canAutoStart: coordinator.tabs.isShowingTodayRoot"))
        #expect(!source.contains("stack(for: .today).isEmpty"))
    }

    @Test
    func pathAndMirrorStayTheSameLength() {
        let model = TabNavigationModel()
        model.navigate(to: .roomProject(roomId: Self.roomId))
        model.push(.roomSettings(roomId: Self.roomId))
        model.push(.crossRoom)
        model.pop()

        #expect(model.paths[.spaces]?.count == model.stack(for: .spaces).count)
        #expect(model.stack(for: .spaces).count == 2)
    }
}

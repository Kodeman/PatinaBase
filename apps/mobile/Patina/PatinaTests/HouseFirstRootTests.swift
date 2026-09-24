//
//  HouseFirstRootTests.swift
//  PatinaTests
//
//  The four-tab root is the only root. D5 retired the `house-first` flag and
//  the single-stack root it fell back to, so these tests exercise a real
//  `AppCoordinator` driving `TabNavigationModel`.
//

import Foundation
import SwiftUI
import Testing
@testable import Patina

@MainActor
struct HouseFirstRootTests {

    private static let roomId = UUID()

    // MARK: - The root

    @Test
    func contentViewMountsTheFourTabRoot() throws {
        let source = SourceScan.code(in: try SourcePin.read("Patina/ContentView.swift"))
        #expect(source.contains("HouseFirstRoot()"))
        #expect(!source.contains("NavigationStack(path:"), "a second root stack came back beside the tabs")
    }

    @Test
    func theHouseFirstRootReservesNoHearth() throws {
        // B-2: the 83 pt bar replaces the 120 pt Hearth. Reserving both would
        // put 203 pt of dead space under every screen.
        let source = try SourcePin.read("Patina/Features/Navigation/HouseFirstRoot.swift")
        #expect(!source.contains(".companionHearthReservation("))
        #expect(!source.contains(".companionSafeArea()"))
    }

    @Test
    func aPushedScreenClearsTheBarsRow() {
        // R3, corrected against the running app: the bar is DRAWN over the
        // stacks, not reserved out of them — a `safeAreaInset` on the root does
        // not reach a `NavigationStack`'s pushed destinations, on either root.
        // So a pushed screen still clears the bar's own row itself; 8 pt would
        // have put a money footer 41 pt under the bar.
        #expect(CompanionHearthMetrics.pinnedFooterClearance
                == CompanionHearthMetrics.barRowHeight + 8)
        // The Design layer's copy of the bar's row height is the bar's own.
        #expect(CompanionHearthMetrics.barRowHeight == PatinaTabBar<EmptyView>.itemHeight)
    }

    @Test
    func theBarIsEightyThreePoints() {
        // M1 §6 / B-2: 49 pt of row over the 34 pt home-indicator safe area.
        #expect(PatinaTabBar<EmptyView>.itemHeight == 49)
        #expect(PatinaTabBar<EmptyView>.barHeight == 83)
    }

    // MARK: - In-app navigation on the house-first root

    @Test
    func anInAppTapPushesOntoTheTabYouAreOn() {
        let coordinator = AppCoordinator()
        coordinator.navigate(to: .invoiceDetail(invoiceId: "invoice-1"))

        #expect(coordinator.tabs.selected == .today)
        #expect(coordinator.tabs.stack(for: .today) == [.invoiceDetail(invoiceId: "invoice-1")])
        #expect(coordinator.currentScreen == .invoiceDetail(invoiceId: "invoice-1"))
    }

    @Test
    func goBackPopsTheSelectedTab() {
        let coordinator = AppCoordinator()
        coordinator.selectTab(.projects)
        coordinator.navigate(to: .projectList)
        coordinator.navigate(to: .projectDetail(projectId: "project-1"))

        coordinator.goBack()

        #expect(coordinator.tabs.stack(for: .projects) == [.projectList])
        #expect(coordinator.tabs.visibleRoute == .projectList)
    }

    /// MJ-4: "one tap to its canonical destination" is true of an empty stack.
    /// A tab a deep link or an APNs tap has already pushed onto reveals what
    /// was pushed — standard iOS, and the reason a second tap exists.
    @Test
    func aTabWithAStackRevealsItsStackTopAndRetappingRevealsTheRoot() {
        let coordinator = AppCoordinator()
        coordinator.openExternal(.invoiceDetail(invoiceId: "invoice-1"))
        coordinator.selectTab(.today)

        coordinator.selectTab(.projects)
        #expect(coordinator.tabs.visibleRoute == .invoiceDetail(invoiceId: "invoice-1"))

        coordinator.selectTab(.projects)
        #expect(coordinator.tabs.visibleRoute == RouteTabTable.rootRoute(for: .projects))
        #expect(coordinator.tabs.stack(for: .projects).isEmpty)
    }

    /// BL-1's debt, paid (R2). The Studio tab has a route of its own, so what
    /// `trackScreen` sends to PostHog and what the Companion is handed on every
    /// entry into the tab is the name that is on glass — not Profile's.
    @Test
    func theStudioTabReportsItsOwnScreen() {
        #expect(RouteTabTable.rootRoute(for: .projects) == .studio)

        let coordinator = AppCoordinator()
        coordinator.selectTab(.projects)
        coordinator.syncCurrentScreen(to: coordinator.tabs.visibleRoute)

        #expect(coordinator.currentScreen == .studio)
        #expect(coordinator.companionContext.currentScreen == .studio)
        // What PostHog is told IS what the screen is called (C4 / B-7 a).
        #expect(AppRoute.studio.analyticsScreenName == "Your Studio")
        // D3: the name on glass moved to "Your Projects"; the PostHog screen
        // name did not, so dashboards keep reading one series.
        #expect(AppRoute.studio.displayName == PatinaTab.projects.canonicalName)
        #expect(AppRoute.studio.displayName == "Your Projects")
        // And `.profile` is untouched.
        #expect(AppRoute.profile.analyticsScreenName == "Profile")
        #expect(RouteTabTable.tab(for: .profile) == .projects)
    }

    /// The bar's fifth slot may be a control only once something acts on
    /// `isCompanionExpanded`. `CompanionOverlay` writes that flag when it
    /// expands itself and never reads it, so a slot button would present
    /// nothing while `accessibilityHidden(isCompanionExpanded)` took the whole
    /// screen out of the VoiceOver tree. N3 may wire either half; it must not
    /// ship the half that blinds the screen.
    @Test
    func theCompanionSlotOpensThePanelOrIsNotAControl() throws {
        let root = try SourcePin.read("Patina/Features/Navigation/HouseFirstRoot.swift")
        let overlay = try SourcePin.read("Patina/Features/Companion/Views/CompanionOverlay.swift")

        let slotTogglesTheFlag = SourceScan.code(in: root).contains("coordinator.toggleCompanion()")
        let overlayObservesTheFlag = SourceScan.code(in: overlay)
            .contains("onChange(of: coordinator.isCompanionExpanded)")

        #expect(
            overlayObservesTheFlag || !slotTogglesTheFlag,
            "the bar’s Companion slot toggles isCompanionExpanded and nothing expands the panel"
        )
        #expect(
            root.contains(".accessibilityHidden(coordinator.isCompanionExpanded)"),
            "the tab content still leaves the VoiceOver tree while the panel is up"
        )
    }

    @Test
    func selectingATabMovesTheVisibleRouteWithIt() {
        let coordinator = AppCoordinator()
        coordinator.selectTab(.pieces)

        #expect(coordinator.tabs.selected == .pieces)
        #expect(coordinator.tabs.visibleRoute == .emergence(pieceId: nil))
    }

    @Test
    func syncCurrentScreenFollowsAPopSwiftUIPerformedItself() {
        let coordinator = AppCoordinator()
        coordinator.navigate(to: .projectDetail(projectId: "project-1"))
        #expect(coordinator.currentScreen == .projectDetail(projectId: "project-1"))

        coordinator.tabs.paths[.today] = NavigationPath()
        coordinator.syncCurrentScreen(to: coordinator.tabs.visibleRoute)

        #expect(coordinator.currentScreen == .heroFrame)
        #expect(coordinator.companionContext.currentScreen == .heroFrame)
    }

    // MARK: - Outside entries land on the right tab

    @Test
    func aPushTapLandsOnTheRoutesOwnTab() {
        let coordinator = AppCoordinator()
        coordinator.openExternal(.invoiceDetail(invoiceId: "invoice-1"))

        #expect(coordinator.tabs.selected == .projects)
        #expect(coordinator.tabs.stack(for: .projects) == [.invoiceDetail(invoiceId: "invoice-1")])
        #expect(coordinator.tabs.stack(for: .today).isEmpty)
        #expect(coordinator.currentScreen == .invoiceDetail(invoiceId: "invoice-1"))
    }

    @Test
    func everyPushEntityTypeLandsOnItsTabThroughTheCoordinator() {
        let cases: [(String, PatinaTab)] = [
            ("project", .projects),
            ("proposal", .projects),
            ("decision", .projects),
            ("invoice", .projects),
            ("design_request", .projects),
            ("thread", .projects),
            ("piece", .pieces)
        ]
        for (entity, tab) in cases {
            let coordinator = AppCoordinator()
            guard let route = NotificationRouter.route(forEntityType: entity, entityId: "id-1") else {
                Issue.record("\(entity) resolved to no route")
                continue
            }
            coordinator.openExternal(route)
            #expect(coordinator.tabs.selected == tab, "\(entity) should open \(tab.title)")
            #expect(coordinator.tabs.stack(for: tab) == [route])
        }
    }

    @Test
    func aRoomDeepLinkLandsOnSpaces() {
        let coordinator = AppCoordinator()
        coordinator.openExternal(.roomProject(roomId: Self.roomId))

        #expect(coordinator.tabs.selected == .spaces)
        #expect(coordinator.tabs.visibleRoute == .roomProject(roomId: Self.roomId))
    }

    // MARK: - Nothing bypasses the coordinator

    /// Every `navigate(to:)` in the app target reaches `AppCoordinator` — either
    /// directly, or through `DeepLinkHandler`, which forwards to
    /// `openExternal`. That is what lets the 122 call sites stay untouched
    /// while the tab layer is added underneath them: the coordinator is the one
    /// seam, so nothing can push onto a stack the tab model does not know about.
    @Test
    func everyNavigateCallSiteGoesThroughTheCoordinator() throws {
        // `tabs` is the coordinator's own tab model, reached only from inside
        // `AppCoordinator`; `nav` is `let nav = coordinator` in the scan host.
        let allowedReceivers: Set<String> = [
            "coordinator", "nav", "tabs", "DeepLinkHandler.shared"
        ]
        // A bare `navigate(to:)` — no receiver at all — is a call on `self`,
        // and only `AppCoordinator` is allowed to be that self. Allowing it
        // everywhere (the shape this pin shipped with) would let any view grow
        // its own `func navigate(to:)` and call it unqualified, invisibly.
        let bareCallOwner = "AppCoordinator.swift"
        var offenders: [String] = []

        for path in SourcePin.swiftFiles(under: "Patina") {
            let file = (path as NSString).lastPathComponent
            let source = try String(contentsOfFile: path, encoding: .utf8)
            for line in source.components(separatedBy: .newlines) {
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                // Documentation mentions the selector by name; only calls count.
                guard trimmed.contains("navigate(to:"), !SourceScan.isComment(trimmed) else { continue }
                guard let range = trimmed.range(of: "navigate(to:") else { continue }
                let receiver = String(trimmed[trimmed.startIndex..<range.lowerBound])
                    .replacingOccurrences(of: "?", with: "")
                    .components(separatedBy: CharacterSet(charactersIn: " \t({[,=>"))
                    .last?
                    .trimmingCharacters(in: CharacterSet(charactersIn: ".")) ?? ""
                let allowed = receiver.isEmpty
                    ? file == bareCallOwner
                    : allowedReceivers.contains(receiver)
                if !allowed {
                    offenders.append("\(file): \(trimmed)")
                }
            }
        }

        #expect(offenders.isEmpty, "navigate(to:) must go through the coordinator — \(offenders)")
    }

    /// Only the root binds a navigation path. A second would be a stack the
    /// coordinator cannot see, which is how a route ends up on screen with no
    /// companion context and no analytics behind it.
    @Test
    func onlyTheRootOwnsANavigationPath() throws {
        var owners: [String] = []
        for path in SourcePin.swiftFiles(under: "Patina") {
            let source = try String(contentsOfFile: path, encoding: .utf8)
            guard source.contains("NavigationStack(path:") else { continue }
            owners.append((path as NSString).lastPathComponent)
        }
        #expect(Set(owners) == ["HouseFirstRoot.swift"], "found \(owners)")
    }
}

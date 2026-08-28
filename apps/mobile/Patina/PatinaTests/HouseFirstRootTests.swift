//
//  HouseFirstRootTests.swift
//  PatinaTests
//
//  R2: the root is chosen once, from `house-first`, and held. The flag-off root
//  stays exactly what W2 left — one stack, the Hearth reservation, the floating
//  Companion, and the Record on `DailyRoomView`.
//
//  The coordinator-level tests here construct a real `AppCoordinator` through
//  its internal `init(houseFirstRoot:)` seam, so the flag itself never has to
//  be mutated and the two roots can be exercised in the same run.
//

import Foundation
import SwiftUI
import Testing
@testable import Patina

@MainActor
struct HouseFirstRootTests {

    private static let roomId = UUID()

    // MARK: - The root is chosen once, and held

    @Test
    func theFlagChoosesTheRoot() {
        #expect(AppCoordinator(houseFirstRoot: true).isHouseFirstRoot)
        #expect(!AppCoordinator(houseFirstRoot: false).isHouseFirstRoot)
    }

    @Test
    func theChoiceIsALetAndCannotChangeMidSession() throws {
        // A `let` cannot be reassigned, so this is a source pin rather than a
        // behavioural one: the point is that nothing re-reads the flag after
        // launch, which is what R2 means by "evaluated once at launch and held".
        let source = try SourcePin.read("Patina/App/Coordinators/AppCoordinator.swift")
        #expect(source.contains("public let isHouseFirstRoot: Bool"))

        let readsOfTheFlag = source.components(separatedBy: "FeatureFlags.shared.isOn").count - 1
        #expect(readsOfTheFlag == 1, "the coordinator reads house-first exactly once, in init")
    }

    @Test
    func theFlagIsResolvedBeforeTheCoordinatorIsBuilt() throws {
        // `AppCoordinator.init` reads the flag, so `resolveAtLaunch()` has to
        // have run by then — otherwise every launch resolves the root off.
        let source = try SourcePin.read("Patina/PatinaApp.swift")
        let resolve = try #require(source.range(of: "FeatureFlags.shared.resolveAtLaunch()"))
        let build = try #require(source.range(of: "State(initialValue: AppCoordinator())"))
        #expect(
            resolve.lowerBound < build.lowerBound,
            "resolveAtLaunch() must precede AppCoordinator() in PatinaApp.init"
        )
    }

    @Test
    func contentViewPicksTheRootFromTheCoordinator() throws {
        let source = try SourcePin.read("Patina/ContentView.swift")
        #expect(source.contains("if coordinator.isHouseFirstRoot {"))
        #expect(source.contains("HouseFirstRoot()"))
        #expect(
            !SourceScan.code(in: source).contains("FeatureFlags"),
            "ContentView must not read the flag itself — the coordinator holds the answer"
        )
    }

    // MARK: - The flag-off root is untouched

    @Test
    func theFlagOffRootStillCarriesTheW2Shape() throws {
        let source = try SourcePin.read("Patina/ContentView.swift")
        #expect(source.contains("private var legacyMainContent: some View {"))
        // One stack, the 120 pt Hearth reservation, the floating Companion,
        // and the Record's home surface — all still there.
        #expect(source.contains("NavigationStack(path: Binding("))
        #expect(source.contains(".companionHearthReservation(isActive: reservesRootCompanionHearth)"))
        #expect(source.contains("CompanionOverlay()"))
        #expect(source.contains("DailyRoomView()"))
    }

    @Test
    func theHouseFirstRootReservesNoHearth() throws {
        // B-2: the 83 pt bar replaces the 120 pt Hearth. Reserving both would
        // put 203 pt of dead space under every screen.
        let source = try SourcePin.read("Patina/Features/Navigation/HouseFirstRoot.swift")
        #expect(!source.contains(".companionHearthReservation("))
        #expect(!source.contains(".companionSafeArea()"))
    }

    /// B-2's retirement, as a policy rather than as a deletion: the Hearth's
    /// answers are still exactly W1b's on the flag-off root, and retired on the
    /// flag-on one. The flag is a parameter, not a lookup, so the policy stays
    /// pure and every existing caller keeps the W1b answer by default —
    /// `CompanionOverlay` and `MoneyScreenChrome` belong to other lanes and
    /// were not edited (see `waves/w3/n1-notes.md` §2, §3).
    @Test
    func theHearthPolicyIsRetiredOnTheHouseFirstRoot() {
        #expect(CompanionHearthMetrics.reservesRootHearth(for: .heroFrame, houseFirst: true) == false)
        #expect(CompanionHearthMetrics.reservesRootHearth(for: .heroFrame, houseFirst: false))
        #expect(CompanionHearthMetrics.reservesRootHearth(for: .heroFrame))

        #expect(CompanionHearthMetrics.yieldsToPinnedFooter(
            for: .invoiceDetail(invoiceId: "i"), houseFirst: true) == false)
        #expect(CompanionHearthMetrics.yieldsToPinnedFooter(
            for: .invoiceDetail(invoiceId: "i"), houseFirst: false))
        #expect(CompanionHearthMetrics.yieldsToPinnedFooter(for: .invoiceDetail(invoiceId: "i")))

        #expect(CompanionHearthMetrics.pinnedFooterClearance(houseFirst: true) == 8)
        #expect(CompanionHearthMetrics.pinnedFooterClearance(houseFirst: false)
                == CompanionHearthMetrics.dockHeight + 8)
    }

    @Test
    func theBarIsEightyThreePointsAndReplacesTheHundredAndTwenty() {
        // M1 §6 / B-2: 49 pt of row over the 34 pt home-indicator safe area.
        #expect(PatinaTabBar<EmptyView>.itemHeight == 49)
        #expect(PatinaTabBar<EmptyView>.barHeight == 83)
        #expect(CompanionHearthMetrics.reservedHeight == 120)
    }

    @Test
    func theFlagOffCoordinatorStillUsesTheSingleStack() {
        let coordinator = AppCoordinator(houseFirstRoot: false)
        coordinator.navigate(to: .invoiceDetail(invoiceId: "invoice-1"))

        #expect(coordinator.navigationPath.count == 1)
        #expect(coordinator.currentScreen == .invoiceDetail(invoiceId: "invoice-1"))
        #expect(coordinator.tabs.stack(for: .studio).isEmpty, "the tab model is inert on the off root")
    }

    @Test
    func goBackOnTheFlagOffRootStillPopsTheSingleStack() {
        let coordinator = AppCoordinator(houseFirstRoot: false)
        coordinator.navigate(to: .projectList)
        coordinator.navigate(to: .projectDetail(projectId: "project-1"))
        coordinator.goBack()

        #expect(coordinator.navigationPath.count == 1)
        #expect(coordinator.currentScreen == .projectList)
    }

    // MARK: - In-app navigation on the house-first root

    @Test
    func anInAppTapPushesOntoTheTabYouAreOn() {
        let coordinator = AppCoordinator(houseFirstRoot: true)
        coordinator.navigate(to: .invoiceDetail(invoiceId: "invoice-1"))

        #expect(coordinator.tabs.selected == .today)
        #expect(coordinator.tabs.stack(for: .today) == [.invoiceDetail(invoiceId: "invoice-1")])
        #expect(coordinator.currentScreen == .invoiceDetail(invoiceId: "invoice-1"))
        #expect(coordinator.navigationPath.isEmpty, "the single-stack path is inert on this root")
    }

    @Test
    func goBackPopsTheSelectedTab() {
        let coordinator = AppCoordinator(houseFirstRoot: true)
        coordinator.selectTab(.studio)
        coordinator.navigate(to: .projectList)
        coordinator.navigate(to: .projectDetail(projectId: "project-1"))

        coordinator.goBack()

        #expect(coordinator.tabs.stack(for: .studio) == [.projectList])
        #expect(coordinator.tabs.visibleRoute == .projectList)
    }

    @Test
    func selectingATabMovesTheVisibleRouteWithIt() {
        let coordinator = AppCoordinator(houseFirstRoot: true)
        coordinator.selectTab(.pieces)

        #expect(coordinator.tabs.selected == .pieces)
        #expect(coordinator.tabs.visibleRoute == .emergence(pieceId: nil))
    }

    @Test
    func syncCurrentScreenFollowsAPopSwiftUIPerformedItself() {
        let coordinator = AppCoordinator(houseFirstRoot: true)
        coordinator.navigate(to: .projectDetail(projectId: "project-1"))
        #expect(coordinator.currentScreen == .projectDetail(projectId: "project-1"))

        coordinator.tabs.paths[.today] = NavigationPath()
        coordinator.syncCurrentScreen(to: coordinator.tabs.visibleRoute)

        #expect(coordinator.currentScreen == .heroFrame)
        #expect(coordinator.companionContext.currentScreen == .heroFrame)
    }

    @Test
    func syncCurrentScreenIsInertOnTheFlagOffRoot() {
        let coordinator = AppCoordinator(houseFirstRoot: false)
        coordinator.navigate(to: .budget)
        coordinator.syncCurrentScreen(to: .heroFrame)

        #expect(coordinator.currentScreen == .budget)
    }

    // MARK: - Outside entries land on the right tab

    @Test
    func aPushTapLandsOnTheRoutesOwnTab() {
        let coordinator = AppCoordinator(houseFirstRoot: true)
        coordinator.openExternal(.invoiceDetail(invoiceId: "invoice-1"))

        #expect(coordinator.tabs.selected == .studio)
        #expect(coordinator.tabs.stack(for: .studio) == [.invoiceDetail(invoiceId: "invoice-1")])
        #expect(coordinator.tabs.stack(for: .today).isEmpty)
        #expect(coordinator.currentScreen == .invoiceDetail(invoiceId: "invoice-1"))
    }

    @Test
    func everyPushEntityTypeLandsOnItsTabThroughTheCoordinator() {
        let cases: [(String, PatinaTab)] = [
            ("project", .studio),
            ("proposal", .studio),
            ("decision", .studio),
            ("invoice", .studio),
            ("design_request", .studio),
            ("thread", .studio),
            ("piece", .pieces)
        ]
        for (entity, tab) in cases {
            let coordinator = AppCoordinator(houseFirstRoot: true)
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
        let coordinator = AppCoordinator(houseFirstRoot: true)
        coordinator.openExternal(.roomProject(roomId: Self.roomId))

        #expect(coordinator.tabs.selected == .spaces)
        #expect(coordinator.tabs.visibleRoute == .roomProject(roomId: Self.roomId))
    }

    @Test
    func anOutsideEntryOnTheFlagOffRootIsJustNavigate() {
        let coordinator = AppCoordinator(houseFirstRoot: false)
        coordinator.openExternal(.decisionDetail(decisionId: "decision-1"))

        #expect(coordinator.navigationPath.count == 1)
        #expect(coordinator.currentScreen == .decisionDetail(decisionId: "decision-1"))
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
            "coordinator", "nav", "tabs", "DeepLinkHandler.shared", ""
        ]
        var offenders: [String] = []

        for path in SourcePin.swiftFiles(under: "Patina") {
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
                if !allowedReceivers.contains(receiver) {
                    offenders.append("\((path as NSString).lastPathComponent): \(trimmed)")
                }
            }
        }

        #expect(offenders.isEmpty, "navigate(to:) must go through the coordinator — \(offenders)")
    }

    /// Only the two roots bind a root navigation path. A third would be a stack
    /// the coordinator cannot see, which is how a route ends up on screen with
    /// no companion context and no analytics behind it.
    @Test
    func onlyTheTwoRootsOwnANavigationPath() throws {
        var owners: [String] = []
        for path in SourcePin.swiftFiles(under: "Patina") {
            let source = try String(contentsOfFile: path, encoding: .utf8)
            guard source.contains("NavigationStack(path:") else { continue }
            owners.append((path as NSString).lastPathComponent)
        }
        #expect(Set(owners) == ["ContentView.swift", "HouseFirstRoot.swift"], "found \(owners)")
    }
}

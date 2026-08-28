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

        // R3, corrected against the running app: the bar is DRAWN over the
        // stacks, not reserved out of them — a `safeAreaInset` on the root does
        // not reach a `NavigationStack`'s pushed destinations, on either root.
        // So a pushed screen still clears the bar's own row itself; 8 pt would
        // have put a money footer 41 pt under the bar.
        #expect(CompanionHearthMetrics.pinnedFooterClearance(houseFirst: true)
                == CompanionHearthMetrics.barRowHeight + 8)
        #expect(CompanionHearthMetrics.pinnedFooterClearance(houseFirst: false)
                == CompanionHearthMetrics.dockHeight + 8)
        // The Design layer's copy of the bar's row height is the bar's own.
        #expect(CompanionHearthMetrics.barRowHeight == PatinaTabBar<EmptyView>.itemHeight)
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

    /// MJ-4: "one tap to its canonical destination" is true of an empty stack.
    /// A tab a deep link or an APNs tap has already pushed onto reveals what
    /// was pushed — standard iOS, and the reason a second tap exists.
    @Test
    func aTabWithAStackRevealsItsStackTopAndRetappingRevealsTheRoot() {
        let coordinator = AppCoordinator(houseFirstRoot: true)
        coordinator.openExternal(.invoiceDetail(invoiceId: "invoice-1"))
        coordinator.selectTab(.today)

        coordinator.selectTab(.studio)
        #expect(coordinator.tabs.visibleRoute == .invoiceDetail(invoiceId: "invoice-1"))

        coordinator.selectTab(.studio)
        #expect(coordinator.tabs.visibleRoute == RouteTabTable.rootRoute(for: .studio))
        #expect(coordinator.tabs.stack(for: .studio).isEmpty)
    }

    /// BL-1's debt, paid (R2). The Studio tab has a route of its own, so what
    /// `trackScreen` sends to PostHog and what the Companion is handed on every
    /// entry into the tab is the name that is on glass — not Profile's.
    @Test
    func theStudioTabReportsItsOwnScreen() {
        #expect(RouteTabTable.rootRoute(for: .studio) == .studio)

        let coordinator = AppCoordinator(houseFirstRoot: true)
        coordinator.selectTab(.studio)
        coordinator.syncCurrentScreen(to: coordinator.tabs.visibleRoute)

        #expect(coordinator.currentScreen == .studio)
        #expect(coordinator.companionContext.currentScreen == .studio)
        // What PostHog is told IS what the screen is called (C4 / B-7 a).
        #expect(AppRoute.studio.analyticsScreenName == "Your Studio")
        #expect(AppRoute.studio.analyticsScreenName == PatinaTab.studio.canonicalName)
        // And `.profile` is untouched — still the flag-off monogram's door.
        #expect(AppRoute.profile.analyticsScreenName == "Profile")
        #expect(RouteTabTable.tab(for: .profile) == .studio)
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
            "the bar's Companion slot toggles isCompanionExpanded and nothing expands the panel"
        )
        #expect(
            root.contains(".accessibilityHidden(coordinator.isCompanionExpanded)"),
            "the tab content still leaves the VoiceOver tree while the panel is up"
        )
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

    /// MJ-1: the two roots dispatch the same route to the same screen.
    ///
    /// `HouseFirstRoot` carries a second copy of `ContentView`'s dispatcher —
    /// duplicated on purpose, so the flag-off root's body is not edited at all.
    /// Both switches are exhaustive, so a NEW route breaks both; nothing
    /// otherwise catches a CHANGED destination, and one root quietly rendering
    /// a different screen for the same route turns `house-first` from a layout
    /// flag into a behaviour flag. This compares the six bodies verbatim, with
    /// comments and whitespace normalised away.
    @Test
    func theTwoRootsDispatchTheSameDestinations() throws {
        let legacy = try SourcePin.read("Patina/ContentView.swift")
        let houseFirst = try SourcePin.read("Patina/Features/Navigation/HouseFirstRoot.swift")

        let dispatchers = [
            "destinationView",
            "roomsDestination",
            "discoveryDestination",
            "styleDestination",
            "workCoreDestination",
            "workDocumentsDestination"
        ]

        for name in dispatchers {
            let legacyBody = Self.dispatcherBody(name, in: legacy)
            let houseFirstBody = Self.dispatcherBody(name, in: houseFirst)
            #expect(legacyBody != nil, "ContentView has no \(name)(for:)")
            #expect(houseFirstBody != nil, "HouseFirstRoot has no \(name)(for:)")
            #expect(
                legacyBody == houseFirstBody,
                "\(name)(for:) differs between the two roots:\n\(legacyBody ?? "")\n---\n\(houseFirstBody ?? "")"
            )
        }
    }

    /// The body of `func <name>(for route: AppRoute) -> some View { … }`, with
    /// whole-line comments dropped and every run of whitespace collapsed, so
    /// only the dispatch itself is compared. `nil` when the function is absent.
    private static func dispatcherBody(_ name: String, in source: String) -> String? {
        let code = SourceScan.code(in: source)
        guard let marker = code.range(of: "func \(name)(for route: AppRoute) -> some View {") else {
            return nil
        }
        var depth = 1
        var body = ""
        var index = marker.upperBound
        while index < code.endIndex, depth > 0 {
            let character = code[index]
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { break }
            }
            body.append(character)
            index = code.index(after: index)
        }
        guard depth == 0 else { return nil }   // ran off the end unbalanced
        return body.split(whereSeparator: \.isWhitespace).joined(separator: " ")
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

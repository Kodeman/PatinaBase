//
//  TabNavigationModel.swift
//  Patina
//
//  Four navigation stacks under one root (B-1). Each tab keeps its own path, so
//  switching tabs never discards where you were on the tab you left.
//
//  `NavigationPath` is opaque, so — exactly as `AppCoordinator` already does for
//  the single-stack root — each path carries a parallel `[AppRoute]` mirror.
//  The mirror is what lets a pop restore the visible route, and it is trimmed
//  from `paths`' own `didSet` so a pop SwiftUI performs itself (an edge swipe,
//  a system back button) is caught as well as one we asked for.
//

import SwiftUI

@MainActor
@Observable
public final class TabNavigationModel {

    /// The tab whose stack is on screen.
    public var selected: PatinaTab

    /// Each tab's navigation path. Writable: SwiftUI binds directly to these,
    /// and a shorter write is a pop.
    public var paths: [PatinaTab: NavigationPath] = [:] {
        didSet { trimMirrors() }
    }

    /// Pushed-route history mirroring `paths`, per tab.
    private var stacks: [PatinaTab: [AppRoute]] = [:]

    public init(selected: PatinaTab = .today) {
        self.selected = selected
    }

    // MARK: - Navigation

    /// Selects the route's tab, then pushes onto that tab's stack. A route that
    /// IS a tab's root selects that tab and pops it to root instead — the bar
    /// already carries that door, so a second copy of it is never pushed.
    ///
    /// This is the entry a deep link, a universal link and a push tap take.
    public func navigate(to route: AppRoute) {
        let tab = RouteTabTable.tab(for: route)
        guard !RouteTabTable.isTabRoot(route) else {
            select(tab, poppingToRoot: true)
            return
        }
        selected = tab
        append(route, to: tab)
    }

    /// Pushes onto the tab already on screen, whatever tab the route's table
    /// entry names. This is what an in-app tap does: Back returns you where you
    /// were, and browsing a room's pieces does not strand the room behind a tab
    /// switch. A tab-root route still switches — see `navigate(to:)`.
    public func push(_ route: AppRoute) {
        guard !RouteTabTable.isTabRoot(route) else {
            select(RouteTabTable.tab(for: route), poppingToRoot: true)
            return
        }
        append(route, to: selected)
    }

    /// A tap on the bar. Re-tapping the tab you are on pops it to root.
    public func select(_ tab: PatinaTab) {
        select(tab, poppingToRoot: tab == selected)
    }

    public func popToRoot(_ tab: PatinaTab) {
        let hasStack = !(stacks[tab] ?? []).isEmpty
        let hasPath = !(paths[tab]?.isEmpty ?? true)
        guard hasStack || hasPath else { return }
        stacks[tab] = []
        paths[tab] = NavigationPath()
    }

    /// Pops the selected tab by one.
    public func pop() {
        var mirror = stacks[selected] ?? []
        guard !mirror.isEmpty else { return }
        mirror.removeLast()
        stacks[selected] = mirror
        var path = paths[selected] ?? NavigationPath()
        if !path.isEmpty { path.removeLast() }
        paths[selected] = path
    }

    // MARK: - Reading

    /// The route on screen: the top of the selected tab's stack, or — when that
    /// stack is empty — the route that tab's root stands for.
    public var visibleRoute: AppRoute {
        stacks[selected]?.last ?? RouteTabTable.rootRoute(for: selected)
    }

    public func stack(for tab: PatinaTab) -> [AppRoute] {
        stacks[tab] ?? []
    }

    /// Today is the tab on screen and nothing is pushed on it.
    ///
    /// The gate the first-launch tour auto-starts behind on this root (R6). The
    /// flag-off root asks `navigationPath.isEmpty`, which is the same question
    /// where there is one stack; here that path is inert and permanently empty,
    /// so reading it let the tour open over whichever tab was selected — the
    /// walk caught it running over Pieces (`shots/w3-n3-13`). Both halves are
    /// load-bearing: the depth, and the tab.
    public var isShowingTodayRoot: Bool {
        selected == .today && stack(for: .today).isEmpty
    }

    // MARK: - Internals

    private func select(_ tab: PatinaTab, poppingToRoot: Bool) {
        selected = tab
        if poppingToRoot { popToRoot(tab) }
    }

    /// Mirror first, then the path — so `paths`' `didSet` cannot misread a push
    /// as a pop.
    private func append(_ route: AppRoute, to tab: PatinaTab) {
        stacks[tab, default: []].append(route)
        var path = paths[tab] ?? NavigationPath()
        path.append(route)
        paths[tab] = path
    }

    private func trimMirrors() {
        for tab in PatinaTab.allCases {
            let pathCount = paths[tab]?.count ?? 0
            let mirror = stacks[tab] ?? []
            guard pathCount < mirror.count else { continue }
            stacks[tab] = Array(mirror.prefix(pathCount))
        }
    }
}

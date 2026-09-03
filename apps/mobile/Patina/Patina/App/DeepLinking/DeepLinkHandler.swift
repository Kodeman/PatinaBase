//
//  DeepLinkHandler.swift
//  Patina
//
//  Handles incoming deep links (patina://) and universal links.
//  Routes URLs to appropriate services.
//

import Foundation

/// Handler for incoming deep links
@MainActor
public final class DeepLinkHandler {
    public static let shared = DeepLinkHandler()

    // MARK: - Dependencies

    private var coordinator: AppCoordinator?
    private let qrAuthService = QRAuthService.shared

    /// Links kept because the app could not open them yet — a FIFO that
    /// survives the process. See `PendingLinkQueue` for why all three of those
    /// properties are load-bearing (`C2-02`, `C2-21`, `GAP7B-09`).
    let queue: PendingLinkQueue

    /// Routes deferred the same way, for the one arrival that has no URL to
    /// persist: an APNs tap, which `PatinaAppDelegate` resolves to an
    /// `AppRoute` before this handler ever sees it. In memory only — a push
    /// tap that does not survive the process is a push that will still be in
    /// Notification Centre.
    private var pendingRoutes: [AppRoute] = []

    // MARK: - Initialization

    private init() {
        self.queue = PendingLinkQueue()
    }

    /// Test seam: the singleton reads the App Group defaults, which a unit test
    /// must not share with the simulator it is running on.
    init(queue: PendingLinkQueue) {
        self.queue = queue
    }

    // MARK: - Configuration

    /// Configure the handler with the app coordinator
    /// - Parameter coordinator: The app coordinator for navigation
    public func configure(coordinator: AppCoordinator) {
        self.coordinator = coordinator
        // The coordinator is the only object that knows when the app can show
        // a route, so it owns the trigger; this owns what is replayed.
        coordinator.attachDeepLinkDrain { [weak self] in self?.drainIfPossible() }
        // …and when it ends. The queue is on disk with a 15-minute life, so a
        // link account A tapped at the auth wall would otherwise drain into
        // account B's first `.main`.
        coordinator.attachDeepLinkClear { [weak self] in self?.queue.clear() }
        drainIfPossible()
    }

    /// Push an `AppRoute` through the coordinator, or hold it until the app can
    /// actually show it. Used by `PatinaAppDelegate` to deliver APNs taps.
    public func navigate(to route: AppRoute) {
        guard canOpen else {
            if pendingRoutes.count >= PendingLinkQueue.maximumDepth { pendingRoutes.removeFirst() }
            pendingRoutes.append(route)
            coordinator?.noteLinkHeld()
            return
        }
        coordinator?.openExternal(route)
    }

    // MARK: - The queue

    /// What is being held right now, oldest first. Read by tests and by the
    /// coordinator's drain; never by a view.
    var queuedURLs: [URL] { queue.urls() }

    /// True when a route pushed now lands on a mounted stack. Anything else —
    /// no coordinator yet, or a phase whose root is not the app — is kept.
    private var canOpen: Bool {
        guard let coordinator else { return false }
        return coordinator.phase == .main
    }

    /// Open the route if the app can show it; otherwise keep the URL so it can
    /// be replayed. The one seam every non-auth arm goes through, so no arm can
    /// quietly reacquire the drop-and-report-handled behaviour.
    @discardableResult
    private func deliver(_ route: AppRoute, from url: URL) -> Bool {
        guard canOpen else {
            queue.enqueue(url)
            coordinator?.noteLinkHeld()
            return true
        }
        coordinator?.openExternal(route)
        return true
    }

    /// Replay everything held, oldest first, once the app can show it.
    /// Idempotent: the queue empties as it drains.
    func drainIfPossible() {
        guard canOpen else { return }
        let routes = pendingRoutes
        pendingRoutes = []
        for route in routes { coordinator?.openExternal(route) }
        for url in queue.drain() { handle(url) }
    }

    // MARK: - URL Handling

    /// Handle an incoming URL
    /// - Parameter url: The URL to handle
    /// - Returns: Whether the URL was handled
    @discardableResult
    public func handle(_ url: URL) -> Bool {
        // SP-03: universal links arrive here through SwiftUI's `.onOpenURL`
        // with scheme `https`, so the custom-scheme guard below dropped every
        // one of them before the path switch was ever reached.
        if let route = Self.route(forUniversalLink: url) {
            return deliver(route, from: url)
        }

        // Check scheme
        guard url.scheme == APIConfiguration.appURLScheme else {
            return false
        }

        // Route based on host/path
        let host = url.host ?? ""

        switch host {
        case "auth":
            // NEVER queued, in any phase. `.main` is unreachable until the
            // magic-link callback is handled, so a queued auth URL would hold
            // the app at the auth wall for as long as the person kept trying.
            return handleAuthURL(url)

        case "room":
            return handleRoomURL(url)

        case "piece":
            return handlePieceURL(url)

        // W6: the widget's two doors. They sit here, on the right side of the
        // scheme guard, because `handle` checks universal links BEFORE that
        // guard and drops every other scheme after it.
        case Self.widgetTodayHost, Self.widgetRecordHost:
            return handleWidgetURL(url)

        default:
            // Try path-based routing for universal links
            return handlePathBasedURL(url)
        }
    }

    // MARK: - Auth URLs

    /// Handle authentication-related URLs (patina://auth?session=xxx&exp=xxx
    /// or patina://auth/callback?code=xxx for PKCE / #access_token=... for
    /// implicit-flow magic links).
    private func handleAuthURL(_ url: URL) -> Bool {
        // A magic-link callback can arrive with either:
        //   • PKCE flow: `?code=…` in the query string
        //   • Implicit flow: `#access_token=…&refresh_token=…` in the fragment
        // GoTrue's `/verify` redirect uses the implicit form, so the
        // previous query-only gate silently dropped magic-link logins
        // when the tokens were in the fragment.
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let hasCodeQuery = components?.queryItems?.contains(where: { $0.name == "code" }) == true
        let fragment = url.fragment ?? ""
        let hasFragmentTokens = fragment.contains("access_token") || fragment.contains("refresh_token")
        let isCallbackPath = url.path.hasPrefix("/callback") || (url.host == "auth" && url.path == "/callback")

        if hasCodeQuery || hasFragmentTokens || isCallbackPath {
            Task {
                do {
                    try await AuthService.shared.handleMagicLinkURL(url)
                    // The session was set inside handleMagicLinkURL, so
                    // the phase observer will move us out of `.auth` on
                    // its own. We only mark onboarding complete here
                    // because a magic-link sign-in implies the user
                    // already went through whatever onboarding the web
                    // surface required — we don't want to drop them
                    // back into the carousel + quiz.
                    await MainActor.run {
                        AppSettings.shared.hasCompletedOnboarding = true
                    }
                } catch {
                    PatinaLog.auth.error("Magic link auth failed: \(error)")
                }
            }
            return true
        }

        // For QR auth deep links, handle asynchronously to wait for auth state
        // (app may be cold-launched via deep link before auth state is ready)
        Task {
            // Wait for auth state to be determined
            await AuthService.shared.waitForAuthReady()

            // If still not authenticated after auth state is ready, try getting session
            if !AuthService.shared.isAuthenticated {
                _ = await AuthService.shared.getSession()
            }

            guard AuthService.shared.isAuthenticated else {
                // QR approval requires a real session — a guest can't
                // sign anyone else in. Clear guest mode so the phase
                // observer routes the user back to the AuthScreenView.
                coordinator?.guestModeOptIn = false
                return
            }

            // Let QRAuthService handle the URL
            let handled = qrAuthService.handleDeepLink(url)

            if handled {
                // Show approval sheet
                coordinator?.presentedSheet = .qr
            }
        }

        return true
    }

    // MARK: - Room URLs

    /// Handle room-related URLs (patina://room/uuid)
    private func handleRoomURL(_ url: URL) -> Bool {
        // Extract room ID from path
        guard let roomIdString = url.pathComponents.dropFirst().first,
              let roomId = UUID(uuidString: roomIdString) else {
            return false
        }

        return deliver(.roomProject(roomId: roomId), from: url)
    }

    // MARK: - Piece URLs

    /// Handle piece-related URLs (patina://piece/id)
    private func handlePieceURL(_ url: URL) -> Bool {
        guard let pieceId = url.pathComponents.dropFirst().first else {
            return false
        }

        return deliver(.pieceDetail(pieceId: pieceId), from: url)
    }

    // MARK: - Universal Links

    /// Map an `https://client.patina.cloud/<kind>/<id>` link to its route.
    /// Pure — no coordinator, no side effects — so the table is unit-testable
    /// and cannot drift from the paths the AASA file publishes.
    ///
    /// Only the client host is honoured. `app.patina.cloud` is the designer
    /// portal and the app has no business opening its routes.
    public static func route(forUniversalLink url: URL) -> AppRoute? {
        guard url.scheme == "https", url.host == PatinaDeepLinks.clientHost else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        guard parts.count >= 2 else { return nil }
        let id = parts[1]
        guard !id.isEmpty else { return nil }

        // PLURAL is the real spelling: it is what client-portal serves
        // (`ls apps/client-portal/src/app` → invoices, proposals, decisions,
        // piece), what the AASA file publishes, and what 00534 writes into
        // every notification's `deep_link` (d-notes.md §4). The singular forms
        // are kept as aliases so an older link still lands somewhere true.
        switch parts[0] {
        case "piece", "pieces":
            return .pieceDetail(pieceId: id)
        case "invoices", "invoice":
            return .invoiceDetail(invoiceId: id)
        case "proposals", "proposal":
            return .proposalDetail(proposalId: id)
        case "decisions", "decision":
            return .decisionDetail(decisionId: id)
        default:
            return nil
        }
    }

    // MARK: - Widget URLs (W6)

    /// `patina://today` — the plain open.
    static let widgetTodayHost = "today"
    /// `patina://record/<rowId>` — the row's own door.
    static let widgetRecordHost = "record"

    /// Map a widget URL to its route against the record the app itself wrote.
    ///
    /// Pure — no coordinator, no side effects — so the table is unit-testable,
    /// exactly like `route(forUniversalLink:)`.
    ///
    /// The widget carries a row **id**, not a route: it has no access to
    /// `AppRoute`, and duplicating `HouseRecord`'s route vocabulary in the
    /// extension would give it a second place to drift. So the id is resolved
    /// here, against the snapshot on disk.
    ///
    /// An unknown id, a row with no destination, or no snapshot at all resolves
    /// to `.heroFrame` — Today, plain. A widget tap must never dead-end, and it
    /// must never land somewhere the widget did not name.
    static func route(forWidgetLink url: URL, in record: HouseRecord?) -> AppRoute? {
        guard url.scheme == APIConfiguration.appURLScheme else { return nil }
        switch url.host {
        case widgetTodayHost:
            return .heroFrame
        case widgetRecordHost:
            let rowId = url.pathComponents.dropFirst().joined(separator: "/")
            guard !rowId.isEmpty, let record else { return .heroFrame }
            let row = (record.moved + record.needsYou).first { $0.id == rowId }
            return row?.route ?? .heroFrame
        default:
            return nil
        }
    }

    private func handleWidgetURL(_ url: URL) -> Bool {
        guard let route = Self.route(forWidgetLink: url, in: RecordSnapshotStore.shared.load()) else {
            return false
        }
        // Open-or-keep, the same seam every other arm takes: a tap that arrives
        // before SwiftUI has stood the coordinator up, or while the app is at
        // the auth wall, is held in the queue and replayed on arrival at
        // `.main` — the coldest of the four doors, and the easiest to drop.
        return deliver(route, from: url)
    }

    // MARK: - Path-Based URLs

    /// Handle URLs routed by path (for universal links)
    private func handlePathBasedURL(_ url: URL) -> Bool {
        let path = url.path

        if path.hasPrefix("/auth") {
            return handleAuthURL(url)
        }

        if path.hasPrefix("/room/") {
            return handleRoomURL(url)
        }

        if path.hasPrefix("/piece/") {
            return handlePieceURL(url)
        }

        return false
    }
}

//
//  Coordinator.swift
//  Patina
//
//  Base coordinator protocol for navigation management
//

import SwiftUI

/// Base protocol for all coordinators.
///
/// PT-3-4: `@MainActor`-isolated so the sole conformer (`AppCoordinator`) can
/// itself be a class-level `@MainActor` `@Observable` without per-method
/// isolation annotations. All call sites (SwiftUI views, `DeepLinkHandler`)
/// already run on the main actor.
@MainActor
public protocol Coordinator: AnyObject {
    associatedtype Route: Hashable

    /// Navigate to a specific route
    func navigate(to route: Route)

    /// Go back to previous screen
    func goBack()
}

/// Why the Quiet Conversation scan flow is being entered. Carried into
/// PostHog as the `reason` property so the single "Quiet Conversation"
/// screen name funnel can be segmented without forking the screen name
/// itself (PT-3-5). The flow host (`QuietConversationFlowHost`) picks the
/// LiDAR vs. manual-entry path on its own; `reason` is purely intent.
public enum ScanReason: String, Hashable {
    /// First scan of a brand-new room (Walk / Walk-First / "Scan a room").
    case fresh
    /// Re-scanning a room the user already has.
    case rescan
    /// Entered from the style conversation ("Update my style" / refine).
    case fromConversation
}

/// User-facing navigation destinations.
///
/// PT-3-6: every case here resolves to a *real* `navigationDestination`
/// (or a root-reset for the home surfaces). Sheet-only presentations live
/// on `AppCoordinator.PresentedSheet`; the internal scan-movement steps
/// (threshold → walk → review → … → floorPlan) live on
/// `QuietConversationFlowHost.InternalFlowStep`. The old `EmptyView()`
/// destination arms are gone.
///
/// PT-3-5: the five legacy scan-entry cases collapsed into a single
/// `.scanFlow(reason:)`.
public enum AppRoute: Hashable {
    case heroFrame                          // Home / DailyRoom root
    case roomList
    case yourSpaces                         // Room System: gallery
    case roomDetail(roomId: UUID)
    case roomProject(roomId: UUID)          // Room System: full project view
    case roomSettings(roomId: UUID)         // Room System: settings
    case crossRoom                          // Room System: all items
    case manualRoomEntry                    // Room System: manual entry form
    case roomSavedItems(roomId: UUID)       // Saved items for a room
    case emergence(pieceId: String?)
    case roomEmergence(roomId: UUID)        // Emergence for a specific room
    case table
    case pieceDetail(pieceId: String)

    // Quiet Conversation — Room Scan & Style Discovery (v2.0). One canonical
    // entry; `QuietConversationFlowHost` owns the internal step sequence.
    case scanFlow(reason: ScanReason)

    // Style Quiz routes
    case styleQuiz
    case styleResult(result: StyleProfileResult)

    // AR & Scan Enhancement routes
    case arPlacement(productId: String, roomRemoteId: String? = nil)

    // Phase 6 routes
    case profile
    case notifications
    case designerConsultation
    /// Submitted design-request status + detail. `focusLeadId` selects which
    /// request to open (nil → the promoted / newest one).
    case designRequests(focusLeadId: String?)

    // MVP v1 expanded — client surfaces
    case projectList                                  // client: list of projects
    case projectDetail(projectId: String)             // client: project detail
    case decisionList                                 // client: pending decisions
    case decisionDetail(decisionId: String)           // client: review options
    case threadList                                   // messaging inbox
    case threadDetail(threadId: String)               // messaging conversation

    // Wave 2 — money rail: proposals + e-sign (D.1)
    case proposalList                                 // client: list of proposals
    case proposalDetail(proposalId: String)           // client: proposal detail + sign

    // Wave 2 — money rail: invoices + pay (D.2)
    case invoiceList                                  // client: list of invoices
    case invoiceDetail(invoiceId: String)             // client: invoice detail + pay

    // Wave 3 — cross-project money picture (D.3) + shared documents (D.4)
    case budget                                       // client: budget overview
    case documentList                                 // client: shared documents

    /// Display name for the route. Used for debugging / companion context.
    ///
    /// NOTE (PT-3-5): the PostHog *screen name* for the scan flow is the
    /// constant `ScanAnalyticsScreen.quietConversation` ("Quiet
    /// Conversation"), NOT this `displayName`. See
    /// `AppRoute.analyticsScreenName`.
    public var displayName: String {
        switch self {
        case .heroFrame: return "Home"
        case .roomList: return "Your Rooms"
        case .yourSpaces: return "Your Spaces"
        case .roomDetail: return "Room Detail"
        case .roomProject: return "Room"
        case .roomSettings: return "Room Settings"
        case .crossRoom: return "All Items"
        case .manualRoomEntry: return "Room Details"
        case .roomSavedItems: return "Saved"
        case .emergence: return "Emergence"
        case .roomEmergence: return "Emergence"
        case .table: return "Saved"
        case .pieceDetail: return "Piece Detail"
        case .scanFlow: return "Quiet Conversation"
        case .styleQuiz: return "Style Quiz"
        case .styleResult: return "Your Style"
        case .arPlacement: return "AR Placement"
        case .profile: return "Profile"
        case .notifications: return "Notifications"
        case .designerConsultation: return "Designer"
        case .designRequests: return "Design Request"
        case .projectList: return "Projects"
        case .projectDetail: return "Project"
        case .decisionList: return "Decisions"
        case .decisionDetail: return "Decision"
        case .threadList: return "Messages"
        case .threadDetail: return "Conversation"
        case .proposalList: return "Proposals"
        case .proposalDetail: return "Proposal"
        case .invoiceList: return "Invoices"
        case .invoiceDetail: return "Invoice"
        case .budget: return "Budget"
        case .documentList: return "Documents"
        }
    }
}

/// PostHog screen-name constants. Centralised so the route → screen-name
/// mapping can be pinned by `RouteAnalyticsParityTests` (PT-3-5).
public enum ScanAnalyticsScreen {
    /// The single, stable screen name for the entire scan / style-discovery
    /// flow. Replaces the three distinct names ("Walk", "Walking",
    /// "Re-scan Room") that previously corrupted the funnel.
    public static let quietConversation = "Quiet Conversation"
}

public extension AppRoute {
    /// The PostHog screen name for this route. For `.scanFlow` this is the
    /// constant "Quiet Conversation" regardless of `reason` — the `reason`
    /// rides along as an event property instead (see
    /// `AppCoordinator.screenProperties(for:)`). `.table` / `.roomSavedItems`
    /// pin their pre-U09 names here (RouteAnalyticsParityTests,
    /// `stableRouteScreenNamesAreUnchanged`) — U09 renamed `displayName` to
    /// "Saved" for the surface's UI/companion-context copy, but the PostHog
    /// screen name stays put to avoid a silent dashboard regression. Every
    /// other route uses its `displayName`.
    var analyticsScreenName: String {
        switch self {
        case .scanFlow:
            return ScanAnalyticsScreen.quietConversation
        case .table:
            return "Your Table"
        case .roomSavedItems:
            return "Saved Items"
        default:
            return displayName
        }
    }

    /// The pre-consolidation PostHog screen name for this route, if it had a
    /// distinct one. Used ONLY for the `ios_screen_name_v2` dual-emit
    /// transition (PT-3-5) so legacy funnel dashboards keep receiving data
    /// while they're rebuilt against the new constant name. Returns `nil`
    /// for routes whose name didn't change.
    ///
    /// The three legacy names that previously corrupted the single scan
    /// funnel were "Walk", "Walking", and "Re-scan Room"; "Style Discovery"
    /// was the conversation-entry name. Keep this in sync with
    /// `RouteAnalyticsParityTests`.
    var legacyScreenName: String? {
        switch self {
        case .scanFlow(let reason):
            switch reason {
            case .fresh: return "Walking"
            case .rescan: return "Re-scan Room"
            case .fromConversation: return "Style Discovery"
            }
        default:
            return nil
        }
    }
}

/// App lifecycle phases — derived from `AuthService.session`, onboarding
/// completion, and guest opt-in by `AppCoordinator.recomputePhase()`.
/// Views render the current phase; they do not imperatively dismiss
/// themselves or set this directly (except the splash-transition helpers
/// on `AppCoordinator`).
public enum AppPhase: Equatable {
    /// Splash playing or session restore in flight. The minimum splash
    /// duration (see `AppCoordinator.splashMinimumDeadline`) prevents a
    /// fast cached-session restore from flashing past the splash.
    case launching
    /// No session and the user hasn't opted into guest mode — show the
    /// full-screen `AuthScreenView`.
    case auth
    /// Signed in (or guest) but hasn't completed onboarding — show the
    /// carousel + style quiz host.
    case onboarding
    /// Signed in (or guest) and onboarded — show the main app surface.
    case main
}

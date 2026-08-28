//
//  RouteTabTable.swift
//  Patina
//
//  Every `AppRoute` case names the tab it belongs to. The switch in `tab(for:)`
//  has no `default:` on purpose — a route added later must fail compilation
//  here rather than silently fall through onto Today.
//
//  The table decides where a route lands when the app is entered from OUTSIDE:
//  a deep link, a universal link, an APNs tap, a restore after re-auth. It is
//  deliberately NOT consulted for an in-app push: tapping a row pushes onto the
//  tab you are already on, so Back returns you where you were and a room's
//  "browse pieces for this room" never strands the room behind a tab switch.
//  See `TabNavigationModel.push(_:)`.
//

import Foundation

public struct RouteTabTable {

    private init() {}

    /// The tab a route belongs to.
    public static func tab(for route: AppRoute) -> PatinaTab {
        switch route {

        // Today — the record, the house, the story.
        case .heroFrame:
            return .today

        // Spaces — the rooms, everything scoped to a room, and the scan that
        // makes one. `roomEmergence` and `roomSavedItems` are room-shaped
        // routes reached from inside a room, so they belong to the room's tab
        // even though the surfaces they mount are browse and saved.
        case .yourSpaces,
             .roomProject,
             .roomSettings,
             .crossRoom,
             .manualRoomEntry,
             .roomSavedItems,
             .roomEmergence,
             .scanFlow,
             .arPlacement:
            return .spaces

        // Pieces — the catalogue, a piece, Saved, and the taste that shapes them.
        case .emergence,
             .table,
             .pieceDetail,
             .styleQuiz,
             .styleResult:
            return .pieces

        // Studio — the work: the designer, the projects, the money, the paper.
        case .profile,
             .notifications,
             .designerConsultation,
             .designRequests,
             .projectList,
             .projectDetail,
             .decisionList,
             .decisionDetail,
             .threadList,
             .threadDetail,
             .proposalList,
             .proposalDetail,
             .invoiceList,
             .invoiceDetail,
             .budget,
             .documentList:
            return .studio
        }
    }

    /// The route each tab's root stands for.
    ///
    /// Studio answers `.profile`. "Your Studio" is a canonical destination with
    /// no `AppRoute` of its own, and minting one would break five exhaustive
    /// switches inside `Features/Companion/**` and `Services/Companion/**` —
    /// including `CompanionActionProvider.screenItems`, which states in a
    /// comment that it carries no `default:` so a new route cannot reach an
    /// empty menu. C8 freezes those files. `.profile` is the honest stand-in:
    /// its screen is the one that already hosts `StudioHubView`.
    public static func rootRoute(for tab: PatinaTab) -> AppRoute {
        switch tab {
        case .today: return .heroFrame
        case .spaces: return .yourSpaces
        case .pieces: return .emergence(pieceId: nil)
        case .studio: return .profile
        }
    }

    /// Whether this route IS a tab's root. A tab-root route selects its tab and
    /// pops it to root instead of pushing a second copy of a door that already
    /// exists on the bar.
    public static func isTabRoot(_ route: AppRoute) -> Bool {
        PatinaTab.allCases.contains { rootRoute(for: $0) == route }
    }
}

//
//  CompanionActionProvider.swift
//  Patina
//
//  Provides context-aware actions for The Companion's expanded panel
//  Based on current screen, replaces hardcoded actions with dynamic per-screen arrays
//

import SwiftUI

// MARK: - Companion Action Item

struct CompanionActionItem: Identifiable {
    let id = UUID()
    let icon: String          // SF Symbol name
    let label: String
    let hint: String
    let isSuggested: Bool
    let route: AppRoute?      // Navigation target (nil for special actions)
    let specialAction: SpecialAction?

    enum SpecialAction {
        case openQRScanner
        case openSettings
        case openAuth
        /// Present the "Request design help" sheet (PT-3-8: design services
        /// is a `PresentedSheet`, not a navigation route).
        case openDesignServices(roomId: UUID?)
    }

    init(icon: String, label: String, hint: String, isSuggested: Bool = false, route: AppRoute) {
        self.icon = icon
        self.label = label
        self.hint = hint
        self.isSuggested = isSuggested
        self.route = route
        self.specialAction = nil
    }

    init(icon: String, label: String, hint: String, isSuggested: Bool = false, specialAction: SpecialAction) {
        self.icon = icon
        self.label = label
        self.hint = hint
        self.isSuggested = isSuggested
        self.route = nil
        self.specialAction = specialAction
    }
}

// MARK: - Companion Nudge

/// A nudge pill shown above the resting Companion mark. Carries both the
/// label and the route it navigates to so the pill is a real affordance,
/// not décor (R01/R02).
struct CompanionNudge: Equatable {
    let label: String
    let route: AppRoute
}

// MARK: - Context Provider

enum CompanionActionProvider {

    /// Get context-aware actions for the current screen
    static func actions(for screen: AppRoute, context: CompanionContext, isAuthenticated: Bool = true) -> [CompanionActionItem] {
        var items: [CompanionActionItem] = []

        switch screen {
        case .heroFrame:
            items = heroFrameItems(context: context, isAuthenticated: isAuthenticated)

        case .emergence, .roomEmergence:
            items = [
                CompanionActionItem(
                    icon: "heart", label: "Save to collection",
                    hint: "Create or add to board", isSuggested: true,
                    route: .table
                ),
                CompanionActionItem(
                    icon: "viewfinder", label: "Scan another room",
                    hint: "Add rooms to your profile",
                    route: .scanFlow(reason: .fresh)
                )
            ]

        case .pieceDetail:
            items = [
                // AR placement will be added in Phase 5
                CompanionActionItem(
                    icon: "heart", label: "Save",
                    hint: "Add to collection", isSuggested: true,
                    route: .table
                ),
                CompanionActionItem(
                    icon: "bubble.left", label: "Ask a designer",
                    hint: "Get expert advice",
                    specialAction: .openDesignServices(roomId: nil)
                )
            ]

        case .table:
            items = [
                CompanionActionItem(
                    icon: "sparkles", label: "Start a project",
                    hint: "From your saved items", isSuggested: true,
                    specialAction: .openDesignServices(roomId: nil)
                ),
                CompanionActionItem(
                    icon: "viewfinder", label: "Scan a room",
                    hint: "Add context for your saves",
                    route: .scanFlow(reason: .fresh)
                )
            ]

        case .roomList:
            items = [
                CompanionActionItem(
                    icon: "viewfinder", label: "Scan a new room",
                    hint: "Add another space", isSuggested: true,
                    route: .scanFlow(reason: .fresh)
                )
            ]

        case .roomDetail:
            items = [
                CompanionActionItem(
                    icon: "sparkles", label: "See recommendations",
                    hint: "Pieces for this room", isSuggested: true,
                    route: .emergence(pieceId: nil)
                ),
                CompanionActionItem(
                    icon: "arrow.counterclockwise", label: "Rescan room",
                    hint: "Capture updates",
                    route: .scanFlow(reason: .rescan)
                )
            ]

        case .arPlacement:
            items = [
                CompanionActionItem(
                    icon: "camera", label: "Save photo",
                    hint: "Capture this view", isSuggested: true,
                    route: .heroFrame
                ),
                CompanionActionItem(
                    icon: "arrow.triangle.2.circlepath", label: "Try another piece",
                    hint: "Swap in something else",
                    route: .emergence(pieceId: nil)
                )
            ]

        default:
            items = [
                CompanionActionItem(
                    icon: "house", label: "Home",
                    hint: "Back to your space",
                    route: .heroFrame
                )
            ]
        }

        appendUniversalItems(to: &items, screen: screen, isAuthenticated: isAuthenticated)

        return items
    }

    /// The screen-independent tail of every action list: the portal QR
    /// connect entry plus sign-in (guests) / profile (signed-in). Split out
    /// of `actions(for:context:isAuthenticated:)` to keep it under the
    /// function-body-length lint ceiling.
    private static func appendUniversalItems(
        to items: inout [CompanionActionItem],
        screen: AppRoute,
        isAuthenticated: Bool
    ) {
        // Always append "Connect to portal". (Settings / QR are now sheets,
        // not screens, so there's no screen to suppress this on — PT-3-8.)
        items.append(CompanionActionItem(
            icon: "qrcode.viewfinder", label: "Connect to portal",
            hint: "Scan QR · patina.cloud",
            specialAction: .openQRScanner
        ))

        if !isAuthenticated {
            items.append(CompanionActionItem(
                icon: "person.crop.circle.badge.plus", label: "Sign in",
                hint: "Save rooms · Sync across devices", isSuggested: true,
                specialAction: .openAuth
            ))
        } else if screen != .profile {
            items.append(CompanionActionItem(
                icon: "person.circle", label: "Your profile",
                hint: "Style · Rooms · Settings",
                route: .profile
            ))
        }
    }

    /// Home-hub actions. Split out of `actions(for:context:isAuthenticated:)`
    /// so the switch stays under the complexity/body-length lint ceilings.
    private static func heroFrameItems(
        context: CompanionContext,
        isAuthenticated: Bool
    ) -> [CompanionActionItem] {
        var items: [CompanionActionItem] = [
            CompanionActionItem(
                icon: "viewfinder", label: "Scan a room",
                hint: "Suggested next step", isSuggested: true,
                route: .scanFlow(reason: .fresh)
            ),
            CompanionActionItem(
                icon: "sparkles", label: "Your recommendations",
                hint: "\(context.roomCount > 0 ? "Based on your rooms" : "Take the quiz first")",
                route: .emergence(pieceId: nil)
            ),
            CompanionActionItem(
                icon: "heart", label: "Collections",
                hint: "\(context.tableItemCount) saved pieces",
                route: .table
            ),
            CompanionActionItem(
                icon: "paintpalette", label: "Style quiz",
                hint: "Discover your style",
                route: .styleQuiz
            ),
            CompanionActionItem(
                icon: "bell", label: "Notifications",
                hint: "Updates from your projects",
                route: .notifications
            )
        ]
        // C.1 / R29: signed-in clients get a direct door into the
        // studio hub (Projects is the anchor surface; Messages and
        // Decisions sit one row away on the home Studio rail). Guests
        // keep the shorter menu — their studio is behind sign-in.
        if isAuthenticated {
            items.insert(CompanionActionItem(
                icon: "rectangle.grid.1x2", label: "Your studio",
                hint: "Projects · Messages · Decisions",
                route: .projectList
            ), at: 1)
        }
        return items
    }

    /// The header title shown atop the expanded Companion panel. Varies by
    /// route so the prompt feels contextual rather than a generic "What next?".
    /// PT-6-10.
    static func panelTitle(for screen: AppRoute, context: CompanionContext) -> String {
        switch screen {
        case .heroFrame:
            return context.roomCount == 0 ? "Where to begin?" : "Where to next?"
        case .scanFlow:
            return "Keep scanning?"
        case .emergence, .roomEmergence:
            // After a save the user lands back here with a fuller table.
            return context.tableItemCount > 0 ? "Want another recommendation?" : "Want a recommendation?"
        case .pieceDetail:
            return "Save this one?"
        case .table:
            return "Ready to bring it together?"
        case .roomList, .yourSpaces:
            return "Which room next?"
        case .roomDetail, .roomProject:
            return "What's next for this room?"
        case .styleResult:
            return "Where to from here?"
        case .projectList, .decisionList:
            return "What's on your plate?"
        case .threadList, .threadDetail:
            return "Anything else?"
        case .profile:
            return "What would you like to do?"
        default:
            return "What next?"
        }
    }

    /// Get the nudge for a screen — the tappable pill shown above the
    /// Companion mark. Routes mirror the equivalent expanded-panel actions.
    static func nudge(for screen: AppRoute, context: CompanionContext) -> CompanionNudge? {
        switch screen {
        case .heroFrame:
            return context.roomCount == 0
                ? CompanionNudge(label: "Scan a room →", route: .scanFlow(reason: .fresh))
                : nil
        case .emergence, .roomEmergence:
            // AR try-in-room needs a concrete product, so only nudge when
            // the browsing surface has reported one. (Previously the pill
            // showed unconditionally but was dead — R01.)
            guard let piece = context.viewingPiece else { return nil }
            return CompanionNudge(
                label: "Try in your room →",
                route: .arPlacement(productId: piece.id)
            )
        case .table:
            return CompanionNudge(label: "Find more pieces →", route: .emergence(pieceId: nil))
        case .roomDetail(let roomId):
            return CompanionNudge(
                label: "See recommendations →",
                route: .roomEmergence(roomId: roomId)
            )
        case .styleResult:
            return CompanionNudge(label: "View recommendations →", route: .emergence(pieceId: nil))
        default:
            return nil
        }
    }
}

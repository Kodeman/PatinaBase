//
//  CompanionActionProvider.swift
//  Patina
//
//  Provides context-aware actions for The Companion's expanded panel based on
//  the current screen. Structure (split across files to stay under the type /
//  file length ceilings):
//    - This file: the item/nudge types, the public entry points
//      (`actions`, `panelTitle`, `nudge`), the exhaustive screen dispatch, and
//      the universal tail.
//    - `CompanionAreaBuilders.swift`: the per-area menu builders.
//    - `CompanionActionRows.swift`: the shared row factories.
//
//  `screenItems` is an EXHAUSTIVE switch over `AppRoute` (no `default:`) so a
//  newly-added route fails compilation instead of silently getting an empty
//  menu — the exact bug this replaced.
//

import SwiftUI

// MARK: - Companion Action Item

struct CompanionActionItem: Identifiable {
    let id = UUID()
    let icon: String          // SF Symbol name
    let label: String
    let hint: String
    let isSuggested: Bool
    /// Stable snake_case analytics identifier (e.g. "your_spaces",
    /// "ask_designer"). Reported as `action_id` on `companion_quick_action_tapped`.
    let analyticsId: String
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

    init(
        icon: String,
        label: String,
        hint: String,
        isSuggested: Bool = false,
        analyticsId: String,
        route: AppRoute
    ) {
        self.icon = icon
        self.label = label
        self.hint = hint
        self.isSuggested = isSuggested
        self.analyticsId = analyticsId
        self.route = route
        self.specialAction = nil
    }

    init(
        icon: String,
        label: String,
        hint: String,
        isSuggested: Bool = false,
        analyticsId: String,
        specialAction: SpecialAction
    ) {
        self.icon = icon
        self.label = label
        self.hint = hint
        self.isSuggested = isSuggested
        self.analyticsId = analyticsId
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

    /// Context-aware actions for the current screen: the screen-specific rows
    /// followed by the universal tail (HOME + identity). Enforced invariants
    /// (DEBUG): at most 6 rows total (the panel has no ScrollView) and at most
    /// one suggested row.
    static func actions(
        for screen: AppRoute,
        context: CompanionContext,
        isAuthenticated: Bool = true
    ) -> [CompanionActionItem] {
        var items = screenItems(for: screen, context: context, isAuthenticated: isAuthenticated)
        appendTail(to: &items, screen: screen, isAuthenticated: isAuthenticated)

        #if DEBUG
        assert(items.count <= 6, "Companion menu for \(screen) exceeds 6 rows (\(items.count))")
        assert(items.filter(\.isSuggested).count <= 1, "Companion menu for \(screen) has >1 suggested row")
        #endif

        return items
    }

    // MARK: - Screen dispatch (exhaustive — NO default arm)

    /// Exhaustive dispatch to per-area builders. There is deliberately no
    /// `default:` — a newly-added `AppRoute` case must fail compilation here so
    /// it can never silently fall through to an empty menu.
    private static func screenItems(
        for screen: AppRoute,
        context: CompanionContext,
        isAuthenticated: Bool
    ) -> [CompanionActionItem] {
        switch screen {
        case .heroFrame:
            return homeItems(context: context)
        case .emergence, .roomEmergence, .pieceDetail, .arPlacement:
            return discoveryItems(screen, context: context)
        case .table, .roomSavedItems, .crossRoom:
            return collectionsItems(screen, context: context)
        case .yourSpaces, .roomProject,
             .roomSettings, .manualRoomEntry:
            return roomsItems(screen, context: context)
        case .scanFlow:
            return scanItems(screen, context: context)
        case .styleQuiz, .styleResult:
            return styleItems(screen, context: context)
        case .studio, .projectList, .projectDetail, .decisionList, .decisionDetail,
             .threadList, .threadDetail, .documentList, .notifications,
             .designerConsultation, .designRequests,
             // W5: the two order screens get their own arm inside
             // `studioItems` — an order is Studio work, not money-rail work.
             .orderList, .orderDetail:
            return studioItems(screen, context: context)
        case .proposalList, .proposalDetail, .invoiceList, .invoiceDetail, .budget:
            return moneyRailItems(screen, context: context)
        case .profile:
            return accountItems(context: context, isAuthenticated: isAuthenticated)
        }
    }

    // MARK: - Universal tail

    /// HOME on every non-`.heroFrame` screen, then the identity row: guests get
    /// SIGN-IN (suggested only if no screen row already is — fixes the historical
    /// double-suggestion), signed-in users get PROFILE — except on the two routes
    /// that already render the profile composition. `.studio` is the second of
    /// them (R2 gave the Studio tab its own route over `ProfileView`); offering
    /// the row there pushed a duplicate `ProfileView`, back chevron and all, onto
    /// the tab whose root it already was.
    /// "Connect to portal" is NOT here — it lives in the `.profile` menu,
    /// signed-in only.
    private static func appendTail(
        to items: inout [CompanionActionItem],
        screen: AppRoute,
        isAuthenticated: Bool
    ) {
        if screen != .heroFrame {
            items.append(homeRow())
        }
        if !isAuthenticated {
            let hasSuggested = items.contains(where: \.isSuggested)
            items.append(signInRow(suggested: !hasSuggested))
        } else if screen != .profile && screen != .studio {
            items.append(profileRow())
        }
    }

    // MARK: - Panel Title

    /// The header title atop the expanded Companion panel. Varies by route so
    /// the prompt feels contextual. Split into helpers to stay under the
    /// cyclomatic-complexity ceiling. PT-6-10.
    static func panelTitle(for screen: AppRoute, context: CompanionContext) -> String {
        switch screen {
        case .heroFrame:
            return context.roomCount == 0 ? "Where to begin?" : "Where to next?"
        case .emergence, .roomEmergence:
            return context.tableItemCount > 0 ? "Want another recommendation?" : "Want a recommendation?"
        case .pieceDetail:
            return "Save this one?"
        case .table:
            return "Ready to bring it together?"
        case .roomSavedItems:
            return "Working with these pieces?"
        case .crossRoom:
            return "Everything, all at once"
        case .arPlacement:
            return "How does it look?"
        case .yourSpaces:
            return "Which room next?"
        default:
            return panelTitleDetail(for: screen)
        }
    }

    private static func panelTitleDetail(for screen: AppRoute) -> String {
        switch screen {
        case .roomProject:
            return "What's next for this room?"
        case .roomSettings:
            return "All set here?"
        case .manualRoomEntry:
            return "Prefer to scan?"
        case .scanFlow:
            return "Keep scanning?"
        case .styleQuiz:
            return "Pause the quiz?"
        case .styleResult:
            return "Where to from here?"
        case .profile:
            return "What would you like to do?"
        default:
            return studioPanelTitle(for: screen)
        }
    }

    private static func studioPanelTitle(for screen: AppRoute) -> String {
        switch screen {
        case .studio:
            return "What's next?"
        case .projectList:
            return "What's on your plate?"
        case .projectDetail:
            return "Anything for this project?"
        case .decisionList:
            return "Ready to decide?"
        case .decisionDetail:
            return "Need a second opinion?"
        case .threadList:
            return "Anything else?"
        case .threadDetail:
            return "While you're here"
        case .designerConsultation:
            return "Working with your designer"
        case .designRequests:
            return "While you wait…"
        default:
            return moneyPanelTitle(for: screen)
        }
    }

    private static func moneyPanelTitle(for screen: AppRoute) -> String {
        switch screen {
        case .proposalList:
            return "Reviewing proposals?"
        case .proposalDetail:
            return "Ready to sign?"
        case .invoiceList:
            return "Settling up?"
        case .invoiceDetail:
            return "About this invoice?"
        case .budget:
            return "The whole picture"
        case .documentList:
            return "Looking for something?"
        case .notifications:
            return "All caught up?"
        default:
            return "What next?"
        }
    }

    // MARK: - Nudge

    /// The tappable pill shown above the resting Companion mark. Routes mirror
    /// the equivalent expanded-panel actions.
    static func nudge(for screen: AppRoute, context: CompanionContext) -> CompanionNudge? {
        switch screen {
        case .heroFrame:
            // The Daily Room's zero-rooms empty module already renders a single
            // "Start a scan" CTA — suppress the redundant persistent pill (C.2).
            return nil
        case .emergence, .roomEmergence:
            // AR try-in-room needs a concrete product AND an AR asset for it.
            // The menu row with the same destination was retired in W2 R3
            // because `usdz_url` is NULL on every product; this pill is the
            // second surface onto the same dead end (r3-notes.md §2). It now
            // draws only for a piece that carries a model, which is the same
            // gate ProductDetailView's own AR button uses (SP-18).
            guard let piece = context.viewingPiece, piece.hasARModel else { return nil }
            return CompanionNudge(label: "Try in your room →", route: .arPlacement(productId: piece.id))
        case .table:
            return CompanionNudge(label: "Find more pieces →", route: .emergence(pieceId: nil))
        case .roomProject(let roomId):
            return CompanionNudge(label: "See recommendations →", route: .roomEmergence(roomId: roomId))
        case .styleResult:
            return CompanionNudge(label: "View recommendations →", route: .emergence(pieceId: nil))
        default:
            return nil
        }
    }
}

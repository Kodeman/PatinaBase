//
//  CompanionAreaBuilders.swift
//  Patina
//
//  Per-area menu builders for The Companion, dispatched from
//  `CompanionActionProvider.screenItems`. Each builder handles one cluster of
//  routes and returns only the screen-specific rows (the universal tail is
//  appended by the caller). Kept in a separate file so the provider enum stays
//  under the type-body-length ceiling.
//

import Foundation

extension CompanionActionProvider {

    // MARK: - Home

    /// The Studio door (projects · messages · decisions) is tier-gated, not
    /// auth-gated: a signed-in homeowner who has never engaged a designer has
    /// nothing behind it, so offering it was a promise the app couldn't keep
    /// (U20). An unresolved tier reads as `.discovering` — never open the door
    /// on a guess.
    static func showsStudioRow(_ context: CompanionContext) -> Bool {
        (context.engagementTier ?? .discovering) >= .engaged
    }

    static func homeItems(context: CompanionContext) -> [CompanionActionItem] {
        if context.roomCount == 0 {
            var rows = [
                spacesOrScanRow(context: context, suggested: true),
                styleQuizRow(context: context),
                recommendationsRow(context: context)
            ]
            if let collections = collectionsRow(context: context) { rows.append(collections) }
            if showsStudioRow(context) { rows.append(studioRow()) }
            return rows
        }
        var rows = [
            recommendationsRow(context: context, suggested: true),
            spacesOrScanRow(context: context),
            scanRow(label: "Add another space", hint: "Capture another room", reason: .fresh)
        ]
        if let collections = collectionsRow(context: context) { rows.append(collections) }
        if context.activeDesignRequest != nil {
            rows.append(requestRow(context: context))
        } else if showsStudioRow(context) {
            rows.append(studioRow())
        }
        return rows
    }

    // MARK: - Discovery (browse + AR)

    static func discoveryItems(
        _ screen: AppRoute,
        context: CompanionContext
    ) -> [CompanionActionItem] {
        switch screen {
        case .emergence, .roomEmergence:
            let roomId = emergenceRoomId(screen, context: context)
            var rows = [saveRow(label: "Save to collection")]
            if let piece = context.viewingPiece { rows.append(tryInRoomRow(productId: piece.id)) }
            rows.append(designerRow(roomId: roomId, context: context))
            return rows
        case .pieceDetail(let pieceId):
            return [
                saveRow(label: "Save"),
                tryInRoomRow(productId: pieceId),
                designerRow(roomId: nil, context: context)
            ]
        default: // .arPlacement
            return [
                item("camera", "Save photo", "Capture this view",
                     route: .heroFrame, id: "save_photo", suggested: true),
                item("arrow.triangle.2.circlepath", "Try another piece", "Swap in something else",
                     route: .emergence(pieceId: nil), id: "recommendations")
            ]
        }
    }

    // MARK: - Collections (saved items)

    static func collectionsItems(
        _ screen: AppRoute,
        context: CompanionContext
    ) -> [CompanionActionItem] {
        switch screen {
        case .table:
            let byRoom = context.roomCount == 0
                ? scanRow(label: "Scan a room", hint: "See saves by space", reason: .fresh)
                : item("square.grid.3x3", "See by room", "Saved items by space",
                       route: .crossRoom, id: "cross_room")
            return [
                designerRow(roomId: nil, context: context, label: "Get design help", suggested: true),
                item("sparkles", "Find more pieces", "More recommendations",
                     route: .emergence(pieceId: nil), id: "recommendations"),
                byRoom
            ]
        case .roomSavedItems(let roomId):
            return [
                item("sparkles", "Recommendations for this room", "Pieces for this space",
                     route: .roomEmergence(roomId: roomId), id: "room_recommendations", suggested: true),
                designerRow(roomId: roomId, context: context),
                item("heart", "All saved items", "Everything you've saved",
                     route: .table, id: "collections")
            ]
        default: // .crossRoom
            return [
                spacesOrScanRow(context: context, suggested: true),
                item("heart", "Saved", "Everything you've saved",
                     route: .table, id: "collections"),
                designerRow(roomId: nil, context: context)
            ]
        }
    }

    // MARK: - Rooms

    static func roomsItems(
        _ screen: AppRoute,
        context: CompanionContext
    ) -> [CompanionActionItem] {
        switch screen {
        case .roomList, .yourSpaces:
            return [
                scanRow(label: "Add another space", hint: "Scan a new room",
                        reason: .fresh, suggested: true),
                item("square.and.pencil", "Add a room manually", "Enter details by hand",
                     route: .manualRoomEntry, id: "manual_room"),
                item("square.grid.3x3", "All saved items", "Across every room",
                     route: .crossRoom, id: "cross_room"),
                designerRow(roomId: nil, context: context)
            ]
        case .roomDetail(let roomId), .roomProject(let roomId):
            return [
                item("sparkles", "See recommendations", "Pieces for this room",
                     route: .roomEmergence(roomId: roomId), id: "room_recommendations", suggested: true),
                item("bookmark.fill", "Saved in this room", "Your picks here",
                     route: .roomSavedItems(roomId: roomId), id: "room_saved_items"),
                designerRow(roomId: roomId, context: context),
                scanRow(label: "Rescan room", hint: "Capture updates", reason: .rescan)
            ]
        case .roomSettings(let roomId):
            return [
                item("arrow.uturn.backward", "Back to the room", "Return to details",
                     route: .roomDetail(roomId: roomId), id: "back_to_room", suggested: true),
                scanRow(label: "Rescan this room", hint: "Capture updates", reason: .rescan)
            ]
        default: // .manualRoomEntry
            return [
                scanRow(label: "Scan with your camera", hint: "Capture in 3D instead",
                        reason: .fresh, suggested: true),
                spacesOrScanRow(context: context)
            ]
        }
    }

    // MARK: - Scan flow

    /// `.scanFlow` is the only scan route left — mid-capture the Companion
    /// offers the universal tail and nothing else (don't tempt exits). Every
    /// scan *entry* is a `scanRow(...)` on the surrounding surfaces, which
    /// already routes straight to `.scanFlow`.
    static func scanItems(
        _ screen: AppRoute,
        context: CompanionContext
    ) -> [CompanionActionItem] {
        []
    }

    // MARK: - Style

    static func styleItems(
        _ screen: AppRoute,
        context: CompanionContext
    ) -> [CompanionActionItem] {
        switch screen {
        case .styleResult:
            return [
                item("sparkles", "View recommendations", "Pieces for your style",
                     route: .emergence(pieceId: nil), id: "recommendations", suggested: true),
                scanRow(label: "Ground it in a real room", hint: "Scan a space", reason: .fresh),
                item("paintpalette", "Retake the quiz", "Refine your style",
                     route: .styleQuiz, id: "style_quiz")
            ]
        default: // .styleQuiz — mid-quiz, tail only
            return []
        }
    }

    // MARK: - Studio (projects / decisions / messages / docs / designer)

    static func studioItems(
        _ screen: AppRoute,
        context: CompanionContext
    ) -> [CompanionActionItem] {
        switch screen {
        case .projectList, .projectDetail:
            return projectItems(screen, context: context)
        case .decisionList, .decisionDetail:
            return decisionItems(screen, context: context)
        case .threadList, .threadDetail:
            return messageItems(screen, context: context)
        case .documentList:
            return documentItems()
        case .notifications:
            return notificationItems(context: context)
        default: // .designerConsultation, .designRequests
            return designerItems(screen, context: context)
        }
    }

    static func projectItems(
        _ screen: AppRoute,
        context: CompanionContext
    ) -> [CompanionActionItem] {
        if case .projectDetail = screen {
            return [
                messageDesignerRow(label: "Message your designer", suggested: true),
                decisionsRow(),
                item("folder", "Documents", "Files for this project",
                     route: .documentList, id: "documents")
            ]
        }
        return [
            decisionsRow(suggested: true),
            messageDesignerRow(label: "Messages", hint: "Your conversations"),
            proposalsRow(),
            budgetRow(label: "Budget")
        ]
    }

    static func decisionItems(
        _ screen: AppRoute,
        context: CompanionContext
    ) -> [CompanionActionItem] {
        if case .decisionDetail = screen {
            return [
                messageDesignerRow(label: "Message your designer", suggested: true),
                item("checkmark.seal", "All decisions", "Back to the list",
                     route: .decisionList, id: "decisions"),
                budgetRow(label: "Your budget")
            ]
        }
        return [
            messageDesignerRow(label: "Talk an option through", suggested: true),
            projectsRow(),
            budgetRow(label: "Your budget")
        ]
    }

    static func messageItems(
        _ screen: AppRoute,
        context: CompanionContext
    ) -> [CompanionActionItem] {
        if case .threadDetail = screen {
            // No suggested row — the conversation itself is the task.
            return [decisionsRow(), proposalsRow(), projectsRow()]
        }
        return [
            decisionsRow(suggested: true),
            projectsRow(),
            proposalsRow()
        ]
    }

    static func documentItems() -> [CompanionActionItem] {
        [
            projectsRow(suggested: true),
            messageDesignerRow(label: "Messages", hint: "Your conversations"),
            proposalsRow()
        ]
    }

    static func notificationItems(context: CompanionContext) -> [CompanionActionItem] {
        [
            decisionsRow(suggested: true),
            messageDesignerRow(label: "Messages", hint: "Your conversations"),
            spacesOrScanRow(context: context)
        ]
    }

    static func designerItems(
        _ screen: AppRoute,
        context: CompanionContext
    ) -> [CompanionActionItem] {
        if case .designRequests = screen {
            return [
                messageDesignerRow(label: "Message your designer", suggested: true),
                recommendationsRow(context: context),
                spacesOrScanRow(context: context)
            ]
        }
        var rows = [messageDesignerRow(label: "Message your designer", suggested: true)]
        if context.activeDesignRequest != nil { rows.append(requestRow(context: context)) }
        rows.append(projectsRow())
        return rows
    }

    // MARK: - Money rail

    static func moneyRailItems(
        _ screen: AppRoute,
        context: CompanionContext
    ) -> [CompanionActionItem] {
        switch screen {
        case .proposalDetail:
            return [
                messageDesignerRow(label: "Questions? Message your designer", suggested: true),
                budgetRow(label: "See your budget"),
                item("doc.text", "All proposals", "Back to the list",
                     route: .proposalList, id: "proposals")
            ]
        case .invoiceList:
            return [
                budgetRow(label: "Your budget", suggested: true),
                messageDesignerRow(label: "Message your designer"),
                proposalsRow()
            ]
        case .invoiceDetail:
            return [
                messageDesignerRow(label: "Question? Message your designer", suggested: true),
                budgetRow(label: "Your budget"),
                item("creditcard", "All invoices", "Back to the list",
                     route: .invoiceList, id: "invoices")
            ]
        case .budget:
            return [
                invoicesRow(label: "Invoices", suggested: true),
                proposalsRow(),
                projectsRow()
            ]
        default: // .proposalList
            return [
                messageDesignerRow(label: "Questions? Message your designer", suggested: true),
                budgetRow(label: "Your budget"),
                invoicesRow(label: "Invoices")
            ]
        }
    }

    // MARK: - Account

    static func accountItems(
        context: CompanionContext,
        isAuthenticated: Bool
    ) -> [CompanionActionItem] {
        // No suggested row — Profile is a settling place, not a next step.
        var rows: [CompanionActionItem] = []
        if isAuthenticated {
            rows.append(CompanionActionItem(
                icon: "qrcode.viewfinder", label: "Connect to portal",
                hint: "Scan QR · patina.cloud", analyticsId: "connect_portal",
                specialAction: .openQRScanner
            ))
        }
        rows.append(CompanionActionItem(
            icon: "gearshape", label: "Settings", hint: "Preferences & account",
            analyticsId: "settings", specialAction: .openSettings
        ))
        rows.append(spacesOrScanRow(context: context))
        rows.append(item("paintpalette", "Retake the style quiz", "Refresh your profile",
                         route: .styleQuiz, id: "style_quiz"))
        return rows
    }
}

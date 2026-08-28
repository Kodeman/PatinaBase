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

    /// SP-13: the Daily Room carries a message row once a designer is actually
    /// on the job. An unresolved relationship reads as no designer — never
    /// offer a conversation with nobody.
    static func showsMessageDesignerRow(_ context: CompanionContext) -> Bool {
        context.designerRelationship?.isLive ?? false
    }

    /// The home menu, composed from ONE fixed priority list rather than two
    /// hand-built branches, so C8's cap (at most 6 rows *including* the
    /// provider's tail — the panel has no ScrollView) holds by construction for
    /// every combination of rooms / designer / request / tier / saved count:
    ///
    ///   1. Message your designer — only where a designer is on the job
    ///   2. Your design request, else Your studio — only where one exists
    ///   3. Your recommendations
    ///   4. Saved — unconditional (SP-12)
    ///   5. Your spaces — at zero rooms this row IS the scan ("Add your first
    ///      space" → `.scanFlow`), one row rather than two
    ///   + the tail the provider appends (Your profile, or Sign in) = 6 max.
    ///
    /// Two rows were dropped to fit: the standalone "Add another space" scan
    /// row (scanning lives one tap in, as the suggested row atop Your Spaces)
    /// and the style-quiz row (the quiz keeps its own Daily Room card, the
    /// empty-recommendations CTA, and the Profile menu). Rows are appended in
    /// priority order, so the row that falls if the tail ever grows is the
    /// lowest-priority one present — `spacesOrScanRow`.
    static func homeItems(context: CompanionContext) -> [CompanionActionItem] {
        let hasRooms = context.roomCount > 0
        var rows: [CompanionActionItem] = []
        if showsMessageDesignerRow(context) {
            rows.append(messageDesignerRow(label: "Message your designer"))
        }
        if context.activeDesignRequest != nil {
            rows.append(requestRow(context: context))
        } else if showsStudioRow(context) {
            rows.append(studioRow())
        }
        rows.append(recommendationsRow(context: context, suggested: hasRooms))
        if let collections = collectionsRow(context: context) { rows.append(collections) }
        rows.append(spacesOrScanRow(context: context, suggested: !hasRooms))
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
            let rows = [saveRow(label: "Save to collection")]
            return rows + [designerRow(roomId: roomId, context: context)]
        case .pieceDetail:
            // W2 R3 (W1b SP-18 residual): `tryInRoomRow` dead-ended on every
            // product while `usdz_url` is NULL — removed here, not deleted;
            // it returns the day an AR asset pipeline exists.
            //
            // W5: the second row is the piece's own act — Ask her, Buy, or ask
            // about it — so the panel and the bar agree. Until the screen has
            // resolved one (the piece is still loading) the row stays what it
            // was, which is the designer door.
            guard let act = context.pieceAct else {
                return [saveRow(label: "Save"), designerRow(roomId: nil, context: context)]
            }
            // Exactly one suggested row per panel: once the piece has an act,
            // the act is it and "Save" steps back.
            return [saveRow(label: "Save", suggested: false), pieceActRow(act)]
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
        case .yourSpaces:
            return [
                scanRow(label: "Add another space", hint: "Scan a new room",
                        reason: .fresh, suggested: true),
                item("square.and.pencil", "Add a room manually", "Enter details by hand",
                     route: .manualRoomEntry, id: "manual_room"),
                item("square.grid.3x3", "All saved items", "Across every room",
                     route: .crossRoom, id: "cross_room"),
                designerRow(roomId: nil, context: context)
            ]
        case .roomProject(let roomId):
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
                     route: .roomProject(roomId: roomId), id: "back_to_room", suggested: true),
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
        // The Studio tab's own root (R2). The four doors the hub lists, in the
        // order the hub lists them — plus the provider's tail: HOME and, for a
        // guest, SIGN-IN, which is C8's cap of six exactly. A signed-in reader
        // gets HOME alone, because this screen IS the profile composition and
        // the tail does not offer a screen itself. Not `accountItems`: the
        // identity rows belong to the screen's own composition, and the QR
        // scanner stays on `.profile` where `CompanionActionMatrixTests` pins it.
        case .studio:
            return [
                decisionsRow(suggested: true),
                messageDesignerRow(label: "Messages", hint: "Your conversations"),
                proposalsRow(),
                budgetRow(label: "Billed to date")
            ]
        case .projectList, .projectDetail:
            return projectItems(screen, context: context)
        case .decisionList, .decisionDetail:
            return decisionItems(screen, context: context)
        case .threadList, .threadDetail:
            return messageItems(screen, context: context)
        case .documentList:
            return documentItems()
        case .orderList, .orderDetail:
            return orderItems(screen, context: context)
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
                budgetRow(label: "Billed to date")
            ]
        }
        return [
            messageDesignerRow(label: "Talk an option through", suggested: true),
            projectsRow(),
            budgetRow(label: "Billed to date")
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

    /// W5 — the two order screens. Without an arm of their own they fell to
    /// `default:` and were handed the *designer-request* rows, which is the
    /// wrong conversation entirely for someone looking at a sofa in transit.
    ///
    /// No "Ordered" row is added to `.studio`'s own list: C8's cap is six rows
    /// INCLUDING the provider's tail, and `.studio` already sits at six for a
    /// guest (see `studioItems`). The Ordered door is the Studio hub's own row.
    static func orderItems(
        _ screen: AppRoute,
        context: CompanionContext
    ) -> [CompanionActionItem] {
        if case .orderDetail = screen {
            return [
                messageDesignerRow(label: "Message your designer", suggested: true),
                ordersRow(),
                projectsRow()
            ]
        }
        return [
            messageDesignerRow(label: "Message your designer", suggested: true),
            projectsRow(),
            invoicesRow(label: "Invoices")
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
                budgetRow(label: "See what's been billed"),
                item("doc.text", "All proposals", "Back to the list",
                     route: .proposalList, id: "proposals")
            ]
        case .invoiceList:
            return [
                budgetRow(label: "Billed to date", suggested: true),
                messageDesignerRow(label: "Message your designer"),
                proposalsRow()
            ]
        case .invoiceDetail:
            return [
                messageDesignerRow(label: "Question? Message your designer", suggested: true),
                budgetRow(label: "Billed to date"),
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
                budgetRow(label: "Billed to date"),
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

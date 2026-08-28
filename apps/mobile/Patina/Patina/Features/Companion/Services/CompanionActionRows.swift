//
//  CompanionActionRows.swift
//  Patina
//
//  Shared row factories for The Companion menu. Centralising them here keeps
//  identical intents looking identical on every screen (same icon, copy, and
//  analytics id) and keeps the provider enum under the type-body-length ceiling.
//

import Foundation

extension CompanionActionProvider {

    /// Generic navigation row builder — the common case (icon, label, hint,
    /// route, stable analytics id).
    static func item(
        _ icon: String,
        _ label: String,
        _ hint: String,
        route: AppRoute,
        id: String,
        suggested: Bool = false
    ) -> CompanionActionItem {
        CompanionActionItem(
            icon: icon, label: label, hint: hint,
            isSuggested: suggested, analyticsId: id, route: route
        )
    }

    // MARK: - Tail / identity

    static func homeRow() -> CompanionActionItem {
        item("house", "Home", "Back to your space", route: .heroFrame, id: "home")
    }

    static func profileRow() -> CompanionActionItem {
        item("person.circle", "Your profile", "Style · Settings · Portal",
             route: .profile, id: "profile")
    }

    static func signInRow(suggested: Bool) -> CompanionActionItem {
        CompanionActionItem(
            icon: "person.crop.circle.badge.plus", label: "Sign in",
            hint: "Save rooms · Sync across devices", isSuggested: suggested,
            analyticsId: "sign_in", specialAction: .openAuth
        )
    }

    // MARK: - Studio links

    static func studioRow() -> CompanionActionItem {
        item("rectangle.grid.1x2", "Your studio", "Projects · Messages · Decisions",
             route: .projectList, id: "your_studio")
    }

    static func projectsRow(suggested: Bool = false) -> CompanionActionItem {
        item("folder", "Your projects", "Everything in one place",
             route: .projectList, id: "projects", suggested: suggested)
    }

    static func decisionsRow(suggested: Bool = false) -> CompanionActionItem {
        item("checkmark.seal", "Decisions waiting", "Options need your call",
             route: .decisionList, id: "decisions", suggested: suggested)
    }

    static func budgetRow(label: String, suggested: Bool = false) -> CompanionActionItem {
        item("chart.pie", label, "What's been billed", route: .budget, id: "budget", suggested: suggested)
    }

    static func proposalsRow(suggested: Bool = false) -> CompanionActionItem {
        item("doc.text", "Proposals", "Review & sign",
             route: .proposalList, id: "proposals", suggested: suggested)
    }

    static func invoicesRow(label: String, suggested: Bool = false) -> CompanionActionItem {
        item("creditcard", label, "What's due", route: .invoiceList, id: "invoices", suggested: suggested)
    }

    // MARK: - Discovery

    /// `suggested` is a parameter because the piece screen has a better answer
    /// than "save it" once W5 resolves an act: on `.pieceDetail` the act row is
    /// the suggestion and this one steps back. The panel allows exactly one.
    static func saveRow(label: String, suggested: Bool = true) -> CompanionActionItem {
        item("heart", label, "Add to a collection", route: .table, id: "save_collection", suggested: suggested)
    }

    static func tryInRoomRow(productId: String) -> CompanionActionItem {
        CompanionActionItem(
            icon: "arkit", label: "Try in your room", hint: "See it in AR",
            analyticsId: "try_in_room", route: .arPlacement(productId: productId)
        )
    }

    static func recommendationsRow(
        context: CompanionContext,
        suggested: Bool = false
    ) -> CompanionActionItem {
        // "Take the quiz first" used to be keyed on `roomCount`, which is the
        // wrong signal — it told a user who had just finished the quiz to go
        // take the quiz (U42). Rooms still win the hint when there are any;
        // otherwise the style profile decides.
        let hint: String
        if context.roomCount > 0 {
            hint = "Based on your rooms"
        } else if context.hasStyleProfile {
            hint = "Pieces for your style"
        } else {
            hint = "Take the quiz first"
        }
        return CompanionActionItem(
            icon: "sparkles", label: "Your recommendations", hint: hint,
            isSuggested: suggested, analyticsId: "recommendations",
            route: .emergence(pieceId: nil)
        )
    }

    // MARK: - Style

    /// The style-quiz door. Once a profile exists it must stop advertising
    /// discovery — the same copy the style-result menu already uses (U42).
    static func styleQuizRow(context: CompanionContext) -> CompanionActionItem {
        if context.hasStyleProfile {
            return item("paintpalette", "Retake the quiz", "Refine your style",
                        route: .styleQuiz, id: "style_quiz")
        }
        return item("paintpalette", "Style quiz", "Discover your style",
                    route: .styleQuiz, id: "style_quiz")
    }

    // MARK: - Rooms

    /// SPACES → the rooms gallery ("N rooms"), but for a homeowner with no rooms
    /// yet it renders as a SCAN row ("Add your first space") — the useful next
    /// step when there's nothing to browse.
    static func spacesOrScanRow(
        context: CompanionContext,
        suggested: Bool = false
    ) -> CompanionActionItem {
        if context.roomCount == 0 {
            return CompanionActionItem(
                icon: "viewfinder", label: "Add your first space",
                hint: "Capture your first room", isSuggested: suggested,
                analyticsId: "scan", route: .scanFlow(reason: .fresh)
            )
        }
        let plural = context.roomCount == 1 ? "" : "s"
        return CompanionActionItem(
            icon: "square.grid.2x2", label: "Your spaces",
            hint: "\(context.roomCount) room\(plural)", isSuggested: suggested,
            analyticsId: "your_spaces", route: .yourSpaces
        )
    }

    static func scanRow(
        label: String,
        hint: String,
        reason: ScanReason,
        suggested: Bool = false
    ) -> CompanionActionItem {
        CompanionActionItem(
            icon: "viewfinder", label: label, hint: hint,
            isSuggested: suggested, analyticsId: "scan", route: .scanFlow(reason: reason)
        )
    }

    /// The `roomId` for a designer row on an emergence surface: the specific
    /// room for `.roomEmergence`, else the active room in context.
    static func emergenceRoomId(_ screen: AppRoute, context: CompanionContext) -> UUID? {
        if case let .roomEmergence(roomId) = screen { return roomId }
        return context.activeRoom?.id
    }

    // MARK: - Designer / design request

    /// The designer-contact row. When the homeowner has an active promoted
    /// request it renders as REQUEST ("Your design request") instead — the live
    /// request is the more useful door than a fresh-request sheet.
    static func designerRow(
        roomId: UUID?,
        context: CompanionContext,
        label: String = "Get design help",
        suggested: Bool = false
    ) -> CompanionActionItem {
        if context.activeDesignRequest != nil {
            return requestRow(context: context, suggested: suggested)
        }
        return CompanionActionItem(
            icon: "bubble.left", label: label, hint: "Get expert advice",
            isSuggested: suggested, analyticsId: "ask_designer",
            specialAction: .openDesignServices(roomId: roomId)
        )
    }

    /// W5 · B §5 — the piece's own act, mirrored into the panel. The label is
    /// the bar's label, so the two surfaces cannot say different things about
    /// the same piece, and the row performs the bar's act rather than a
    /// lookalike of it.
    static func pieceActRow(_ act: PieceAct) -> CompanionActionItem {
        let icon: String
        let hint: String
        let analyticsId: String
        switch act {
        case .askDesigner:
            icon = "bubble.left.and.bubble.right"
            hint = "She'll see the piece, the price and the room"
            analyticsId = "piece_ask_designer"
        case .buy:
            icon = "creditcard"
            hint = "Payment opens securely in Safari"
            analyticsId = "piece_buy"
        case .askAboutPiece:
            icon = "bubble.left"
            hint = "A designer will come back to you"
            analyticsId = "piece_ask"
        }
        return CompanionActionItem(
            icon: icon,
            label: act.primaryLabel,
            hint: hint,
            isSuggested: true,
            analyticsId: analyticsId,
            specialAction: .performPieceAct
        )
    }

    static func requestRow(
        context: CompanionContext,
        suggested: Bool = false
    ) -> CompanionActionItem {
        CompanionActionItem(
            icon: "clock.badge.checkmark", label: "Your design request",
            hint: context.activeDesignRequest?.statusLabel ?? "In progress",
            isSuggested: suggested, analyticsId: "design_request",
            route: .designRequests(focusLeadId: nil)
        )
    }

    static func messageDesignerRow(
        label: String,
        hint: String = "Chat with your designer",
        suggested: Bool = false
    ) -> CompanionActionItem {
        CompanionActionItem(
            icon: "bubble.left.and.bubble.right", label: label, hint: hint,
            isSuggested: suggested, analyticsId: "message_designer", route: .threadList
        )
    }

    // MARK: - Collections count row

    /// SP-12: the Companion's `Saved` row is the only route to the Saved
    /// screen anywhere in the app. Gating it on a non-zero count meant a
    /// reader with nothing saved could never see the screen that would teach
    /// them what saving is for. The row draws at every count; the empty count
    /// is its own hint.
    static func collectionsRow(context: CompanionContext) -> CompanionActionItem? {
        let count = context.tableItemCount
        let hint = count == 0
            ? "Nothing saved yet"
            : "\(count) saved piece\(count == 1 ? "" : "s")"
        return item("heart", "Saved", hint, route: .table, id: "collections")
    }
}

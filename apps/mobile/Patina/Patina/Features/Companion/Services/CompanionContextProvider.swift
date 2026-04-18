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

// MARK: - Context Provider

enum CompanionActionProvider {

    /// Get context-aware actions for the current screen
    static func actions(for screen: AppRoute, context: CompanionContext, isAuthenticated: Bool = true) -> [CompanionActionItem] {
        var items: [CompanionActionItem] = []

        switch screen {
        case .heroFrame:
            items = [
                CompanionActionItem(
                    icon: "viewfinder", label: "Scan a room",
                    hint: "Suggested next step", isSuggested: true,
                    route: .walk
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
            ]

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
                    route: .walk
                ),
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
                    route: .designServicesRequest(roomId: nil)
                ),
            ]

        case .table:
            items = [
                CompanionActionItem(
                    icon: "sparkles", label: "Start a project",
                    hint: "From your saved items", isSuggested: true,
                    route: .designServicesRequest(roomId: nil)
                ),
                CompanionActionItem(
                    icon: "viewfinder", label: "Scan a room",
                    hint: "Add context for your saves",
                    route: .walk
                ),
            ]

        case .roomList:
            items = [
                CompanionActionItem(
                    icon: "viewfinder", label: "Scan a new room",
                    hint: "Add another space", isSuggested: true,
                    route: .walk
                ),
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
                    route: .walk
                ),
            ]

        case .conversation:
            items = [
                CompanionActionItem(
                    icon: "viewfinder", label: "Scan a room",
                    hint: "Show me your space",
                    route: .walk
                ),
                CompanionActionItem(
                    icon: "sparkles", label: "Recommendations",
                    hint: "See what fits",
                    route: .emergence(pieceId: nil)
                ),
            ]

        default:
            items = [
                CompanionActionItem(
                    icon: "house", label: "Home",
                    hint: "Back to your space",
                    route: .heroFrame
                ),
            ]
        }

        // Always append "Connect to portal" and "Profile" unless on those screens
        if screen != .qrScanner && screen != .qrApproval {
            items.append(CompanionActionItem(
                icon: "qrcode.viewfinder", label: "Connect to portal",
                hint: "Scan QR · patina.cloud",
                specialAction: .openQRScanner
            ))
        }

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

        return items
    }

    /// Get the nudge label for a screen (shown above the Companion mark)
    static func nudge(for screen: AppRoute, context: CompanionContext) -> String? {
        switch screen {
        case .heroFrame:
            return context.roomCount == 0 ? "Scan a room →" : nil
        case .emergence, .roomEmergence:
            return "Try in your room →"
        case .table:
            return "Find more pieces →"
        case .roomDetail:
            return "See recommendations →"
        case .styleResult:
            return "View recommendations →"
        default:
            return nil
        }
    }
}

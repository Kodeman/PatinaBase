//
//  Coordinator.swift
//  Patina
//
//  Base coordinator protocol for navigation management
//

import SwiftUI

/// Base protocol for all coordinators
public protocol Coordinator: AnyObject {
    associatedtype Route: Hashable

    /// Navigate to a specific route
    func navigate(to route: Route)

    /// Go back to previous screen
    func goBack()
}

/// Navigation destinations in the app
public enum AppRoute: Hashable {
    case threshold
    case heroFrame           // New: Hero Frame home screen
    case conversation
    case roomList
    case yourSpaces                         // Room System: gallery
    case roomDetail(roomId: UUID)
    case roomProject(roomId: UUID)          // Room System: full project view
    case roomSettings(roomId: UUID)         // Room System: settings
    case crossRoom                          // Room System: all items
    case newRoom                            // Room System: create sheet
    case manualRoomEntry                    // Room System: manual entry form
    case moveItem(savedItemId: UUID)        // Room System: move/copy sheet
    case roomSavedItems(roomId: UUID)  // New: Saved items for a room
    case roomOptions(roomId: UUID)     // New: Room options menu
    case walk
    case walkSession
    case rescan(roomId: UUID)          // New: Re-scan a specific room
    case emergence(pieceId: String?)
    case roomEmergence(roomId: UUID)   // New: Emergence for a specific room
    case table
    case pieceDetail(pieceId: String)
    case authentication
    case settings
    case designServicesRequest(roomId: UUID?)
    case qrScanner           // QR code scanner for web authentication
    case qrApproval          // QR authentication approval (sheet)

    // Style Quiz routes
    case styleQuiz
    case styleResult(result: StyleProfileResult)

    // AR & Scan Enhancement routes
    case arPlacement(productId: String, roomRemoteId: String? = nil)
    case preScanChecklist
    case floorPlanPreview

    // Quiet Conversation — Room Scan & Style Discovery redesign (v2.0)
    case scanThreshold             // Screen 01: camera fade-in
    case scanWalk(sessionId: UUID) // Screens 02-06: the active walk
    case scanSoftLanding(sessionId: UUID)  // Screen 09: the transition
    case scanConversation(sessionId: UUID) // Movement 2: 5-question container
    case scanReveal(profileId: String)     // Screen 16: the Reveal
    case scanFloorPlan(sessionId: UUID)    // Screen 17: new floor plan preview
    case scanFallbackEntry         // Screen 18: non-LiDAR manual entry

    // Phase 6 routes
    case profile
    case notifications
    case designerConsultation

    // First Launch routes
    case walkInvitation
    case cameraPermission
    case walkComplete
    case firstEmergence
    case roomNaming

    /// Display name for the route
    public var displayName: String {
        switch self {
        case .threshold: return "Threshold"
        case .heroFrame: return "Home"
        case .conversation: return "Conversation"
        case .roomList: return "Your Rooms"
        case .yourSpaces: return "Your Spaces"
        case .roomDetail: return "Room Detail"
        case .roomProject: return "Room"
        case .roomSettings: return "Room Settings"
        case .crossRoom: return "All Items"
        case .newRoom: return "New Room"
        case .manualRoomEntry: return "Room Details"
        case .moveItem: return "Move Item"
        case .roomSavedItems: return "Saved Items"
        case .roomOptions: return "Room Options"
        case .walk: return "Walk"
        case .walkSession: return "Walking"
        case .rescan: return "Re-scan Room"
        case .emergence: return "Emergence"
        case .roomEmergence: return "Emergence"
        case .table: return "Your Table"
        case .pieceDetail: return "Piece Detail"
        case .authentication: return "Sign In"
        case .settings: return "Settings"
        case .designServicesRequest: return "Request Design Help"
        case .qrScanner: return "Scan QR Code"
        case .qrApproval: return "Approve Sign In"
        case .styleQuiz: return "Style Quiz"
        case .styleResult: return "Your Style"
        case .arPlacement: return "AR Placement"
        case .preScanChecklist: return "Pre-Scan"
        case .floorPlanPreview: return "Floor Plan"
        case .scanThreshold: return "Scan"
        case .scanWalk: return "Walking"
        case .scanSoftLanding: return "Transition"
        case .scanConversation: return "Style Discovery"
        case .scanReveal: return "Your Style"
        case .scanFloorPlan: return "Floor Plan"
        case .scanFallbackEntry: return "Room Details"
        case .profile: return "Profile"
        case .notifications: return "Notifications"
        case .designerConsultation: return "Designer"
        case .walkInvitation: return "Walk Invitation"
        case .cameraPermission: return "Camera Permission"
        case .walkComplete: return "Walk Complete"
        case .firstEmergence: return "First Emergence"
        case .roomNaming: return "Room Naming"
        }
    }

    /// Whether this is a first-launch route
    public var isFirstLaunchRoute: Bool {
        switch self {
        case .threshold, .walkInvitation, .cameraPermission, .walkComplete, .firstEmergence, .roomNaming:
            return true
        default:
            return false
        }
    }

    /// Whether this route should be presented as a sheet
    public var isSheetRoute: Bool {
        switch self {
        case .designServicesRequest, .roomOptions, .qrScanner, .qrApproval, .newRoom, .moveItem:
            return true
        default:
            return false
        }
    }
}

/// Authentication state for the app
public enum AuthState: Equatable {
    case unknown
    case unauthenticated
    case authenticated(userId: String)
}

/// App lifecycle phases
public enum AppPhase: Equatable {
    case launching
    case threshold
    case main
}

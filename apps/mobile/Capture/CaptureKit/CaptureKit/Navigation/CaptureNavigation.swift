//  CaptureNavigation.swift
//  CaptureKit
//
//  FROZEN navigation surface — one case per screen across the 8 flows. Teams add
//  screens via RouteRegistry (per-feature files), never by editing this enum.
//  Changing a case is a foundation-owner-only edit.

import Foundation

/// Top-level app phase (mirrors the existing app's AppPhase).
public enum CapturePhase: Equatable, Sendable {
    case launching
    case auth                 // O1/O2
    case permissionPriming    // O3/O4
    case ready                // C1 live viewfinder
}

/// Full-screen destinations (pushed/replaced).
public enum CaptureRoute: Hashable, Sendable {
    case viewfinder           // C1
    case session              // V1
    case specimen(UUID)       // V3 detail
    case librarySearch        // U2
    case syncStatus           // U1
    case settings             // T1
    case account              // T2
    case project(String)      // P2 — project detail (reuses the pre-existing project route)

    // ── Phase 2 — designer/pro flows (pushed) ──
    case work                                            // W1 — Work dashboard
    case projectList                                     // P1
    case leadList                                        // L1
    case leadDetail(String)                              // L2
    case decisionList                                    // D1
    case decisionDetail(String)                          // D2
    case inbox                                           // M1
    case thread(String)                                  // M2
    case receiving                                       // G1 — arriving POs
    case qrScan                                          // Q1
    case siteScanSetup                                   // F1
    case siteScan(projectID: String?, projectRoomID: String?)  // F2 (hosts F3/F4)
}

/// Sheets / overlays (presented over the viewfinder or a screen).
public enum CaptureSheet: Hashable, Identifiable, Sendable {
    case specimenSheet(UUID)  // C5
    case smartGuessCard(UUID) // C3
    case ocr(UUID)            // N1
    case code(UUID)           // N2
    case measure(UUID)        // N3
    case voice(UUID)          // N4
    case assignVenue(UUID)    // S1
    case createProject        // S2
    case destination(UUID)    // S3
    case savedTerminal(UUID)  // S4
    case inboxTerminal(UUID)  // S5
    case photoImport          // R3/E3
    case cullDeck             // V2

    // ── Phase 2 — designer/pro flows (presented) ──
    case receivingInspection(poID: String)  // G2 → G3 as internal steps
    case qrApprove(payload: String)         // Q2 — approve/reject portal login

    public var id: String {
        switch self {
        case .specimenSheet(let u): return "specimen-\(u)"
        case .smartGuessCard(let u): return "guess-\(u)"
        case .ocr(let u): return "ocr-\(u)"
        case .code(let u): return "code-\(u)"
        case .measure(let u): return "measure-\(u)"
        case .voice(let u): return "voice-\(u)"
        case .assignVenue(let u): return "venue-\(u)"
        case .createProject: return "create-project"
        case .destination(let u): return "destination-\(u)"
        case .savedTerminal(let u): return "saved-\(u)"
        case .inboxTerminal(let u): return "inbox-\(u)"
        case .photoImport: return "photo-import"
        case .cullDeck: return "cull-deck"
        case .receivingInspection(let poID): return "receiving-inspection-\(poID)"
        case .qrApprove(let payload): return "qr-approve-\(payload)"
        }
    }
}

@MainActor
public protocol CaptureCoordinating: AnyObject {
    func navigate(to route: CaptureRoute)
    func present(_ sheet: CaptureSheet)
    func dismissSheet()
    func goBack()
}

//  RouteRegistry.swift
//  CaptureKit
//
//  Each feature registers its screen builder in its own one-line file
//  (e.g. CaptureViewfinderScreen.register()), so no team edits a shared switch.
//  The root composition resolves routes/sheets through here.

import SwiftUI

@MainActor
public final class RouteRegistry {
    public static let shared = RouteRegistry()
    public init() {}

    private var routeBuilders: [String: (CaptureRoute) -> AnyView] = [:]
    private var sheetBuilders: [String: (CaptureSheet) -> AnyView] = [:]

    /// Register a builder keyed by a stable route token (see CaptureRoute cases).
    public func registerRoute(_ key: String, _ build: @escaping (CaptureRoute) -> AnyView) {
        routeBuilders[key] = build
    }
    public func registerSheet(_ key: String, _ build: @escaping (CaptureSheet) -> AnyView) {
        sheetBuilders[key] = build
    }

    public func hasRoute(_ route: CaptureRoute) -> Bool { routeBuilders[route.registryKey] != nil }
    public func hasSheet(_ sheet: CaptureSheet) -> Bool { sheetBuilders[sheet.registryKey] != nil }

    public func view(for route: CaptureRoute) -> AnyView {
        routeBuilders[route.registryKey]?(route)
            ?? AnyView(MissingScreen(token: route.registryKey))
    }
    public func view(for sheet: CaptureSheet) -> AnyView {
        sheetBuilders[sheet.registryKey]?(sheet)
            ?? AnyView(MissingScreen(token: sheet.registryKey))
    }
}

public extension CaptureRoute {
    var registryKey: String {
        switch self {
        case .viewfinder: return "viewfinder"
        case .session: return "session"
        case .specimen: return "specimen"
        case .librarySearch: return "librarySearch"
        case .syncStatus: return "syncStatus"
        case .settings: return "settings"
        case .account: return "account"
        case .project: return "project"          // P2 — reused for project detail
        case .work: return "work"
        case .projectList: return "projectList"
        case .leadList: return "leadList"
        case .leadDetail: return "leadDetail"
        case .decisionList: return "decisionList"
        case .decisionDetail: return "decisionDetail"
        case .inbox: return "inbox"
        case .thread: return "thread"
        case .receiving: return "receiving"
        case .qrScan: return "qrScan"
        case .siteScanSetup: return "siteScanSetup"
        case .siteScan: return "siteScan"
        case .site: return "siteRequest"
        }
    }
}

public extension CaptureSheet {
    var registryKey: String {
        switch self {
        case .specimenSheet: return "specimenSheet"
        case .smartGuessCard: return "smartGuessCard"
        case .ocr: return "ocr"
        case .code: return "code"
        case .measure: return "measure"
        case .voice: return "voice"
        case .assignVenue: return "assignVenue"
        case .createProject: return "createProject"
        case .destination: return "destination"
        case .savedTerminal: return "savedTerminal"
        case .inboxTerminal: return "inboxTerminal"
        case .photoImport: return "photoImport"
        case .cullDeck: return "cullDeck"
        case .visit: return "visit"
        case .receivingInspection: return "receivingInspection"
        case .qrApprove: return "qrApprove"
        }
    }
}

/// Placeholder shown when a route/sheet has no registered builder yet (during fan-out).
public struct MissingScreen: View {
    let token: String
    public init(token: String) { self.token = token }
    public var body: some View {
        VStack(spacing: 8) {
            Text("Not wired").font(.headline)
            Text(token).font(.system(.caption, design: .monospaced)).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityIdentifier("screen.missing.\(token)")
    }
}

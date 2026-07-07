//  SiteScanScreens.swift
//  Capture · Wave F (Pro site-scan)
//
//  Registrar for F1 (`.siteScanSetup`) and F2 (`.siteScan(projectID:projectRoomID:)`,
//  which hosts F3/F4 as internal steps). Wave F keeps these seams and swaps the
//  placeholders for the real RoomPlan pipeline.

import SwiftUI
import CaptureKit

enum SiteScanScreens {
    @MainActor
    static func register(into r: RouteRegistry, container: AppContainer, coordinator: CaptureCoordinator) {
        // F1 · .siteScanSetup
        r.registerRoute(CaptureRoute.siteScanSetup.registryKey) { _ in
            AnyView(ScanSetupPlaceholder())
        }

        // F2 · .siteScan(projectID, projectRoomID) — hosts F3 review + F4 upload
        r.registerRoute(CaptureRoute.siteScan(projectID: nil, projectRoomID: nil).registryKey) { route in
            guard case let .siteScan(projectID, projectRoomID) = route else { return AnyView(EmptyView()) }
            return AnyView(SiteScanPlaceholder(projectID: projectID, projectRoomID: projectRoomID))
        }
    }
}

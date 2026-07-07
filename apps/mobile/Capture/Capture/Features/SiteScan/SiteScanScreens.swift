//  SiteScanScreens.swift
//  Capture · Wave F (Pro site-scan)
//
//  Registrar for F1 (`.siteScanSetup`) and the F2/F3/F4 host
//  (`.siteScan(projectID:projectRoomID:)`, one route, internal step state). Both
//  builders share one `SiteScanHandoff` so F1's chosen scan name can reach the
//  host — the frozen route carries the project + room ids but not the name.

import SwiftUI
import CaptureKit

/// In-flow hand-off from F1 to the `.siteScan` host for the values the frozen
/// route can't carry (the scan/room name; the project display name for F4).
/// Empty on a direct deep-link into `.siteScan` (the harness / a resumed link),
/// where the host falls back to a sensible default name.
@MainActor
@Observable
final class SiteScanHandoff {
    var name: String = ""
    var projectName: String?
}

enum SiteScanScreens {
    @MainActor
    static func register(into r: RouteRegistry, container: AppContainer, coordinator: CaptureCoordinator) {
        let handoff = SiteScanHandoff()

        // F1 · .siteScanSetup
        r.registerRoute(CaptureRoute.siteScanSetup.registryKey) { _ in
            AnyView(SiteScanSetupScreen(container: container, coordinator: coordinator, handoff: handoff))
        }

        // F2 · .siteScan(projectID, projectRoomID) — hosts F3 review + F4 upload
        r.registerRoute(CaptureRoute.siteScan(projectID: nil, projectRoomID: nil).registryKey) { route in
            guard case let .siteScan(projectID, projectRoomID) = route else { return AnyView(EmptyView()) }
            return AnyView(SiteScanHostScreen(
                container: container, coordinator: coordinator,
                projectID: projectID, projectRoomID: projectRoomID, handoff: handoff))
        }
    }
}

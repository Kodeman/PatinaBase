//  WorkScreens.swift
//  Capture · Wave W (Work dashboard)
//
//  Registrar for W1 — the Work dashboard route (`.work`). One line in
//  ScreenRegistry wires it. Wave W keeps this seam and swaps the placeholder for
//  the real dashboard.

import SwiftUI
import CaptureKit

enum WorkScreens {
    @MainActor
    static func register(into r: RouteRegistry, container: AppContainer, coordinator: CaptureCoordinator) {
        // W1 · .work — dashboard (routes into the four flow lists)
        r.registerRoute(CaptureRoute.work.registryKey) { _ in
            AnyView(WorkDashboardPlaceholder(coordinator: coordinator))
        }
    }
}

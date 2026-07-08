//  WorkScreens.swift
//  Capture · Wave W (Work dashboard)
//
//  Registrar for W1 — the Work dashboard route (`.work`). One line in
//  ScreenRegistry wires it. Work has no service/factory of its own: the real
//  screen composes the four frozen read services (projects, leads, decisions,
//  messaging) straight from the container it's handed here.

import SwiftUI
import CaptureKit

enum WorkScreens {
    @MainActor
    static func register(into r: RouteRegistry, container: AppContainer, coordinator: CaptureCoordinator) {
        // W1 · .work — dashboard (routes into the four flow lists)
        r.registerRoute(CaptureRoute.work.registryKey) { _ in
            AnyView(WorkDashboardScreen(container: container, coordinator: coordinator))
        }
    }
}

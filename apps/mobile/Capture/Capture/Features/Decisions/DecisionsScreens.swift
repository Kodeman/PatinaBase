//  DecisionsScreens.swift
//  Capture · Wave D (Decisions, read-only)
//
//  Registrar for D1 (`.decisionList`) and D2 (`.decisionDetail(id)`). Each builder
//  captures the narrow seam its screen needs (the decisions service + analytics),
//  plus the coordinator — matching how the other registrars (e.g.
//  SystemSurfaceScreens) wire their screens.

import SwiftUI
import CaptureKit

enum DecisionsScreens {
    @MainActor
    static func register(into r: RouteRegistry, container: AppContainer, coordinator: CaptureCoordinator) {
        // D1 · .decisionList
        r.registerRoute(CaptureRoute.decisionList.registryKey) { _ in
            AnyView(DecisionListScreen(
                decisions: container.decisions,
                analytics: container.analytics,
                coordinator: coordinator
            ))
        }

        // D2 · .decisionDetail(id)
        r.registerRoute(CaptureRoute.decisionDetail("").registryKey) { route in
            guard case let .decisionDetail(id) = route else { return AnyView(EmptyView()) }
            return AnyView(DecisionDetailScreen(
                decisionID: id,
                decisions: container.decisions,
                analytics: container.analytics
            ))
        }
    }
}

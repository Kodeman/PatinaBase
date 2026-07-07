//  DecisionsScreens.swift
//  Capture · Wave D (Decisions, read-only)
//
//  Registrar for D1 (`.decisionList`) and D2 (`.decisionDetail(id)`). Wave D keeps
//  these seams and swaps the placeholders.

import SwiftUI
import CaptureKit

enum DecisionsScreens {
    @MainActor
    static func register(into r: RouteRegistry, container: AppContainer, coordinator: CaptureCoordinator) {
        // D1 · .decisionList
        r.registerRoute(CaptureRoute.decisionList.registryKey) { _ in
            AnyView(DecisionListPlaceholder())
        }

        // D2 · .decisionDetail(id)
        r.registerRoute(CaptureRoute.decisionDetail("").registryKey) { route in
            guard case let .decisionDetail(id) = route else { return AnyView(EmptyView()) }
            return AnyView(DecisionDetailPlaceholder(decisionID: id))
        }
    }
}

//  ReceivingScreens.swift
//  Capture · Wave G (Receiving / goods-in)
//
//  Registrar for G1 (`.receiving` route) and the G2→G3 `.receivingInspection`
//  sheet. `ReceivingInspectionScreen` owns its own single NavigationStack
//  internally (title/toolbar swap per step), so the sheet builder passes it
//  straight through with no extra wrapper.

import SwiftUI
import CaptureKit

enum ReceivingScreens {
    @MainActor
    static func register(into r: RouteRegistry, container: AppContainer, coordinator: CaptureCoordinator) {
        // G1 · .receiving — arriving POs
        r.registerRoute(CaptureRoute.receiving.registryKey) { _ in
            AnyView(ArrivingPOsScreen(receiving: container.receiving, analytics: container.analytics,
                                     coordinator: coordinator))
        }

        // G2 → G3 · .receivingInspection(poID) — inspection + outcome steps
        r.registerSheet(CaptureSheet.receivingInspection(poID: "").registryKey) { sheet in
            guard case let .receivingInspection(poID) = sheet else { return AnyView(EmptyView()) }
            return AnyView(ReceivingInspectionScreen(poID: poID, receiving: container.receiving,
                                                     analytics: container.analytics, coordinator: coordinator))
        }
    }
}

//  ReceivingScreens.swift
//  Capture · Wave G (Receiving / goods-in)
//
//  Registrar for G1 (`.receiving` route) and the G2→G3 `.receivingInspection`
//  sheet (wrapped in a NavigationStack so the placeholder's Done button has a bar).
//  Wave G keeps these seams and swaps the placeholders.

import SwiftUI
import CaptureKit

enum ReceivingScreens {
    @MainActor
    static func register(into r: RouteRegistry, container: AppContainer, coordinator: CaptureCoordinator) {
        // G1 · .receiving — arriving POs
        r.registerRoute(CaptureRoute.receiving.registryKey) { _ in
            AnyView(ArrivingPlaceholder())
        }

        // G2 → G3 · .receivingInspection(poID) — inspection + outcome steps
        r.registerSheet(CaptureSheet.receivingInspection(poID: "").registryKey) { sheet in
            guard case let .receivingInspection(poID) = sheet else { return AnyView(EmptyView()) }
            return AnyView(
                NavigationStack {
                    ReceivingInspectionPlaceholder(poID: poID, coordinator: coordinator)
                }
            )
        }
    }
}

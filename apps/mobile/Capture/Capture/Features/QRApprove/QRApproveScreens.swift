//  QRApproveScreens.swift
//  Capture · Wave Q (QR portal-login approval)
//
//  Registrar for Q1 (`.qrScan` route) and the Q2 `.qrApprove(payload)` sheet
//  (wrapped in a NavigationStack for the Done button). Wave Q keeps these seams
//  and swaps the placeholders.

import SwiftUI
import CaptureKit

enum QRApproveScreens {
    @MainActor
    static func register(into r: RouteRegistry, container: AppContainer, coordinator: CaptureCoordinator) {
        // Q1 · .qrScan
        r.registerRoute(CaptureRoute.qrScan.registryKey) { _ in
            AnyView(QRScanPlaceholder())
        }

        // Q2 · .qrApprove(payload)
        r.registerSheet(CaptureSheet.qrApprove(payload: "").registryKey) { sheet in
            guard case let .qrApprove(payload) = sheet else { return AnyView(EmptyView()) }
            return AnyView(
                NavigationStack {
                    QRApprovePlaceholder(payload: payload, coordinator: coordinator)
                }
            )
        }
    }
}

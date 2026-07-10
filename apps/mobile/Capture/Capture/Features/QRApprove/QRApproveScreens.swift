//  QRApproveScreens.swift
//  Capture · Wave Q (QR portal-login approval)
//
//  Registrar for Q1 (`.qrScan` route) and the Q2 `.qrApprove(payload)` sheet
//  (wrapped in a NavigationStack so Q2 can carry its own navigation title/
//  toolbar — Q2 itself must not add a second NavigationStack).

import SwiftUI
import CaptureKit

enum QRApproveScreens {
    @MainActor
    static func register(into r: RouteRegistry, container: AppContainer, coordinator: CaptureCoordinator) {
        // Q1 · .qrScan
        r.registerRoute(CaptureRoute.qrScan.registryKey) { _ in
            AnyView(QRScanScreen(
                portalAuth: container.portalAuth,
                analytics: container.analytics,
                coordinator: coordinator,
                // Defensive: a login QR scanned in Q1 routes to the same sign-in
                // handler as the deep link / O2 scanner.
                onPortalLogin: { token in container.portalLogin.receive(token: token) }
            ))
        }

        // Q2 · .qrApprove(payload)
        r.registerSheet(CaptureSheet.qrApprove(payload: "").registryKey) { sheet in
            guard case let .qrApprove(payload) = sheet else { return AnyView(EmptyView()) }
            return AnyView(
                NavigationStack {
                    QRApproveScreen(
                        payload: payload,
                        portalAuth: container.portalAuth,
                        analytics: container.analytics,
                        coordinator: coordinator
                    )
                }
            )
        }
    }
}

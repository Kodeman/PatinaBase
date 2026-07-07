//  LeadsScreens.swift
//  Capture · Wave L (Leads)
//
//  Registrar for L1 (`.leadList`) and L2 (`.leadDetail(id)`) — real screens
//  reading from `container.leads` (SupabaseLeadsService in real mode,
//  MockLeadsService in mock mode / previews / the -CaptureScreen harness).

import SwiftUI
import CaptureKit

enum LeadsScreens {
    @MainActor
    static func register(into r: RouteRegistry, container: AppContainer, coordinator: CaptureCoordinator) {
        // L1 · .leadList
        r.registerRoute(CaptureRoute.leadList.registryKey) { _ in
            AnyView(LeadListScreen(container: container, coordinator: coordinator))
        }

        // L2 · .leadDetail(id)
        r.registerRoute(CaptureRoute.leadDetail("").registryKey) { route in
            guard case let .leadDetail(id) = route else { return AnyView(EmptyView()) }
            return AnyView(LeadDetailScreen(container: container, leadID: id))
        }
    }
}

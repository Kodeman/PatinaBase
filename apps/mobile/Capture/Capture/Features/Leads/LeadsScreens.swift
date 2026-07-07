//  LeadsScreens.swift
//  Capture · Wave L (Leads)
//
//  Registrar for L1 (`.leadList`) and L2 (`.leadDetail(id)`). Wave L keeps these
//  seams and swaps the placeholders.

import SwiftUI
import CaptureKit

enum LeadsScreens {
    @MainActor
    static func register(into r: RouteRegistry, container: AppContainer, coordinator: CaptureCoordinator) {
        // L1 · .leadList
        r.registerRoute(CaptureRoute.leadList.registryKey) { _ in
            AnyView(LeadListPlaceholder())
        }

        // L2 · .leadDetail(id)
        r.registerRoute(CaptureRoute.leadDetail("").registryKey) { route in
            guard case let .leadDetail(id) = route else { return AnyView(EmptyView()) }
            return AnyView(LeadDetailPlaceholder(leadID: id))
        }
    }
}

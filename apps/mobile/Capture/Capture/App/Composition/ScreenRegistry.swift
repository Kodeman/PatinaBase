//  ScreenRegistry.swift
//  Capture
//
//  THE single integration seam where each feature team's screens are wired into
//  the RouteRegistry. The integration owner adds one `…Screens.register(...)`
//  line per feature here; teams never edit a shared switch. Builders capture the
//  container (store + services) and coordinator.

import SwiftUI
import CaptureKit

enum ScreenRegistry {
    @MainActor
    static func registerAll(container: AppContainer, coordinator: CaptureCoordinator) {
        let r = RouteRegistry.shared
        // Team feature registrars are added here at integration, e.g.:
        //   CaptureCoreScreens.register(into: r, container: container, coordinator: coordinator)
        //   RecognitionScreens.register(into: r, container: container, coordinator: coordinator)
        //   RouteSessionScreens.register(into: r, container: container, coordinator: coordinator)
        //   OnboardingScreens.register(into: r, container: container, coordinator: coordinator)
        //   ResilienceScreens.register(into: r, container: container, coordinator: coordinator)
        //   SystemSurfaceScreens.register(into: r, container: container, coordinator: coordinator)
        _ = (r, container, coordinator)
    }
}

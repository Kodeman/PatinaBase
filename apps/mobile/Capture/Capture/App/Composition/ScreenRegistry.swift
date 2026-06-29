//  ScreenRegistry.swift
//  Capture
//
//  THE single integration seam where each feature team's screens are wired into
//  the RouteRegistry. One register() line per feature; teams never edit a shared
//  switch. Builders capture the container (store + services) and coordinator.

import SwiftUI
import CaptureKit

enum ScreenRegistry {
    @MainActor
    static func registerAll(container: AppContainer, coordinator: CaptureCoordinator) {
        let r = RouteRegistry.shared
        CaptureCoreScreens.register(into: r, container: container, coordinator: coordinator)      // B: C1, C5
        RecognitionScreens.register(into: r, container: container, coordinator: coordinator)       // C: N1–N5
        RouteSessionScreens.register(into: r, container: container, coordinator: coordinator)       // E: S1–S5, V1–V3
        SystemSurfaceScreens.register(into: r, container: container, coordinator: coordinator)      // F: U1, U2, T1, T2
        ResilienceScreens.register(into: r, container: container, coordinator: coordinator)         // D: R3
        // A (Onboarding) is phase-based — wired via OnboardingHost in RootView, not routes.
    }
}

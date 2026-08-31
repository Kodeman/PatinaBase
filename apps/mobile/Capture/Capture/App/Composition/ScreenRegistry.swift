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
        VisitReviewScreens.register(into: r, container: container, coordinator: coordinator)        // E: V4
        SystemSurfaceScreens.register(into: r, container: container, coordinator: coordinator)      // F: U1, U2, T1, T2
        ResilienceScreens.register(into: r, container: container, coordinator: coordinator)         // D: R3
        // A (Onboarding) is phase-based — wired via OnboardingHost in RootView, not routes.

        // Phase 2 designer/pro flows (one registrar per wave; screens are placeholders
        // until each wave agent ships).
        WorkScreens.register(into: r, container: container, coordinator: coordinator)               // W: W1
        ProjectsScreens.register(into: r, container: container, coordinator: coordinator)           // P: P1, P2
        LeadsScreens.register(into: r, container: container, coordinator: coordinator)              // L: L1, L2
        DecisionsScreens.register(into: r, container: container, coordinator: coordinator)          // D: D1, D2
        MessagesScreens.register(into: r, container: container, coordinator: coordinator)           // M: M1, M2
        ReceivingScreens.register(into: r, container: container, coordinator: coordinator)          // G: G1, G2, G3
        QRApproveScreens.register(into: r, container: container, coordinator: coordinator)          // Q: Q1, Q2
        SiteScanScreens.register(into: r, container: container, coordinator: coordinator)           // F: F1–F4
        SiteRequestScreens.register(into: r, container: container, coordinator: coordinator)        // SR: SR01–SR20
    }
}

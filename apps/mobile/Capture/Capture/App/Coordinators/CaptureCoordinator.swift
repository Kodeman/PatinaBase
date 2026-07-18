//  CaptureCoordinator.swift
//  Capture
//
//  Concrete navigation state. Drives the NavigationStack + sheet presentation in
//  RootView. Feature teams call coordinator.present(.ocr(id)) etc. via the
//  CaptureCoordinating seam.

import SwiftUI
import CaptureKit

@Observable
@MainActor
public final class CaptureCoordinator: CaptureCoordinating {
    public var phase: CapturePhase
    public var path: [CaptureRoute] = []
    public var sheet: CaptureSheet?
    /// When set (0=O1…3=O4), RootView shows that onboarding step over the app
    /// (phase-based flow + the `-CaptureScreen oN.*` verification harness).
    public var onboardingStep: Int?
    /// Opaque request-scoped token from an HTTPS `/field/{token}` universal
    /// link. It is held only for the guest Edge session and never exchanged for
    /// a JWT or placed in a direct Supabase query.
    public var guestAccessToken: String?

    public init(phase: CapturePhase = .ready) {
        self.phase = phase
    }

    public func navigate(to route: CaptureRoute) { path.append(route) }
    public func present(_ sheet: CaptureSheet) { self.sheet = sheet }
    public func dismissSheet() { sheet = nil }
    public func goBack() { if !path.isEmpty { path.removeLast() } }
    public func popToRoot() { path.removeAll() }
    public func enterGuestRequest(accessToken: String) {
        dismissSheet()
        popToRoot()
        guestAccessToken = accessToken
    }

    public func leaveGuestRequest() { guestAccessToken = nil }
}

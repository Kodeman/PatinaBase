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
    public var sheet: CaptureSheet?
    /// When set (0=O1…3=O4), RootView shows that onboarding step over the app
    /// (phase-based flow + the `-CaptureScreen oN.*` verification harness).
    public var onboardingStep: Int?
    /// Opaque request-scoped token from an HTTPS `/field/{token}` universal
    /// link. It is held only for the guest Edge session and never exchanged for
    /// a JWT or placed in a direct Supabase query.
    public var guestAccessToken: String?
    private var guestRequestID: String?
    private let guestAccessSession: GuestAccessSession
    private var realmHistory = FieldRealmHistory()

    public var activeRealm: FieldRealm { realmHistory.activeRealm }

    public init(phase: CapturePhase = .ready,
                guestAccessStore: (any GuestAccessTokenStoring)? = nil) {
        self.phase = phase
        let session = GuestAccessSession(
            store: guestAccessStore ?? KeychainGuestAccessTokenStore())
        self.guestAccessSession = session
        self.guestAccessToken = session.restore()
        if guestAccessToken != nil {
            realmHistory.activate(.work)
        }
    }

    public func path(for realm: FieldRealm) -> [CaptureRoute] {
        realmHistory.path(for: realm)
    }

    public func replacePath(_ path: [CaptureRoute], for realm: FieldRealm) {
        realmHistory.replacePath(path, for: realm)
    }

    /// Cross the Camera ↔ Work boundary without flattening either realm's
    /// navigation history. Dismissing transient chrome keeps sheets from
    /// visually leaking across the boundary.
    public func switchRealm(_ realm: FieldRealm, reset: Bool = false) {
        dismissSheet()
        realmHistory.activate(realm)
        if reset { realmHistory.popToRoot() }
    }

    public func navigate(to route: CaptureRoute) {
        // `.work` remains a compatibility intent for the existing viewfinder
        // and Account callers. Work is now a root realm, never a pushed screen.
        if route == .work {
            switchRealm(.work)
        } else {
            realmHistory.push(route)
        }
    }

    public func present(_ sheet: CaptureSheet) { self.sheet = sheet }
    public func dismissSheet() { sheet = nil }
    public func goBack() { realmHistory.goBack() }
    public func popToRoot() { realmHistory.popToRoot() }

    /// Drop every owner-bound navigation reference before a new account or
    /// workspace can become visible. Both realm histories are replaced together.
    public func resetOwnerBoundUI() {
        sheet = nil
        onboardingStep = nil
        leaveGuestRequest()
        realmHistory = FieldRealmHistory()
    }

    public func enterGuestRequest(accessToken: String) {
        switchRealm(.work, reset: true)
        guestAccessSession.enter(accessToken)
        guestAccessToken = accessToken
        guestRequestID = nil
    }

    public func bindGuestRequest(requestID: String) {
        guard let guestAccessToken else { return }
        guestAccessSession.bind(guestAccessToken, to: requestID)
        guestRequestID = requestID
    }

    public func guestAccessToken(for requestID: String) -> String? {
        guestAccessSession.accessToken(for: requestID)
    }

    public func leaveGuestRequest() {
        guestAccessSession.leave(requestID: guestRequestID)
        guestRequestID = nil
        guestAccessToken = nil
    }
}

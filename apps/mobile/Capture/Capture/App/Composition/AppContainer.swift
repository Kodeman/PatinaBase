//  AppContainer.swift
//  Capture
//
//  Composition root. Branches on `AppConfiguration.runsRealServices`:
//   • All-mock mode (default sim, -CaptureUseMocks, UITest): mocks + in-memory
//     store + InMemoryCaptureSyncService + no-op analytics — keeps the 51-screen
//     harness, run/shots scripts, and previews working unchanged.
//
//  Phase 2 designer/pro seams (projects/leads/decisions/messaging/receiving/
//  portalAuth/siteScan): mock mode wires the CaptureKitMocks conformers; real
//  mode calls each flow's own `<Flow>ServiceFactory.make(deps:)` — which the
//  freeze leaves returning the mock until that wave's agent replaces it. This
//  file is FROZEN for the waves.
//   • Real mode (physical device, or sim with -CaptureForceReal): Supabase
//     session, persistent store (with graceful fallback), the local sync outbox
//     wired to real capture-media upload + the commit RPC, the offline-sync Live
//     Activity, PostHog analytics, and honest inline project creation.
//     Camera/location stay mocked on the simulator (AVFoundation/CoreLocation are
//     useless there); session/store/sync are always real.

import Foundation
import SwiftData
import CaptureKit
import CaptureKitMocks

@Observable
@MainActor
public final class AppContainer {
    public let store: CaptureStore
    public let camera: any CameraService
    public let sync: any CaptureSyncService
    public let session: any SessionProviding
    public let location: any LocationService
    public let analytics: any CaptureAnalytics

    // ── Phase 2 designer/pro seams (frozen; wave agents build the screens) ──
    public let projects: any ProjectsService
    public let leads: any LeadsService
    public let decisions: any DecisionsReadService
    public let messaging: any MessagingService
    public let receiving: any ReceivingService
    public let portalAuth: any PortalAuthApprovalService
    public let siteScan: any SiteScanService

    /// S2 inline project creation (real PostgREST insert vs. local-only). App
    /// -internal; nil in mock mode.
    let projectCreator: (any CaptureProjectCreating)?
    /// O2 "Continue with Patina" seam (real OAuth vs. stub). App-internal — the
    /// existential lives app-side; feature teams never touch it.
    let authorizer: any WorkspaceAuthorizing
    /// Portal-QR sign-in (`field://login`) driver, shared by the deep-link
    /// handler, RootView's confirm/toast UI, and Q1's defensive forwarding.
    /// `RootView` injects its dependencies via `configure(...)` once it can bind
    /// the coordinator; unconfigured it simply buffers an incoming link.
    let portalLogin = PortalLoginController()

    public init() {
        let real = AppConfiguration.runsRealServices
        let store = CaptureStore.resilient(persistent: real)
        self.store = store

        if real {
            // One authenticated supabase-swift client, shared by the session, the
            // sync gateway, and inline project creation.
            let client = SupabaseClientProvider.makeClient()
            let session = SupabaseSessionService(client: client)
            self.session = session
            self.authorizer = SupabaseWorkspaceAuthorizer(session: session)

            let analytics = PostHogCaptureAnalytics()
            self.analytics = analytics

            let liveActivity = CaptureLiveActivityController()
            let gateway = SupabaseCaptureGateway(client: client,
                                                 bucket: AppConfiguration.captureMediaBucket)
            self.sync = LocalCaptureSyncService(store: store, analytics: analytics,
                                                liveActivity: liveActivity,
                                                session: session, remote: gateway)
            self.projectCreator = SupabaseProjectCreator(client: client, session: session)

            // Phase 2 seams — each flow's own factory. The freeze leaves these
            // returning the mock conformer; a wave agent swaps in the real
            // service by editing ONLY its `<Flow>ServiceFactory` + its own files.
            let workDeps = WorkServiceDependencies(client: client, session: session)
            self.projects = ProjectsServiceFactory.make(deps: workDeps)
            self.leads = LeadsServiceFactory.make(deps: workDeps)
            self.decisions = DecisionsServiceFactory.make(deps: workDeps)
            self.messaging = MessagesServiceFactory.make(deps: workDeps)
            self.receiving = ReceivingServiceFactory.make(deps: workDeps)
            self.portalAuth = QRApproveServiceFactory.make(deps: workDeps)
            self.siteScan = SiteScanServiceFactory.make(deps: workDeps)

            #if targetEnvironment(simulator)
            self.camera = MockCameraService()
            self.location = MockLocationService()
            #else
            self.camera = AVFoundationCameraService()
            self.location = CoreLocationService()
            #endif

            // Identify the restored session for analytics once auth resolves. A
            // fresh sign-in later in the same run is identified on next launch.
            Task { @MainActor in
                await session.waitForReady()
                if let uid = session.userID { analytics.identify(uid) }
            }
        } else {
            let analytics = MockCaptureAnalytics()
            self.analytics = analytics
            self.session = MockSessionProviding()
            self.authorizer = StubWorkspaceAuthorizer()
            self.sync = InMemoryCaptureSyncService()
            self.projectCreator = nil
            self.camera = MockCameraService()
            self.location = MockLocationService()

            // Phase 2 seams — mock conformers (also the harness/preview default).
            self.projects = MockProjectsService()
            self.leads = MockLeadsService()
            self.decisions = MockDecisionsReadService()
            self.messaging = MockMessagingService()
            self.receiving = MockReceivingService()
            self.portalAuth = MockPortalAuthApprovalService()
            self.siteScan = MockSiteScanService()
        }
    }
}

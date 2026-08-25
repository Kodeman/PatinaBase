//  AppContainer.swift
//  Capture
//
//  Composition root. Branches on `AppConfiguration.runsRealServices`:
//   • All-mock mode (default sim, -CaptureUseMocks, UITest): mocks + in-memory
//     store + InMemoryCaptureSyncService + no-op analytics — keeps the screen
//     harness, run/shots scripts, and previews working unchanged.
//
//  Phase 2 designer/pro seams (projects/leads/decisions/messaging/receiving/
//  portalAuth/siteScan): mock mode wires the CaptureKitMocks conformers; real
//  mode calls each flow's own `<Flow>ServiceFactory.make(deps:)`, and every one
//  of the eight now returns a real Supabase concrete. Field Companion wave 2
//  added `smartGuess` and `featureFlags` as the last two composition seams; the
//  rest of this file stays foundation-owner-only.
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
import PostHog

@Observable
@MainActor
public final class AppContainer {
    public let store: CaptureStore
    public let camera: any CameraService
    public let sync: any CaptureSyncService
    public let session: any SessionProviding
    public let location: any LocationService
    public let analytics: any CaptureAnalytics
    /// N5's real reader — the same Vision-backed service on device and in the
    /// simulator (VNClassifyImageRequest runs on the iphonesimulator SDK and
    /// simply yields `.unknown` on an empty frame), so no surface anywhere gets
    /// a guess nothing computed.
    public let smartGuess: any SmartGuessService
    /// Remote flags, fail-closed. `.allOff` in mock mode: the harness and the
    /// previews must never light a gated surface.
    public let featureFlags: CaptureFeatureFlags
    public let companion = FieldCompanionController(
        initialPresentation: .hidden(reason: .cameraActive),
        defaultHint: "Next steps"
    )

    // ── Phase 2 designer/pro seams (frozen — foundation-owner-only) ──
    public let projects: any ProjectsService
    public let leads: any LeadsService
    public let decisions: any DecisionsReadService
    public let messaging: any MessagingService
    public let receiving: any ReceivingService
    public let portalAuth: any PortalAuthApprovalService
    public let siteScan: any SiteScanService
    public let siteRequests: any SiteRequestService
    public let guestSiteRequests: any GuestSiteRequestService
    let siteRequestOutboxDrainer: SiteRequestOutboxDrainer

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
        let real = AppConfiguration.runsRealServices; let store = CaptureStore.resilient(persistent: real)
        self.store = store

        if real {
            // One authenticated supabase-swift client, shared by the session, the
            // sync gateway, and inline project creation.
            let client = SupabaseClientProvider.makeClient()

            let analytics = PostHogCaptureAnalytics()
            self.analytics = analytics
            self.smartGuess = HeuristicSmartGuessService()
            self.featureFlags = CaptureFeatureFlags(analytics: analytics)

            let session = SupabaseSessionService(client: client, analytics: analytics)
            self.session = session
            self.authorizer = SupabaseWorkspaceAuthorizer(session: session)

            let liveActivity = CaptureLiveActivityController()
            let gateway = SupabaseCaptureGateway(client: client,
                                                 bucket: AppConfiguration.captureMediaBucket)
            self.sync = LocalCaptureSyncService(store: store, analytics: analytics,
                                                liveActivity: liveActivity,
                                                session: session, remote: gateway)
            self.projectCreator = SupabaseProjectCreator(client: client, session: session)

            // Phase 2 seams — each flow owns a `<Flow>ServiceFactory.make(deps:)`,
            // and all eight now hand back a real Supabase service. Mock mode never
            // reaches this branch; it wires the CaptureKitMocks conformers below.
            let work = Self.makeWorkServices(deps: WorkServiceDependencies(
                client: client, session: session, store: store))
            self.projects = work.projects; self.leads = work.leads; self.decisions = work.decisions
            self.messaging = work.messaging; self.receiving = work.receiving
            self.portalAuth = work.portalAuth; self.siteScan = work.siteScan
            self.siteRequests = work.siteRequests; self.guestSiteRequests = work.siteRequests
            self.siteRequestOutboxDrainer = work.drainer

            #if targetEnvironment(simulator)
            self.camera = MockCameraService()
            self.location = MockLocationService()
            #else
            self.camera = AVFoundationCameraService()
            self.location = CoreLocationService()
            #endif

            // Identify the restored session for analytics once auth resolves. A
            // fresh sign-in later in the same run is identified on next launch.
            Self.identifyRestoredSession(session: session, analytics: analytics)
        } else {
            let analytics = MockCaptureAnalytics()
            self.analytics = analytics
            self.smartGuess = HeuristicSmartGuessService()
            self.featureFlags = .allOff
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
            let siteRequests = MockSiteRequestService()
            self.siteRequests = siteRequests
            self.guestSiteRequests = siteRequests
            self.siteRequestOutboxDrainer = SiteRequestOutboxDrainer(store: store, remote: siteRequests)
        }

        // The ladder runs before analytics exists, so it reports rather than
        // emits. Report it now — a degraded store must never be silent.
        Self.reportStoreOpen(store.openReport, analytics: self.analytics)
    }

    /// Telemetry for the store-open ladder. `store.reset_incompatible` fires
    /// when an unreadable store was deleted and recreated (Kody ruling
    /// 2026-08-24: Field is not live, a fresh install may reset the store);
    /// `store.in_memory_fallback` fires when persistence was asked for and
    /// every on-disk rung refused, which costs the designer every capture made
    /// in that run.
    private static func reportStoreOpen(_ report: CaptureStoreOpenReport,
                                        analytics: any CaptureAnalytics) {
        if report.didResetIncompatibleStore {
            analytics.event("store.reset_incompatible", [
                "persistence": report.persistence.rawValue,
                "failures": report.failures.joined(separator: " | ")
            ])
        }
        guard report.losesWorkOnRelaunch else { return }
        analytics.event("store.in_memory_fallback", [
            "failures": report.failures.joined(separator: " | ")
        ])
    }

    /// Every protocol-typed Work dependency the app wires in real mode, bundled
    /// into one value.
    private struct WorkServices {
        let projects: any ProjectsService
        let leads: any LeadsService
        let decisions: any DecisionsReadService
        let messaging: any MessagingService
        let receiving: any ReceivingService
        let portalAuth: any PortalAuthApprovalService
        let siteScan: any SiteScanService
        /// The concrete conforms to both the designer and guest protocol, so one
        /// `SupabaseSiteRequestService` construction serves both properties.
        let siteRequests: SupabaseSiteRequestService
        let drainer: SiteRequestOutboxDrainer
    }

    /// Everything wave-agent factories build off `WorkServiceDependencies`,
    /// bundled into `WorkServices` so `init()` stays under `function_body_length`.
    /// Real mode only — mock mode wires `CaptureKitMocks` conformers directly
    /// and has no `WorkServiceDependencies` to build (no client to give it).
    private static func makeWorkServices(deps: WorkServiceDependencies) -> WorkServices {
        let siteRequests = SiteRequestServiceFactory.make(deps: deps)
        return WorkServices(
            projects: ProjectsServiceFactory.make(deps: deps),
            leads: LeadsServiceFactory.make(deps: deps),
            decisions: DecisionsServiceFactory.make(deps: deps),
            messaging: MessagesServiceFactory.make(deps: deps),
            receiving: ReceivingServiceFactory.make(deps: deps),
            portalAuth: QRApproveServiceFactory.make(deps: deps),
            siteScan: SiteScanServiceFactory.make(deps: deps),
            siteRequests: siteRequests,
            drainer: SiteRequestOutboxDrainer(store: deps.store, remote: siteRequests))
    }

    private static func identifyRestoredSession(
        session: SupabaseSessionService,
        analytics: any CaptureAnalytics
    ) {
        Task { @MainActor in
            await session.waitForReady()
            if let uid = session.userID {
                analytics.identify(uid, properties: ["role": "designer", "platform": "ios"])
                PostHogSDK.shared.reloadFeatureFlags()
            }
        }
    }
}

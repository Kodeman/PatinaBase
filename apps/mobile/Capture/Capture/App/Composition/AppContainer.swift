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
//  of the eight now returns a real Supabase concrete. This file is owned by
//  whichever wave is landing composition-root work; additive DI properties
//  (wave 2's `smartGuess`, wave 3's `projectCache`) land with
//  the wave that needs them, not on a fixed, closed list.
//   • Real mode (physical device, or sim with -CaptureForceReal): Supabase
//     session, persistent store (with graceful fallback), the local sync outbox
//     wired to real capture-media upload + the commit RPC, the offline-sync Live
//     Activity, PostHog analytics, and honest inline project creation.
//     Camera/location stay mocked on the simulator (AVFoundation/CoreLocation are
//     useless there); session/store/sync are always real.

import Foundation
import SwiftData
import UIKit
import CaptureKit
import CaptureKitMocks
import Supabase

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
    /// The offline project + room cache the door and the suggestion lane share.
    public let projectCache: CaptureProjectCache
    /// W5's People room seam, scoped to one project, and the on-disk cache that
    /// keeps its two objects readable with no signal.
    public let peopleRoom: any PeopleRoomService
    public let peopleRoomCache = PeopleRoomCache()
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
    /// W6 — the read half of Field's hours: "My hours this week" and the roster
    /// roles that decide whether LogTimeSheet raises a role chip (HT-41).
    public let hours: any FieldHoursService

    /// S2 inline project creation (real PostgREST insert vs. local-only). App
    /// -internal; nil in mock mode.
    let projectCreator: (any CaptureProjectCreating)?
    /// V4 Task 16's queued visit-close drain (FC-R3). App-internal, resumed
    /// from RootView's reconcileQueues alongside sync/siteScan — same
    /// lifecycle, no per-record secret to wait on a screen for. Nil in mock
    /// mode: TimeEntryGateway has no mock conformer.
    let visitCloseOutboxDrainer: VisitCloseOutboxDrainer?
    /// W6 — LogTimeSheet's queue. Nil in mock mode, exactly as its visit-close
    /// sibling is: there is no authenticated writer to drain to.
    let timeEntryOutboxDrainer: TimeEntryOutboxDrainer?
    /// O2 "Continue with Patina" seam (real OAuth vs. stub). App-internal — the
    /// existential lives app-side; feature teams never touch it.
    let authorizer: any WorkspaceAuthorizing
    /// Portal-QR sign-in (`field://login`) driver, shared by the deep-link
    /// handler, RootView's confirm/toast UI, and Q1's defensive forwarding.
    /// `RootView` injects its dependencies via `configure(...)` once it can bind
    /// the coordinator; unconfigured it simply buffers an incoming link.
    let portalLogin = PortalLoginController()

    /// The store ladder, lifted out of `init()` so it stays under
    /// `function_body_length` — the same reason `makeWorkServices` exists. The
    /// merge of wave 3's `projectCache` and main's resilient-store ladder put
    /// `init()` two lines over on its own.
    ///
    /// iOS relaunches Field in the background for the site-scan upload session,
    /// so the ladder can run before the first unlock, where a good store simply
    /// cannot be decrypted. UIKit lives app-side; CaptureKit takes the answer as
    /// a closure.
    private static func makeResilientStore(persistent: Bool) -> CaptureStore {
        CaptureStore.resilient(
            persistent: persistent,
            isProtectedDataAvailable: { UIApplication.shared.isProtectedDataAvailable })
    }

    /// Sync and the visit-close drain share one field-write gateway — the same
    /// authenticated writer margin notes and punch tasks already use — so they
    /// are built together and lifted out of `init()` for `function_body_length`.
    /// The authenticated write side, built together because it is one gateway.
    /// A value rather than a tuple: W6 made it four members, and four members
    /// with positional names is how a drainer ends up wired to the wrong queue.
    struct WriteLanes {
        let sync: any CaptureSyncService
        let visitClose: VisitCloseOutboxDrainer
        /// W6's hours queue — a SIBLING of the visit close's drainer, not a
        /// second job inside it (FS-44).
        let timeEntry: TimeEntryOutboxDrainer
        let hours: any FieldHoursService
    }

    private static func makeWriteLanes(
        store: CaptureStore, analytics: any CaptureAnalytics, session: SupabaseSessionService,
        client: SupabaseClient, cache: CaptureProjectCache
    ) -> WriteLanes {
        let liveActivity = CaptureLiveActivityController()
        let gateway = SupabaseCaptureGateway(client: client, bucket: AppConfiguration.captureMediaBucket)
        let fieldWrites = SupabaseFieldWriteGateway(client: client)
        let sync = LocalCaptureSyncService(store: store, analytics: analytics,
                                           liveActivity: liveActivity, session: session, remote: gateway,
                                           projectCache: cache, fieldWrites: fieldWrites)
        return WriteLanes(
            sync: sync,
            visitClose: VisitCloseOutboxDrainer(store: store, gateway: fieldWrites,
                                                session: session, analytics: analytics),
            timeEntry: TimeEntryOutboxDrainer(store: store, gateway: fieldWrites,
                                              session: session, analytics: analytics),
            hours: SupabaseFieldHoursService(client: client, session: session))
    }

    public init() {
        let real = AppConfiguration.runsRealServices
        let store = Self.makeResilientStore(persistent: real)
        self.store = store

        if real {
            // One authenticated supabase-swift client, shared by the session, the
            // sync gateway, and inline project creation.
            let client = SupabaseClientProvider.makeClient()

            let analytics = PostHogCaptureAnalytics()
            self.analytics = analytics
            self.smartGuess = HeuristicSmartGuessService()

            let session = SupabaseSessionService(client: client, analytics: analytics)
            self.session = session
            self.authorizer = SupabaseWorkspaceAuthorizer(session: session)

            // Phase 2 seams — each flow owns a `<Flow>ServiceFactory.make(deps:)`,
            // and all eight now hand back a real Supabase service. Mock mode never
            // reaches this branch; it wires the CaptureKitMocks conformers below.
            // Built BEFORE sync: the cache the sync service teaches is built on
            // `projects`, so the order here is a dependency, not a preference.
            let work = Self.makeWorkServices(deps: WorkServiceDependencies(
                client: client, session: session, store: store))
            self.projects = work.projects; self.leads = work.leads; self.decisions = work.decisions
            self.messaging = work.messaging; self.receiving = work.receiving
            self.portalAuth = work.portalAuth; self.siteScan = work.siteScan
            self.siteRequests = work.siteRequests; self.guestSiteRequests = work.siteRequests
            self.siteRequestOutboxDrainer = work.drainer; self.peopleRoom = work.peopleRoom

            let cache = CaptureProjectCache(store: store, projects: work.projects); self.projectCache = cache
            let lanes = Self.makeWriteLanes(
                store: store, analytics: analytics, session: session, client: client, cache: cache)
            self.sync = lanes.sync; self.hours = lanes.hours
            self.visitCloseOutboxDrainer = lanes.visitClose
            self.timeEntryOutboxDrainer = lanes.timeEntry
            self.projectCreator = SupabaseProjectCreator(client: client, session: session)

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
            self.session = MockSessionProviding()
            self.authorizer = StubWorkspaceAuthorizer()
            self.sync = InMemoryCaptureSyncService()
            self.projectCreator = nil
            self.visitCloseOutboxDrainer = nil; self.timeEntryOutboxDrainer = nil
            self.hours = MockFieldHoursService()
            self.camera = MockCameraService()
            self.location = MockLocationService()

            // Phase 2 seams — mock conformers (also the harness/preview default).
            self.projects = MockProjectsService(); self.leads = MockLeadsService()
            self.decisions = MockDecisionsReadService(); self.messaging = MockMessagingService()
            self.receiving = MockReceivingService(); self.siteScan = MockSiteScanService()
            self.portalAuth = MockPortalAuthApprovalService()
            let siteRequests = MockSiteRequestService()
            self.siteRequests = siteRequests
            self.guestSiteRequests = siteRequests
            self.siteRequestOutboxDrainer = SiteRequestOutboxDrainer(store: store, remote: siteRequests)
            self.projectCache = CaptureProjectCache(store: store, projects: projects)
            self.peopleRoom = MockPeopleRoomService()
        }

        // The ladder runs before analytics exists, so it reports rather than
        // emits. Report it now — a degraded store must never be silent.
        Self.reportStoreOpen(store.openReport, analytics: self.analytics)
    }

    /// Telemetry for the store-open ladder. `store.reset_incompatible` fires
    /// when an unreadable store was moved into a dated recovery folder and a
    /// fresh one started (the moved store is kept, never deleted, and the sync
    /// surface says so on every launch while it is there);
    /// `store.in_memory_fallback` fires when persistence was asked for and
    /// every on-disk rung refused, which costs the designer every capture made
    /// in that run. `store.carry_awaiting_restore` fires on every launch whose
    /// V1→V2 restore failed, so its captures are still missing from the lists.
    private static func reportStoreOpen(_ report: CaptureStoreOpenReport,
                                        analytics: any CaptureAnalytics) {
        if report.didResetIncompatibleStore {
            analytics.event("store.reset_incompatible", [
                "persistence": report.persistence.rawValue,
                "preserved_stores": String(report.preservedStores.count),
                "failures": report.failures.joined(separator: " | ")
            ])
        }
        if report.carryAwaitingRestore {
            analytics.event("store.carry_awaiting_restore", [
                "persistence": report.persistence.rawValue
            ])
        }
        guard report.losesWorkOnRelaunch else { return }
        analytics.event("store.in_memory_fallback", [
            "deferred_until_unlock": String(report.deferredUntilUnlock),
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
        let peopleRoom: any PeopleRoomService
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
            peopleRoom: PeopleRoomServiceFactory.make(deps: deps),
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
            }
        }
    }
}

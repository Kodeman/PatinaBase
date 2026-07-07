//  AppContainer.swift
//  Capture
//
//  Composition root. Branches on `AppConfiguration.runsRealServices`:
//   • All-mock mode (default sim, -CaptureUseMocks, UITest): mocks + in-memory
//     store + InMemoryCaptureSyncService + no-op analytics — keeps the 33-screen
//     harness, run/shots scripts, and previews working unchanged.
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
    /// S2 inline project creation (real PostgREST insert vs. local-only). App
    /// -internal; nil in mock mode.
    let projectCreator: (any CaptureProjectCreating)?
    /// O2 "Continue with Patina" seam (real OAuth vs. stub). App-internal — the
    /// existential lives app-side; feature teams never touch it.
    let authorizer: any WorkspaceAuthorizing

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
        }
    }
}

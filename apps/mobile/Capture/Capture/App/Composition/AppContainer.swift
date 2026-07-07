//  AppContainer.swift
//  Capture
//
//  Composition root. Branches on `AppConfiguration.runsRealServices`:
//   • All-mock mode (default sim, -CaptureUseMocks, UITest): mocks + in-memory
//     store + InMemoryCaptureSyncService — keeps the 33-screen harness, run/shots
//     scripts, and previews working unchanged.
//   • Real mode (physical device, or sim with -CaptureForceReal): Supabase
//     session, persistent store (with graceful fallback), and the local sync
//     outbox. Camera/location stay mocked on the simulator (AVFoundation/
//     CoreLocation are useless there); session/store/sync are always real.
//  Analytics stays mock until Phase 1b.

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
    /// O2 "Continue with Patina" seam (real OAuth vs. stub). App-internal — the
    /// existential lives app-side; feature teams never touch it.
    let authorizer: any WorkspaceAuthorizing

    public init() {
        let real = AppConfiguration.runsRealServices
        let store = CaptureStore.resilient(persistent: real)
        self.store = store

        // Analytics stays a no-op mock until Phase 1b (both modes).
        let analytics = MockCaptureAnalytics()
        self.analytics = analytics

        if real {
            let session = SupabaseSessionService()
            self.session = session
            self.authorizer = SupabaseWorkspaceAuthorizer(session: session)
            self.sync = LocalCaptureSyncService(store: store, analytics: analytics)
            #if targetEnvironment(simulator)
            self.camera = MockCameraService()
            self.location = MockLocationService()
            #else
            self.camera = AVFoundationCameraService()
            self.location = CoreLocationService()
            #endif
        } else {
            self.session = MockSessionProviding()
            self.authorizer = StubWorkspaceAuthorizer()
            self.sync = InMemoryCaptureSyncService()
            self.camera = MockCameraService()
            self.location = MockLocationService()
        }
    }
}

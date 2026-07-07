//  AppContainer.swift
//  Capture
//
//  Composition root: wires concrete services, or CaptureKitMocks when
//  -CaptureUseMocks is set. CP0 runs entirely on mocks + an in-memory store;
//  concrete services are registered here as each team's impl lands.

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

    public init() {
        // CP0: in-memory store + mocks. As concretes land, switch on
        // AppConfiguration.useMocks and inject SupabaseCaptureSyncService, etc.
        let store = (try? CaptureStore.inMemory())
            // TODO(phase-1a): replaced by persistent-container init
            // swiftlint:disable:next force_try
            ?? CaptureStore(container: try! CaptureStore.makeContainer(inMemory: true))
        self.store = store
        self.camera = MockCameraService()
        self.sync = InMemoryCaptureSyncService()
        self.session = MockSessionProviding()
        self.location = MockLocationService()
        self.analytics = MockCaptureAnalytics()
    }
}

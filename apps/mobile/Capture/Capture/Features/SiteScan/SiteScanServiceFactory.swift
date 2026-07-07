//  SiteScanServiceFactory.swift
//  Capture · Wave F (Pro site-scan)
//
//  Real-mode factory for the site-scan seam. `@MainActor` because the service (and
//  its live session) own an AR/RoomPlan session, like CameraService. AppContainer
//  calls this ONLY in real mode; mock mode wires `MockSiteScanService` directly, so
//  the simulator / previews / `-CaptureScreen` harness never reach this path.

import CaptureKit

enum SiteScanServiceFactory {
    @MainActor
    static func make(deps: WorkServiceDependencies) -> any SiteScanService {
        SupabaseSiteScanService(deps: deps)
    }
}

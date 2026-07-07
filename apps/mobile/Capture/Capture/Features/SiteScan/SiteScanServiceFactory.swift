//  SiteScanServiceFactory.swift
//  Capture · Wave F (Pro site-scan)
//
//  Real-mode factory for the site-scan seam. `@MainActor` because the service (and
//  its live session) own an AR/RoomPlan session, like CameraService. AppContainer
//  calls this in real mode; the freeze returns the mock. Wave F replaces ONLY the
//  body below (the real RoomPlan/ARKit pipeline) and adds its real files in this
//  directory.

import CaptureKit
import CaptureKitMocks

enum SiteScanServiceFactory {
    @MainActor
    static func make(deps: WorkServiceDependencies) -> any SiteScanService {
        // TODO(wave-F): replace with the real RoomPlan-backed SiteScanService.
        MockSiteScanService()
    }
}

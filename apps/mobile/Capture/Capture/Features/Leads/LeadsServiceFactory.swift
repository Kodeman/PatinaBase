//  LeadsServiceFactory.swift
//  Capture · Wave L (Leads)
//
//  Real-mode factory for the Leads seam. AppContainer calls this in real mode; the
//  freeze returns the mock. Wave L replaces ONLY the body below and adds its real
//  service file(s) in this directory.

import CaptureKit
import CaptureKitMocks

enum LeadsServiceFactory {
    static func make(deps: WorkServiceDependencies) -> any LeadsService {
        // TODO(wave-L): replace with the real Supabase-backed LeadsService.
        MockLeadsService()
    }
}

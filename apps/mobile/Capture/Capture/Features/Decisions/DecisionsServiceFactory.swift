//  DecisionsServiceFactory.swift
//  Capture · Wave D (Decisions, read-only)
//
//  Real-mode factory for the Decisions read seam. AppContainer calls this in real
//  mode; the freeze returns the mock. Wave D replaces ONLY the body below and adds
//  its real service file(s) in this directory.

import CaptureKit
import CaptureKitMocks

enum DecisionsServiceFactory {
    static func make(deps: WorkServiceDependencies) -> any DecisionsReadService {
        // TODO(wave-D): replace with the real Supabase-backed DecisionsReadService.
        MockDecisionsReadService()
    }
}

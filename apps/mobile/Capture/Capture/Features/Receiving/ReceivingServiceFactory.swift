//  ReceivingServiceFactory.swift
//  Capture · Wave G (Receiving / goods-in)
//
//  Real-mode factory for the Receiving seam. AppContainer calls this in real mode;
//  the freeze returns the mock. Wave G replaces ONLY the body below and adds its
//  real service file(s) in this directory.

import CaptureKit
import CaptureKitMocks

enum ReceivingServiceFactory {
    static func make(deps: WorkServiceDependencies) -> any ReceivingService {
        // TODO(wave-G): replace with the real Supabase-backed ReceivingService.
        MockReceivingService()
    }
}

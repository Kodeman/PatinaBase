//  MessagesServiceFactory.swift
//  Capture · Wave M (Messages)
//
//  Real-mode factory for the Messaging seam. AppContainer calls this in real mode;
//  the freeze returns the mock. Wave M replaces ONLY the body below (backing
//  `observeMessages` with Supabase Realtime) and adds its real service file(s) in
//  this directory.

import CaptureKit
import CaptureKitMocks

enum MessagesServiceFactory {
    static func make(deps: WorkServiceDependencies) -> any MessagingService {
        // TODO(wave-M): replace with the real Supabase-backed MessagingService.
        MockMessagingService()
    }
}

//  MessagesServiceFactory.swift
//  Capture · Wave M (Messages)
//
//  Real-mode factory for the Messaging seam. AppContainer calls this in real
//  mode; mock mode wires MockMessagingService directly (CaptureKitMocks/
//  WorkMocks.swift). @MainActor because SupabaseMessagingService holds the
//  (@MainActor) SessionProviding directly, mirroring SiteScanServiceFactory's
//  isolation (its service is also @MainActor-isolated).

import CaptureKit

enum MessagesServiceFactory {
    @MainActor
    static func make(deps: WorkServiceDependencies) -> any MessagingService {
        SupabaseMessagingService(client: deps.client, session: deps.session)
    }
}

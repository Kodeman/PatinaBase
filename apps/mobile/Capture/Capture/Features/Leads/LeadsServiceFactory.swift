//  LeadsServiceFactory.swift
//  Capture · Wave L (Leads)
//
//  Real-mode factory for the Leads seam. AppContainer calls this in real mode;
//  mock mode wires MockLeadsService directly (see AppContainer.init).

import CaptureKit

enum LeadsServiceFactory {
    static func make(deps: WorkServiceDependencies) -> any LeadsService {
        SupabaseLeadsService(client: deps.client)
    }
}

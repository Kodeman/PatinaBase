//  ReceivingServiceFactory.swift
//  Capture · Wave G (Receiving / goods-in)
//
//  Real-mode factory for the Receiving seam. AppContainer calls this in real
//  mode; mock mode wires MockReceivingService directly (AppContainer, not this
//  factory). See SupabaseReceivingService.swift for the concrete.

import CaptureKit

enum ReceivingServiceFactory {
    static func make(deps: WorkServiceDependencies) -> any ReceivingService {
        SupabaseReceivingService(client: deps.client)
    }
}

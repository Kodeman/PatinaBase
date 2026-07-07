//  DecisionsServiceFactory.swift
//  Capture · Wave D (Decisions, read-only)
//
//  Real-mode factory for the Decisions read seam. AppContainer calls this only in
//  real mode (mock mode wires MockDecisionsReadService directly and never reaches
//  here), so no mock fallback branch is needed — `deps` is always usable.

import CaptureKit

enum DecisionsServiceFactory {
    static func make(deps: WorkServiceDependencies) -> any DecisionsReadService {
        SupabaseDecisionsReadService(deps: deps)
    }
}

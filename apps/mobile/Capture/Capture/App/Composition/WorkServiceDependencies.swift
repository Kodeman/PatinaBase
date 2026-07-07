//  WorkServiceDependencies.swift
//  Capture
//
//  What the Phase 2 real service concretes need, handed to each flow's
//  `<Flow>ServiceFactory.make(deps:)`. Constructed by AppContainer in REAL mode
//  only (mock mode wires the CaptureKitMocks conformers directly), so it can carry
//  the SDK client handle. FROZEN: wave agents read from `deps` inside their own
//  factory; they never edit this type.

import Foundation
import Supabase
import CaptureKit

struct WorkServiceDependencies {
    /// The single authenticated supabase-swift client the app owns (same handle
    /// the session / sync gateway use).
    let client: SupabaseClient
    /// Identity + active workspace, for RLS-scoped reads.
    let session: any SessionProviding
}

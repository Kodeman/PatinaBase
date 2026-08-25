//  CaptureFeatureFlags.swift
//  CaptureKit
//
//  The one named place a feature reads a remote flag from. Wave 1 put
//  `isFeatureEnabled` on the CaptureAnalytics seam and gated the voice recorder
//  on it directly; this wraps that seam so a feature never has to hold an
//  analytics object to ask a yes/no question. FAIL-CLOSED throughout: anything
//  that cannot answer answers `false`, so a surface that needs an off-switch
//  (FC-R11's recording consent) has one that costs no build.

import Foundation

public struct CaptureFeatureFlags: Sendable {
    private let source: @Sendable (String) -> Bool

    public init(source: @escaping @Sendable (String) -> Bool) {
        self.source = source
    }

    /// Reads the wave-1 `CaptureAnalytics.isFeatureEnabled` seam.
    public init(analytics: any CaptureAnalytics) {
        self.init(source: { analytics.isFeatureEnabled($0) })
    }

    /// Every key is off — the honest answer when there is no flag source.
    public static let allOff = CaptureFeatureFlags(source: { _ in false })

    public func isEnabled(_ key: String) -> Bool {
        guard !key.isEmpty else { return false }
        return source(key)
    }
}

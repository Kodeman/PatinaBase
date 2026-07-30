//  SpecBookPilotGate.swift
//  Capture
//
//  Fail-closed gate for the coordinated Spec Book pilot. Production evaluates
//  the PostHog cohort flag; mock/simulator harnesses require an explicit launch
//  argument so the new routing UI never appears accidentally.

import Foundation
import PostHog

protocol SpecBookPilotGate: Sendable {
    func isEnabled() async -> Bool
}

final class PostHogSpecBookPilotGate: SpecBookPilotGate, @unchecked Sendable {
    static let flagKey = "spec-book-workspace-pilot"

    func isEnabled() async -> Bool {
        guard !AppConfiguration.postHogAPIKey.isEmpty else { return false }
        await withCheckedContinuation { continuation in
            PostHogSDK.shared.reloadFeatureFlags {
                continuation.resume()
            }
        }
        return PostHogSDK.shared.isFeatureEnabled(Self.flagKey)
    }
}

struct LaunchArgumentSpecBookPilotGate: SpecBookPilotGate {
    func isEnabled() async -> Bool {
        ProcessInfo.processInfo.arguments.contains("-CaptureEnableSpecBookPilot")
    }
}

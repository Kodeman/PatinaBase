//  PostHogCaptureAnalytics.swift
//  Capture
//
//  The real `CaptureAnalytics` for Phase 1b, wired by AppContainer in real mode.
//  Mirrors the existing Patina app's PostHogService: key from
//  `AppConfiguration.postHogAPIKey` (Secrets → env → empty). When the key is
//  empty it does NOT initialise PostHog and every call is a no-op (logged once),
//  so unsigned / key-less builds behave exactly like the mock.
//
//  posthog-ios lives ONLY app-side; CaptureKit stays SDK-free and the feature
//  teams code against the `CaptureAnalytics` seam.

import Foundation
import os
import CaptureKit
import PostHog

final class PostHogCaptureAnalytics: CaptureAnalytics {
    private static let log = Logger(subsystem: "cloud.patina.field", category: "analytics")

    /// Run-once SDK setup. `static let` is a thread-safe one-shot; its value is
    /// whether a real key was present (and thus whether events should be sent).
    private static let isEnabled: Bool = {
        let key = AppConfiguration.postHogAPIKey
        guard !key.isEmpty else {
            log.info("PostHog disabled — no API key configured; analytics is a no-op")
            return false
        }
        let config = PostHogConfig(apiKey: key, host: AppConfiguration.postHogHost)
        config.captureScreenViews = false                // we call `screen` manually
        config.captureApplicationLifecycleEvents = true
        PostHogSDK.shared.setup(config)
        PostHogSDK.shared.register(["surface": "field-ios"])
        log.info("PostHog initialised (host: \(AppConfiguration.postHogHost, privacy: .public))")
        return true
    }()

    private let enabled: Bool

    init() { self.enabled = Self.isEnabled }

    func screen(_ name: String, _ properties: [String: String]) {
        guard enabled else { return }
        PostHogSDK.shared.screen(name, properties: properties)
    }

    func event(_ name: String, _ properties: [String: String]) {
        guard enabled else { return }
        PostHogSDK.shared.capture(name, properties: properties)
    }

    func identify(_ userID: String) {
        guard enabled else { return }
        PostHogSDK.shared.identify(userID)
    }

    func identify(_ userID: String, properties: [String: String]) {
        guard enabled else { return }
        PostHogSDK.shared.identify(userID, userProperties: properties)
    }

    func isFeatureEnabled(_ key: String) -> Bool {
        guard enabled, !key.isEmpty else { return false }
        return PostHogSDK.shared.isFeatureEnabled(key)
    }
}

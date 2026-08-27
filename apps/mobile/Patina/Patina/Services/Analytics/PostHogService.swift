//
//  PostHogService.swift
//  Patina
//
//  PostHog analytics service for event tracking
//  Per spec section 12.3: Analytics Integration
//

import Foundation
import PostHog
import AppTrackingTransparency

/// Service for PostHog analytics integration
@MainActor
public final class PostHogService {

    // MARK: - Singleton

    public static let shared = PostHogService()

    // MARK: - Configuration

    /// PostHog API key (set in AppConfiguration)
    private var apiKey: String {
        AppConfiguration.postHogAPIKey
    }

    /// PostHog host URL
    private var hostURL: String {
        AppConfiguration.postHogHost
    }

    /// Whether analytics is enabled
    private var isEnabled: Bool = true

    /// Whether PostHog has been initialized
    private var isInitialized: Bool = false

    /// Whether a feature-flag payload has landed this session. Observed from
    /// `initialize()` so `awaitFeatureFlags` can answer instantly for a caller
    /// that arrives after delivery.
    private var hasReceivedFeatureFlags: Bool = false
    private var flagDeliveryObserver: NSObjectProtocol?

    // MARK: - User Properties

    /// Current user ID for identification
    private var currentUserId: String?

    // MARK: - Initialization

    private init() {}

    /// Initialize PostHog with configuration
    /// Call this in AppDelegate or App init
    public func initialize() {
        guard !isInitialized else { return }
        guard !apiKey.isEmpty else {
            PatinaLog.ui.debug("[PostHog] No API key configured, analytics disabled")
            isEnabled = false
            return
        }

        let config = PostHogConfig(apiKey: apiKey, host: hostURL)
        config.captureScreenViews = false // We handle manually
        config.captureApplicationLifecycleEvents = true
        config.sendFeatureFlagEvent = false
        config.debug = AppConfiguration.isDebug

        PostHogSDK.shared.setup(config)
        PostHogSDK.shared.register(["surface": "patina-ios"])
        isInitialized = true
        flagDeliveryObserver = NotificationCenter.default.addObserver(
            forName: PostHogSDK.didReceiveFeatureFlags,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.hasReceivedFeatureFlags = true }
        }
        PatinaLog.ui.debug("[PostHog] Initialized successfully with host: \(hostURL)")

        // Respect App Tracking Transparency
        if #available(iOS 14.5, *) {
            let status = ATTrackingManager.trackingAuthorizationStatus
            if status == .denied || status == .restricted {
                PostHogSDK.shared.optOut()
                PatinaLog.ui.debug("[PostHog] Opted out due to ATT status: \(status.rawValue)")
            }
        }
    }

    // MARK: - User Identification

    /// Identify the current user
    /// - Parameters:
    ///   - userId: Unique user identifier
    ///   - properties: Additional user properties
    public func identify(userId: String, properties: [String: Any]? = nil) {
        guard isEnabled else { return }

        currentUserId = userId

        PostHogSDK.shared.identify(userId, userProperties: properties)

        PatinaLog.ui.debug("[PostHog] Identified user: \(userId)", privacy: .private)
    }

    /// Reset user identification (call on logout)
    public func reset() {
        currentUserId = nil

        PostHogSDK.shared.reset()

        PatinaLog.ui.debug("[PostHog] Reset user identification")
    }

    // MARK: - Event Tracking

    /// Capture an analytics event
    /// - Parameters:
    ///   - event: Event name
    ///   - properties: Event properties
    public func capture(_ event: String, properties: [String: Any]? = nil) {
        guard isEnabled else { return }

        var eventProperties = properties ?? [:]

        // Add standard properties
        eventProperties["timestamp"] = ISO8601DateFormatter().string(from: Date())
        eventProperties["platform"] = "ios"
        eventProperties["app_version"] = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"

        PostHogSDK.shared.capture(event, properties: eventProperties)

        #if DEBUG
        PatinaLog.ui.debug("[PostHog] Event: \(event), Properties: \(eventProperties)")
        #endif
    }

    /// Capture a screen view event
    /// - Parameters:
    ///   - screenName: Name of the screen
    ///   - properties: Additional properties
    public func screen(_ screenName: String, properties: [String: Any]? = nil) {
        guard isEnabled else { return }

        var screenProperties = properties ?? [:]
        screenProperties["screen_name"] = screenName

        PostHogSDK.shared.screen(screenName, properties: screenProperties)

        #if DEBUG
        PatinaLog.ui.debug("[PostHog] Screen: \(screenName)")
        #endif
    }

    // MARK: - Feature Flags

    /// Check if a feature flag is enabled
    /// - Parameter flag: Feature flag key
    /// - Returns: Whether the flag is enabled
    public func isFeatureEnabled(_ flag: String) -> Bool {
        guard isEnabled else { return false }

        return PostHogSDK.shared.isFeatureEnabled(flag)
    }

    /// Wait until PostHog has delivered a feature-flag payload, or `timeout`
    /// elapses — whichever comes first. Returns immediately when analytics is
    /// off, because no payload will ever arrive.
    ///
    /// posthog-ios 3.48 exposes no `onFeatureFlags` method; the delivery
    /// signal is the `PostHogSDK.didReceiveFeatureFlags` notification
    /// (`PostHogExtensions.swift:19`, posted from `PostHogRemoteConfig`).
    /// - Returns: whether a payload actually arrived. `false` means the wait
    ///   timed out (or analytics is off) and the flag values must not be read.
    @discardableResult
    public func awaitFeatureFlags(timeout: Duration) async -> Bool {
        guard isEnabled, isInitialized else { return false }
        // A payload delivered before this call posted its notification already;
        // waiting for a second one would always time out.
        if hasReceivedFeatureFlags { return true }

        let gate = FlagDeliveryGate()
        let observer = NotificationCenter.default.addObserver(
            forName: PostHogSDK.didReceiveFeatureFlags,
            object: nil,
            queue: .main
        ) { _ in
            MainActor.assumeIsolated { gate.open(delivered: true) }
        }
        let bound = Task { @MainActor in
            try? await Task.sleep(for: timeout)
            gate.open(delivered: false)
        }
        let delivered = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            gate.attach(continuation)
        }
        bound.cancel()
        NotificationCenter.default.removeObserver(observer)
        return delivered
    }

    /// Resumes its continuation exactly once, whichever of the notification or
    /// the timeout wins the race.
    @MainActor
    private final class FlagDeliveryGate {
        private var continuation: CheckedContinuation<Bool, Never>?
        private var outcome: Bool?

        func attach(_ continuation: CheckedContinuation<Bool, Never>) {
            if let outcome {
                continuation.resume(returning: outcome)
            } else {
                self.continuation = continuation
            }
        }

        func open(delivered: Bool) {
            guard outcome == nil else { return }
            outcome = delivered
            continuation?.resume(returning: delivered)
            continuation = nil
        }
    }

    /// Get feature flag value
    /// - Parameter flag: Feature flag key
    /// - Returns: Flag value or nil
    public func getFeatureFlagValue(_ flag: String) -> Any? {
        guard isEnabled else { return nil }

        return PostHogSDK.shared.getFeatureFlag(flag)
    }

    // MARK: - User Properties

    /// Set a user property
    /// - Parameters:
    ///   - property: Property name
    ///   - value: Property value
    public func setUserProperty(_ property: String, value: Any) {
        guard isEnabled else { return }

        PostHogSDK.shared.capture("$set", properties: ["$set": [property: value]])

        #if DEBUG
        PatinaLog.ui.debug("[PostHog] Set user property: \(property) = \(value)")
        #endif
    }

    /// Increment a numeric user property
    /// - Parameters:
    ///   - property: Property name
    ///   - by: Amount to increment
    public func incrementUserProperty(_ property: String, by amount: Int = 1) {
        guard isEnabled else { return }

        PostHogSDK.shared.capture("$set", properties: ["$set_once": [property: amount]])

        #if DEBUG
        PatinaLog.ui.debug("[PostHog] Increment user property: \(property) by \(amount)")
        #endif
    }

    // MARK: - Configuration

    /// Enable or disable analytics
    public func setEnabled(_ enabled: Bool) {
        isEnabled = enabled

        if enabled {
            PostHogSDK.shared.optIn()
        } else {
            PostHogSDK.shared.optOut()
        }

        PatinaLog.ui.debug("[PostHog] Analytics \(enabled ? "enabled" : "disabled")")
    }

    /// Flush any pending events
    public func flush() {
        guard isEnabled else { return }

        PostHogSDK.shared.flush()

        PatinaLog.ui.debug("[PostHog] Flushed events")
    }
}

// MARK: - App Configuration Extension

extension AppConfiguration {
    /// PostHog API key
    static var postHogAPIKey: String {
        Secrets.postHogAPIKey ?? ProcessInfo.processInfo.environment["POSTHOG_API_KEY"] ?? ""
    }

    /// PostHog host URL
    static var postHogHost: String {
        ProcessInfo.processInfo.environment["POSTHOG_HOST"] ?? "https://us.i.posthog.com"
    }

    /// Whether debug mode is enabled
    static var isDebug: Bool {
        #if DEBUG
        return true
        #else
        return false
        #endif
    }
}

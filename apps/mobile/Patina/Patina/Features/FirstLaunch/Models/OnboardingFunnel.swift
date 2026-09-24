//
//  OnboardingFunnel.swift
//  Patina
//
//  PT-4-7: instrumentation for the onboarding activation funnel.
//
//  The headline metric is "% of new users who start ≥1 scan in their first
//  session". Onboarding is quiz-first for everyone (Splash → Auth → Carousel →
//  Style Quiz → empty DailyRoom); the walk-first experiment is gone.
//
//  Events (all captured via `PostHogService.shared.capture`):
//    • onboarding_started          { variant }  — denominator
//    • first_session_scan_started  { variant }  — numerator
//
//  `variant` is pinned to the constant "quiz_first" — the value these events
//  always carried on the shipped path — so existing funnels segmented by it
//  keep reading continuously.
//
//  The funnel metric is `first_session_scan_started / onboarding_started`.
//

import Foundation

/// Lightweight, process-lifetime funnel tracker for onboarding activation.
/// Not persisted — "first session" is intentionally scoped to a single app
/// launch so a returning user's later scans never count toward the new-user
/// activation metric.
@MainActor
public final class OnboardingFunnel {

    public static let shared = OnboardingFunnel()

    /// The `variant` property value sent with every funnel event. Onboarding
    /// has one path; the property stays so historical breakdowns line up.
    static let variant = "quiz_first"

    /// Guard so `onboarding_started` fires at most once per launch.
    private var onboardingStarted = false

    /// Guard so `first_session_scan_started` fires at most once per launch even
    /// though several surfaces (the empty state's "scan" buttons) may all try
    /// to mark it.
    private var firstSessionScanRecorded = false

    private init() {}

    /// Emit `onboarding_started`. Idempotent within a launch.
    public func beginOnboarding() {
        guard !onboardingStarted else { return }
        onboardingStarted = true
        PostHogService.shared.capture("onboarding_started", properties: [
            "variant": Self.variant
        ])
    }

    /// Called whenever a scan is started during the first session. Fires
    /// `first_session_scan_started` at most once per launch.
    public func markFirstSessionScanStarted() {
        guard !firstSessionScanRecorded else { return }
        firstSessionScanRecorded = true
        PostHogService.shared.capture("first_session_scan_started", properties: [
            "variant": Self.variant
        ])
    }
}

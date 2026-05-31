//
//  OnboardingFunnel.swift
//  Patina
//
//  PT-4-7: instrumentation for the Walk-First onboarding experiment funnel.
//
//  The headline metric is "% of new users who start ≥1 scan in their first
//  session". This file owns the (small) amount of state and the event
//  vocabulary needed to compute that metric in PostHog across both onboarding
//  variants:
//
//    • quiz_first  — the shipped default (Splash → Auth → Carousel → Style
//      Quiz → empty DailyRoom). The user may or may not scan afterwards.
//    • walk_first  — the experiment (camera primer → walk via
//      `.scanFlow(reason:.fresh)` → reveal → quiz), gated by the
//      `onboarding_walk_first` PostHog feature flag.
//
//  Events (all captured via `PostHogService.shared.capture`):
//    • onboarding_started          { variant }                       — denominator
//    • onboarding_scan_entered     { variant, first_session: true }  — walk-first numerator
//    • first_session_scan_started  { variant }                       — cross-variant numerator
//
//  The funnel metric is then `first_session_scan_started / onboarding_started`
//  segmented by `variant`.
//

import Foundation

/// Lightweight, process-lifetime funnel tracker for the Walk-First onboarding
/// experiment. Not persisted — "first session" is intentionally scoped to a
/// single app launch so a returning user's later scans never count toward the
/// new-user activation metric.
@MainActor
public final class OnboardingFunnel {

    public static let shared = OnboardingFunnel()

    /// The two onboarding paths. Raw values are the `variant` property value
    /// sent to PostHog.
    public enum Variant: String, Sendable {
        case walkFirst = "walk_first"
        case quizFirst = "quiz_first"
    }

    /// Variant the current session was assigned, set when the onboarding host
    /// resolves the `onboarding_walk_first` flag. `nil` until then (e.g. a
    /// returning, already-onboarded user who never sees the host this launch).
    public private(set) var variant: Variant?

    /// Guard so `first_session_scan_started` fires at most once per launch even
    /// though several surfaces (the walk-first auto-route, the quiz-first empty
    /// state's "scan" button) may all try to mark it.
    private var firstSessionScanRecorded = false

    private init() {}

    /// Resolve the variant from the feature flag and emit `onboarding_started`.
    /// Idempotent within a launch — re-calling returns the already-assigned
    /// variant without re-emitting. Returns whether Walk-First is active so the
    /// host can branch its UI.
    @discardableResult
    public func beginOnboarding(walkFirstEnabled: Bool) -> Variant {
        if let variant { return variant }
        let resolved: Variant = walkFirstEnabled ? .walkFirst : .quizFirst
        variant = resolved
        PostHogService.shared.capture("onboarding_started", properties: [
            "variant": resolved.rawValue
        ])
        return resolved
    }

    /// Called the moment the Walk-First path routes into `.scanFlow`. Captures
    /// `onboarding_scan_entered` and folds into the shared first-session scan
    /// signal.
    public func markWalkFirstScanEntered() {
        PostHogService.shared.capture("onboarding_scan_entered", properties: [
            "variant": Variant.walkFirst.rawValue,
            "first_session": true
        ])
        markFirstSessionScanStarted()
    }

    /// Called whenever a scan is started during the first session, on either
    /// variant (the walk-first auto-route or the quiz-first empty-state button).
    /// Fires `first_session_scan_started` at most once per launch.
    public func markFirstSessionScanStarted() {
        guard !firstSessionScanRecorded else { return }
        firstSessionScanRecorded = true
        PostHogService.shared.capture("first_session_scan_started", properties: [
            "variant": (variant ?? .quizFirst).rawValue
        ])
    }
}

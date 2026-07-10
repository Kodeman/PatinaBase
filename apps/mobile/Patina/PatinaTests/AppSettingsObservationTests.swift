//
//  AppSettingsObservationTests.swift
//  PatinaTests
//
//  Regression tests for the Wave 1 P0 "onboarding never releases" bug.
//
//  `AppCoordinator.observePhaseInputs()` derives the app phase inside
//  `withObservationTracking { _ = AppSettings.shared.hasCompletedOnboarding … }`.
//  `AppSettings`' properties are UserDefaults-backed COMPUTED properties, and
//  the `@Observable` macro only instruments stored properties — so before the
//  fix, setting `hasCompletedOnboarding = true` at the end of onboarding never
//  woke the tracker and the user stayed on the style reveal until relaunch.
//
//  These tests pin the exact mechanism the coordinator relies on: a mutation
//  of each phase-relevant settings property must fire an active
//  `withObservationTracking` registration.
//
//  (A full AppCoordinator phase-flip test is not feasible here: the
//  coordinator reads the real `AuthService.shared` singleton, whose readiness
//  depends on a live Supabase auth stream — there is no injection seam this
//  wave. The settings-observability contract below is the link that was
//  broken.)
//

import Foundation
import Observation
import Testing
@testable import Patina

@MainActor
struct AppSettingsObservationTests {

    /// `withObservationTracking`'s `onChange` closure is `@Sendable`, so a
    /// plain captured `var` trips Swift 6 concurrency checks even though the
    /// willSet-time callback here is synchronous. A tiny lock-free box keeps
    /// the tests warning-clean.
    private final class Flag: @unchecked Sendable {
        var value = false
    }

    /// The P0 regression: flipping `hasCompletedOnboarding` must wake an
    /// active observation registration (this is how the phase observer
    /// learns onboarding finished).
    @Test
    func hasCompletedOnboardingMutationWakesObservationTracking() {
        let settings = AppSettings.shared
        let original = settings.hasCompletedOnboarding
        defer { settings.hasCompletedOnboarding = original }

        settings.hasCompletedOnboarding = false

        let fired = Flag()
        withObservationTracking {
            _ = settings.hasCompletedOnboarding
        } onChange: {
            fired.value = true
        }

        settings.hasCompletedOnboarding = true

        #expect(fired.value, "Setting hasCompletedOnboarding must notify observers — AppCoordinator's phase derivation depends on it")
        #expect(settings.hasCompletedOnboarding, "The new value must still round-trip through UserDefaults")
    }

    /// `hasSeenThreshold` is also read by phase-adjacent flows
    /// (`resetToThreshold`) — same contract.
    @Test
    func hasSeenThresholdMutationWakesObservationTracking() {
        let settings = AppSettings.shared
        let original = settings.hasSeenThreshold
        defer { settings.hasSeenThreshold = original }

        settings.hasSeenThreshold = false

        let fired = Flag()
        withObservationTracking {
            _ = settings.hasSeenThreshold
        } onChange: {
            fired.value = true
        }

        settings.hasSeenThreshold = true

        #expect(fired.value, "Setting hasSeenThreshold must notify observers")
        #expect(settings.hasSeenThreshold)
    }

    /// Distinct properties must not cross-notify: an observer of
    /// `roomCount` should not fire for `hasCompletedOnboarding` — proves
    /// the accessors register per-keyPath, not object-wide.
    @Test
    func unrelatedPropertyMutationDoesNotWakeTracking() {
        let settings = AppSettings.shared
        let originalFlag = settings.hasCompletedOnboarding
        let originalCount = settings.roomCount
        defer {
            settings.hasCompletedOnboarding = originalFlag
            settings.roomCount = originalCount
        }

        let fired = Flag()
        withObservationTracking {
            _ = settings.roomCount
        } onChange: {
            fired.value = true
        }

        settings.hasCompletedOnboarding = !originalFlag

        #expect(!fired.value, "roomCount observers must not fire for hasCompletedOnboarding mutations")
    }
}

//
//  HelpCoachmarkTests.swift
//  PatinaTests
//
//  Swift Testing coverage for `HelpCoachmark` — the Sprint 3 Stream G8
//  proactive-layer iOS component.
//
//  Scope:
//   * Public API surface — the initialiser accepts the documented argument
//     shapes (surface key, binding, optional fallback heading/body, step
//     indicator, dismiss + next handlers) and produces a view tree the
//     compiler can resolve.
//   * `HelpContent` Codable round-trip for the new `.coachmark` case — the
//     enum was extended for this task so we pin the encode/decode shape.
//   * Analytics taxonomy — `HelpAnalytics.shared.coachmarkShown` and
//     `coachmarkDismissed` are exposed with the expected signatures.
//
//  Render-level verification (popover content, button taps, analytics fired)
//  is covered by manual on-device smoke testing per the task brief.
//

import SwiftUI
import Testing
@testable import Patina

@MainActor
struct HelpCoachmarkTests {

    // MARK: - Public initialisers

    @Test
    func helpCoachmark_constructsWithMinimumInputs() {
        let coachmark = HelpCoachmark(
            surfaceKey: SurfaceKeys.IOSApp.Home.dailyGreeting,
            isShown: .constant(true)
        ) {
            Text("anchor")
        }
        _ = coachmark.body
    }

    @Test
    func helpCoachmark_acceptsFallbackHeadingAndBody() {
        let coachmark = HelpCoachmark(
            surfaceKey: SurfaceKeys.IOSApp.Home.dailyGreeting,
            isShown: .constant(true),
            fallback: (heading: "Welcome", body: "A short intro to the daily room.")
        ) {
            Text("anchor")
        }
        _ = coachmark.body
    }

    @Test
    func helpCoachmark_acceptsPersonaOverride() {
        let coachmark = HelpCoachmark(
            surfaceKey: SurfaceKeys.IOSApp.Home.tierPill,
            isShown: .constant(false),
            persona: .designer
        ) {
            Image(systemName: "circle")
        }
        _ = coachmark.body
    }

    @Test
    func helpCoachmark_acceptsStepIndicator() {
        let coachmark = HelpCoachmark(
            surfaceKey: SurfaceKeys.IOSApp.Home.tierPill,
            isShown: .constant(true),
            stepNumber: 2,
            totalSteps: 4
        ) {
            Text("anchor")
        }
        _ = coachmark.body
    }

    @Test
    func helpCoachmark_acceptsDismissAndNextHandlers() {
        let coachmark = HelpCoachmark(
            surfaceKey: SurfaceKeys.IOSApp.Home.matchPill,
            isShown: .constant(true),
            fallback: (heading: "h", body: "b"),
            stepNumber: 1,
            totalSteps: 3,
            onDismiss: {},
            onNext: {}
        ) {
            Text("anchor")
        }
        _ = coachmark.body
    }

    // MARK: - HelpContent.coachmark Codable round-trip

    @Test
    func coachmarkContent_decodesFromCoachmarkContentBlock() throws {
        let json = #"""
        {
          "contentType": "coachmark",
          "coachmarkContent": {
            "heading": "Welcome to your Daily Room",
            "body": "Patina curates one room of products each day.",
            "ctaLabel": "Got it"
          }
        }
        """#
        let decoded = try JSONDecoder().decode(HelpContent.self, from: Data(json.utf8))
        guard case let .coachmark(payload) = decoded else {
            Issue.record("Expected .coachmark case, got \(decoded.contentType.rawValue)")
            return
        }
        #expect(payload.heading == "Welcome to your Daily Room")
        #expect(payload.body == "Patina curates one room of products each day.")
        #expect(payload.ctaLabel == "Got it")
    }

    @Test
    func coachmarkContent_fallsBackToTooltipContentBlock() throws {
        // The Sanity helpContent schema reuses the tooltipContent block for
        // coachmark documents; our decoder remaps eyebrow → heading + body.
        let json = #"""
        {
          "contentType": "coachmark",
          "tooltipContent": {
            "eyebrow": "Tip",
            "body": "Tap the heart to save a product."
          }
        }
        """#
        let decoded = try JSONDecoder().decode(HelpContent.self, from: Data(json.utf8))
        guard case let .coachmark(payload) = decoded else {
            Issue.record("Expected .coachmark case")
            return
        }
        #expect(payload.heading == "Tip")
        #expect(payload.body == "Tap the heart to save a product.")
        #expect(payload.ctaLabel == nil)
    }

    @Test
    func coachmarkContent_roundTripsThroughEncoder() throws {
        let original = HelpContent.coachmark(
            CoachmarkContent(
                heading: "Match score",
                body: "How closely this fits your taste profile.",
                ctaLabel: "Got it"
            )
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(HelpContent.self, from: data)
        #expect(decoded == original)
    }

    // MARK: - Analytics taxonomy

    @Test
    func helpAnalytics_exposesCoachmarkShownAndDismissed() {
        // Compile-time proof of the method signatures the component relies on.
        let _: (String) -> Void = { sk in
            HelpAnalytics.shared.coachmarkShown(surfaceKey: sk)
        }
        let _: (String, Int) -> Void = { sk, ms in
            HelpAnalytics.shared.coachmarkDismissed(surfaceKey: sk, viewedMs: ms)
        }
    }

    @Test
    func helpEvent_coachmarkRawValuesMatchWebSpec() {
        #expect(HelpEvent.coachmarkShown.rawValue == "help.coachmark.shown")
        #expect(HelpEvent.coachmarkDismissed.rawValue == "help.coachmark.dismissed")
    }

    // MARK: - HelpContentType

    @Test
    func helpContentType_coachmarkRawValueMatchesSanitySchema() {
        #expect(HelpContentType.coachmark.rawValue == "coachmark")
    }
}

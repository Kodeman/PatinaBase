//
//  HelpWelcomeModalTests.swift
//  PatinaTests
//
//  Swift Testing coverage for `HelpWelcomeModal` — the Sprint 3 Stream G8
//  proactive-layer iOS component.
//
//  Scope:
//   * Public API surface — the initialiser accepts the documented argument
//     shapes (surface key, binding, persona, fallback strings, start-tour
//     and skip handlers).
//   * `HelpContent` Codable round-trip for the new `.welcomeModal` case —
//     pins encode/decode shape so wire-level drift is caught at build time.
//   * Analytics taxonomy — `HelpAnalytics.shared.welcomeModalShown` and
//     `welcomeModalAction` are exposed with the expected signatures.
//   * `.helpWelcomeModal(...)` convenience modifier compiles on arbitrary hosts.
//
//  Render-level verification is covered by manual on-device smoke testing.
//

import SwiftUI
import Testing
@testable import Patina

@MainActor
struct HelpWelcomeModalTests {

    // MARK: - Public initialisers

    @Test
    func helpWelcomeModal_constructsWithMinimumInputs() {
        let modal = HelpWelcomeModal(
            surfaceKey: SurfaceKeys.IOSApp.Home.root,
            isPresented: .constant(true)
        )
        _ = modal.body
    }

    @Test
    func helpWelcomeModal_acceptsPersonaOverride() {
        let modal = HelpWelcomeModal(
            surfaceKey: SurfaceKeys.IOSApp.Home.root,
            isPresented: .constant(false),
            persona: .designer
        )
        _ = modal.body
    }

    @Test
    func helpWelcomeModal_acceptsFallbackStrings() {
        let modal = HelpWelcomeModal(
            surfaceKey: SurfaceKeys.IOSApp.Home.root,
            isPresented: .constant(true),
            persona: .consumer,
            fallback: (
                title: "Hello there",
                body: "Welcome to the Patina iOS app.",
                primaryCta: "Take the tour",
                secondaryCta: "Skip"
            )
        )
        _ = modal.body
    }

    @Test
    func helpWelcomeModal_acceptsCallbacks() {
        let modal = HelpWelcomeModal(
            surfaceKey: SurfaceKeys.IOSApp.Home.root,
            isPresented: .constant(true),
            persona: nil,
            fallback: nil,
            onStartTour: {},
            onSkip: {}
        )
        _ = modal.body
    }

    // MARK: - Convenience modifier

    @Test
    func helpWelcomeModalModifier_compilesOnArbitraryHost() {
        let host = Text("host")
            .helpWelcomeModal(
                isPresented: .constant(false),
                surfaceKey: SurfaceKeys.IOSApp.Home.root,
                persona: .designer,
                onStartTour: {},
                onSkip: {}
            )
        _ = host
    }

    // MARK: - HelpContent.welcomeModal Codable round-trip

    @Test
    func welcomeModalContent_decodesFromWelcomeModalContentBlock() throws {
        let json = #"""
        {
          "contentType": "welcomeModal",
          "welcomeModalContent": {
            "title": "Welcome to Patina",
            "body": "Take a brief tour or jump in and explore.",
            "primaryCtaLabel": "Take the tour",
            "secondaryCtaLabel": "Skip for now"
          }
        }
        """#
        let decoded = try JSONDecoder().decode(HelpContent.self, from: Data(json.utf8))
        guard case let .welcomeModal(payload) = decoded else {
            Issue.record("Expected .welcomeModal case, got \(decoded.contentType.rawValue)")
            return
        }
        #expect(payload.title == "Welcome to Patina")
        #expect(payload.body == "Take a brief tour or jump in and explore.")
        #expect(payload.primaryCtaLabel == "Take the tour")
        #expect(payload.secondaryCtaLabel == "Skip for now")
    }

    @Test
    func welcomeModalContent_acceptsMissingSecondaryCta() throws {
        let json = #"""
        {
          "contentType": "welcomeModal",
          "welcomeModalContent": {
            "title": "Welcome",
            "body": "Body",
            "primaryCtaLabel": "Start"
          }
        }
        """#
        let decoded = try JSONDecoder().decode(HelpContent.self, from: Data(json.utf8))
        guard case let .welcomeModal(payload) = decoded else {
            Issue.record("Expected .welcomeModal case")
            return
        }
        #expect(payload.secondaryCtaLabel == nil)
    }

    @Test
    func welcomeModalContent_roundTripsThroughEncoder() throws {
        let original = HelpContent.welcomeModal(
            WelcomeModalContent(
                title: "Welcome, designer",
                body: "Patina helps you curate rooms for clients.",
                primaryCtaLabel: "Take the tour",
                secondaryCtaLabel: "Jump in"
            )
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(HelpContent.self, from: data)
        #expect(decoded == original)
    }

    // MARK: - Analytics taxonomy

    @Test
    func helpAnalytics_exposesWelcomeModalShownAndAction() {
        // Compile-time proof of the method signatures the component depends on.
        let _: (Bool) -> Void = { first in
            HelpAnalytics.shared.welcomeModalShown(firstSignin: first)
        }
        let _: (HelpAnalytics.WelcomeModalAction) -> Void = { action in
            HelpAnalytics.shared.welcomeModalAction(action: action)
        }
    }

    @Test
    func helpAnalytics_welcomeModalActionEnumIncludesTakeTourAndJumpIn() {
        #expect(HelpAnalytics.WelcomeModalAction.takeTour.rawValue == "take_tour")
        #expect(HelpAnalytics.WelcomeModalAction.jumpIn.rawValue == "jump_in")
    }

    @Test
    func helpEvent_welcomeModalRawValuesMatchWebSpec() {
        #expect(HelpEvent.welcomeModalShown.rawValue == "help.welcome_modal.shown")
        #expect(HelpEvent.welcomeModalAction.rawValue == "help.welcome_modal.action")
    }

    // MARK: - HelpContentType

    @Test
    func helpContentType_welcomeModalRawValueMatchesSanitySchema() {
        #expect(HelpContentType.welcomeModal.rawValue == "welcomeModal")
    }
}

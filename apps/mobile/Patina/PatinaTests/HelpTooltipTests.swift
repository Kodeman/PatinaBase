//
//  HelpTooltipTests.swift
//  PatinaTests
//
//  Swift Testing coverage for `HelpTooltip` + `HelpInfoIcon` — the Sprint 2
//  Stream G5 reactive-layer iOS components.
//
//  SwiftUI views are difficult to assert against structurally without a
//  view-hosting dependency (ViewInspector is not a project dependency).
//  These tests therefore focus on:
//
//   * Public API surface — initialisers accept the documented argument
//     shapes and produce a value `body` can be evaluated against without
//     crashing.
//   * Analytics taxonomy — `HelpAnalytics.shared` exposes the canonical
//     `tooltipShown` / `tooltipDismissed` methods that the components call.
//   * `HelpInfoIcon` composes `HelpTooltip` (the wrapper around the glyph
//     should resolve to a generic `HelpTooltip<Image>` at compile time).
//
//  Render-level verification (popover present/absent, body text, analytics
//  fired) is covered by manual on-device smoke testing per the task brief;
//  see `controlling-mobile-devices` / `running-smoke-tests` skills.
//

import SwiftUI
import Testing
@testable import Patina

@MainActor
struct HelpTooltipTests {

    // MARK: - Public initialisers

    /// `HelpTooltip` must accept a surface key, optional fallback, and a
    /// view-builder trigger without crashing during construction.
    @Test
    func helpTooltip_constructsWithSurfaceKeyAndTriggerBuilder() {
        let tooltip = HelpTooltip(
            surfaceKey: SurfaceKeys.DesignerPortal.Today.dashboard
        ) {
            Text("Trigger")
        }

        // Touch `.body` so we exercise the SwiftUI view tree construction;
        // the typealias for `Body` is opaque, so we just verify it compiles.
        _ = tooltip.body
    }

    @Test
    func helpTooltip_acceptsFallbackString() {
        let tooltip = HelpTooltip(
            surfaceKey: SurfaceKeys.DesignerPortal.Today.dashboard,
            fallback: "Inline fallback body"
        ) {
            Text("Trigger")
        }
        _ = tooltip.body
    }

    @Test
    func helpTooltip_acceptsPersonaOverride() {
        let tooltip = HelpTooltip(
            surfaceKey: SurfaceKeys.DesignerPortal.Today.dashboard,
            fallback: nil,
            persona: .designer
        ) {
            Text("Trigger")
        }
        _ = tooltip.body
    }

    @Test
    func helpTooltip_acceptsCustomMaxWidth() {
        let tooltip = HelpTooltip(
            surfaceKey: SurfaceKeys.DesignerPortal.Today.dashboard,
            fallback: "x",
            persona: nil,
            maxWidth: 320
        ) {
            Text("Trigger")
        }
        _ = tooltip.body
    }

    // MARK: - HelpInfoIcon composition

    /// `HelpInfoIcon` must construct from just a surface key with sensible
    /// defaults (size 14, label "More information"). The internal trigger
    /// is an `Image` so the resolved generic type for `HelpTooltip` is
    /// derivable at compile time.
    @Test
    func helpInfoIcon_constructsWithJustSurfaceKey() {
        let icon = HelpInfoIcon(
            surfaceKey: SurfaceKeys.DesignerPortal.Today.dashboard
        )
        _ = icon.body
    }

    @Test
    func helpInfoIcon_acceptsAllInputs() {
        let icon = HelpInfoIcon(
            surfaceKey: SurfaceKeys.DesignerPortal.Today.dashboard,
            fallback: "Inline fallback",
            persona: .designer,
            size: 18,
            accessibilityLabel: "Show more details"
        )
        _ = icon.body
    }

    // MARK: - Analytics taxonomy

    /// `HelpAnalytics.shared` exposes the tooltip events that the components
    /// call. These method names + parameter labels are load-bearing — if
    /// they drift, the components will fail to compile.
    @Test
    func helpAnalytics_exposesTooltipShownAndDismissed() {
        // Compile-time proof that the methods exist with the expected
        // signatures. We don't invoke them (which would emit PostHog events)
        // — we just take method references.
        let _: (String, HelpAnalytics.TooltipPosition, HelpAnalytics.TooltipTrigger) -> Void = { sk, pos, tt in
            HelpAnalytics.shared.tooltipShown(
                surfaceKey: sk,
                position: pos,
                triggerType: tt
            )
        }
        let _: (String, Int) -> Void = { sk, ms in
            HelpAnalytics.shared.tooltipDismissed(
                surfaceKey: sk,
                durationMs: ms
            )
        }
    }

    /// The `triggerType` enum used by `HelpTooltip` (`.click`) must exist
    /// in the analytics taxonomy. This pins the cross-platform contract:
    /// iOS taps map to the web "click" trigger.
    @Test
    func helpAnalytics_triggerTypeIncludesClick() {
        let trigger: HelpAnalytics.TooltipTrigger = .click
        #expect(trigger.rawValue == "click")
    }

    /// The default position for an iOS popover is `.top`. Pin the enum
    /// raw value so the cross-platform `position` property keeps the same
    /// wire string as the web `side` field.
    @Test
    func helpAnalytics_positionTopIsAvailable() {
        let position: HelpAnalytics.TooltipPosition = .top
        #expect(position.rawValue == "top")
    }
}

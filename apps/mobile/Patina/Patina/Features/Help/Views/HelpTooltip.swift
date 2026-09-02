//
//  HelpTooltip.swift
//  Patina
//
//  iOS SwiftUI native equivalent of the web `<Tooltip />` reactive-layer
//  component (spec §4.1). Adapted to iOS Human Interface Guidelines —
//  there is no hover on iOS, so the affordance is tap-to-reveal via
//  SwiftUI's `.popover` modifier. The popover auto-dismisses on outside
//  tap, supports Dynamic Type, and the trigger is fully VoiceOver friendly.
//
//  Sprint 2 · Stream G5 — Reactive layer iOS components.
//
//  Behavior mirror with the web component (`packages/help-system/src/reactive/Tooltip/Tooltip.tsx`):
//   - Body copy comes from Sanity via `SanityHelpClient.shared.fetchContent`
//     with `contentType == "tooltip"`. Persona is currently `nil` (Sanity's
//     "all" sentinel); a future task plumbs the active persona through.
//   - Body width capped at 240pt (spec §4.1). Padding 12pt, 14pt text.
//   - Graceful degradation (spec §13.4):
//       1. CMS hit  → tooltip body uses Sanity copy
//       2. CMS miss + `fallback` prop → tooltip body uses fallback
//       3. CMS miss + no fallback     → tap is a no-op (silent absence)
//   - Analytics: `HelpAnalytics.shared.tooltipShown(...)` on open and
//     `HelpAnalytics.shared.tooltipDismissed(...)` on dismiss.
//     `triggerType` is `.click` because iOS is tap-driven.
//
//  Why a generic `Trigger` ViewBuilder?
//  -----------------------------------
//  The web component accepts any focusable child via Radix Tooltip's
//  `asChild`. We mirror that with a `@ViewBuilder` closure so call sites
//  can wrap any SwiftUI view — typically `HelpInfoIcon`, but a `Text`,
//  `Image`, or custom badge works too.
//

import SwiftUI

/// A SwiftUI popover-backed tooltip that pulls its body from Sanity by
/// surface key. Adapts the web `<Tooltip />` contract to iOS HIG: tap to
/// open, tap outside to dismiss, Dynamic Type, VoiceOver.
public struct HelpTooltip<Trigger: View>: View {

    // MARK: - Inputs

    /// Surface key from `SurfaceKeys.*`. Must be in canonical kebab/slash form.
    private let surfaceKey: SurfaceKey

    /// Inline body to show when Sanity returns no content. If both this and the
    /// CMS body are absent, tapping the trigger is a no-op (silent absence).
    private let fallback: String?

    /// Persona override for CMS lookup. `nil` (the default) lets the client
    /// walk its persona-agnostic fallback chain. A future task will plumb the
    /// current user's persona through from the auth/profile state.
    private let persona: Persona?

    /// Maximum width of the tooltip body, in points. Defaults to 240 per
    /// spec §4.1.
    private let maxWidth: CGFloat

    /// Builder for the tap trigger view (typically `HelpInfoIcon` or any
    /// other tappable view).
    private let trigger: () -> Trigger

    // MARK: - State

    /// Drives the SwiftUI `.popover` presentation.
    @State private var isPresented: Bool = false

    /// CMS-loaded body, cached for the lifetime of the view. `nil` while
    /// loading or when both CMS and fallback are absent.
    @State private var loadedBody: String? = nil

    /// True once the CMS load has completed at least once. Used to gate the
    /// "silent absence" path so we don't suppress the popover during the
    /// very first tap before the network has answered.
    @State private var hasLoaded: Bool = false

    /// Timestamp recorded when the popover opens. Used to compute
    /// `duration_ms` for the dismissed analytics event.
    @State private var shownAt: Date? = nil

    // MARK: - Init

    /// Creates a tooltip wrapper around an arbitrary trigger view.
    /// - Parameters:
    ///   - surfaceKey: Surface key from `SurfaceKeys.*`.
    ///   - fallback:   Optional inline body for CMS misses.
    ///   - persona:    Persona for CMS lookup; `nil` queries persona-agnostic content.
    ///   - maxWidth:   Tooltip body max width in points (default 240).
    ///   - trigger:    Builder for the tap target.
    public init(
        surfaceKey: SurfaceKey,
        fallback: String? = nil,
        persona: Persona? = nil,
        maxWidth: CGFloat = 240,
        @ViewBuilder trigger: @escaping () -> Trigger
    ) {
        self.surfaceKey = surfaceKey
        self.fallback = fallback
        self.persona = persona
        self.maxWidth = maxWidth
        self.trigger = trigger
    }

    // MARK: - View

    public var body: some View {
        trigger()
            .onTapGesture {
                handleTriggerTap()
            }
            // C-18: `.onTapGesture` exposes no activate action, so VoiceOver
            // could see the trigger and never open it. The gesture stays for
            // touch; this is the same act for the accessibility tree.
            .accessibilityAction {
                handleTriggerTap()
            }
            .popover(isPresented: $isPresented, arrowEdge: .top) {
                if let body = effectiveBody {
                    // B-07 / C-18: the bubble takes its height from the text.
                    // It used to read `.padding` → `.frame` → `.fixedSize`,
                    // which let the frame's proposal win: 86.3 pt of copy in a
                    // ~75 pt bubble, clipped at the top AND the bottom, and
                    // translucent enough to read the greeting through it.
                    Text(body)
                        .font(.body)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: maxWidth, alignment: .leading)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 14)
                        .background(PatinaColors.Background.primary)
                        // `presentationCompactAdaptation` keeps the popover
                        // a true popover on iPhone (rather than auto-promoting
                        // to a sheet at compact widths), matching the web
                        // hover-popover semantics as closely as iOS allows.
                        .presentationCompactAdaptation(.popover)
                        .accessibilityElement(children: .combine)
                        .accessibilityAddTraits(.isStaticText)
                }
            }
            .onChange(of: isPresented) { _, newValue in
                handlePresentationChange(newValue)
            }
            .task(id: surfaceKey) {
                await loadContent()
            }
    }

    // MARK: - Effective body resolution

    /// Resolves the body to display: CMS body wins, falling back to the
    /// inline `fallback` prop. `nil` means "no content" — tapping the
    /// trigger is a no-op.
    private var effectiveBody: String? {
        loadedBody ?? fallback
    }

    // MARK: - Handlers

    /// Handle a tap on the trigger. We only present the popover when there
    /// is body content to show (silent-absence graceful degradation).
    private func handleTriggerTap() {
        // If we haven't loaded yet, attempt presentation anyway — the
        // popover will simply render empty until `loadedBody` resolves. In
        // practice the load completes in <100ms so the perceived behaviour
        // is "tap → popover appears with content".
        if hasLoaded && effectiveBody == nil {
            return // Silent absence
        }
        isPresented = true
    }

    /// Fire analytics on open/close and track duration.
    private func handlePresentationChange(_ newValue: Bool) {
        if newValue {
            shownAt = Date()
            HelpAnalytics.shared.tooltipShown(
                surfaceKey: surfaceKey,
                position: .top,
                triggerType: .click
            )
        } else if let start = shownAt {
            let durationMs = Int(Date().timeIntervalSince(start) * 1000)
            HelpAnalytics.shared.tooltipDismissed(
                surfaceKey: surfaceKey,
                durationMs: max(0, durationMs)
            )
            shownAt = nil
        }
    }

    // MARK: - CMS load

    /// Fetch tooltip body from Sanity. Errors collapse to `nil` so the UI
    /// stays functional during CMS downtime (matches `SanityHelpClient`
    /// semantics, spec §13.4).
    private func loadContent() async {
        defer { hasLoaded = true }
        do {
            let content = try await SanityHelpClient.shared.fetchContent(
                surfaceKey: surfaceKey,
                contentType: HelpContentType.tooltip.rawValue,
                persona: persona
            )
            if case let .tooltip(payload) = content {
                loadedBody = payload.body
            }
        } catch {
            // Invalid surface key or unexpected throw — keep silent and
            // let the fallback (or no popover) take over.
        }
    }
}

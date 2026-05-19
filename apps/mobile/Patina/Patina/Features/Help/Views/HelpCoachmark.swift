//
//  HelpCoachmark.swift
//  Patina
//
//  iOS SwiftUI native equivalent of the web `<Coachmark />` proactive-layer
//  component (spec §4.7). A non-blocking, anchor-positioned spotlight card
//  with heading + body, an optional "Next" CTA, and a "Skip"/dismiss control.
//
//  Sprint 3 · Stream G8 — Proactive layer iOS components.
//
//  iOS adaptation notes
//  --------------------
//  The web component uses Radix Popover; on iOS we use SwiftUI's `.popover`
//  modifier with `.presentationCompactAdaptation(.popover)` to force the
//  popover style on iPhone (rather than auto-promoting to a sheet at compact
//  widths). The popover is informational (`role=dialog`, non-modal on web)
//  — SwiftUI popovers do not trap focus and dismiss on outside-tap, which
//  matches the spec §4.7#6 "never blocks the underlying interface" rule.
//
//  Content sourcing
//  ----------------
//  Pulls a `CoachmarkContent` payload from Sanity via
//  `SanityHelpClient.shared.fetchContent(surfaceKey:contentType:persona:)`
//  with `contentType == "coachmark"`. Graceful degradation chain matches the
//  web component (spec §13.4):
//
//    1. CMS hit                                    → use Sanity copy
//    2. CMS miss + `fallback` prop                 → use fallback strings
//    3. CMS miss + no fallback + open is forced    → render an empty popover
//       (no crash, no flash); typically the parent gates `isShown` on having
//       content so this path is rare in practice.
//
//  Analytics (mirrors the web `helpEvents.coachmark` facade — spec §10.1)
//  ----------------------------------------------------------------------
//    - `HelpAnalytics.shared.coachmarkShown(surfaceKey:)` on open
//    - `HelpAnalytics.shared.coachmarkDismissed(surfaceKey:viewedMs:)` on close
//
//  Step indicator
//  --------------
//  The optional `stepNumber` + `totalSteps` parameters drive a "Step X of Y"
//  caption above the heading. They are surfaced for parity with the web
//  component contract (used by D2 `TourController`) — the iOS tour stream
//  ships in a follow-up task.
//
//  Accessibility (spec §11)
//  -------------------------
//   * Dynamic Type: `.font(.headline)`, `.font(.body)`, `.font(.caption)`
//   * VoiceOver: heading + body combine into a single accessibility element
//     announced as a dialog; buttons have explicit labels.
//   * Reduced motion: SwiftUI popover presentation respects the system
//     `prefers-reduced-motion` setting automatically.
//

import SwiftUI

/// A SwiftUI popover-backed coachmark, anchored to a host view, that pulls
/// its heading + body from Sanity by surface key. Mirrors the web
/// `<Coachmark />` contract while honouring iOS HIG: tap to dismiss outside,
/// dismiss button in the card, optional "Next" CTA, optional step indicator.
///
/// ```swift
/// HelpCoachmark(
///     surfaceKey: SurfaceKeys.IOSApp.Home.dailyGreeting,
///     isShown: $showCoachmark,
///     onDismiss: { tour.skip() },
///     onNext: { tour.advance() }
/// ) {
///     Image(systemName: "house.fill")
/// }
/// ```
public struct HelpCoachmark<Anchor: View>: View {

    // MARK: - Inputs

    /// Surface key from `SurfaceKeys.*`. Must be in canonical kebab/slash form.
    private let surfaceKey: SurfaceKey

    /// Inline fallback heading + body for CMS misses. When both Sanity and
    /// this fallback are absent, the popover renders empty (the parent
    /// typically gates `isShown` on content availability).
    private let fallback: (heading: String, body: String)?

    /// Persona override for CMS lookup. `nil` (the default) lets the client
    /// walk its persona-agnostic fallback chain.
    private let persona: Persona?

    /// Current step number in a multi-step tour. Renders "Step X of Y".
    /// Both `stepNumber` and `totalSteps` must be supplied for the caption to
    /// render — one without the other is treated as "not in a tour".
    private let stepNumber: Int?

    /// Total steps in the parent tour.
    private let totalSteps: Int?

    /// Optional dismiss handler — fires before the popover closes when the
    /// user taps "Skip". `nil` hides the button.
    private let onDismiss: (() -> Void)?

    /// Optional Next handler — fires before the popover closes when the user
    /// taps the primary CTA. `nil` hides the button.
    private let onNext: (() -> Void)?

    /// Builder for the anchor view that the popover attaches to.
    private let anchor: () -> Anchor

    /// Two-way binding owned by the caller. Setting to `true` opens the
    /// popover; the popover sets it to `false` on dismiss.
    @Binding private var isShown: Bool

    // MARK: - State

    /// CMS-loaded payload, cached for the lifetime of the view. `nil` while
    /// loading or when both CMS and fallback are absent.
    @State private var loaded: CoachmarkContent? = nil

    /// True once the CMS load has completed at least once.
    @State private var hasLoaded: Bool = false

    /// Timestamp recorded when the popover opens. Used to compute
    /// `viewed_ms` for the dismissed analytics event.
    @State private var shownAt: Date? = nil

    // MARK: - Init

    /// Creates a coachmark anchored to an arbitrary host view.
    /// - Parameters:
    ///   - surfaceKey:   Surface key from `SurfaceKeys.*`.
    ///   - isShown:      Two-way binding controlling presentation.
    ///   - fallback:     Optional inline heading + body for CMS misses.
    ///   - persona:      Persona for CMS lookup; `nil` queries persona-agnostic content.
    ///   - stepNumber:   Current step in a tour (optional).
    ///   - totalSteps:   Total tour steps (optional). Must be paired with `stepNumber`.
    ///   - onDismiss:    Closure fired when the user taps "Skip" / outside.
    ///   - onNext:       Closure fired when the user taps "Next".
    ///   - anchor:       View builder for the anchor.
    public init(
        surfaceKey: SurfaceKey,
        isShown: Binding<Bool>,
        fallback: (heading: String, body: String)? = nil,
        persona: Persona? = nil,
        stepNumber: Int? = nil,
        totalSteps: Int? = nil,
        onDismiss: (() -> Void)? = nil,
        onNext: (() -> Void)? = nil,
        @ViewBuilder anchor: @escaping () -> Anchor
    ) {
        self.surfaceKey = surfaceKey
        self._isShown = isShown
        self.fallback = fallback
        self.persona = persona
        self.stepNumber = stepNumber
        self.totalSteps = totalSteps
        self.onDismiss = onDismiss
        self.onNext = onNext
        self.anchor = anchor
    }

    // MARK: - View

    public var body: some View {
        anchor()
            .popover(isPresented: $isShown, arrowEdge: .top) {
                popoverContent
                    .presentationCompactAdaptation(.popover)
            }
            .onChange(of: isShown) { _, newValue in
                handlePresentationChange(newValue)
            }
            .task(id: surfaceKey) {
                await loadContent()
            }
    }

    // MARK: - Subviews

    @ViewBuilder
    private var popoverContent: some View {
        if let resolved = effectiveContent {
            VStack(alignment: .leading, spacing: 8) {
                if let step = stepNumber, let total = totalSteps {
                    Text("Step \(step) of \(total)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("HelpCoachmark.StepIndicator")
                }

                Text(resolved.heading)
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)

                Text(resolved.body)
                    .font(.body)
                    .fixedSize(horizontal: false, vertical: true)

                if onDismiss != nil || onNext != nil {
                    HStack {
                        Spacer()
                        if onDismiss != nil {
                            Button("Skip", role: .cancel, action: handleSkip)
                                .accessibilityIdentifier("HelpCoachmark.SkipButton")
                        }
                        if onNext != nil {
                            Button(action: handleNext) {
                                Text(resolved.ctaLabel ?? "Next")
                            }
                            .buttonStyle(.borderedProminent)
                            .accessibilityIdentifier("HelpCoachmark.NextButton")
                        }
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: 320)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isModal)
        } else {
            // Silent absence: render a tiny placeholder so SwiftUI has
            // something to present — in practice the parent gates `isShown`
            // on content availability so this path is rare.
            Color.clear
                .frame(width: 1, height: 1)
                .accessibilityHidden(true)
        }
    }

    // MARK: - Effective content resolution

    /// Resolves the payload to display: CMS wins, then the inline fallback.
    /// `nil` means "no content" — the popover renders an invisible placeholder.
    private var effectiveContent: CoachmarkContent? {
        if let loaded { return loaded }
        if let fallback {
            return CoachmarkContent(heading: fallback.heading, body: fallback.body, ctaLabel: nil)
        }
        return nil
    }

    // MARK: - Handlers

    private func handleSkip() {
        // Fire the dismissed event with the explicit action via the binding
        // flip — `handlePresentationChange` reads `shownAt` and emits the
        // analytics event with the measured duration.
        onDismiss?()
        isShown = false
    }

    private func handleNext() {
        onNext?()
        isShown = false
    }

    private func handlePresentationChange(_ newValue: Bool) {
        if newValue {
            shownAt = Date()
            HelpAnalytics.shared.coachmarkShown(surfaceKey: surfaceKey)
        } else if let start = shownAt {
            let viewedMs = Int(Date().timeIntervalSince(start) * 1000)
            HelpAnalytics.shared.coachmarkDismissed(
                surfaceKey: surfaceKey,
                viewedMs: max(0, viewedMs)
            )
            shownAt = nil
        }
    }

    // MARK: - CMS load

    /// Fetch coachmark payload from Sanity. Errors collapse to `nil` so the
    /// UI stays functional during CMS downtime (matches `SanityHelpClient`
    /// semantics, spec §13.4).
    private func loadContent() async {
        defer { hasLoaded = true }
        do {
            let content = try await SanityHelpClient.shared.fetchContent(
                surfaceKey: surfaceKey,
                contentType: HelpContentType.coachmark.rawValue,
                persona: persona
            )
            if case let .coachmark(payload) = content {
                loaded = payload
            }
        } catch {
            // Invalid surface key or unexpected throw — keep silent and let
            // the fallback (or empty popover) take over.
        }
    }
}

// MARK: - Previews

#if DEBUG
#Preview("Coachmark — with CTAs") {
    HelpCoachmark(
        surfaceKey: SurfaceKeys.IOSApp.Home.dailyGreeting,
        isShown: .constant(true),
        fallback: (
            heading: "Welcome to your Daily Room",
            body: "Patina curates one room of products each day, tailored to your taste."
        ),
        stepNumber: 1,
        totalSteps: 3,
        onDismiss: {},
        onNext: {}
    ) {
        Image(systemName: "house.fill")
            .font(.title)
            .padding(40)
    }
}

#Preview("Coachmark — no step indicator") {
    HelpCoachmark(
        surfaceKey: SurfaceKeys.IOSApp.Home.tierPill,
        isShown: .constant(true),
        fallback: (
            heading: "Maker Piece",
            body: "Each Maker Piece is handcrafted by a verified artisan in our network."
        )
    ) {
        Text("Tier pill")
            .padding()
    }
}
#endif

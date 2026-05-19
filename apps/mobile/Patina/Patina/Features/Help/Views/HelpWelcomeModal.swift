//
//  HelpWelcomeModal.swift
//  Patina
//
//  iOS SwiftUI native equivalent of the web `<WelcomeModal />` proactive-layer
//  first-signin orientation dialog (spec §4.8). The single allowed modal in
//  the help system — every other layer is reactive or ambient.
//
//  Sprint 3 · Stream G8 — Proactive layer iOS components.
//
//  iOS adaptation notes
//  --------------------
//  The web component is a Radix Dialog overlay; on iOS we use SwiftUI's
//  `.sheet` modifier with `.presentationDetents([.medium])` so the modal
//  occupies a comfortable middle-height card on iPhone. Sheets are the
//  canonical iOS HIG affordance for blocking-but-dismissable content. Swipe
//  down + escape key both dismiss the sheet (treated as "skip" for analytics).
//
//  Persona-aware content
//  ---------------------
//  Pulls a `WelcomeModalContent` payload from Sanity via
//  `SanityHelpClient.shared.fetchContent(surfaceKey:contentType:persona:)`
//  with `contentType == "welcomeModal"`. The persona-fallback chain in the
//  client resolves designer/consumer/maker/admin variants per spec §7.3.
//
//  Critical rules (spec §4.8)
//  --------------------------
//   * Exactly two CTAs: "Take the tour" (primary) and "Skip for now" (secondary)
//   * Backdrop tap + swipe-down dismiss → treated as skip
//   * No feature announcements, marketing copy, or upsells — orientation only
//   * Re-triggerable from Profile → "Show me around" (uses a different surface
//     key so analytics can distinguish first-signin vs replay cohorts)
//
//  Analytics (mirrors the web `helpEvents.welcomeModal` facade — spec §10.1)
//  ------------------------------------------------------------------------
//    - `HelpAnalytics.shared.welcomeModalShown(firstSignin:)` on open
//    - `HelpAnalytics.shared.welcomeModalAction(action:)` on CTA tap
//      Action is `.takeTour` for primary, `.jumpIn` for secondary (which
//      also covers backdrop/swipe-down dismiss).
//
//  Accessibility (spec §11)
//  ------------------------
//   * Dynamic Type: `.font(.title2.bold())` + `.font(.body)`
//   * VoiceOver: title announced as a header; both buttons have explicit
//     labels and traits.
//   * Reduced motion: SwiftUI sheet presentation respects the system
//     `prefers-reduced-motion` setting automatically.
//

import SwiftUI

/// SwiftUI sheet-presented welcome modal. The caller owns the binding and is
/// responsible for first-signin gating — re-triggering from "Show me around"
/// SHOULD use a different surface key (e.g. `.../welcome/replay`) so analytics
/// can distinguish the cohorts.
///
/// ```swift
/// HelpWelcomeModal(
///     surfaceKey: SurfaceKeys.IOSApp.Home.root,
///     isPresented: $showWelcome,
///     persona: .designer,
///     onStartTour: { tour.start() },
///     onSkip: { /* no-op */ }
/// )
/// ```
public struct HelpWelcomeModal: View {

    // MARK: - Inputs

    /// Surface key for the welcomeModal variant.
    private let surfaceKey: SurfaceKey

    /// Persona used by the Sanity client to resolve the content variant.
    private let persona: Persona?

    /// Inline fallback strings used when Sanity returns nothing.
    private let fallback: (
        title: String,
        body: String,
        primaryCta: String,
        secondaryCta: String?
    )?

    /// Primary CTA handler — fires before the sheet closes.
    private let onStartTour: (() -> Void)?

    /// Secondary CTA handler — fires before the sheet closes.
    private let onSkip: (() -> Void)?

    /// Two-way binding controlling sheet presentation. Owned by the caller.
    @Binding private var isPresented: Bool

    // MARK: - State

    /// CMS-loaded payload, cached for the lifetime of the view.
    @State private var content: WelcomeModalContent? = nil

    /// Last user action — used to decide whether a sheet dismiss should be
    /// attributed to an explicit CTA or to backdrop/swipe-down (skip).
    @State private var lastAction: HelpAnalytics.WelcomeModalAction? = nil

    /// True once the `shown` event has been emitted for the current open
    /// cycle. Reset when the sheet closes so a re-open emits a fresh event.
    @State private var didEmitShown: Bool = false

    // MARK: - Defaults

    /// Default fallback strings used when neither Sanity nor the `fallback`
    /// init parameter supplies copy. Mirrors the web component defaults.
    private static let defaultTitle = "Welcome to Patina"
    private static let defaultBody = "Take a brief tour to see how everything fits together, or jump in and explore."
    private static let defaultPrimaryCta = "Take the tour"
    private static let defaultSecondaryCta = "Skip for now"

    // MARK: - Init

    /// Creates a welcome-modal sheet.
    /// - Parameters:
    ///   - surfaceKey:    Surface key for the welcomeModal variant.
    ///   - isPresented:   Two-way binding controlling presentation.
    ///   - persona:       Persona for CMS lookup; `nil` walks the
    ///                    persona-agnostic fallback chain.
    ///   - fallback:      Inline fallback strings used on CMS miss.
    ///   - onStartTour:   Closure fired when the user taps the primary CTA.
    ///   - onSkip:        Closure fired when the user taps the secondary CTA
    ///                    OR dismisses via backdrop / swipe-down.
    public init(
        surfaceKey: SurfaceKey,
        isPresented: Binding<Bool>,
        persona: Persona? = nil,
        fallback: (title: String, body: String, primaryCta: String, secondaryCta: String?)? = nil,
        onStartTour: (() -> Void)? = nil,
        onSkip: (() -> Void)? = nil
    ) {
        self.surfaceKey = surfaceKey
        self._isPresented = isPresented
        self.persona = persona
        self.fallback = fallback
        self.onStartTour = onStartTour
        self.onSkip = onSkip
    }

    // MARK: - View

    public var body: some View {
        // The view itself renders nothing — it's a sheet host. Attach to any
        // parent screen and present by binding `isPresented`. Using
        // `Color.clear` lets us be added inline to a `VStack` or as a
        // background modifier without affecting layout.
        Color.clear
            .frame(width: 0, height: 0)
            .accessibilityHidden(true)
            .sheet(isPresented: $isPresented, onDismiss: handleSheetDismiss) {
                sheetContent
                    .presentationDetents([.medium])
                    .presentationDragIndicator(.visible)
                    .task { await onSheetAppear() }
            }
    }

    // MARK: - Sheet content

    private var sheetContent: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text(resolvedTitle)
                    .font(.title2.bold())
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("HelpWelcomeModal.Title")

                Text(resolvedBody)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("HelpWelcomeModal.Body")

                Spacer(minLength: 0)

                VStack(spacing: 12) {
                    Button(action: handleStartTour) {
                        Text(resolvedPrimaryCta)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .accessibilityIdentifier("HelpWelcomeModal.PrimaryButton")

                    Button(action: handleSkip) {
                        Text(resolvedSecondaryCta)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .accessibilityIdentifier("HelpWelcomeModal.SecondaryButton")
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: - Effective copy resolution

    private var resolvedTitle: String {
        content?.title ?? fallback?.title ?? Self.defaultTitle
    }

    private var resolvedBody: String {
        content?.body ?? fallback?.body ?? Self.defaultBody
    }

    private var resolvedPrimaryCta: String {
        if let label = content?.primaryCtaLabel, !label.isEmpty { return label }
        if let label = fallback?.primaryCta, !label.isEmpty { return label }
        return Self.defaultPrimaryCta
    }

    private var resolvedSecondaryCta: String {
        if let label = content?.secondaryCtaLabel, !label.isEmpty { return label }
        if let label = fallback?.secondaryCta, !label.isEmpty { return label }
        return Self.defaultSecondaryCta
    }

    // MARK: - Handlers

    private func handleStartTour() {
        lastAction = .takeTour
        HelpAnalytics.shared.welcomeModalAction(action: .takeTour)
        onStartTour?()
        isPresented = false
    }

    private func handleSkip() {
        lastAction = .jumpIn
        HelpAnalytics.shared.welcomeModalAction(action: .jumpIn)
        onSkip?()
        isPresented = false
    }

    /// Called when the sheet dismisses for any reason. If no explicit CTA
    /// action was recorded (backdrop tap / swipe-down), fire a `jumpIn`
    /// action so analytics record the dismissal.
    private func handleSheetDismiss() {
        if lastAction == nil {
            HelpAnalytics.shared.welcomeModalAction(action: .jumpIn)
            onSkip?()
        }
        // Reset so the next open cycle starts clean.
        lastAction = nil
        didEmitShown = false
    }

    /// Fires when the sheet body appears. Emits the `shown` event exactly
    /// once per open cycle, then kicks off the CMS load.
    private func onSheetAppear() async {
        if !didEmitShown {
            HelpAnalytics.shared.welcomeModalShown(firstSignin: true)
            didEmitShown = true
        }
        await loadContent()
    }

    // MARK: - CMS load

    /// Fetch the welcomeModal payload from Sanity. Errors collapse to `nil`
    /// so the UI stays functional during CMS downtime (matches
    /// `SanityHelpClient` semantics, spec §13.4).
    private func loadContent() async {
        do {
            let result = try await SanityHelpClient.shared.fetchContent(
                surfaceKey: surfaceKey,
                contentType: HelpContentType.welcomeModal.rawValue,
                persona: persona
            )
            if case let .welcomeModal(payload) = result {
                content = payload
            }
        } catch {
            // Invalid surface key or unexpected throw — keep silent and let
            // the fallback strings render.
        }
    }
}

// MARK: - Convenience modifier

public extension View {
    /// Attach the welcome modal sheet to any host screen. Mirrors the
    /// `helpPanel(isPresented:surfaceKey:)` modifier in `HelpPanelSheet`.
    ///
    /// Usage:
    /// ```swift
    /// HomeScreen()
    ///   .helpWelcomeModal(
    ///     isPresented: $showWelcome,
    ///     surfaceKey: SurfaceKeys.IOSApp.Home.root,
    ///     persona: currentPersona,
    ///     onStartTour: { tour.start() }
    ///   )
    /// ```
    func helpWelcomeModal(
        isPresented: Binding<Bool>,
        surfaceKey: SurfaceKey,
        persona: Persona? = nil,
        onStartTour: (() -> Void)? = nil,
        onSkip: (() -> Void)? = nil
    ) -> some View {
        self.background(
            HelpWelcomeModal(
                surfaceKey: surfaceKey,
                isPresented: isPresented,
                persona: persona,
                onStartTour: onStartTour,
                onSkip: onSkip
            )
        )
    }
}

// MARK: - Previews

#if DEBUG
#Preview("Welcome modal — default") {
    Color.clear
        .helpWelcomeModal(
            isPresented: .constant(true),
            surfaceKey: SurfaceKeys.IOSApp.Home.root,
            persona: .consumer,
            onStartTour: {},
            onSkip: {}
        )
}
#endif

//
//  CompanionOverlay.swift
//  Patina
//
//  The Companion — A living Strata Mark that replaces the tab bar
//  5 states: Resting, Nudging, Expanded, Journey Mode, Minimal
//

import SwiftUI
import SwiftData
import Supabase

// MARK: - Companion Display State

/// The visual display state of The Companion (separate from internal CompanionState)
enum CompanionDisplayMode: Equatable {
    case resting
    case nudging(CompanionNudge)
    case expanded
    case journeyMode(progress: Double, step: Int, totalSteps: Int, stepLabel: String)
    case minimal
    case hidden
}

/// The Companion — Floating Strata Mark that serves as the app's primary navigation
public struct CompanionOverlay: View {
    @Environment(\.appCoordinator) private var coordinator
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @State private var viewModel = CompanionViewModel()
    @State private var state: CompanionState = .button
    @State private var voiceInputState: VoiceInputState = .idle
    @State private var contentOpacity: Double = 0
    @State private var showingAuthPanel = false
    @State private var isAuthenticated = AuthService.shared.isAuthenticated
    @State private var panelOpenTime: Date?
    /// Number of action-row taps within the current panel session. Reset on
    /// expand, incremented per tap, reported on close (replacing the old
    /// hardcoded `interactionCount: 0`).
    @State private var panelInteractionCount: Int = 0
    /// Drives the contextual help-panel sheet attached to the Companion
    /// surface. Toggled by the `?` button in the expanded panel header.
    @State private var isHelpPanelPresented: Bool = false

    /// One-shot first-launch coachmark (PT-6-9). Shown over the panel the
    /// first time the user expands the Companion, then persisted as seen so
    /// it never reappears. Backed by UserDefaults so it survives relaunches
    /// even before a Supabase session exists.
    @AppStorage("patina.companion.coachmarkSeen") private var hasSeenCompanionCoachmark: Bool = false
    @State private var showCoachmark: Bool = false

    /// Coaching state machine for the "living companion" system. MUST be built
    /// in this `@State` initializer (never lazily later): the model snapshots
    /// the FirstLaunchTour state at init, and its intro-sequencing gate is only
    /// sound if that snapshot is taken before DailyRoomView's tour `.task`
    /// writes `launched` this process. Overlay init during ContentView body
    /// evaluation guarantees that ordering.
    @State private var coaching = CompanionCoachingModel()

    /// Wake-up choreography phase driven forward by `runWakeChoreography()`.
    @State private var wakePhase: WakePhase = .awake
    /// Whether the self-intro / reinforcement bubble occupies the mark's slot.
    @State private var introVisible = false
    /// When the presented intro became visible — the basis for `viewedMs`.
    @State private var introShownAt: Date?
    /// Trigger of the in-flight or presented intro (`"first_arrival"` /
    /// `"second_session"`), so an interruption records it correctly.
    @State private var introTrigger: String?
    /// The staged wake-up choreography, cancellable on surface change.
    @State private var introTask: Task<Void, Never>?
    /// One-shot spring bounce applied to the mark during the wake `.pulse` beat.
    @State private var markBounceScale: CGFloat = 1.0

    /// Whether the transient first-nav acknowledgement bubble is showing.
    @State private var navAckVisible = false
    /// Auto-dismiss timer for the first-nav ack, cancellable on surface change.
    @State private var navAckTask: Task<Void, Never>?
    /// The screen the ack was presented on. Retirement is keyed to this value
    /// rather than "any screen change" — `handleNavigate`'s continuation calls
    /// `coordinator.navigate(to:)` (which sets `currentScreen` synchronously)
    /// and then `presentFirstNavAck()` on the same main-actor continuation, so
    /// by the time SwiftUI's `.onChange(of: coordinator.currentScreen)` fires
    /// for that navigation, this already equals the destination — the ack
    /// must survive that change, not be torn down by it (the fixed defect: a
    /// blanket dismiss-on-any-screen-change killed the ack within one frame).
    @State private var navAckScreen: AppRoute?

    /// Computed display mode based on current screen context
    private var displayMode: CompanionDisplayMode {
        // Hidden during certain flows
        if state == .hidden { return .hidden }

        // If expanded, show expanded
        if state.isExpanded { return .expanded }

        let screen = coordinator.currentScreen

        // Journey mode during the Quiet Conversation scan walk. The flow
        // host drives `walkProgress`; when present, surface the journey UI.
        if case .scanFlow = screen, let progress = coordinator.companionContext.walkProgress {
            let step = Int(progress * 4) + 1
            let labels = ["Scanning room", "Capturing walls", "Finding details", "Almost done"]
            let label = labels[min(step - 1, labels.count - 1)]
            return .journeyMode(progress: Double(progress), step: step, totalSteps: 4, stepLabel: label)
        }

        // Minimal in AR / immersive views
        if case .pieceDetail = screen { return .minimal }
        if case .arPlacement = screen { return .minimal }

        // Minimal during pre-scan (it has its own UI but the Companion stays
        // reachable so the user never loses orientation — PT-6-11).
        if case .preScanChecklist = screen { return .minimal }

        // Minimal during quiz (quiz manages its own flow) — keep the Companion
        // present but unobtrusive instead of disappearing entirely (PT-6-11).
        if case .styleQuiz = screen { return .minimal }
        if case .styleResult = screen { return .resting }

        // Nudging based on context provider. Derived fresh from
        // `coordinator.currentScreen` on every render — never cached — so a
        // nudge cannot outlive the screen that produced it (R11).
        if let nudge = CompanionActionProvider.nudge(for: screen, context: coordinator.companionContext) {
            return .nudging(nudge)
        }

        return .resting
    }

    /// The coordinator's companion context, enriched with the promoted design
    /// request and the engagement tier (if resolved). Read inside `body`, so
    /// SwiftUI tracks the `@Observable` `DesignRequestStatusService` /
    /// `BadgeCountService` behind them and re-renders the panel when a refresh
    /// lands — keeping `CompanionActionProvider` a pure function of its inputs
    /// (no polling, no coordinator-write side channel).
    ///
    /// An unresolved tier is left `nil` rather than defaulted: the row builders
    /// read `nil` as not-yet-engaged, so a Studio door never opens on a guess.
    ///
    /// The style profile and the room / saved-item counts are read from their
    /// live stores here for the same reason (U42): nothing writes them into the
    /// coordinator. `AppCoordinator.updateRoomCount(_:)` and
    /// `updateTableItemCount(_:)` have no callers anywhere in the app, so those
    /// fields sit frozen at 0 and every panel open rendered the brand-new-user
    /// menu — "Style quiz · Discover your style" and "Your recommendations ·
    /// Take the quiz first" — no matter what the user had already done.
    ///
    /// Evaluated only while the panel is expanded (see `expandedView`, which
    /// binds it once), so these are per-open reads, not per-frame ones.
    private var enrichedContext: CompanionContext {
        var context = coordinator.companionContext
        if let promoted = DesignRequestStatusService.shared.promotedRequest {
            context.activeDesignRequest = ActiveDesignRequestContext(
                leadId: promoted.leadId.uuidString,
                statusLabel: promoted.stage.badgeTitle
            )
        }
        if case .known(let tier) = EngagementTier.currentState {
            context.engagementTier = tier
        }
        context.hasStyleProfile = StyleProfileStore.shared.hasCompletedProfile

        let store = PersistenceController.shared.container.mainContext
        if let rooms = try? store.fetchCount(FetchDescriptor<RoomModel>()) {
            context.roomCount = rooms
        }
        if let saved = try? store.fetchCount(FetchDescriptor<TableItemModel>()) {
            context.tableItemCount = saved
        }
        return context
    }

    public init() {}

    public var body: some View {
        // PT-6-8: the GeometryReader that existed only to read
        // `safeAreaInsets.bottom` (and add it to every dock offset) is gone.
        // `.safeAreaPadding(.bottom, N)` insets by N *plus* the safe area,
        // so the home-indicator clearance comes for free without measuring
        // the proxy.
        ZStack {
            // Backdrop when expanded
            if state.isExpanded {
                Color.black.opacity(0.3)
                    .background(.ultraThinMaterial.opacity(0.5))
                    .ignoresSafeArea()
                    .allowsHitTesting(true)
                    .onTapGesture { collapseToButton() }
            }

            // Dock zone gradient — gives the companion visual breathing room
            if shouldShowDockGradient {
                companionDockGradient
                    .transition(.opacity)
            }

            // Render based on display mode
            switch displayMode {
            case .hidden:
                EmptyView()

            case .resting:
                restingView
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                    .safeAreaPadding(.bottom, 28)

            case .nudging(let nudge):
                nudgingView(nudge: nudge)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                    .safeAreaPadding(.bottom, 28)

            case .expanded:
                expandedView
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                    .safeAreaPadding(.bottom, 24)

            case .journeyMode(let progress, let step, let totalSteps, let stepLabel):
                journeyModeView(progress: progress, step: step, totalSteps: totalSteps, stepLabel: stepLabel)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                    .safeAreaPadding(.bottom, 28)

            case .minimal:
                minimalView
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                    .safeAreaPadding(.bottom, 28)
                    .padding(.trailing, 20)
            }
        }
        .animation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.85), value: displayMode)
        // PT-5-10: expand/collapse haptics are now declarative, keyed on the
        // expanded state. Expanding fires the soft companion pulse; collapsing
        // fires a light impact — matching the prior imperative calls in
        // `expandToPanel()` / `collapseToButton()`.
        .sensoryFeedback(trigger: state.isExpanded) { _, expanded in
            expanded
                ? .impact(flexibility: .soft, intensity: 0.5)
                : .impact(weight: .light)
        }
        .onChange(of: coordinator.companionContext) { _, newContext in
            viewModel.updateContext(newContext)
        }
        .onChange(of: coordinator.currentScreen) { _, newScreen in
            viewModel.updateContext(coordinator.companionContext)
            // Leaving the intro's anchoring surface retires the intro.
            syncIntroToSurface()
            // Retire the first-nav ack only when the user navigated AWAY from
            // the screen it was presented on — NOT on every screen change.
            // `presentFirstNavAck()` sets `navAckScreen` to the destination
            // before this fires (see its declaration), so the navigation that
            // produced the ack leaves `navAckScreen == newScreen` and is a
            // no-op here; a *subsequent* navigation makes them differ and
            // dismisses it. A blanket `dismissNavAck()` on every change would
            // tear the ack down within the same frame it appears.
            if navAckScreen != newScreen {
                dismissNavAck()
            }
        }
        // A display-mode change that leaves resting/nudging (e.g. the panel
        // expands, or the surface goes minimal) also retires the intro. Kept
        // separate from `displayMode`'s root `.animation` — dismissal is driven
        // by explicit `withAnimation` inside `dismissIntro`, not this key.
        .onChange(of: displayMode) { _, _ in
            syncIntroToSurface()
        }
        .onAppear {
            isAuthenticated = AuthService.shared.isAuthenticated
            viewModel.updateContext(coordinator.companionContext)
            coaching.recordMainSessionStart()
        }
        // Wake-up self-intro: gated per screen so it re-evaluates whenever the
        // surface changes, and cancels cleanly when the user leaves.
        .task(id: coordinator.currentScreen) {
            await maybePresentIntro()
        }
        .task {
            for await (event, _) in supabase.auth.authStateChanges {
                await MainActor.run {
                    let newAuthState = AuthService.shared.isAuthenticated
                    if newAuthState != isAuthenticated {
                        isAuthenticated = newAuthState
                    }
                }
            }
        }
        // Contextual help panel — surfaces every Sanity article whose
        // surfaceKey is `ios-app/companion` or a child of it. Reachable from
        // the `?` button in the expanded panel header.
        .helpPanel(
            isPresented: $isHelpPanelPresented,
            surfaceKey: SurfaceKeys.IOSApp.Companion.root
        )
    }

    // MARK: - Dock Zone Gradient

    /// Whether to show the dock zone gradient behind the companion
    private var shouldShowDockGradient: Bool {
        if reduceTransparency { return false }

        switch displayMode {
        case .resting, .nudging, .journeyMode:
            return true
        case .expanded, .minimal, .hidden:
            return false
        }
    }

    /// Subtle gradient fade that gives the companion button visual breathing
    /// room. PT-6-8: drops the explicit `safeAreaBottom` parameter — the
    /// gradient bleeds to the screen edge via `.ignoresSafeArea`, which is
    /// what we want for the fade, so no inset measurement is needed.
    private var companionDockGradient: some View {
        // Wave 1 E.1: the gradient's default tint is static softCream, which
        // rendered a near-white band on every dark screen. Tint with the
        // dynamic canvas color instead — the scrim's whole job is to fade
        // content into the background, so it must track light/dark with it.
        PatinaGradients.companionDock(warmTint: PatinaColors.Background.primary)
            .frame(height: 140)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            .allowsHitTesting(false)
            .ignoresSafeArea(edges: .bottom)
    }

    // MARK: - State 1: Resting

    private var restingView: some View {
        companionMarkStack(nudge: nil)
    }

    // MARK: - State 2: Nudging

    private func nudgingView(nudge: CompanionNudge) -> some View {
        companionMarkStack(nudge: nudge)
    }

    /// The mark plus the slot above it. The slot holds — in priority order —
    /// the wake-up self-intro, the transient first-nav ack, or the nudge pill.
    /// The intro/ack win the slot over the pill (the pill is also suppressed
    /// while the wake choreography is mid-flight). VoiceOver reads the bubble
    /// before the mark.
    ///
    /// Below the mark, a standing "Next steps" caption names what the mark is
    /// for until the user has learned it (U34) — this replaces the timed
    /// escalation that used to interrupt a "stuck" user with a pop-up offer.
    /// It retires at `.learned`, and is hidden from VoiceOver (the mark button
    /// itself already carries the label + hint) and from hit testing (a caption
    /// that swallowed taps would sit right under the primary affordance).
    @ViewBuilder
    private func companionMarkStack(nudge: CompanionNudge?) -> some View {
        VStack(spacing: 0) {
            if introVisible {
                introBubbleView
                    .padding(.bottom, 12)
            } else if navAckVisible {
                navAckBubbleView
                    .padding(.bottom, 12)
            } else if let nudge, introTask == nil {
                nudgePill(nudge: nudge)
            }

            companionMarkButton

            if coaching.phase != .learned {
                Text("Next steps")
                    .font(PatinaTypography.monoSmall)
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .padding(.top, 6)
                    .accessibilityHidden(true)
                    .allowsHitTesting(false)
            }
        }
    }

    /// The suggested-action pill shown in nudging mode. A real affordance, not
    /// décor (R01/R02): tapping it performs the suggested action; the mark
    /// below opens the panel.
    private func nudgePill(nudge: CompanionNudge) -> some View {
        Button {
            CompanionAnalytics.shared.trackNudgeTapped(
                screen: coordinator.currentScreen.displayName,
                label: nudge.label
            )
            handleNavigate(to: nudge.route)
        } label: {
            Text(nudge.label)
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.inverse)
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(PatinaColors.Interactive.active)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .patinaShadow(PatinaShadows.md)
                // 44pt hit target without inflating the visual pill.
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(nudge.label)
        .accessibilityIdentifier("companion.nudge")
    }

    /// The one-time wake-up self-introduction. "Show me" (and tapping the mark)
    /// dismiss it and open the panel; "Later" dismisses it and lets the mark
    /// keep pulsing.
    private var introBubbleView: some View {
        CompanionIntroBubble(
            onShowMe: { expandToPanel() },
            onLater: { dismissIntro(action: "later") }
        )
        .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
        // VoiceOver reads the bubble before the mark below it.
        .accessibilitySortPriority(1)
    }

    /// The transient first-nav acknowledgement, reusing the compact bubble.
    private var navAckBubbleView: some View {
        CompanionIntroBubble(
            compactText: "That's the way. I'm always down here when you need your next step."
        )
        .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
        .accessibilitySortPriority(1)
    }

    // MARK: - State 3: Expanded

    // PT-6-8: the unused `geometry: GeometryProxy` parameter is dropped now
    // that the body no longer threads a GeometryReader proxy through.
    private var expandedView: some View {
        VStack(spacing: 0) {
            // Panel
            VStack(spacing: 0) {
                // One enrichment per panel open, shared by the title and the
                // rows — they must agree, and the enrichment hits the stores.
                let context = enrichedContext

                // Header
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(CompanionActionProvider.panelTitle(
                        for: coordinator.currentScreen,
                        context: context
                    ))
                        .font(.custom("PlayfairDisplay-Italic", size: 16, relativeTo: .callout))
                        .foregroundStyle(PatinaColors.offWhite)

                    // Contextual help: explains the Companion concept —
                    // a context-aware action menu that replaces the
                    // tab bar with whatever you're most likely to want next.
                    HelpInfoIcon(
                        surfaceKey: SurfaceKeys.IOSApp.Companion.whatNext,
                        fallback: "The Companion shows the actions Patina thinks you'll want next based on the screen you're on. It replaces the tab bar — your next step is always one tap away.",
                        size: 12
                    )

                    Spacer()

                    // `?` help-panel trigger — opens a sheet listing all
                    // Companion-related articles. Placed before close so the
                    // user can read up before dismissing.
                    Button {
                        // Collapse the panel first so the sheet has the
                        // foreground; deferring the sheet ensures the
                        // animation doesn't fight the dismissal.
                        collapseToButton()
                        Task {
                            try? await Task.sleep(for: .seconds(0.3))
                            isHelpPanelPresented = true
                        }
                    } label: {
                        Circle()
                            .fill(Color.white.opacity(0.1))
                            .frame(width: 28, height: 28)
                            .overlay(
                                Image(systemName: "questionmark")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(PatinaColors.pearl)
                            )
                    }
                    .accessibilityLabel("Help")
                    .accessibilityHint("Opens the help panel for the Companion.")
                    .accessibilityIdentifier("companion.help")

                    Button { collapseToButton() } label: {
                        Circle()
                            .fill(Color.white.opacity(0.1))
                            .frame(width: 28, height: 28)
                            .overlay(
                                Image(systemName: "xmark")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(PatinaColors.pearl)
                            )
                            .contentShape(Rectangle())
                    }
                    .accessibilityLabel("Close")
                    .accessibilityHint("Collapses the Companion panel.")
                    .accessibilityIdentifier("companion.close")
                }
                .padding(.bottom, 16)

                // Dynamic actions from context provider. Read auth state
                // directly from the @Observable AuthService rather than the
                // @State copy below — the @State snapshots auth on View init,
                // which is racy on cold launch where supabase-swift restores
                // the session asynchronously and the `.task` watcher can miss
                // the `.initialSession` event. The @Observable read here is
                // tracked by SwiftUI and re-renders when auth state flips.
                VStack(spacing: 6) {
                    let actions = CompanionActionProvider.actions(
                        for: coordinator.currentScreen,
                        context: context,
                        isAuthenticated: AuthService.shared.isAuthenticated
                    )
                    ForEach(actions) { item in
                        companionAction(
                            icon: item.icon,
                            label: item.label,
                            hint: item.hint,
                            isSuggested: item.isSuggested
                        ) {
                            panelInteractionCount += 1
                            CompanionAnalytics.shared.trackQuickActionTapped(
                                actionId: item.analyticsId,
                                actionTitle: item.label,
                                screen: coordinator.currentScreen.displayName
                            )
                            if let route = item.route {
                                handleNavigate(to: route)
                            } else if let special = item.specialAction {
                                collapseToButton()
                                // A special action is a companion navigation too
                                // (it accrues toward graduation and can trigger
                                // the one-shot first-nav ack).
                                let navOutcome = coaching.recordCompanionNavigation()
                                Task {
                                    try? await Task.sleep(for: .seconds(0.3))
                                    switch special {
                                    case .openQRScanner:
                                        coordinator.presentedSheet = .qr
                                    case .openSettings:
                                        coordinator.presentedSheet = .settings
                                    case .openAuth:
                                        coordinator.presentedSheet = .auth
                                    case .openDesignServices(let roomId):
                                        coordinator.presentedSheet = .designServices(roomId: roomId, preselectedScanIds: [])
                                    }
                                    if navOutcome == .showFirstNavAck {
                                        presentFirstNavAck()
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .padding(20)
            // Deliberately dark Companion panel — charcoal in both modes
            // (subtle elevation over the graphite canvas in dark).
            .background(PatinaColors.Background.dark)
            .clipShape(RoundedRectangle(cornerRadius: 24))
            .patinaShadow(PatinaShadows.companion)
            // The panel consumes its own touches (U41): a tap on panel chrome
            // must not reach the dimmed backdrop behind it, whose tap gesture
            // collapses the Companion. Action rows and header buttons are
            // hit-tested first, so they still win.
            .contentShape(RoundedRectangle(cornerRadius: 24))
            .onTapGesture {}
            .accessibilityIdentifier("companion.panel")
            .overlay(alignment: .top) {
                if showCoachmark {
                    companionCoachmark
                        .offset(y: -16)
                        .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
                }
            }
        }
        .padding(.horizontal, 24)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    // MARK: - First-Launch Coachmark (PT-6-9)

    private var companionCoachmark: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("These are your next steps. They change with every room you're in — tap one and I'll take you there.")
                .font(.custom("PlayfairDisplay-Italic", size: 15, relativeTo: .subheadline))
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)

            Button {
                dismissCoachmark()
            } label: {
                Text("Got it")
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.offWhite)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(PatinaColors.clay)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .frame(maxWidth: 280, alignment: .leading)
        .background(PatinaColors.Background.primary)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .patinaShadow(PatinaShadows.md)
        .padding(.horizontal, 12)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("These are your next steps. They change with every room you're in — tap one and I'll take you there.")
        .accessibilityAddTraits(.isModal)
    }

    // MARK: - State 4: Journey Mode

    private func journeyModeView(progress: Double, step: Int, totalSteps: Int, stepLabel: String) -> some View {
        HStack(spacing: 12) {
            // Progress ring
            ZStack {
                Circle()
                    .stroke(Color.white.opacity(0.15), lineWidth: 2.5)
                    .frame(width: 40, height: 40)

                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(PatinaColors.clay, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                    .frame(width: 40, height: 40)
                    .rotationEffect(.degrees(-90))

                Text("\(Int(progress * 100))%")
                    .font(.custom("PlayfairDisplay-Medium", size: 13, relativeTo: .footnote))
                    .foregroundStyle(PatinaColors.offWhite)
            }
            // VoiceOver: surface the scan progress as a spoken value.
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Scan progress")
            .accessibilityValue("\(Int(progress * 100)) percent")

            // Text
            VStack(alignment: .leading, spacing: 1) {
                Text(stepLabel)
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.offWhite)

                MonoLabel(text: "Step \(step) of \(totalSteps)", size: PatinaTypography.monoSmall, color: PatinaColors.clay)
            }

            Spacer()

            // Step dots
            HStack(spacing: 4) {
                ForEach(1...totalSteps, id: \.self) { i in
                    Circle()
                        .fill(dotColor(step: i, currentStep: step))
                        .frame(width: 6, height: 6)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        // Deliberately dark journey pill — charcoal in both modes.
        .background(PatinaColors.Background.dark)
        .clipShape(Capsule())
        .patinaShadow(PatinaShadows.companion)
        .padding(.horizontal, 40)
    }

    // MARK: - State 5: Minimal

    private var minimalView: some View {
        Button { expandToPanel() } label: {
            ZStack {
                // PT-5-7: Liquid Glass minimal pill. A charcoal tint keeps
                // the Strata mark legible while letting the glass pick up
                // the camera / content behind it, replacing the prior
                // charcoal-fill-over-`.ultraThinMaterial` stack.
                // `CompanionOverlay` is a `public` View, so the compiler
                // infers the module's API availability floor here (below the
                // iOS-26 `glassEffect`); the `#available` guard satisfies it
                // while still always taking the glass path on our 26.2 target.
                Color.clear
                    .frame(width: 44, height: 44)
                    .companionGlassCircle()

                VStack(spacing: 2.5) {
                    Capsule().fill(PatinaColors.offWhite).frame(width: 16, height: 1.5)
                    Capsule().fill(PatinaColors.offWhite.opacity(0.7)).frame(width: 12, height: 1.5)
                    Capsule().fill(PatinaColors.offWhite.opacity(0.4)).frame(width: 9, height: 1.5)
                }
            }
            .patinaShadow(PatinaShadows.md)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Patina companion — menu")
        .accessibilityHint("Opens quick actions for this screen.")
        .accessibilityIdentifier("companion.bubble")
    }

    // MARK: - Shared: Companion Mark (Resting circle with strata lines)

    /// The tappable mark. A real `Button` (not a tap gesture) so VoiceOver
    /// sees the companion as a labeled button instead of an anonymous
    /// "Other" node (R21).
    private var companionMarkButton: some View {
        Button { expandToPanel() } label: {
            // The living mark (Task 2): attention reflects the coaching phase;
            // `wakePhase` is driven by the wake-up choreography. The one-shot
            // `.pulse`-beat bounce is applied here (reduce-motion holds at 1.0;
            // the whole choreography is skipped under reduce motion anyway).
            CompanionMarkView(attention: coaching.markAttention, wakePhase: wakePhase)
                .scaleEffect(reduceMotion ? 1.0 : markBounceScale)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Patina companion — menu")
        .accessibilityHint("Opens quick actions for this screen.")
        .accessibilityIdentifier("companion.bubble")
    }

    // MARK: - Companion Action Row

    private func companionAction(icon: String, label: String, hint: String, isSuggested: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                // Icon
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(isSuggested ? PatinaColors.clay : Color.white.opacity(0.08))
                        .frame(width: 36, height: 36)
                    Image(systemName: icon)
                        .font(.system(size: 16))
                        .foregroundStyle(isSuggested ? PatinaColors.offWhite : PatinaColors.pearl)
                }

                // Text
                VStack(alignment: .leading, spacing: 1) {
                    Text(label)
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.offWhite)
                    Text(hint)
                        .font(PatinaTypography.monoSmall)
                        .foregroundStyle(PatinaColors.Text.interactive)
                        .tracking(0.3)
                        .textCase(.uppercase)
                }

                Spacer()

                Text("\u{203A}")
                    .font(.system(size: 14))
                    .foregroundStyle(PatinaColors.agedOak)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(isSuggested ? PatinaColors.clay.opacity(0.15) : Color.white.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .accessibilityIdentifier("companion.action.\(icon)")
        .buttonStyle(.plain)
    }

    // MARK: - Actions

    private func expandToPanel() {
        // The wake-up intro and first-nav ack live in the mark's slot; opening
        // the panel retires them. Tapping through the intro (mark or "Show me")
        // counts as accepting it — record "expanded".
        if introVisible {
            dismissIntro(action: "expanded")
        }
        dismissNavAck()

        // PT-5-10: the soft pulse is fired declaratively via
        // `.sensoryFeedback(trigger: state.isExpanded)` below.
        CompanionAnalytics.shared.trackFABTapped(screen: coordinator.currentScreen.displayName)

        withAnimation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.85)) {
            state = .expanded
        }
        withAnimation(reduceMotion ? nil : .easeIn(duration: 0.2).delay(0.15)) {
            contentOpacity = 1
        }
        coordinator.isCompanionExpanded = true
        panelOpenTime = Date()
        panelInteractionCount = 0

        // Coaching: the first panel expansion graduates `.new` → `.learning`.
        coaching.recordPanelExpanded()

        // PT-6-9 (re-gated): first time the Companion is expanded, surface the
        // one-shot next-steps coachmark. Now also gated on the coaching model
        // so learned and legacy-migrated users never see it; showing it counts
        // as a reinforcement.
        if !hasSeenCompanionCoachmark && coaching.shouldShowPanelCoachmark {
            coaching.recordReinforcementShown(kind: "panel_coachmark")
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3).delay(0.35)) {
                showCoachmark = true
            }
        }
    }

    private func dismissCoachmark() {
        hasSeenCompanionCoachmark = true
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.25)) {
            showCoachmark = false
        }
    }

    private func collapseToButton() {
        // PT-5-10: the light-impact collapse haptic is fired declaratively
        // via `.sensoryFeedback(trigger: state.isExpanded)` below.
        let dwellTime = panelOpenTime.map { Date().timeIntervalSince($0) } ?? 0
        CompanionAnalytics.shared.trackPanelClosed(
            screen: coordinator.currentScreen.displayName,
            interactionCount: panelInteractionCount,
            dwellTime: dwellTime
        )
        panelOpenTime = nil

        // Treat collapsing as acknowledging the coachmark so it doesn't
        // reappear next expansion (PT-6-9).
        if showCoachmark { dismissCoachmark() }

        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.1)) { contentOpacity = 0 }
        withAnimation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.85).delay(0.05)) {
            state = .button
        }
        coordinator.isCompanionExpanded = false
    }

    private func handleNavigate(to route: AppRoute) {
        collapseToButton()
        // Every companion navigation accrues toward graduation and can trigger
        // the one-shot first-nav ack once it settles.
        let navOutcome = coaching.recordCompanionNavigation()
        Task {
            try? await Task.sleep(for: .seconds(0.3))
            coordinator.navigate(to: route)
            if navOutcome == .showFirstNavAck {
                presentFirstNavAck()
            }
        }
    }

    private func dotColor(step: Int, currentStep: Int) -> Color {
        if step < currentStep { return PatinaColors.clay }
        if step == currentStep { return PatinaColors.offWhite }
        return Color.white.opacity(0.2)
    }

    // MARK: - Coaching: wake-up intro

    /// Whether `displayMode` is one that hosts the resting mark's bubble slot.
    private var displayModeAllowsIntro: Bool {
        switch displayMode {
        case .resting, .nudging: return true
        default: return false
        }
    }

    /// All wake-up-intro preconditions except the tour gate. Re-checked before
    /// and after every async hop in `maybePresentIntro`.
    private var introEligible: Bool {
        coaching.canShowIntro
            && coordinator.currentScreen == .heroFrame
            && displayModeAllowsIntro
            && !state.isExpanded
            && !introVisible
            && introTask == nil
    }

    /// Entry point (per-screen `.task`): gate on the first-launch tour, then
    /// present the self-intro. First arrival runs the staged wake choreography;
    /// re-shows (and the reduce-motion path) present the bubble with a single
    /// pulse and no choreography.
    private func maybePresentIntro() async {
        guard introEligible else { return }
        guard await coaching.introGate() else { return }
        // The screen may have changed while the gate resolved.
        guard introEligible else { return }
        do { try await Task.sleep(for: .seconds(0.8)) } catch { return }
        guard introEligible else { return }

        // Second appearance re-shows quietly; first appearance is the full wake.
        let trigger = coaching.introShownCount == 1 ? "second_session" : "first_arrival"
        introTrigger = trigger

        if trigger == "first_arrival", !reduceMotion {
            introTask = Task { await runWakeChoreography(trigger: trigger) }
        } else {
            // Reduce-motion first arrival and every re-show: bubble + a single
            // pulse, no choreography.
            HapticManager.shared.companionPulse()
            presentIntroBubble(trigger: trigger)
        }
    }

    /// The one-time wake-up choreography (motion path only — reduce motion
    /// presents the bubble directly). Each sleep throws on cancellation; if a
    /// surface change cancels us mid-flight, we bail without presenting and
    /// `interruptWakeChoreography()` settles the mark and records the
    /// auto-dismissal.
    private func runWakeChoreography(trigger: String) async {
        do {
            wakePhase = .dormant                                   // 1 — snap, no animation
            try await Task.sleep(for: .seconds(0.15))

            withAnimation(.patinaHero) { wakePhase = .rising }     // 2
            try await Task.sleep(for: .seconds(0.45))

            wakePhase = .drawing                                   // 3 — mark staggers the draw-in
            try await Task.sleep(for: .seconds(0.55))

            wakePhase = .pulse                                     // 4 — burst + haptic + bounce
            HapticManager.shared.companionPulse()
            withAnimation(.spring(response: 0.35, dampingFraction: 0.6)) { markBounceScale = 1.1 }
            try await Task.sleep(for: .seconds(0.18))
            withAnimation(.spring(response: 0.35, dampingFraction: 0.6)) { markBounceScale = 1.0 }
            try await Task.sleep(for: .seconds(0.32))

            wakePhase = .awake                                     // 5 — settle, then present
            try await Task.sleep(for: .seconds(0.3))
        } catch {
            return   // cancelled — interruption handler settles + records
        }
        presentIntroBubble(trigger: trigger)
    }

    /// Present the intro bubble and record it shown exactly once. Clears
    /// `introTask` so the intro is now "presented" rather than "in-flight".
    private func presentIntroBubble(trigger: String) {
        introTask = nil
        coaching.recordIntroShown(trigger: trigger)
        introShownAt = Date()
        withAnimation(reduceMotion ? nil : .patinaHero) { introVisible = true }
    }

    /// Dismiss a *presented* intro along `action` (`"expanded"` / `"later"` /
    /// `"auto"`), recording the dismissal once with `viewedMs` measured from
    /// when it appeared. Idempotent — guarded on `introVisible`.
    private func dismissIntro(action: String) {
        guard introVisible else { return }
        let viewedMs = introShownAt.map { Int(Date().timeIntervalSince($0) * 1000) } ?? 0
        coaching.recordIntroDismissed(action: action, viewedMs: viewedMs)
        introShownAt = nil
        introTrigger = nil
        withAnimation(reduceMotion ? nil : .patinaHero) { introVisible = false }
    }

    /// Cancel an in-flight wake choreography and snap the mark back to `.awake`
    /// (never leave it half-drawn). An interrupted attempt still counts as
    /// shown, then auto-dismissed.
    private func interruptWakeChoreography() {
        introTask?.cancel()
        introTask = nil
        wakePhase = .awake
        markBounceScale = 1.0
        if let trigger = introTrigger {
            coaching.recordIntroShown(trigger: trigger)
            coaching.recordIntroDismissed(action: "auto", viewedMs: 0)
        }
        introTrigger = nil
        introShownAt = nil
    }

    /// Retire the intro when the surface it anchors to is no longer valid. The
    /// wake intro is heroFrame-bound and is now the only intro there is, so the
    /// surface test is unconditional. Resting↔nudging flips keep the intro.
    private func syncIntroToSurface() {
        let onValidSurface = displayModeAllowsIntro && coordinator.currentScreen == .heroFrame
        guard !onValidSurface else { return }

        if introTask != nil {
            interruptWakeChoreography()
        } else if introVisible {
            dismissIntro(action: "auto")
        }
    }

    // MARK: - Coaching: first-nav ack

    /// After a companion navigation settles, acknowledge it once on the
    /// resting mark (skipped on minimal / non-resting destinations, and never
    /// colliding with a visible intro). Auto-dismisses after 2.5s.
    private func presentFirstNavAck() {
        guard displayModeAllowsIntro, !introVisible, introTask == nil else { return }
        coaching.recordReinforcementShown(kind: "first_nav_ack")
        // Key retirement to the screen we're presenting on. On the route path
        // this is already the destination — `handleNavigate`'s continuation
        // calls `coordinator.navigate(to:)` before this, on the same
        // main-actor hop. On the special-action path `currentScreen` hasn't
        // moved (the special action opens a sheet instead), so this is just
        // the screen the user was already on.
        navAckScreen = coordinator.currentScreen
        withAnimation(reduceMotion ? nil : .patinaHero) { navAckVisible = true }

        navAckTask?.cancel()
        navAckTask = Task {
            do { try await Task.sleep(for: .seconds(2.5)) } catch { return }
            dismissNavAck()
        }
    }

    /// Hide the first-nav ack, cancel its timer, and clear the screen it was
    /// keyed to. Idempotent. Covers all three retirement paths: timer expiry
    /// (above), navigating away from `navAckScreen` (the `.onChange` above),
    /// and explicit cancellation (e.g. `expandToPanel()`).
    private func dismissNavAck() {
        navAckTask?.cancel()
        navAckTask = nil
        navAckScreen = nil
        guard navAckVisible else { return }
        withAnimation(reduceMotion ? nil : .patinaHero) { navAckVisible = false }
    }
}

// MARK: - Liquid Glass helper (PT-5-7)

private extension View {
    /// Applies the charcoal-tinted Liquid Glass circle used by the Companion
    /// minimal pill. Factored into a helper with an explicit `#available`
    /// guard because `CompanionOverlay` is a `public` View — the compiler
    /// infers the module API-availability floor on inline `glassEffect`
    /// calls, which sits below iOS 26. On our 26.2 target the glass path is
    /// always taken; the `.ultraThinMaterial` arm is a compile-floor
    /// fallback only.
    @ViewBuilder
    func companionGlassCircle() -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(.regular.tint(PatinaColors.charcoal.opacity(0.7)), in: .circle)
        } else {
            self
                .background(PatinaColors.charcoal.opacity(0.7))
                .background(.ultraThinMaterial)
                .clipShape(Circle())
        }
    }
}

// MARK: - Preview

#Preview("Resting") {
    ZStack {
        PatinaColors.Background.primary.ignoresSafeArea()
        Text("Home Screen Content")
        CompanionOverlay()
    }
    .environment(\.appCoordinator, AppCoordinator())
}

//
//  CompanionOverlay.swift
//  Patina
//
//  The Companion — A living Strata Mark that replaces the tab bar
//  5 states: Resting, Nudging, Expanded, Journey Mode, Minimal
//

import Supabase
import SwiftData
import SwiftUI

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
    @State private var viewModel = CompanionViewModel()
    @State private var state: CompanionState = .button
    @State private var voiceInputState: VoiceInputState = .idle

    /// SP-06: the first-sign-in claim, waiting on the account's answer.
    @State private var localStoreClaim = LocalStoreClaim.shared

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

    /// Full-screen touch shield, alive for as long as the panel occupies the
    /// screen — including both animations, and inserted/removed WITHOUT a
    /// transition of its own.
    ///
    /// The backdrop and the panel both arrive and leave on an opacity fade, and
    /// a view mid-fade does not hit-test. For the length of each animation the
    /// Companion was therefore painted over the screen while being completely
    /// transparent to touch, and every tap in that window reached whatever sat
    /// behind it. Device-verified on the scanFlow manual-room form, where the
    /// two-row panel puts the ✕ (330,608 · 28×28) exactly on top of the form's
    /// "Doors" stepper `+` (330,598 · 32×32): a tap aimed at ✕ left the panel
    /// open and incremented the user's door count instead. The same window on
    /// the collapse side is how the original walk submitted the form twice
    /// "at identical coordinates" through a panel it could still see.
    @State private var panelShielded = false
    /// Retires `panelShielded` once the collapse animation has finished.
    @State private var panelShieldTask: Task<Void, Never>?

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
        if state == .hidden { return .hidden }

        let screen = coordinator.currentScreen

        // Scan and quiz own in-flow Companion surfaces because they have the
        // live progress source. Suppress the root overlay so only one
        // Companion is presented and announced.
        if case .scanFlow = screen { return .hidden }
        if case .styleQuiz = screen { return .hidden }

        if state.isExpanded { return .expanded }

        // B-2: on the house-first root the bar's trailing slot IS the collapsed
        // Companion, so the floating dock retires entirely — mark, caption,
        // nudge pill and all. Everything below this line describes where the
        // dock rests over content, and there is no dock to rest.
        //
        // Placed AFTER the `.expanded` return on purpose: the panel is still
        // this view's, and returning `.hidden` before it resolves would strand
        // the Companion with a door that opens onto nothing.
        if coordinator.isHouseFirstRoot, !state.isExpanded { return .hidden }

        // Legacy journey mode remains source-compatible for context adapters
        // outside the in-flow scan. If another flow publishes walk progress,
        // it still maps to the canonical progress capsule.
        if let progress = coordinator.companionContext.walkProgress {
            let step = min(Int(progress * 4) + 1, 4)
            let labels = ["Scanning room", "Capturing walls", "Finding details", "Almost done"]
            let label = labels[min(step - 1, labels.count - 1)]
            return .journeyMode(
                progress: Double(progress),
                step: step,
                totalSteps: 4,
                stepLabel: label
            )
        }

        if case .pieceDetail = screen { return .minimal }
        if case .arPlacement = screen { return .minimal }
        // A screen with a pinned money act keeps the act; the dock yields to
        // its corner mark. See `CompanionHearthMetrics.yieldsToPinnedFooter`.
        if CompanionHearthMetrics.yieldsToPinnedFooter(
            for: screen,
            houseFirst: coordinator.isHouseFirstRoot
        ) { return .minimal }
        if case .styleResult = screen { return .resting }

        if let nudge = CompanionActionProvider.nudge(
            for: screen,
            context: coordinator.companionContext
        ) {
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
    /// The tier is read through the pure `EngagementTier.resolve` rather than a
    /// convenience accessor on the type: the Companion only ever *gates* on the
    /// tier (`>= .engaged`), it never asserts from it, and the resolver is
    /// promote-only — it answers `.discovering` until real evidence lands. For a
    /// door that opens on evidence, "still loading" and "discovering" are the
    /// same answer, so the Studio door never opens on a guess.
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
        context.engagementTier = EngagementTier.resolve(
            requests: DesignRequestStatusService.shared.requests,
            projectCount: BadgeCountService.shared.projectCount,
            proposalCount: BadgeCountService.shared.proposalsAwaitingSignatureCount,
            invoiceCount: BadgeCountService.shared.payableInvoiceCount,
            decisionCount: BadgeCountService.shared.pendingDecisionCount
        )
        context.designerRelationship = DesignerRelationshipResolver.resolve(
            lead: DesignRequestStatusService.shared.liveLead,
            projects: BadgeCountService.shared.projects,
            roster: BadgeCountService.shared.roster
        )
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

    /// Adapts the overlay's legacy display modes into the canonical three-state
    /// Hearth contract. Context ownership stays unchanged.
    private var canonicalPresentation: CompanionPresentationState {
        switch displayMode {
        case .resting:
            return .collapsed(hint: contextualCollapsedHint)

        case let .nudging(nudge):
            return .collapsed(hint: nudge.label)

        case let .journeyMode(progress, step, totalSteps, stepLabel):
            return .progress(
                CompanionProgressPresentation(
                    fraction: progress,
                    title: stepLabel,
                    detail: "Step \(step) of \(totalSteps)",
                    step: step,
                    totalSteps: totalSteps
                )
            )

        case .expanded:
            return .expanded(
                CompanionExpandedPresentation(
                    title: CompanionActionProvider.panelTitle(
                        for: coordinator.currentScreen,
                        context: enrichedContext
                    ),
                    detail: contextualExpandedDetail,
                    communicationLength: .brief
                )
            )

        case .minimal, .hidden:
            // These legacy display modes render through their dedicated paths.
            return .resting
        }
    }

    /// SP-16: one count, from one source. The Studio snapshot is no longer
    /// consulted here — it is a different fetch, and preferring it was exactly
    /// how the Studio and the Daily Room came to print different numbers on
    /// the same minute.
    private var liveStudioAttentionHint: String? {
        BadgeCountService.shared.studioHint ?? coordinator.companionContext.attentionSummary
    }

    private var contextualCollapsedHint: String {
        CompanionContextualCopy.collapsedHint(
            memory: coordinator.companionContext.memory,
            studioAttentionHint: liveStudioAttentionHint
        )
    }

    private var contextualExpandedDetail: String {
        CompanionContextualCopy.expandedDetail(
            memory: coordinator.companionContext.memory,
            studioAttentionHint: liveStudioAttentionHint
        )
    }

    private var hearthPrimaryAction: (() -> Void)? {
        switch displayMode {
        case .resting, .nudging:
            return { expandToPanel() }
        default:
            return nil
        }
    }

    private var hearthHintAction: (() -> Void)? {
        guard case let .nudging(nudge) = displayMode else { return nil }
        return {
            CompanionAnalytics.shared.trackNudgeTapped(
                screen: coordinator.currentScreen.displayName,
                label: nudge.label
            )
            CompanionAnalytics.shared.trackHintActivated(
                screen: coordinator.currentScreen.displayName,
                hintId: "contextual_next_step"
            )
            handleNavigate(to: nudge.route)
        }
    }

    private var canonicalHearthView: some View {
        VStack(spacing: 0) {
            if introVisible {
                introBubbleView
                    .padding(.bottom, 12)
            } else if navAckVisible {
                navAckBubbleView
                    .padding(.bottom, 12)
            }

            CompanionHearthView(
                presentation: canonicalPresentation,
                attention: coaching.markAttention,
                wakePhase: wakePhase,
                onPrimaryAction: hearthPrimaryAction,
                onHintAction: hearthHintAction,
                onHelp: {
                    collapseToButton()
                    Task {
                        try? await Task.sleep(for: .seconds(0.3))
                        isHelpPanelPresented = true
                    }
                },
                onDismiss: { collapseToButton() },
                expandedContent: {
                    expandedView
                }
            )
            .overlay(alignment: .topLeading) {
                if state.isExpanded, showCoachmark {
                    companionCoachmark
                        .offset(y: -16)
                        .padding(.trailing, 88)
                        .transition(
                            reduceMotion
                                ? .opacity
                                : .move(edge: .top).combined(with: .opacity)
                        )
                }
            }
        }
    }

    private func trackCanonicalExposure() {
        guard displayMode != .hidden, displayMode != .minimal else { return }

        let extent: CompanionExpansionExtent?
        if case let .expanded(content) = canonicalPresentation {
            extent = content.extent
        } else {
            extent = nil
        }

        CompanionAnalytics.shared.trackPresentationExposed(
            state: canonicalPresentation.canonicalState,
            surface: coordinator.currentScreen.displayName,
            extent: extent
        )
    }

    /// The Hearth's lift off the bottom safe area.
    ///
    /// `CompanionOverlay` is mounted as a SIBLING of the four stacks on the
    /// house-first root, not inside the bar's `safeAreaInset`, so it does not
    /// inherit the bar's height — without this the expanded panel's bottom
    /// edge and its ✕ sit under the bar. `itemHeight` (49) rather than
    /// `barHeight` (83) because `safeAreaPadding` already adds the
    /// home-indicator safe area the remaining 34 pt of the bar occupies.
    private var expandedBottomLift: CGFloat {
        let base: CGFloat = state.isExpanded ? 24 : 28
        // `PatinaTabBar` is generic over its trailing slot, so the static
        // needs a witness; any `Trailing` answers the same 49.
        return coordinator.isHouseFirstRoot ? base + PatinaTabBar<EmptyView>.itemHeight : base
    }

    public init() {}

    public var body: some View {
        // PT-6-8: the GeometryReader that existed only to read
        // `safeAreaInsets.bottom` (and add it to every dock offset) is gone.
        // `.safeAreaPadding(.bottom, N)` insets by N *plus* the safe area,
        // so the home-indicator clearance comes for free without measuring
        // the proxy.
        ZStack {
            // Touch shield (see `panelShielded`). Declared first so it sits
            // under the backdrop and the panel: anything they hit-test still
            // wins, and every other tap stops here instead of reaching the
            // screen behind the Companion. `.identity` keeps it hit-solid from
            // the first frame — a fade would reintroduce the hole it closes.
            if panelShielded {
                Color.clear
                    .ignoresSafeArea()
                    .contentShape(Rectangle())
                    .onTapGesture {
                        // Only a settled panel dismisses on an outside tap;
                        // while the collapse finishes the shield just absorbs.
                        if state.isExpanded { collapseToButton() }
                    }
                    .transition(.identity)
            }

            // Backdrop when expanded. Purely visual now — the shield above
            // owns the taps, so the backdrop's fade can never leave a frame
            // where the dim is on screen but the touch goes through it.
            if state.isExpanded {
                Color.black.opacity(0.3)
                    .background(.ultraThinMaterial.opacity(0.5))
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
            }

            // Resting, progress, and expanded communication stay mounted in
            // one Hearth view so the charcoal shell and Strata mark morph
            // continuously between canonical states.
            switch displayMode {
            case .hidden:
                EmptyView()

            case .minimal:
                minimalView
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                    .safeAreaPadding(.bottom, 28)
                    .padding(.trailing, 20)

            case .resting, .nudging, .expanded, .journeyMode:
                canonicalHearthView
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                    .safeAreaPadding(.bottom, expandedBottomLift)
            }
        }
        .animation(
            reduceMotion
                ? .easeOut(duration: CompanionConstants.reducedMotionCrossfadeDuration)
                : .spring(
                    response: CompanionConstants.springResponse,
                    dampingFraction: CompanionConstants.springDamping
                ),
            value: displayMode
        )
        // PT-5-10: expand/collapse haptics are now declarative, keyed on the
        // expanded state. Expanding fires the soft companion pulse; collapsing
        // fires a light impact — matching the prior imperative calls in
        // `expandToPanel()` / `collapseToButton()`.
        .sensoryFeedback(trigger: state.isExpanded) { _, expanded in
            expanded
                ? .impact(flexibility: .soft, intensity: 0.5)
                : .impact(weight: .light)
        }
        // B-2: the bar's trailing slot is the collapsed Companion's only
        // control on the house-first root, and it can reach this view no other
        // way — `expandToPanel()` is file-private. It writes
        // `coordinator.isCompanionExpanded`; this is what reads it.
        //
        // The overlay's own `expandToPanel()` / `collapseToButton()` write that
        // same flag, so this fires on their writes too. Both arms are guarded
        // on `state`, which has already moved by then, so the second pass is a
        // no-op rather than a loop.
        .onChange(of: coordinator.isCompanionExpanded) { _, expanded in
            if expanded, !state.isExpanded { expandToPanel() }
            if !expanded, state.isExpanded { collapseToButton() }
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
            trackCanonicalExposure()
        }
        .onAppear {
            isAuthenticated = AuthService.shared.isAuthenticated
            viewModel.updateContext(coordinator.companionContext)
            coaching.recordMainSessionStart()
            trackCanonicalExposure()
        }
        // Wake-up self-intro: gated per screen so it re-evaluates whenever the
        // surface changes, and cancels cleanly when the user leaves.
        .task(id: coordinator.currentScreen) {
            await maybePresentIntro()
        }
        .task {
            for await _ in supabase.auth.authStateChanges {
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
        // SP-06: the first-sign-in claim. Hosted here because the Companion is
        // the one surface always mounted in the `.main` phase, which is exactly
        // where the app lands the moment the claim decision is due.
        .sheet(isPresented: Binding(
            get: { localStoreClaim.isAsking },
            set: { if !$0 { localStoreClaim.keep() } }
        )) {
            LocalStoreClaimSheet(
                onKeep: { localStoreClaim.keep() },
                onStartFresh: { localStoreClaim.startFresh() }
            )
        }
    }

    // MARK: - State 1: Resting

    // MARK: - State 2: Nudging

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

    /// The suggested-action pill shown in nudging mode. A real affordance, not
    /// décor (R01/R02): tapping it performs the suggested action; the mark
    /// below opens the panel.

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
        let context = enrichedContext
        let actions = CompanionActionProvider.actions(
            for: coordinator.currentScreen,
            context: context,
            isAuthenticated: AuthService.shared.isAuthenticated
        )

        return VStack(spacing: 6) {
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
                            case let .openDesignServices(roomId):
                                coordinator.presentDesignServices(roomId: roomId)
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

    // MARK: - First-Launch Coachmark (PT-6-9)

    /// Deliberately NOT `.isModal`: the trait hid every sibling — including
    /// `companion.close` — from the accessibility tree, so on the one panel
    /// open that shows this card the panel had no reachable way out for
    /// VoiceOver or for a device pass. It is an informational callout with its
    /// own "Got it", not a modal.
    private var companionCoachmark: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("These are your next steps. They change with every room you're in — tap one and I'll take you there.")
                .font(PatinaTypography.patinaVoice)
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
    }

    // MARK: - State 4: Journey Mode

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

}

private extension CompanionOverlay {
    // MARK: - Actions

    func expandToPanel() {
        // The wake-up intro and first-nav ack live in the mark's slot; opening
        // the panel retires them. Tapping through the intro (mark or "Show me")
        // counts as accepting it — record "expanded".
        if introVisible {
            dismissIntro(action: "expanded")
        }
        dismissNavAck()

        // Raise the shield in its own transaction, before the animated state
        // change below — it must be hit-solid on the very first frame of the
        // expansion, not fade in with the panel.
        panelShieldTask?.cancel()
        panelShieldTask = nil
        panelShielded = true

        // PT-5-10: the soft pulse is fired declaratively via
        // `.sensoryFeedback(trigger: state.isExpanded)` below.
        CompanionAnalytics.shared.trackFABTapped(screen: coordinator.currentScreen.displayName)
        CompanionAnalytics.shared.trackPresentationExpanded(
            screen: coordinator.currentScreen.displayName,
            from: canonicalPresentation.canonicalState,
            extent: .card
        )

        withAnimation(
            reduceMotion
                ? .easeOut(duration: CompanionConstants.reducedMotionCrossfadeDuration)
                : .spring(
                    response: CompanionConstants.springResponse,
                    dampingFraction: CompanionConstants.springDamping
                )
        ) {
            state = .expanded
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
        if !hasSeenCompanionCoachmark, coaching.shouldShowPanelCoachmark {
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
        CompanionAnalytics.shared.trackPresentationDismissed(
            screen: coordinator.currentScreen.displayName,
            from: .expanded
        )
        panelOpenTime = nil

        // Treat collapsing as acknowledging the coachmark so it doesn't
        // reappear next expansion (PT-6-9).
        if showCoachmark { dismissCoachmark() }

        withAnimation(
            reduceMotion
                ? .easeOut(duration: CompanionConstants.reducedMotionCrossfadeDuration)
                : .spring(
                    response: CompanionConstants.springResponse,
                    dampingFraction: CompanionConstants.springDamping
                ).delay(0.05)
        ) {
            state = .button
        }
        coordinator.isCompanionExpanded = false

        // The panel is still drawn (and still fading) after `state` flips, so
        // the shield has to outlive the collapse — otherwise the very next tap
        // lands on the screen the user can still see the panel covering. Under
        // reduce motion there is no exit animation to outlive.
        panelShieldTask?.cancel()
        guard !reduceMotion else {
            panelShieldTask = nil
            panelShielded = false
            return
        }
        panelShieldTask = Task {
            do { try await Task.sleep(for: .seconds(0.45)) } catch { return }
            panelShielded = false
        }
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
            wakePhase = .dormant // 1 — snap, no animation
            try await Task.sleep(for: .seconds(0.15))

            withAnimation(.patinaHero) { wakePhase = .rising } // 2
            try await Task.sleep(for: .seconds(0.45))

            wakePhase = .drawing // 3 — mark staggers the draw-in
            try await Task.sleep(for: .seconds(0.55))

            wakePhase = .pulse // 4 — burst + haptic + bounce
            HapticManager.shared.companionPulse()
            withAnimation(.spring(response: 0.35, dampingFraction: 0.6)) { markBounceScale = 1.1 }
            try await Task.sleep(for: .seconds(0.18))
            withAnimation(.spring(response: 0.35, dampingFraction: 0.6)) { markBounceScale = 1.0 }
            try await Task.sleep(for: .seconds(0.32))

            wakePhase = .awake // 5 — settle, then present
            try await Task.sleep(for: .seconds(0.3))
        } catch {
            return // cancelled — interruption handler settles + records
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
            glassEffect(.regular.tint(PatinaColors.charcoal.opacity(0.7)), in: .circle)
        } else {
            background(PatinaColors.charcoal.opacity(0.7))
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

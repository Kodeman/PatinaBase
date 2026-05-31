//
//  CompanionOverlay.swift
//  Patina
//
//  The Companion — A living Strata Mark that replaces the tab bar
//  5 states: Resting, Nudging, Expanded, Journey Mode, Minimal
//

import SwiftUI
import Supabase

// MARK: - Companion Display State

/// The visual display state of The Companion (separate from internal CompanionState)
enum CompanionDisplayMode: Equatable {
    case resting
    case nudging(label: String)
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
    /// Drives the contextual help-panel sheet attached to the Companion
    /// surface. Toggled by the `?` button in the expanded panel header.
    @State private var isHelpPanelPresented: Bool = false

    /// One-shot first-launch coachmark (PT-6-9). Shown over the panel the
    /// first time the user expands the Companion, then persisted as seen so
    /// it never reappears. Backed by UserDefaults so it survives relaunches
    /// even before a Supabase session exists.
    @AppStorage("patina.companion.coachmarkSeen") private var hasSeenCompanionCoachmark: Bool = false
    @State private var showCoachmark: Bool = false

    /// Computed display mode based on current screen context
    private var displayMode: CompanionDisplayMode {
        // Hidden during certain flows
        if state == .hidden { return .hidden }

        // If expanded, show expanded
        if state.isExpanded { return .expanded }

        let screen = coordinator.currentScreen

        // Journey mode during walks
        if case .walk = screen, let progress = coordinator.companionContext.walkProgress {
            return .journeyMode(progress: Double(progress), step: 2, totalSteps: 4, stepLabel: "Capturing walls")
        }
        if case .walkSession = screen, let progress = coordinator.companionContext.walkProgress {
            let step = Int(progress * 4) + 1
            let labels = ["Scanning room", "Capturing walls", "Finding details", "Almost done"]
            let label = labels[min(step - 1, labels.count - 1)]
            return .journeyMode(progress: Double(progress), step: step, totalSteps: 4, stepLabel: label)
        }

        // Minimal in AR / immersive views
        if case .pieceDetail = screen { return .minimal }
        if case .arPlacement = screen { return .minimal }

        // Minimal during pre-scan and floor plan (they have own UI but the
        // Companion stays reachable so the user never loses orientation — PT-6-11).
        if case .preScanChecklist = screen { return .minimal }
        if case .floorPlanPreview = screen { return .minimal }

        // Minimal during quiz (quiz manages its own flow) — keep the Companion
        // present but unobtrusive instead of disappearing entirely (PT-6-11).
        if case .styleQuiz = screen { return .minimal }
        if case .styleResult = screen { return .resting }

        // Nudging based on context provider
        if let nudge = CompanionActionProvider.nudge(for: screen, context: coordinator.companionContext) {
            return .nudging(label: nudge)
        }

        return .resting
    }

    public init() {}

    public var body: some View {
        GeometryReader { geometry in
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
                    companionDockGradient(safeAreaBottom: geometry.safeAreaInsets.bottom)
                        .transition(.opacity)
                }

                // Render based on display mode
                switch displayMode {
                case .hidden:
                    EmptyView()

                case .resting:
                    restingView
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                        .padding(.bottom, 28 + geometry.safeAreaInsets.bottom)

                case .nudging(let label):
                    nudgingView(label: label)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                        .padding(.bottom, 28 + geometry.safeAreaInsets.bottom)

                case .expanded:
                    expandedView(geometry: geometry)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                        .padding(.bottom, 24 + geometry.safeAreaInsets.bottom)

                case .journeyMode(let progress, let step, let totalSteps, let stepLabel):
                    journeyModeView(progress: progress, step: step, totalSteps: totalSteps, stepLabel: stepLabel)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                        .padding(.bottom, 28 + geometry.safeAreaInsets.bottom)

                case .minimal:
                    minimalView
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                        .padding(.bottom, 28 + geometry.safeAreaInsets.bottom)
                        .padding(.trailing, 20)
                }
            }
        }
        .ignoresSafeArea(edges: .bottom)
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: displayMode)
        .onChange(of: coordinator.companionContext) { _, newContext in
            viewModel.updateContext(newContext)
        }
        .onChange(of: coordinator.currentScreen) { _, _ in
            viewModel.updateContext(coordinator.companionContext)
        }
        .onAppear {
            isAuthenticated = AuthService.shared.isAuthenticated
            viewModel.updateContext(coordinator.companionContext)
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

    /// Subtle gradient fade that gives the companion button visual breathing room
    private func companionDockGradient(safeAreaBottom: CGFloat) -> some View {
        PatinaGradients.companionDock()
            .frame(height: 140)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            .padding(.bottom, safeAreaBottom)
            .allowsHitTesting(false)
            .ignoresSafeArea(edges: .bottom)
    }

    // MARK: - State 1: Resting

    private var restingView: some View {
        companionMark
            .onTapGesture { expandToPanel() }
            .accessibilityIdentifier("companion.bubble")
    }

    // MARK: - State 2: Nudging

    private func nudgingView(label: String) -> some View {
        VStack(spacing: 0) {
            // Floating label
            Text(label)
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.offWhite)
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(PatinaColors.charcoal)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .patinaShadow(PatinaShadows.md)
                .padding(.bottom, 8)

            companionMark
                .onTapGesture { expandToPanel() }
        }
    }

    // MARK: - State 3: Expanded

    private func expandedView(geometry: GeometryProxy) -> some View {
        VStack(spacing: 0) {
            // Panel
            VStack(spacing: 0) {
                // Header
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(CompanionActionProvider.panelTitle(
                        for: coordinator.currentScreen,
                        context: coordinator.companionContext
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
                        context: coordinator.companionContext,
                        isAuthenticated: AuthService.shared.isAuthenticated
                    )
                    ForEach(actions) { item in
                        companionAction(
                            icon: item.icon,
                            label: item.label,
                            hint: item.hint,
                            isSuggested: item.isSuggested
                        ) {
                            if let route = item.route {
                                handleNavigate(to: route)
                            } else if let special = item.specialAction {
                                collapseToButton()
                                Task {
                                    try? await Task.sleep(for: .seconds(0.3))
                                    switch special {
                                    case .openQRScanner:
                                        coordinator.showingQRScanner = true
                                    case .openSettings:
                                        coordinator.showingSettings = true
                                    case .openAuth:
                                        coordinator.presentAuthentication()
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .padding(20)
            .background(PatinaColors.charcoal)
            .clipShape(RoundedRectangle(cornerRadius: 24))
            .patinaShadow(PatinaShadows.companion)
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
            Text("This is your Companion. Tap any time for what to do next.")
                .font(.custom("PlayfairDisplay-Italic", size: 15, relativeTo: .subheadline))
                .foregroundStyle(PatinaColors.charcoal)
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
        .background(PatinaColors.offWhite)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .patinaShadow(PatinaShadows.md)
        .padding(.horizontal, 12)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("This is your Companion. Tap any time for what to do next.")
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
        .background(PatinaColors.charcoal)
        .clipShape(Capsule())
        .patinaShadow(PatinaShadows.companion)
        .padding(.horizontal, 40)
    }

    // MARK: - State 5: Minimal

    private var minimalView: some View {
        Button { expandToPanel() } label: {
            ZStack {
                Circle()
                    .fill(PatinaColors.charcoal.opacity(0.7))
                    .frame(width: 44, height: 44)
                    .background(.ultraThinMaterial)
                    .clipShape(Circle())

                VStack(spacing: 2.5) {
                    Capsule().fill(PatinaColors.offWhite).frame(width: 16, height: 1.5)
                    Capsule().fill(PatinaColors.offWhite.opacity(0.7)).frame(width: 12, height: 1.5)
                    Capsule().fill(PatinaColors.offWhite.opacity(0.4)).frame(width: 9, height: 1.5)
                }
            }
            .patinaShadow(PatinaShadows.md)
        }
        .accessibilityIdentifier("companion.bubble")
    }

    // MARK: - Shared: Companion Mark (Resting circle with strata lines)

    private var companionMark: some View {
        ZStack {
            // Breathing glow ring
            Circle()
                .stroke(PatinaColors.clay.opacity(0.35), lineWidth: 1.5)
                .frame(width: 58, height: 58)
                .scaleEffect(reduceMotion ? 1.0 : breatheScale)

            // Main circle
            Circle()
                .fill(PatinaColors.charcoal)
                .frame(width: 52, height: 52)
                .patinaShadow(PatinaShadows.companion)

            // Strata lines (white on charcoal)
            VStack(spacing: 3) {
                Capsule().fill(PatinaColors.offWhite).frame(width: 20, height: 1.5)
                Capsule().fill(PatinaColors.offWhite.opacity(0.7)).frame(width: 16, height: 1.5)
                Capsule().fill(PatinaColors.offWhite.opacity(0.4)).frame(width: 12, height: 1.5)
            }
        }
    }

    @State private var breatheScale: CGFloat = 1.0

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
        HapticManager.shared.companionPulse()
        CompanionAnalytics.shared.trackFABTapped(screen: coordinator.currentScreen.displayName)

        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
            state = .expanded
        }
        withAnimation(.easeIn(duration: 0.2).delay(0.15)) {
            contentOpacity = 1
        }
        coordinator.isCompanionExpanded = true
        panelOpenTime = Date()

        // PT-6-9: first time the Companion is expanded, surface a one-shot
        // coachmark explaining what it is.
        if !hasSeenCompanionCoachmark {
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
        HapticManager.shared.impact(.light)
        let dwellTime = panelOpenTime.map { Date().timeIntervalSince($0) } ?? 0
        CompanionAnalytics.shared.trackPanelClosed(
            screen: coordinator.currentScreen.displayName,
            interactionCount: 0,
            dwellTime: dwellTime
        )
        panelOpenTime = nil

        // Treat collapsing as acknowledging the coachmark so it doesn't
        // reappear next expansion (PT-6-9).
        if showCoachmark { dismissCoachmark() }

        withAnimation(.easeOut(duration: 0.1)) { contentOpacity = 0 }
        withAnimation(.spring(response: 0.4, dampingFraction: 0.85).delay(0.05)) {
            state = .button
        }
        coordinator.isCompanionExpanded = false
    }

    private func handleNavigate(to route: AppRoute) {
        collapseToButton()
        Task {
            try? await Task.sleep(for: .seconds(0.3))
            coordinator.navigate(to: route)
        }
    }

    private func dotColor(step: Int, currentStep: Int) -> Color {
        if step < currentStep { return PatinaColors.clay }
        if step == currentStep { return PatinaColors.offWhite }
        return Color.white.opacity(0.2)
    }
}

// MARK: - Preview

#Preview("Resting") {
    ZStack {
        PatinaColors.offWhite.ignoresSafeArea()
        Text("Home Screen Content")
        CompanionOverlay()
    }
    .environment(\.appCoordinator, AppCoordinator())
}

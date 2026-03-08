//
//  CompanionOverlay.swift
//  Patina
//
//  The Companion - Floating Patina button that morphs into assistant panel
//  Tap to expand, tap outside or swipe down to collapse
//  Clay-colored with texture overlay
//  Auth-gated: shows login panel for unauthenticated users
//

import SwiftUI
import Supabase

/// The Companion - Floating button that morphs into assistant panel
public struct CompanionOverlay: View {
    @Environment(\.appCoordinator) private var coordinator
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var viewModel = CompanionViewModel()
    @State private var state: CompanionState = .button
    @State private var voiceInputState: VoiceInputState = .idle
    @State private var contentOpacity: Double = 0
    @State private var showingAuthPanel = false

    /// Track auth state for view updates
    @State private var isAuthenticated = AuthService.shared.isAuthenticated

    /// Whether current screen is AR placement mode
    private var isARMode: Bool {
        // Detect AR placement screens
        switch coordinator.currentScreen {
        case .pieceDetail, .emergence:
            // These screens may have AR placement
            return coordinator.companionContext.viewingPiece != nil
        default:
            return false
        }
    }

    /// Current button size based on mode
    private var currentButtonSize: CGFloat {
        isARMode ? CompanionConstants.arButtonSize : CompanionConstants.buttonSize
    }

    public init() {}

    public var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Dimming overlay when expanded
                if state.isExpanded || state.isMorphing {
                    Color.black
                        .opacity(0.3 * state.morphProgress)
                        .ignoresSafeArea()
                        .onTapGesture {
                            collapseToButton()
                        }
                        .accessibilityAddTraits(.isButton)
                        .accessibilityLabel("Close companion panel")
                }

                // Position based on AR mode
                if isARMode {
                    // AR Mode: FAB at top-right, panel slides from top
                    VStack {
                        morphingContainer(geometry: geometry, fromTop: true)
                        Spacer()
                    }
                    .frame(maxWidth: .infinity, alignment: .trailing)
                } else {
                    // Normal mode: FAB at bottom center, panel slides from bottom
                    VStack {
                        Spacer()
                        morphingContainer(geometry: geometry, fromTop: false)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .ignoresSafeArea(edges: isARMode ? .top : .bottom)
        .onChange(of: viewModel.hasPendingMessage) { _, hasPending in
            if hasPending && state == .button {
                withAnimation {
                    state = .pulsing
                }
            }
        }
        .onChange(of: coordinator.companionContext) { _, newContext in
            viewModel.updateContext(newContext)
        }
        .onChange(of: coordinator.currentScreen) { _, _ in
            viewModel.updateContext(coordinator.companionContext)
        }
        .onAppear {
            // Sync auth state on appear
            isAuthenticated = AuthService.shared.isAuthenticated
            viewModel.updateContext(coordinator.companionContext)
        }
        .task {
            // Monitor auth state changes
            for await (event, _) in supabase.auth.authStateChanges {
                await MainActor.run {
                    let newAuthState = AuthService.shared.isAuthenticated
                    if newAuthState != isAuthenticated {
                        isAuthenticated = newAuthState
                        if newAuthState && state.isExpanded {
                            viewModel.updateContext(coordinator.companionContext)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Morphing Container

    @ViewBuilder
    private func morphingContainer(geometry: GeometryProxy, fromTop: Bool = false) -> some View {
        let progress = state.morphProgress
        let screenWidth = geometry.size.width
        let safeAreaBottom = geometry.safeAreaInsets.bottom
        let safeAreaTop = geometry.safeAreaInsets.top

        // Calculate morphing dimensions - use appropriate button size for mode
        let buttonSize = currentButtonSize
        let buttonCornerRadius = isARMode ? CompanionConstants.arButtonCornerRadius : CompanionConstants.buttonCornerRadius
        let panelWidth = screenWidth  // Full width when expanded
        let panelHeight = min(
            CompanionConstants.expandedMaxHeight,
            geometry.size.height * 0.6
        )

        // Interpolate dimensions
        let currentWidth = buttonSize + (panelWidth - buttonSize) * progress
        let currentHeight = buttonSize + (panelHeight - buttonSize) * progress
        let currentCornerRadius = buttonCornerRadius -
            (buttonCornerRadius - CompanionConstants.panelCornerRadius) * progress

        // Container
        ZStack {
            // Background - warmWhite with paper texture throughout
            PaperBackground(cornerRadius: currentCornerRadius, textureIntensity: 0.4)

            // Shadow
            RoundedRectangle(cornerRadius: currentCornerRadius, style: .continuous)
                .fill(Color.clear)
                .shadow(
                    color: PatinaColors.mochaBrown.opacity(0.15 + 0.1 * progress),
                    radius: 8 + 12 * progress,
                    y: fromTop ? -(4 + 4 * progress) : (4 + 4 * progress)
                )

            // Content
            ZStack {
                // Button content (Strata Mark)
                buttonContent
                    .opacity(1 - progress)

                // Panel content
                if progress > 0.5 {
                    panelContent
                        .opacity(contentOpacity)
                }
            }
        }
        .frame(width: currentWidth, height: currentHeight)
        // Ensure minimum touch target for accessibility
        .frame(
            minWidth: CompanionConstants.minimumTouchTarget,
            minHeight: CompanionConstants.minimumTouchTarget
        )
        .padding(
            fromTop ? .top : .bottom,
            fromTop
                ? CompanionConstants.arButtonTopPadding + safeAreaTop
                : CompanionConstants.buttonBottomPadding + safeAreaBottom
        )
        .padding(
            fromTop ? .trailing : .horizontal,
            fromTop ? CompanionConstants.arButtonRightPadding : 0
        )
        .onTapGesture {
            if state.isButton {
                expandToPanel()
            }
        }
        .gesture(
            DragGesture(minimumDistance: 20)
                .onEnded { value in
                    // Swipe to collapse (down for bottom, up for top)
                    let threshold: CGFloat = 50
                    let shouldCollapse = fromTop
                        ? value.translation.height < -threshold
                        : value.translation.height > threshold
                    if shouldCollapse && state.isExpanded {
                        collapseToButton()
                    }
                }
        )
        .animation(
            reduceMotion
                ? .easeInOut(duration: 0.2)
                : .spring(response: CompanionConstants.springResponse, dampingFraction: CompanionConstants.springDamping),
            value: state
        )
        // Accessibility
        .accessibilityElement(children: state.isExpanded ? .contain : .ignore)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityHint(accessibilityHint)
        .accessibilityAddTraits(state.isExpanded ? [] : .isButton)
    }

    // MARK: - Accessibility

    private var accessibilityLabel: String {
        if state.isExpanded {
            return isAuthenticated
                ? "Companion panel, showing quick actions"
                : "Companion panel, sign in required"
        } else if state.isPulsing {
            return "Companion assistant, has new message"
        } else {
            return "Companion assistant"
        }
    }

    private var accessibilityHint: String {
        if state.isExpanded {
            return "Swipe \(isARMode ? "up" : "down") or tap outside to close"
        } else {
            return "Double tap to open quick actions. Long press for voice input."
        }
    }

    // MARK: - Button Content

    /// Whether breathing animation should be active (respects reduce motion)
    private var shouldBreath: Bool {
        state.isBreathing && !reduceMotion
    }

    /// Scale factor for AR mode button
    private var buttonScale: CGFloat {
        isARMode ? CompanionConstants.arButtonSize / CompanionConstants.buttonSize : 1.0
    }

    private var buttonContent: some View {
        ZStack {
            // Pulse animation for notifications (skip if reduce motion)
            if state.isPulsing && !reduceMotion {
                PulseAnimation(color: PatinaColors.clayBeige, isActive: true)
                    .frame(width: 50 * buttonScale, height: 50 * buttonScale)
            }

            // The Strata Mark - uses spec colors (mochaBrown → clayBeige)
            StrataMarkView(
                color: PatinaColors.mochaBrown,
                scale: buttonScale,
                breathing: shouldBreath,
                useSpecColors: true
            )

            // Notification dot (static indicator when reduce motion or pulsing)
            if state.isPulsing {
                Circle()
                    .fill(PatinaColors.clayBeige)
                    .frame(width: 10 * buttonScale, height: 10 * buttonScale)
                    .offset(x: 15 * buttonScale, y: -15 * buttonScale)
                    .accessibilityHidden(true)
            }
        }
        .companionLongPressGesture(onActivate: handleVoiceInput)
    }

    // MARK: - Panel Content

    private var panelContent: some View {
        VStack(spacing: 0) {
            // Collapse handle
            Capsule()
                .fill(PatinaColors.clayBeige.opacity(0.4))
                .frame(width: 36, height: 4)
                .padding(.top, PatinaSpacing.sm)
                .padding(.bottom, PatinaSpacing.xs)
                .accessibilityLabel("Drag handle")
                .accessibilityHint("Swipe \(isARMode ? "up" : "down") to close panel")

            // Show auth panel or quick actions based on auth state
            if isAuthenticated {
                // Quick actions content (authenticated)
                CompanionSheet(viewModel: viewModel, onQuickAction: handleQuickAction)
                    .accessibilityElement(children: .contain)
            } else {
                // Auth panel (unauthenticated)
                CompanionAuthPanel(
                    onAuthComplete: {
                        // Update auth state to trigger view refresh
                        isAuthenticated = true
                        // Refresh quick actions after auth
                        viewModel.updateContext(coordinator.companionContext)
                        // Provide visual feedback
                        HapticManager.shared.notification(.success)
                    },
                    onDismiss: {
                        collapseToButton()
                    }
                )
                .accessibilityElement(children: .contain)
            }
        }
    }

    // MARK: - Actions

    private func expandToPanel() {
        HapticManager.shared.companionPulse()

        // Track FAB tap and panel open
        let screenName = coordinator.currentScreen.displayName
        CompanionAnalytics.shared.trackFABTapped(screen: screenName)
        CompanionAnalytics.shared.trackPanelOpened(screen: screenName, isAuthenticated: isAuthenticated)

        // Track auth prompt if not authenticated
        if !isAuthenticated {
            CompanionAnalytics.shared.trackAuthPromptShown(screen: screenName)
        }

        if viewModel.hasPendingMessage {
            viewModel.markMessageRead()
        }

        withAnimation(.spring(response: CompanionConstants.springResponse, dampingFraction: CompanionConstants.springDamping)) {
            state = .expanded
        }

        // Fade in content after morph starts
        withAnimation(.easeIn(duration: 0.2).delay(0.15)) {
            contentOpacity = 1
        }

        coordinator.isCompanionExpanded = true
        panelOpenTime = Date()
    }

    /// Time when panel was opened (for tracking dwell time)
    @State private var panelOpenTime: Date?

    private func collapseToButton() {
        HapticManager.shared.impact(.light)

        // Track panel close
        let screenName = coordinator.currentScreen.displayName
        let dwellTime = panelOpenTime.map { Date().timeIntervalSince($0) } ?? 0
        CompanionAnalytics.shared.trackPanelClosed(
            screen: screenName,
            interactionCount: viewModel.conversationMessages.count,
            dwellTime: dwellTime
        )
        panelOpenTime = nil

        // Fade out content first
        withAnimation(.easeOut(duration: 0.1)) {
            contentOpacity = 0
        }

        // Then morph back to button
        withAnimation(.spring(response: CompanionConstants.springResponse, dampingFraction: CompanionConstants.springDamping).delay(0.05)) {
            state = viewModel.hasPendingMessage ? .pulsing : .button
        }

        coordinator.isCompanionExpanded = false
    }

    private func handleQuickAction(_ action: QuickAction) {
        HapticManager.shared.impact(.light)

        if action.intent.triggersNavigation {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                state = .navigating
            }

            _ = coordinator.handleIntent(action.intent)

            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) {
                    state = .button
                    contentOpacity = 0
                }
            }
        } else {
            _ = viewModel.handleQuickAction(action)
        }
    }

    private func handleVoiceInput() {
        guard voiceInputState == .idle else { return }

        voiceInputState = .listening
        expandToPanel()
    }
}

// MARK: - Preview

#Preview("Floating Button") {
    ZStack {
        PatinaColors.Background.primary
            .ignoresSafeArea()

        Text("Main Content")
            .foregroundColor(PatinaColors.Text.secondary)

        CompanionOverlay()
    }
}

#Preview("With Notification") {
    ZStack {
        PatinaColors.Background.primary
            .ignoresSafeArea()

        CompanionOverlay()
    }
}

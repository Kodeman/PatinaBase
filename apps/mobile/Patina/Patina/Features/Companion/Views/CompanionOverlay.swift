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
    @State private var viewModel = CompanionViewModel()
    @State private var state: CompanionState = .button
    @State private var voiceInputState: VoiceInputState = .idle
    @State private var contentOpacity: Double = 0
    @State private var showingAuthPanel = false
    @State private var isAuthenticated = AuthService.shared.isAuthenticated
    @State private var panelOpenTime: Date?

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

        // Nudging based on context
        switch screen {
        case .heroFrame:
            return .nudging(label: "Scan a room \u{2192}")
        case .emergence, .roomEmergence:
            return .nudging(label: "Try in your room \u{2192}")
        case .table:
            return .nudging(label: "Find more pieces \u{2192}")
        default:
            return .resting
        }
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
                        .onTapGesture { collapseToButton() }
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
    }

    // MARK: - State 1: Resting

    private var restingView: some View {
        companionMark
            .onTapGesture { expandToPanel() }
    }

    // MARK: - State 2: Nudging

    private func nudgingView(label: String) -> some View {
        VStack(spacing: 0) {
            // Floating label
            Text(label)
                .font(PatinaTypography.caption)
                .foregroundColor(PatinaColors.offWhite)
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
                HStack {
                    Text("What next?")
                        .font(.custom("PlayfairDisplay-Italic", size: 16))
                        .foregroundColor(PatinaColors.offWhite)

                    Spacer()

                    Button { collapseToButton() } label: {
                        Circle()
                            .fill(Color.white.opacity(0.1))
                            .frame(width: 28, height: 28)
                            .overlay(
                                Image(systemName: "xmark")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundColor(PatinaColors.pearl)
                            )
                    }
                }
                .padding(.bottom, 16)

                // Actions
                VStack(spacing: 6) {
                    companionAction(
                        icon: "viewfinder",
                        label: "Scan a room",
                        hint: "Suggested next step",
                        isSuggested: true
                    ) {
                        handleNavigate(to: .walk)
                    }

                    companionAction(
                        icon: "sparkles",
                        label: "Your recommendations",
                        hint: "18 items \u{00B7} Living room",
                        isSuggested: false
                    ) {
                        handleNavigate(to: .emergence(pieceId: nil))
                    }

                    companionAction(
                        icon: "heart",
                        label: "Collections",
                        hint: "2 boards \u{00B7} 13 items",
                        isSuggested: false
                    ) {
                        handleNavigate(to: .table)
                    }

                    companionAction(
                        icon: "qrcode.viewfinder",
                        label: "Connect to portal",
                        hint: "Scan QR \u{00B7} patina.cloud",
                        isSuggested: false
                    ) {
                        collapseToButton()
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            coordinator.showingQRScanner = true
                        }
                    }

                    companionAction(
                        icon: "person.circle",
                        label: "Your profile",
                        hint: "Style \u{00B7} Rooms \u{00B7} Settings",
                        isSuggested: false
                    ) {
                        handleNavigate(to: .settings)
                    }
                }
            }
            .padding(20)
            .background(PatinaColors.charcoal)
            .clipShape(RoundedRectangle(cornerRadius: 24))
            .patinaShadow(PatinaShadows.companion)
        }
        .padding(.horizontal, 24)
        .transition(.move(edge: .bottom).combined(with: .opacity))
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
                    .font(.custom("PlayfairDisplay-Medium", size: 13))
                    .foregroundColor(PatinaColors.offWhite)
            }

            // Text
            VStack(alignment: .leading, spacing: 1) {
                Text(stepLabel)
                    .font(PatinaTypography.uiSmall)
                    .foregroundColor(PatinaColors.offWhite)

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
                        .foregroundColor(isSuggested ? PatinaColors.offWhite : PatinaColors.pearl)
                }

                // Text
                VStack(alignment: .leading, spacing: 1) {
                    Text(label)
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundColor(PatinaColors.offWhite)
                    Text(hint)
                        .font(PatinaTypography.monoSmall)
                        .foregroundColor(PatinaColors.clay)
                        .tracking(0.3)
                        .textCase(.uppercase)
                }

                Spacer()

                Text("\u{203A}")
                    .font(.system(size: 14))
                    .foregroundColor(PatinaColors.agedOak)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(isSuggested ? PatinaColors.clay.opacity(0.15) : Color.white.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
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

        withAnimation(.easeOut(duration: 0.1)) { contentOpacity = 0 }
        withAnimation(.spring(response: 0.4, dampingFraction: 0.85).delay(0.05)) {
            state = .button
        }
        coordinator.isCompanionExpanded = false
    }

    private func handleNavigate(to route: AppRoute) {
        collapseToButton()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
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

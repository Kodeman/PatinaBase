//  OnboardingFlowView.swift
//  Capture
//
//  Flow 0 sequencer (O1 → O2 → O3 → O4) and the `OnboardingScreens` registrar.
//
//  These are PHASE screens shown while CapturePhase is .auth / .permissionPriming
//  — NOT RouteRegistry routes. The integrator owns the CapturePhase machine and
//  the `-CaptureScreen oN.*` harness; this file hands it:
//    • a bound, step-driven flow (`OnboardingFlowView` / `OnboardingScreens.flow`)
//    • per-step standalone screens (`OnboardingScreens.view(forStep:)`)
//
//  Step indexing is 0-based throughout: 0 = O1, 1 = O2, 2 = O3, 3 = O4.

import SwiftUI
import CaptureKit

// MARK: - Flow

struct OnboardingFlowView: View {
    @Binding var step: Int
    let onComplete: () -> Void
    let authorizer: WorkspaceAuthorizing
    let analytics: any CaptureAnalytics
    /// Persist the workspace the designer picks in O2 (real mode). No-op for the
    /// stub host / previews.
    let onSelectWorkspace: (String) -> Void
    /// Workspaces the O2 screen starts with. Real mode passes `[]` (the user's
    /// real orgs arrive from `authorize()`); the stub host / previews keep the
    /// demo list so the harness renders unchanged.
    let seedWorkspaces: [OnboardingWorkspace]
    /// Sign out from the O2 "no workspace" dead end and restart onboarding.
    let onSignOut: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(step: Binding<Int>,
         authorizer: WorkspaceAuthorizing,
         analytics: any CaptureAnalytics,
         onSelectWorkspace: @escaping (String) -> Void = { _ in },
         seedWorkspaces: [OnboardingWorkspace] = OnboardingWorkspace.demo,
         onSignOut: @escaping () -> Void = {},
         onComplete: @escaping () -> Void) {
        self._step = step
        self.authorizer = authorizer
        self.analytics = analytics
        self.onSelectWorkspace = onSelectWorkspace
        self.seedWorkspaces = seedWorkspaces
        self.onSignOut = onSignOut
        self.onComplete = onComplete
    }

    var body: some View {
        ZStack {
            CaptureColor.paper.ignoresSafeArea()
            current
                .id(clampedStep)
                .transition(transition)
        }
        .overlay(alignment: .top) {
            // Dots are dark-on-light, so only show them on the paper steps.
            if clampedStep != 2 {
                OnboardingProgressDots(index: clampedStep, total: 4)
                    .padding(.top, 6)
            }
        }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.28), value: step)
    }

    private var clampedStep: Int { min(max(step, 0), 3) }

    private var transition: AnyTransition {
        reduceMotion
            ? .opacity
            : .asymmetric(
                insertion: .move(edge: .trailing).combined(with: .opacity),
                removal: .move(edge: .leading).combined(with: .opacity)
            )
    }

    @ViewBuilder private var current: some View {
        switch clampedStep {
        case 0:
            WelcomeScreen(
                analytics: analytics,
                onGetStarted: { advance(to: 1) },
                onSignIn: { advance(to: 1) }   // "I already have an account" → sign-in (O2)
            )
        case 1:
            ConnectWorkspaceScreen(
                authorizer: authorizer,
                analytics: analytics,
                workspaces: seedWorkspaces,
                onConnected: { workspace, _ in
                    onSelectWorkspace(workspace.id)
                    advance(to: 2)
                },
                onSignOut: onSignOut
            )
        case 2:
            CameraPrimingScreen(analytics: analytics, onContinue: { advance(to: 3) })
        default:
            ReadyScreen(analytics: analytics, onStart: onComplete)
        }
    }

    private func advance(to next: Int) { step = next }
}

// MARK: - Stateful host (for `OnboardingScreens.flow`)

private struct OnboardingFlowHost: View {
    let onComplete: () -> Void
    let analytics: any CaptureAnalytics
    @State private var step = 0

    var body: some View {
        OnboardingFlowView(step: $step, authorizer: StubWorkspaceAuthorizer(),
                           analytics: analytics, onComplete: onComplete)
    }
}

// MARK: - Registrar

/// The handoff the integrator wires into the CapturePhase machine + harness.
/// (Flow 0 is phase-based, so there is no RouteRegistry entry — this enum is the
/// equivalent surface.)
enum OnboardingScreens {
    /// One standalone step for the `-CaptureScreen oN.*` harness.
    /// 0 = O1 Welcome · 1 = O2 Connect · 2 = O3 Camera priming · 3 = O4 Ready.
    @MainActor
    static func view(forStep step: Int, analytics: any CaptureAnalytics) -> AnyView {
        switch min(max(step, 0), 3) {
        case 0:  return AnyView(WelcomeScreen(analytics: analytics))
        case 1:  return AnyView(ConnectWorkspaceScreen(authorizer: StubWorkspaceAuthorizer(), analytics: analytics))
        case 2:  return AnyView(CameraPrimingScreen(analytics: analytics))
        default: return AnyView(ReadyScreen(analytics: analytics))
        }
    }

    /// The full O1→O4 sequence; `onComplete` fires when "Start capturing" is
    /// tapped (the integrator flips CapturePhase to `.ready`).
    @MainActor
    static func flow(onComplete: @escaping () -> Void, analytics: any CaptureAnalytics) -> AnyView {
        AnyView(OnboardingFlowHost(onComplete: onComplete, analytics: analytics))
    }
}

#if DEBUG
import CaptureKitMocks

#Preview("Flow") {
    OnboardingScreens.flow(onComplete: {}, analytics: MockCaptureAnalytics())
}
#endif

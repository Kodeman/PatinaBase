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

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(step: Binding<Int>,
         authorizer: WorkspaceAuthorizing,
         onComplete: @escaping () -> Void) {
        self._step = step
        self.authorizer = authorizer
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
                onGetStarted: { advance(to: 1) },
                onSignIn: { advance(to: 1) }   // "I already have an account" → sign-in (O2)
            )
        case 1:
            ConnectWorkspaceScreen(
                authorizer: authorizer,
                onConnected: { _, _ in advance(to: 2) }
            )
        case 2:
            CameraPrimingScreen(onContinue: { advance(to: 3) })
        default:
            ReadyScreen(onStart: onComplete)
        }
    }

    private func advance(to next: Int) { step = next }
}

// MARK: - Stateful host (for `OnboardingScreens.flow`)

private struct OnboardingFlowHost: View {
    let onComplete: () -> Void
    @State private var step = 0

    var body: some View {
        OnboardingFlowView(step: $step, authorizer: StubWorkspaceAuthorizer(), onComplete: onComplete)
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
    static func view(forStep step: Int) -> AnyView {
        switch min(max(step, 0), 3) {
        case 0:  return AnyView(WelcomeScreen())
        case 1:  return AnyView(ConnectWorkspaceScreen(authorizer: StubWorkspaceAuthorizer()))
        case 2:  return AnyView(CameraPrimingScreen())
        default: return AnyView(ReadyScreen())
        }
    }

    /// The full O1→O4 sequence; `onComplete` fires when "Start capturing" is
    /// tapped (the integrator flips CapturePhase to `.ready`).
    @MainActor
    static func flow(onComplete: @escaping () -> Void) -> AnyView {
        AnyView(OnboardingFlowHost(onComplete: onComplete))
    }
}

#Preview("Flow") {
    OnboardingScreens.flow(onComplete: {})
}

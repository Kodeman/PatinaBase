//  RootView.swift
//  Capture
//
//  The app shell: a NavigationStack + sheet presentation driven by
//  CaptureCoordinator, rendering registered screens through RouteRegistry.
//  The viewfinder is the home; everything else is one gesture (or deep link)
//  away. INTEGRATION OWNER edits this file only.

import SwiftUI
import CaptureKit

struct RootView: View {
    @Environment(AppContainer.self) private var container
    /// Starts in `.launching`; `.task` resolves the opening phase from the
    /// session (restored → `.ready`; none → `.auth`). Mock mode reports
    /// authenticated instantly, so it settles on `.ready` with no visible delay.
    @State private var coordinator = CaptureCoordinator(phase: .launching)
    /// Flips true once `ScreenRegistry.registerAll` has run in `.task`. Because
    /// `RouteRegistry.hasRoute(...)` is a plain lookup (not observable), the root
    /// would otherwise render the static placeholder once and never swap to the
    /// real viewfinder. This @State makes `rootContent` re-evaluate post-register.
    @State private var registered = false
    /// Step for the phase-based onboarding flow (real mode with no session).
    @State private var onboardingFlowStep = 0

    var body: some View {
        @Bindable var coord = coordinator
        NavigationStack(path: $coord.path) {
            rootContent
                .navigationDestination(for: CaptureRoute.self) { route in
                    RouteRegistry.shared.view(for: route)
                }
        }
        .environment(coordinator)
        .sheet(item: $coord.sheet) { sheet in
            RouteRegistry.shared.view(for: sheet)
        }
        .fullScreenCover(isPresented: Binding(
            get: { coord.onboardingStep != nil },
            set: { if !$0 { coord.onboardingStep = nil } }
        )) {
            OnboardingScreens.view(forStep: coord.onboardingStep ?? 0)
        }
        .task {
            ScreenRegistry.registerAll(container: container, coordinator: coordinator)
            registered = true
            // Resolve the opening phase honestly from the session: a restored
            // session goes straight to the viewfinder; no session lands on
            // O1/O2 onboarding. Mock mode is authenticated immediately, so this
            // settles on `.ready` and the `-CaptureScreen` harness is unaffected.
            await container.session.waitForReady()
            if coordinator.phase == .launching {
                coordinator.phase = container.session.isAuthenticated ? .ready : .auth
            }
            if let raw = AppConfiguration.initialScreenRaw,
               let id = CaptureScreenID.allCases.first(where: { $0.rawValue.hasSuffix(raw) }) {
                CaptureDeepLink.drive(screen: id, coordinator: coordinator, store: container.store)
            }
        }
        .onOpenURL { url in
            CaptureDeepLink.handle(url, coordinator: coordinator, store: container.store)
        }
        .onChange(of: coordinator.phase) {
            // Entering onboarding (cold start with no session, or after sign-out)
            // always restarts the flow at O1.
            if coordinator.phase == .auth { onboardingFlowStep = 0 }
        }
    }

    @ViewBuilder private var rootContent: some View {
        switch coordinator.phase {
        case .launching:
            ViewfinderPlaceholder()
        case .auth, .permissionPriming:
            // Real mode, no restored session → the O1→O4 onboarding sequence,
            // wired to the real "Continue with Patina" authorizer.
            OnboardingFlowView(
                step: $onboardingFlowStep,
                authorizer: container.authorizer,
                onSelectWorkspace: { container.session.selectWorkspace(id: $0) },
                onComplete: { coordinator.phase = .ready }
            )
        case .ready:
            // `registered` is read first so this recomputes once registration
            // runs; the placeholder is the pre-registration / fallback state.
            if registered, RouteRegistry.shared.hasRoute(.viewfinder) {
                RouteRegistry.shared.view(for: .viewfinder)
            } else {
                ViewfinderPlaceholder()
            }
        }
    }
}

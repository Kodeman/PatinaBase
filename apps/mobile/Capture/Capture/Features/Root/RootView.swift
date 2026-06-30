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
    @State private var coordinator = CaptureCoordinator()
    /// Flips true once `ScreenRegistry.registerAll` has run in `.task`. Because
    /// `RouteRegistry.hasRoute(...)` is a plain lookup (not observable), the root
    /// would otherwise render the static placeholder once and never swap to the
    /// real viewfinder. This @State makes `rootContent` re-evaluate post-register.
    @State private var registered = false

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
            if let raw = AppConfiguration.initialScreenRaw,
               let id = CaptureScreenID.allCases.first(where: { $0.rawValue.hasSuffix(raw) }) {
                CaptureDeepLink.drive(screen: id, coordinator: coordinator, store: container.store)
            }
        }
        .onOpenURL { url in
            CaptureDeepLink.handle(url, coordinator: coordinator, store: container.store)
        }
    }

    @ViewBuilder private var rootContent: some View {
        // `registered` is read first so this recomputes once registration runs;
        // the placeholder is only the pre-registration / graceful-fallback state.
        if registered, RouteRegistry.shared.hasRoute(.viewfinder) {
            RouteRegistry.shared.view(for: .viewfinder)
        } else {
            ViewfinderPlaceholder()
        }
    }
}

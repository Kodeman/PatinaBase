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
        .task {
            ScreenRegistry.registerAll(container: container, coordinator: coordinator)
        }
        .onOpenURL { url in
            CaptureDeepLink.handle(url, coordinator: coordinator, store: container.store)
        }
    }

    @ViewBuilder private var rootContent: some View {
        if RouteRegistry.shared.hasRoute(.viewfinder) {
            RouteRegistry.shared.view(for: .viewfinder)
        } else {
            ViewfinderPlaceholder()
        }
    }
}

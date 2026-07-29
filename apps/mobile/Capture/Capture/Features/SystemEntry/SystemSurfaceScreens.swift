//  SystemSurfaceScreens.swift
//  Capture · Team F (System Surface)
//
//  Registrar for Flow 7's system surface: U1 sync status, U2 library search,
//  T1 settings, T2 account. The integration owner adds one line to ScreenRegistry:
//
//      SystemSurfaceScreens.register(into: r, container: container, coordinator: coordinator)
//
//  (and deletes the _Template placeholder, which also claims `.settings`).
//  Each builder captures the container (store + services) and the coordinator.

import SwiftUI
import CaptureKit

enum SystemSurfaceScreens {
    @MainActor
    static func register(into r: RouteRegistry, container: AppContainer, coordinator: CaptureCoordinator) {
        r.registerRoute(CaptureRoute.syncStatus.registryKey) { _ in
            AnyView(SyncStatusScreen(
                store: container.store,
                sync: container.sync,
                siteScan: container.siteScan,
                session: container.session,
                companion: container.companion,
                analytics: container.analytics,
                coordinator: coordinator
            ))
        }

        r.registerRoute(CaptureRoute.librarySearch.registryKey) { _ in
            AnyView(LibrarySearchScreen(
                store: container.store,
                location: container.location,
                session: container.session,
                analytics: container.analytics,
                coordinator: coordinator
            ))
        }

        r.registerRoute(CaptureRoute.settings.registryKey) { _ in
            AnyView(SettingsScreen(
                store: container.store,
                session: container.session,
                analytics: container.analytics
            ))
        }

        r.registerRoute(CaptureRoute.account.registryKey) { _ in
            AnyView(AccountScreen(
                session: container.session,
                store: container.store,
                sync: container.sync,
                analytics: container.analytics,
                coordinator: coordinator
            ))
        }
    }
}

//  RouteSessionScreens.swift
//  Capture
//
//  Team E registrar. Wires Flow 5 (Route & Save: S1–S5) and Flow 6 (Session &
//  Review: V1–V3) into the RouteRegistry. The integration owner adds one line in
//  ScreenRegistry: RouteSessionScreens.register(into:container:coordinator:).
//  Each builder captures the container's store/services + the coordinator and
//  resolves its specimen fresh on every present.

import Foundation
import SwiftUI
import CaptureKit

enum RouteSessionScreens {
    @MainActor
    static func register(into r: RouteRegistry, container: AppContainer, coordinator: CaptureCoordinator) {
        let store = container.store
        let sync = container.sync
        let location = container.location
        let projectCreator = container.projectCreator

        // ── Flow 6 routes ──────────────────────────────────────────────
        r.registerRoute(CaptureRoute.session.registryKey) { _ in
            AnyView(V1SessionTrayScreen(store: store, coordinator: coordinator))
        }
        r.registerRoute(CaptureRoute.specimen(UUID()).registryKey) { route in
            guard case let .specimen(id) = route else { return AnyView(EmptyView()) }
            return AnyView(V3SpecimenDetailScreen(
                specimen: store.specimen(id: id), store: store, coordinator: coordinator))
        }

        // ── Flow 5 sheets ──────────────────────────────────────────────
        r.registerSheet(CaptureSheet.assignVenue(UUID()).registryKey) { sheet in
            guard case let .assignVenue(id) = sheet else { return AnyView(EmptyView()) }
            return AnyView(S1AssignVenueScreen(
                specimen: store.specimen(id: id), store: store,
                location: location, coordinator: coordinator))
        }
        r.registerSheet(CaptureSheet.createProject.registryKey) { _ in
            AnyView(S2CreateProjectScreen(store: store, coordinator: coordinator,
                                          projectCreator: projectCreator))
        }
        r.registerSheet(CaptureSheet.destination(UUID()).registryKey) { sheet in
            guard case let .destination(id) = sheet else { return AnyView(EmptyView()) }
            return AnyView(S3DestinationScreen(
                specimen: store.specimen(id: id), store: store,
                sync: sync, coordinator: coordinator))
        }
        r.registerSheet(CaptureSheet.savedTerminal(UUID()).registryKey) { sheet in
            guard case let .savedTerminal(id) = sheet else { return AnyView(EmptyView()) }
            return AnyView(S4SavedTerminalScreen(
                specimen: store.specimen(id: id), coordinator: coordinator))
        }
        r.registerSheet(CaptureSheet.inboxTerminal(UUID()).registryKey) { sheet in
            guard case let .inboxTerminal(id) = sheet else { return AnyView(EmptyView()) }
            return AnyView(S5InboxTerminalScreen(
                specimen: store.specimen(id: id), coordinator: coordinator))
        }

        // ── Flow 6 sheet (cull deck) ───────────────────────────────────
        r.registerSheet(CaptureSheet.cullDeck.registryKey) { _ in
            AnyView(V2CullDeckScreen(store: store, coordinator: coordinator))
        }
    }
}

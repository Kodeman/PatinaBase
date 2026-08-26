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
        let analytics = container.analytics
        let session = container.session
        let projects = container.projects

        func currentSpecimen(_ id: UUID) -> Specimen? {
            CaptureOwnerProjectionPolicy.specimen(
                id: id,
                store: store,
                runsRealServices: AppConfiguration.runsRealServices,
                userID: session.userID,
                workspaceID: session.workspaceID)
        }

        r.registerRoute(CaptureRoute.session.registryKey) { _ in
            AnyView(V1SessionTrayScreen(store: store, session: session,
                                        coordinator: coordinator, analytics: analytics, sync: sync))
        }
        r.registerRoute(CaptureRoute.specimen(UUID()).registryKey) { route in
            guard case let .specimen(id) = route else { return AnyView(EmptyView()) }
            return AnyView(V3SpecimenDetailScreen(
                specimen: currentSpecimen(id), store: store, coordinator: coordinator))
        }

        r.registerSheet(CaptureSheet.assignVenue(UUID()).registryKey) { sheet in
            guard case let .assignVenue(id) = sheet else { return AnyView(EmptyView()) }
            return AnyView(S1AssignVenueScreen(
                specimen: currentSpecimen(id), store: store,
                location: location, session: session,
                projects: projects,
                coordinator: coordinator, analytics: analytics))
        }
        r.registerSheet(CaptureSheet.createProject.registryKey) { _ in
            AnyView(S2CreateProjectScreen(store: store, coordinator: coordinator,
                                          analytics: analytics, session: session,
                                          projectCreator: projectCreator))
        }
        r.registerSheet(CaptureSheet.destination(UUID()).registryKey) { sheet in
            guard case let .destination(id) = sheet else { return AnyView(EmptyView()) }
            return AnyView(S3DestinationScreen(
                specimen: currentSpecimen(id), store: store,
                sync: sync, session: session,
                coordinator: coordinator, analytics: analytics))
        }
        r.registerSheet(CaptureSheet.savedTerminal(UUID()).registryKey) { sheet in
            guard case let .savedTerminal(id) = sheet else { return AnyView(EmptyView()) }
            return AnyView(S4SavedTerminalScreen(
                specimen: currentSpecimen(id), coordinator: coordinator, analytics: analytics))
        }
        r.registerSheet(CaptureSheet.inboxTerminal(UUID()).registryKey) { sheet in
            guard case let .inboxTerminal(id) = sheet else { return AnyView(EmptyView()) }
            return AnyView(S5InboxTerminalScreen(
                specimen: currentSpecimen(id), coordinator: coordinator, analytics: analytics))
        }

        r.registerSheet(CaptureSheet.cullDeck.registryKey) { _ in
            AnyView(V2CullDeckScreen(
                store: store, sync: sync, session: session,
                coordinator: coordinator))
        }

        // V0 — the door. One line rather than three: `register` sits on
        // SwiftLint's function_body_length limit for this file.
        r.registerSheet(CaptureSheet.visit.registryKey) { _ in AnyView(V0VisitSheet(container: container, coordinator: coordinator)) }
    }
}

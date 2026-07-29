//  CaptureCoreScreens.swift
//  Capture
//
//  Team B registrar (Flow 2 · C1–C5). Wires the viewfinder home route and the
//  full specimen sheet into RouteRegistry. The integration owner adds
//  `CaptureCoreScreens.register(...)` to ScreenRegistry; registering `.viewfinder`
//  makes the live viewfinder the app's home (replacing ViewfinderPlaceholder).
//
//  C3 (the smart-guess card) and C4 (multi-shot) are in-viewfinder states, not
//  registered surfaces — C3 renders as a transient overlay inside ViewfinderScreen
//  (CaptureSheet.smartGuessCard belongs to Team C).

import SwiftUI
import CaptureKit

enum CaptureCoreScreens {
    @MainActor
    static func register(into r: RouteRegistry, container: AppContainer, coordinator: CaptureCoordinator) {
        r.registerRoute(CaptureRoute.viewfinder.registryKey) { _ in
            AnyView(ViewfinderScreen(container: container, coordinator: coordinator))
        }

        r.registerSheet(CaptureSheet.specimenSheet(UUID()).registryKey) { sheet in
            guard case let .specimenSheet(id) = sheet,
                  let specimen = CaptureOwnerProjectionPolicy.specimen(
                    id: id,
                    store: container.store,
                    runsRealServices: AppConfiguration.runsRealServices,
                    userID: container.session.userID,
                    workspaceID: container.session.workspaceID
                  ) else {
                return AnyView(SpecimenMissingView())
            }
            return AnyView(SpecimenSheetScreen(
                store: container.store,
                coordinator: coordinator,
                specimen: specimen))
        }
    }
}

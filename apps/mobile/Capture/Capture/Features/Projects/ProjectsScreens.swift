//  ProjectsScreens.swift
//  Capture · Wave P (Projects)
//
//  Registrar for P1 (`.projectList`) and P2 (`.project(id)` — the reused
//  project-detail route). Wave P keeps these seams and swaps the placeholders.

import SwiftUI
import CaptureKit

enum ProjectsScreens {
    @MainActor
    static func register(into r: RouteRegistry, container: AppContainer, coordinator: CaptureCoordinator) {
        // P1 · .projectList
        r.registerRoute(CaptureRoute.projectList.registryKey) { _ in
            AnyView(ProjectListPlaceholder())
        }

        // P2 · .project(id) — project detail (reuses the pre-existing project route)
        r.registerRoute(CaptureRoute.project("").registryKey) { route in
            guard case let .project(id) = route else { return AnyView(EmptyView()) }
            return AnyView(ProjectDetailPlaceholder(projectID: id))
        }
    }
}

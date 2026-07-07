//  ProjectsScreens.swift
//  Capture · Wave P (Projects)
//
//  Registrar for P1 (`.projectList`) and P2 (`.project(id)` — the reused
//  project-detail route). Wave P: placeholders replaced with the real
//  ProjectListScreen / ProjectDetailScreen reading `container.projects`.

import SwiftUI
import CaptureKit

enum ProjectsScreens {
    @MainActor
    static func register(into r: RouteRegistry, container: AppContainer, coordinator: CaptureCoordinator) {
        // P1 · .projectList
        r.registerRoute(CaptureRoute.projectList.registryKey) { _ in
            AnyView(ProjectListScreen(
                projects: container.projects,
                analytics: container.analytics,
                coordinator: coordinator
            ))
        }

        // P2 · .project(id) — project detail (reuses the pre-existing project route)
        r.registerRoute(CaptureRoute.project("").registryKey) { route in
            guard case let .project(id) = route else { return AnyView(EmptyView()) }
            return AnyView(ProjectDetailScreen(
                projectID: id,
                projects: container.projects,
                analytics: container.analytics,
                coordinator: coordinator
            ))
        }
    }
}

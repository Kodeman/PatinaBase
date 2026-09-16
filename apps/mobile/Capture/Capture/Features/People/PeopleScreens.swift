//  PeopleScreens.swift
//  Capture · W5 (the People room, on the job)
//
//  Registrar for PR1/PR2/PR3. One route (`.people(screen:projectID:personID:)`)
//  carries all three, the way `.site(screen:…)` carries the twenty Site Request
//  screens — the screen id inside the route picks the face, so the navigation
//  enum grows by one case rather than three.

import SwiftUI
import CaptureKit

enum PeopleScreens {
    @MainActor
    static func register(into r: RouteRegistry, container: AppContainer,
                         coordinator: CaptureCoordinator) {
        r.registerRoute(CaptureRoute.people(screen: .pr1Roster,
                                            projectID: "", personID: nil).registryKey) { route in
            guard case let .people(screen, projectID, personID) = route else {
                return AnyView(EmptyView())
            }
            return view(screen: screen, projectID: projectID, personID: personID,
                        container: container, coordinator: coordinator)
        }
    }

    @MainActor
    private static func view(screen: CaptureScreenID, projectID: String, personID: String?,
                             container: AppContainer,
                             coordinator: CaptureCoordinator) -> AnyView {
        switch screen {
        case .pr2Person:
            guard let personID else { return AnyView(EmptyView()) }
            return AnyView(PersonDetailScreen(
                projectID: projectID, personID: personID,
                people: container.peopleRoom, analytics: container.analytics))
        case .pr3SiteAccess:
            return AnyView(SiteAccessScreen(
                projectID: projectID, people: container.peopleRoom,
                cache: container.peopleRoomCache, session: container.session,
                analytics: container.analytics))
        default:
            return AnyView(ProjectRosterScreen(
                projectID: projectID, people: container.peopleRoom,
                cache: container.peopleRoomCache, session: container.session,
                analytics: container.analytics, coordinator: coordinator))
        }
    }
}

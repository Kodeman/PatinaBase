//  S1AssignVenueScreen.swift
//  Capture
//
//  S1 · Assign — with venue stamp. Tags the specimen to a project / room / shelf
//  while the venue + timestamp ride along automatically (F-08/F-09). Last-used
//  project & room are pre-filled for a fast showroom rhythm. S1 persists only
//  assignment context; S3 owns the destination decision and route() commit.

import Foundation
import SwiftUI
import SwiftData
import CaptureKit
#if DEBUG
import CaptureKitMocks
#endif

struct S1AssignVenueScreen: View {
    let specimen: Specimen?
    let store: CaptureStore
    let location: any LocationService
    let session: any SessionProviding
    let coordinator: CaptureCoordinator
    let analytics: any CaptureAnalytics

    var body: some View {
        Group {
            if let specimen {
                S1Content(
                    specimen: specimen, store: store, location: location,
                    session: session, coordinator: coordinator)
            } else {
                RouteMissingSpecimen()
            }
        }
        .background(CaptureColor.paper3)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .task { analytics.screen(CaptureScreenID.s1Assign.rawValue) }
        .accessibilityIdentifier(CaptureScreenID.s1Assign.rawValue)
    }
}

private struct S1Content: View {
    let specimen: Specimen
    let store: CaptureStore
    let location: any LocationService
    let session: any SessionProviding
    let coordinator: CaptureCoordinator

    @AppStorage("capture.routingSpecimenId") private var routingSpecimenId = ""
    private let sessionContext = CaptureSessionContextStore.shared

    @State private var projects: [CaptureProjectRef] = []
    @State private var selectedProjectId = ""
    @State private var projectName = ""
    @State private var room = ""
    @State private var shelf = ""
    @State private var venueName = ""
    @State private var isStamping = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                RouteSheetHeader(
                    eyebrow: "Route",
                    title: "Route this capture",
                    subtitle: "It already knows where it was found. Add where it belongs.",
                    onClose: { coordinator.dismissSheet() }
                )

                venueChip

                VStack(spacing: 0) {
                    projectField
                    RouteFieldShell(label: "Room") {
                        TextField("Add a room", text: $room)
                            .font(CaptureType.body)
                            .foregroundStyle(CaptureColor.ink)
                    }
                    RouteFieldShell(label: "Shelf") {
                        TextField("Seating · “maybe”", text: $shelf)
                            .font(CaptureType.body)
                            .foregroundStyle(CaptureColor.ink)
                    }
                }
                .routeCard()

                Spacer(minLength: 8)

                RouteActionButton(
                    "Choose destination",
                    systemImage: "arrow.right",
                    kind: .primary
                ) {
                    advance()
                }
            }
            .padding(20)
        }
        .scrollDismissesKeyboard(.interactively)
        .onAppear { load() }
    }

    private var venueChip: some View {
        HStack(spacing: 10) {
            Image(systemName: "smallcircle.filled.circle")
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.verdigris)
            VStack(alignment: .leading, spacing: 2) {
                Text("Venue")
                    .font(CaptureType.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(CaptureColor.inkSoft)
                TextField("Auto-stamped location", text: $venueName)
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.ink)
            }
            Spacer(minLength: 8)
            if isStamping {
                ProgressView().tint(CaptureColor.verdigris)
            } else {
                Image(systemName: "pencil")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
        }
        .routeCard(tint: CaptureColor.paper3)
    }

    private var projectField: some View {
        RouteFieldShell(label: "Project") {
            Menu {
                ForEach(projects, id: \.id) { project in
                    Button(project.name) { select(project) }
                }
                if !projects.isEmpty { Divider() }
                Button {
                    routingSpecimenId = specimen.id.uuidString
                    coordinator.present(.createProject)
                } label: {
                    Label("New project…", systemImage: "plus")
                }
            } label: {
                HStack {
                    Text(projectName.isEmpty ? "Choose a project" : projectName)
                        .font(CaptureType.body)
                        .foregroundStyle(projectName.isEmpty ? CaptureColor.inkSoft : CaptureColor.ink)
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.inkSoft)
                }
            }
        }
    }

    // MARK: Behaviour

    private func load() {
        routingSpecimenId = specimen.id.uuidString
        let descriptor = FetchDescriptor<CaptureProjectRef>(
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        projects = (try? store.context.fetch(descriptor)) ?? []

        let venue = specimen.venue
        let remembered = sessionContext.current(identity: identity).routing
        projectName = venue?.projectName ?? remembered.projectName ?? ""
        selectedProjectId = venue?.projectId ?? remembered.projectID ?? ""
        room = venue?.room ?? remembered.room ?? ""
        shelf = venue?.shelf ?? remembered.shelf ?? ""
        venueName = venue?.placemarkName ?? ""

        if venueName.isEmpty { Task { await stampVenue() } }
    }

    private func select(_ project: CaptureProjectRef) {
        selectedProjectId = project.remoteId ?? project.id.uuidString
        projectName = project.name
    }

    private func stampVenue() async {
        isStamping = true
        defer { isStamping = false }
        guard let stamp = await location.currentVenue() else { return }
        if venueName.isEmpty, let placemark = stamp.placemarkName {
            venueName = placemark
        }
        // Merge GPS facts onto the record now so they persist with the routing.
        var venue = specimen.venue ?? stamp
        venue.latitude = venue.latitude ?? stamp.latitude
        venue.longitude = venue.longitude ?? stamp.longitude
        venue.accuracyMeters = venue.accuracyMeters ?? stamp.accuracyMeters
        if venue.placemarkName == nil { venue.placemarkName = stamp.placemarkName }
        specimen.venue = venue
    }

    private func advance() {
        persistRouting()
        coordinator.present(.destination(specimen.id))
    }

    private func persistRouting() {
        var venue = specimen.venue ?? VenueStamp()
        let trimmedName = venueName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedName.isEmpty { venue.placemarkName = trimmedName }
        venue.projectId = selectedProjectId.isEmpty ? nil : selectedProjectId
        venue.projectName = projectName.isEmpty ? nil : projectName
        venue.room = room.isEmpty ? nil : room
        venue.shelf = shelf.isEmpty ? nil : shelf
        specimen.venue = venue
        specimen.touch()
        try? store.save()

        let priorRouting = sessionContext.current(identity: identity).routing
        sessionContext.remember(
            CaptureRouteSafetyPolicy.updatingAssignment(
                in: priorRouting,
                projectID: selectedProjectId.isEmpty ? nil : selectedProjectId,
                projectName: projectName.isEmpty ? nil : projectName,
                room: room.isEmpty ? nil : room,
                shelf: shelf.isEmpty ? nil : shelf),
            identity: identity)
    }

    private var identity: CaptureSessionIdentity {
        CaptureSessionIdentity(
            userID: session.userID,
            workspaceID: session.workspaceID)
    }
}

#if DEBUG
#Preview {
    let demo = RoutePreviewData.make()
    return S1AssignVenueScreen(
        specimen: demo.specimen,
        store: demo.store,
        location: MockLocationService(),
        session: MockSessionProviding(),
        coordinator: CaptureCoordinator(),
        analytics: MockCaptureAnalytics()
    )
    .modelContainer(demo.store.container)
}
#endif

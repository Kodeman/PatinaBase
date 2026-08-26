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
    let projects: any ProjectsService
    let coordinator: CaptureCoordinator
    let analytics: any CaptureAnalytics

    var body: some View {
        Group {
            if let specimen {
                S1Content(
                    specimen: specimen, store: store, location: location,
                    session: session, projectsService: projects,
                    coordinator: coordinator,
                    analytics: analytics)
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
    let projectsService: any ProjectsService
    let coordinator: CaptureCoordinator
    let analytics: any CaptureAnalytics

    @AppStorage("capture.routingSpecimenId") private var routingSpecimenId = ""
    // One-shot handle set by ViewfinderModel.placeFromCard() and consumed (then
    // cleared) in loadLocalContext() — the only signal that tells S1 it is
    // being presented from the C3 card rather than the deep-link harness, S2,
    // or the session tray, none of which write this key.
    @AppStorage("capture.routingSource") private var routingSource = ""
    private let sessionContext = CaptureSessionContextStore.shared

    @State private var projects: [RoutingProjectOption] = []
    @State private var selectedProjectId = ""
    @State private var projectName = ""
    @State private var selectedProjectRoomId = ""
    @State private var projectDetail: FieldProjectDetail?
    @State private var placementChoice: PlacementChoice = .none
    @State private var projectLoadError: String?
    @State private var isLoadingProject = false
    @State private var room = ""
    @State private var shelf = ""
    @State private var venueName = ""
    @State private var isStamping = false
    @State private var cameFromCard = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                RouteSheetHeader(
                    eyebrow: "Route",
                    title: "Where does this belong?",
                    subtitle: "It already knows where it was found. Add where it belongs.",
                    onClose: {
                        // ✕ used to drop the project she had just picked, silently.
                        persistRouting()
                        coordinator.dismissSheet()
                    }
                )

                venueChip

                VStack(spacing: 0) {
                    projectField
                    projectRoomField
                    placementField
                    RouteFieldShell(label: "Shelf") {
                        TextField("Seating · “maybe”", text: $shelf)
                            .font(CaptureType.body)
                            .foregroundStyle(CaptureColor.ink)
                    }
                }
                .routeCard()

                if let projectLoadError {
                    Label(projectLoadError, systemImage: "wifi.exclamationmark")
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.warning)
                }

                Spacer(minLength: 8)

                RouteActionButton(
                    "Choose destination",
                    systemImage: "arrow.right",
                    kind: .primary
                ) {
                    advance()
                }

                if cameFromCard {
                    RouteActionButton("Done", systemImage: "checkmark", kind: .primary) {
                        persistRouting()
                        coordinator.dismissSheet()
                    }
                }
            }
            .padding(20)
        }
        .scrollDismissesKeyboard(.interactively)
        .task {
            loadLocalContext()
            await loadProjectContext()
        }
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
                    Button(project.name) {
                        Task { await select(project) }
                    }
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

    @ViewBuilder
    private var projectRoomField: some View {
        RouteFieldShell(label: "Project room") {
            Menu {
                Button("Unassigned") { selectRoom(nil) }
                ForEach(projectDetail?.specRooms ?? []) { projectRoom in
                    Button(projectRoom.name) { selectRoom(projectRoom) }
                }
            } label: {
                HStack {
                    Text(room.isEmpty ? "Choose a project room" : room)
                        .font(CaptureType.body)
                        .foregroundStyle(room.isEmpty ? CaptureColor.inkSoft : CaptureColor.ink)
                    Spacer()
                    if isLoadingProject {
                        ProgressView().tint(CaptureColor.verdigris)
                    } else {
                        Image(systemName: "chevron.down")
                            .font(CaptureType.footnote)
                            .foregroundStyle(CaptureColor.inkSoft)
                    }
                }
            }
            .disabled(selectedProjectId.isEmpty || isLoadingProject)
        }
    }

    @ViewBuilder
    private var placementField: some View {
        RouteFieldShell(label: "FF&E schedule") {
            Menu {
                Button("No FF&E line — library, or held for later") {
                    placementChoice = .none
                }
                Button("Create a new line") {
                    placementChoice = .createLine
                }
                if !availableSlots.isEmpty {
                    Divider()
                    Section("Fill an empty slot") {
                        ForEach(availableSlots) { slot in
                            Button(slot.name) {
                                placementChoice = .slot(slot.id)
                            }
                        }
                    }
                }
            } label: {
                HStack {
                    Text(placementLabel)
                        .font(CaptureType.body)
                        .foregroundStyle(
                            placementChoice == .none
                                ? CaptureColor.inkSoft
                                : CaptureColor.ink)
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.inkSoft)
                }
            }
            .disabled(
                selectedProjectId.isEmpty
                    || selectedProjectRoomId.isEmpty
                    || isLoadingProject)
        }
    }

    // MARK: Behaviour

    private func loadLocalContext() {
        routingSpecimenId = specimen.id.uuidString
        // Consume-and-clear: only placeFromCard() ever writes "card" here, so a
        // stale value could otherwise leak the Done primary into a later S1
        // presentation from the deep-link harness, S2, or the session tray.
        cameFromCard = routingSource == "card"
        routingSource = ""

        let localProjects: [CaptureProjectRef]
        if AppConfiguration.runsRealServices {
            if let owner = session.ownerIdentity {
                let ownerUserID = owner.userID
                let ownerWorkspaceID = owner.workspaceID
                let descriptor = FetchDescriptor<CaptureProjectRef>(
                    predicate: #Predicate { project in
                        project.ownerUserID == ownerUserID
                            && project.ownerWorkspaceID == ownerWorkspaceID
                    },
                    sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
                )
                localProjects = (try? store.context.fetch(descriptor)) ?? []
            } else {
                localProjects = []
            }
        } else {
            let descriptor = FetchDescriptor<CaptureProjectRef>(
                sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
            )
            localProjects = (try? store.context.fetch(descriptor)) ?? []
        }
        projects = localProjects.map {
            RoutingProjectOption(
                id: $0.remoteId ?? $0.id.uuidString,
                name: $0.name)
        }

        let venue = specimen.venue
        let remembered = sessionContext.current(identity: identity).routing
        projectName = venue?.projectName ?? remembered.projectName ?? ""
        selectedProjectId = venue?.projectId ?? remembered.projectID ?? ""
        selectedProjectRoomId = venue?.projectRoomId
            ?? specimen.placementRoomId
            ?? remembered.projectRoomID
            ?? ""
        room = venue?.room ?? remembered.room ?? ""
        shelf = venue?.shelf ?? remembered.shelf ?? ""
        venueName = venue?.placemarkName ?? ""
        if let slotID = specimen.placementSlotId {
            placementChoice = .slot(slotID)
        } else if specimen.placementProjectId != nil {
            placementChoice = .createLine
        }

        if venueName.isEmpty { Task { await stampVenue() } }
    }

    private func loadProjectContext() async {
        do {
            let remoteProjects = try await projectsService.listProjects()
                .map { RoutingProjectOption(id: $0.id, name: $0.name) }
            projects = merge(remoteProjects, projects)
            if !selectedProjectId.isEmpty {
                await loadProjectDetail(selectedProjectId)
            }
        } catch {
            projectLoadError =
                "Rooms need signal. This capture still saves — place it when you're back."
        }
    }

    private func select(_ project: RoutingProjectOption) async {
        selectedProjectId = project.id
        projectName = project.name
        selectedProjectRoomId = ""
        room = ""
        placementChoice = .none
        await loadProjectDetail(project.id)
    }

    private func loadProjectDetail(_ projectID: String) async {
        isLoadingProject = true
        projectLoadError = nil
        defer { isLoadingProject = false }
        do {
            projectDetail = try await projectsService.projectDetail(id: projectID)
            if let selected = projectDetail?.specRooms.first(where: {
                $0.id == selectedProjectRoomId
            }) {
                room = selected.name
            }
        } catch {
            projectDetail = nil
            projectLoadError =
                "Rooms need signal. This capture still saves — place it when you're back."
        }
    }

    private func selectRoom(_ projectRoom: FieldProjectRoom?) {
        selectedProjectRoomId = projectRoom?.id ?? ""
        room = projectRoom?.name ?? ""
        placementChoice = .none
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
        venue.projectRoomId = selectedProjectRoomId.isEmpty
            ? nil
            : selectedProjectRoomId
        venue.room = room.isEmpty ? nil : room
        venue.shelf = shelf.isEmpty ? nil : shelf
        specimen.venue = venue
        if !selectedProjectId.isEmpty {
            switch placementChoice {
            case .none:
                specimen.clearProjectPlacement()
            case .createLine:
                specimen.configureProjectPlacement(
                    projectID: selectedProjectId,
                    roomID: selectedProjectRoomId.isEmpty
                        ? nil
                        : selectedProjectRoomId,
                    slotID: nil,
                    category: placementCategory)
            case .slot(let slotID):
                specimen.configureProjectPlacement(
                    projectID: selectedProjectId,
                    roomID: selectedProjectRoomId.isEmpty
                        ? nil
                        : selectedProjectRoomId,
                    slotID: slotID,
                    category: placementCategory)
            }
            analytics.event("spec_book.capture_route_selected", [
                "placement": placementChoice.analyticsValue,
                "has_room": selectedProjectRoomId.isEmpty ? "false" : "true"
            ])
        }
        specimen.touch()
        try? store.save()

        let priorRouting = sessionContext.current(identity: identity).routing
        sessionContext.remember(
            CaptureRouteSafetyPolicy.updatingAssignment(
                in: priorRouting,
                projectID: selectedProjectId.isEmpty ? nil : selectedProjectId,
                projectName: projectName.isEmpty ? nil : projectName,
                room: room.isEmpty ? nil : room,
                shelf: shelf.isEmpty ? nil : shelf,
                projectRoomID: selectedProjectRoomId.isEmpty
                    ? nil
                    : selectedProjectRoomId),
            identity: identity)
    }

    private var identity: CaptureSessionIdentity {
        CaptureSessionIdentity(
            userID: session.userID,
            workspaceID: session.workspaceID)
    }

    private var placementCategory: String? {
        specimen.category == .unknown ? nil : specimen.category.rawValue
    }

    private var availableSlots: [FieldFFEItem] {
        (projectDetail?.ffeItems ?? []).filter {
            $0.isEmptySlot
                && $0.projectRoomID == selectedProjectRoomId
        }
    }

    private var placementLabel: String {
        switch placementChoice {
        case .none:
            return "No FF&E line"
        case .createLine:
            return "Create a new line"
        case .slot(let id):
            return availableSlots.first(where: { $0.id == id })?.name
                ?? "Fill selected slot"
        }
    }

    private func merge(
        _ preferred: [RoutingProjectOption],
        _ fallback: [RoutingProjectOption]
    ) -> [RoutingProjectOption] {
        var seen: Set<String> = []
        return (preferred + fallback).filter { seen.insert($0.id).inserted }
    }
}

private struct RoutingProjectOption: Identifiable {
    let id: String
    let name: String
}

private enum PlacementChoice: Equatable {
    case none
    case createLine
    case slot(String)

    var analyticsValue: String {
        switch self {
        case .none: return "none"
        case .createLine: return "create_line"
        case .slot: return "fill_slot"
        }
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
        projects: MockProjectsService(),
        coordinator: CaptureCoordinator(),
        analytics: MockCaptureAnalytics()
    )
    .modelContainer(demo.store.container)
}
#endif

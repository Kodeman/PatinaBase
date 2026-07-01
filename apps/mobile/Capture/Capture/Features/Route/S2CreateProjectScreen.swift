//  S2CreateProjectScreen.swift
//  Capture
//
//  S2 · Create project inline. The empty-state path for a first capture on a new
//  job — name it (and optionally seed a first room) without leaving capture, then
//  drop straight back into S1 with the new project pre-selected. The CaptureSheet
//  case carries no id, so the active routing specimen is recovered from the
//  shared @AppStorage handle that S1 writes.

import Foundation
import SwiftUI
import SwiftData
import CaptureKit

struct S2CreateProjectScreen: View {
    let store: CaptureStore
    let coordinator: CaptureCoordinator

    @AppStorage("capture.lastProjectId") private var lastProjectId = ""
    @AppStorage("capture.lastProjectName") private var lastProjectName = ""
    @AppStorage("capture.lastRoom") private var lastRoom = ""
    @AppStorage("capture.routingSpecimenId") private var routingSpecimenId = ""

    @State private var name = ""
    @State private var addRoom = false
    @State private var room = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                RouteSheetHeader(
                    eyebrow: "New project",
                    title: "New project",
                    subtitle: "No project yet? Make one without leaving capture.",
                    onClose: { coordinator.dismissSheet() }
                )

                VStack(spacing: 0) {
                    RouteFieldShell(label: "Name") {
                        TextField("Walbridge Residence", text: $name)
                            .font(CaptureType.body)
                            .foregroundStyle(CaptureColor.ink)
                            .textInputAutocapitalization(.words)
                    }
                    if addRoom {
                        RouteFieldShell(label: "First room") {
                            TextField("Living Room", text: $room)
                                .font(CaptureType.body)
                                .foregroundStyle(CaptureColor.ink)
                                .textInputAutocapitalization(.words)
                        }
                    }
                }
                .routeCard()

                if !addRoom {
                    Button {
                        withAnimation { addRoom = true }
                    } label: {
                        Label("Add a room", systemImage: "plus.circle")
                            .font(CaptureType.callout)
                            .foregroundStyle(CaptureColor.verdigrisInk)
                    }
                }

                Spacer(minLength: 8)

                RouteActionButton("Create & assign", systemImage: "checkmark", kind: .primary) {
                    create()
                }
                .disabled(trimmedName.isEmpty)
                .opacity(trimmedName.isEmpty ? 0.5 : 1)

                Text("New projects sync across your devices and the web app.")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
            .padding(20)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(CaptureColor.paper3)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .accessibilityIdentifier(CaptureScreenID.s2CreateProject.rawValue)
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func create() {
        let projectName = trimmedName
        guard !projectName.isEmpty else { return }

        let project = CaptureProjectRef(name: projectName)
        store.context.insert(project)
        try? store.save()

        // Make it the new last-used so S1 pre-selects it.
        lastProjectId = project.id.uuidString
        lastProjectName = projectName
        let trimmedRoom = room.trimmingCharacters(in: .whitespacesAndNewlines)
        if addRoom, !trimmedRoom.isEmpty { lastRoom = trimmedRoom }

        // Return to S1 for the specimen we came from (createProject carries no id).
        if let id = UUID(uuidString: routingSpecimenId) {
            coordinator.present(.assignVenue(id))
        } else {
            coordinator.dismissSheet()
        }
    }
}

#Preview {
    let store = try! CaptureStore.inMemory()
    return S2CreateProjectScreen(store: store, coordinator: CaptureCoordinator())
        .modelContainer(store.container)
}

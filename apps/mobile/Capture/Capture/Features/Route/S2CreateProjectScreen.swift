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
    /// Real mode: inserts into public.projects before caching locally. nil in mock
    /// mode → the local-only path (unchanged harness behavior).
    let projectCreator: (any CaptureProjectCreating)?

    @AppStorage("capture.lastProjectId") private var lastProjectId = ""
    @AppStorage("capture.lastProjectName") private var lastProjectName = ""
    @AppStorage("capture.lastRoom") private var lastRoom = ""
    @AppStorage("capture.routingSpecimenId") private var routingSpecimenId = ""

    @State private var name = ""
    @State private var addRoom = false
    @State private var room = ""
    @State private var creating = false
    @State private var createError: String?

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

                RouteActionButton(creating ? "Creating…" : "Create & assign",
                                  systemImage: "checkmark", kind: .primary) {
                    create()
                }
                .disabled(trimmedName.isEmpty || creating)
                .opacity(trimmedName.isEmpty || creating ? 0.5 : 1)

                if let createError {
                    Label(createError, systemImage: "exclamationmark.triangle")
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.rust)
                }

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
        guard !projectName.isEmpty, !creating else { return }
        createError = nil

        // Mock mode (no creator): local-only, exactly as before.
        guard let projectCreator else {
            persistAndAdvance(name: projectName, remoteId: nil)
            return
        }

        // Real mode: create server-side FIRST; only cache locally on success, so a
        // failure leaves no phantom local project.
        creating = true
        Task { @MainActor in
            defer { creating = false }
            do {
                let remoteId = try await projectCreator.createProject(name: projectName)
                persistAndAdvance(name: projectName, remoteId: remoteId)
            } catch {
                createError = "Couldn’t create it just now — check your connection and try again."
            }
        }
    }

    /// Cache the ref locally (carrying any server id), set the last-used handles
    /// S1 reads, then return to S1. `lastProjectId` is the REMOTE id in real mode
    /// so the venue carries a routable project into the commit RPC.
    private func persistAndAdvance(name projectName: String, remoteId: String?) {
        let project = CaptureProjectRef(remoteId: remoteId, name: projectName)
        store.context.insert(project)
        try? store.save()

        lastProjectId = remoteId ?? project.id.uuidString
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
    // swiftlint:disable:next force_try
    let store = try! CaptureStore.inMemory()
    return S2CreateProjectScreen(store: store, coordinator: CaptureCoordinator(), projectCreator: nil)
        .modelContainer(store.container)
}

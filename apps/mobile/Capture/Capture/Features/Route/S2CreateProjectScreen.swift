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
    let analytics: any CaptureAnalytics
    let session: any SessionProviding
    /// Real mode: inserts into public.projects before caching locally. nil in mock
    /// mode → the local-only path (unchanged harness behavior).
    let projectCreator: (any CaptureProjectCreating)?

    @AppStorage("capture.routingSpecimenId") private var routingSpecimenId = ""
    private let sessionContext = CaptureSessionContextStore.shared

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
                        .foregroundStyle(CaptureColor.error)
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
        .task { analytics.screen(CaptureScreenID.s2CreateProject.rawValue) }
        .accessibilityIdentifier(CaptureScreenID.s2CreateProject.rawValue)
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func create() {
        let projectName = trimmedName
        guard !projectName.isEmpty, !creating else { return }
        createError = nil

        // Mock mode intentionally keeps unowned, global fixtures so the
        // verification harness remains deterministic.
        guard let projectCreator else {
            persistAndAdvance(name: projectName, remoteId: nil, owner: nil)
            return
        }

        guard let owner = session.ownerIdentity else {
            createError = "Choose a workspace before creating a project."
            return
        }

        // Real mode creates server-side first. The captured owner must still be
        // current after the network hop before anything is cached or presented.
        creating = true
        Task { @MainActor in
            defer { creating = false }
            do {
                guard session.ownerIdentity == owner else { return }
                let remoteId = try await projectCreator.createProject(name: projectName)
                guard session.ownerIdentity == owner else { return }
                persistAndAdvance(name: projectName, remoteId: remoteId, owner: owner)
            } catch {
                guard session.ownerIdentity == owner else { return }
                createError = "Couldn’t create it just now — check your connection and try again."
            }
        }
    }

    /// Cache the ref locally (carrying any server id), set the last-used handles
    /// S1 reads, then return to S1. `lastProjectId` is the REMOTE id in real mode
    /// so the venue carries a routable project into the commit RPC.
    private func persistAndAdvance(
        name projectName: String,
        remoteId: String?,
        owner: CaptureOwnerIdentity?
    ) {
        guard owner == nil || session.ownerIdentity == owner else { return }

        let project = CaptureProjectRef(
            remoteId: remoteId,
            name: projectName,
            owner: owner)
        store.context.insert(project)
        try? store.save()

        let trimmedRoom = room.trimmingCharacters(in: .whitespacesAndNewlines)
        let identity = CaptureSessionIdentity(
            userID: session.userID, workspaceID: session.workspaceID)
        let current = sessionContext.current(identity: identity).routing
        sessionContext.remember(
            CaptureRoutingMemory(
                destination: current.destination,
                projectID: remoteId ?? project.id.uuidString,
                projectName: projectName,
                room: addRoom && !trimmedRoom.isEmpty ? trimmedRoom : current.room,
                shelf: current.shelf),
            identity: identity)

        guard owner == nil || session.ownerIdentity == owner else { return }

        // Return to S1 for the specimen we came from (createProject carries no id).
        if let id = UUID(uuidString: routingSpecimenId) {
            coordinator.present(.assignVenue(id))
        } else {
            coordinator.dismissSheet()
        }
    }
}

#if DEBUG
import CaptureKitMocks

#Preview {
    // swiftlint:disable:next force_try
    let store = try! CaptureStore.inMemory()
    return S2CreateProjectScreen(store: store, coordinator: CaptureCoordinator(),
                                 analytics: MockCaptureAnalytics(),
                                 session: MockSessionProviding(), projectCreator: nil)
        .modelContainer(store.container)
}
#endif

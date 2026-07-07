//  SiteScanSetupScreen.swift
//  Capture · Wave F (Pro site-scan)
//
//  F1 · Site-scan setup (`.siteScanSetup`, id `f1ScanSetup`). The designer picks a
//  project, optionally an existing room in it, names the scan, then starts. On
//  Start the choices flow forward: the picked project + room ride the frozen
//  `.siteScan(projectID:projectRoomID:)` route (the room pick is a `public.rooms`
//  id → the scan's `room_id`); the name rides the in-flow `SiteScanHandoff` (the
//  route can't carry it). When no room is picked the uploader creates a
//  designer-owned room from the name field.
//
//  Project picker source (real mode): `SupabaseSiteScanService.ownableProjects()`,
//  NOT the frozen `ProjectsService.listProjects()` — that's RLS-scoped to
//  designer_id OR client_id OR team-member (00168), wider than what migration
//  00258's upload-time guard actually allows (designer_id/created_by only). Listing
//  the wider set here would let a team-member designer pick a project that then
//  fails at F4. See `SiteScanSetupModel.load()`.
//
//  Renders on mocks: MockProjectsService fills the pickers (SiteScanSetupModel
//  falls back to it when `siteScan` isn't the real service), MockSiteScanService
//  reports supported, so the harness shows a populated setup form.

import Foundation
import SwiftUI
import CaptureKit

@MainActor
@Observable
final class SiteScanSetupModel {
    private let projects: any ProjectsService
    private let siteScan: any SiteScanService

    var allProjects: [FieldProject] = []
    var selectedProjectID: String?
    var rooms: [FieldProjectRoom] = []
    var selectedRoomID: String?
    var name: String
    var loadError: String?

    init(projects: any ProjectsService, siteScan: any SiteScanService) {
        self.projects = projects
        self.siteScan = siteScan
        self.name = Self.defaultName()
    }

    var selectedProjectName: String? {
        allProjects.first { $0.id == selectedProjectID }?.name
    }

    func load() async {
        loadError = nil
        do {
            // Real mode: scope the picker to what 00258's guard will actually
            // accept (see this file's header + `ownableProjects()`'s doc).
            // Mock mode (MockSiteScanService, no guard to mirror): fall back to
            // the frozen mock ProjectsService list exactly as before, so the
            // harness screenshot doesn't regress.
            if let supabaseSiteScan = siteScan as? SupabaseSiteScanService {
                allProjects = try await supabaseSiteScan.ownableProjects()
            } else {
                allProjects = try await projects.listProjects()
            }
        } catch {
            loadError = "Couldn't load your projects. Pull to retry."
        }
    }

    /// Load the picked project's rooms; clear the room pick (it belonged to the old project).
    func selectProject(_ id: String?) async {
        selectedProjectID = id
        selectedRoomID = nil
        rooms = []
        guard let id else { return }
        // Room pick is optional — on failure we just make a new room at upload.
        rooms = (try? await projects.projectDetail(id: id).rooms) ?? []
    }

    nonisolated static func defaultName() -> String {
        let df = DateFormatter()
        df.dateStyle = .medium
        df.timeStyle = .none
        return "Site scan \(df.string(from: Date()))"
    }
}

struct SiteScanSetupScreen: View {
    let container: AppContainer
    let coordinator: CaptureCoordinator
    let handoff: SiteScanHandoff

    @State private var model: SiteScanSetupModel

    init(container: AppContainer, coordinator: CaptureCoordinator, handoff: SiteScanHandoff) {
        self.container = container
        self.coordinator = coordinator
        self.handoff = handoff
        _model = State(wrappedValue: SiteScanSetupModel(projects: container.projects,
                                                        siteScan: container.siteScan))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header
                if !container.siteScan.isSupported { lidarCallout }
                if let loadError = model.loadError { inlineError(loadError) }
                projectSection
                if model.selectedProjectID != nil { roomSection }
                nameSection
            }
            .padding(20)
        }
        .background(CaptureColor.paper.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { startBar }
        .navigationTitle("Site scan")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            container.analytics.screen(CaptureScreenID.f1ScanSetup.rawValue)
            await model.load()
        }
        .refreshable { await model.load() }
        .accessibilityIdentifier(CaptureScreenID.f1ScanSetup.rawValue)
    }

    // MARK: Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("New scan")
                .font(CaptureType.eyebrow).textCase(.uppercase)
                .foregroundStyle(CaptureColor.inkSoft)
            Text("Scan a room on site and attach it to a project.")
                .font(CaptureType.callout)
                .foregroundStyle(CaptureColor.inkSoft)
        }
    }

    private var lidarCallout: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle")
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.rust)
                .accessibilityHidden(true)
            Text("This device has no LiDAR, so a real scan isn't available here. You can still walk the demo flow.")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.ink)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(CaptureColor.rust.opacity(0.10)))
        .accessibilityElement(children: .combine)
    }

    private var projectSection: some View {
        SiteScanSection("Project") {
            Menu {
                Button("No project") { Task { await model.selectProject(nil) } }
                ForEach(model.allProjects) { project in
                    Button(project.name) { Task { await model.selectProject(project.id) } }
                }
            } label: {
                SiteScanPickerLabel(value: model.selectedProjectName ?? "No project")
            }
            .accessibilityLabel("Project: \(model.selectedProjectName ?? "none selected")")
        }
    }

    private var roomSection: some View {
        SiteScanSection("Room") {
            Menu {
                Button("New room from name") { model.selectedRoomID = nil }
                ForEach(model.rooms) { room in
                    Button(room.name) { model.selectedRoomID = room.id }
                }
            } label: {
                SiteScanPickerLabel(value: selectedRoomName)
            }
            .accessibilityLabel("Room: \(selectedRoomName)")
        }
    }

    private var nameSection: some View {
        SiteScanSection("Scan name") {
            TextField("Scan name", text: $model.name)
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.ink)
                .textInputAutocapitalization(.words)
                .accessibilityLabel("Scan name")
        }
    }

    private var startBar: some View {
        Button(action: start) {
            Text(container.siteScan.isSupported ? "Start scan" : "Start demo scan")
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.paper3)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .background(CaptureColor.verdigris, in: RoundedRectangle(cornerRadius: 12))
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial)
        .accessibilityLabel("Start scan")
    }

    private var selectedRoomName: String {
        model.rooms.first { $0.id == model.selectedRoomID }?.name ?? "New room from name"
    }

    private func inlineError(_ message: String) -> some View {
        Text(message)
            .font(CaptureType.footnote)
            .foregroundStyle(CaptureColor.rust)
    }

    private func start() {
        let trimmed = model.name.trimmingCharacters(in: .whitespacesAndNewlines)
        handoff.name = trimmed.isEmpty ? SiteScanSetupModel.defaultName() : trimmed
        handoff.projectName = model.selectedProjectName
        container.analytics.event("siteScan.start", [
            "has_project": model.selectedProjectID != nil ? "true" : "false",
            "has_room": model.selectedRoomID != nil ? "true" : "false"
        ])
        coordinator.navigate(to: .siteScan(projectID: model.selectedProjectID,
                                           projectRoomID: model.selectedRoomID))
    }
}

#if DEBUG
#Preview("F1 · Setup") {
    let container = AppContainer()
    return NavigationStack {
        SiteScanSetupScreen(container: container,
                            coordinator: CaptureCoordinator(),
                            handoff: SiteScanHandoff())
    }
}
#endif

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
import PatinaDesignKit

@MainActor
@Observable
final class SiteScanSetupModel {
    private let projects: any ProjectsService
    private let siteScan: any SiteScanService
    private let session: any SessionProviding
    private let sessionContext = CaptureSessionContextStore.shared

    var allProjects: [FieldProject] = []
    var selectedProjectID: String?
    var rooms: [FieldProjectRoom] = []
    var selectedRoomID: String?
    var name: String
    var loadError: String?
    /// The open visit, refreshed on every `load()`. F1's Flow-4 collapse reads
    /// this, not a fresh lookup, so `setupState` stays a pure read of stored state.
    private(set) var visitState: CaptureVisitState = .none
    /// Task 28: the `room_scans_guard_routing` (00258) tiebreak — see `load()`.
    private(set) var ownableProjectIDs: [String] = []

    init(projects: any ProjectsService, siteScan: any SiteScanService, session: any SessionProviding) {
        self.projects = projects
        self.siteScan = siteScan
        self.session = session
        self.name = Self.defaultName()
    }

    var selectedProjectName: String? {
        allProjects.first { $0.id == selectedProjectID }?.name
    }

    /// Spec §7.10 / Flow 4. Pure over its stored inputs — `loadError` (a failed
    /// load, not a guard failure) is handled at the call site, in
    /// `SiteScanSetupScreen.body`, so it never gets reported as "isn't a project
    /// you can attach a scan to".
    var setupState: FieldScanSetupState {
        FieldScanSetupPolicy.state(visitState: visitState,
                                   ownableProjectIDs: ownableProjectIDs,
                                   scanRoomIsAvailable: !rooms.isEmpty)
    }

    func load() async {
        loadError = nil
        visitState = sessionContext.visitState(identity: CaptureSessionIdentity(
            userID: session.userID, workspaceID: session.workspaceID))
        do {
            // Real mode: `allProjects` here IS `ownableProjects()`'s own result —
            // it already mirrors 00258's guard (see this file's header +
            // `ownableProjects()`'s doc) — so it doubles as the tiebreak's list
            // with no second network round trip.
            //
            // Mock mode (MockSiteScanService): there is no `room_scans` guard to
            // mirror, so there is nothing narrower to scope the tiebreak to.
            // Deliberately treat every mock project as ownable — never widen the
            // REAL guard (real mode never reaches this branch) — so the harness's
            // populated setup-form screenshot doesn't regress.
            if let supabaseSiteScan = siteScan as? SupabaseSiteScanService {
                allProjects = try await supabaseSiteScan.ownableProjects()
            } else {
                allProjects = try await projects.listProjects()
            }
            ownableProjectIDs = allProjects.map(\.id)
        } catch {
            loadError = "Couldn't load your projects. Pull to retry."
            return
        }
        // Only a `.site` visit whose project already clears the ownable-projects
        // guard is worth a rooms fetch: it pre-answers F1's scan lane, and
        // `setupState` needs `rooms` to tell "collapsed" from "no client rooms
        // yet" apart. A visit whose project fails the guard skips this — the
        // reason is already decided without knowing about rooms at all.
        if let context = visitState.context, context.kind == .site,
           let projectID = context.routing.projectID,
           ownableProjectIDs.contains(projectID) {
            await selectProject(projectID)
            if case .collapsed = setupState {
                selectedRoomID = context.scanRoomID
            }
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
        "Site scan \(CaptureDates.mediumDate(Date()))"
    }
}

struct SiteScanSetupScreen: View {
    let container: AppContainer
    let coordinator: CaptureCoordinator
    let handoff: SiteScanHandoff

    @State private var model: SiteScanSetupModel
    @State private var showContextCapture = false

    /// Pro (LiDAR) → instrumented scan; non-Pro → context capture only (R108.2).
    private var entryMode: SiteScanEntryMode {
        .forDevice(lidarSupported: container.siteScan.isSupported)
    }

    init(container: AppContainer, coordinator: CaptureCoordinator, handoff: SiteScanHandoff) {
        self.container = container
        self.coordinator = coordinator
        self.handoff = handoff
        _model = State(wrappedValue: SiteScanSetupModel(projects: container.projects,
                                                        siteScan: container.siteScan,
                                                        session: container.session))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header
                if !container.siteScan.isSupported { lidarCallout }
                if let loadError = model.loadError {
                    // A failed load is "we couldn't check", never the guard's
                    // "isn't a project you can attach a scan to" — so it takes
                    // the full form, not `setupState`'s reason copy.
                    inlineError(loadError)
                    projectSection
                    if model.selectedProjectID != nil { roomSection }
                } else {
                    switch model.setupState {
                    case .collapsed(let summary):
                        collapsedScanLane(summary: summary)
                    case .expanded(let reason):
                        Text(reason)
                            .font(CaptureType.footnote)
                            .foregroundStyle(CaptureColor.warning)
                        projectSection
                        if model.selectedProjectID != nil { roomSection }
                    }
                }
                nameSection
            }
            .padding(20)
        }
        .background(CaptureColor.paper.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { startBar }
        .fullScreenCover(isPresented: $showContextCapture) {
            SiteScanContextScreen(container: container,
                                  projectID: model.selectedProjectID,
                                  projectRoomID: model.selectedRoomID,
                                  onDone: { showContextCapture = false })
        }
        .navigationTitle("Site scan")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            container.analytics.screen(CaptureScreenID.f1ScanSetup.rawValue)
            await model.load()
            if coordinator.siteScanContextRequested {
                coordinator.siteScanContextRequested = false
                showContextCapture = true
            }
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
                .foregroundStyle(CaptureColor.terracotta)
                .accessibilityHidden(true)
            Text("This device has no LiDAR — capture reference photos and voice notes for this room instead. They reach the studio as soon as you have signal.")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.ink)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(CaptureColor.terracotta.opacity(0.10)))
        .accessibilityElement(children: .combine)
    }

    /// Spec §7.10 / Flow 4: inside a `.site` visit whose project already cleared
    /// the upload guard, F1 collapses to one line instead of asking her to pick
    /// a project and room she already answered at the door.
    private func collapsedScanLane(summary: String) -> some View {
        HStack(spacing: 8) {
            Text(summary)
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.ink)
            Spacer()
            Button("Change") { coordinator.present(.visit) }
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.verdigrisInk)
                .frame(minHeight: 44)
        }
        .accessibilityIdentifier("scan.setup.collapsed")
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
        PatinaButton(entryMode == .scan ? "Start scan" : "Capture photos & notes",
                     style: .clay, action: start)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(.ultraThinMaterial)
            .accessibilityLabel(entryMode == .scan ? "Start scan" : "Capture photos and notes")
    }

    private var selectedRoomName: String {
        model.rooms.first { $0.id == model.selectedRoomID }?.name ?? "New room from name"
    }

    private func inlineError(_ message: String) -> some View {
        Text(message)
            .font(CaptureType.footnote)
            .foregroundStyle(CaptureColor.error)
    }

    private func start() {
        let trimmed = model.name.trimmingCharacters(in: .whitespacesAndNewlines)
        handoff.name = trimmed.isEmpty ? SiteScanSetupModel.defaultName() : trimmed
        handoff.projectName = model.selectedProjectName
        container.analytics.event("siteScan.start", [
            "has_project": model.selectedProjectID != nil ? "true" : "false",
            "has_room": model.selectedRoomID != nil ? "true" : "false"
        ])
        // Pro → instrumented scan; non-Pro → context capture only (never a scan, R108.2).
        if entryMode == .scan {
            coordinator.navigate(to: .siteScan(projectID: model.selectedProjectID,
                                               projectRoomID: model.selectedRoomID))
        } else {
            showContextCapture = true
        }
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

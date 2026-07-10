//  ProjectListScreen.swift
//  Capture · Wave P (Projects)
//
//  P1 · Projects (route `.projectList`, id `p1ProjectList`). The designer's
//  RLS-scoped projects, most-recent first: name, status chip, client line,
//  updated-at in mono. Pull to refresh; a row pushes P2 (`.project(id)`).
//  Renders identically on mocks (previews / `-CaptureScreen` harness use
//  MockProjectsService) and against the real Supabase service on device.

import SwiftUI
import CaptureKit

// MARK: - Model

@MainActor
@Observable
final class ProjectListModel {
    private let projects: any ProjectsService
    private let analytics: any CaptureAnalytics

    var items: [FieldProject] = []
    var isLoading = false
    var errorMessage: String?
    private var hasLoaded = false

    init(projects: any ProjectsService, analytics: any CaptureAnalytics) {
        self.projects = projects
        self.analytics = analytics
    }

    /// One screen call per appearance; the fetch only runs on first appear
    /// (returning from P2 keeps the list as-is — pull to refresh reloads).
    func appear() async {
        analytics.screen(CaptureScreenID.p1ProjectList.rawValue)
        guard !hasLoaded else { return }
        await load()
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            items = try await projects.listProjects()
            hasLoaded = true
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func open(_ project: FieldProject, coordinator: CaptureCoordinator) {
        analytics.event("projects.open_project", ["status": project.status])
        coordinator.navigate(to: .project(project.id))
    }
}

// MARK: - Screen

struct ProjectListScreen: View {
    @State private var model: ProjectListModel
    let coordinator: CaptureCoordinator

    init(projects: any ProjectsService, analytics: any CaptureAnalytics,
         coordinator: CaptureCoordinator) {
        _model = State(wrappedValue: ProjectListModel(projects: projects, analytics: analytics))
        self.coordinator = coordinator
    }

    var body: some View {
        ZStack {
            CaptureColor.paper.ignoresSafeArea()
            content
        }
        .navigationTitle("Projects")
        .navigationBarTitleDisplayMode(.large)
        .task { await model.appear() }
        .accessibilityIdentifier(CaptureScreenID.p1ProjectList.rawValue)
    }

    @ViewBuilder private var content: some View {
        if let message = model.errorMessage, model.items.isEmpty {
            ProjectsErrorState(message: message) { await model.load() }
        } else if model.isLoading && model.items.isEmpty {
            ProgressView()
                .tint(CaptureColor.inkSoft)
        } else if model.items.isEmpty {
            emptyState
        } else {
            list
        }
    }

    private var list: some View {
        ScrollView {
            VStack(spacing: 14) {
                // A failed refresh with stale rows still on screen surfaces the
                // error (same banner idiom as D1's DecisionListScreen) rather
                // than silently keeping the old list with no sign the
                // pull-to-refresh didn't land.
                if let message = model.errorMessage {
                    inlineErrorBanner(message)
                }
                VStack(spacing: 0) {
                    ForEach(model.items) { project in
                        if project.id != model.items.first?.id {
                            Divider().background(CaptureColor.line)
                        }
                        row(project)
                    }
                }
                .projectsCard()
            }
            .padding(20)
        }
        .refreshable { await model.load() }
    }

    /// Shown above the (still-visible, stale) list when a refresh fails —
    /// distinct from `ProjectsErrorState`, which replaces the whole screen
    /// only when there are no rows to fall back on.
    private func inlineErrorBanner(_ message: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle")
                .foregroundStyle(CaptureColor.error)
            Text(message)
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.error)
            Spacer()
            Button("Retry") { Task { await model.load() } }
                .font(CaptureType.footnote.weight(.semibold))
                .foregroundStyle(CaptureColor.error)
        }
        .padding(12)
        .background(CaptureColor.error.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
    }

    private func row(_ project: FieldProject) -> some View {
        Button {
            model.open(project, coordinator: coordinator)
        } label: {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(project.name)
                        .font(CaptureType.bodyEmph)
                        .foregroundStyle(CaptureColor.ink)
                        .multilineTextAlignment(.leading)
                    if let subtitle = subtitle(for: project) {
                        Text(subtitle)
                            .font(CaptureType.footnote)
                            .foregroundStyle(CaptureColor.inkSoft)
                    }
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 6) {
                    if !project.status.isEmpty {
                        ProjectTintChip(
                            text: ProjectsFormat.humanize(project.status),
                            tint: ProjectsFormat.projectStatusTint(project.status)
                        )
                    }
                    Text(ProjectsFormat.shortDate(project.updatedAt))
                        .font(CaptureType.monoSmall)
                        .foregroundStyle(CaptureColor.inkSoft)
                }
                Image(systemName: "chevron.right")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.line2)
                    .padding(.top, 4)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel(for: project))
        .accessibilityHint("Opens the project")
    }

    /// "The Ashfords · Procurement" — whichever of client / phase exists.
    private func subtitle(for project: FieldProject) -> String? {
        let parts = [project.clientName, project.phaseLabel].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private func accessibilityLabel(for project: FieldProject) -> String {
        var parts = [project.name]
        if let client = project.clientName { parts.append("client \(client)") }
        if !project.status.isEmpty { parts.append(ProjectsFormat.humanize(project.status)) }
        if let updated = project.updatedAt {
            parts.append("updated \(CaptureDates.mediumDate(updated))")
        }
        return parts.joined(separator: ", ")
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "folder")
                .font(CaptureType.display)
                .foregroundStyle(CaptureColor.inkSoft)
            Text("No projects yet")
                .font(CaptureType.title2)
                .foregroundStyle(CaptureColor.ink)
            Text("They'll appear when you're the lead designer.")
                .font(CaptureType.callout)
                .foregroundStyle(CaptureColor.inkSoft)
                .multilineTextAlignment(.center)
        }
        .padding(24)
    }
}

#if DEBUG
import CaptureKitMocks

#Preview("Project list") {
    NavigationStack {
        ProjectListScreen(
            projects: MockProjectsService(),
            analytics: MockCaptureAnalytics(),
            coordinator: CaptureCoordinator()
        )
    }
}
#endif

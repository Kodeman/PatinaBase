//  ProjectDetailScreen.swift
//  Capture · Wave P (Projects)
//
//  P2 · Project detail (route `.project(id)`, id `p2ProjectDetail`). Header
//  (name, status chip, client), then Phases (ordered, status ticks),
//  Milestones (label, mono amount, due date, status), FF&E (grouped by room
//  label when present), and Rooms. One detail fetch feeds every section
//  (single spinner per the brief); failures render inline with retry.
//
//  Room data comes from two different tables — see SupabaseProjectsService:
//  FF&E group labels are `project_rooms` names; the Rooms section is the
//  client's actual `public.rooms` (the ids site-scan uploads attach to).

import SwiftUI
import CaptureKit

// MARK: - Model

@MainActor
@Observable
final class ProjectDetailModel {
    private let projectID: String
    private let projects: any ProjectsService
    private let analytics: any CaptureAnalytics

    var detail: FieldProjectDetail?
    var isLoading = false
    var errorMessage: String?
    private var hasLoaded = false

    init(projectID: String, projects: any ProjectsService, analytics: any CaptureAnalytics) {
        self.projectID = projectID
        self.projects = projects
        self.analytics = analytics
    }

    func appear() async {
        analytics.screen(CaptureScreenID.p2ProjectDetail.rawValue)
        guard !hasLoaded else { return }
        await load()
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            detail = try await projects.projectDetail(id: projectID)
            hasLoaded = true
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    /// FF&E grouped by room label; named rooms alphabetical, unassigned last.
    var ffeGroups: [(room: String?, items: [FieldFFEItem])] {
        guard let items = detail?.ffeItems, !items.isEmpty else { return [] }
        let grouped = Dictionary(grouping: items) { $0.roomName }
        return grouped
            .map { (room: $0.key, items: $0.value) }
            .sorted { lhs, rhs in
                switch (lhs.room, rhs.room) {
                case let (left?, right?): return left < right
                case (nil, _): return false
                case (_, nil): return true
                }
            }
    }
}

// MARK: - Screen

struct ProjectDetailScreen: View {
    @State private var model: ProjectDetailModel
    let coordinator: CaptureCoordinator

    init(projectID: String, projects: any ProjectsService,
         analytics: any CaptureAnalytics, coordinator: CaptureCoordinator) {
        _model = State(wrappedValue: ProjectDetailModel(
            projectID: projectID, projects: projects, analytics: analytics))
        self.coordinator = coordinator
    }

    var body: some View {
        ZStack {
            CaptureColor.paper.ignoresSafeArea()
            content
        }
        .navigationTitle(model.detail?.project.name ?? "Project")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.appear() }
        .accessibilityIdentifier(CaptureScreenID.p2ProjectDetail.rawValue)
    }

    @ViewBuilder private var content: some View {
        if let message = model.errorMessage, model.detail == nil {
            ProjectsErrorState(message: message) { await model.load() }
        } else if let detail = model.detail {
            loaded(detail)
        } else {
            ProgressView()
                .tint(CaptureColor.inkSoft)
        }
    }

    private func loaded(_ detail: FieldProjectDetail) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header(detail.project)
                if !detail.phases.isEmpty { phasesSection(detail.phases) }
                if !detail.milestones.isEmpty { milestonesSection(detail.milestones) }
                if !detail.ffeItems.isEmpty { ffeSection(detail.ffeItems) }
                if !detail.rooms.isEmpty { roomsSection(detail.rooms) }
                if detail.phases.isEmpty && detail.milestones.isEmpty
                    && detail.ffeItems.isEmpty && detail.rooms.isEmpty {
                    Text("Nothing on file for this project yet.")
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.inkSoft)
                        .padding(.horizontal, 4)
                }
            }
            .padding(20)
        }
        .refreshable { await model.load() }
    }

    // MARK: Header

    private func header(_ project: FieldProject) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(project.name)
                .font(CaptureType.title)
                .foregroundStyle(CaptureColor.ink)
            HStack(spacing: 10) {
                if !project.status.isEmpty {
                    ProjectTintChip(
                        text: ProjectsFormat.humanize(project.status),
                        tint: ProjectsFormat.projectStatusTint(project.status)
                    )
                }
                if let client = project.clientName {
                    Text(client)
                        .font(CaptureType.callout)
                        .foregroundStyle(CaptureColor.inkSoft)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: Phases

    private func phasesSection(_ phases: [FieldProjectPhase]) -> some View {
        let ordered = phases.sorted { $0.sortOrder < $1.sortOrder }
        return section("Phases") {
            ForEach(ordered) { phase in
                if phase.id != ordered.first?.id { divider }
                phaseRow(phase)
            }
        }
    }

    private func phaseRow(_ phase: FieldProjectPhase) -> some View {
        HStack(spacing: 12) {
            Image(systemName: phaseTickSymbol(phase.status))
                .font(CaptureType.body)
                .foregroundStyle(ProjectsFormat.lifecycleTint(phase.status))
                .accessibilityHidden(true)
            Text(phase.name)
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.ink)
            Spacer(minLength: 12)
            Text(ProjectsFormat.humanize(phase.status))
                .font(CaptureType.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(ProjectsFormat.lifecycleTint(phase.status))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
        .accessibilityElement(children: .combine)
    }

    /// Status tick: done = filled check, in-flight = half-filled, stuck =
    /// warning, not started = empty circle. Vocabulary tolerant of both the
    /// real CHECK values (pending/in_progress/completed/delayed) and the
    /// mocks' (not_started/complete).
    private func phaseTickSymbol(_ status: String) -> String {
        let s = status.lowercased()
        if s.contains("complet") { return "checkmark.circle.fill" }
        if s.contains("delay") || s.contains("block") { return "exclamationmark.circle" }
        if s.contains("progress") { return "circle.lefthalf.filled" }
        return "circle"
    }

    // MARK: Milestones

    private func milestonesSection(_ milestones: [FieldMilestone]) -> some View {
        section("Milestones") {
            ForEach(milestones) { milestone in
                if milestone.id != milestones.first?.id { divider }
                milestoneRow(milestone)
            }
        }
    }

    private func milestoneRow(_ milestone: FieldMilestone) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(milestone.label)
                    .font(CaptureType.body)
                    .foregroundStyle(CaptureColor.ink)
                Text(milestone.dueDate.map { "Due \(ProjectsFormat.shortDate($0))" } ?? "No due date")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
            Spacer(minLength: 12)
            VStack(alignment: .trailing, spacing: 6) {
                Text(ProjectsFormat.money(cents: milestone.amountCents))
                    .font(CaptureType.monoBody)
                    .foregroundStyle(CaptureColor.ink)
                ProjectTintChip(
                    text: ProjectsFormat.humanize(milestone.status),
                    tint: ProjectsFormat.milestoneTint(milestone.status)
                )
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
        .accessibilityElement(children: .combine)
    }

    // MARK: FF&E

    private func ffeSection(_ items: [FieldFFEItem]) -> some View {
        section("FF&E · \(items.count)") {
            ForEach(Array(model.ffeGroups.enumerated()), id: \.offset) { index, group in
                if index != 0 { divider }
                // Group label = project_rooms name (scope room, 00066) — NOT
                // the client's public.rooms listed in the Rooms section.
                if let room = group.room {
                    Text("\(room) · \(group.items.count)")
                        .font(CaptureType.eyebrow)
                        .textCase(.uppercase)
                        .foregroundStyle(CaptureColor.inkSoft)
                        .padding(.horizontal, 16)
                        .padding(.top, 12)
                        .padding(.bottom, 2)
                } else if model.ffeGroups.count > 1 {
                    Text("Unassigned · \(group.items.count)")
                        .font(CaptureType.eyebrow)
                        .textCase(.uppercase)
                        .foregroundStyle(CaptureColor.inkSoft)
                        .padding(.horizontal, 16)
                        .padding(.top, 12)
                        .padding(.bottom, 2)
                }
                ForEach(group.items) { item in
                    ffeRow(item)
                }
            }
        }
    }

    private func ffeRow(_ item: FieldFFEItem) -> some View {
        HStack(spacing: 12) {
            Text(item.name)
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.ink)
            Spacer(minLength: 12)
            ProjectTintChip(
                text: ProjectsFormat.humanize(item.status),
                tint: ProjectsFormat.lifecycleTint(item.status)
            )
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
        .accessibilityElement(children: .combine)
    }

    // MARK: Rooms

    /// The client's actual `public.rooms` (00019) — the rooms a site scan
    /// can attach to (`room_scans.room_id`), not the FF&E scope labels.
    private func roomsSection(_ rooms: [FieldProjectRoom]) -> some View {
        section("Rooms · \(rooms.count)") {
            ForEach(rooms) { room in
                if room.id != rooms.first?.id { divider }
                HStack(spacing: 12) {
                    Image(systemName: "square.split.bottomrightquarter")
                        .font(CaptureType.body)
                        .foregroundStyle(CaptureColor.inkSoft)
                        .accessibilityHidden(true)
                    Text(room.name)
                        .font(CaptureType.body)
                        .foregroundStyle(CaptureColor.ink)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 13)
            }
        }
    }

    // MARK: Section chrome (SettingsScreen idiom)

    private func section<Content: View>(_ title: String,
                                        @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(CaptureType.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(CaptureColor.brass)
                .padding(.leading, 4)
            VStack(alignment: .leading, spacing: 0) { content() }
                .frame(maxWidth: .infinity, alignment: .leading)
                .projectsCard()
        }
    }

    private var divider: some View {
        Rectangle().fill(CaptureColor.line).frame(height: 1).padding(.leading, 16)
    }
}

#if DEBUG
import CaptureKitMocks

#Preview("Project detail") {
    NavigationStack {
        ProjectDetailScreen(
            projectID: WorkFixtures.projectID,
            projects: MockProjectsService(),
            analytics: MockCaptureAnalytics(),
            coordinator: CaptureCoordinator()
        )
    }
}
#endif

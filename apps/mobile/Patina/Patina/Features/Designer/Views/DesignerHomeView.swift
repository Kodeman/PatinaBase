//
//  DesignerHomeView.swift
//  Patina
//
//  Designer-mode home: dashboard with active projects, leads, pending
//  decisions, and unread messages. Tapping a card navigates into the
//  matching detail surface.
//

import SwiftUI

struct DesignerHomeView: View {
    @Environment(\.appCoordinator) private var coordinator
    @State private var viewModel = DesignerHomeViewModel()
    /// Drives the contextual help-panel sheet attached to the Designer surface.
    /// Toggled by the `?` button in the dashboard header.
    @State private var isHelpPanelPresented: Bool = false

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 24) {
                header

                if viewModel.isLoading && allEmpty {
                    loadingView
                } else {
                    quickActions
                    projectsSection
                    leadsSection
                    decisionsSection
                    messagesSection
                }
            }
            .padding(.bottom, 120)
        }
        .background(PatinaColors.offWhite)
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
        .onAppear {
            // mainHomeView resolves to DesignerHomeView implicitly (without
            // an explicit navigate(.designerHome) call), so the Companion
            // context defaults to .heroFrame and the "What next?" sheet
            // shows the consumer action set. Drive the coordinator to
            // .designerHome here so the sheet picks up the designer-mode
            // entries (Projects / Decisions / Messages / Consumer view).
            if coordinator.currentScreen != .designerHome {
                coordinator.navigate(to: .designerHome)
            }
        }
        // Contextual help panel — surfaces every Sanity article whose
        // surfaceKey is `ios-app/designer` or a child of it.
        .helpPanel(
            isPresented: $isHelpPanelPresented,
            surfaceKey: SurfaceKeys.IOSApp.Designer.root
        )
    }

    private var allEmpty: Bool {
        viewModel.projects.isEmpty
            && viewModel.leads.isEmpty
            && viewModel.pendingDecisions.isEmpty
            && viewModel.threads.isEmpty
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 6) {
                MonoLabel(text: "DESIGNER")
                    .tracking(2)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("Your studio today")
                        .font(PatinaTypography.h2)
                        .foregroundColor(PatinaColors.charcoal)
                    // Contextual help: explains what the "studio today"
                    // dashboard shows — the morning brief of designer state
                    // across projects, leads, decisions, and conversations.
                    HelpInfoIcon(
                        surfaceKey: SurfaceKeys.IOSApp.Designer.studioToday,
                        fallback: "Your studio today is a morning brief: active projects, open leads, decisions awaiting the client, and the conversations you owe a reply.",
                        size: 14
                    )
                }
                Text("\(viewModel.activeProjects.count) active · \(viewModel.leads.count) open lead\(viewModel.leads.count == 1 ? "" : "s") · \(viewModel.pendingDecisions.count) decision\(viewModel.pendingDecisions.count == 1 ? "" : "s")")
                    .font(PatinaTypography.caption)
                    .foregroundColor(PatinaColors.agedOak)
            }
            Spacer()
            // `?` help-panel trigger — surfaces every help article for the
            // Designer-mode home surface in a sheet.
            Button {
                isHelpPanelPresented = true
            } label: {
                Image(systemName: "questionmark.circle")
                    .font(.system(size: 17, weight: .regular))
                    .foregroundStyle(PatinaColors.mocha)
                    .frame(width: 36, height: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Help")
            .accessibilityHint("Opens the help panel for the designer dashboard.")
            .accessibilityIdentifier("DesignerHomeView.HelpButton")
        }
        .padding(.top, 56)
        .padding(.horizontal, 24)
    }

    // MARK: - Quick actions

    private var quickActions: some View {
        HStack(spacing: 12) {
            statCard(title: "Projects", value: viewModel.activeProjects.count, icon: "rectangle.stack", color: PatinaColors.clay) {
                coordinator.navigate(to: .projectList)
            }
            statCard(title: "Decisions", value: viewModel.pendingDecisions.count, icon: "checkmark.seal", color: PatinaColors.sage) {
                coordinator.navigate(to: .decisionList)
            }
            statCard(title: "Messages", value: viewModel.threads.count, icon: "bubble.left.and.bubble.right", color: PatinaColors.dustyBlue) {
                coordinator.navigate(to: .threadList)
            }
        }
        .padding(.horizontal, 24)
    }

    private func statCard(title: String, value: Int, icon: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Image(systemName: icon)
                        .font(.system(size: 16))
                        .foregroundColor(color)
                    Spacer()
                    Text("\(value)")
                        .font(PatinaTypography.h4)
                        .foregroundColor(PatinaColors.charcoal)
                }
                Text(title)
                    .font(PatinaTypography.uiSmall)
                    .foregroundColor(PatinaColors.mocha)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PatinaColors.softCream)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Sections

    private var projectsSection: some View {
        Section(title: "Active projects", showAllAction: viewModel.projects.isEmpty ? nil : { coordinator.navigate(to: .projectList) }) {
            if viewModel.activeProjects.isEmpty {
                emptyRow("No active projects yet")
            } else {
                ForEach(viewModel.activeProjects.prefix(3)) { project in
                    projectRow(project)
                }
            }
        }
    }

    private var leadsSection: some View {
        Section(
            title: "Open leads",
            helpSurfaceKey: SurfaceKeys.IOSApp.Designer.openLead,
            helpFallback: "Open leads are clients who've reached out but haven't been booked into a project yet — your funnel into a new engagement."
        ) {
            if viewModel.leads.isEmpty {
                emptyRow("No open leads")
            } else {
                ForEach(viewModel.leads.prefix(3)) { lead in
                    leadRow(lead)
                }
            }
        }
    }

    private var decisionsSection: some View {
        Section(
            title: "Awaiting decision",
            helpSurfaceKey: SurfaceKeys.IOSApp.Designer.pendingDecision,
            helpFallback: "A decision is a moment where work is blocked on client approval — sign-offs, selection between options, change orders. Patina tracks who owes whom what.",
            showAllAction: viewModel.pendingDecisions.isEmpty ? nil : { coordinator.navigate(to: .decisionList) }
        ) {
            if viewModel.pendingDecisions.isEmpty {
                emptyRow("No decisions waiting on the client")
            } else {
                ForEach(viewModel.pendingDecisions.prefix(3)) { decision in
                    decisionRow(decision)
                }
            }
        }
    }

    private var messagesSection: some View {
        Section(title: "Conversations", showAllAction: viewModel.threads.isEmpty ? nil : { coordinator.navigate(to: .threadList) }) {
            if viewModel.threads.isEmpty {
                emptyRow("No conversations yet")
            } else {
                ForEach(viewModel.threads.prefix(3)) { thread in
                    threadRow(thread)
                }
            }
        }
    }

    // MARK: - Rows

    private func projectRow(_ project: RemoteProject) -> some View {
        Button {
            coordinator.navigate(to: .projectDetail(projectId: project.id))
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(project.name)
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundColor(PatinaColors.charcoal)
                    Text(project.current_phase ?? project.status?.capitalized ?? "—")
                        .font(PatinaTypography.caption)
                        .foregroundColor(PatinaColors.agedOak)
                }
                Spacer()
                if let total = project.total_amount_cents ?? project.budget_cents {
                    Text(formatPrice(total))
                        .font(PatinaTypography.monoTiny)
                        .foregroundColor(PatinaColors.mocha)
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 12))
                    .foregroundColor(PatinaColors.agedOak)
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 16)
        }
        .buttonStyle(.plain)
    }

    private func leadRow(_ lead: RemoteLead) -> some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(lead.project_type?.replacingOccurrences(of: "_", with: " ").capitalized ?? "Consultation")
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundColor(PatinaColors.charcoal)
                Text(lead.project_description ?? "No description")
                    .font(PatinaTypography.caption)
                    .foregroundColor(PatinaColors.agedOak)
                    .lineLimit(2)
            }
            Spacer()
            Text(lead.budget_range ?? "")
                .font(PatinaTypography.monoTiny)
                .foregroundColor(PatinaColors.mocha)
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
    }

    private func decisionRow(_ decision: RemoteClientDecision) -> some View {
        Button {
            coordinator.navigate(to: .decisionDetail(decisionId: decision.id))
        } label: {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(decision.title ?? "Untitled decision")
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundColor(PatinaColors.charcoal)
                    Text(decision.description ?? "")
                        .font(PatinaTypography.caption)
                        .foregroundColor(PatinaColors.agedOak)
                        .lineLimit(2)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 12))
                    .foregroundColor(PatinaColors.agedOak)
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 16)
        }
        .buttonStyle(.plain)
    }

    private func threadRow(_ thread: RemoteCommsThread) -> some View {
        Button {
            coordinator.navigate(to: .threadDetail(threadId: thread.id))
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(thread.title ?? thread.kind.capitalized)
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundColor(PatinaColors.charcoal)
                    Text(thread.last_message_at ?? "")
                        .font(PatinaTypography.monoTiny)
                        .foregroundColor(PatinaColors.agedOak)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 12))
                    .foregroundColor(PatinaColors.agedOak)
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 16)
        }
        .buttonStyle(.plain)
    }

    private func emptyRow(_ message: String) -> some View {
        Text(message)
            .font(PatinaTypography.caption)
            .foregroundColor(PatinaColors.agedOak)
            .padding(.vertical, 16)
            .padding(.horizontal, 16)
    }

    private var loadingView: some View {
        VStack {
            Spacer().frame(height: 60)
            ProgressView()
                .tint(PatinaColors.clay)
            Spacer()
        }
    }

    private func formatPrice(_ cents: Int) -> String {
        let dollars = cents / 100
        return "$\(dollars.formatted())"
    }
}

// MARK: - Section helper

private struct Section<Content: View>: View {
    let title: String
    /// Optional surface key for a `HelpInfoIcon` next to the section title.
    /// When non-nil, a small "?" glyph is rendered after the title and tapping
    /// it opens a Sanity-backed tooltip explaining the section's Patina concept.
    var helpSurfaceKey: SurfaceKey? = nil
    /// Inline fallback body used when Sanity has no content for `helpSurfaceKey`.
    var helpFallback: String? = nil
    var showAllAction: (() -> Void)? = nil
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                MonoLabel(text: title)
                if let helpSurfaceKey {
                    HelpInfoIcon(
                        surfaceKey: helpSurfaceKey,
                        fallback: helpFallback,
                        size: 11
                    )
                }
                Spacer()
                if let action = showAllAction {
                    Button("See all", action: action)
                        .font(PatinaTypography.uiSmall)
                        .foregroundColor(PatinaColors.clay)
                }
            }
            .padding(.horizontal, 24)

            VStack(spacing: 0) {
                content()
            }
            .background(PatinaColors.softCream)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .padding(.horizontal, 24)
        }
    }
}

#Preview {
    NavigationStack {
        DesignerHomeView()
            .environment(\.appCoordinator, AppCoordinator())
    }
}

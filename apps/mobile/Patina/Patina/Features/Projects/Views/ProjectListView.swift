//
//  ProjectListView.swift
//  Patina
//
//  Read-only list of projects the user can see (RLS-bounded).
//

import SwiftUI

struct ProjectListView: View {
    @Environment(\.appCoordinator) private var coordinator
    @State private var viewModel = ProjectsListViewModel()
    /// R26: inline project filter. The screen hides the navigation bar (custom
    /// header + pinned back chevron), so `.searchable` has nowhere to render —
    /// a lightweight Patina-styled search field stands in for it.
    @State private var searchText: String = ""

    /// Projects matching the search text against name, status, and phase labels.
    private var filteredProjects: [RemoteProject] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return viewModel.projects }
        return viewModel.projects.filter { project in
            if project.name.localizedCaseInsensitiveContains(query) { return true }
            if let status = project.status,
               PhaseDisplay.statusLabel(for: status).localizedCaseInsensitiveContains(query) {
                return true
            }
            if let phase = project.current_phase,
               PhaseDisplay.label(for: phase).localizedCaseInsensitiveContains(query) {
                return true
            }
            return false
        }
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                header
                if !viewModel.projects.isEmpty {
                    searchField
                        .padding(.horizontal, 24)
                }
                content
            }
            .padding(.bottom, 120)
        }
        .background(PatinaColors.Background.primary)
        // U18: standard pushed-screen chrome — the header above carries
        // the title, so the chrome adds only the back chevron.
        .patinaScreen(title: nil)
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            MonoLabel(text: "PROJECTS")
                .tracking(2)
            Text(viewModel.projects.isEmpty ? "No projects yet" : "\(viewModel.projects.count) project\(viewModel.projects.count == 1 ? "" : "s")")
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.Text.primary)
        }
        .padding(.top, 56)
        .padding(.horizontal, 24)
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.projects.isEmpty {
            PatinaLoadingState()
                .padding(.top, 60)
        } else if let error = viewModel.error, viewModel.projects.isEmpty {
            PatinaErrorState(message: error, action: { Task { await viewModel.load() } })
                .padding(.top, 60)
        } else if viewModel.projects.isEmpty {
            emptyView
        } else if filteredProjects.isEmpty {
            noMatchesView
        } else {
            VStack(spacing: 12) {
                ForEach(filteredProjects) { project in
                    Button {
                        coordinator.navigate(to: .projectDetail(projectId: project.id))
                    } label: {
                        projectCard(project)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)
        }
    }

    /// Patina-styled inline search field (stands in for `.searchable`,
    /// which needs the hidden navigation bar to render).
    private var searchField: some View {
        HStack(spacing: PatinaSpacing.sm) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14))
                .foregroundStyle(PatinaColors.Text.muted)
            TextField("Search projects", text: $searchText)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.primary)
                .autocorrectionDisabled()
                .submitLabel(.search)
            if !searchText.isEmpty {
                Button { searchText = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(PatinaColors.Text.muted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, PatinaSpacing.xsm)
        .frame(height: 40)
        .background(
            RoundedRectangle(cornerRadius: PatinaRadius.lg, style: .continuous)
                .fill(PatinaColors.Background.secondary)
        )
        .overlay(
            RoundedRectangle(cornerRadius: PatinaRadius.lg, style: .continuous)
                .stroke(PatinaColors.pearl, lineWidth: 1)
        )
        .accessibilityLabel("Search projects")
    }

    private var noMatchesView: some View {
        VStack(spacing: PatinaSpacing.sm) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 28))
                .foregroundStyle(PatinaColors.Text.muted)
            Text("No projects match \u{201C}\(searchText)\u{201D}")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    private func projectCard(_ project: RemoteProject) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(project.name)
                    .font(PatinaTypography.h5)
                    .foregroundStyle(PatinaColors.Text.primary)
                Spacer()
                if let status = project.status {
                    // R16: human status vocabulary, never raw enum values.
                    Text(PhaseDisplay.statusLabel(for: status))
                        .font(PatinaTypography.monoTiny)
                        .foregroundStyle(PatinaColors.Text.interactive)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(PatinaColors.clay.opacity(0.1))
                        .clipShape(Capsule())
                }
            }
            HStack(spacing: 16) {
                if let phase = project.current_phase {
                    // R16: compact display label ("Design Dev"), not the raw
                    // slug ("design_development") — two columns share the row.
                    label("Phase", PhaseDisplay.shortLabel(for: phase))
                }
                if let total = project.total_amount_cents ?? project.budget_cents {
                    label("Total", formatPrice(total))
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(projectAccessibilityLabel(project))
    }

    /// Aggregated VoiceOver label for a project card: name + status + phase + total,
    /// so focus lands once instead of stopping on each Text.
    private func projectAccessibilityLabel(_ project: RemoteProject) -> String {
        var parts: [String] = [project.name]
        if let status = project.status { parts.append(PhaseDisplay.statusLabel(for: status)) }
        // R16: VoiceOver reads the full designer label ("Design Development").
        if let phase = project.current_phase { parts.append("Phase \(PhaseDisplay.label(for: phase))") }
        if let total = project.total_amount_cents ?? project.budget_cents {
            parts.append("Total \(formatPrice(total))")
        }
        return parts.joined(separator: ", ")
    }

    private func label(_ caption: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            MonoLabel(text: caption)
            Text(value)
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.secondary)
        }
    }

    /// U22: names the surface, names the trigger, and offers the one CTA
    /// that actually unblocks it — track an in-flight request if one
    /// exists, otherwise start one.
    private var emptyView: some View {
        PatinaEmptyState(
            icon: "rectangle.stack",
            title: "Your projects live here",
            message: "When you start with a designer, the project — timeline, scope, people — lands here.",
            ctaTitle: studioCTATitle,
            ctaAction: presentStudioCTA
        )
        .padding(.top, 80)
    }

    private var studioCTATitle: String {
        DesignRequestStatusService.shared.promotedRequest != nil ? "Track your request" : "Get design help"
    }

    private func presentStudioCTA() {
        if DesignRequestStatusService.shared.promotedRequest != nil {
            coordinator.navigate(to: .designRequests(focusLeadId: nil))
        } else {
            coordinator.navigate(to: .designerConsultation)
        }
    }

    private func formatPrice(_ cents: Int) -> String {
        // C5-14
        PatinaCurrency.formatWholeDollars(cents: cents)
    }
}

#Preview {
    NavigationStack {
        ProjectListView()
            .environment(\.appCoordinator, AppCoordinator())
    }
}
